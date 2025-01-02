import * as child_process from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as process from 'process';
import { ProgressLocation, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import * as which from 'which';
import { HlsError } from './errors';

// Used for environment variables later on
export type IEnvVars = {
  [key: string]: string;
};

/**
 * Callback invoked on process termination.
 */
export type ProcessCallback = (
  error: child_process.ExecFileException | null,
  stdout: string,
  stderr: string,
  resolve: (value: string | PromiseLike<string>) => void,
  reject: (reason?: HlsError | Error | string) => void,
) => void;

/**
 * Call a process asynchronously.
 * While doing so, update the windows with progress information.
 * If you need to run a process, consider preferring this over running
 * the command directly.
 *
 * @param binary Name of the binary to invoke.
 * @param args Arguments passed directly to the binary.
 * @param dir Directory in which the process shall be executed.
 * @param logger Logger for progress updates.
 * @param title Title of the action, shown to users if available.
 * @param cancellable Can the user cancel this process invocation?
 * @param envAdd Extra environment variables for this process only.
 * @param callback Upon process termination, execute this callback. If given, must resolve promise. On error, stderr and stdout are logged regardless of whether the callback has been specified.
 * @returns Stdout of the process invocation, trimmed off newlines, or whatever the `callback` resolved to.
 */
export function callAsync(
  binary: string,
  args: string[],
  logger: Logger,
  dir?: string,
  title?: string,
  cancellable?: boolean,
  envAdd?: IEnvVars,
  callback?: ProcessCallback,
): Thenable<string> {
  let newEnv: IEnvVars = resolveServerEnvironmentPATH(
    workspace.getConfiguration('haskell').get('serverEnvironment') || {},
  );
  newEnv = { ...(process.env as IEnvVars), ...newEnv, ...(envAdd || {}) };
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title,
      cancellable,
    },
    async (_, token) => {
      return new Promise<string>((resolve, reject) => {
        const command: string = binary + ' ' + args.join(' ');
        logger.info(`Executing '${command}' in cwd '${dir ? dir : process.cwd()}'`);
        token.onCancellationRequested(() => {
          logger.warn(`User canceled the execution of '${command}'`);
        });
        // Need to set the encoding to 'utf8' in order to get back a string
        // We execute the command in a shell for windows, to allow use .cmd or .bat scripts
        const childProcess = child_process
          .execFile(
            process.platform === 'win32' ? `"${binary}"` : binary,
            args,
            { encoding: 'utf8', cwd: dir, shell: process.platform === 'win32', env: newEnv },
            (err, stdout, stderr) => {
              if (err) {
                logger.error(`Error executing '${command}' with error code ${err.code}`);
                logger.error(`stderr: ${stderr}`);
                if (stdout) {
                  logger.error(`stdout: ${stdout}`);
                }
              }
              if (callback) {
                callback(err, stdout, stderr, resolve, reject);
              } else {
                if (err) {
                  reject(
                    Error(`\`${command}\` exited with exit code ${err.code}.
                              Consult the [Extensions Output](https://github.com/haskell/vscode-haskell#investigating-and-reporting-problems)
                              for details.`),
                  );
                } else {
                  resolve(stdout?.trim());
                }
              }
            },
          )
          .on('exit', (code, signal) => {
            const msg =
              `Execution of '${command}' terminated with code ${code}` + (signal ? `and signal ${signal}` : '');
            logger.log(msg);
          })
          .on('error', (err) => {
            if (err) {
              logger.error(`Error executing '${command}': name = ${err.name}, message = ${err.message}`);
              reject(err);
            }
          });
        token.onCancellationRequested(() => childProcess.kill());
      });
    },
  );
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

/**
 * Checks if the executable is on the PATH
 * @param exe Name of the executable to find. Caller must ensure '.exe' extension is included on windows.
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
