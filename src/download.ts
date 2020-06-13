'use strict';

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { ProgressLocation, window } from 'vscode';

/** When making http requests to github.com, use this header otherwise
 * the server will close the request
 */
export const userAgentHeader = { 'User-Agent': 'vscode-hie-server' };

export async function downloadFile(titleMsg: string, srcUrl: url.UrlWithStringQuery, dest: string): Promise<void> {
  if (fs.existsSync(dest)) {
    return;
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
          const stream = fs.createWriteStream(dest, { mode: 0o744 });
          let curSize = 0;

          function toMB(bytes: number) {
            return bytes / (1024 * 1024);
          }

          res.on('data', (chunk: Buffer) => {
            curSize += chunk.byteLength;
            const msg = `${toMB(curSize).toFixed(1)}MB / ${toMB(totalSize).toFixed(1)}MB`;
            progress.report({ message: msg, increment: (chunk.length / totalSize) * 100 });
          });
          res.on('error', reject);
          res.pipe(stream);
          stream.on('close', resolve);
          // stream.on('end', () => resolve(binaryDest));
        }).on('error', reject);
      });
      return p;
    }
  );

  try {
    return downloadHieTask;
  } catch (e) {
    fs.unlinkSync(dest);
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
