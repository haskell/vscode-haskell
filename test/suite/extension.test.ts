import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { Disposable } from 'vscode-languageserver-protocol';
import { CommandNames } from '../../src/commands/constants';

function getExtension() {
  return vscode.extensions.getExtension('haskell.haskell');
}

async function delay(ms: number) {
  return new Promise((_, reject) => setTimeout(() => reject(`Timeout of ${ms} ms reached.`), ms));
}

async function withTimeout(seconds: number, f: Promise<any>) {
  return Promise.race([f, delay(seconds * 1000)]);
}

function getHaskellConfig() {
  return vscode.workspace.getConfiguration('haskell');
}

function getWorkspaceRoot() {
  return vscode.workspace.workspaceFolders![0]!.uri;
}

function getWorkspaceFile(name: string) {
  const wsroot = getWorkspaceRoot();
  return wsroot.with({ path: path.posix.join(wsroot.path, name) });
}

const disposables: Disposable[] = [];

async function existsWorkspaceFile(fileRelativePath: string) {
  return new Promise<vscode.Uri>((resolve) => {
    // tslint:disable: no-console
    console.log(`Creating file system watcher for ${fileRelativePath}`);
    const watcher = vscode.workspace.createFileSystemWatcher(`**${fileRelativePath}`).onDidCreate((uri) => {
      console.log(`Created: ${uri}`);
      resolve(uri);
    });
    disposables.push(watcher);
  });
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  suiteSetup(async () => {
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

  test('Server executables should be downloaded', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    const exeExt = os.platform.toString() === 'win32' ? '.exe' : '';
    assert.ok(
      await withTimeout(30, existsWorkspaceFile(`bin/haskell-language-server-wrapper${exeExt}`)),
      'The wrapper executable was not downloaded in 30 seconds'
    );
    assert.ok(
      await withTimeout(60, existsWorkspaceFile(`bin/haskell-language-server${exeExt}`)),
      'The server executable was not downloaded in 30 seconds'
    );
  });

  test('Server log should be created', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await withTimeout(5, existsWorkspaceFile('hls.log')), 'Server log not created in 5 seconds');
  });

  suiteTeardown(async () => {
    disposables.forEach((d) => d.dispose());
    await vscode.commands.executeCommand(CommandNames.StopServerCommandName);
    const dirContents = await vscode.workspace.fs.readDirectory(getWorkspaceRoot());
    // tslint:disable: no-console
    console.log(`Deleting test ws contents: ${dirContents}`);
    dirContents.forEach(async ([name, type]) => {
      const uri: vscode.Uri = getWorkspaceFile(name);
      console.log(`Deleting ${uri}`);
      await vscode.workspace.fs.delete(getWorkspaceFile(name), { recursive: true });
    });
  });
});
