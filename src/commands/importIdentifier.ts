import * as vscode from 'vscode';
import { CommandNames } from './constants';
import * as request from 'request-promise-native';
import * as cheerio from 'cheerio';
import * as LRU from 'lru-cache';
import * as _ from 'lodash';
import * as yaml from 'js-yaml';

const askHoogle = async (variable: string): Promise<any> => {
  return await request({
    url: `https://hoogle.haskell.org/?hoogle=${variable}&scope=set%3Astackage&mode=json`,
    json: true
  }).promise();
};

const withCache = <T, U>(cache: LRU.Cache<T, U>, f: (a: T) => U) => (a: T) => {
  const maybeB = cache.get(a);
  if (maybeB) {
    return maybeB;
  } else {
    const b = f(a);
    cache.set(a, b);
    return b;
  }
};

const cache: LRU.Cache<string, Promise<any>> = LRU({
  // 1 MB
  max: 1000 * 1000,
  length: (r: any) => JSON.stringify(r).length
});

const askHoogleCached = withCache(cache, askHoogle);

const doImport = async (arg: { mod: string; package: string }): Promise<void> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const edit = new vscode.WorkspaceEdit();

  const lines = document.getText().split('\n');
  const moduleLine = lines.findIndex(line => line.startsWith('module'));
  const revInputLine = lines.reverse().findIndex(l => l.startsWith('import'));
  const nextInputLine = revInputLine !== -1 ? lines.length - 1 - revInputLine : moduleLine === -1 ? 0 : moduleLine + 1;

  if (!lines.some(line => new RegExp('^import.*' + _.escapeRegExp(arg.mod)).test(line))) {
    edit.insert(document.uri, new vscode.Position(nextInputLine, 0), 'import ' + arg.mod + '\n');
  }

  try {
    const hpackDoc = await vscode.workspace.openTextDocument(vscode.workspace.rootPath + '/package.yaml');

    const hpack: any = yaml.safeLoad(hpackDoc.getText());
    hpack.dependencies = hpack.dependencies || [];
    if (!hpack.dependencies.some((dep: string) => new RegExp(_.escapeRegExp(arg.package)).test(dep))) {
      hpack.dependencies.push(arg.package);
      edit.replace(
        hpackDoc.uri,
        new vscode.Range(new vscode.Position(0, 0), hpackDoc.lineAt(hpackDoc.lineCount - 1).range.end),
        yaml.safeDump(hpack)
      );
    }
  } catch (e) {
    // There is no package.yaml
  }

  await vscode.workspace.applyEdit(edit);

  await Promise.all(
    edit.entries().map(async ([uri, textEdit]) => await (await vscode.workspace.openTextDocument(uri)).save())
  );
};

export namespace ImportIdentifier {
  'use strict';

  export function registerCommand(): vscode.Disposable {
    return vscode.commands.registerTextEditorCommand(CommandNames.ImportIdentifierCommandName, async (editor, edit) => {
      const identifierRegExp = new RegExp('[' + _.escapeRegExp('!#$%&*+./<=>?@^|-~:') + ']+' + '|' + "[\\w']+");

      const identifierRange = editor.selection.isEmpty
        ? editor.document.getWordRangeAtPosition(editor.selections[0].active, identifierRegExp)
        : new vscode.Range(editor.selection.start, editor.selection.end);

      if (!identifierRange) {
        vscode.window.showErrorMessage(
          "No Haskell identifier found at the cursor (here's the regex used: " + identifierRegExp + ' )'
        );
        return;
      }

      const response: any[] = await askHoogleCached(editor.document.getText(identifierRange));

      const choice = await vscode.window.showQuickPick(
        response.filter(result => result.module.name).map(result => ({
          result,
          label: result.package.name,
          description: result.module.name + ' -- ' + (cheerio.load as any)(result.item, { xml: {} }).text()
        }))
      );

      if (!choice) {
        return;
      }

      await doImport({ mod: choice.result.module.name, package: choice.result.package.name });
    });
  }
}
