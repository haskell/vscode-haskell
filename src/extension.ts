'use strict';
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
  Logger,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { CommandNames } from './commands/constants';
import { ImportIdentifier } from './commands/importIdentifier';
import { DocsBrowser } from './docsBrowser';
import { IEnvVars, addPathToProcessPath, downloadHaskellLanguageServer, downloadGHCup, validateHLSToolchain } from './hlsBinaries';
import { directoryExists, executableExists, expandHomeDir, ExtensionLogger, resolvePathPlaceHolders } from './utils';


// The current map of documents & folders to language servers.
// It may be null to indicate that we are in the process of launching a server,
// in which case don't try to launch another one for that uri
const clients: Map<string, LanguageClient | null> = new Map();

// This is the entrypoint to our extension
export async function activate(context: ExtensionContext) {
  // (Possibly) launch the language server every time a document is opened, so
  // it works across multiple workspace folders. Eventually, haskell-lsp should
  // just support
  // https://microsoft.github.io/language-server-protocol/specifications/specification-3-15/#workspace_workspaceFolders
  // and then we can just launch one server
  workspace.onDidOpenTextDocument(async (document: TextDocument) => await activeServer(context, document));
  workspace.textDocuments.forEach(async (document: TextDocument) => await activeServer(context, document));

  // Stop the server from any workspace folders that are removed.
  workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        const uri = folder.uri.toString();
        client.info(`Deleting folder for clients: ${uri}`);
        clients.delete(uri);
        client.info('Stopping the server');
        client.stop();
      }
    }
  });

  // Register editor commands for HIE, but only register the commands once at activation.
  const restartCmd = commands.registerCommand(CommandNames.RestartServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.info('Stopping the server');
      await langClient?.stop();
      langClient?.info('Starting the server');
      langClient?.start();
    }
  });

  context.subscriptions.push(restartCmd);

  const stopCmd = commands.registerCommand(CommandNames.StopServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.info('Stopping the server');
      await langClient?.stop();
      langClient?.info('Server stopped');
    }
  });

  context.subscriptions.push(stopCmd);

  const startCmd = commands.registerCommand(CommandNames.StartServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.info('Starting the server');
      langClient?.start();
      langClient?.info('Server started');
    }
  });

  context.subscriptions.push(startCmd);

  context.subscriptions.push(ImportIdentifier.registerCommand());

  // Set up the documentation browser.
  const docsDisposable = DocsBrowser.registerDocsBrowser();
  context.subscriptions.push(docsDisposable);

  const openOnHackageDisposable = DocsBrowser.registerDocsOpenOnHackage();
  context.subscriptions.push(openOnHackageDisposable);
}

function findManualExecutable(logger: Logger, uri: Uri, folder?: WorkspaceFolder): string | null {
  let exePath = workspace.getConfiguration('haskell', uri).serverExecutablePath;
  if (exePath === '') {
    return null;
  }
  logger.info(`Trying to find the server executable in: ${exePath}`);
  exePath = resolvePathPlaceHolders(exePath, folder);
  logger.log(`Location after path variables substitution: ${exePath}`);

  if (!executableExists(exePath)) {
    let msg = `serverExecutablePath is set to ${exePath}`;
    if (directoryExists(exePath)) {
      msg += ' but it is a directory and the config option should point to the executable file full path';
    } else {
      msg += " but it doesn't exist and it is not on the PATH";
    }
    throw new Error(msg);
  }
  return exePath;
}

/** Searches the PATH for whatever is set in serverVariant
 *
 * return null when **haskell.ignorePATH** set
 */
function findLocalServer(context: ExtensionContext, logger: Logger, uri: Uri, folder?: WorkspaceFolder): string | null {
  if (workspace.getConfiguration('haskell').get('ignorePATH') === true) {
    logger.info('Ignoring haskell-language-server on PATH');
    return null;
  }
  const exes: string[] = ['haskell-language-server-wrapper', 'haskell-language-server'];
  logger.info(`Searching for server executables ${exes.join(',')} in $PATH`);
  logger.info(`$PATH environment variable: ${process.env.PATH}`);
  for (const exe of exes) {
    if (executableExists(exe)) {
      logger.info(`Found server executable in $PATH: ${exe}`);
      return exe;
    }
  }

  return null;
}

async function activeServer(context: ExtensionContext, document: TextDocument) {
  // We are only interested in Haskell files.
  if (
    (document.languageId !== 'haskell' &&
      document.languageId !== 'cabal' &&
      document.languageId !== 'literate haskell') ||
    (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')
  ) {
    return;
  }

  const uri = document.uri;
  const folder = workspace.getWorkspaceFolder(uri);

  activateServerForFolder(context, uri, folder);
}

async function activateServerForFolder(context: ExtensionContext, uri: Uri, folder?: WorkspaceFolder) {
  const clientsKey = folder ? folder.uri.toString() : uri.toString();
  // Set a unique name per workspace folder (useful for multi-root workspaces).
  const langName = 'Haskell' + (folder ? ` (${folder.name})` : '');

  // If the client already has an LSP server for this uri/folder, then don't start a new one.
  if (clients.has(clientsKey)) {
    return;
  }

  const currentWorkingDir = folder ? folder.uri.fsPath : path.dirname(uri.fsPath);

  // Set the key to null to prevent multiple servers being launched at once
  clients.set(clientsKey, null);

  const logLevel = workspace.getConfiguration('haskell', uri).trace.server;
  const clientLogLevel = workspace.getConfiguration('haskell', uri).trace.client;
  const logFile: string = workspace.getConfiguration('haskell', uri).logFile;

  const outputChannel: OutputChannel = window.createOutputChannel(langName);

  const logFilePath = logFile !== '' ? path.resolve(currentWorkingDir, expandHomeDir(logFile)) : undefined;
  const logger: Logger = new ExtensionLogger('client', clientLogLevel, outputChannel, logFilePath);
  if (logFilePath) {
    logger.info(`Writing client log to file ${logFilePath}`);
  }
  logger.log('Environment variables:');
  Object.entries(process.env).forEach(([key, value]: [string, string | undefined]) => {
    logger.log(`  ${key}: ${value}`);
  });

  let serverExecutable;
  let addInternalServerPath: string | undefined = undefined; // if we download HLS, add that bin dir to PATH
  try {
    // Try and find local installations first
    serverExecutable = findManualExecutable(logger, uri, folder) ?? findLocalServer(context, logger, uri, folder);
    if (serverExecutable === null) {
      // If not, then try to download haskell-language-server binaries if it's selected
      await downloadGHCup(context, logger);
      serverExecutable = await downloadHaskellLanguageServer(context, logger);
      await validateHLSToolchain(serverExecutable, currentWorkingDir, logger)
      addInternalServerPath = path.dirname(serverExecutable);
      if (!serverExecutable) {
        return;
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`Error getting the server executable: ${e.message}`);
      window.showErrorMessage(e.message);
    }
    return;
  }

  let args: string[] = ['--lsp'];

  if (logLevel === 'messages') {
    args = args.concat(['-d']);
  }

  if (logFile !== '') {
    args = args.concat(['-l', logFile]);
  }

  const extraArgs: string = workspace.getConfiguration('haskell', uri).serverExtraArgs;
  if (extraArgs !== '') {
    args = args.concat(extraArgs.split(' '));
  }

  // If we're operating on a standalone file (i.e. not in a folder) then we need
  // to launch the server in a reasonable current directory. Otherwise the cradle
  // guessing logic in hie-bios will be wrong!
  let cwdMsg = `Activating the language server in working dir: ${currentWorkingDir}`;
  if (folder) {
    cwdMsg += ' (the workspace folder)';
  } else {
    cwdMsg += ` (parent dir of loaded file ${uri.fsPath})`;
  }
  logger.info(cwdMsg);

  let serverEnvironment: IEnvVars = workspace.getConfiguration('haskell', uri).serverEnvironment;
  if (addInternalServerPath != undefined) {
      const newPath = addPathToProcessPath(addInternalServerPath);
      serverEnvironment = {
        PATH: newPath,
        ... serverEnvironment
      };
  }
  const exeOptions: ExecutableOptions = {
    cwd: folder ? undefined : path.dirname(uri.fsPath),
    env: Object.assign(process.env, serverEnvironment),
  };

  // We don't want empty strings in our args
  args = args.map((x) => x.trim()).filter((x) => x !== '');

  // For our intents and purposes, the server should be launched the same way in
  // both debug and run mode.
  const serverOptions: ServerOptions = {
    run: { command: serverExecutable, transport: TransportKind.stdio, args, options: exeOptions },
    debug: { command: serverExecutable, transport: TransportKind.stdio, args, options: exeOptions },
  };

  logger.info(`run command: ${serverExecutable} ${args.join(' ')}`);
  logger.info(`debug command: ${serverExecutable} ${args.join(' ')}`);
  if (exeOptions.cwd) {
    logger.info(`server cwd: ${exeOptions.cwd}`);
  }
  if (serverEnvironment) {
    logger.info('server environment variables:');
    Object.entries(serverEnvironment).forEach(([key, val]: [string, string | undefined]) => {
      logger.info(`  ${key}=${val}`);
    });
  }

  const pat = folder ? `${folder.uri.fsPath}/**/*` : '**/*';
  logger.log(`document selector patten: ${pat}`);
  const clientOptions: LanguageClientOptions = {
    // Use the document selector to only notify the LSP on files inside the folder
    // path for the specific workspace.
    documentSelector: [
      { scheme: 'file', language: 'haskell', pattern: pat },
      { scheme: 'file', language: 'literate haskell', pattern: pat },
    ],
    synchronize: {
      // Synchronize the setting section 'haskell' to the server.
      configurationSection: 'haskell',
    },
    diagnosticCollectionName: langName,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel,
    outputChannelName: langName,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
      provideCompletionItem: DocsBrowser.completionLinksMiddlewareHook,
    },
    // Launch the server in the directory of the workspace folder.
    workspaceFolder: folder,
  };

  // Create the LSP client.
  const langClient = new LanguageClient(langName, langName, serverOptions, clientOptions);

  // Register ClientCapabilities for stuff like window/progress
  langClient.registerProposedFeatures();

  // Finally start the client and add it to the list of clients.
  logger.info('Starting language server');
  langClient.start();
  clients.set(clientsKey, langClient);
}

/*
 * Deactivate each of the LSP servers.
 */
export async function deactivate() {
  const promises: Array<Thenable<void>> = [];
  for (const client of clients.values()) {
    if (client) {
      promises.push(client.stop());
    }
  }
  await Promise.all(promises);
}
