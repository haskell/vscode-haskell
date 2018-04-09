import {
  CancellationToken,
  commands,
  Disposable,
  Hover as VHover,
  MarkdownString,
  MarkedString,
  Position as VPosition,
  ProviderResult,
  TextDocument,
  TextDocumentContentProvider,
  Uri,
  ViewColumn,
  window,
  workspace
} from 'vscode';
import { ProvideHoverSignature } from 'vscode-languageclient';

export namespace DocsBrowser {
  'use strict';

  // registers the browser in VSCode infrastructure
  export function registerDocsBrowser(): Disposable {
    class DocumentationContentProvider implements TextDocumentContentProvider {
      public provideTextDocumentContent(uri: Uri, token: CancellationToken): string {
        const fsUri = uri.with({ scheme: 'file' });
        // tslint:disable-next-line:max-line-length
        return `<iframe src="${fsUri}" frameBorder="0" style="background: white; width: 100%; height: 100%; position:absolute; left: 0; right: 0; bottom: 0; top: 0px;" />`;
      }
    }
    const provider = new DocumentationContentProvider();

    const contentDisposable = workspace.registerTextDocumentContentProvider('doc-preview', provider);

    const commandDisposable = commands.registerCommand(
      'haskell.showDocumentation',
      async ({ title, path }: { title: string; path: string }) => {
        const uri = Uri.parse(path).with({ scheme: 'doc-preview' });
        const arr = uri.path.match(/([^\/]+)\.[^.]+$/);
        const ttl = arr !== null && arr.length === 2 ? arr[1].replace(/-/gi, '.') : title;
        let result;
        try {
          result = await commands.executeCommand('vscode.previewHtml', uri, ViewColumn.Two, ttl);
        } catch (e) {
          window.showErrorMessage(e);
        }
        return result;
      }
    );

    return Disposable.from(contentDisposable, commandDisposable);
  }

  export function hoverLinksMiddlewareHook(
    document: TextDocument,
    position: VPosition,
    token: CancellationToken,
    next: ProvideHoverSignature
  ): ProviderResult<VHover> {
    const res = next(document, position, token);
    return Promise.resolve(res).then(r => {
      if (r !== null && r !== undefined) {
        r.contents = r.contents.map(processLink);
      }
      return r;
    });
  }

  function processLink(ms: MarkedString): MarkedString {
    function transform(s: string): string {
      return s.replace(/\[(.+)\]\((file:.+\/doc\/.+\.html#?.+)\)/gi, (all, title, path) => {
        const encoded = encodeURIComponent(JSON.stringify({ title, path }));
        const cmd = 'command:haskell.showDocumentation?' + encoded;
        return `[${title}](${cmd})`;
      });
    }
    if (typeof ms === 'string') {
      const mstr = new MarkdownString(transform(ms));
      mstr.isTrusted = true;
      return mstr;
    } else if (typeof ms === 'object') {
      const mstr = new MarkdownString(transform(ms.value));
      mstr.isTrusted = true;
      return mstr;
    } else {
      return ms;
    }
  }
}
