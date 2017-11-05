import {
  CancellationToken,
  commands,
  Disposable,
  DocumentFilter,
  Hover,
  HoverProvider,
  languages,
  MarkedString,
  OutputChannel,
  Position,
  ProviderResult,
  Range,
  Selection,
  TextDocument,
  window
} from 'vscode';
import {
  LanguageClient,
  Range as VLCRange,
  RequestType
} from 'vscode-languageclient';

import {CommandNames} from './constants';

export namespace ShowType {
  'use strict';

  export function registerCommand(client: LanguageClient): [Disposable] {
    const showTypeChannel = window.createOutputChannel('Haskell Show Type');

    const cmd = commands.registerCommand(CommandNames.ShowTypeCommandName, x => {
      const editor = window.activeTextEditor;

      getTypes({client, editor}).then(typ => {
        window.showInformationMessage(typ);
        // displayType(showTypeChannel, typ);
      }).catch(e => console.error(e));

    });

    return [cmd, showTypeChannel];
  }
}

const displayType = (chan: OutputChannel, typ: string) => {
  chan.clear();
  chan.appendLine(typ);
  chan.show(true);
};

// export interface IHaskellShowTypeInformation {
//   // file: string;
//   type: string;
//   // line: number;
// 	// column: number;
// 	// doc: string;
// 	// declarationlines: string[];
// 	// name: string;
// 	// toolUsed: string;
// }

let lastRange = new Range(0, 0, 0, 0);

const chooseRange = (sel: Selection, rngs: Array<[Range, string]>): [Range, string] => {
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
};

const getCmd = editor => ({
  command: 'ghcmod:type',
  arguments: [{
    file: editor.document.uri.toString(),
    pos: editor.selections[0].start,
    include_constraints: true,
  }],
});

const getTypes = ({client, editor}) => client.sendRequest('workspace/executeCommand', getCmd(editor)).then(hints => {
    const arr = hints as Array<[VLCRange, string]>;
    if (arr.length === 0) {
      return;
    }
    const ranges = arr.map(x => [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as Array<[Range, string]>;
    const [rng, typ] = chooseRange(editor.selection, ranges);
    lastRange = rng;
    return typ;
  }, e => {
    console.error(e);
});

const typeFormatter = (typeString: string): MarkedString => {
  // const ms = new MarkedString();
  const ms = [];
  // definition?
  let def = typeString.split('::').map(s => s.trim());
  if (def.length > 1) {
    ms.push(`**${def[0]}** :: `);
    def.shift();
  }
  // context?
  def = typeString.split('=>').map(s => s.trim());
  if (def.length > 1) {
    ms.push(`*${def[0]}* => `);
    def.shift();
  }
  // Process rest...
  def = typeString.split('->').map(s => s.trim());
  if (def.length === 1 && def[0] === '') {
    return;
  }
  if (def.length >= 1) {
    ms.push(def.map(s => `**${s}**`).join(' -> '));
  }
  return ms.join();
  // while def.length >= 1 {
  //   if (def === '') {
  //     return;
  //   }
  //   ms.push(def.map(s => `*${s}*`).join(' -> '))
  // }

};

export class ShowTypeHover implements HoverProvider {
  public client: LanguageClient;

  constructor(client) {
    this.client = client;
  }

  public provideHover(document: TextDocument, position: Position, token: CancellationToken): Thenable<Hover> {
    const editor = window.activeTextEditor;

    return getTypes({client: this.client, editor}).then(typ => {
      return new Hover({
        language: 'haskell',
        // NOTE: Force some better syntax highlighting:
        value: `_ :: ${typ}`,
      });
    });
  }
}

const HASKELL_MODE: DocumentFilter = {
  language: 'haskell',
  scheme: 'file',
};

export const registerTypeHover = (client) => languages
    .registerHoverProvider(HASKELL_MODE, new ShowTypeHover(client));
