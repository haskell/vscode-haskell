import {
  CancellationToken,
  commands,
  Disposable,
  Hover,
  HoverProvider,
  MarkedString,
  OutputChannel,
  Position,
  ProviderResult,
  Range,
  Selection,
  TextDocument,
  window
} from 'vscode';
import { LanguageClient, RequestType, Range as VLCRange } from 'vscode-languageclient';
import * as lng from 'vscode-languageclient';

import { CommandNames } from './constants';

export namespace ShowType {
  'use strict';
  const lastRange = new Range(0, 0, 0, 0);

  export function registerCommand(client: LanguageClient): [Disposable] {
    const showTypeChannel = window.createOutputChannel('Haskell Show Type');

    const cmd = commands.registerCommand(CommandNames.ShowTypeCommandName, c => {
      const editor = window.activeTextEditor;

      const ghcCmd = {
        command: 'ghcmod:type',
        arguments: [{
          file: editor.document.uri.toString(),
          pos: editor.selections[0].start,
          include_constraints: true,
        }],
      };

      client.sendRequest('workspace/executeCommand', ghcCmd).then(hints => {
        const arr = hints as Array<[VLCRange, string]>;
        if (arr.length === 0) {
          return;
        }
        const ranges =
          arr.map(x => [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as Array<[Range, string]>;
        const [rng, typ] = chooseRange(editor.selection, ranges);
        // lastRange = rng;

        // editor.selections = [new Selection(rng.end, rng.start)];

        vscode.window.showInformationMessage(typ);
        // displayType(showTypeChannel, typ);
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

export interface HaskellShowTypeInformation {
  // file: string;
  type: string;
	// line: number;
	// column: number;
	// doc: string;
	// declarationlines: string[];
	// name: string;
	// toolUsed: string;
}

// export const showTypeHover(client) : HoverProvider = {
  // export class ShowTypeHover {
export class ShowTypeHover implements HoverProvider {
  client: LanguageClient;

  constructor(client) {
    this.client = client;
  }

  public provideHover(document: TextDocument, position: Position, token: CancellationToken): Thenable<Hover> {
    let editor = vscode.window.activeTextEditor;
    let lastRange = new Range(0, 0, 0, 0);


    let cmd = {
      command: "ghcmod:type",
      arguments: [{
        file: editor.document.uri.toString(),
        pos: editor.selections[0].start,
        include_constraints: true
      }]
    };

    function chooseRange(sel: Selection, rngs: [Range, string][]): [Range, string] {
      if (sel.isEqual(lastRange)) {
        let curr = rngs.findIndex(([rng, typ]) => sel.isEqual(rng));
        if (curr == -1) {
          return rngs[0];
        } else {
          return rngs[Math.min(rngs.length-1, curr+1)]
        }
      } else return rngs[0];
    };

    const typeFormatter = (typeString: string): MarkedString => {
      // const ms = new MarkedString();
      const ms = [];
      // definition?
      let def = typeString.split("::").map(s => s.trim());
      if (def.length > 1) {
        ms.push(`**${def[0]}** :: `);
        def.shift()
      }
      // context?
      def = typeString.split("=>").map(s => s.trim());
      if (def.length > 1) {
        ms.push(`*${def[0]}* => `);
        def.shift()
      }
      // Process rest...
      def = typeString.split("->").map(s => s.trim());
      if (def.length === 1 && def[0] === '') {
        return;
      }
      if (def.length >= 1) {
        ms.push(def.map(s => `**${s}**`).join(' -> '))
      }
      return ms.join();
      // while def.length >= 1 {
      //   if (def === '') {
      //     return;
      //   }
      //   ms.push(def.map(s => `*${s}*`).join(' -> '))
      // }

    }


    return this.client.sendRequest("workspace/executeCommand", cmd).then(hints => {
      let arr = hints as [lng.Range, string][];
      if (arr.length == 0) return;
      let ranges = arr.map(x => [this.client.protocol2CodeConverter.asRange(x[0]), x[1]]) as [vscode.Range, string][];
      let [rng, typ] = chooseRange(editor.selection, ranges);
      // lastRange = rng;

      // editor.selections = [new Selection(rng.end, rng.start)];
      console.log(`SHOWTYPE IS `, typ);
      let hover = new vscode.Hover({
        language: 'haskell',
        // value: `REAL: ${typeFormatter(typ)}`
        // NOTE: Force some better syntax highlighting:
        value: `_ :: ${typ}`
      });
      // let hover = new vscode.Hover([`\`\`\`haskell\n` + "foo :: ([AWS.Filter] -> Identity [AWS.Filter]) -> AWS.DescribeInstances -> Identity AWS.DescribeInstances" + `\n\`\`\``]);

      // let hover = new vscode.Hover([`\`\`\`haskell\n` + "foo :: this -> that" + `\n\`\`\``]);
      // let hover = new vscode.Hover([`\`\`\`haskell\nfoo :: this -> that\n\`\`\``]);
      // let hover = new vscode.Hover([`\`\`\`js\nconst elbow = () => pow;\n\`\`\``]);
      // let hover = new vscode.Hover([typeFormatter(typ)]);
      console.log(`SHOWTYPE HOVER IS `, hover);
      // vscode.window.showInformationMessage(typ);
      // displayType(showTypeChannel, typ);
      return hover;
    }, e => {
      console.error(e);
    });
  }
};

const HASKELL_MODE: vscode.DocumentFilter =
  { language: 'haskell', scheme: 'file' };

export const registerTypeHover = (client) =>
  vscode
    .languages
    .registerHoverProvider(HASKELL_MODE, new ShowTypeHover(client));
