'use strict';

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { extname } from 'path';
import * as url from 'url';
import { ProgressLocation, window } from 'vscode';
import { createGunzip } from 'zlib';

/** When making http requests to github.com, use this header otherwise
 * the server will close the request
 */
export const userAgentHeader = { 'User-Agent': 'vscode-haskell' };

/** downloadFile may get called twice on the same src and destination:
 * When this happens, we should only download the file once but return two
 * promises that wait on the same download. This map keeps track of which
 * files are currently being downloaded and we short circuit any calls to
 * downloadFile which have a hit in this map by returning the promise stored
 * here.
 * Note that we have to use a double nested map since array/pointer/object
 * equality is by reference, not value in Map. And we are using a tuple of
 * [src, dest] as the key.
 */
const inFlightDownloads = new Map<string, Map<string, Thenable<void>>>();

export async function downloadFile(titleMsg: string, src: string, dest: string): Promise<void> {
  // Check to see if we're already in the process of downloading the same thing
  const inFlightDownload = inFlightDownloads.get(src)?.get(dest);
  if (inFlightDownload) {
    return inFlightDownload;
  }

  // If it already is downloaded just use that
  if (fs.existsSync(dest)) {
    return;
  }

  // Download it to a .tmp location first, then rename it!
  // This way if the download fails halfway through or something then we know
  // to delete it and try again
  const downloadDest = dest + '.download';
  if (fs.existsSync(downloadDest)) {
    fs.unlinkSync(downloadDest);
  }

  const downloadTask = window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: titleMsg,
      cancellable: false,
    },
    async (progress) => {
      const p = new Promise<void>((resolve, reject) => {
        const srcUrl = url.parse(src);
        const opts: https.RequestOptions = {
          host: srcUrl.host,
          path: srcUrl.path,
          protocol: srcUrl.protocol,
          port: srcUrl.port,
          headers: userAgentHeader,
        };
        getWithRedirects(opts, (res) => {
          const totalSize = parseInt(res.headers['content-length'] || '1', 10);
          const fileStream = fs.createWriteStream(downloadDest, { mode: 0o744 });
          let curSize = 0;

          // Decompress it if it's a gzip
          const needsUnzip = res.headers['content-type'] === 'application/gzip' || extname(srcUrl.path ?? '') === '.gz';
          if (needsUnzip) {
            res.pipe(createGunzip()).pipe(fileStream);
          } else {
            res.pipe(fileStream);
          }

          function toMB(bytes: number) {
            return bytes / (1024 * 1024);
          }

          res.on('data', (chunk: Buffer) => {
            curSize += chunk.byteLength;
            const msg = `${toMB(curSize).toFixed(1)}MB / ${toMB(totalSize).toFixed(1)}MB`;
            progress.report({ message: msg, increment: (chunk.length / totalSize) * 100 });
          });
          res.on('error', reject);
          fileStream.on('close', resolve);
        }).on('error', reject);
      });
      try {
        await p;
        // Finally rename it to the actual dest
        fs.renameSync(downloadDest, dest);
      } finally {
        // And remember to remove it from the list of current downloads
        inFlightDownloads.get(src)?.delete(dest);
      }
    }
  );

  try {
    if (inFlightDownloads.has(src)) {
      inFlightDownloads.get(src)?.set(dest, downloadTask);
    } else {
      inFlightDownloads.set(src, new Map([[dest, downloadTask]]));
    }
    return downloadTask;
  } catch (e) {
    fs.unlinkSync(downloadDest);
    throw new Error(`Failed to download ${url}`);
  }
}

function getWithRedirects(opts: https.RequestOptions, f: (res: http.IncomingMessage) => void): http.ClientRequest {
  return https.get(opts, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      if (!res.headers.location) {
        console.error('301/302 without a location header');
        return;
      }
      https.get(res.headers.location, f);
    } else {
      f(res);
    }
  });
}

/*
 * Checks if the executable is on the PATH
 */
export function executableExists(exe: string): boolean {
  const cmd: string = process.platform === 'win32' ? 'where' : 'which';
  const out = child_process.spawnSync(cmd, [exe]);
  return out.status === 0;
}
