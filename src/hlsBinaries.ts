import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionContext, ProgressLocation, Uri, window, workspace } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { httpsGetSilently, downloadFile, executableExists, resolvePathPlaceHolders } from './utils';
import { match } from 'ts-pattern';
import * as url from 'url';
import * as https from 'https';
import { promisify } from 'util';

export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;

// Used for environment variables later on
export interface IEnvVars {
  [key: string]: string;
}

type UpdateBehaviour = 'keep-up-to-date' | 'prompt' | 'never-check';


// On Windows the executable needs to be stored somewhere with an .exe extension
const exeExt = process.platform === 'win32' ? '.exe' : '';

class MissingToolError extends Error {
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
      case 'Cabal':
      case 'GHC':
        return Uri.parse('https://www.haskell.org/ghcup/');
      default:
        return null;
    }
  }
}

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
        resolve: (value: string | PromiseLike<string>) => void,
        reject: (reason?: any) => void
    ) => void
): Promise<string> {
    return window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: title,
            cancellable: cancellable,
        },
        async (_, token) => {
            return new Promise<string>((resolve, reject) => {
                const command: string = binary + ' ' + args.join(' ');
                logger.info(`Executing '${command}' in cwd '${dir}'`);
                token.onCancellationRequested(() => {
                    logger.warn(`User canceled the execution of '${command}'`);
                });
                const newEnv = (envAdd != undefined) ? Object.assign(process.env, envAdd) : process.env;
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
                token.onCancellationRequested((_) => childProcess.kill());
            });
        }
    );
}


/**
 * Downloads the latest haskell-language-server binaries via ghcup.
 * Returns null if it can't find any match.
 */
export async function downloadHaskellLanguageServer(
    context: ExtensionContext,
    logger: Logger,
    workingDir: string
): Promise<string> {
    logger.info('Downloading haskell-language-server');

    const storagePath: string = await getStoragePath(context);
    logger.info(`Using ${storagePath} to store downloaded binaries`);

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    const localWrapper = ['haskell-language-server-wrapper'].find(executableExists);
    const downloadedWrapper = path.join(storagePath, process.platform === 'win32' ? 'ghcup' : '.ghcup', 'bin', `haskell-language-server-wrapper${exeExt}`);
    let wrapper: string | undefined;
    if (localWrapper) {
        // first try PATH
        wrapper = localWrapper;
    } else if (executableExists(downloadedWrapper)) {
        // then try internal ghcup
        wrapper = downloadedWrapper;
    }

    const ghcup = path.join(storagePath, `ghcup${exeExt}`);
    const updateBehaviour = workspace.getConfiguration('haskell').get('updateBehavior') as UpdateBehaviour;
    const [installable_hls, latest_hls_version, project_ghc] = await getLatestSuitableHLS(
        context,
        logger,
        workingDir,
        wrapper
    );

    // check if we need to update HLS
    if (wrapper == null) {
        // install new hls
        if (updateBehaviour === 'never-check') {
            throw new Error(
                "No version of HLS installed or found and updateBehaviour set to 'never-check' giving up..."
            );
        } else if (updateBehaviour === 'prompt') {
            const promptMessage =
                'No version of the haskell-language-server is installed, would you like to install it now?';

            const decision = await window.showInformationMessage(promptMessage, 'Download', 'Nevermind');
            if (decision !== 'Download') {
                throw new Error('No version of HLS installed or found and installation was denied, giving up...');
            }
        }
        await callAsync(
            ghcup,
            ['--no-verbose', 'install', 'hls', installable_hls],
            storagePath,
            logger,
            `Installing HLS ${installable_hls}`,
            true,
            { GHCUP_INSTALL_BASE_PREFIX: storagePath }
        );
        await callAsync(ghcup, ['--no-verbose', 'set', 'hls', installable_hls], storagePath, logger, undefined, false, {
            GHCUP_INSTALL_BASE_PREFIX: storagePath,
        });
        return downloadedWrapper;
    } else {
        // version of active hls wrapper
        const set_version = await callAsync(wrapper, ['--numeric-version'], storagePath, logger);

        const downgrade: boolean = comparePVP(latest_hls_version, installable_hls) > 0;

        const projectHlsWrapper = path.join(
            storagePath,
            process.platform === 'win32' ? 'ghcup' : '.ghcup',
            'bin',
            `haskell-language-server-wrapper-${installable_hls}${exeExt}`
        );
        const need_install = !executableExists(projectHlsWrapper);

        if (comparePVP(set_version, installable_hls) != 0) {
            // only update if the user wants to
            if (updateBehaviour === 'never-check') {
                logger.warn(
                    "As 'haskell.updateBehaviour' config option is set to 'never-check' " +
                        'we try to use the possibly obsolete cached release data'
                );
                return wrapper;
            } else if (updateBehaviour === 'prompt' && need_install) {
                let promptMessage: string;
                if (downgrade) {
                    promptMessage = `A different (lower) version of the haskell-language-server is required to support ${project_ghc}, would you like to upgrade now?`;
                } else {
                    promptMessage =
                        'A new version of the haskell-language-server is available, would you like to upgrade now?';
                }

                const decision = await window.showInformationMessage(promptMessage, 'Download', 'Nevermind');
                if (decision !== 'Download') {
                    return wrapper;
                }
            } else {
                if (downgrade && need_install) {
                    const decision = await window.showInformationMessage(
                        `Cannot install the latest HLS version ${latest_hls_version}, because it does not support GHC ${project_ghc}. Installing HLS ${installable_hls} instead?`,
                        'Continue',
                        'Abort'
                    );
                    if (decision !== 'Continue') {
                        return wrapper;
                    }
                }
            }

            // we use this command to both install a HLS, but also create a nice
            // isolated symlinked dir with only the given HLS in place, so
            // this works for installing and setting
            const symHLSPath = path.join(storagePath, 'hls', installable_hls);
            await callAsync(
                ghcup,
                ['--no-verbose', 'run', '--hls', installable_hls, '-b', symHLSPath, '-i'],
                storagePath,
                logger,
                need_install ? `Installing HLS ${installable_hls}` : undefined,
                need_install,
                { GHCUP_INSTALL_BASE_PREFIX: storagePath }
            );
            return path.join(symHLSPath, `haskell-language-server-wrapper${exeExt}`);
        }
        return wrapper;
    }
}

async function getLatestSuitableHLS(
    context: ExtensionContext,
    logger: Logger,
    workingDir: string,
    wrapper?: string
): Promise<[string, string, string | null]> {
    const storagePath: string = await getStoragePath(context);
    const ghcup = path.join(storagePath, `ghcup${exeExt}`);

    // get latest hls version
    const hls_versions = await callAsync(
        ghcup,
        ['--no-verbose', 'list', '-t', 'hls', '-c', 'available', '-r'],
        storagePath,
        logger,
        undefined,
        false,
        { GHCUP_INSTALL_BASE_PREFIX: storagePath }
    );
    const latest_hls_version = hls_versions.split(/\r?\n/).pop()!.split(' ')[1];

    // get project GHC version
    // TODO: we may run this function twice on startup (e.g. in extension.ts)
    const project_ghc =
        wrapper == undefined
            ? await callAsync(`ghc${exeExt}`, ['--numeric-version'], storagePath, logger, undefined, false)
            : await getProjectGHCVersion(wrapper, workingDir, logger);

    // get installable HLS that supports the project GHC version (this might not be the most recent)
    const latest_metadata_hls =
        project_ghc != null ? await getLatestHLSforGHC(context, storagePath, project_ghc, logger) : null;
    const installable_hls = latest_metadata_hls != null ? latest_metadata_hls : latest_hls_version;

    return [installable_hls, latest_hls_version, project_ghc];
}

// also serves as sanity check
export async function validateHLSToolchain(
    wrapper: string,
    workingDir: string,
    logger: Logger
): Promise<void> {
    const ghc = await getProjectGHCVersion(wrapper, workingDir, logger);
    const wrapperDir = path.dirname(wrapper);
    const hlsExe = path.join(wrapperDir, `haskell-language-server-${ghc}${exeExt}`)
    const hlsVer = await callAsync(wrapper, ["--numeric-version"], workingDir, logger);
    if (!executableExists(hlsExe)) {
        const msg = `Couldn't find ${hlsExe}. Your project ghc version ${ghc} may not be supported! Consider building HLS from source, e.g.: ghcup compile hls --jobs 8 --ghc ${ghc} ${hlsVer}`;
        window.showErrorMessage(msg);
        throw new Error(msg);
    }
}

// also serves as sanity check
export async function getProjectGHCVersion(
    wrapper: string,
    workingDir: string,
    logger: Logger
): Promise<string | null> {
    const title = 'Working out the project GHC version. This might take a while...';
    logger.info(title);
    let args = ['--project-ghc-version'];
    const callWrapper = (wrapper: string) =>
        callAsync(wrapper, args, workingDir, logger, title, false, undefined, (err, stdout, stderr, resolve, reject) => {
            const command: string = wrapper + ' ' + args.join(' ');
            if (err) {
                logger.error(`Error executing '${command}' with error code ${err.code}`);
                logger.error(`stderr: ${stderr}`);
                if (stdout) {
                    logger.error(`stdout: ${stdout}`);
                }
                const regex = /Cradle requires (.+) but couldn't find it/;
                const res = regex.exec(stderr);
                if (res) {
                    reject(new MissingToolError(res[1]));
                }
                reject(
                    Error(`${wrapper} --project-ghc-version exited with exit code ${err.code}:\n${stdout}\n${stderr}`)
                );
            } else {
                logger.info(`The GHC version for the project or file: ${stdout?.trim()}`);
                resolve(stdout?.trim());
            }
        });

    return callWrapper(wrapper);
}

/**
 * Downloads the latest ghcup binary.
 * Returns null if it can't find any for the given architecture/platform.
 */
export async function downloadGHCup(context: ExtensionContext, logger: Logger): Promise<string | null> {
    logger.info('Checking for ghcup installation');

    const storagePath: string = await getStoragePath(context);
    logger.info(`Using ${storagePath} to store downloaded binaries`);

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    const ghcup = path.join(storagePath, `ghcup${exeExt}`);
    // ghcup exists, just upgrade
    if (fs.existsSync(ghcup)) {
        logger.info('ghcup already installed, trying to upgrade');
        const args = ['--no-verbose', 'upgrade', '-i'];
        await callAsync(ghcup, args, storagePath, logger, undefined, false, { GHCUP_INSTALL_BASE_PREFIX: storagePath });
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
            return null;
        }
        const arch = match(process.arch)
            .with('arm', (_) => 'armv7')
            .with('arm64', (_) => 'aarch64')
            .with('x32', (_) => 'i386')
            .with('x64', (_) => 'x86_64')
            .otherwise((_) => null);
        if (arch === null) {
            window.showErrorMessage(`Couldn't find any pre-built ghcup binary for ${process.arch}`);
            return null;
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
}

export function comparePVP(l: string, r: string): number {
    const al = l.split('.');
    const ar = r.split('.');

    let eq = 0;

    for (let i = 0; i < Math.max(al.length, ar.length); i++) {
        const el = parseInt(al[i]) || undefined;
        const er = parseInt(ar[i]) || undefined;

        if (el == undefined && er == undefined) {
            break;
        } else if (el != undefined && er == undefined) {
            eq = 1;
            break;
        } else if (el == undefined && er != undefined) {
            eq = -1;
            break;
        } else if (el != undefined && er != undefined && el > er) {
            eq = 1;
            break;
        } else if (el != undefined && er != undefined && el < er) {
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

export function addPathToProcessPath(path: string): string {
    const pathSep = process.platform === 'win32' ? ';' : ':';
    const PATH = process.env.PATH!.split(pathSep);
    PATH.unshift(path);
    return PATH.join(pathSep);
}

async function getLatestHLSforGHC(
  context: ExtensionContext,
  storagePath: string,
  targetGhc: string,
  logger: Logger
): Promise<string | null> {
	const metadata = await getReleaseMetadata(context, storagePath, logger);
	if (metadata === null) {
		window.showErrorMessage(`Could not get release metadata`);
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

    let cur_hls: string | null = null;

    const map: ReleaseMetadata = new Map(Object.entries(metadata));
    map.forEach((value, key) => {
        const value_ = new Map(Object.entries(value));
        const archValues = new Map(Object.entries(value_.get(arch)));
        const versions: string[] = archValues.get(plat) as string[];
        if (versions != undefined && versions.some((el, _ix, _arr) => el === targetGhc)) {
            if (cur_hls == null) {
                cur_hls = key;
            } else if (comparePVP(key, cur_hls) > 0) {
                cur_hls = key;
            }
        }
    });

    return cur_hls;
}

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
      host: 'gist.githubusercontent.com',
      path: '/hasufell/dd84df5f81a3a7e6e6fad8f122dba429/raw/73efc1078555d971076d3ccf31154f10ed683a82/hls-metadata.json',
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
