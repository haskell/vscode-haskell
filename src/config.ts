import { OutputChannel, Uri, window,  WorkspaceConfiguration,  WorkspaceFolder } from 'vscode';
import { expandHomeDir, ExtensionLogger, IEnvVars } from './utils';
import * as path from 'path';
import { Logger } from 'vscode-languageclient';

export type LogLevel = 'off' | 'messages' | 'verbose';
export type ClientLogLevel = 'off' | 'error' | 'info' | 'debug';

export type Config = {
  /**
   * Unique name per workspace folder (useful for multi-root workspaces).
   */
  langName: string;
  logLevel: LogLevel;
  clientLogLevel: ClientLogLevel;
  logFilePath?: string;
  workingDir: string;
  outputChannel: OutputChannel;
  serverArgs: string[];
  serverEnvironment: IEnvVars;
};

export function initConfig(workspaceConfig: WorkspaceConfiguration, uri: Uri, folder?: WorkspaceFolder): Config {
  // Set a unique name per workspace folder (useful for multi-root workspaces).
  const langName = 'Haskell' + (folder ? ` (${folder.name})` : '');
  const currentWorkingDir = folder ? folder.uri.fsPath : path.dirname(uri.fsPath);

  const logLevel = getLogLevel(workspaceConfig);
  const clientLogLevel = getClientLogLevel(workspaceConfig);

  const logFile = getLogFile(workspaceConfig);
  const logFilePath = resolveLogFilePath(logFile, currentWorkingDir);

  const outputChannel: OutputChannel = window.createOutputChannel(langName);
  const serverArgs = getServerArgs(workspaceConfig, logLevel, logFilePath);

  return {
    langName: langName,
    logLevel: logLevel,
    clientLogLevel: clientLogLevel,
    logFilePath: logFilePath,
    workingDir: currentWorkingDir,
    outputChannel: outputChannel,
    serverArgs: serverArgs,
    serverEnvironment: workspaceConfig.serverEnvironment,
  };
}

export function initLoggerFromConfig(config: Config): ExtensionLogger {
  return new ExtensionLogger('client', config.clientLogLevel, config.outputChannel, config.logFilePath);
}

export function logConfig(logger: Logger, config: Config) {
  if (config.logFilePath) {
    logger.info(`Writing client log to file ${config.logFilePath}`);
  }
  logger.log('Environment variables:');
  Object.entries(process.env).forEach(([key, value]: [string, string | undefined]) => {
    // only list environment variables that we actually care about.
    // this makes it safe for users to just paste the logs to whoever,
    // and avoids leaking secrets.
    if (['PATH'].includes(key)) {
      logger.log(`  ${key}: ${value}`);
    }
  });
}

function getLogFile(workspaceConfig: WorkspaceConfiguration) {
  const logFile_: unknown = workspaceConfig.logFile;
  let logFile: string | undefined;
  if (typeof logFile_ === 'string') {
    logFile = logFile_ !== '' ? logFile_ : undefined;
  }
  return logFile;
}

function getClientLogLevel(workspaceConfig: WorkspaceConfiguration): ClientLogLevel {
  const clientLogLevel_: unknown = workspaceConfig.trace.client;
  let clientLogLevel;
  if (typeof clientLogLevel_ === 'string') {
    switch (clientLogLevel_) {
      case 'off':
      case 'error':
      case 'info':
      case 'debug':
        clientLogLevel = clientLogLevel_;
        break;
      default:
        throw new Error();
    }
  } else {
    throw new Error();
  }
  return clientLogLevel;
}

function getLogLevel(workspaceConfig: WorkspaceConfiguration): LogLevel {
  const logLevel_: unknown = workspaceConfig.trace.server;
  let logLevel;
  if (typeof logLevel_ === 'string') {
    switch (logLevel_) {
      case 'off':
      case 'messages':
      case 'verbose':
        logLevel = logLevel_;
        break;
      default:
        throw new Error("haskell.trace.server is expected to be one of 'off', 'messages', 'verbose'.");
    }
  } else {
    throw new Error('haskell.trace.server is expected to be a string');
  }
  return logLevel;
}

function resolveLogFilePath(logFile: string | undefined, currentWorkingDir: string): string | undefined {
  return logFile !== undefined ? path.resolve(currentWorkingDir, expandHomeDir(logFile)) : undefined;
}

function getServerArgs(workspaceConfig: WorkspaceConfiguration, logLevel: LogLevel, logFilePath?: string): string[] {
  const serverArgs = ['--lsp']
    .concat(logLevel === 'messages' ? ['-d'] : [])
    .concat(logFilePath !== undefined ? ['-l', logFilePath] : []);

  const rawExtraArgs: unknown = workspaceConfig.serverExtraArgs;
  if (typeof rawExtraArgs === 'string' && rawExtraArgs !== '') {
    const e = rawExtraArgs.split(' ');
    serverArgs.push(...e);
  }

  // We don't want empty strings in our args
  return serverArgs.map((x) => x.trim()).filter((x) => x !== '');
}
