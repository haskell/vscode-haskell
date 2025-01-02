import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { match } from 'ts-pattern';
import { promisify } from 'util';
import { window, workspace } from 'vscode';
import { Logger } from 'vscode-languageclient';
import { httpsGetSilently, IEnvVars } from './utils';
export { IEnvVars };

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

export type Platform = 'Darwin' | 'Linux_UnknownLinux' | 'Windows' | 'FreeBSD';

export type Arch = 'A_ARM' | 'A_ARM64' | 'A_32' | 'A_64';

/**
 * Compute Map of supported HLS versions for this platform.
 * Fetches HLS metadata information.
 *
 * @param storagePath Path to put in binary files and caches.
 * @param logger Logger for feedback
 * @returns Map of supported HLS versions or null if metadata could not be fetched.
 */
export async function getHlsMetadata(storagePath: string, logger: Logger): Promise<Map<string, string[]> | null> {
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
   * @param someObj Release Metadata without any typing information but well-formed.
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
