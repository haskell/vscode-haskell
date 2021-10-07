import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';

function getExtension() {
  return vscode.extensions.getExtension('haskell.haskell');
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function existsWorkspaceFile(fileRelativePath: string) {
  const files = await vscode.workspace.findFiles(`**/${fileRelativePath}`);
  return files.length === 1;
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
    await delay(30 * 1000);
    assert.ok(
      await existsWorkspaceFile(`/bin/haskell-language-server-wrapper${exeExt}`),
      'The wrapper executable was not downloaded in 15 seconds'
    );
    await delay(30 * 1000);
    assert.ok(
      await existsWorkspaceFile(`/bin/haskell-language-server${exeExt}`),
      'The server executable was not downloaded in 15 seconds'
    );
  });

  test('Server log should be created', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    await delay(5 * 1000);
    assert.ok(await existsWorkspaceFile('hls.log'), 'Server log not created in 5 seconds');
  });

  suiteTeardown(async () => {
    const dirContents = await vscode.workspace.fs.readDirectory(getWorkspaceRoot());
    dirContents.forEach(async ([name, type]) => {
      await vscode.workspace.fs.delete(getWorkspaceFile(name), { recursive: true });
    });
  });
});
