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
  window,
  workspace
} from 'vscode';
import {
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

export async function activate(context: ExtensionContext) {
  try {
    const useCustomWrapper = workspace.getConfiguration('languageServerHaskell').useCustomHieWrapper;
    // Check if hie is installed.
    if (!await isHieInstalled() && !useCustomWrapper) {
      // TODO: Once haskell-ide-engine is on hackage/stackage, enable an option to install it via cabal/stack.
      const notInstalledMsg: string =
        'hie executable missing, please make sure it is installed, see github.com/haskell/haskell-ide-engine.';
      const forceStart: string = 'Force Start';
      window.showErrorMessage(notInstalledMsg, forceStart).then(option => {
        if (option === forceStart) {
          activateNoHieCheck(context);
        }
      });
    } else {
      activateNoHieCheck(context);
    }
  } catch (e) {
    console.error(e);
  }
}

function activateNoHieCheck(context: ExtensionContext) {

  const docsDisposable = DocsBrowser.registerDocsBrowser();
  context.subscriptions.push(docsDisposable);

  // const fixer = languages.registerCodeActionsProvider("haskell", fixProvider);
  // context.subscriptions.push(fixer);
  // The server is implemented in node
  // let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
  let hieLaunchScript = 'hie-vscode.sh';

  const useCustomWrapper = workspace.getConfiguration('languageServerHaskell').useCustomHieWrapper;
  let customWrapperPath = workspace.getConfiguration('languageServerHaskell').useCustomHieWrapperPath;

  // Substitute variables with their corresponding locations. If the `workspaceFolders` is
  // undefined, no folders are open.
  if (useCustomWrapper && workspace.workspaceFolders !== undefined) {
    const workspaceFolder = workspace.workspaceFolders[0];
    customWrapperPath = customWrapperPath
      .replace('${workspaceFolder}', workspaceFolder.uri.path)
      .replace('${workspaceRoot}', workspaceFolder.uri.path)
      .replace('${HOME}', os.homedir)
      .replace('${home}', os.homedir)
      .replace('~', os.homedir);
  }

  if (useCustomWrapper) {
    hieLaunchScript = customWrapperPath;
  } else if (workspace.getConfiguration('languageServerHaskell').useHieWrapper) {
    hieLaunchScript = 'hie-wrapper.sh';
  }
  // Don't use the .bat launcher, if the user specified a custom wrapper.
  const startupScript = ( process.platform === 'win32' && !useCustomWrapper ) ? 'hie-vscode.bat' : hieLaunchScript;
  const serverPath = useCustomWrapper ? startupScript : context.asAbsolutePath(path.join('.', startupScript));

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const tempDir = ( process.platform === 'win32' ) ? '%TEMP%' : '/tmp';
  const serverOptions: ServerOptions = {
    // run : { module: serverModule, transport: TransportKind.ipc },
    // debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
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
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
  };

  // Create the language client and start the client.
  const langClient = new LanguageClient('Language Server Haskell', serverOptions, clientOptions);

  context.subscriptions.push(InsertType.registerCommand(langClient));

  ShowTypeCommand.registerCommand(langClient).forEach(x => context.subscriptions.push(x));

  if (workspace.getConfiguration('languageServerHaskell').showTypeForSelection.onHover) {
    context.subscriptions.push(ShowTypeHover.registerTypeHover(langClient));
  }

  registerHiePointCommand(langClient, 'hie.commands.demoteDef', 'hare:demote', context);
  registerHiePointCommand(langClient, 'hie.commands.liftOneLevel', 'hare:liftonelevel', context);
  registerHiePointCommand(langClient, 'hie.commands.liftTopLevel', 'hare:lifttotoplevel', context);
  registerHiePointCommand(langClient, 'hie.commands.deleteDef', 'hare:deletedef', context);
  registerHiePointCommand(langClient, 'hie.commands.genApplicative', 'hare:genapplicative', context);
  const disposable = langClient.start();

  context.subscriptions.push(disposable);
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
