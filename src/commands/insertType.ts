import {
  commands,
  Disposable
} from 'vscode';
import {
  LanguageClient,
  Range,
} from 'vscode-languageclient';

import { CommandNames } from './constants';

export namespace InsertType {
  'use strict';

  export function registerCommand(client: LanguageClient): Disposable {
    const cmd = commands.registerTextEditorCommand(CommandNames.InsertTypeCommandName, (editor, edit) => {
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
