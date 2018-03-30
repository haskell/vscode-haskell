'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import * as vscode from 'vscode';

import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import {
  commands,
  ExtensionContext,
  TextDocument,
  Uri,
  window,
  workspace,
  WorkspaceFolder
} from 'vscode';
import {
  CloseAction,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions
} from 'vscode-languageclient';
import { InsertType } from './commands/insertType';
import {
  ShowTypeCommand,
  ShowTypeHover,
} from './commands/showType';
import { DocsBrowser } from './docsBrowser';

let docsBrowserRegistered: boolean = false;
let hieCommandsRegistered: boolean = false;
const clients: Map<string, LanguageClient> = new Map();

/*
 * Sort the workspace folders by length.
 * Taken from https://github.com/Microsoft/vscode-extension-samples/blob/
 * 26bc3537d9817d7def2f349ff2a5e0229bbb6b4a/lsp-multi-server-sample/client/src/extension.ts#L14.
 */
let sortedWorkspaceFolders: string[];
function sortWorkspaceFolders(): string[] {
  if (sortedWorkspaceFolders === void 0) {
    sortedWorkspaceFolders = workspace.workspaceFolders.map(folder => {
      let result = folder.uri.toString();
      if (result.charAt(result.length - 1) !== '/') {
        result = result + '/';
      }
      return result;
    }).sort((a, b) => a.length - b.length);
  }
  return sortedWorkspaceFolders;
}
workspace.onDidChangeWorkspaceFolders(() => sortedWorkspaceFolders = undefined);

/*
 * Extract the outer-most workspace folder.
 * Taken from https://github.com/Microsoft/vscode-extension-samples/blob/
 * 26bc3537d9817d7def2f349ff2a5e0229bbb6b4a/lsp-multi-server-sample/client/src/extension.ts#L32.
 */
function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
  const sorted = sortWorkspaceFolders();
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== '/') {
      uri = uri + '/';
    }
    if (uri.startsWith(element)) {
      return workspace.getWorkspaceFolder(Uri.parse(element));
    }
  }
  return folder;
}

export async function activate(context: ExtensionContext) {
  // Register HIE to check every time a text document gets opened, to
  // support multi-root workspaces.
  workspace.onDidOpenTextDocument((document: TextDocument) => activateHie(context, document));
  workspace.textDocuments.forEach((document: TextDocument) => activateHie(context, document));
  workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder  of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });
}

async function activateHie(context: ExtensionContext, document: TextDocument) {
  // We are only interested in Haskell files.
  if ((document.languageId !== 'haskell'
        && document.languageId !== 'cabal'
        && document.languageId !== 'literate Haskell')
        || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
    return;
  }

  const uri = document.uri;
  const folder = workspace.getWorkspaceFolder(uri);
  // Don't handle files outside of a folder.
  if (!folder) {
    return;
  }
  // In case we have a nested workspace folder, only start the server on the outer-most.
  // folder = getOuterMostWorkspaceFolder(folder);

  // If the client already has an LSP server, then don't start a new one.
  if (clients.has(folder.uri.toString())) {
    return;
  }

  try {
    const useCustomWrapper = workspace.getConfiguration('languageServerHaskell', uri).useCustomHieWrapper;
    // Check if hie is installed.
    if (!await isHieInstalled() && !useCustomWrapper) {
      // TODO: Once haskell-ide-engine is on hackage/stackage, enable an option to install it via cabal/stack.
      const notInstalledMsg: string =
        'hie executable missing, please make sure it is installed, see github.com/haskell/haskell-ide-engine.';
      const forceStart: string = 'Force Start';
      window.showErrorMessage(notInstalledMsg, forceStart).then(option => {
        if (option === forceStart) {
          activateHieNoCheck(context, folder, uri);
        }
      });
    } else {
      activateHieNoCheck(context, folder, uri);
    }
  } catch (e) {
    console.error(e);
  }
}

function activateHieNoCheck(context: ExtensionContext, folder: WorkspaceFolder, uri: Uri) {
  // Set up the documentation browser.
  if (!docsBrowserRegistered) {
    const docsDisposable = DocsBrowser.registerDocsBrowser();
    context.subscriptions.push(docsDisposable);
    docsBrowserRegistered = true;
  }

  let hieLaunchScript = 'hie-vscode.sh';
  const useCustomWrapper = workspace.getConfiguration('languageServerHaskell', uri).useCustomHieWrapper;
  let customWrapperPath = workspace.getConfiguration('languageServerHaskell', uri).useCustomHieWrapperPath;

  // Substitute variables with their corresponding locations.
  if (useCustomWrapper) {
    customWrapperPath = customWrapperPath
      .replace('${workspaceFolder}', folder.uri.path)
      .replace('${workspaceRoot}', folder.uri.path)
      .replace('${HOME}', os.homedir)
      .replace('${home}', os.homedir)
      .replace(/^~/, os.homedir);
  }

  if (useCustomWrapper) {
    hieLaunchScript = customWrapperPath;
  } else if (workspace.getConfiguration('languageServerHaskell').useHieWrapper) {
    hieLaunchScript = 'hie-wrapper.sh';
  }
  // Don't use the .bat launcher, if the user specified a custom wrapper.
  const startupScript = ( process.platform === 'win32' && !useCustomWrapper ) ? 'hie-vscode.bat' : hieLaunchScript;
  const serverPath = useCustomWrapper ? startupScript : context.asAbsolutePath(path.join('.', startupScript));

  // If the extension is launched in debug mode then the debug server options are used,
  // otherwise the run options are used
  const tempDir = ( process.platform === 'win32' ) ? '%TEMP%' : '/tmp';
  const serverOptions: ServerOptions = {
    run : { command: serverPath },
    debug: { command: serverPath, args: ['-d', '-l', path.join(tempDir, 'hie.log')] },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: ['haskell'],
    synchronize: {
      // Synchronize the setting section 'languageServerHaskell' to the server
      configurationSection: 'languageServerHaskell',
      // Notify the server about file changes to '.clientrc files contain in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc'),
    },
    // Set the CWD to the workspace folder
    workspaceFolder: folder,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
  };

  // Create the language client and start the client.
  const langClient = new LanguageClient('Language Server Haskell', serverOptions, clientOptions);

  // Only register the commands once.
  if (!hieCommandsRegistered) {
    context.subscriptions.push(InsertType.registerCommand(langClient));
    ShowTypeCommand.registerCommand(langClient).forEach(x => context.subscriptions.push(x));
    if (workspace.getConfiguration('languageServerHaskell', uri).showTypeForSelection.onHover) {
      context.subscriptions.push(ShowTypeHover.registerTypeHover(langClient));
    }
    registerHiePointCommand(langClient, 'hie.commands.demoteDef', 'hare:demote', context);
    registerHiePointCommand(langClient, 'hie.commands.liftOneLevel', 'hare:liftonelevel', context);
    registerHiePointCommand(langClient, 'hie.commands.liftTopLevel', 'hare:lifttotoplevel', context);
    registerHiePointCommand(langClient, 'hie.commands.deleteDef', 'hare:deletedef', context);
    registerHiePointCommand(langClient, 'hie.commands.genApplicative', 'hare:genapplicative', context);
    hieCommandsRegistered = true;
  }

  langClient.start();
  clients.set(folder.uri.toString(), langClient);
}

/*
 * Deactivate each of the LSP servers..
 */
export function deactivate(): Thenable<void> {
  const promises: Array<Thenable<void>> = [];
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}

async function isHieInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const cmd: string = ( process.platform === 'win32' ) ? 'where hie' : 'which hie';
    child_process.exec(cmd, (error, stdout, stderr) => resolve(!error));
  });
}

async function registerHiePointCommand(langClient: LanguageClient, name: string, command: string,
                                       context: ExtensionContext) {
  const cmd2 = commands.registerTextEditorCommand(name, (editor, edit) => {
    const cmd = {
      command,
      arguments: [
        {
          file: editor.document.uri.toString(),
          pos: editor.selections[0].active,
        },
      ],
    };

    langClient.sendRequest('workspace/executeCommand', cmd).then(hints => {
      return true;
    }, e => {
      console.error(e);
    });
  });
  context.subscriptions.push(cmd2);
}
