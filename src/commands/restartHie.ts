import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
import { CommandNames } from './constants';

export namespace RestartHie {
  'use strict';

  export function registerCommand(langClients: Map<string, LanguageClient>): vscode.Disposable {
    return vscode.commands.registerCommand(CommandNames.RestartHieCommandName, async () => {
      for (const langClient of langClients.values()) {
        await langClient.stop();
        langClient.start();
      }
    });
  }
}
