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
  // ProviderResult,
  Range,
  Selection,
  TextDocument,
  window
} from 'vscode';
import {
  LanguageClient,
  Range as VLCRange,
  // RequestType
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

// Cache same selections...
const blankRange = new Range(0, 0, 0, 0);
let lastRange = blankRange;
let lastType = '';
// let lastRange = new Range(0, 0, 0, 0);

async function getTypes({client, editor}) {
  try {
    const hints = await client.sendRequest('workspace/executeCommand', getCmd(editor));
    const arr = hints as Array<[VLCRange, string]>;
    if (arr.length === 0) {
      // lastRange = blankRange;
      return null;
      // return;
    }
    const ranges = arr.map(x =>
      [client.protocol2CodeConverter.asRange(x[0]), x[1]]) as Array<[Range, string]>;
    const [rng, typ] = chooseRange(editor.selection, ranges);
    lastRange = rng;
    lastType = typ;
    return typ;
  } catch (e) {
    console.error(e);
  }
}

/*
  Yes, it returns a list of types increasing in scope.
  Like if you have `add a = a + 1` and you ask type for `a` at the rhs
  it gives you [`Int`, `Int -> Int`].
  The first one is what you asked for, the rest ones -
  next widened scope then widen it again, etc.

  Comes handy, I want to add it as a feature:
  press `Cmd+t` and it shows me the type (in a tooltip),
  press again - selection is widened and I see the type of a bigger expression etc,.
 */

// sel is selection in editor as a Range
// rngs is the type analysis from the server - an array of Range, type pairs
// lastRange is the stored last match
const chooseRange = (sel: Selection, rngs: Array<[Range, string]>): [Range, string] => {
    console.log('=========');
    console.log(logPos('sel', sel, null));
    // console.log('sel is ', sel);
    // console.log('rngs is ', rngs);
    console.log(logPosMap('rngs', rngs));

    const curr = rngs.findIndex(([rng, typ]) => rng.contains(sel));

    if (curr !== -1) {
      console.log('\n', logPos(`container: ${curr}`, rngs[curr][0], rngs[curr][1]));
    } else {
      console.log('No Match...');
    }
    console.log('sel === rng?: ', sel.isEqual(lastRange));
    console.log('=========');

  // This never happens....
  // if (sel.isEqual(lastRange)) {
  // if (sel.isEqual(lastRange)) {
  // if (true) {
    // const curr = rngs.findIndex(([rng, typ]) => sel.isEqual(rng));
    // const curr = rngs.findIndex(([rng, typ]) => rng.contains(sel));
    // const curr = rngs.findIndex(([rng, typ]) => sel.contains(rng));

    // If we dont find selection start/end in ranges then
    // return the type matching the smallest selection range
    if (curr === -1) {
      // NOTE: not sure this should happen...
      console.log('We didnt find the range!!!!');
      return rngs[0];
    } else {
      return rngs[curr];
      // return rngs[Math.min(rngs.length - 1, curr + 1)];
    }
  // } else {
  //   return rngs[0];
  // }
};

const logPos = (label: string, rng: Range, typ: string): string => {
  // tslint:disable-next-line
  return `${label}: start Line ${rng.start.line} Character ${rng.start.character} | end Line ${rng.end.line} Character ${rng.end.character}${typ ?  `| type ${typ}` : ''}`;
};

const logPosMap = (label: string, posList: Array<[Range, string]>) =>
  posList.map(([r, t], i) => logPos(i.toString(), r, t)).join('\n');

const getCmd = editor => ({
  command: 'ghcmod:type',
  arguments: [{
    file: editor.document.uri.toString(),
    pos: editor.selections[0].start,
    include_constraints: true,
  }],
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
    if (editor.selection.isEmpty) {
      console.log(`Selection Empty`);
      return null;
    }
    // document.
    // NOTE: If cursor is not over highlight then dont show type
    if ((editor.selection.active < editor.selection.start) || (editor.selection.active > editor.selection.end)) {
      console.log(`Cursor Outside Selection`);
      return null;
    }
    // NOTE: Not sure if we want this - maybe we can get multiline to work?
    if (!editor.selection.isSingleLine) {
      console.log(`Muliline Selection`);
      return null;
    }
    // NOTE: No need for server call
    // TODO: Selection/highlighted text may be unchanged but cursor may
    // be hovering somewhere else and thus need a different type and in fact get
    // a different type due to the ordinary ShowType function - need a way to ignore this
    // showType when that is the case - not sure if we can without making another server call though...there is no API for getting cursor position outside of selection?
    if (lastType && editor.selection.isEqual(lastRange)) {
      console.log(`Selection unchanged...`);
      return Promise.resolve(this.makeHover(lastType));
    }

    return getTypes({client: this.client, editor}).then(typ => {

      // return new Hover({
      //   language: 'haskell',
      //   // NOTE: Force some better syntax highlighting:
      //   value: `_ :: ${typ}`,
      // });
      console.log('TYP ----- ', typ);
      if (typ) {
        return this.makeHover(lastType);
        // return new Hover({
        //   language: 'haskell',
        //   // NOTE: Force some better syntax highlighting:
        //   value: `_ :: ${typ}`,
        // });
      } else {
        return null;
      }
    });
  }

  private makeHover(typ: string): Hover {
    return new Hover({
      language: 'haskell',
      // NOTE: Force some better syntax highlighting:
      value: `_ :: ${typ}`,
    });
  }
}

const HASKELL_MODE: DocumentFilter = {
  language: 'haskell',
  scheme: 'file',
};

export const registerTypeHover = (client) => languages
    .registerHoverProvider(HASKELL_MODE, new ShowTypeHover(client));
