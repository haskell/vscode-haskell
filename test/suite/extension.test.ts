// We have the following testing targets:
// 1. Test if the extension is present
// 2. Test if the extension can be activated
// 3. Test if the extension can create the extension log file
// 4. Test if the extension log contains server output (currently we use this to ensure the server is activated successfully)
// 5. Test if the server inherit environment variables defined in the settings

import * as vscode from 'vscode';
import * as assert from 'assert';
import path = require('path');
import * as fs from 'fs';
import { StopServerCommandName } from '../../src/commands/constants';

const LOG = 'hls.log';
const CACHE = 'cache-test';
const BIN = 'bin';
type AllowedKeys = typeof LOG | typeof CACHE;

suite('Extension Test Suite', () => {
  const extension: vscode.Extension<unknown> | undefined = vscode.extensions.getExtension('haskell.haskell');
  const haskellConfig = vscode.workspace.getConfiguration('haskell');

  suiteSetup(async () => {
    await haskellConfig.update('promptBeforeDownloads', false, vscode.ConfigurationTarget.Global);
    await haskellConfig.update('manageHLS', 'GHCup');
    await haskellConfig.update('logFile', LOG);
    await haskellConfig.update('trace.server', 'messages');
    await haskellConfig.update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile(BIN).fsPath));
    await haskellConfig.update('serverEnvironment', {
      XDG_CACHE_HOME: path.normalize(getWorkspaceFile(CACHE).fsPath)
    });

    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);
  });

  test('1. Extension should be present', () => {
    assert.ok(extension);
  });

  test('2. Extension can be activated', async () => {
    assert.ok(await extension?.activate().then(() => true));
  });

  test('3. Extension should create the extension log file', async () => {
    // Open the document to trigger the extension
    vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await runWithIntervalAndTimeout(() => workspaceFileExist(LOG), 1, 30));
  });

  test('4. Extension log should have server output', async () => {
    vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    const checkServerLog = () => {
      const logContents = getExtensionLogContent();
      if (logContents) {
        return logContents.match(/Registering IDE configuration/i) !== null;
      }
      return false;
    };
    assert.ok(await runWithIntervalAndTimeout(checkServerLog, 5, 60),
      'Extension log file has no expected hls output');
  });

  test('5. Server should inherit environment variables defined in the settings', async () => {
    vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await runWithIntervalAndTimeout(() => workspaceFileExist(CACHE), 1, 30),
      'Server did not inherit XDG_CACHE_DIR from environment variables set in the settings');
  });

  suiteTeardown(async () => {
    console.log('Stopping the lsp server');
    await vscode.commands.executeCommand(StopServerCommandName);

    console.log('Contents of the extension log:');
    const logContents = getExtensionLogContent();
    if (logContents) {
      console.log(logContents);
    }
  });
});

//////////////////////////
// Helper functions BEGIN
//////////////////////////

function getWorkspaceRoot(): vscode.WorkspaceFolder {
  const folders = vscode.workspace.workspaceFolders;
  if (folders) {
    return folders[0];
  } else {
    throw Error('workspaceFolders is empty');
  }
}

function getWorkspaceFile(name: string): vscode.Uri {
  const wsroot = getWorkspaceRoot().uri;
  return wsroot.with({ path: path.posix.join(wsroot.path, name) });
}

/**
 * Check if the given file exists in the workspace.
 * @param key The key name
 * @returns `True` if exists, otherwise `False`
 */
function workspaceFileExist(key: AllowedKeys): boolean {
  const folder = getWorkspaceRoot();
  const targetPath = path.join(folder.uri.fsPath, key);

  return fs.existsSync(targetPath);
}

/**
 * Run a function by given interval and timeout.
 * @param fn The function to run, which has the signature `() => boolean`
 * @param interval Interval in seconds
 * @param timeout Interval in seconds
 * @returns `true` if `fn` returns `true` before the `timeout`, otherwise `false`
 */
async function runWithIntervalAndTimeout(fn: () => boolean, interval: number, timeout: number): Promise<boolean> {
  const startTime = Date.now();
  const intervalMs = interval * 1000;
  const timeoutMs = timeout * 1000;
  const endTime = startTime + timeoutMs;
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  while (Date.now() <= endTime) {
    if (fn()) {
      return true;
    }
    await wait(intervalMs);
  }

  return false;
}

function getExtensionLogContent(): string | undefined {
  const extLog = getWorkspaceFile(LOG).fsPath;
  if (fs.existsSync(extLog)) {
    const logContents = fs.readFileSync(extLog);
    return logContents.toString();
  } else {
    console.log(`${extLog} does not exist!`);
    return undefined;
  }
}

//////////////////////////
// Helper functions END
//////////////////////////
