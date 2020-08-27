'use strict';
import {
  commands,
  ExtensionContext,
  window,
  workspace,
} from 'vscode';
import {
  LanguageClient,
} from 'vscode-languageclient';
import { CommandNames } from './constants';

export namespace HLintApply {
  'use strict';

  export function registerCommands(
    clients: Map<string, LanguageClient | null>,
    context: ExtensionContext) {
    registerHieFileCommand(clients, CommandNames.HlintApplyAllCommandName, 'hlint:applyAll', context);
  }
}

/*
 * Create an editor command that calls an action on the active LSP server.
 */
async function registerHieCommand(
  clients: Map<string, LanguageClient | null>,
  name: string,
  command: string,
  context: ExtensionContext,
  getArgs: () => Promise<any[]>
) {
  const editorCmd = commands.registerCommand(name, async () => {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;

    const args = await getArgs();
    const cmd = {
      command,
      arguments: args
    };
    // Get the current file and workspace folder.
    const uri = document.uri;
    const folder = workspace.getWorkspaceFolder(uri);
    // If there is a client registered for this workspace, use that client.
    if (folder !== undefined && folder !== null && clients.has(folder.uri.toString())) {
      const client = clients.get(folder.uri.toString());
      if (client !== undefined && client !== null) {
        client.sendRequest('workspace/executeCommand', cmd).then(
          hints => {
            return true;
          },
          e => {
            console.error(e);
          }
        );
      }
    }
  });
  context.subscriptions.push(editorCmd);
}

/*
 * Create an editor command that calls an action on the active LSP server for a file
 */
async function registerHieFileCommand(
  clients: Map<string, LanguageClient | null>,
  name: string,
  command: string,
  context: ExtensionContext
) {
  registerHieCommand(clients, name, command, context, async () => {
    const editor = window.activeTextEditor;
    if (!editor) {
      return [];
    }
    const document = editor.document;
    return [document.uri];
  });
}
