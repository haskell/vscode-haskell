import * as path from 'path';
import * as os from 'os';
import * as process from 'process';
import { WorkspaceFolder } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { MissingToolError } from './errors';
import { resolvePathPlaceHolders, executableExists, callAsync, ProcessCallback, IEnvVars } from './utils';
import { match } from 'ts-pattern';

export type Tool = 'hls' | 'ghc' | 'cabal' | 'stack';

export type ToolConfig = Map<Tool, string | null>;

export function initDefaultGHCup(config: GHCupConfig, logger: Logger, folder?: WorkspaceFolder): GHCup {
  const ghcupLoc = findGHCup(logger, config.executablePath, folder);
  return new GHCup(logger, ghcupLoc, config, {
    // omit colourful output because the logs are uglier
    NO_COLOR: '1',
  });
}

export type GHCupConfig = {
  metadataUrl?: string;
  upgradeGHCup: boolean;
  executablePath?: string;
};

export type ToolInfo = {
  tool: Tool;
  version: string;
  tags: string[];
};

export class GHCup {
  constructor(
    readonly logger: Logger,
    readonly location: string,
    readonly config: GHCupConfig,
    readonly environment: IEnvVars,
  ) {}

  /**
   * Most generic way to run the `ghcup` binary.
   * @param args Arguments to run the `ghcup` binary with.
   * @param title Displayed to the user for long-running tasks.
   * @param cancellable Whether this invocation can be cancelled by the user.
   * @param callback Handle success or failures.
   * @returns The output of the `ghcup` invocation. If no {@link callback} is given, this is the stdout. Otherwise, whatever {@link callback} produces.
   */
  public async call(
    args: string[],
    title?: string,
    cancellable?: boolean,
    callback?: ProcessCallback,
  ): Promise<string> {
    const metadataUrl = this.config.metadataUrl; // ;
    return await callAsync(
      this.location,
      ['--no-verbose'].concat(metadataUrl ? ['-s', metadataUrl] : []).concat(args),
      this.logger,
      undefined,
      title,
      cancellable,
      this.environment,
      callback,
    );
  }

  /**
   * Upgrade the `ghcup` binary unless this option was disabled by the user.
   */
  public async upgrade(): Promise<void> {
    const upgrade = this.config.upgradeGHCup;
    if (upgrade) {
      await this.call(['upgrade'], 'Upgrading ghcup', true);
    }
  }

  /**
   * Find the `set` version of a {@link Tool} in GHCup.
   * If no version is set, return null.
   * @param tool Tool you want to know the latest version of.
   * @returns The latest installed or generally available version of the {@link tool}
   */
  public async getSetVersion(tool: Tool): Promise<ToolInfo | null> {
    // these might be custom/stray/compiled, so we try first
    const installedVersions = await this.listTool(tool, 'set');
    const latestInstalled = installedVersions.pop();
    if (latestInstalled) {
      return latestInstalled;
    } else {
      return null;
    }
  }

  /**
   * Find the latest version of a {@link Tool} that we can find in GHCup.
   * Prefer already installed versions, but fall back to all available versions, if there aren't any.
   * @param tool Tool you want to know the latest version of.
   * @returns The latest installed or generally available version of the {@link tool}
   */
  public async getAnyLatestVersion(tool: Tool): Promise<ToolInfo | null> {
    // these might be custom/stray/compiled, so we try first
    const installedVersions = await this.listTool(tool, 'installed');
    const latestInstalled = installedVersions.pop();
    if (latestInstalled) {
      return latestInstalled;
    } else {
      return this.getLatestAvailableVersion(tool);
    }
  }

  /**
   * Find the latest available version that we can find in GHCup with a certain {@link tag}.
   * Corresponds to the `ghcup list -t <tool> -c available -r` command.
   * The tag can be used to further filter the list of versions, for example you can provide
   * @param tool Tool you want to know the latest version of.
   * @param tag The tag to filter the available versions with. By default `"latest"`.
   * @returns The latest available version filtered by {@link tag}.
   */
  public async getLatestAvailableVersion(tool: Tool, tag: string = 'latest'): Promise<ToolInfo> {
    // fall back to installable versions
    const availableVersions = await this.listTool(tool, 'available');

    let latestAvailable: ToolInfo | null = null;
    availableVersions.forEach((toolInfo) => {
      if (toolInfo.tags.includes(tag)) {
        latestAvailable = toolInfo;
      }
    });
    if (!latestAvailable) {
      throw new Error(`Unable to find ${tag} tool ${tool}`);
    } else {
      return latestAvailable;
    }
  }

  private async listTool(tool: Tool, category: string): Promise<ToolInfo[]> {
    // fall back to installable versions
    const availableVersions = await this.call(['list', '-t', tool, '-c', category, '-r'], undefined, false).then((s) =>
      s.split(/\r?\n/),
    );

    return availableVersions.map((toolString) => {
      const toolParts = toolString.split(/\s+/);
      return {
        tool: tool,
        version: toolParts[1],
        tags: toolParts[2]?.split(',') ?? [],
      };
    });
  }

  public async findLatestUserInstalledTool(tool: Tool): Promise<ToolInfo> {
    let toolInfo = null;
    toolInfo = await this.getSetVersion(tool);
    if (toolInfo) return toolInfo;
    toolInfo = await this.getAnyLatestVersion(tool);
    if (toolInfo) return toolInfo;
    throw new Error(`Unable to find a version for tool ${tool}`);
  }
}

function findGHCup(logger: Logger, exePath?: string, folder?: WorkspaceFolder): string {
  logger.info('Checking for ghcup installation');
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
