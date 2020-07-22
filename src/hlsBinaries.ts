import * as child_process from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { env, ExtensionContext, ProgressLocation, Uri, window, WorkspaceFolder } from 'vscode';
import { downloadFile, executableExists, userAgentHeader } from './utils';

/** GitHub API release */
interface IRelease {
  assets: [IAsset];
  tag_name: string;
  prerelease: boolean;
}
/** GitHub API asset */
interface IAsset {
  browser_download_url: string;
  name: string;
}

// On Windows the executable needs to be stored somewhere with an .exe extension
const exeExtension = process.platform === 'win32' ? '.exe' : '';

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

/** Works out what the project's ghc version is, downloading haskell-language-server-wrapper
 * if needed. Returns null if there was an error in either downloading the wrapper or
 * in working out the ghc version
 */
async function getProjectGhcVersion(context: ExtensionContext, dir: string, release: IRelease): Promise<string> {
  const callWrapper = (wrapper: string) => {
    return window.withProgress(
      {
        location: ProgressLocation.Window,
        title: 'Working out the project GHC version',
      },
      async () => {
        // Need to set the encoding to 'utf8' in order to get back a string
        const out = child_process.spawnSync(wrapper, ['--project-ghc-version'], { encoding: 'utf8', cwd: dir });
        if (out.error) {
          throw out.error;
        }
        if (out.status !== 0) {
          const regex = /Cradle requires (.+) but couldn't find it/;
          const res = regex.exec(out.stderr);
          if (res) {
            throw new MissingToolError(res[1]);
          }

          throw Error(
            `${wrapper} --project-ghc-version exited with exit code ${out.status}:\n${out.stdout}\n${out.stderr}`
          );
        }
        return out.stdout.trim();
      }
    );
  };

  const localWrapper = ['haskell-language-server-wrapper'].find(executableExists);
  if (localWrapper) {
    return callWrapper(localWrapper);
  }

  // Otherwise search to see if we previously downloaded the wrapper

  const wrapperName = `haskell-language-server-wrapper-${release.tag_name}-${process.platform}${exeExtension}`;
  const downloadedWrapper = path.join(context.globalStoragePath, wrapperName);

  if (executableExists(downloadedWrapper)) {
    return callWrapper(downloadedWrapper);
  }

  // Otherwise download the wrapper

  const githubOS = getGithubOS();
  if (githubOS === null) {
    // Don't have any binaries available for this platform
    throw Error(`Couldn't find any haskell-language-server-wrapper binaries for ${process.platform}`);
  }

  const assetName = `haskell-language-server-wrapper-${githubOS}${exeExtension}.gz`;
  const wrapperAsset = release.assets.find((x) => x.name === assetName);

  if (!wrapperAsset) {
    throw Error(`Couldn't find any ${assetName} binaries for release ${release.tag_name}`);
  }

  await downloadFile(
    'Downloading haskell-language-server-wrapper',
    wrapperAsset.browser_download_url,
    downloadedWrapper
  );

  return callWrapper(downloadedWrapper);
}

/**
 * Downloads the latest haskell-language-server binaries from GitHub releases.
 * Returns null if it can't find any that match.
 */
export async function downloadHaskellLanguageServer(
  context: ExtensionContext,
  resource: Uri,
  folder?: WorkspaceFolder
): Promise<string | null> {
  // Fetch the latest release from GitHub
  const releases: IRelease[] = await new Promise((resolve, reject) => {
    let data: string = '';
    const opts: https.RequestOptions = {
      host: 'api.github.com',
      path: '/repos/haskell/haskell-language-server/releases',
      headers: userAgentHeader,
    };
    https.get(opts, (res) => {
      res.on('data', (d) => (data += d));
      res.on('error', reject);
      res.on('close', () => {
        resolve(JSON.parse(data));
      });
    });
  });

  // Make sure to create this before getProjectGhcVersion
  if (!fs.existsSync(context.globalStoragePath)) {
    fs.mkdirSync(context.globalStoragePath);
  }

  const githubOS = getGithubOS();
  if (githubOS === null) {
    // Don't have any binaries available for this platform
    window.showErrorMessage(`Couldn't find any pre-built haskell-language-server binaries for ${process.platform}`);
    return null;
  }

  const release = releases.find((x) => !x.prerelease);
  if (!release) {
    window.showErrorMessage("Couldn't find any pre-built haskell-language-server binaries");
    return null;
  }
  const dir: string = folder?.uri?.fsPath ?? path.dirname(resource.fsPath);

  let ghcVersion: string;
  try {
    ghcVersion = await getProjectGhcVersion(context, dir, release);
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
    } else {
      // We couldn't figure out the right ghc version to download
      window.showErrorMessage(`Couldn't figure out what GHC version the project is using:\n${error.message}`);
    }
    return null;
  }

  const assetName = `haskell-language-server-${githubOS}-${ghcVersion}${exeExtension}.gz`;
  const asset = release?.assets.find((x) => x.name === assetName);
  if (!asset) {
    window.showErrorMessage(
      `Couldn't find any pre-built haskell-language-server binaries for ${githubOS} and ${ghcVersion}`
    );
    return null;
  }

  const serverName = `haskell-language-server-${release.tag_name}-${process.platform}-${ghcVersion}${exeExtension}`;
  const binaryDest = path.join(context.globalStoragePath, serverName);

  const title = `Downloading haskell-language-server ${release.tag_name} for GHC ${ghcVersion}`;
  try {
    await downloadFile(title, asset.browser_download_url, binaryDest);
    return binaryDest;
  } catch (e) {
    if (e instanceof Error) {
      window.showErrorMessage(e.message);
    }
    return null;
  }
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
