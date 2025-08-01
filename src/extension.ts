import { commands, env, ExtensionContext, TextDocument, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import {
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions,
  Logger,
  RevealOutputChannelOn,
  ServerOptions,
} from 'vscode-languageclient/node';
import * as constants from './commands/constants';
import * as DocsBrowser from './docsBrowser';
import { HlsError, MissingToolError, NoMatchingHls } from './errors';
import { findHaskellLanguageServer, HlsExecutable, IEnvVars } from './hlsBinaries';
import { addPathToProcessPath, comparePVP, callAsync } from './utils';
import { Config, initConfig, initLoggerFromConfig, logConfig } from './config';
import { HaskellStatusBar } from './statusBar';

/**
 * Global information about the running clients.
 */
type Client = {
  client: LanguageClient;
  config: Config;
};

// The current map of documents & folders to language servers.
// It may be null to indicate that we are in the process of launching a server,
// in which case don't try to launch another one for that uri
const clients: Map<string, Client | null> = new Map();

// This is the entrypoint to our extension
export async function activate(context: ExtensionContext) {
  const statusBar = new HaskellStatusBar(context.extension.packageJSON.version as string | undefined);
  context.subscriptions.push(statusBar);

  // (Possibly) launch the language server every time a document is opened, so
  // it works across multiple workspace folders. Eventually, haskell-lsp should
  // just support
  // https://microsoft.github.io/language-server-protocol/specifications/specification-3-15/#workspace_workspaceFolders
  // and then we can just launch one server
  workspace.onDidOpenTextDocument(async (document: TextDocument) => await activateServer(context, document));
  for (const document of workspace.textDocuments) {
    await activateServer(context, document);
  }

  // Stop the server from any workspace folders that are removed.
  workspace.onDidChangeWorkspaceFolders(async (event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        const uri = folder.uri.toString();
        client.client.info(`Deleting folder for clients: ${uri}`);
        clients.delete(uri);
        client.client.info('Stopping the server');
        await client.client.stop();
      }
    }
  });

  // Register editor commands for HIE, but only register the commands once at activation.
  const restartCmd = commands.registerCommand(constants.RestartServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.client.info('Stopping the server');
      await langClient?.client.stop();
      langClient?.client.info('Starting the server');
      await langClient?.client.start();
    }
  });

  context.subscriptions.push(restartCmd);

  const openLogsCmd = commands.registerCommand(constants.OpenLogsCommandName, () => {
    for (const langClient of clients.values()) {
      langClient?.config.outputChannel.show();
    }
  });

  context.subscriptions.push(openLogsCmd);

  const restartExtensionCmd = commands.registerCommand(constants.RestartExtensionCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.client.info('Stopping the server');
      await langClient?.client.stop();
    }
    clients.clear();

    for (const document of workspace.textDocuments) {
      await activateServer(context, document);
    }
  });

  context.subscriptions.push(restartExtensionCmd);

  const showVersionsCmd = commands.registerCommand(constants.ShowExtensionVersions, () => {
    void window.showInformationMessage(`Extension Version: ${context.extension.packageJSON.version ?? '<unknown>'}`);
  });

  context.subscriptions.push(showVersionsCmd);

  const stopCmd = commands.registerCommand(constants.StopServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.client.info('Stopping the server');
      await langClient?.client.stop();
      langClient?.client.info('Server stopped');
    }
  });

  context.subscriptions.push(stopCmd);

  const startCmd = commands.registerCommand(constants.StartServerCommandName, async () => {
    for (const langClient of clients.values()) {
      langClient?.client.info('Starting the server');
      await langClient?.client.start();
      langClient?.client.info('Server started');
    }
  });

  context.subscriptions.push(startCmd);

  // Set up the documentation browser.
  const docsDisposable = DocsBrowser.registerDocsBrowser();
  context.subscriptions.push(docsDisposable);

  const openOnHackageDisposable = DocsBrowser.registerDocsOpenOnHackage();
  context.subscriptions.push(openOnHackageDisposable);

  statusBar.refresh();
  statusBar.show();
}

async function activateServer(context: ExtensionContext, document: TextDocument) {
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

  await activateServerForFolder(context, uri, folder);
}

async function activateServerForFolder(context: ExtensionContext, uri: Uri, folder?: WorkspaceFolder) {
  const clientsKey = folder ? folder.uri.toString() : uri.toString();
  // If the client already has an LSP server for this uri/folder, then don't start a new one.
  if (clients.has(clientsKey)) {
    return;
  }
  // Set the key to null to prevent multiple servers being launched at once
  clients.set(clientsKey, null);

  const config = initConfig(workspace.getConfiguration('haskell', uri), uri, folder);
  const logger: Logger = initLoggerFromConfig(config);

  logConfig(logger, config);

  let hlsExecutable: HlsExecutable;
  try {
    hlsExecutable = await findHaskellLanguageServer(context, logger, config.ghcupConfig, config.workingDir, folder);
  } catch (e) {
    await handleInitializationError(e, logger);
    // Make sure to release the key again.
    clients.delete(clientsKey);
    return;
  }

  const serverEnvironment: IEnvVars = initServerEnvironment(config, hlsExecutable);
  const exeOptions: ExecutableOptions = {
    cwd: config.workingDir,
    env: { ...process.env, ...serverEnvironment },
  };

  // For our intents and purposes, the server should be launched the same way in
  // both debug and run mode.
  const serverOptions: ServerOptions = {
    run: { command: hlsExecutable.location, args: config.serverArgs, options: exeOptions },
    debug: { command: hlsExecutable.location, args: config.serverArgs, options: exeOptions },
  };

  // If we're operating on a standalone file (i.e. not in a folder) then we need
  // to launch the server in a reasonable current directory. Otherwise the cradle
  // guessing logic in hie-bios will be wrong!
  let cwdMsg = `Activating the language server in working dir: ${config.workingDir}`;
  if (folder) {
    cwdMsg += ' (the workspace folder)';
  } else {
    cwdMsg += ` (parent dir of loaded file ${uri.fsPath})`;
  }
  logger.info(cwdMsg);

  logger.info(`run command: ${hlsExecutable.location} ${config.serverArgs.join(' ')}`);
  logger.info(`debug command: ${hlsExecutable.location} ${config.serverArgs.join(' ')}`);
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

  const cabalDocumentSelector = { scheme: 'file', language: 'cabal', pattern: pat };
  const haskellDocumentSelector = [
    { scheme: 'file', language: 'haskell', pattern: pat },
    { scheme: 'file', language: 'literate haskell', pattern: pat },
  ];

  const documentSelector = [...haskellDocumentSelector];

  const cabalFileSupport: 'automatic' | 'enable' | 'disable' = workspace.getConfiguration(
    'haskell',
    uri,
  ).supportCabalFiles;
  logger.info(`Support for '.cabal' files: ${cabalFileSupport}`);

  switch (cabalFileSupport) {
    case 'automatic': {
      const hlsVersion = await callAsync(
        hlsExecutable.location,
        ['--numeric-version'],
        logger,
        config.workingDir,
        undefined /* this command is very fast, don't show anything */,
        false,
        serverEnvironment,
      );
      if (comparePVP(hlsVersion, '1.9.0.0') >= 0) {
        // If hlsVersion is >= '1.9.0.0'
        documentSelector.push(cabalDocumentSelector);
      }
      break;
    }
    case 'enable':
      documentSelector.push(cabalDocumentSelector);
      break;
    case 'disable':
      break;
    default:
      break;
  }

  const clientOptions: LanguageClientOptions = {
    // Use the document selector to only notify the LSP on files inside the folder
    // path for the specific workspace.
    documentSelector: [...documentSelector],
    synchronize: {
      // Synchronize the setting section 'haskell' to the server.
      configurationSection: 'haskell',
    },
    diagnosticCollectionName: config.langName,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    outputChannel: config.outputChannel,
    outputChannelName: config.langName,
    middleware: {
      provideHover: DocsBrowser.hoverLinksMiddlewareHook,
      provideCompletionItem: DocsBrowser.completionLinksMiddlewareHook,
    },
    // Launch the server in the directory of the workspace folder.
    workspaceFolder: folder,
  };

  // Create the LSP client.
  const langClient = new LanguageClient('haskell', config.langName, serverOptions, clientOptions);

  // Register ClientCapabilities for stuff like window/progress
  langClient.registerProposedFeatures();

  // Finally start the client and add it to the list of clients.
  logger.info('Starting language server');
  clients.set(clientsKey, {
    client: langClient,
    config,
  });
  await langClient.start();
}

/**
 * Handle errors the extension may throw. Errors are expected to be fatal.
 *
 * @param e Error thrown during the extension initialization.
 * @param logger
 */
async function handleInitializationError(e: unknown, logger: Logger) {
  if (e instanceof MissingToolError) {
    const link = e.installLink();
    if (link) {
      if (await window.showErrorMessage(e.message, `Install ${e.tool}`)) {
        env.openExternal(link);
      }
    } else {
      await window.showErrorMessage(e.message);
    }
  } else if (e instanceof HlsError) {
    logger.error(`General HlsError: ${e.message}`);
    window.showErrorMessage(e.message);
  } else if (e instanceof NoMatchingHls) {
    const link = e.docLink();
    logger.error(`${e.message}`);
    if (await window.showErrorMessage(e.message, 'Open documentation')) {
      env.openExternal(link);
    }
  } else if (e instanceof Error) {
    logger.error(`Internal Error: ${e.message}`);
    window.showErrorMessage(e.message);
  }
  if (e instanceof Error) {
    // general stack trace printing
    if (e.stack) {
      logger.error(`${e.stack}`);
    }
  }
}

function initServerEnvironment(config: Config, hlsExecutable: HlsExecutable) {
  let serverEnvironment: IEnvVars = config.serverEnvironment;
  if (hlsExecutable.tag === 'ghcup') {
    const newPath = addPathToProcessPath(hlsExecutable.binaryDirectory);
    serverEnvironment = {
      ...serverEnvironment,
      ...{ PATH: newPath },
    };
  }
  return serverEnvironment;
}

/*
 * Deactivate each of the LSP servers.
 */
export async function deactivate() {
  const promises: Thenable<void>[] = [];
  for (const client of clients.values()) {
    if (client) {
      promises.push(client.client.stop());
    }
  }
  await Promise.all(promises);
}
