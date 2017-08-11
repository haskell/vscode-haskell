import { LanguageClient, RequestType, Range, Position } from 'vscode-languageclient';
import * as lng from 'vscode-languageclient';
import * as vscode from 'vscode';

import { CommandNames } from './constants';

export namespace InsertType {
  'use strict';

  export function registerCommand(client: LanguageClient): vscode.Disposable {
    let cmd = vscode.commands.registerTextEditorCommand(CommandNames.InsertTypeCommandName, (editor, edit) => {
      let cmd = {
        command: "ghcmod:type",
        arguments: [
          {
            file: editor.document.uri.toString(),
            pos: editor.selections[0].active,
            include_constraints: true
          }
        ]
      };

      client.sendRequest("workspace/executeCommand", cmd).then(hints => {
        let arr = hints as [Range, String][];
        if (arr.length == 0) return;
        let [rng, typ] = arr[0];
        let vsRng = client.protocol2CodeConverter.asRange(rng);

        let symbolRange = editor.document.getWordRangeAtPosition(vsRng.start);
        let symbolName = editor.document.getText(symbolRange);

        let indent = " ".repeat(vsRng.start.character);
        editor.edit(b => {
          if (editor.document.getText(vsRng).includes('=')) {
            b.insert(vsRng.start, `${symbolName} :: ${typ}\n${indent}`);
          } else {
            b.insert(vsRng.start, "(")
            b.insert(vsRng.end, ` :: ${typ})`)
          }
        });
      }, e => {
        console.error(e);
      });
    });

    return cmd;
  }

}