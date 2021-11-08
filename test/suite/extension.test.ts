// tslint:disable: no-console
import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { CommandNames } from '../../src/commands/constants';

function getExtension() {
  return vscode.extensions.getExtension('haskell.haskell');
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(false), ms));
}

async function withTimeout(seconds: number, f: Promise<any>) {
  return Promise.race([f, delay(seconds * 1000)]);
}

function getHaskellConfig() {
  return vscode.workspace.getConfiguration('haskell');
}

function getWorkspaceRoot() {
  return vscode.workspace.workspaceFolders![0];
}

function getWorkspaceFile(name: string) {
  const wsroot = getWorkspaceRoot().uri;
  return wsroot.with({ path: path.posix.join(wsroot.path, name) });
}

suite('Extension Test Suite', () => {
  const disposables: vscode.Disposable[] = [];
  const filesCreated: Map<string, Promise<vscode.Uri>> = new Map();

  async function existsWorkspaceFile(pattern: string, pred?: (uri: vscode.Uri) => boolean) {
    const relPath: vscode.RelativePattern = new vscode.RelativePattern(getWorkspaceRoot(), pattern);
    const watcher = vscode.workspace.createFileSystemWatcher(relPath);
    disposables.push(watcher);
    return new Promise<vscode.Uri>((resolve) => {
      watcher.onDidCreate((uri) => {
        console.log(`Created: ${uri}`);
        if (!pred || pred(uri)) {
          resolve(uri);
        }
      });
    });
  }

  vscode.window.showInformationMessage('Start all tests.');

  suiteSetup(async () => {
    await getHaskellConfig().update('logFile', 'hls.log');
    await getHaskellConfig().update('trace.server', 'messages');
    await getHaskellConfig().update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile('bin').fsPath));
    await getHaskellConfig().update('serverEnvironment',
      { XDG_CACHE_HOME: path.normalize(getWorkspaceFile('cache-test').fsPath) });
    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);

    const pred = (uri: vscode.Uri) => !['download', 'gz', 'zip'].includes(path.extname(uri.fsPath));
    const exeExt = os.platform.toString() === 'win32' ? '.exe' : '';
    filesCreated.set('wrapper', existsWorkspaceFile(`bin/haskell-language-server-wrapper*${exeExt}`, pred));
    filesCreated.set('server', existsWorkspaceFile(`bin/haskell-language-server-[1-9]*${exeExt}`, pred));
    filesCreated.set('log', existsWorkspaceFile('hls.log'));
    filesCreated.set('cache', existsWorkspaceFile('cache-test'));
  });

  test('Extension should be present', () => {
    assert.ok(getExtension());
  });

  test('Extension should activate', async () => {
    await getExtension()?.activate();
    assert.ok(true);
  });

  test('HLS executables should be downloaded', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    console.log('Testing wrapper');
    assert.ok(
      await withTimeout(30, filesCreated.get('wrapper')!),
      'The wrapper executable was not downloaded in 30 seconds'
    );
    console.log('Testing server');
    assert.ok(
      await withTimeout(60, filesCreated.get('server')!),
      'The server executable was not downloaded in 60 seconds'
    );
  });

  test('Server log should be created', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await withTimeout(30, filesCreated.get('log')!), 'Server log not created in 30 seconds');
  });

  test('Server should inherit environment variables defined in the settings', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(
      // Folder will have already been created by this point, so it will not trigger watcher in existsWorkspaceFile()
      await withTimeout(30, filesCreated.get('cache')!),
      'Server did not inherit XDG_CACHE_DIR from environment variables set in the settings'
    );
  });

  suiteTeardown(async () => {
    console.log('Disposing all resources')
    disposables.forEach((d) => d.dispose());
    console.log('Stopping the lsp server');
    await vscode.commands.executeCommand(CommandNames.StopServerCommandName);
  });
});
