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

async function deleteWorkspaceFiles() {
  const dirContents = await vscode.workspace.fs.readDirectory(getWorkspaceRoot().uri);
  console.log(`Deleting test ws contents: ${dirContents}`);
  dirContents.forEach(async ([name, type]) => {
    const uri: vscode.Uri = getWorkspaceFile(name);
    console.log(`Deleting ${uri}`);
    await vscode.workspace.fs.delete(getWorkspaceFile(name), { recursive: true });
  });
}

suite('Extension Test Suite', () => {
  const disposables: vscode.Disposable[] = [];

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
    await deleteWorkspaceFiles();
    await getHaskellConfig().update('logFile', 'hls.log');
    await getHaskellConfig().update('trace.server', 'messages');
    await getHaskellConfig().update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile('bin').fsPath));
    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);
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
    const exeExt = os.platform.toString() === 'win32' ? '.exe' : '';
    console.log('Testing wrapper');
    const pred = (uri: vscode.Uri) => !['download', 'gz', 'zip'].includes(path.extname(uri.fsPath));
    assert.ok(
      await withTimeout(30, existsWorkspaceFile(`bin/haskell-language-server-wrapper*${exeExt}`, pred)),
      'The wrapper executable was not downloaded in 30 seconds'
    );
    console.log('Testing server');
    assert.ok(
      await withTimeout(60, existsWorkspaceFile(`bin/haskell-language-server-[1-9]*${exeExt}`, pred)),
      'The server executable was not downloaded in 60 seconds'
    );
  });

  test('Server log should be created', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await withTimeout(30, existsWorkspaceFile('hls.log')), 'Server log not created in 30 seconds');
  });

  suiteTeardown(async () => {
    disposables.forEach((d) => d.dispose());
    await vscode.commands.executeCommand(CommandNames.StopServerCommandName);
    delay(5); // to give time to shutdown server
    await deleteWorkspaceFiles();
  });
});
