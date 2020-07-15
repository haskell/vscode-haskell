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
export const userAgentHeader = { 'User-Agent': 'vscode-hie-server' };

export async function downloadFile(titleMsg: string, srcUrl: url.UrlWithStringQuery, dest: string): Promise<void> {
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

  const downloadHieTask = window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: titleMsg,
      cancellable: false,
    },
    async (progress) => {
      const p = new Promise<void>((resolve, reject) => {
        const opts: https.RequestOptions = {
          host: srcUrl.host,
          path: srcUrl.path,
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
      await p;
      // Finally rename it to the actual dest
      fs.renameSync(downloadDest, dest);
    }
  );

  try {
    return downloadHieTask;
  } catch (e) {
    fs.unlinkSync(downloadDest);
    throw new Error(`Failed to download ${url.format(srcUrl)}`);
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
