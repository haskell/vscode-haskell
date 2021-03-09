import { dirname } from 'path';
import {
  CancellationToken,
  commands,
  CompletionContext,
  CompletionItem,
  CompletionList,
  Disposable,
  env,
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
    return commands.registerCommand(
      'haskell.showDocumentation',
      async ({ title, localPath, hackageUri }: { title: string; localPath: string; hackageUri: string }) => {
        const arr = localPath.match(/([^\/]+)\.[^.]+$/);
        const ttl = arr !== null && arr.length === 2 ? arr[1].replace(/-/gi, '.') : title;
        const documentationDirectory = dirname(localPath);
        let panel;
        try {
          // Make sure to use Uri.parse here, as path will already have 'file:///' in it
          panel = window.createWebviewPanel('haskell.showDocumentationPanel', ttl, ViewColumn.Beside, {
            localResourceRoots: [Uri.parse(documentationDirectory)],
            enableFindWidget: true,
            enableCommandUris: true,
          });
          const uri = panel.webview.asWebviewUri(Uri.parse(localPath));

          const encoded = encodeURIComponent(JSON.stringify({ hackageUri }));
          const hackageCmd = 'command:haskell.openDocumentationOnHackage?' + encoded;

          panel.webview.html = `<div><a href="${hackageCmd}">Open on Hackage</a></div>
          <div><iframe src="${uri}" frameBorder = "0" style = "background: white; width: 100%; height: 100%; position:absolute; left: 0; right: 0; bottom: 0; top: 30px;"/></div>`;
        } catch (e) {
          await window.showErrorMessage(e);
        }
        return panel;
      }
    );
  }

  export function registerDocsOpenOnHackage(): Disposable {
    return commands.registerCommand(
      'haskell.openDocumentationOnHackage',
      async ({ hackageUri }: { hackageUri: string }) => {
        try {
          // open on Hackage and close the original webview in VS code
          await env.openExternal(Uri.parse(hackageUri));
          await commands.executeCommand('workbench.action.closeActiveEditor');
        } catch (e) {
          await window.showErrorMessage(e);
        }
      }
    );
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
      return s.replace(
        /\[(.+)\]\((file:.+\/doc\/(?:.*html\/libraries\/)?([^\/]+)\/(src\/)?(.+\.html#?.*))\)/gi,
        (all, title, localPath, packageName, maybeSrcDir, fileAndAnchor) => {
          if (!maybeSrcDir) {
            maybeSrcDir = '';
          }
          const hackageUri = `https://hackage.haskell.org/package/${packageName}/docs/${maybeSrcDir}${fileAndAnchor}`;
          const encoded = encodeURIComponent(JSON.stringify({ title, localPath, hackageUri }));
          const cmd = 'command:haskell.showDocumentation?' + encoded;
          return `[${title}](${cmd})`;
        }
      );
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
