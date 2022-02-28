import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionContext, ProgressLocation, Uri, window, workspace } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { downloadFile, executableExists, resolvePathPlaceHolders } from './utils';
import { match } from 'ts-pattern';

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
export async function downloadHaskellLanguageServer(context: ExtensionContext, logger: Logger): Promise<string> {
    logger.info('Downloading haskell-language-server');

    const storagePath: string = await getStoragePath(context);
    logger.info(`Using ${storagePath} to store downloaded binaries`);

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    const localWrapper = ['haskell-language-server-wrapper'].find(executableExists);
    const downloadedWrapper = path.join(
        storagePath,
        process.platform === 'win32' ? '' : 'bin',
        `haskell-language-server-wrapper${exeExt}`
    );
    const downloadedLegacyWrapper = path.join(
        storagePath,
        `haskell-language-server-wrapper${exeExt}`
    );
    let wrapper: string | undefined;
    if (localWrapper) {
        wrapper = localWrapper;
    } else if (executableExists(downloadedWrapper)) {
        wrapper = downloadedWrapper;
    } else if (executableExists(downloadedLegacyWrapper)) {
        wrapper = downloadedLegacyWrapper;
    }

    const ghcup = path.join(storagePath, 'ghcup');
    const updateBehaviour = workspace.getConfiguration('haskell').get('updateBehavior') as UpdateBehaviour;

    // check if we need to update HLS
    if (wrapper == null) {
        // install new hls
        if (updateBehaviour === 'never-check') {
            throw new Error(
                "No version of HLS installed or found and updateBehaviour set to 'never-check'" + 'giving up...'
            );
        } else if (updateBehaviour === 'prompt') {
            const promptMessage =
                'No version of the haskell-language-server is installed, would you like to install it now?';

            const decision = await window.showInformationMessage(promptMessage, 'Download', 'Nevermind');
            if (decision !== 'Download') {
                throw new Error('No version of HLS installed or found and installation was denied' + 'giving up...');
            }
        }
        await callAsync(
            ghcup,
            ['--no-verbose', 'install', 'hls', '--isolate', storagePath, '--force', 'latest'],
            storagePath,
            logger,
            `Installing latest HLS`,
            true,
            { GHCUP_INSTALL_BASE_PREFIX: storagePath }
        );
        return downloadedWrapper;
    } else {
        const args = ['--numeric-version'];
        const version = await callAsync(wrapper, args, storagePath, logger);

        const args2 = ['--no-verbose', 'list', '-t', 'hls', '-c', 'available', '-r'];
        const hls_versions = await callAsync(ghcup, args2, storagePath, logger, undefined, false, { GHCUP_INSTALL_BASE_PREFIX: storagePath });
        const latest_hls_version = hls_versions.split(/\r?\n/).pop()!.split(' ')[1];

        const cmp = comparePVP(version, latest_hls_version);
        if (cmp < 0) {
            // only update if the user wants to
            if (updateBehaviour === 'never-check') {
                logger.warn(
                    "As 'haskell.updateBehaviour' config option is set to 'never-check' " +
                        'we try to use the possibly obsolete cached release data'
                );
                return wrapper;
            } else if (updateBehaviour === 'prompt') {
                const promptMessage =
                    'A new version of the haskell-language-server is available, would you like to upgrade now?';

                const decision = await window.showInformationMessage(promptMessage, 'Download', 'Nevermind');
                if (decision !== 'Download') {
                    return wrapper;
                }
            }

            // there's a new version
            // delete old HLS
            await fs.rm(path.join(storagePath, 'bin'), { recursive: true, force: true }, () => {});
            await fs.rm(path.join(storagePath, 'lib'), { recursive: true, force: true }, () => {});
            // install new hls
            await callAsync(
                ghcup,
                ['--no-verbose', 'install', 'hls', '--isolate', storagePath, '--force', latest_hls_version],
                storagePath,
                logger,
                `Upgrading HLS to ${latest_hls_version}`,
                true,
                { GHCUP_INSTALL_BASE_PREFIX: storagePath }
            );
        }
        return wrapper;
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
    logger.info('Downloading ghcup');

    const storagePath: string = await getStoragePath(context);
    logger.info(`Using ${storagePath} to store downloaded binaries`);

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    const ghcup = path.join(storagePath, 'ghcup');
    // ghcup exists, just upgrade
    if (fs.existsSync(path.join(storagePath, 'ghcup'))) {
        const args = ['upgrade', '-i'];
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
        const title = 'Downloading ghcup';
        const dlUri = `https://downloads.haskell.org/~ghcup/${arch}-${plat}-ghcup${exeExt}`;
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

