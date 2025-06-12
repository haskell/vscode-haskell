import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationTarget, ExtensionContext, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { HlsError, MissingToolError, NoMatchingHls } from './errors';
import {
  addPathToProcessPath,
  callAsync,
  comparePVP,
  executableExists,
  IEnvVars,
  resolvePathPlaceHolders,
} from './utils';
import { ToolConfig, Tool, initDefaultGHCup, GHCup, GHCupConfig } from './ghcup';
import { getHlsMetadata } from './metadata';
export { IEnvVars, fetchConfig };

export type Context = {
  manageHls: ManageHLS;
  storagePath: string;
  serverExecutable?: HlsExecutable;
  logger: Logger;
};

/**
 * Global configuration for this extension.
 */
let haskellConfig = workspace.getConfiguration('haskell');

/**
 * On Windows the executable needs to be stored somewhere with an .exe extension
 */
const exeExt = process.platform === 'win32' ? '.exe' : '';

type ManageHLS = 'GHCup' | 'PATH';
let manageHLS = haskellConfig.get('manageHLS') as ManageHLS;

function fetchConfig() {
  haskellConfig = workspace.getConfiguration('haskell');
  manageHLS = haskellConfig.get('manageHLS') as ManageHLS;
}

/**
 * Gets serverExecutablePath and fails if it's not set.
 * @param logger Log progress.
 * @param folder Workspace folder. Used for resolving variables in the `serverExecutablePath`.
 * @returns Path to an HLS executable binary.
 */
function findServerExecutable(logger: Logger, folder?: WorkspaceFolder): string {
  const rawExePath = haskellConfig.get('serverExecutablePath') as string;
  logger.info(`Trying to find the server executable in: ${rawExePath}`);
  const resolvedExePath = resolvePathPlaceHolders(rawExePath, folder);
  logger.log(`Location after path variables substitution: ${resolvedExePath}`);
  if (executableExists(resolvedExePath)) {
    return resolvedExePath;
  } else {
    const msg = `Could not find a HLS binary at ${resolvedExePath}! Consider installing HLS via ghcup or change "haskell.manageHLS" in your settings.`;
    throw new HlsError(msg);
  }
}

/**
 * Searches the `PATH` for `haskell-language-server` or `haskell-language-server-wrapper` binary.
 * Fails if nothing is found.
 * @param logger Log all the stuff!
 * @returns Location of the `haskell-language-server` or `haskell-language-server-wrapper` binary if found.
 */
function findHlsInPath(logger: Logger): string {
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
  throw new MissingToolError('hls');
}

export type HlsExecutable = HlsOnPath | HlsViaVSCodeConfig | HlsViaGhcup;

export type HlsOnPath = {
  location: string;
  tag: 'path';
};

export type HlsViaVSCodeConfig = {
  location: string;
  tag: 'config';
};

export type HlsViaGhcup = {
  location: string;
  /**
   * if we download HLS, add that bin dir to PATH
   */
  binaryDirectory: string;
  tag: 'ghcup';
};

/**
 * Find and setup the Haskell Language Server.
 *
 * We support three ways of finding the HLS binary:
 *
 * 1. Let the user provide a location via `haskell.serverExecutablePath` option.
 * 2. Find a `haskell-language-server` binary on the `$PATH` if the user wants to do that.
 * 3. Use GHCup to install and locate HLS and other required tools, such as cabal, stack and ghc.
 *
 * @param context Context of the extension, required for metadata.
 * @param logger Logger for progress updates.
 * @param workingDir Working directory in VSCode.
 * @param folder Optional workspace folder. If given, will be preferred over {@link workingDir} for finding configuration entries.
 * @returns Path to haskell-language-server, paired with additional data required for setting up.
 */
export async function findHaskellLanguageServer(
  context: ExtensionContext,
  logger: Logger,
  ghcupConfig: GHCupConfig,
  workingDir: string,
  folder?: WorkspaceFolder,
): Promise<HlsExecutable> {
  logger.info('Finding haskell-language-server');

  const hasConfigForExecutable = haskellConfig.get('serverExecutablePath') as string;
  if (hasConfigForExecutable) {
    const exe = findServerExecutable(logger, folder);
    return {
      location: exe,
      tag: 'config',
    };
  }

  const storagePath: string = getStoragePath(context);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath);
  }

  // first extension initialization
  manageHLS = await promptUserForManagingHls(context, manageHLS);

  // based on the user-decision
  if (manageHLS === 'PATH') {
    const exe = findHlsInPath(logger);
    return {
      location: exe,
      tag: 'path',
    };
  } else {
    // we manage HLS, make sure ghcup is installed/available
    const ghcup = initDefaultGHCup(ghcupConfig, logger, folder);
    await ghcup.upgrade();

    // boring init
    let latestHLS: string | undefined | null;
    let latestCabal: string | undefined | null;
    let latestStack: string | undefined | null;
    let recGHC: string | undefined | null = 'recommended';
    let projectHls: string | undefined | null;
    let projectGhc: string | undefined | null;

    // support explicit toolchain config
    const toolchainConfig = new Map(Object.entries(haskellConfig.get('toolchain') as ToolConfig)) as ToolConfig;
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
      latestHLS = await ghcup.getLatestVersion('hls');
    }
    if (latestCabal === undefined) {
      latestCabal = await ghcup.getLatestVersion('cabal');
    }
    if (latestStack === undefined) {
      latestStack = await ghcup.getLatestVersion('stack');
    }
    if (recGHC === undefined) {
      recGHC = !executableExists('ghc') ? await ghcup.getLatestAvailableVersion('ghc', 'recommended') : null;
    }

    // download popups
    const promptBeforeDownloads = haskellConfig.get('promptBeforeDownloads') as boolean;
    if (promptBeforeDownloads) {
      const hlsInstalled = latestHLS ? await installationStatusOfGhcupTool(ghcup, 'hls', latestHLS) : undefined;
      const cabalInstalled = latestCabal ? await installationStatusOfGhcupTool(ghcup, 'cabal', latestCabal) : undefined;
      const stackInstalled = latestStack ? await installationStatusOfGhcupTool(ghcup, 'stack', latestStack) : undefined;
      const ghcInstalled = executableExists('ghc')
        ? new ToolStatus(
            'ghc',
            await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false),
          )
        : // if recGHC is null, that means user disabled automatic handling,
          recGHC !== null
          ? await installationStatusOfGhcupTool(ghcup, 'ghc', recGHC)
          : undefined;
      const toInstall: ToolStatus[] = [hlsInstalled, cabalInstalled, stackInstalled, ghcInstalled].filter(
        (tool) => tool && !tool.installed,
      ) as ToolStatus[];
      if (toInstall.length > 0) {
        const decision = await window.showInformationMessage(
          `Need to download ${toInstall.map((t) => t.nameWithVersion).join(', ')}, continue?`,
          'Yes',
          'No',
          "Yes, don't ask again",
        );
        if (decision === 'Yes') {
          logger.info(`User accepted download for ${toInstall.map((t) => t.nameWithVersion).join(', ')}.`);
        } else if (decision === "Yes, don't ask again") {
          logger.info(
            `User accepted download for ${toInstall.map((t) => t.nameWithVersion).join(', ')} and won't be asked again.`,
          );
          haskellConfig.update('promptBeforeDownloads', false);
        } else {
          toInstall.forEach((tool) => {
            if (tool !== undefined && !tool.installed) {
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
    const latestToolchainBindir = await ghcup.call(
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
        if (err) {
          reject("Couldn't install latest toolchain");
        } else {
          resolve(stdout?.trim());
        }
      },
    );

    // now figure out the actual project GHC version and the latest supported HLS version
    // we need for it (e.g. this might in fact be a downgrade for old GHCs)
    if (projectHls === undefined || projectGhc === undefined) {
      const res = await getLatestProjectHls(ghcup, logger, storagePath, workingDir, latestToolchainBindir);
      if (projectHls === undefined) {
        projectHls = res[0];
      }
      if (projectGhc === undefined) {
        projectGhc = res[1];
      }
    }

    // more download popups
    if (promptBeforeDownloads) {
      const hlsInstalled = projectHls ? await installationStatusOfGhcupTool(ghcup, 'hls', projectHls) : undefined;
      const ghcInstalled = projectGhc ? await installationStatusOfGhcupTool(ghcup, 'ghc', projectGhc) : undefined;
      const toInstall: ToolStatus[] = [hlsInstalled, ghcInstalled].filter(
        (tool) => tool && !tool.installed,
      ) as ToolStatus[];
      if (toInstall.length > 0) {
        const decision = await window.showInformationMessage(
          `Need to download ${toInstall.map((t) => t.nameWithVersion).join(', ')}, continue?`,
          { modal: true },
          'Yes',
          'No',
          "Yes, don't ask again",
        );
        if (decision === 'Yes') {
          logger.info(`User accepted download for ${toInstall.map((t) => t.nameWithVersion).join(', ')}.`);
        } else if (decision === "Yes, don't ask again") {
          logger.info(
            `User accepted download for ${toInstall.map((t) => t.nameWithVersion).join(', ')} and won't be asked again.`,
          );
          haskellConfig.update('promptBeforeDownloads', false);
        } else {
          toInstall.forEach((tool) => {
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
    const hlsBinDir = await ghcup.call(
      [
        'run',
        ...(projectHls ? ['--hls', projectHls] : []),
        ...(latestCabal ? ['--cabal', latestCabal] : []),
        ...(latestStack ? ['--stack', latestStack] : []),
        ...(projectGhc ? ['--ghc', projectGhc] : []),
        '--install',
      ],
      `Installing project specific toolchain: ${[
        ['hls', projectHls],
        ['GHC', projectGhc],
        ['cabal', latestCabal],
        ['stack', latestStack],
      ]
        .filter((t) => t[1])
        .map((t) => `${t[0]}-${t[1]}`)
        .join(', ')}`,
      true,
    );

    if (projectHls) {
      return {
        binaryDirectory: hlsBinDir,
        location: path.join(hlsBinDir, `haskell-language-server-wrapper${exeExt}`),
        tag: 'ghcup',
      };
    } else {
      return {
        binaryDirectory: hlsBinDir,
        location: findHlsInPath(logger),
        tag: 'ghcup',
      };
    }
  }
}

async function promptUserForManagingHls(context: ExtensionContext, manageHlsSetting: ManageHLS): Promise<ManageHLS> {
  if (manageHlsSetting !== 'GHCup' && (!context.globalState.get('pluginInitialized') as boolean | null)) {
    const promptMessage = `How do you want the extension to manage/discover HLS and the relevant toolchain?

    Choose "Automatically" if you're in doubt.
    `;

    const popup = window.showInformationMessage(
      promptMessage,
      { modal: true },
      'Automatically via GHCup',
      'Manually via PATH',
    );

    const decision = (await popup) || null;
    let howToManage: ManageHLS;
    if (decision === 'Automatically via GHCup') {
      howToManage = 'GHCup';
    } else if (decision === 'Manually via PATH') {
      howToManage = 'PATH';
    } else {
      window.showWarningMessage(
        "Choosing default PATH method for HLS discovery. You can change this via 'haskell.manageHLS' in the settings.",
      );
      howToManage = 'PATH';
    }
    haskellConfig.update('manageHLS', howToManage, ConfigurationTarget.Global);
    context.globalState.update('pluginInitialized', true);
    return howToManage;
  } else {
    return manageHlsSetting;
  }
}

async function getLatestProjectHls(
  ghcup: GHCup,
  logger: Logger,
  storagePath: string,
  workingDir: string,
  toolchainBindir: string,
): Promise<[string, string]> {
  // get project GHC version, but fallback to system ghc if necessary.
  const projectGhc = toolchainBindir
    ? await getProjectGhcVersion(toolchainBindir, workingDir, logger).catch(async (e) => {
        logger.error(`${e}`);
        window.showWarningMessage(
          `I had trouble figuring out the exact GHC version for the project. Falling back to using 'ghc${exeExt}'.`,
        );
        return await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false);
      })
    : await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false);

  // first we get supported GHC versions from available HLS bindists (whether installed or not)
  const metadataMap = (await getHlsMetadata(storagePath, logger)) || new Map<string, string[]>();
  // then we get supported GHC versions from currently installed HLS versions
  const ghcupMap = (await findAvailableHlsBinariesFromGHCup(ghcup)) || new Map<string, string[]>();
  // since installed HLS versions may support a different set of GHC versions than the bindists
  // (e.g. because the user ran 'ghcup compile hls'), we need to merge both maps, preferring
  // values from already installed HLSes
  const merged = new Map<string, string[]>([...metadataMap, ...ghcupMap]); // right-biased
  // now sort and get the latest suitable version
  const latest = [...merged]
    .filter(([_k, v]) => v.some((x) => x === projectGhc))
    .sort(([k1, _v1], [k2, _v2]) => comparePVP(k1, k2))
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
 * @param toolchainBindir Path to the toolchain bin directory (added to PATH)
 * @param workingDir Directory to run the process, usually the root of the workspace.
 * @param logger Logger for feedback.
 * @returns The GHC version, or fail with an `Error`.
 */
export async function getProjectGhcVersion(
  toolchainBindir: string,
  workingDir: string,
  logger: Logger,
): Promise<string> {
  const title = 'Working out the project GHC version. This might take a while...';
  logger.info(title);

  const args = ['--project-ghc-version'];

  const newPath = addPathToProcessPath(toolchainBindir);
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
          /Cradle requires (.+) but couldn't find it|The program '(.+)' version .* is required but the version of.*could.*not be determined|Cannot find the program '(.+)'\. User-specified/;
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
            `haskell-language-server --project-ghc-version exited with exit code ${err.code}:\n${stdout}\n${stderr}`,
          ),
        );
      } else {
        logger.info(`The GHC version for the project or file: ${stdout?.trim()}`);
        resolve(stdout?.trim());
      }
    },
  );
}

/**
 * Find the storage path for the extension.
 * If no custom location was given
 *
 * @param context Extension context for the 'Storage Path'.
 * @returns
 */
export function getStoragePath(context: ExtensionContext): string {
  let storagePath: string | undefined = haskellConfig.get('releasesDownloadStoragePath');

  if (!storagePath) {
    storagePath = context.globalStorageUri.fsPath;
  } else {
    storagePath = resolvePathPlaceHolders(storagePath);
  }

  return storagePath;
}

/**
 *
 * Complements {@link getReleaseMetadata}, by checking possibly locally compiled
 * HLS in ghcup
 * If 'targetGhc' is omitted, picks the latest 'haskell-language-server-wrapper',
 * otherwise ensures the specified GHC is supported.
 *
 * @param ghcup GHCup wrapper.
 * @returns A Map of the locally installed HLS versions and with which `GHC` versions they are compatible.
 */

async function findAvailableHlsBinariesFromGHCup(ghcup: GHCup): Promise<Map<string, string[]> | null> {
  const hlsVersions = await ghcup.call(['list', '-t', 'hls', '-c', 'installed', '-r'], undefined, false);

  const bindir = await ghcup.call(['whereis', 'bindir'], undefined, false);
  const files = fs.readdirSync(bindir).filter((e) => {
    const stat = fs.statSync(path.join(bindir, e));
    return stat.isFile();
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

async function installationStatusOfGhcupTool(ghcup: GHCup, tool: Tool, version: string): Promise<ToolStatus> {
  const b = await ghcup
    .call(['whereis', tool, version], undefined, false)
    .then(() => true)
    .catch(() => false);
  return new ToolStatus(tool, version, b);
}

/**
 * Tracks the name, version and installation state of tools we need.
 */
class ToolStatus {
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
  public constructor(
    readonly name: string,
    readonly version: string,
    readonly installed: boolean = true,
  ) {
    this.nameWithVersion = `${name}-${version}`;
  }
}
