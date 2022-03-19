'use strict';

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import { extname } from 'path';
import * as url from 'url';
import { promisify } from 'util';
import { workspace, OutputChannel, ProgressLocation, window, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import * as which from 'which';
import * as yazul from 'yauzl';
import { createGunzip } from 'zlib';

// Used for environment variables later on
export interface IEnvVars {
  [key: string]: string;
}

enum LogLevel {
  Off,
  Error,
  Warn,
  Info,
  Debug,
}
export class ExtensionLogger implements Logger {
  public readonly name: string;
  public readonly level: LogLevel;
  public readonly channel: OutputChannel;
  public readonly logFile: string | undefined;

  constructor(name: string, level: string, channel: OutputChannel, logFile: string | undefined) {
    this.name = name;
    this.level = this.getLogLevel(level);
    this.channel = channel;
    this.logFile = logFile;
  }
  public warn(message: string): void {
    this.logLevel(LogLevel.Warn, message);
  }

  public info(message: string): void {
    this.logLevel(LogLevel.Info, message);
  }

  public error(message: string) {
    this.logLevel(LogLevel.Error, message);
  }

  public log(message: string) {
    this.logLevel(LogLevel.Debug, message);
  }

  private write(msg: string) {
    let now = new Date();
    // Ugly hack to make js date iso format similar to hls one
    const offset = now.getTimezoneOffset();
    now = new Date(now.getTime() - offset * 60 * 1000);
    const timedMsg = `${new Date().toISOString().replace('T', ' ').replace('Z', '0000')} ${msg}`;
    this.channel.appendLine(timedMsg);
    if (this.logFile) {
      fs.appendFileSync(this.logFile, timedMsg + '\n');
    }
  }

  private logLevel(level: LogLevel, msg: string) {
    if (level <= this.level) {
      this.write(`[${this.name}] ${LogLevel[level].toUpperCase()} ${msg}`);
    }
  }

  private getLogLevel(level: string) {
    switch (level) {
      case 'off':
        return LogLevel.Off;
      case 'error':
        return LogLevel.Error;
      case 'debug':
        return LogLevel.Debug;
      default:
        return LogLevel.Info;
    }
  }
}

/** When making http requests to github.com, use this header otherwise
 * the server will close the request
 */
const userAgentHeader = { 'User-Agent': 'vscode-haskell' };

/** downloadFile may get called twice on the same src and destination:
 * When this happens, we should only download the file once but return two
 * promises that wait on the same download. This map keeps track of which
 * files are currently being downloaded and we short circuit any calls to
 * downloadFile which have a hit in this map by returning the promise stored
 * here.
 * Note that we have to use a double nested map since array/pointer/object
 * equality is by reference, not value in Map. And we are using a tuple of
 * [src, dest] as the key.
 */
const inFlightDownloads = new Map<string, Map<string, Thenable<boolean>>>();

export async function httpsGetSilently(options: https.RequestOptions): Promise<string> {
  const opts: https.RequestOptions = {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...userAgentHeader,
    },
  };

  return new Promise((resolve, reject) => {
    let data: string = '';
    https
      .get(opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (!res.headers.location) {
            reject(new Error('301/302 without a location header'));
            return;
          }
          https.get(res.headers.location, (resAfterRedirect) => {
            resAfterRedirect.on('data', (d) => (data += d));
            resAfterRedirect.on('error', reject);
            resAfterRedirect.on('close', () => {
              resolve(data);
            });
          });
        } else if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        } else {
          res.on('data', (d) => (data += d));
          res.on('error', reject);
          res.on('close', () => {
            resolve(data);
          });
        }
      })
      .on('error', reject);
  });
}

async function ignoreFileNotExists(err: NodeJS.ErrnoException): Promise<void> {
  if (err.code === 'ENOENT') {
    return;
  }
  throw err;
}

export async function downloadFile(titleMsg: string, src: string, dest: string): Promise<boolean> {
  // Check to see if we're already in the process of downloading the same thing
  const inFlightDownload = inFlightDownloads.get(src)?.get(dest);
  if (inFlightDownload) {
    return inFlightDownload;
  }

  // If it already is downloaded just use that
  if (fs.existsSync(dest)) {
    return false;
  }

  // Download it to a .tmp location first, then rename it!
  // This way if the download fails halfway through or something then we know
  // to delete it and try again
  const downloadDest = dest + '.download';
  if (fs.existsSync(downloadDest)) {
    fs.unlinkSync(downloadDest);
  }

  const downloadTask = window
    .withProgress(
      {
        location: ProgressLocation.Notification,
        title: titleMsg,
        cancellable: false,
      },
      async (progress) => {
        const p = new Promise<void>((resolve, reject) => {
          const srcUrl = url.parse(src);
          const opts: https.RequestOptions = {
            host: srcUrl.host,
            path: srcUrl.path,
            protocol: srcUrl.protocol,
            port: srcUrl.port,
            headers: userAgentHeader,
          };
          getWithRedirects(opts, (res) => {
            const totalSize = parseInt(res.headers['content-length'] || '1', 10);
            const fileStream = fs.createWriteStream(downloadDest, { mode: 0o744 });
            let curSize = 0;

            // Decompress it if it's a gzip or zip
            const needsGunzip =
              res.headers['content-type'] === 'application/gzip' || extname(srcUrl.path ?? '') === '.gz';
            const needsUnzip =
              res.headers['content-type'] === 'application/zip' || extname(srcUrl.path ?? '') === '.zip';
            if (needsGunzip) {
              const gunzip = createGunzip();
              gunzip.on('error', reject);
              res.pipe(gunzip).pipe(fileStream);
            } else if (needsUnzip) {
              const zipDest = downloadDest + '.zip';
              const zipFs = fs.createWriteStream(zipDest);
              zipFs.on('error', reject);
              zipFs.on('close', () => {
                yazul.open(zipDest, (err, zipfile) => {
                  if (err) {
                    throw err;
                  }
                  if (!zipfile) {
                    throw Error("Couldn't decompress zip");
                  }

                  // We only expect *one* file inside each zip
                  zipfile.on('entry', (entry: yazul.Entry) => {
                    zipfile.openReadStream(entry, (err2, readStream) => {
                      if (err2) {
                        throw err2;
                      }
                      readStream?.pipe(fileStream);
                    });
                  });
                });
              });
              res.pipe(zipFs);
            } else {
              res.pipe(fileStream);
            }

            function toMB(bytes: number) {
              return bytes / (1024 * 1024);
            }

            res.on('data', (chunk: Buffer) => {
              curSize += chunk.byteLength;
              const msg = `${toMB(curSize).toFixed(1)}MB / ${toMB(totalSize).toFixed(1)}MB`;
              progress.report({ message: msg, increment: (chunk.length / totalSize) * 100 });
            });
            res.on('error', reject);
            fileStream.on('close', resolve);
          }).on('error', reject);
        });
        try {
          await p;
          // Finally rename it to the actual dest
          fs.renameSync(downloadDest, dest);
        } finally {
          // And remember to remove it from the list of current downloads
          inFlightDownloads.get(src)?.delete(dest);
        }
      }
    )
    .then((_) => true);

  try {
    if (inFlightDownloads.has(src)) {
      inFlightDownloads.get(src)?.set(dest, downloadTask);
    } else {
      inFlightDownloads.set(src, new Map([[dest, downloadTask]]));
    }
    return await downloadTask;
  } catch (e: any) {
    await promisify(fs.unlink)(downloadDest).catch(ignoreFileNotExists);
    throw new Error(`Failed to download ${src}:\n${e.message}`);
  }
}

function getWithRedirects(opts: https.RequestOptions, f: (res: http.IncomingMessage) => void): http.ClientRequest {
  return https.get(opts, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      if (!res.headers.location) {
        console.error('301/302 without a location header');
        return;
      }
      https.get(res.headers.location, f);
    } else {
      f(res);
    }
  });
}

/*
 * Checks if the executable is on the PATH
 */
export async function executableExists(exe: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  let newEnv: IEnvVars = await resolveServerEnvironmentPATH(workspace.getConfiguration('haskell').get('serverEnvironment') || {});
  newEnv = {...process.env as IEnvVars, ...newEnv};
  const cmd: string = isWindows ? 'where' : 'which';
  const out = child_process.spawnSync(cmd, [exe], { env: newEnv });
  return out.status === 0 || (which.sync(exe, { nothrow: true, path: newEnv.PATH }) ?? '') !== '';
}

export function directoryExists(path: string): boolean {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

export function expandHomeDir(path: string): string {
  if (path.startsWith('~')) {
    return path.replace('~', os.homedir);
  }
  return path;
}

export function resolvePathPlaceHolders(path: string, folder?: WorkspaceFolder) {
  path = path.replace('${HOME}', os.homedir).replace('${home}', os.homedir).replace(/^~/, os.homedir);
  if (folder) {
    path = path.replace('${workspaceFolder}', folder.uri.path).replace('${workspaceRoot}', folder.uri.path);
  }
  return path;
}

export function resolvePATHPlaceHolders(path: string, folder?: WorkspaceFolder) {
  return path
    .replace('${HOME}', os.homedir)
    .replace('${home}', os.homedir)
    .replace('$PATH', process.env.PATH!)
    .replace('${PATH}', process.env.PATH!);
}

// also honours serverEnvironment.PATH
export async function addPathToProcessPath(extraPath: string, logger: Logger): Promise<string> {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const serverEnvironment: IEnvVars = (await workspace.getConfiguration('haskell').get('serverEnvironment')) || {};
  const path: string[] = serverEnvironment.PATH
    ? serverEnvironment.PATH.split(pathSep).map((p) => resolvePATHPlaceHolders(p))
    : process.env.PATH!.split(pathSep);
  path.unshift(extraPath);
  return path.join(pathSep);
}

export async function resolveServerEnvironmentPATH(serverEnv: IEnvVars): Promise<IEnvVars> {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const path: string[] = serverEnv.PATH.split(pathSep).map((p) => resolvePATHPlaceHolders(p));
  return {
    ...serverEnv,
    ...{ PATH: path.join(pathSep)}
  }
}

