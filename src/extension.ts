'use strict';
import * as child_process from 'child_process';
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
  WorkspaceFolder
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind
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
  } else if (workspace.getConfiguration('languageServerHaskell', uri).useHieWrapper) {
    hieLaunchScript = 'hie-wrapper.sh';
  }
  // Don't use the .bat launcher, if the user specified a custom wrapper.
  const startupScript = ( process.platform === 'win32' && !useCustomWrapper ) ? 'hie-vscode.bat' : hieLaunchScript;
  const serverPath = useCustomWrapper ? startupScript : context.asAbsolutePath(path.join('.', startupScript));

  // If the extension is launched in debug mode then the debug server options are used,
  // otherwise the run options are used
  const tempDir = ( process.platform === 'win32' ) ? '%TEMP%' : '/tmp';
  const serverOptions: ServerOptions = {
    run: { command: serverPath, transport: TransportKind.stdio, },
    debug: { command: serverPath, transport: TransportKind.stdio, args: ['-d', '-l', path.join(tempDir, 'hie.log')] },
  };

  const langName = 'Haskell HIE (' + folder.name + ')';
  const outputChannel: OutputChannel = window.createOutputChannel(langName);
  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Use the document selector to only notify the LSP on files inside the folder
    // path for the specific workspace.
    documentSelector: [
      { scheme: 'file', language: 'haskell', pattern: `${folder.uri.fsPath}/**/*` },
      { scheme: 'file', language: 'literate haskell', pattern: `${folder.uri.fsPath}/**/*` },
    ],
    synchronize: {
      // Synchronize the setting section 'languageServerHaskell' to the server
      configurationSection: 'languageServerHaskell',
      // Notify the server about file changes to '.clientrc files contain in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc'),
    },
    diagnosticCollectionName: langName,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel,
    outputChannelName: langName,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
    },
    // Set the CWD to the workspace folder.
    workspaceFolder: folder,
  };

  // Create the language client and start the client.
  const langClient = new LanguageClient(langName, langName, serverOptions, clientOptions);

  if (workspace.getConfiguration('languageServerHaskell', uri).showTypeForSelection.onHover) {
    context.subscriptions.push(ShowTypeHover.registerTypeHover(clients));
  }
  if (!hieCommandsRegistered) {
    // Only register the commands once.
    context.subscriptions.push(InsertType.registerCommand(clients));
    ShowTypeCommand.registerCommand(clients).forEach(x => context.subscriptions.push(x));
    registerHiePointCommand('hie.commands.demoteDef', 'hare:demote', context);
    registerHiePointCommand('hie.commans.liftOneLevel', 'hare:liftonelevel', context);
    registerHiePointCommand('hie.commands.liftTopLevel', 'hare:lifttotoplevel', context);
    registerHiePointCommand('hie.commands.deleteDef', 'hare:deletedef', context);
    registerHiePointCommand('hie.commands.genApplicative', 'hare:genapplicative', context);
    hieCommandsRegistered = true;
  }

  // langClient.registerProposedFeatures();
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

async function registerHiePointCommand(name: string,
                                       command: string,
                                       context: ExtensionContext) {
  const editorCmd = commands.registerTextEditorCommand(name, (editor, edit) => {
    const cmd = {
      command,
      arguments: [
        {
          file: editor.document.uri.toString(),
          pos: editor.selections[0].active,
        },
      ],
    };
    // Get the current file and workspace folder.
    const uri = editor.document.uri;
    const folder = workspace.getWorkspaceFolder(uri);
    // If there is a client registered for this workspace, use that client.
    if (clients.has(folder.uri.toString())) {
      const client = clients.get(folder.uri.toString());
      client.sendRequest('workspace/executeCommand', cmd).then(hints => {
        return true;
      }, e => {
        console.error(e);
      });
    }
  });
  context.subscriptions.push(editorCmd);
}
