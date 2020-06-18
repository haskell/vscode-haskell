'use strict';
import * as os from 'os';
import * as path from 'path';
import {
  commands,
  ExtensionContext,
  OutputChannel,
  TextDocument,
  Uri,
  window,
  workspace,
  WorkspaceFolder,
} from 'vscode';
import {
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient';
import { CommandNames } from './commands/constants';
import { ImportIdentifier } from './commands/importIdentifier';
import { DocsBrowser } from './docsBrowser';
import { downloadServer } from './hlsBinaries';
import { executableExists } from './utils';

const clients: Map<string, LanguageClient> = new Map();

// This is the entrypoint to our extension
export async function activate(context: ExtensionContext) {
  // Register HIE to check every time a text document gets opened, to
  // support multi-root workspaces.

  workspace.onDidOpenTextDocument(async (document: TextDocument) => await activateHie(context, document));
  workspace.textDocuments.forEach(async (document: TextDocument) => await activateHie(context, document));

  // Stop HIE from any workspace folders that are removed.
  workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });

  // Register editor commands for HIE, but only register the commands once at activation.
  const restartCmd = commands.registerCommand(CommandNames.RestartHieCommandName, async () => {
    for (const langClient of clients.values()) {
      await langClient.stop();
      langClient.start();
    }
  });
  context.subscriptions.push(restartCmd);

  context.subscriptions.push(ImportIdentifier.registerCommand());

  // Set up the documentation browser.
  const docsDisposable = DocsBrowser.registerDocsBrowser();
  context.subscriptions.push(docsDisposable);
}

function findManualExecutable(uri: Uri, folder?: WorkspaceFolder): string | null {
  let hieExecutablePath = workspace.getConfiguration('languageServerHaskell', uri).hieExecutablePath;
  if (hieExecutablePath === '') {
    return null;
  }

  // Substitute path variables with their corresponding locations.
  hieExecutablePath = hieExecutablePath
    .replace('${HOME}', os.homedir)
    .replace('${home}', os.homedir)
    .replace(/^~/, os.homedir);
  if (folder) {
    hieExecutablePath = hieExecutablePath
      .replace('${workspaceFolder}', folder.uri.path)
      .replace('${workspaceRoot}', folder.uri.path);
  }

  if (!executableExists(hieExecutablePath)) {
    throw new Error('Manual executable missing');
  }
  return hieExecutablePath;
}

/** Searches the PATH for whatever is set in hieVariant */
function findLocalServer(context: ExtensionContext, uri: Uri, folder?: WorkspaceFolder): string | null {
  const hieVariant = workspace.getConfiguration('languageServerHaskell', uri).hieVariant;

  // Set the executable, based on the settings.
  let exes: string[] = []; // should get set below
  switch (hieVariant) {
    case 'haskell-ide-engine':
      exes = ['hie-wrapper', 'hie'];
      break;
    case 'haskell-language-server':
      exes = ['haskell-language-server-wrapper', 'haskell-language-server'];
      break;
    case 'ghcide':
      exes = ['ghcide'];
      break;
  }

  for (const exe of exes) {
    if (executableExists(exe)) {
      return exe;
    }
  }

  return null;
}

async function activateHie(context: ExtensionContext, document: TextDocument) {
  // We are only interested in Haskell files.
  if (
    (document.languageId !== 'haskell' &&
      document.languageId !== 'cabal' &&
      document.languageId !== 'literate Haskell') ||
    (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')
  ) {
    return;
  }

  const uri = document.uri;
  const folder = workspace.getWorkspaceFolder(uri);

  // If the client already has an LSP server for this folder, then don't start a new one.
  if (folder && clients.has(folder.uri.toString())) {
    return;
  }
  activateHieNoCheck(context, uri, folder);
}

async function activateHieNoCheck(context: ExtensionContext, uri: Uri, folder?: WorkspaceFolder) {
  // Stop right here, if HIE is disabled in the resource/workspace folder.
  const enableHIE = workspace.getConfiguration('languageServerHaskell', uri).enableHIE;
  if (!enableHIE) {
    return;
  }

  const logLevel = workspace.getConfiguration('languageServerHaskell', uri).trace.server;
  const logFile = workspace.getConfiguration('languageServerHaskell', uri).logFile;

  let serverExecutable;
  try {
    serverExecutable =
      findManualExecutable(uri, folder) ??
      findLocalServer(context, uri, folder) ??
      (await downloadServer(context, uri, folder));
    if (serverExecutable === null) {
      showNotInstalledErrorMessage(uri);
      return;
    }
  } catch (e) {
    if (e instanceof Error) {
      window.showErrorMessage(e.message);
    }
    return;
  }

  const runArgs: string[] = ['--lsp'];
  let debugArgs: string[] = ['--lsp'];

  const hieVariant = workspace.getConfiguration('languageServerHaskell', uri).hieVariant;
  // ghcide does not accept -d and -l params
  if (hieVariant !== 'ghcide') {
    if (logLevel === 'messages') {
      debugArgs = debugArgs.concat(['-d']);
    }

    if (logFile !== '') {
      debugArgs = debugArgs.concat(['-l', logFile]);
    }
  }

  // If we're operating on a standalone file (i.e. not in a folder) then we need
  // to launch the server in a reasonable current directory. Otherwise the cradle
  // guessing logic in hie-bios will be wrong!
  const exeOptions: ExecutableOptions = {
    cwd: folder ? undefined : path.dirname(uri.fsPath),
  };

  // If the VS Code extension is launched in debug mode then the debug server
  // options are used, otherwise the run options are used.
  const serverOptions: ServerOptions = {
    run: { command: serverExecutable, transport: TransportKind.stdio, args: runArgs, options: exeOptions },
    debug: { command: serverExecutable, transport: TransportKind.stdio, args: debugArgs, options: exeOptions },
  };

  // Set a unique name per workspace folder (useful for multi-root workspaces).
  const langName = 'Haskell' + (folder ? ` (${folder.name})` : '');
  const outputChannel: OutputChannel = window.createOutputChannel(langName);
  outputChannel.appendLine('[client] run command: "' + serverExecutable + ' ' + runArgs.join(' ') + '"');
  outputChannel.appendLine('[client] debug command: "' + serverExecutable + ' ' + debugArgs.join(' ') + '"');

  outputChannel.appendLine(`[client] server cwd: ${exeOptions.cwd}`);

  const pat = folder ? `${folder.uri.fsPath}/**/*` : '**/*';
  const clientOptions: LanguageClientOptions = {
    // Use the document selector to only notify the LSP on files inside the folder
    // path for the specific workspace.
    documentSelector: [
      { scheme: 'file', language: 'haskell', pattern: pat },
      { scheme: 'file', language: 'literate haskell', pattern: pat },
    ],
    synchronize: {
      // Synchronize the setting section 'languageServerHaskell' to the server.
      configurationSection: 'languageServerHaskell',
    },
    diagnosticCollectionName: langName,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel,
    outputChannelName: langName,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
    },
    // Launch the server in the directory of the workspace folder.
    workspaceFolder: folder,
  };

  // Create the LSP client.
  const langClient = new LanguageClient(langName, langName, serverOptions, clientOptions, true);

  // Register ClientCapabilities for stuff like window/progress
  langClient.registerProposedFeatures();

  // If the client already has an LSP server, then don't start a new one.
  // We check this again, as there may be multiple parallel requests.
  if (folder && clients.has(folder.uri.toString())) {
    return;
  }

  // Finally start the client and add it to the list of clients.
  langClient.start();
  if (folder) {
    clients.set(folder.uri.toString(), langClient);
  } else {
    clients.set(uri.toString(), langClient);
  }
}

/*
 * Deactivate each of the LSP servers.
 */
export function deactivate(): Thenable<void> {
  const promises: Array<Thenable<void>> = [];
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}

function showNotInstalledErrorMessage(uri: Uri) {
  const variant = workspace.getConfiguration('languageServerHaskell', uri).hieVariant;
  let projectUrl = '';
  switch (variant) {
    case 'haskell-ide-engine':
      projectUrl = '/haskell/haskell-ide-engine';
      break;
    case 'haskell-language-server':
      projectUrl = '/haskell/haskell-language-server';
      break;
    case 'ghcide':
      projectUrl = '/digital-asset/ghcide';
      break;
  }
  const notInstalledMsg: string =
    variant + ' executable missing, please make sure it is installed, see https://github.com' + projectUrl + '.';
  window.showErrorMessage(notInstalledMsg);
}
