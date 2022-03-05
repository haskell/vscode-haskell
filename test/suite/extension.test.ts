// tslint:disable: no-console
import * as assert from 'assert';
import * as fs from 'fs';
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

function getWorkspaceRoot(): vscode.WorkspaceFolder {
  return vscode.workspace.workspaceFolders![0];
}

function getWorkspaceFile(name: string): vscode.Uri {
  const wsroot = getWorkspaceRoot().uri;
  return wsroot.with({ path: path.posix.join(wsroot.path, name) });
}

function joinUri(root: vscode.Uri, ...pathSegments: string[]): vscode.Uri {
  return root.with({ path: path.posix.join(root.path, ...pathSegments) });
}

async function deleteWorkspaceFiles(keepDirs: vscode.Uri[], pred?: (fileName: string) => boolean): Promise<void> {
  await deleteFiles(getWorkspaceRoot().uri, keepDirs, pred);
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
        const isEmptyNow = await vscode.workspace.fs.readDirectory(subDirectory)
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

const ghcupBaseDir = `bin/${process.platform === 'win32' ? 'ghcup' : '.ghcup'}`;

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
    await deleteWorkspaceFiles(
      [ joinUri(getWorkspaceRoot().uri, '.vscode')
      , joinUri(getWorkspaceRoot().uri, 'bin', process.platform === 'win32' ? 'ghcup' : '.ghcup', 'cache')
      ]
    );
    await getHaskellConfig().update('logFile', 'hls.log');
    await getHaskellConfig().update('trace.server', 'messages');
    await getHaskellConfig().update('releasesDownloadStoragePath', path.normalize(getWorkspaceFile('bin').fsPath));
    await getHaskellConfig().update('serverEnvironment', {
      XDG_CACHE_HOME: path.normalize(getWorkspaceFile('cache-test').fsPath),
    });
    const contents = new TextEncoder().encode('main = putStrLn "hi vscode tests"');
    await vscode.workspace.fs.writeFile(getWorkspaceFile('Main.hs'), contents);

    const pred = (uri: vscode.Uri) => !['download', 'gz', 'zip'].includes(path.extname(uri.fsPath));
    // const exeExt = os.platform.toString() === 'win32' ? '.exe' : '';
    // Setting up watchers before actual tests start, to ensure we will got the created event
    filesCreated.set('wrapper', existsWorkspaceFile(`${ghcupBaseDir}/bin/haskell-language-server-wrapper*`, pred));
    filesCreated.set('server', existsWorkspaceFile(`${ghcupBaseDir}/bin/haskell-language-server-[1-9]*`, pred));
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
    assert.ok(await withTimeout(90, filesCreated.get('log')!), 'Extension log not created in 30 seconds');
  });

  test('HLS executables should be downloaded', async () => {
    await delay(30);
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    console.log('Testing wrapper');
    assert.ok(
      await withTimeout(90, filesCreated.get('wrapper')!),
      'The wrapper executable was not downloaded in 90 seconds'
    );
    console.log('Testing server');
    assert.ok(
      await withTimeout(90, filesCreated.get('server')!),
      'The server executable was not downloaded in 90 seconds'
    );
  });

  test('Extension log should have server output', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    await delay(90);
    const logContents = getExtensionLogContent();
    assert.ok(logContents, 'Extension log file does not exist');
    assert.match(logContents, /INFO hls:\s+Registering ide configuration/, 'Extension log file has no hls output');
  });

  test('Server should inherit environment variables defined in the settings', async () => {
    await vscode.workspace.openTextDocument(getWorkspaceFile('Main.hs'));
    assert.ok(
      await withTimeout(90, filesCreated.get('cache')!),
      'Server did not inherit XDG_CACHE_DIR from environment variables set in the settings'
    );
  });

  suiteTeardown(async () => {
    const binDir = await vscode.workspace.fs.readDirectory(joinUri(getWorkspaceRoot().uri, 'bin', process.platform === 'win32' ? 'ghcup' : '.ghcup', 'bin'));
    console.log(`bin dir before deleting: ${binDir}`);
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
    await deleteWorkspaceFiles([], (name) => !name.includes('.log'));
  });
});
