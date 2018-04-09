import {
  CancellationToken,
  commands,
  Disposable,
  DocumentFilter,
  Hover,
  HoverProvider,
  languages,
  OutputChannel,
  Position,
  Range,
  Selection,
  TextDocument,
  TextEditor,
  window,
  workspace
} from 'vscode';
import { LanguageClient, Range as VLCRange } from 'vscode-languageclient';

import { CommandNames } from './constants';

const formatExpressionType = (document: TextDocument, r: Range, typ: string): string =>
  `${document.getText(r)} :: ${typ}`;

const HASKELL_MODE: DocumentFilter = {
  language: 'haskell',
  scheme: 'file'
};

// Cache same selections...
const blankRange = new Range(0, 0, 0, 0);
let lastRange = blankRange;
let lastType = '';

async function getTypes({ client, editor }: { client: LanguageClient; editor: TextEditor }): Promise<[Range, string]> {
  try {
    const hints = await client.sendRequest('workspace/executeCommand', getCmd(editor));
    const arr = hints as Array<[VLCRange, string]>;
    if (arr.length === 0) {
      throw new Error('No hints');
    }
    const ranges = arr.map(x => [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as Array<[Range, string]>;
    const [rng, typ] = chooseRange(editor.selection, ranges);
    lastRange = rng;
    lastType = typ;
    return [rng, typ];
  } catch (e) {
    console.error(e);
    throw new Error(e);
  }
}

/**
 * Choose The range in the editor and coresponding type that best matches the selection
 * @param  {Selection} sel - selected text in editor
 * @param  {Array<[Range, string]>} rngs - the type analysis from the server
 * @returns {[Range, string]}
 */
const chooseRange = (sel: Selection, rngs: Array<[Range, string]>): [Range, string] => {
  const curr = rngs.findIndex(([rng, typ]) => rng.contains(sel));

  // If we dont find selection start/end in ranges then
  // return the type matching the smallest selection range
  if (curr === -1) {
    // NOTE: not sure this should happen...
    return rngs[0];
  } else {
    return rngs[curr];
  }
};

const getCmd = (editor: TextEditor) => ({
  command: 'ghcmod:type',
  arguments: [
    {
      file: editor.document.uri.toString(),
      pos: editor.selections[0].start,
      include_constraints: true
    }
  ]
});

export namespace ShowTypeCommand {
  'use strict';

  const displayType = (chan: OutputChannel, typ: string) => {
    chan.clear();
    chan.appendLine(typ);
    chan.show(true);
  };

  export function registerCommand(clients: Map<string, LanguageClient>): [Disposable, OutputChannel] | null {
    const showTypeChannel = window.createOutputChannel('Haskell Show Type');
    const activeEditor = window.activeTextEditor;
    if (activeEditor === undefined) {
      return null;
    }
    const document = activeEditor.document;

    const cmd = commands.registerCommand(CommandNames.ShowTypeCommandName, x => {
      const editor = activeEditor;
      // Get the current file and workspace folder.
      const uri = editor.document.uri;
      const folder = workspace.getWorkspaceFolder(uri);
      // If there is a client registered for this workspace, use that client.
      if (folder !== undefined && clients.has(folder.uri.toString())) {
        const client = clients.get(folder.uri.toString());
        if (client !== undefined) {
          getTypes({ client, editor })
            .then(([r, typ]) => {
              switch (workspace.getConfiguration('languageServerHaskell').showTypeForSelection.command.location) {
                case 'dropdown':
                  window.showInformationMessage(formatExpressionType(document, r, typ));
                  break;
                case 'channel':
                  displayType(showTypeChannel, formatExpressionType(document, r, typ));
                  break;
                default:
                  break;
              }
            })
            .catch(e => console.error(e));
        }
      }
    });

    return [cmd, showTypeChannel];
  }
}

export namespace ShowTypeHover {
  /**
   * Determine if type information should be included in Hover Popup
   * @param  {TextEditor} editor
   * @param  {Position} position
   * @returns boolean
   */
  const showTypeNow = (editor: TextEditor, position: Position): boolean => {
    // NOTE: This seems to happen sometimes ¯\_(ツ)_/¯
    if (!editor) {
      return false;
    }
    // NOTE: This means cursor is not over selected text
    if (!editor.selection.contains(position)) {
      return false;
    }
    if (editor.selection.isEmpty) {
      return false;
    }
    // document.
    // NOTE: If cursor is not over highlight then dont show type
    if (editor.selection.active < editor.selection.start || editor.selection.active > editor.selection.end) {
      return false;
    }
    // NOTE: Not sure if we want this - maybe we can get multiline to work?
    if (!editor.selection.isSingleLine) {
      return false;
    }
    return true;
  };

  class TypeHover implements HoverProvider {
    public clients: Map<string, LanguageClient>;

    constructor(clients: Map<string, LanguageClient>) {
      this.clients = clients;
    }

    public provideHover(
      document: TextDocument,
      position: Position,
      token: CancellationToken
    ): Thenable<Hover | null> | null {
      const editor = window.activeTextEditor;
      if (editor === undefined) {
        return null;
      }

      if (!showTypeNow(editor, position)) {
        return null;
      }

      // NOTE: No need for server call
      if (lastType && editor.selection.isEqual(lastRange)) {
        return Promise.resolve(this.makeHover(document, lastRange, lastType));
      }

      const uri = editor.document.uri;
      const folder = workspace.getWorkspaceFolder(uri);
      // If there is a client registered for this workspace, use that client.
      if (folder !== undefined && this.clients.has(folder.uri.toString())) {
        const client = this.clients.get(folder.uri.toString());
        if (client === undefined) {
          return null;
        }
        return getTypes({ client, editor }).then(([r, typ]) => {
          if (typ) {
            return this.makeHover(document, r, lastType);
          } else {
            return null;
          }
        });
      } else {
        return null;
      }
    }

    private makeHover(document: TextDocument, r: Range, typ: string): Hover {
      return new Hover({
        language: 'haskell',
        value: formatExpressionType(document, r, typ)
      });
    }
  }

  export const registerTypeHover = (clients: Map<string, LanguageClient>) =>
    languages.registerHoverProvider(HASKELL_MODE, new TypeHover(clients));
}
