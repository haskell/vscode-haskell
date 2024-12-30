import * as child_process from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import { OutputChannel, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import * as which from 'which';

// Used for environment variables later on
export type IEnvVars = {
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

/**
 * Compare the PVP versions of two strings.
 * Details: https://github.com/haskell/pvp/
 *
 * @param l First version
 * @param r second version
 * @returns `1` if l is newer than r, `0` if they are equal and `-1` otherwise.
 */
export function comparePVP(l: string, r: string): number {
  const al = l.split('.');
  const ar = r.split('.');

  let eq = 0;

  for (let i = 0; i < Math.max(al.length, ar.length); i++) {
    const el = parseInt(al[i], 10) || undefined;
    const er = parseInt(ar[i], 10) || undefined;

    if (el === undefined && er === undefined) {
      break;
    } else if (el !== undefined && er === undefined) {
      eq = 1;
      break;
    } else if (el === undefined && er !== undefined) {
      eq = -1;
      break;
    } else if (el !== undefined && er !== undefined && el > er) {
      eq = 1;
      break;
    } else if (el !== undefined && er !== undefined && el < er) {
      eq = -1;
      break;
    }
  }
  return eq;
}

/** When making http requests to github.com, use this header otherwise
 * the server will close the request
 */
const userAgentHeader = { 'User-Agent': 'vscode-haskell' };

export async function httpsGetSilently(options: https.RequestOptions): Promise<string> {
  const opts: https.RequestOptions = {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...userAgentHeader,
    },
  };

  return new Promise((resolve, reject) => {
    let data = '';
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

/*
 * Checks if the executable is on the PATH
 */
export function executableExists(exe: string): boolean {
  const isWindows = process.platform === 'win32';
  let newEnv: IEnvVars = resolveServerEnvironmentPATH(
    workspace.getConfiguration('haskell').get('serverEnvironment') || {},
  );
  newEnv = { ...(process.env as IEnvVars), ...newEnv };
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

export function resolvePATHPlaceHolders(path: string) {
  return path
    .replace('${HOME}', os.homedir)
    .replace('${home}', os.homedir)
    .replace('$PATH', process.env.PATH ?? '$PATH')
    .replace('${PATH}', process.env.PATH ?? '${PATH}');
}

// also honours serverEnvironment.PATH
export function addPathToProcessPath(extraPath: string): string {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const serverEnvironment: IEnvVars = workspace.getConfiguration('haskell').get('serverEnvironment') || {};
  const path: string[] = serverEnvironment.PATH
    ? serverEnvironment.PATH.split(pathSep).map((p) => resolvePATHPlaceHolders(p))
    : (process.env.PATH?.split(pathSep) ?? []);
  path.unshift(extraPath);
  return path.join(pathSep);
}

export function resolveServerEnvironmentPATH(serverEnv: IEnvVars): IEnvVars {
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const path: string[] | null = serverEnv.PATH
    ? serverEnv.PATH.split(pathSep).map((p) => resolvePATHPlaceHolders(p))
    : null;
  return {
    ...serverEnv,
    ...(path ? { PATH: path.join(pathSep) } : {}),
  };
}
