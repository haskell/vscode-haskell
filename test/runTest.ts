// tslint:disable: no-console
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

function installExtension(vscodeExePath: string, extId: string) {
  const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExePath);
  cp.spawnSync(cliPath, ['--install-extension', extId], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}

function showDirContens(dir: string) {
  console.log(dir);
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach((file: fs.Dirent) => {
    const absPath = path.resolve(dir, file.name);
    if (file.isDirectory()) {
      showDirContens(absPath);
    }
  });
}

async function main() {
  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');

    // We have to install this dependant extension
    installExtension(vscodeExecutablePath, 'justusadam.language-haskell');

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    const testWorkspace = path.resolve(__dirname, '../../test-workspace');

    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace);
    }

    // Download VS Code, unzip it and run the integration test
    const exitCode = await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testWorkspace],
    });

    console.log('Test workspace contents: ');
    showDirContens(testWorkspace);
    if (exitCode === 0) {
      console.log(`Tests were succesfull, deleting test workspace in ${testWorkspace}`)
      fs.rmdirSync(testWorkspace, { recursive: true });
    }
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
