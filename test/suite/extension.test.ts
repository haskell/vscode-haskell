// We have the following testing targets:
// 1. Test if the extension is present
// 2. Test if the extension can be activated
// 3. Test if the extension can create the extension log file
// 4. Test if the extension log contains server output (currently we use this to ensure the server is activated successfully)
// 5. Test if the server inherit environment variables defined in the settings (why?)

import * as vscode from 'vscode';
import * as assert from 'assert';
import path = require('path');
import * as fs from 'fs';
import { StopServerCommandName } from '../../src/commands/constants';

suite('Extension Test Suite', () => {
  const extension = vscode.extensions.getExtension('haskell.haskell');
  const haskellConfig = vscode.workspace.getConfiguration('haskell');
  const filesCreated: Map<string, Promise<vscode.Uri>> = new Map();
  const disposables: vscode.Disposable[] = [];

  function getWorkspaceRoot(): vscode.WorkspaceFolder {
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      return folders[0];
    } else {
      throw "workspaceFolders is empty";
    }
  }

  function getWorkspaceFile(name: string): vscode.Uri {
    const wsroot = getWorkspaceRoot().uri;
    return wsroot.with({ path: path.posix.join(wsroot.path, name) });
  }

  async function existsWorkspaceFile(pattern: string) {
    const relPath: vscode.RelativePattern = new vscode.RelativePattern(getWorkspaceRoot(), pattern);
    const watcher = vscode.workspace.createFileSystemWatcher(relPath);
    disposables.push(watcher);
    return new Promise<vscode.Uri>((resolve) => {
      watcher.onDidCreate((uri) => {
        console.log(`Created: ${uri}`);
        resolve(uri);
      });
    });
  }

  function getExtensionLogContent(): string | undefined {
    const extLog = getWorkspaceFile('hls.log').fsPath;
    if (fs.existsSync(extLog)) {
      const logContents = fs.readFileSync(extLog);
      return logContents.toString();
    } else {
      console.log(`${extLog} does not exist!`);
      return undefined;
    }
  }

  async function delay(seconds: number) {
    return new Promise((resolve) => setTimeout(() => resolve(false), seconds * 1000));
  }

  async function withTimeout(seconds: number, f: Promise<vscode.Uri>) {
    return Promise.race([f, delay(seconds)]);
  }

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const retryOperation = (operation: () => Promise<boolean>, delay: number, retries: number) =>
    new Promise((resolve, reject): Promise<void> => {
      return operation()
        .then(resolve)
        .catch((reason) => {
          if (retries > 0) {
            return wait(delay)
              .then(retryOperation.bind(null, operation, delay, retries - 1))
              .then(resolve)
              .catch(reject);
          }
          return reject(reason);
        });
    });

  function joinUri(root: vscode.Uri, ...pathSegments: string[]): vscode.Uri {
    return root.with({ path: path.posix.join(root.path, ...pathSegments) });
  }

  async function deleteWorkspaceFiles(keepDirs: vscode.Uri[], pred?: (fileName: string) => boolean): Promise<void> {
    await deleteFiles(getWorkspaceRoot().uri, keepDirs, pred);
  }

  async function deleteFiles(dir: vscode.Uri, keepDirs: vscode.Uri[], pred?: (fileType: string) => boolean) {
    const dirContents = await vscode.workspace.fs.readDirectory(dir);
    console.log(`Looking at ${dir} contents: ${dirContents}`);
    if (keepDirs.findIndex((val) => val.path === dir.path) !== -1) {
      console.log(`Keeping ${dir}`);
    } else {
      dirContents.forEach(async ([name, type]) => {
        const uri: vscode.Uri = joinUri(dir, name);
        if (type === vscode.FileType.File) {
          if (!pred || pred(name)) {
            console.log(`Deleting ${uri}`);
            await vscode.workspace.fs.delete(joinUri(dir, name), {
              recursive: false,
              useTrash: false,
            });
          }
        } else if (type === vscode.FileType.Directory) {
          const subDirectory = joinUri(dir, name);
          console.log(`Recursing into ${subDirectory}`);
          await deleteFiles(subDirectory, keepDirs, pred);

          // remove directory if it is empty now
          const isEmptyNow = await vscode.workspace.fs
            .readDirectory(subDirectory)
            .then((contents) => Promise.resolve(contents.length === 0));
          if (isEmptyNow) {
            console.log(`Deleting ${subDirectory}`);
            await vscode.workspace.fs.delete(subDirectory, {
              recursive: true,
              useTrash: false,
            });
          }
        }
      });
    }
  }

  suiteSetup(async () => {
    await deleteWorkspaceFiles([
      joinUri(getWorkspaceRoot().uri, '.vscode'),
      joinUri(getWorkspaceRoot().uri, 'bin', process.platform === 'win32' ? 'ghcup' : '.ghcup', 'cache'),
    ]);
    await haskellConfig.update('promptBeforeDownloads', false, vscode.ConfigurationTarget.Global);
    await haskellConfig.update('manageHLS', 'GHCup');
    await haskellConfig.update('logFile', 'hls.log');
    await haskellConfig.update('trace.server', 'messages');
    await haskellConfig.update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile('bin').fsPath));
    await haskellConfig.update('serverEnvironment', {
      XDG_CACHE_HOME: path.normalize(getWorkspaceFile('cache-test').fsPath),
    });

    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);

    filesCreated.set('log', existsWorkspaceFile('hls.log'));
    filesCreated.set('cache', existsWorkspaceFile('cache-test'));
  });

  test('1. Extension should be present', () => {
    assert.ok(extension);
  });

  test('2. Extension can be activated', async () => {
    await extension?.activate();
  });

  test('3. Extension should create the extension log file', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    assert.ok(await withTimeout(30, filesCreated.get('log')!), 'Extension log not created in 30 seconds');
  });

  test('4. Extension log should have server output', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(
      await retryOperation(
        () =>
          new Promise((resolve, reject) => {
            return getExtensionLogContent()?.match(/Registering IDE configuration/) !== null
              ? resolve(true) : reject(false);
          }
          ),
        1000 * 5,
        10
      ),
      'Extension log file has no hls output'
    );
  });

  test('5. Server should inherit environment variables defined in the settings', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(
      await retryOperation(
        () =>
          new Promise((resolve, reject) => {
            return filesCreated.get('cache') ? resolve(true) : reject(false);
          }),
        1000 * 5,
        10
      ),
      'Server did not inherit XDG_CACHE_DIR from environment variables set in the settings'
    );
  });

  suiteTeardown(async () => {
    console.log('Disposing all resources');
    disposables.forEach(d => d.dispose());
    console.log('Stopping the lsp server');
    await vscode.commands.executeCommand(StopServerCommandName);

    console.log('Contents of the extension log:');
    const logContent = getExtensionLogContent();
    if (logContent) {
      console.log(logContent);
    }

    console.log('Deleting test workspace contents');
    await deleteWorkspaceFiles([], (name) => !name.includes('.log'));
  });
});
