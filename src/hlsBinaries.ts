import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { match } from 'ts-pattern';
import { promisify } from 'util';
import { ConfigurationTarget, ExtensionContext, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { HlsError, MissingToolError, NoMatchingHls } from './errors';
import {
  addPathToProcessPath,
  callAsync,
  comparePVP,
  executableExists,
  httpsGetSilently,
  IEnvVars,
  resolvePathPlaceHolders,
} from './utils';
import * as ghcup from './ghcup';
import { ToolConfig, Tool } from './ghcup';
export { IEnvVars };

type ManageHLS = 'GHCup' | 'PATH';
let manageHLS = workspace.getConfiguration('haskell').get('manageHLS') as ManageHLS;

export type Context = {
  manageHls: ManageHLS;
  serverExecutable?: HlsExecutable;
  logger: Logger;
};

// On Windows the executable needs to be stored somewhere with an .exe extension
const exeExt = process.platform === 'win32' ? '.exe' : '';

/** Gets serverExecutablePath and fails if it's not set.
 */
function findServerExecutable(logger: Logger, folder?: WorkspaceFolder): string {
  const rawExePath = workspace.getConfiguration('haskell').get('serverExecutablePath') as string;
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

/** Searches the PATH. Fails if nothing is found.
 */
function findHlsInPath(_context: ExtensionContext, logger: Logger): string {
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
  folder?: WorkspaceFolder,
): Promise<HlsExecutable> {
  logger.info('Finding haskell-language-server');

  const hasConfigForExecutable = workspace.getConfiguration('haskell').get('serverExecutablePath') as string;
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

  // first plugin initialization
  manageHLS = await promptUserForManagingHls(context, manageHLS);

  if (manageHLS === 'PATH') {
    const exe = findHlsInPath(context, logger);
    return {
      location: exe,
      tag: 'path',
    };
  } else {
    // we manage HLS, make sure ghcup is installed/available
    await ghcup.upgradeGHCup(logger);

    // boring init
    let latestHLS: string | undefined;
    let latestCabal: string | undefined | null;
    let latestStack: string | undefined | null;
    let recGHC: string | undefined | null = 'recommended';
    let projectHls: string | undefined;
    let projectGhc: string | undefined | null;

    // support explicit toolchain config
    const toolchainConfig = new Map(
      Object.entries(workspace.getConfiguration('haskell').get('toolchain') as ToolConfig),
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
      latestHLS = await ghcup.getLatestToolFromGHCup(logger, 'hls');
    }
    if (latestCabal === undefined) {
      latestCabal = await ghcup.getLatestToolFromGHCup(logger, 'cabal');
    }
    if (latestStack === undefined) {
      latestStack = await ghcup.getLatestToolFromGHCup(logger, 'stack');
    }
    if (recGHC === undefined) {
      recGHC = !executableExists('ghc')
        ? await ghcup.getLatestAvailableToolFromGHCup(logger, 'ghc', 'recommended')
        : null;
    }

    // download popups
    const promptBeforeDownloads = workspace.getConfiguration('haskell').get('promptBeforeDownloads') as boolean;
    if (promptBeforeDownloads) {
      const hlsInstalled = latestHLS ? await toolInstalled(logger, 'hls', latestHLS) : undefined;
      const cabalInstalled = latestCabal ? await toolInstalled(logger, 'cabal', latestCabal) : undefined;
      const stackInstalled = latestStack ? await toolInstalled(logger, 'stack', latestStack) : undefined;
      const ghcInstalled = executableExists('ghc')
        ? new InstalledTool(
            'ghc',
            await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false),
          )
        : // if recGHC is null, that means user disabled automatic handling,
          recGHC !== null
          ? await toolInstalled(logger, 'ghc', recGHC)
          : undefined;
      const toInstall: InstalledTool[] = [hlsInstalled, cabalInstalled, stackInstalled, ghcInstalled].filter(
        (tool) => tool && !tool.installed,
      ) as InstalledTool[];
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
          workspace.getConfiguration('haskell').update('promptBeforeDownloads', false);
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
    const latestToolchainBindir = await ghcup.callGHCup(
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
      const hlsInstalled = await toolInstalled(logger, 'hls', projectHls);
      const ghcInstalled = projectGhc ? await toolInstalled(logger, 'ghc', projectGhc) : undefined;
      const toInstall: InstalledTool[] = [hlsInstalled, ghcInstalled].filter(
        (tool) => tool && !tool.installed,
      ) as InstalledTool[];
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
          workspace.getConfiguration('haskell').update('promptBeforeDownloads', false);
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
    const hlsBinDir = await ghcup.callGHCup(
      logger,
      [
        'run',
        ...['--hls', projectHls],
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

    return {
      binaryDirectory: hlsBinDir,
      location: path.join(hlsBinDir, `haskell-language-server-wrapper${exeExt}`),
      tag: 'ghcup',
    };
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
    workspace.getConfiguration('haskell').update('manageHLS', howToManage, ConfigurationTarget.Global);
    context.globalState.update('pluginInitialized', true);
    return howToManage;
  } else {
    return manageHlsSetting;
  }
}

async function getLatestProjectHLS(
  context: ExtensionContext,
  logger: Logger,
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
  const metadataMap = (await getHlsMetadata(context, logger)) || new Map<string, string[]>();
  // then we get supported GHC versions from currently installed HLS versions
  const ghcupMap = (await findAvailableHlsBinariesFromGHCup(logger)) || new Map<string, string[]>();
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
 * @param toolchainBindir Path to the toolchainn bin directory (added to PATH)
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

export function getStoragePath(context: ExtensionContext): string {
  let storagePath: string | undefined = workspace.getConfiguration('haskell').get('releasesDownloadStoragePath');

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
 * @param context
 * @param logger
 * @returns
 */

async function findAvailableHlsBinariesFromGHCup(logger: Logger): Promise<Map<string, string[]> | null> {
  const hlsVersions = await ghcup.callGHCup(logger, ['list', '-t', 'hls', '-c', 'installed', '-r'], undefined, false);

  const bindir = await ghcup.callGHCup(logger, ['whereis', 'bindir'], undefined, false);

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

async function toolInstalled(logger: Logger, tool: Tool, version: string): Promise<InstalledTool> {
  const b = await ghcup
    .callGHCup(logger, ['whereis', tool, version], undefined, false)
    .then(() => true)
    .catch(() => false);
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
async function getHlsMetadata(context: ExtensionContext, logger: Logger): Promise<Map<string, string[]> | null> {
  const storagePath: string = getStoragePath(context);
  const metadata = await getReleaseMetadata(storagePath, logger).catch(() => null);
  if (!metadata) {
    window.showErrorMessage('Could not get release metadata');
    return null;
  }
  const plat: Platform | null = match(process.platform)
    .with('darwin', () => 'Darwin' as Platform)
    .with('linux', () => 'Linux_UnknownLinux' as Platform)
    .with('win32', () => 'Windows' as Platform)
    .with('freebsd', () => 'FreeBSD' as Platform)
    .otherwise(() => null);
  if (plat === null) {
    throw new Error(`Unknown platform ${process.platform}`);
  }
  const arch: Arch | null = match(process.arch)
    .with('arm', () => 'A_ARM' as Arch)
    .with('arm64', () => 'A_ARM64' as Arch)
    .with('ia32', () => 'A_32' as Arch)
    .with('x64', () => 'A_64' as Arch)
    .otherwise(() => null);
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
  logger: Logger,
): Map<string, string[]> {
  logger.info(`Platform constants: ${platform}, ${arch}`);
  const newMap = new Map<string, string[]>();
  metadata.forEach((supportedArch, hlsVersion) => {
    const supportedOs = supportedArch.get(arch);
    if (supportedOs) {
      const ghcSupportedOnOs = supportedOs.get(platform);
      if (ghcSupportedOnOs) {
        logger.log(`HLS ${hlsVersion} compatible with GHC Versions: ${ghcSupportedOnOs.join(',')}`);
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
 * @param storagePath Path to put in binary files and caches.
 * @param logger Logger for feedback.
 * @returns Metadata of releases, or null if the cache can not be found.
 */
async function getReleaseMetadata(storagePath: string, logger: Logger): Promise<ReleaseMetadata | null> {
  const releasesUrl = workspace.getConfiguration('haskell').releasesURL
    ? new URL(workspace.getConfiguration('haskell').releasesURL as string)
    : undefined;
  const opts: https.RequestOptions = releasesUrl
    ? {
        host: releasesUrl.host,
        path: releasesUrl.pathname,
      }
    : {
        host: 'raw.githubusercontent.com',
        path: '/haskell/ghcup-metadata/master/hls-metadata-0.0.1.json',
      };

  const offlineCache = path.join(storagePath, 'ghcupReleases.cache.json');

  /**
   * Convert a json value to ReleaseMetadata.
   * Assumes the json is well-formed and a valid Release-Metadata.
   * @param obj Release Metadata without any typing information but well-formed.
   * @returns Typed ReleaseMetadata.
   */
  const objectToMetadata = (someObj: any): ReleaseMetadata => {
    const obj = someObj as [string: [string: [string: string[]]]];
    const hlsMetaEntries = Object.entries(obj).map(([hlsVersion, archMap]) => {
      const archMetaEntries = Object.entries(archMap).map(([arch, supportedGhcVersionsPerOs]) => {
        return [arch, new Map(Object.entries(supportedGhcVersionsPerOs))] as [string, Map<string, string[]>];
      });
      return [hlsVersion, new Map(archMetaEntries)] as [string, Map<string, Map<string, string[]>>];
    });
    return new Map(hlsMetaEntries);
  };

  async function readCachedReleaseData(): Promise<ReleaseMetadata | null> {
    try {
      logger.info(`Reading cached release data at ${offlineCache}`);
      const cachedInfo = await promisify(fs.readFile)(offlineCache, { encoding: 'utf-8' });
      // export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;
      const value: any = JSON.parse(cachedInfo);
      return objectToMetadata(value);
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
    return objectToMetadata(releaseInfoParsed);
  } catch (githubError: any) {
    // Attempt to read from the latest cached file
    try {
      const cachedInfoParsed = await readCachedReleaseData();

      window.showWarningMessage(
        "Couldn't get the latest haskell-language-server releases from GitHub, used local cache instead: " +
          githubError.message,
      );
      return cachedInfoParsed;
    } catch (_fileError) {
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
  public constructor(
    readonly name: string,
    readonly version: string,
    readonly installed: boolean = true,
  ) {
    this.nameWithVersion = `${name}-${version}`;
  }
}
