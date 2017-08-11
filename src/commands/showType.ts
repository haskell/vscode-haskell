import { LanguageClient, RequestType } from 'vscode-languageclient';
import { Range, Selection, OutputChannel, Disposable } from 'vscode';
import * as lng from 'vscode-languageclient';
import * as vscode from 'vscode';

import { CommandNames } from './constants';

export namespace ShowType {
  'use strict';
  var lastRange = new Range(0, 0, 0, 0);

  export function registerCommand(client: LanguageClient): [Disposable] {
    let showTypeChannel = vscode.window.createOutputChannel("Haskell Show Type");

    let cmd = vscode.commands.registerCommand(CommandNames.ShowTypeCommandName, x => {
      let editor = vscode.window.activeTextEditor;

      let cmd = {
        command: "ghcmod:type",
        arguments: [{
          file: editor.document.uri.toString(),
          pos: editor.selections[0].start,
          include_constraints: true
        }]
      };

      client.sendRequest("workspace/executeCommand", cmd).then(hints => {
        let arr = hints as [lng.Range, string][];
        if (arr.length == 0) return;
        let ranges = arr.map(x => [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as [vscode.Range, string][];
        let [rng, typ] = chooseRange(editor.selection, ranges);
        lastRange = rng;

        editor.selections = [new Selection(rng.end, rng.start)];
        displayType(showTypeChannel, typ);
      }, e => {
        console.error(e);
      });
    });

    return [cmd, showTypeChannel];
  }

  function chooseRange(sel: Selection, rngs: [Range, string][]): [Range, string] {
    if (sel.isEqual(lastRange)) {
      let curr = rngs.findIndex(([rng, typ]) => sel.isEqual(rng));
      if (curr == -1) {
        return rngs[0];
      } else {
        return rngs[Math.min(rngs.length-1, curr+1)]
      }
    } else return rngs[0];
  }
}

function displayType(chan: OutputChannel, typ: string) {
  chan.clear();
  chan.appendLine(typ);
  chan.show(true);
}