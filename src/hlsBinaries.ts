import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import { stat } from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import { match } from 'ts-pattern';
import * as url from 'url';
import { promisify } from 'util';
import { ConfigurationTarget, ExtensionContext, ProgressLocation, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { HlsError, MissingToolError, NoMatchingHls } from './errors';
import {
  addPathToProcessPath,
  comparePVP,
  executableExists,
  httpsGetSilently,
  IEnvVars,
  resolvePathPlaceHolders,
  resolveServerEnvironmentPATH,
} from './utils';
export { IEnvVars };

type Tool = 'hls' | 'ghc' | 'cabal' | 'stack';

type ToolConfig = Map<Tool, string>;

type ManageHLS = 'GHCup' | 'PATH';
let manageHLS = workspace.getConfiguration('haskell').get('manageHLS') as ManageHLS;

// On Windows the executable needs to be stored somewhere with an .exe extension
const exeExt = process.platform === 'win32' ? '.exe' : '';

/**
 * Callback invoked on process termination.
 */
type ProcessCallback = (
  error: ExecException | null,
  stdout: string,
  stderr: string,
  resolve: (value: string | PromiseLike<string>) => void,
  reject: (reason?: any) => void
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
async function callAsync(
  binary: string,
  args: string[],
  logger: Logger,
  dir?: string,
  title?: string,
  cancellable?: boolean,
  envAdd?: IEnvVars,
  callback?: ProcessCallback
): Promise<string> {
  let newEnv: IEnvVars = await resolveServerEnvironmentPATH(
    workspace.getConfiguration('haskell').get('serverEnvironment') || {}
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
                              for details.`)
                  );
                } else {
                  resolve(stdout?.trim());
                }
              }
            }
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
    }
  );
}

/** Gets serverExecutablePath and fails if it's not set.
 */
async function findServerExecutable(
  context: ExtensionContext,
  logger: Logger,
  folder?: WorkspaceFolder
): Promise<string> {
  let exePath = workspace.getConfiguration('haskell').get('serverExecutablePath') as string;
  logger.info(`Trying to find the server executable in: ${exePath}`);
  exePath = resolvePathPlaceHolders(exePath, folder);
  logger.log(`Location after path variables substitution: ${exePath}`);
  if (await executableExists(exePath)) {
    return exePath;
  } else {
    const msg = `Could not find a HLS binary at ${exePath}! Consider installing HLS via ghcup or change "haskell.manageHLS" in your settings.`;
    throw new Error(msg);
  }
}

/** Searches the PATH. Fails if nothing is found.
 */
async function findHLSinPATH(context: ExtensionContext, logger: Logger, folder?: WorkspaceFolder): Promise<string> {
  // try PATH
  const exes: string[] = ['haskell-language-server-wrapper', 'haskell-language-server'];
  logger.info(`Searching for server executables ${exes.join(',')} in $PATH`);
  logger.info(`$PATH environment variable: ${process.env.PATH}`);
  for (const exe of exes) {
    if (await executableExists(exe)) {
      logger.info(`Found server executable in $PATH: ${exe}`);
      return exe;
    }
  }
  throw new MissingToolError('hls');
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
): Promise<[string, string | undefined]> {
  logger.info('Finding haskell-language-server');

  if (workspace.getConfiguration('haskell').get('serverExecutablePath') as string) {
    const exe = await findServerExecutable(context, logger, folder);
    return [exe, undefined];
  }

  const storagePath: string = await getStoragePath(context);

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath);
  }

  // first plugin initialization
  if (manageHLS !== 'GHCup' && (!context.globalState.get('pluginInitialized') as boolean | null)) {
    const promptMessage = 'How do you want the extension to manage/discover HLS and the relevant toolchain?';

    const popup = window.showInformationMessage(
      promptMessage,
      { modal: true },
      'Automatically via GHCup',
      'Manually via PATH'
    );

    const decision = (await popup) || null;
    if (decision === 'Automatically via GHCup') {
      manageHLS = 'GHCup';
    } else if (decision === 'Manually via PATH') {
      manageHLS = 'PATH';
    } else {
      window.showWarningMessage(
        "Choosing default PATH method for HLS discovery. You can change this via 'haskell.manageHLS' in the settings."
      );
      manageHLS = 'PATH';
    }
    workspace.getConfiguration('haskell').update('manageHLS', manageHLS, ConfigurationTarget.Global);
    context.globalState.update('pluginInitialized', true);
  }

  if (manageHLS === 'PATH') {
    const exe = await findHLSinPATH(context, logger, folder);
    return [exe, undefined];
  } else {
    // we manage HLS, make sure ghcup is installed/available
    await upgradeGHCup(context, logger);

    // boring init
    let latestHLS: string | undefined | null;
    let latestCabal: string | undefined | null;
    let latestStack: string | undefined | null;
    let recGHC: string | undefined | null = 'recommended';
    let projectHls: string | undefined | null;
    let projectGhc: string | undefined | null;

    // support explicit toolchain config
    const toolchainConfig: ToolConfig = new Map(
      Object.entries(workspace.getConfiguration('haskell').get('toolchain') as any)
    ) as ToolConfig;
    if (toolchainConfig) {
      latestHLS = toolchainConfig.get('hls');
      latestCabal = toolchainConfig.get('cabal');
      latestStack = toolchainConfig.get('stack');
      recGHC = toolchainConfig.get('ghc');

      projectHls = latestHLS;
      projectGhc = recGHC;
    }

    // get a preliminary toolchain for finding the correct project GHC version
    // (we need HLS and cabal/stack and ghc as fallback),
    // later we may install a different toolchain that's more project-specific
    if (latestHLS === undefined) {
      latestHLS = await getLatestToolFromGHCup(context, logger, 'hls');
    }
    if (latestCabal === undefined) {
      latestCabal = await getLatestToolFromGHCup(context, logger, 'cabal');
    }
    if (latestStack === undefined) {
      latestStack = await getLatestToolFromGHCup(context, logger, 'stack');
    }
    if (recGHC === undefined) {
      recGHC = !(await executableExists('ghc'))
        ? await getLatestAvailableToolFromGHCup(context, logger, 'ghc', 'recommended')
        : null;
    }

    // download popups
    const promptBeforeDownloads = workspace.getConfiguration('haskell').get('promptBeforeDownloads') as boolean;
    if (promptBeforeDownloads) {
      const hlsInstalled = latestHLS
        ? await toolInstalled(context, logger, 'hls', latestHLS)
        : new InstalledTool('hls');
      const cabalInstalled = latestCabal
        ? await toolInstalled(context, logger, 'cabal', latestCabal)
        : new InstalledTool('cabal');
      const stackInstalled = latestStack
        ? await toolInstalled(context, logger, 'stack', latestStack)
        : new InstalledTool('stack');
      const ghcInstalled = (await executableExists('ghc'))
        ? new InstalledTool('ghc')
        : await toolInstalled(context, logger, 'ghc', recGHC!);
      const toInstall = [hlsInstalled, cabalInstalled, stackInstalled, ghcInstalled]
        .filter((tool) => !tool.installed)
        .map((tool) => tool.nameWithVersion);
      if (toInstall.length > 0) {
        const decision = await window.showInformationMessage(
          `Need to download ${toInstall.join(', ')}, continue?`,
          'Yes',
          'No',
          "Yes, don't ask again"
        );
        if (decision === 'Yes') {
          logger.info(`User accepted download for ${toInstall.join(', ')}.`);
        } else if (decision === "Yes, don't ask again") {
          logger.info(`User accepted download for ${toInstall.join(', ')} and won't be asked again.`);
          workspace.getConfiguration('haskell').update('promptBeforeDownloads', false);
        } else {
          [hlsInstalled, cabalInstalled, stackInstalled, ghcInstalled].forEach((tool) => {
            if (!tool.installed) {
              if (tool.name === 'hls') {
                throw new MissingToolError('hls');
              } else if (tool.name === 'cabal') {
                latestCabal = null;
              } else if (tool.name === 'stack') {
                latestStack = null;
              } else if (tool.name === 'ghc') {
                recGHC = null;
              }
            }
          });
        }
      }
    }

    // our preliminary toolchain
    const latestToolchainBindir = await callGHCup(
      context,
      logger,
      [
        'run',
        ...(latestHLS ? ['--hls', latestHLS] : []),
        ...(latestCabal ? ['--cabal', latestCabal] : []),
        ...(latestStack ? ['--stack', latestStack] : []),
        ...(recGHC ? ['--ghc', recGHC] : []),
        '--install',
      ],
      'Installing latest toolchain for bootstrap',
      true,
      (err, stdout, _stderr, resolve, reject) => {
        err ? reject("Couldn't install latest toolchain") : resolve(stdout?.trim());
      }
    );

    // now figure out the actual project GHC version and the latest supported HLS version
    // we need for it (e.g. this might in fact be a downgrade for old GHCs)
    if (projectHls === undefined || projectGhc === undefined) {
      const res = await getLatestProjectHLS(context, logger, workingDir, latestToolchainBindir);
      if (projectHls === undefined) {
        projectHls = res[0];
      }
      if (projectGhc === undefined) {
        projectGhc = res[1];
      }
    }

    // more download popups
    if (promptBeforeDownloads) {
      const hlsInstalled = projectHls
        ? await toolInstalled(context, logger, 'hls', projectHls)
        : new InstalledTool('hls');
      const ghcInstalled = projectGhc
        ? await toolInstalled(context, logger, 'ghc', projectGhc)
        : new InstalledTool('ghc');
      const toInstall = [hlsInstalled, ghcInstalled]
        .filter((tool) => !tool.installed)
        .map((tool) => tool.nameWithVersion);
      if (toInstall.length > 0) {
        const decision = await window.showInformationMessage(
          `Need to download ${toInstall.join(', ')}, continue?`,
          { modal: true },
          'Yes',
          'No',
          "Yes, don't ask again"
        );
        if (decision === 'Yes') {
          logger.info(`User accepted download for ${toInstall.join(', ')}.`);
        } else if (decision === "Yes, don't ask again") {
          logger.info(`User accepted download for ${toInstall.join(', ')} and won't be asked again.`);
          workspace.getConfiguration('haskell').update('promptBeforeDownloads', false);
        } else {
          [hlsInstalled, ghcInstalled].forEach((tool) => {
            if (!tool.installed) {
              if (tool.name === 'hls') {
                throw new MissingToolError('hls');
              } else if (tool.name === 'ghc') {
                projectGhc = null;
              }
            }
          });
        }
      }
    }

    // now install the proper versions
    const hlsBinDir = await callGHCup(
      context,
      logger,
      [
        'run',
        ...(projectHls ? ['--hls', projectHls] : []),
        ...(latestCabal ? ['--cabal', latestCabal] : []),
        ...(latestStack ? ['--stack', latestStack] : []),
        ...(projectGhc ? ['--ghc', projectGhc] : []),
        '--install',
      ],
      `Installing project specific toolchain: HLS-${projectHls}, GHC-${projectGhc}, cabal-${latestCabal}, stack-${latestStack}`,
      true
    );

    if (projectHls) {
      return [path.join(hlsBinDir, `haskell-language-server-wrapper${exeExt}`), hlsBinDir];
    } else {
      const exe = await findHLSinPATH(context, logger, folder);
      return [exe, hlsBinDir];
    }
  }
}

async function callGHCup(
  context: ExtensionContext,
  logger: Logger,
  args: string[],
  title?: string,
  cancellable?: boolean,
  callback?: ProcessCallback
): Promise<string> {
  const metadataUrl = workspace.getConfiguration('haskell').metadataURL;

  if (manageHLS === 'GHCup') {
    const ghcup = await findGHCup(context, logger);
    return await callAsync(
      ghcup,
      ['--no-verbose'].concat(metadataUrl ? ['-s', metadataUrl] : []).concat(args),
      logger,
      undefined,
      title,
      cancellable,
      {
        // omit colourful output because the logs are uglier
        NO_COLOR: '1',
      },
      callback
    );
  } else {
    throw new HlsError(`Internal error: tried to call ghcup while haskell.manageHLS is set to ${manageHLS}. Aborting!`);
  }
}

async function getLatestProjectHLS(
  context: ExtensionContext,
  logger: Logger,
  workingDir: string,
  toolchainBindir: string
): Promise<[string, string]> {
  // get project GHC version, but fallback to system ghc if necessary.
  const projectGhc = toolchainBindir
    ? await getProjectGHCVersion(toolchainBindir, workingDir, logger).catch(async (e) => {
        logger.error(`${e}`);
        window.showWarningMessage(
          `I had trouble figuring out the exact GHC version for the project. Falling back to using 'ghc${exeExt}'.`
        );
        return await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false);
      })
    : await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false);

  // first we get supported GHC versions from available HLS bindists (whether installed or not)
  const metadataMap = (await getHLSesfromMetadata(context, logger)) || new Map<string, string[]>();
  // then we get supported GHC versions from currently installed HLS versions
  const ghcupMap = (await getHLSesFromGHCup(context, logger)) || new Map<string, string[]>();
  // since installed HLS versions may support a different set of GHC versions than the bindists
  // (e.g. because the user ran 'ghcup compile hls'), we need to merge both maps, preferring
  // values from already installed HLSes
  const merged = new Map<string, string[]>([...metadataMap, ...ghcupMap]); // right-biased
  // now sort and get the latest suitable version
  const latest = [...merged]
    .filter(([k, v]) => v.some((x) => x === projectGhc))
    .sort(([k1, v1], [k2, v2]) => comparePVP(k1, k2))
    .pop();

  if (!latest) {
    throw new NoMatchingHls(projectGhc);
  } else {
    return [latest[0], projectGhc];
  }
}

/**
 * Obtain the project ghc version from the HLS - Wrapper (which must be in PATH now).
 * Also, serves as a sanity check.
 * @param wrapper Path to the Haskell-Language-Server wrapper
 * @param workingDir Directory to run the process, usually the root of the workspace.
 * @param logger Logger for feedback.
 * @returns The GHC version, or fail with an `Error`.
 */
export async function getProjectGHCVersion(
  toolchainBindir: string,
  workingDir: string,
  logger: Logger
): Promise<string> {
  const title = 'Working out the project GHC version. This might take a while...';
  logger.info(title);

  const args = ['--project-ghc-version'];

  const newPath = await addPathToProcessPath(toolchainBindir, logger);
  const environmentNew: IEnvVars = {
    PATH: newPath,
  };

  return callAsync(
    'haskell-language-server-wrapper',
    args,
    logger,
    workingDir,
    title,
    false,
    environmentNew,
    (err, stdout, stderr, resolve, reject) => {
      if (err) {
        // Error message emitted by HLS-wrapper
        const regex =
          /Cradle requires (.+) but couldn't find it|The program \'(.+)\' version .* is required but the version of.*could.*not be determined|Cannot find the program \'(.+)\'\. User-specified/;
        const res = regex.exec(stderr);
        if (res) {
          for (let i = 1; i < res.length; i++) {
            if (res[i]) {
              reject(new MissingToolError(res[i]));
            }
          }
          reject(new MissingToolError('unknown'));
        }
        reject(
          Error(
            `haskell-language-server --project-ghc-version exited with exit code ${err.code}:\n${stdout}\n${stderr}`
          )
        );
      } else {
        logger.info(`The GHC version for the project or file: ${stdout?.trim()}`);
        resolve(stdout?.trim());
      }
    }
  );
}

export async function upgradeGHCup(context: ExtensionContext, logger: Logger): Promise<void> {
  if (manageHLS === 'GHCup') {
    const upgrade = workspace.getConfiguration('haskell').get('upgradeGHCup') as boolean;
    if (upgrade) {
      await callGHCup(context, logger, ['upgrade'], 'Upgrading ghcup', true);
    }
  } else {
    throw new Error(`Internal error: tried to call ghcup while haskell.manageHLS is set to ${manageHLS}. Aborting!`);
  }
}

export async function findGHCup(context: ExtensionContext, logger: Logger, folder?: WorkspaceFolder): Promise<string> {
  logger.info('Checking for ghcup installation');
  let exePath = workspace.getConfiguration('haskell').get('ghcupExecutablePath') as string;
  if (exePath) {
    logger.info(`Trying to find the ghcup executable in: ${exePath}`);
    exePath = resolvePathPlaceHolders(exePath, folder);
    logger.log(`Location after path variables substitution: ${exePath}`);
    if (await executableExists(exePath)) {
      return exePath;
    } else {
      throw new Error(`Could not find a ghcup binary at ${exePath}!`);
    }
  } else {
    const localGHCup = ['ghcup'].find(executableExists);
    if (!localGHCup) {
      throw new MissingToolError('ghcup');
    } else {
      logger.info(`found ghcup at ${localGHCup}`);
      return localGHCup;
    }
  }
}

export async function getStoragePath(context: ExtensionContext): Promise<string> {
  let storagePath: string | undefined = await workspace.getConfiguration('haskell').get('releasesDownloadStoragePath');

  if (!storagePath) {
    storagePath = context.globalStorageUri.fsPath;
  } else {
    storagePath = resolvePathPlaceHolders(storagePath);
  }

  return storagePath;
}

// the tool might be installed or not
async function getLatestToolFromGHCup(context: ExtensionContext, logger: Logger, tool: Tool): Promise<string> {
  // these might be custom/stray/compiled, so we try first
  const installedVersions = await callGHCup(
    context,
    logger,
    ['list', '-t', tool, '-c', 'installed', '-r'],
    undefined,
    false
  );
  const latestInstalled = installedVersions.split(/\r?\n/).pop();
  if (latestInstalled) {
    return latestInstalled.split(/\s+/)[1];
  }

  return getLatestAvailableToolFromGHCup(context, logger, tool);
}

async function getLatestAvailableToolFromGHCup(
  context: ExtensionContext,
  logger: Logger,
  tool: Tool,
  tag?: string,
  criteria?: string
): Promise<string> {
  // fall back to installable versions
  const availableVersions = await callGHCup(
    context,
    logger,
    ['list', '-t', tool, '-c', criteria ? criteria : 'available', '-r'],
    undefined,
    false
  ).then((s) => s.split(/\r?\n/));

  let latestAvailable: string | null = null;
  availableVersions.forEach((ver) => {
    if (
      ver
        .split(/\s+/)[2]
        .split(',')
        .includes(tag ? tag : 'latest')
    ) {
      latestAvailable = ver.split(/\s+/)[1];
    }
  });
  if (!latestAvailable) {
    throw new Error(`Unable to find ${tag ? tag : 'latest'} tool ${tool}`);
  } else {
    return latestAvailable;
  }
}

// complements getHLSesfromMetadata, by checking possibly locally compiled
// HLS in ghcup
// If 'targetGhc' is omitted, picks the latest 'haskell-language-server-wrapper',
// otherwise ensures the specified GHC is supported.
async function getHLSesFromGHCup(context: ExtensionContext, logger: Logger): Promise<Map<string, string[]> | null> {
  const hlsVersions = await callGHCup(
    context,
    logger,
    ['list', '-t', 'hls', '-c', 'installed', '-r'],
    undefined,
    false
  );

  const bindir = await callGHCup(context, logger, ['whereis', 'bindir'], undefined, false);

  const files = fs.readdirSync(bindir).filter(async (e) => {
    return await stat(path.join(bindir, e))
      .then((s) => s.isDirectory())
      .catch(() => false);
  });

  const installed = hlsVersions.split(/\r?\n/).map((e) => e.split(/\s+/)[1]);
  if (installed?.length) {
    const myMap = new Map<string, string[]>();
    installed.forEach((hls) => {
      const ghcs = files
        .filter((f) => f.endsWith(`~${hls}${exeExt}`) && f.startsWith('haskell-language-server-'))
        .map((f) => {
          const rmPrefix = f.substring('haskell-language-server-'.length);
          return rmPrefix.substring(0, rmPrefix.length - `~${hls}${exeExt}`.length);
        });
      myMap.set(hls, ghcs);
    });

    return myMap;
  } else {
    return null;
  }
}

async function toolInstalled(
  context: ExtensionContext,
  logger: Logger,
  tool: Tool,
  version: string
): Promise<InstalledTool> {
  const b = await callGHCup(context, logger, ['whereis', tool, version], undefined, false)
    .then((x) => true)
    .catch((x) => false);
  return new InstalledTool(tool, version, b);
}

/**
 * Metadata of release information.
 *
 * Example of the expected format:
 *
 * ```
 * {
 *  "1.6.1.0": {
 *     "A_64": {
 *       "Darwin": [
 *         "8.10.6",
 *       ],
 *       "Linux_Alpine": [
 *         "8.10.7",
 *         "8.8.4",
 *       ],
 *     },
 *     "A_ARM": {
 *       "Linux_UnknownLinux": [
 *         "8.10.7"
 *       ]
 *     },
 *     "A_ARM64": {
 *       "Darwin": [
 *         "8.10.7"
 *       ],
 *       "Linux_UnknownLinux": [
 *         "8.10.7"
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * consult [ghcup metadata repo](https://github.com/haskell/ghcup-metadata/) for details.
 */
 export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;

/**
 * Compute Map of supported HLS versions for this platform.
 * Fetches HLS metadata information.
 *
 * @param context Context of the extension, required for metadata.
 * @param logger Logger for feedback
 * @returns Map of supported HLS versions or null if metadata could not be fetched.
 */
async function getHLSesfromMetadata(context: ExtensionContext, logger: Logger): Promise<Map<string, string[]> | null> {
  const storagePath: string = await getStoragePath(context);
  const metadata = await getReleaseMetadata(context, storagePath, logger).catch((e) => null);
  if (!metadata) {
    window.showErrorMessage('Could not get release metadata');
    return null;
  }
  const plat: Platform | null = match(process.platform)
    .with('darwin', (_) => 'Darwin' as Platform)
    .with('linux', (_) => 'Linux_UnknownLinux' as Platform)
    .with('win32', (_) => 'Windows' as Platform)
    .with('freebsd', (_) => 'FreeBSD' as Platform)
    .otherwise((_) => null);
  if (plat === null) {
    throw new Error(`Unknown platform ${process.platform}`);
  }
  const arch: Arch | null = match(process.arch)
    .with('arm', (_) => 'A_ARM' as Arch)
    .with('arm64', (_) => 'A_ARM64' as Arch)
    .with('x32', (_) => 'A_32' as Arch)
    .with('x64', (_) => 'A_64' as Arch)
    .otherwise((_) => null);
  if (arch === null) {
    throw new Error(`Unknown architecture ${process.arch}`);
  }

  return findSupportedHlsPerGhc(plat, arch, metadata, logger);
}

export type Platform = 'Darwin' | 'Linux_UnknownLinux' | 'Windows' | 'FreeBSD';

export type Arch = 'A_ARM' | 'A_ARM64' | 'A_32' | 'A_64';

/**
 * Find all supported GHC versions per HLS version supported on the given
 * platform and architecture.
 * @param platform Platform of the host.
 * @param arch Arch of the host.
 * @param metadata HLS Metadata information.
 * @param logger Logger.
 * @returns Map from HLS version to GHC versions that are supported.
 */
export function findSupportedHlsPerGhc(
  platform: Platform,
  arch: Arch,
  metadata: ReleaseMetadata,
  logger: Logger
): Map<string, string[]> {
  logger.info(`Platform constants: ${platform}, ${arch}`);
  const newMap = new Map<string, string[]>();
  metadata.forEach((supportedArch, hlsVersion) => {
    const supportedOs = supportedArch.get(arch);
    if (supportedOs) {
      const ghcSupportedOnOs = supportedOs.get(platform);
      if (ghcSupportedOnOs) {
        logger.log(`HLS ${hlsVersion} compatible with GHC Versions: ${ghcSupportedOnOs}`);
        // copy supported ghc versions to avoid unintended modifications
        newMap.set(hlsVersion, [...ghcSupportedOnOs]);
      }
    }
  });

  return newMap;
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
      throw new Error("Couldn't get the latest haskell-language-server releases from GitHub: " + githubError.message);
    }
  }
}

/**
 * Tracks the name, version and installation state of tools we need.
 */
class InstalledTool {
  /**
   * "\<name\>-\<version\>" of the installed Tool.
   */
  readonly nameWithVersion: string = '';

  /**
   * Initialize an installed tool entry.
   *
   * If optional parameters are omitted, we assume the tool is installed.
   *
   * @param name Name of the tool.
   * @param version Version of the tool, expected to be either SemVer or PVP versioned.
   * @param installed Is this tool currently installed?
   */
  public constructor(readonly name: string, readonly version: string = '', readonly installed: boolean = true) {
    this.nameWithVersion = `${name}-${version}`;
  }
}
