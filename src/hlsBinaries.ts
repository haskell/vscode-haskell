import * as child_process from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';
import { promisify } from 'util';
import { env, ExtensionContext, ProgressLocation, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { downloadFile, executableExists, httpsGetSilently } from './utils';
import * as validate from './validation';

/** GitHub API release */
interface IRelease {
  assets: IAsset[];
  tag_name: string;
  prerelease: boolean;
}
/** GitHub API asset */
interface IAsset {
  browser_download_url: string;
  name: string;
}

type UpdateBehaviour = 'keep-up-to-date' | 'prompt' | 'never-check';

const assetValidator: validate.Validator<IAsset> = validate.object({
  browser_download_url: validate.string(),
  name: validate.string(),
});

const releaseValidator: validate.Validator<IRelease> = validate.object({
  assets: validate.array(assetValidator),
  tag_name: validate.string(),
  prerelease: validate.boolean(),
});

const githubReleaseApiValidator: validate.Validator<IRelease[]> = validate.array(releaseValidator);

const cachedReleaseValidator: validate.Validator<IRelease | null> = validate.optional(releaseValidator);

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
        return process.platform === 'win32'
          ? Uri.parse('https://www.haskell.org/platform/index.html#windows')
          : Uri.parse('https://www.haskell.org/ghcup/');
      default:
        return null;
    }
  }
}

// tslint:disable-next-line: max-classes-per-file
class NoBinariesError extends Error {
  constructor(hlsVersion: string, ghcVersion?: string) {
    const supportedReleasesLink =
      '[See the list of supported versions here](https://github.com/haskell/vscode-haskell#supported-ghc-versions)';
    if (ghcVersion) {
      super(`haskell-language-server ${hlsVersion} for GHC ${ghcVersion} is not available on ${os.type()}.
      ${supportedReleasesLink}`);
    } else {
      super(`haskell-language-server ${hlsVersion} is not available on ${os.type()}.
      ${supportedReleasesLink}`);
    }
  }
}

/** Works out what the project's ghc version is, downloading haskell-language-server-wrapper
 * if needed. Returns null if there was an error in either downloading the wrapper or
 * in working out the ghc version
 */
async function getProjectGhcVersion(
  context: ExtensionContext,
  logger: Logger,
  dir: string,
  release: IRelease
): Promise<string> {
  const title: string = 'Working out the project GHC version. This might take a while...';
  logger.info(title);
  const callWrapper = (wrapper: string) => {
    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `${title}`,
        cancellable: true,
      },
      async (progress, token) => {
        return new Promise<string>((resolve, reject) => {
          const args = ['--project-ghc-version'];
          const command: string = wrapper + ' ' + args.join(' ');
          logger.info(`Executing '${command}' in cwd '${dir}' to get the project or file ghc version`);
          token.onCancellationRequested(() => {
            logger.warn(`User canceled the execution of '${command}'`);
          });
          // Need to set the encoding to 'utf8' in order to get back a string
          // We execute the command in a shell for windows, to allow use .cmd or .bat scripts
          const childProcess = child_process
            .execFile(
              wrapper,
              args,
              { encoding: 'utf8', cwd: dir, shell: getGithubOS() === 'Windows' },
              (err, stdout, stderr) => {
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
          token.onCancellationRequested((_) => childProcess.kill());
        });
      }
    );
  };

  const localWrapper = ['haskell-language-server-wrapper'].find(executableExists);
  if (localWrapper) {
    return callWrapper(localWrapper);
  }

  // Otherwise search to see if we previously downloaded the wrapper

  const wrapperName = `haskell-language-server-wrapper-${release.tag_name}-${process.platform}${exeExt}`;
  const downloadedWrapper = path.join(context.globalStoragePath, wrapperName);

  if (executableExists(downloadedWrapper)) {
    return callWrapper(downloadedWrapper);
  }

  // Otherwise download the wrapper

  const githubOS = getGithubOS();
  if (githubOS === null) {
    // Don't have any binaries available for this platform
    throw new NoBinariesError(release.tag_name);
  }

  const assetName = `haskell-language-server-wrapper-${githubOS}${exeExt}`;
  const wrapperAsset = release.assets.find((x) => x.name.startsWith(assetName));

  if (!wrapperAsset) {
    throw new NoBinariesError(release.tag_name);
  }

  await downloadFile(
    'Downloading haskell-language-server-wrapper',
    wrapperAsset.browser_download_url,
    downloadedWrapper
  );

  return callWrapper(downloadedWrapper);
}

async function getLatestReleaseMetadata(context: ExtensionContext): Promise<IRelease | null> {
  const releasesUrl = workspace.getConfiguration('haskell').releasesURL
    ? url.parse(workspace.getConfiguration('haskell').releasesURL)
    : undefined;
  const opts: https.RequestOptions = releasesUrl
    ? {
        host: releasesUrl.host,
        path: releasesUrl.path,
      }
    : {
        host: 'api.github.com',
        path: '/repos/haskell/haskell-language-server/releases',
      };

  const offlineCache = path.join(context.globalStoragePath, 'latestApprovedRelease.cache.json');

  async function readCachedReleaseData(): Promise<IRelease | null> {
    try {
      const cachedInfo = await promisify(fs.readFile)(offlineCache, { encoding: 'utf-8' });
      return validate.parseAndValidate(cachedInfo, cachedReleaseValidator);
    } catch (err) {
      // If file doesn't exist, return null, otherwise consider it a failure
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
  // Not all users want to upgrade right away, in that case prompt
  const updateBehaviour = workspace.getConfiguration('haskell').get('updateBehavior') as UpdateBehaviour;

  if (updateBehaviour === 'never-check') {
    return readCachedReleaseData();
  }

  try {
    const releaseInfo = await httpsGetSilently(opts);
    const latestInfoParsed =
      validate.parseAndValidate(releaseInfo, githubReleaseApiValidator).find((x) => !x.prerelease) || null;

    if (updateBehaviour === 'prompt') {
      const cachedInfoParsed = await readCachedReleaseData();

      if (
        latestInfoParsed !== null &&
        (cachedInfoParsed === null || latestInfoParsed.tag_name !== cachedInfoParsed.tag_name)
      ) {
        const promptMessage =
          cachedInfoParsed === null
            ? 'No version of the haskell-language-server is installed, would you like to install it now?'
            : 'A new version of the haskell-language-server is available, would you like to upgrade now?';

        const decision = await window.showInformationMessage(promptMessage, 'Download', 'Nevermind');
        if (decision !== 'Download') {
          // If not upgrade, bail and don't overwrite cached version information
          return cachedInfoParsed;
        }
      }
    }

    // Cache the latest successfully fetched release information
    await promisify(fs.writeFile)(offlineCache, JSON.stringify(latestInfoParsed), { encoding: 'utf-8' });
    return latestInfoParsed;
  } catch (githubError) {
    // Attempt to read from the latest cached file
    try {
      const cachedInfoParsed = await readCachedReleaseData();

      window.showWarningMessage(
        `Couldn't get the latest haskell-language-server releases from GitHub, used local cache instead:\n${githubError.message}`
      );
      return cachedInfoParsed;
    } catch (fileError) {
      throw new Error(`Couldn't get the latest haskell-language-server releases from GitHub:\n${githubError.message}`);
    }
  }
}
/**
 * Downloads the latest haskell-language-server binaries from GitHub releases.
 * Returns null if it can't find any that match.
 */
export async function downloadHaskellLanguageServer(
  context: ExtensionContext,
  logger: Logger,
  resource: Uri,
  folder?: WorkspaceFolder
): Promise<string | null> {
  // Make sure to create this before getProjectGhcVersion
  logger.info('Downloading haskell-language-server');
  if (!fs.existsSync(context.globalStoragePath)) {
    fs.mkdirSync(context.globalStoragePath);
  }

  const githubOS = getGithubOS();
  if (githubOS === null) {
    // Don't have any binaries available for this platform
    window.showErrorMessage(`Couldn't find any pre-built haskell-language-server binaries for ${process.platform}`);
    return null;
  }

  logger.info('Fetching the latest release from GitHub or from cache');
  const release = await getLatestReleaseMetadata(context);
  if (!release) {
    let message = "Couldn't find any pre-built haskell-language-server binaries";
    const updateBehaviour = workspace.getConfiguration('haskell').get('updateBehavior') as UpdateBehaviour;
    if (updateBehaviour === 'never-check') {
      message += ' (and checking for newer versions is disabled)';
    }
    window.showErrorMessage(message);
    return null;
  }
  logger.info(`The latest release is ${release.tag_name}`);
  logger.info('Figure out the ghc version to use or advertise an installation link for missing components');
  const dir: string = folder?.uri?.fsPath ?? path.dirname(resource.fsPath);
  let ghcVersion: string;
  try {
    ghcVersion = await getProjectGhcVersion(context, logger, dir, release);
  } catch (error) {
    if (error instanceof MissingToolError) {
      const link = error.installLink();
      if (link) {
        if (await window.showErrorMessage(error.message, `Install ${error.tool}`)) {
          env.openExternal(link);
        }
      } else {
        await window.showErrorMessage(error.message);
      }
    } else if (error instanceof NoBinariesError) {
      window.showInformationMessage(error.message);
    } else {
      // We couldn't figure out the right ghc version to download
      window.showErrorMessage(`Couldn't figure out what GHC version the project is using:\n${error.message}`);
    }
    return null;
  }

  // When searching for binaries, use startsWith because the compression may differ
  // between .zip and .gz
  const assetName = `haskell-language-server-${githubOS}-${ghcVersion}${exeExt}`;
  logger.info(`Search for binary ${assetName} in release assests`);
  const asset = release?.assets.find((x) => x.name.startsWith(assetName));
  if (!asset) {
    logger.error(
      `No binary ${assetName} found in the release assets: ${release?.assets.map((value) => value.name).join(',')}`
    );
    window.showInformationMessage(new NoBinariesError(release.tag_name, ghcVersion).message);
    return null;
  }

  const serverName = `haskell-language-server-${release.tag_name}-${process.platform}-${ghcVersion}${exeExt}`;
  const binaryDest = path.join(context.globalStoragePath, serverName);

  const title = `Downloading haskell-language-server ${release.tag_name} for GHC ${ghcVersion}`;
  logger.info(title);
  await downloadFile(title, asset.browser_download_url, binaryDest);
  if (ghcVersion.startsWith('9.')) {
    const warning =
      'Currently, HLS supports GHC 9 only partially. ' +
      'See [issue #297](https://github.com/haskell/haskell-language-server/issues/297) for more detail.';
    logger.warn(warning);
    window.showWarningMessage(warning);
  }
  return binaryDest;
}

/** Get the OS label used by GitHub for the current platform */
function getGithubOS(): string | null {
  function platformToGithubOS(x: string): string | null {
    switch (x) {
      case 'darwin':
        return 'macOS';
      case 'linux':
        return 'Linux';
      case 'win32':
        return 'Windows';
      default:
        return null;
    }
  }

  return platformToGithubOS(process.platform);
}
