import * as vscode from 'vscode';
import {
  LanguageClient,
  Position,
  Range,
  RequestType
} from 'vscode-languageclient';
import * as lng from 'vscode-languageclient';

import { CommandNames } from './constants';

export namespace InsertType {
  'use strict';

  export function registerCommand(client: LanguageClient): vscode.Disposable {
    const cmd = vscode.commands.registerTextEditorCommand(CommandNames.InsertTypeCommandName, (editor, edit) => {
      const ghcCmd = {
        command: 'ghcmod:type',
        arguments: [
          {
            file: editor.document.uri.toString(),
            pos: editor.selections[0].active,
            include_constraints: true,
          },
        ],
      };

      client.sendRequest('workspace/executeCommand', cmd).then(hints => {
        const arr = hints as Array<[Range, string]>;
        if (arr.length === 0) { return; }
        const [rng, typ] = arr[0];
        const vsRng = client.protocol2CodeConverter.asRange(rng);

        const symbolRange = editor.document.getWordRangeAtPosition(vsRng.start);
        const symbolName = editor.document.getText(symbolRange);

        const indent = ' '.repeat(vsRng.start.character);
        editor.edit(b => {
          if (editor.document.getText(vsRng).includes('=')) {
            b.insert(vsRng.start, `${symbolName} :: ${typ}\n${indent}`);
          } else {
            b.insert(vsRng.start, '(');
            b.insert(vsRng.end, ` :: ${typ})`);
          }
        });
      }, e => {
        console.error(e);
      });
    });

    return cmd;
  }

}
