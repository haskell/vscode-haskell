'use strict';

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as url from 'url';
import { ExtensionContext, Uri, window, workspace, WorkspaceFolder } from 'vscode';
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

async function getProjectGhcVersion(context: ExtensionContext, dir: string, release: IRelease): Promise<string | null> {
  const callWrapper = (wrapper: string) => {
    // Need to set the encoding to 'utf8' in order to get back a string
    const out = child_process.spawnSync(wrapper, ['--project-ghc-version'], { encoding: 'utf8', cwd: dir });
    return !out.error ? out.stdout.trim() : null;
  };

  const localWrapper = ['haskell-language-server-wrapper', 'haskell-ide-engine-wrapper'].find(executableExists);
  if (localWrapper) {
    return callWrapper(localWrapper);
  }

  // Otherwise search to see if we previously downloaded the wrapper

  const wrapperName = `haskell-language-server-wrapper-${release.tag_name}-${process.platform}`;
  const downloadedWrapper = path.join(context.globalStoragePath, wrapperName);

  if (executableExists(downloadedWrapper)) {
    return callWrapper(downloadedWrapper);
  }

  // Otherwise download the wrapper

  const githubOS = getGithubOS();
  if (githubOS === null) {
    // Don't have any binaries available for this platform
    window.showErrorMessage(`Couldn't find any haskell-language-server-wrapper binaries for ${process.platform}`);
    return null;
  }

  const assetName = `haskell-language-server-wrapper-${githubOS}.gz`;
  const wrapperAsset = release.assets.find((x) => x.name === assetName);

  if (!wrapperAsset) {
    return null;
  }

  const wrapperUrl = url.parse(wrapperAsset.browser_download_url);
  try {
    await downloadFile('Downloading haskell-language-server-wrapper', wrapperUrl, downloadedWrapper);
  } catch (e) {
    if (e instanceof Error) {
      window.showErrorMessage(e.message);
    }
    return null;
  }

  return callWrapper(downloadedWrapper);
}

/**
 * Downloads the latest haskell-language-server binaries from GitHub releases.
 * Returns null if it can't find any that match.
 */
export async function downloadServer(
  context: ExtensionContext,
  resource: Uri,
  folder?: WorkspaceFolder
): Promise<string | null> {
  // We only download binaries for haskell-language-server at the moment
  if (workspace.getConfiguration('languageServerHaskell', resource).hieVariant !== 'haskell-language-server') {
    return null;
  }

  // Fetch the latest release from GitHub
  const releases: IRelease[] = await new Promise((resolve, reject) => {
    let data: string = '';
    const opts: https.RequestOptions = {
      host: 'api.github.com',
      path: '/repos/bubba/haskell-language-server/releases',
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

  const ghcVersion = await getProjectGhcVersion(context, dir, release);
  if (!ghcVersion) {
    // We couldn't figure out the right ghc version to download
    window.showErrorMessage("Couldn't figure out what GHC version the project is using");
    return null;
  }

  const assetName = `haskell-language-server-${githubOS}-${ghcVersion}.gz`;
  const asset = release?.assets.find((x) => x.name === assetName);
  if (!release || !asset) {
    return null;
  }
  const binaryURL = url.parse(asset.browser_download_url);

  if (!fs.existsSync(context.globalStoragePath)) {
    fs.mkdirSync(context.globalStoragePath);
  }

  const serverName = `haskell-language-server-${release.tag_name}-${process.platform}-${ghcVersion}`;
  const binaryDest = path.join(context.globalStoragePath, serverName);

  if (fs.existsSync(binaryDest)) {
    return binaryDest;
  }

  const title = `Downloading haskell-language-server ${release.tag_name} for GHC ${ghcVersion}`;
  try {
    await downloadFile(title, binaryURL, binaryDest);
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