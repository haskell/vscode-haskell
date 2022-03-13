import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { match } from 'ts-pattern';
import * as url from 'url';
import { promisify } from 'util';
import { ConfigurationTarget, ExtensionContext, ProgressLocation, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { downloadFile, executableExists, httpsGetSilently,  resolvePathPlaceHolders } from './utils';

export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;

// Used for environment variables later on
export interface IEnvVars {
  [key: string]: string;
}

type ManageHLS = 'system-ghcup' | 'internal-ghcup' | 'PATH';
let manageHLS = workspace.getConfiguration('haskell').get('manageHLS') as ManageHLS | null;

// On Windows the executable needs to be stored somewhere with an .exe extension
const exeExt = process.platform === 'win32' ? '.exe' : '';

export class MissingToolError extends Error {
  public readonly tool: string;
  constructor(tool: string) {
    let prettyTool: string;
    switch (tool) {
      case 'stack':
        prettyTool = 'Stack';
        break;
      case 'cabal':
        prettyTool = 'Cabal';
        break;
      case 'ghc':
        prettyTool = 'GHC';
        break;
      case 'ghcup':
        prettyTool = 'GHCup';
        break;
      default:
        prettyTool = tool;
        break;
    }
    super(`Project requires ${prettyTool} but it isn't installed`);
    this.tool = prettyTool;
  }

  public installLink(): Uri | null {
    switch (this.tool) {
      case 'Stack':
        return Uri.parse('https://docs.haskellstack.org/en/stable/install_and_upgrade/');
      case 'GHCup':
      case 'Cabal':
      case 'GHC':
        return Uri.parse('https://www.haskell.org/ghcup/');
      default:
        return null;
    }
  }
}

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
 * @param callback Upon process termination, execute this callback. If given, must resolve promise.
 * @returns Stdout of the process invocation, trimmed off newlines, or whatever the `callback` resolved to.
 */
async function callAsync(
    binary: string,
    args: string[],
    dir: string,
    logger: Logger,
    title?: string,
    cancellable?: boolean,
    envAdd?: IEnvVars,
    callback?: (
        error: ExecException | null,
        stdout: string,
        stderr: string,
        resolve: (value: string | PromiseLike<string> ) => void,
        reject: (reason?: any) => void
    ) => void
): Promise<string> {
    return window.withProgress(
        {
            location: ProgressLocation.Notification,
            title,
            cancellable,
        },
        async (_, token) => {
            return new Promise<string>((resolve, reject) => {
                const command: string = binary + ' ' + args.join(' ');
                logger.info(`Executing '${command}' in cwd '${dir}'`);
                token.onCancellationRequested(() => {
                    logger.warn(`User canceled the execution of '${command}'`);
                });
                const newEnv = (envAdd !== undefined) ? Object.assign(process.env, envAdd) : process.env;
                // Need to set the encoding to 'utf8' in order to get back a string
                // We execute the command in a shell for windows, to allow use .cmd or .bat scripts
                const childProcess = child_process
                    .execFile(
                        process.platform === 'win32' ? `"${binary}"` : binary,
                        args,
                        { encoding: 'utf8', cwd: dir, shell: process.platform === 'win32', env: newEnv },
                        (err, stdout, stderr) => {
                            if (callback !== undefined) {
                                callback(err, stdout, stderr, resolve, reject);
                            } else {
                                if (err) {
                                    logger.error(`Error executing '${command}' with error code ${err.code}`);
                                    logger.error(`stderr: ${stderr}`);
                                    if (stdout) {
                                        logger.error(`stdout: ${stdout}`);
                                    }
                                    reject(
                                        Error(`${command} exited with exit code ${err.code}:\n${stdout}\n${stderr}`)
                                    );
                                } else {
                                    resolve(stdout?.trim());
                                }
                            }
                        }
                    )
                    .on('exit', (code, signal) => {
                        const msg =
                            `Execution of '${command}' terminated with code ${code}` +
                            (signal ? `and signal ${signal}` : '');
                        logger.info(msg);
                    })
                    .on('error', (err) => {
                        if (err) {
                            logger.error(`Error executing '${command}': name = ${err.name}, message = ${err.message}`);
                            reject(err);
                        }
                    });
                token.onCancellationRequested(() => childProcess.kill());
            });
        }
    );
}

/** Gets serverExecutablePath and fails if it's not set.
 */
function findServerExecutable(context: ExtensionContext, logger: Logger, folder?: WorkspaceFolder): string {
  let exePath = workspace.getConfiguration('haskell').get('serverExecutablePath') as string;
  logger.info(`Trying to find the server executable in: ${exePath}`);
  exePath = resolvePathPlaceHolders(exePath, folder);
  logger.log(`Location after path variables substitution: ${exePath}`);
  if (executableExists(exePath)) {
      return exePath;
  } else {
    const msg = `Could not find a HLS binary at ${exePath}! Consider installing HLS via ghcup or change "haskell.manageHLS" in your settings.`;
    window.showErrorMessage(msg);
    throw new Error(msg);
  }
}

/** Searches the PATH. Fails if nothing is found.
 */
function findHLSinPATH(context: ExtensionContext, logger: Logger, folder?: WorkspaceFolder): string {
  // try PATH
  const exes: string[] = ['haskell-language-server-wrapper', 'haskell-language-server'];
  logger.info(`Searching for server executables ${exes.join(',')} in $PATH`);
  logger.info(`$PATH environment variable: ${process.env.PATH}`);
  for (const exe of exes) {
    if (executableExists(exe)) {
      logger.info(`Found server executable in $PATH: ${exe}`);
      return exe;
    }
  }
  const msg = 'Could not find a HLS binary in PATH! Consider installing HLS via ghcup or change "haskell.manageHLS" in your settings.';
  window.showErrorMessage(msg);
  throw new Error(msg);
}

/**
 * Downloads the latest haskell-language-server binaries via GHCup.
 * Makes sure that either `ghcup` is available locally, otherwise installs
 * it into an isolated location.
 * If we figure out the correct GHC version, but it isn't compatible with
 * the latest HLS executables, we download the latest compatible HLS binaries
 * as a fallback.
 *
 * @param context Context of the extension, required for metadata.
 * @param logger Logger for progress updates.
 * @param workingDir Working directory in VSCode.
 * @returns Path to haskell-language-server-wrapper
 */
export async function findHaskellLanguageServer(
    context: ExtensionContext,
    logger: Logger,
    workingDir: string,
    folder?: WorkspaceFolder
): Promise<string> {
    logger.info('Finding haskell-language-server');

    if (workspace.getConfiguration('haskell').get('serverExecutablePath') as string !== '') {
      return findServerExecutable(context, logger, folder);
    }

    const storagePath: string = await getStoragePath(context);

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    if (manageHLS === null) { // plugin needs initialization
      const promptMessage =
          'How do you want the extension to manage/discover HLS?';

      const decision = await window.showInformationMessage(promptMessage, 'system ghcup (recommended)', 'internal ghcup', 'PATH') || null;
      if (decision === 'system ghcup (recommended)') {
        manageHLS = 'system-ghcup';
      } else if (decision === 'internal ghcup') {
        manageHLS = 'internal-ghcup';
      } else if (decision === 'PATH') {
        manageHLS = 'PATH';
      }
      if (manageHLS !== null) {
        workspace.getConfiguration('haskell').update('manageHLS', manageHLS, ConfigurationTarget.Global);
      }
    }

    if (manageHLS === 'PATH' || manageHLS === null) {
      return findHLSinPATH(context, logger, folder);
    } else {
        // we manage HLS, make sure ghcup is installed/available
        await getGHCup(context, logger);

        // get a preliminary hls wrapper for finding project GHC version,
        // later we may install a different HLS that supports the given GHC
        let wrapper = await getLatestHLSfromGHCup(context, storagePath, logger).then(e =>
          (e === null)
          ?  callGHCup(context, logger,
                ['install', 'hls'],
                'Installing latest HLS',
                true
             ).then(() =>
               callGHCup(context, logger,
                   ['whereis', 'hls'],
                   undefined,
                   false,
                   (err, stdout, _stderr, resolve, _reject) => { err ? resolve('') : resolve(stdout?.trim()); })
            )
          : e[1]
        );

        // now figure out the project GHC version and the latest supported HLS version
        // we need for it (e.g. this might in fact be a downgrade for old GHCs)
        const installableHls = await getLatestHLS(
            context,
            logger,
            workingDir,
            (wrapper === null) ? undefined : wrapper
        );

        // now install said version in an isolated symlink directory
        const symHLSPath = path.join(storagePath, 'hls', installableHls);
        wrapper = path.join(symHLSPath, `haskell-language-server-wrapper${exeExt}`);
        // Check if we have a working symlink, so we can avoid another popup
        if (!fs.existsSync(wrapper)) {
            await callGHCup(context, logger,
                ['run', '--hls', installableHls, '-b', symHLSPath, '-i'],
                `Installing HLS ${installableHls}`,
                true
            );
        }
        return wrapper;
    }
}

async function callGHCup(
  context: ExtensionContext,
  logger: Logger,
  args: string[],
  title?: string,
  cancellable?: boolean,
  callback?: (
      error: ExecException | null,
      stdout: string,
      stderr: string,
      resolve: (value: string | PromiseLike<string>) => void,
      reject: (reason?: any) => void
  ) => void
): Promise<string> {

  const metadataUrl = workspace.getConfiguration('haskell').metadataURL;

  const storagePath: string = await getStoragePath(context);
  const ghcup = (manageHLS === 'system-ghcup') ? `ghcup${exeExt}` : path.join(storagePath, `ghcup${exeExt}`);
  if (manageHLS === 'system-ghcup') {
      return await callAsync('ghcup', ['--no-verbose'].concat(metadataUrl ? ['-s', metadataUrl] : []).concat(args), storagePath, logger, title, cancellable, undefined, callback);
  } else if (manageHLS === 'internal-ghcup') {
      return await callAsync(ghcup, ['--no-verbose'].concat(metadataUrl ? ['-s', metadataUrl] : []).concat(args), storagePath, logger, title, cancellable, {
        GHCUP_INSTALL_BASE_PREFIX: storagePath,
      }, callback);
  } else {
    const msg = `Internal error: tried to call ghcup while haskell.manageHLS is set to ${manageHLS}. Aborting!`;
    window.showErrorMessage(msg);
    throw new Error(msg);
  }
}

async function getLatestHLS(
    context: ExtensionContext,
    logger: Logger,
    workingDir: string,
    wrapper?: string
): Promise<string> {
    const storagePath: string = await getStoragePath(context);

    // get project GHC version, but fallback to system ghc if necessary.
    const projectGhc =
        wrapper === undefined
            ? await callAsync(`ghc${exeExt}`, ['--numeric-version'], storagePath, logger, undefined, false)
            : await getProjectGHCVersion(wrapper, workingDir, logger);

    // get installable HLS that supports the project GHC version (this might not be the most recent)
    const latestMetadataHls = await getLatestHLSfromMetadata(context, storagePath, projectGhc, logger);
    const latestGhcupHls = await getLatestHLSfromGHCup(context, storagePath, logger, projectGhc).then(e => e === null ? null : e[0]);

    if (latestMetadataHls !== null && latestGhcupHls !== null) {
      // both returned a result, compare versions
      if (comparePVP(latestMetadataHls, latestGhcupHls) >= 0) {
        logger.info("Picking HLS according to metadata");
        return latestMetadataHls;
      } else {
        logger.info("Picking a probably self compiled HLS via ghcup");
        return latestGhcupHls;
      }
      
    } else if (latestMetadataHls === null && latestGhcupHls !== null) {
      logger.info("Picking a probably self compiled HLS via ghcup");
      return latestGhcupHls;
    } else if (latestMetadataHls !== null && latestGhcupHls === null) {
      logger.info("Picking HLS according to metadata");
      return latestMetadataHls;
    } else {
      const noMatchingHLS = `No HLS version was found for supporting GHC ${projectGhc}.`;
      window.showErrorMessage(noMatchingHLS);
      throw new Error(noMatchingHLS);
    }
}

/**
 * Obtain the project ghc version from the HLS - Wrapper.
 * Also, serves as a sanity check.
 * @param wrapper Path to the Haskell-Language-Server wrapper
 * @param workingDir Directory to run the process, usually the root of the workspace.
 * @param logger Logger for feedback.
 * @returns The GHC version, or fail with an `Error`.
 */
export async function getProjectGHCVersion(
    wrapper: string,
    workingDir: string,
    logger: Logger
): Promise<string> {
    const title = 'Working out the project GHC version. This might take a while...';
    logger.info(title);
    const args = ['--project-ghc-version'];

    return callAsync(wrapper, args, workingDir, logger, title, false, undefined,
        (err, stdout, stderr, resolve, reject) => {
            const command: string = wrapper + ' ' + args.join(' ');
            if (err) {
                logger.error(`Error executing '${command}' with error code ${err.code}`);
                logger.error(`stderr: ${stderr}`);
                if (stdout) {
                    logger.error(`stdout: ${stdout}`);
                }
                // Error message emitted by HLS-wrapper
                const regex = /Cradle requires (.+) but couldn't find it|The program \'(.+)\' version .* is required but the version of.*could.*not be determined|Cannot find the program \'(.+)\'\. User-specified/;
                const res = regex.exec(stderr);
                if (res) {
                  for(let i = 1; i < res.length; i++){
                      if (res[i]) {
                        reject(new MissingToolError(res[i]));
                      }
                  }
                  reject(new MissingToolError('unknown'));
                }
                reject(
                    Error(`${wrapper} --project-ghc-version exited with exit code ${err.code}:\n${stdout}\n${stderr}`)
                );
            } else {
                logger.info(`The GHC version for the project or file: ${stdout?.trim()}`);
                resolve(stdout?.trim());
            }
        }
    );
}

/**
 * Downloads the latest ghcup binary.
 * Returns undefined if it can't find any for the given architecture/platform.
 */
export async function getGHCup(context: ExtensionContext, logger: Logger): Promise<string | undefined> {
    logger.info('Checking for ghcup installation');
    const localGHCup = ['ghcup'].find(executableExists);

    if (manageHLS === 'system-ghcup') {
        if (localGHCup === undefined) {
          return Promise.reject(new MissingToolError('ghcup'));
        } else {
          logger.info(`found system ghcup at ${localGHCup}`);
          const args = ['upgrade'];
          await callGHCup(context, logger, args, 'Upgrading ghcup', true);
          return localGHCup;
        }
    } else if (manageHLS === 'internal-ghcup') {
      const storagePath: string = await getStoragePath(context);
      let ghcup = path.join(storagePath, `ghcup${exeExt}`);
      if (!fs.existsSync(storagePath)) {
          fs.mkdirSync(storagePath);
      }

      // ghcup exists, just upgrade
      if (fs.existsSync(ghcup)) {
          logger.info('ghcup already installed, trying to upgrade');
          const args = ['upgrade', '-i'];
          await callGHCup(context, logger, args, 'Upgrading ghcup', true);
      } else {
          // needs to download ghcup
          const plat = match(process.platform)
              .with('darwin', (_) => 'apple-darwin')
              .with('linux', (_) => 'linux')
              .with('win32', (_) => 'mingw64')
              .with('freebsd', (_) => 'freebsd12')
              .otherwise((_) => null);
          if (plat === null) {
              window.showErrorMessage(`Couldn't find any pre-built ghcup binary for ${process.platform}`);
              return undefined;
          }
          const arch = match(process.arch)
              .with('arm', (_) => 'armv7')
              .with('arm64', (_) => 'aarch64')
              .with('x32', (_) => 'i386')
              .with('x64', (_) => 'x86_64')
              .otherwise((_) => null);
          if (arch === null) {
              window.showErrorMessage(`Couldn't find any pre-built ghcup binary for ${process.arch}`);
              return undefined;
          }
          const dlUri = `https://downloads.haskell.org/~ghcup/${arch}-${plat}-ghcup${exeExt}`;
          const title = `Downloading ${dlUri}`;
          logger.info(`Downloading ${dlUri}`);
          const downloaded = await downloadFile(title, dlUri, ghcup);
          if (!downloaded) {
              window.showErrorMessage(`Couldn't download ${dlUri} as ${ghcup}`);
          }
      }
      return ghcup;

    } else {
      const msg = `Internal error: tried to call ghcup while haskell.manageHLS is set to ${manageHLS}. Aborting!`;
      window.showErrorMessage(msg);
      throw new Error(msg);
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

export async function getStoragePath(context: ExtensionContext): Promise<string> {
    let storagePath: string | undefined = await workspace
        .getConfiguration('haskell')
        .get('releasesDownloadStoragePath');

    if (!storagePath) {
        storagePath = context.globalStorageUri.fsPath;
    } else {
        storagePath = resolvePathPlaceHolders(storagePath);
    }

    return storagePath;
}

export function addPathToProcessPath(extraPath: string): string {
    const pathSep = process.platform === 'win32' ? ';' : ':';
    const PATH = process.env.PATH!.split(pathSep);
    PATH.unshift(extraPath);
    return PATH.join(pathSep);
}

// complements getLatestHLSfromMetadata, by checking possibly locally compiled
// HLS in ghcup
// If 'targetGhc' is omitted, picks the latest 'haskell-language-server-wrapper',
// otherwise ensures the specified GHC is supported.
async function getLatestHLSfromGHCup(
  context: ExtensionContext,
  storagePath: string,
  logger: Logger,
  targetGhc?: string
): Promise<[string, string] | null> {
  const hlsVersions = await callGHCup(
      context,
      logger,
      ['list', '-t', 'hls', '-c', 'installed', '-r'],
      undefined,
      false,
  );
  const latestHlsVersion = hlsVersions.split(/\r?\n/).pop()!.split(' ')[1];
  let bindir = await callGHCup(context, logger,
      ['whereis', 'bindir'],
      undefined,
      false
  );

  let hlsBin = '';
  if (targetGhc) {
    hlsBin = path.join(bindir, `haskell-language-server-${targetGhc}~${latestHlsVersion}${exeExt}`);
  } else {
    hlsBin = path.join(bindir, `haskell-language-server-wrapper-${latestHlsVersion}${exeExt}`);
  }

  if (fs.existsSync(hlsBin)) {
    return [latestHlsVersion, hlsBin];
  } else {
    return null;
  }
}

/**
 * Given a GHC version, download at least one HLS version that can be used.
 * This also honours the OS architecture we are on.
 *
 * @param context Context of the extension, required for metadata.
 * @param storagePath Path to store binaries, caching information, etc...
 * @param targetGhc GHC version we want a HLS for.
 * @param logger Logger for feedback
 * @returns
 */
async function getLatestHLSfromMetadata(
  context: ExtensionContext,
  storagePath: string,
  targetGhc: string,
  logger: Logger
): Promise<string | null> {
  const metadata = await getReleaseMetadata(context, storagePath, logger);
  if (metadata === null) {
    window.showErrorMessage('Could not get release metadata');
    return null;
  }
  const plat = match(process.platform)
    .with('darwin', (_) => 'Darwin')
    .with('linux', (_) => 'Linux_UnknownLinux')
    .with('win32', (_) => 'Windows')
    .with('freebsd', (_) => 'FreeBSD')
    .otherwise((_) => null);
  if (plat === null) {
    window.showErrorMessage(`Unknown platform ${process.platform}`);
    return null;
  }
  const arch = match(process.arch)
    .with('arm', (_) => 'A_ARM')
    .with('arm64', (_) => 'A_ARM64')
    .with('x32', (_) => 'A_32')
    .with('x64', (_) => 'A_64')
    .otherwise((_) => null);
  if (arch === null) {
    window.showErrorMessage(`Unknown architecture ${process.arch}`);
    return null;
  }

  let curHls: string | null = null;

  const map: ReleaseMetadata = new Map(Object.entries(metadata));
  map.forEach((value, key) => {
          const value_ = new Map(Object.entries(value));
          const archValues = new Map(Object.entries(value_.get(arch)));
          const versions: string[] = archValues.get(plat) as string[];
          if (versions !== undefined && versions.some((el) => el === targetGhc)) {
              if (curHls === null) {
                  curHls = key;
              } else if (comparePVP(key, curHls) > 0) {
                  curHls = key;
              }
          }
      });

  return curHls;
}

/**
 * Download GHCUP metadata.
 *
 * @param context Extension context.
 * @param storagePath Path to put in binary files and caches.
 * @param logger Logger for feedback.
 * @returns Metadata of releases, or null if the cache can not be found.
 */
async function getReleaseMetadata(
  context: ExtensionContext,
  storagePath: string,
  logger: Logger
): Promise<ReleaseMetadata | null> {
  const releasesUrl = workspace.getConfiguration('haskell').releasesURL
    ? url.parse(workspace.getConfiguration('haskell').releasesURL)
    : undefined;
  const opts: https.RequestOptions = releasesUrl
    ? {
      host: releasesUrl.host,
      path: releasesUrl.path,
    }
    : {
      host: 'raw.githubusercontent.com',
      path: '/haskell/ghcup-metadata/master/hls-metadata-0.0.1.json',
    };

  const offlineCache = path.join(storagePath, 'ghcupReleases.cache.json');

  async function readCachedReleaseData(): Promise<ReleaseMetadata | null> {
    try {
      logger.info(`Reading cached release data at ${offlineCache}`);
      const cachedInfo = await promisify(fs.readFile)(offlineCache, { encoding: 'utf-8' });
        // export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;
      const value: ReleaseMetadata = JSON.parse(cachedInfo);
      return value;
    } catch (err: any) {
      // If file doesn't exist, return null, otherwise consider it a failure
      if (err.code === 'ENOENT') {
        logger.warn(`No cached release data found at ${offlineCache}`);
        return null;
      }
      throw err;
    }
  }

  try {
    const releaseInfo = await httpsGetSilently(opts);
    const releaseInfoParsed = JSON.parse(releaseInfo);

    // Cache the latest successfully fetched release information
    await promisify(fs.writeFile)(offlineCache, JSON.stringify(releaseInfoParsed), { encoding: 'utf-8' });
    return releaseInfoParsed;
  } catch (githubError: any) {
    // Attempt to read from the latest cached file
    try {
      const cachedInfoParsed = await readCachedReleaseData();

      window.showWarningMessage(
        "Couldn't get the latest haskell-language-server releases from GitHub, used local cache instead: " +
        githubError.message
      );
      return cachedInfoParsed;
    } catch (fileError) {
      throw new Error("Couldn't get the latest haskell-language-server releases from GitHub: " +
        githubError.message);
    }
  }
}
