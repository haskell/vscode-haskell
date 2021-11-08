// tslint:disable: no-console
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { CommandNames } from '../../src/commands/constants';

function getExtension() {
  return vscode.extensions.getExtension('haskell.haskell');
}

async function delay(seconds: number) {
  return new Promise((resolve) => setTimeout(() => resolve(false), seconds * 1000));
}

async function withTimeout(seconds: number, f: Promise<any>) {
  return Promise.race([f, delay(seconds)]);
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

async function deleteWorkspaceFiles(pred?: (fileType: [string, vscode.FileType]) => boolean) {
  await deleteFiles(getWorkspaceRoot().uri, pred);
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

async function deleteFiles(dir: vscode.Uri, pred?: (fileType: [string, vscode.FileType]) => boolean) {
  const dirContents = await vscode.workspace.fs.readDirectory(dir);
  console.log(`Deleting ${dir} contents: ${dirContents}`);
  dirContents.forEach(async ([name, type]) => {
    const uri: vscode.Uri = getWorkspaceFile(name);
    if (!pred || pred([name, type])) {
      console.log(`Deleting ${uri}`);
      await vscode.workspace.fs.delete(getWorkspaceFile(name), {
        recursive: true,
        useTrash: false,
      });
    }
  });
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
    await deleteWorkspaceFiles();
    await getHaskellConfig().update('logFile', 'hls.log');
    await getHaskellConfig().update('trace.server', 'messages');
    await getHaskellConfig().update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile('bin').fsPath));
    await getHaskellConfig().update('serverEnvironment', {
      XDG_CACHE_HOME: path.normalize(getWorkspaceFile('cache-test').fsPath),
    });
    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);

    const pred = (uri: vscode.Uri) => !['download', 'gz', 'zip'].includes(path.extname(uri.fsPath));
    const exeExt = os.platform.toString() === 'win32' ? '.exe' : '';
    // Setting up watchers before actual tests start, to ensure we will got the created event
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

  test('Extension should create the extension log file', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(await withTimeout(30, filesCreated.get('log')!), 'Extension log not created in 30 seconds');
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

  test('Extension log should have server output', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    await delay(10);
    const logContents = getExtensionLogContent();
    assert.ok(logContents, 'Extension log file does not exist');
    assert.match(logContents, /INFO hls:\s+Registering ide configuration/, 'Extension log file has no hls output');
  });

  test('Server should inherit environment variables defined in the settings', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(
      await withTimeout(30, filesCreated.get('cache')!),
      'Server did not inherit XDG_CACHE_DIR from environment variables set in the settings'
    );
  });

  suiteTeardown(async () => {
    console.log('Disposing all resources');
    disposables.forEach((d) => d.dispose());
    console.log('Stopping the lsp server');
    await vscode.commands.executeCommand(CommandNames.StopServerCommandName);
    await delay(5);
    console.log('Contents of the extension log:');
    const logContent = getExtensionLogContent();
    if (logContent) {
      console.log(logContent);
    }
    console.log('Deleting test workspace contents');
    await deleteWorkspaceFiles(([name, type]) => !name.includes('.log'));
  });
});
