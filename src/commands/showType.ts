import {
  Disposable,
  OutputChannel,
  Range,
  Selection
} from 'vscode';
import * as vscode from 'vscode';
import { LanguageClient, RequestType } from 'vscode-languageclient';
import * as lng from 'vscode-languageclient';

import { CommandNames } from './constants';

export namespace ShowType {
  'use strict';
  let lastRange = new Range(0, 0, 0, 0);

  export function registerCommand(client: LanguageClient): [Disposable] {
    const showTypeChannel = vscode.window.createOutputChannel('Haskell Show Type');

    const cmd = vscode.commands.registerCommand(CommandNames.ShowTypeCommandName, c => {
      const editor = vscode.window.activeTextEditor;

      const ghcCmd = {
        command: 'ghcmod:type',
        arguments: [{
          file: editor.document.uri.toString(),
          pos: editor.selections[0].start,
          include_constraints: true,
        }],
      };

      client.sendRequest('workspace/executeCommand', ghcCmd).then(hints => {
        const arr = hints as Array<[lng.Range, string]>;
        if (arr.length === 0) {
          return;
        }
        const ranges =
          arr.map(x => [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as Array<[vscode.Range, string]>;
        const [rng, typ] = chooseRange(editor.selection, ranges);
        lastRange = rng;

        editor.selections = [new Selection(rng.end, rng.start)];
        displayType(showTypeChannel, typ);
      }, e => {
        console.error(e);
      });
    });

    return [cmd, showTypeChannel];
  }

  function chooseRange(sel: Selection, rngs: Array<[Range, string]>): [Range, string] {
    if (sel.isEqual(lastRange)) {
      const curr = rngs.findIndex(([rng, typ]) => sel.isEqual(rng));
      if (curr === -1) {
        return rngs[0];
      } else {
        return rngs[Math.min(rngs.length - 1, curr + 1)];
      }
    } else {
      return rngs[0];
    }
  }
}

function displayType(chan: OutputChannel, typ: string) {
  chan.clear();
  chan.appendLine(typ);
  chan.show(true);
}
