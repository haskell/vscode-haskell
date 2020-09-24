import openPath = require('open');
import { dirname } from 'path';
import {
  CancellationToken,
  commands,
  CompletionContext,
  CompletionItem,
  CompletionList,
  Disposable,
  Hover,
  MarkdownString,
  MarkedString,
  Position,
  ProviderResult,
  TextDocument,
  Uri,
  ViewColumn,
  window,
} from 'vscode';
import { ProvideCompletionItemsSignature, ProvideHoverSignature } from 'vscode-languageclient';

export namespace DocsBrowser {
  'use strict';

  // registers the browser in VSCode infrastructure
  export function registerDocsBrowser(): Disposable {
    return commands.registerCommand('haskell.showDocumentation', ({ title, path }: { title: string; path: string }) => {
      const arr = path.match(/([^\/]+)\.[^.]+$/);
      const ttl = arr !== null && arr.length === 2 ? arr[1].replace(/-/gi, '.') : title;
      const documentationDirectory = dirname(path);
      let panel;
      try {
        // Make sure to use Uri.parse here, as path will already have 'file:///' in it
        panel = window.createWebviewPanel('haskell.showDocumentationPanel', ttl, ViewColumn.Beside, {
          localResourceRoots: [Uri.parse(documentationDirectory)],
          enableFindWidget: true,
          // TODO: a separate PR (window's content not destroyed when goes out of sight)
          // retainContextWhenHidden: true,
          enableCommandUris: true,
        });
        const uri = panel.webview.asWebviewUri(Uri.parse(path));
        const encodedPath = encodeURIComponent(JSON.stringify(path));
        // TODO : better markup / divs?
        panel.webview.html = `<table>
          <tr><td><a href="command:haskell.openDocumentationInBrowser?${encodedPath}">Open In Browser</a></td></tr>
          <tr><td><iframe src="${uri}" frameBorder = "0" style = "background: white; width: 100%; height: 100%; position:absolute; left: 0; right: 0; bottom: 0; top: 30px;"/></td></tr>
        </table>`;
      } catch (e) {
        window.showErrorMessage(e);
      }
      return panel;
    });
  }

  export function registerDocsOpenInBrowser(): Disposable {
    return commands.registerCommand('haskell.openDocumentationInBrowser', async (path: string) => {
      try {
        // when opened in default program, file URL ignores the # anchor tag at shows from the top
        // (at least on Windows) so must specify the browser explicitly
        // TODO : move chrome to the settings

        // open file in browser and close the webview in VS code
        await openPath(path, { app: 'chrome' });
        commands.executeCommand('workbench.action.closeActiveEditor');
      } catch (e) {
        window.showErrorMessage(e);
      }
    });
  }

  export function hoverLinksMiddlewareHook(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    next: ProvideHoverSignature
  ): ProviderResult<Hover> {
    const res = next(document, position, token);
    return Promise.resolve(res).then((r) => {
      if (r !== null && r !== undefined) {
        r.contents = r.contents.map(processLink);
      }
      return r;
    });
  }

  export function completionLinksMiddlewareHook(
    document: TextDocument,
    position: Position,
    context: CompletionContext,
    token: CancellationToken,
    next: ProvideCompletionItemsSignature
  ): ProviderResult<CompletionItem[] | CompletionList> {
    const res = next(document, position, context, token);

    function processCI(ci: CompletionItem): void {
      if (ci.documentation) {
        ci.documentation = processLink(ci.documentation);
      }
    }

    return Promise.resolve(res).then((r) => {
      if (r instanceof Array) {
        r.forEach(processCI);
      } else if (r) {
        r.items.forEach(processCI);
      }
      return r;
    });
  }

  function processLink(ms: MarkedString): string | MarkdownString {
    function transform(s: string): string {
      return s.replace(/\[(.+)\]\((file:.+\/doc\/.+\.html#?.*)\)/gi, (all, title, path) => {
        const encoded = encodeURIComponent(JSON.stringify({ title, path }));
        const cmd = 'command:haskell.showDocumentation?' + encoded;
        return `[${title}](${cmd})`;
      });
    }
    if (typeof ms === 'string') {
      return transform(ms as string);
    } else if (ms instanceof MarkdownString) {
      const mstr = new MarkdownString(transform(ms.value));
      mstr.isTrusted = true;
      return mstr;
    } else {
      return ms.value;
    }
  }
}
