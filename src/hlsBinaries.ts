import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as fs from 'fs';
import { stat } from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import { match } from 'ts-pattern';
import * as url from 'url';
import { promisify } from 'util';
import {
  ConfigurationTarget,
  ExtensionContext,
  ProgressLocation,
  Uri,
  window,
  workspace,
  WorkspaceFolder,
} from 'vscode';
import { Logger } from 'vscode-languageclient';
import {
  addPathToProcessPath,
  executableExists,
  httpsGetSilently,
  IEnvVars,
  resolvePathPlaceHolders,
  resolveServerEnvironmentPATH,
} from './utils';
export { IEnvVars };

export type ReleaseMetadata = Map<string, Map<string, Map<string, string[]>>>;

type ManageHLS = 'GHCup' | 'PATH';
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
  logger: Logger,
  dir?: string,
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
  let newEnv: IEnvVars = await resolveServerEnvironmentPATH(
    workspace.getConfiguration('haskell').get('serverEnvironment') || {}
  );
  newEnv = { ...(process.env as IEnvVars), ...newEnv };
  newEnv = { ...newEnv, ...(envAdd || {}) };
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
        // Need to set the encoding to 'utf8' in order to get back a string
        // We execute the command in a shell for windows, to allow use .cmd or .bat scripts
        const childProcess = child_process
          .execFile(
            process.platform === 'win32' ? `"${binary}"` : binary,
            args,
            { encoding: 'utf8', cwd: dir, shell: process.platform === 'win32', env: newEnv },
            (err, stdout, stderr) => {
              if (callback) {
                callback(err, stdout, stderr, resolve, reject);
              } else {
                if (err) {
                  logger.error(`Error executing '${command}' with error code ${err.code}`);
                  logger.error(`stderr: ${stderr}`);
                  if (stdout) {
                    logger.error(`stdout: ${stdout}`);
                  }
                  reject(Error(`${command} exited with exit code ${err.code}:\n${stdout}\n${stderr}`));
                } else {
                  resolve(stdout?.trim());
                }
              }
            }
          )
          .on('exit', (code, signal) => {
            const msg =
              `Execution of '${command}' terminated with code ${code}` + (signal ? `and signal ${signal}` : '');
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
  const msg =
    'Could not find a HLS binary in PATH! Consider installing HLS via ghcup or change "haskell.manageHLS" in your settings.';
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

  if (workspace.getConfiguration('haskell').get('serverExecutablePath') as string) {
    return findServerExecutable(context, logger, folder);
  }

  const storagePath: string = await getStoragePath(context);

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath);
  }

  if (!manageHLS) {
    // plugin needs initialization
    const promptMessage = 'How do you want the extension to manage/discover HLS and the relevant toolchain?';

    const decision =
      (await window.showInformationMessage(promptMessage, 'automatically via GHCup', 'manually via PATH')) || null;
    if (decision === 'automatically via GHCup') {
      manageHLS = 'GHCup';
    } else if (decision === 'manually via PATH') {
      manageHLS = 'PATH';
    } else {
      window.showWarningMessage(
        "Choosing default PATH method for HLS discovery. You can change this via 'haskell.manageHLS' in the settings."
      );
      manageHLS = 'PATH';
    }
    workspace.getConfiguration('haskell').update('manageHLS', manageHLS, ConfigurationTarget.Global);
  }

  if (manageHLS === 'PATH' || manageHLS === null) {
    return findHLSinPATH(context, logger, folder);
  } else {
    // we manage HLS, make sure ghcup is installed/available
    await upgradeGHCup(context, logger);

    // get a preliminary toolchain for finding the correct project GHC version
    // (we need HLS and cabal/stack and ghc as fallback),
    // later we may install a different toolchain that's more project-specific
    const latestHLS = await getLatestToolFromGHCup(context, logger, 'hls');
    const latestCabal = (workspace.getConfiguration('haskell').get('installCabal') as boolean)
      ? await getLatestToolFromGHCup(context, logger, 'cabal')
      : null;
    const latestStack = (workspace.getConfiguration('haskell').get('installStack') as boolean)
      ? await getLatestToolFromGHCup(context, logger, 'stack')
      : null;
    const recGHC =
      !(await executableExists('ghc')) && (workspace.getConfiguration('haskell').get('installGHC') as boolean)
        ? await getLatestAvailableToolFromGHCup(context, logger, 'ghc', 'recommended')
        : null;

    const latestToolchainBindir = await callGHCup(
      context,
      logger,
      [
        'run',
        '--hls',
        latestHLS,
        ...(latestCabal ? ['--cabal', latestCabal] : []),
        ...(latestStack ? ['--stack', latestStack] : []),
        ...(recGHC ? ['--ghc', 'recommended'] : []),
        '--install',
      ],
      'Installing latest toolchain for bootstrap',
      true,
      (err, stdout, _stderr, resolve, reject) => {
        err ? reject("Couldn't install latest toolchain") : resolve(stdout?.trim());
      }
    );

    // now figure out the project GHC version and the latest supported HLS version
    // we need for it (e.g. this might in fact be a downgrade for old GHCs)
    const [projectHls, projectGhc] = await getLatestProjectHLS(context, logger, workingDir, latestToolchainBindir);

    // now install said version in an isolated symlink directory
    const hlsBinDir = await callGHCup(
      context,
      logger,
      [
        'run',
        '--hls',
        projectHls,
        ...(latestCabal ? ['--cabal', latestCabal] : []),
        ...(latestStack ? ['--stack', latestStack] : []),
        ...((workspace.getConfiguration('haskell').get('installGHC') as boolean) ? ['--ghc', projectGhc] : []),
        '--install',
      ],
      `Installing project specific toolchain: HLS-${projectHls}, GHC-${projectGhc}, cabal-${latestCabal}, stack-${latestStack}`,
      true
    );
    return path.join(hlsBinDir, `haskell-language-server-wrapper${exeExt}`);
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

  if (manageHLS === 'GHCup') {
    const ghcup = await findGHCup(context, logger);
    return await callAsync(
      ghcup,
      ['--no-verbose'].concat(metadataUrl ? ['-s', metadataUrl] : []).concat(args),
      logger,
      undefined,
      title,
      cancellable,
      undefined,
      callback
    );
  } else {
    throw new Error(`Internal error: tried to call ghcup while haskell.manageHLS is set to ${manageHLS}. Aborting!`);
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
    ? await getProjectGHCVersion(toolchainBindir, workingDir, logger)
    : await callAsync(`ghc${exeExt}`, ['--numeric-version'], logger, undefined, undefined, false);
  const noMatchingHLS = `No HLS version was found for supporting GHC ${projectGhc}.`;

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
    throw new Error(noMatchingHLS);
  } else {
    return [latest[0], projectGhc];
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
      const command: string = 'haskell-language-server-wrapper' + ' ' + args.join(' ');
      if (err) {
        logger.error(`Error executing '${command}' with error code ${err.code}`);
        logger.error(`stderr: ${stderr}`);
        if (stdout) {
          logger.error(`stdout: ${stdout}`);
        }
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
  let storagePath: string | undefined = await workspace.getConfiguration('haskell').get('releasesDownloadStoragePath');

  if (!storagePath) {
    storagePath = context.globalStorageUri.fsPath;
  } else {
    storagePath = resolvePathPlaceHolders(storagePath);
  }

  return storagePath;
}

// the tool might be installed or not
async function getLatestToolFromGHCup(context: ExtensionContext, logger: Logger, tool: string): Promise<string> {
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
    const latestInstalledVersion = latestInstalled.split(/\s+/)[1];

    const bin = await callGHCup(context, logger, ['whereis', tool, `${latestInstalledVersion}`], undefined, false);
    const ver = await callAsync(`${bin}`, ['--numeric-version'], logger, undefined, undefined, false);
    if (ver) {
      return ver;
    } else {
      throw new Error(`Could not figure out version of ${bin}`);
    }
  }

  return getLatestAvailableToolFromGHCup(context, logger, tool);
}

async function getLatestAvailableToolFromGHCup(
  context: ExtensionContext,
  logger: Logger,
  tool: string,
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

// complements getLatestHLSfromMetadata, by checking possibly locally compiled
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
async function getHLSesfromMetadata(context: ExtensionContext, logger: Logger): Promise<Map<string, string[]> | null> {
  const storagePath: string = await getStoragePath(context);
  const metadata = await getReleaseMetadata(context, storagePath, logger).catch((e) => null);
  if (!metadata) {
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
    throw new Error(`Unknown platform ${process.platform}`);
  }
  const arch = match(process.arch)
    .with('arm', (_) => 'A_ARM')
    .with('arm64', (_) => 'A_ARM64')
    .with('x32', (_) => 'A_32')
    .with('x64', (_) => 'A_64')
    .otherwise((_) => null);
  if (arch === null) {
    throw new Error(`Unknown architecture ${process.arch}`);
  }

  const map: ReleaseMetadata = new Map(Object.entries(metadata));
  const newMap = new Map<string, string[]>();
  map.forEach((value, key) => {
    const value_ = new Map(Object.entries(value));
    const archValues = new Map(Object.entries(value_.get(arch)));
    const versions: string[] = archValues.get(plat) as string[];
    newMap.set(key, versions);
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
