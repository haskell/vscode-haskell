import * as path from 'path';
import * as os from 'os';
import * as process from 'process';
import { workspace, WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { MissingToolError } from './errors';
import { resolvePathPlaceHolders, executableExists, callAsync, ProcessCallback } from './utils';
import { match } from 'ts-pattern';

export type Tool = 'hls' | 'ghc' | 'cabal' | 'stack';

export type ToolConfig = Map<Tool, string>;

export async function callGHCup(
  logger: Logger,
  args: string[],
  title?: string,
  cancellable?: boolean,
  callback?: ProcessCallback,
): Promise<string> {
  const metadataUrl = workspace.getConfiguration('haskell').metadataURL;
  const ghcup = findGHCup(logger);
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
    callback,
  );
}

export async function upgradeGHCup(logger: Logger): Promise<void> {
  const upgrade = workspace.getConfiguration('haskell').get('upgradeGHCup') as boolean;
  if (upgrade) {
    await callGHCup(logger, ['upgrade'], 'Upgrading ghcup', true);
  }
}

export function findGHCup(logger: Logger, folder?: WorkspaceFolder): string {
  logger.info('Checking for ghcup installation');
  let exePath = workspace.getConfiguration('haskell').get('ghcupExecutablePath') as string;
  if (exePath) {
    logger.info(`Trying to find the ghcup executable in: ${exePath}`);
    exePath = resolvePathPlaceHolders(exePath, folder);
    logger.log(`Location after path variables substitution: ${exePath}`);
    if (executableExists(exePath)) {
      return exePath;
    } else {
      throw new Error(`Could not find a ghcup binary at ${exePath}!`);
    }
  } else {
    const localGHCup = ['ghcup'].find(executableExists);
    if (!localGHCup) {
      logger.info(`probing for GHCup binary`);
      const ghcupExe: string | null = match(process.platform)
        .with('win32', () => {
          const ghcupPrefix = process.env.GHCUP_INSTALL_BASE_PREFIX;
          if (ghcupPrefix) {
            return path.join(ghcupPrefix, 'ghcup', 'bin', 'ghcup.exe');
          } else {
            return path.join('C:\\', 'ghcup', 'bin', 'ghcup.exe');
          }
        })
        .otherwise(() => {
          const useXDG = process.env.GHCUP_USE_XDG_DIRS;
          if (useXDG) {
            const xdgBin = process.env.XDG_BIN_HOME;
            if (xdgBin) {
              return path.join(xdgBin, 'ghcup');
            } else {
              return path.join(os.homedir(), '.local', 'bin', 'ghcup');
            }
          } else {
            const ghcupPrefix = process.env.GHCUP_INSTALL_BASE_PREFIX;
            if (ghcupPrefix) {
              return path.join(ghcupPrefix, '.ghcup', 'bin', 'ghcup');
            } else {
              return path.join(os.homedir(), '.ghcup', 'bin', 'ghcup');
            }
          }
        });
      if (ghcupExe !== null && executableExists(ghcupExe)) {
        return ghcupExe;
      } else {
        logger.warn(`ghcup at ${ghcupExe} does not exist`);
        throw new MissingToolError('ghcup');
      }
    } else {
      logger.info(`found ghcup at ${localGHCup}`);
      return localGHCup;
    }
  }
}

// the tool might be installed or not
export async function getLatestToolFromGHCup(logger: Logger, tool: Tool): Promise<string> {
  // these might be custom/stray/compiled, so we try first
  const installedVersions = await callGHCup(logger, ['list', '-t', tool, '-c', 'installed', '-r'], undefined, false);
  const latestInstalled = installedVersions.split(/\r?\n/).pop();
  if (latestInstalled) {
    return latestInstalled.split(/\s+/)[1];
  }

  return getLatestAvailableToolFromGHCup(logger, tool);
}

export async function getLatestAvailableToolFromGHCup(
  logger: Logger,
  tool: Tool,
  tag?: string,
  criteria?: string,
): Promise<string> {
  // fall back to installable versions
  const availableVersions = await callGHCup(
    logger,
    ['list', '-t', tool, '-c', criteria ? criteria : 'available', '-r'],
    undefined,
    false,
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
