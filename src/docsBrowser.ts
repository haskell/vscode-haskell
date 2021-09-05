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
  workspace,
} from 'vscode';
import { ProvideCompletionItemsSignature, ProvideHoverSignature } from 'vscode-languageclient';

export namespace DocsBrowser {
  'use strict';

  async function showDocumentation({
    title,
    localPath,
    hackageUri,
  }: {
    title: string;
    localPath: string;
    hackageUri: string;
  }) {
    const arr = localPath.match(/([^\/]+)\.[^.]+$/);
    const ttl = arr !== null && arr.length === 2 ? arr[1].replace(/-/gi, '.') : title;
    const documentationDirectory = dirname(localPath);
    let panel;
    try {
      const docUri = Uri.parse(documentationDirectory);

      // Make sure to use Uri.parse here, as path will already have 'file:///' in it
      panel = window.createWebviewPanel('haskell.showDocumentationPanel', ttl, ViewColumn.Beside, {
        localResourceRoots: [docUri],
        enableFindWidget: true,
        enableCommandUris: true,
        enableScripts: true,
      });

      const encoded = encodeURIComponent(JSON.stringify({ hackageUri: hackageUri, inWebView: true }));
      const hackageCmd = 'command:haskell.openDocumentationOnHackage?' + encoded;

      const bytes = await workspace.fs.readFile(Uri.parse(localPath));

      const addBase = `
          <base href="${panel.webview.asWebviewUri(Uri.parse(documentationDirectory))}/">
          `;

      panel.webview.html = `
          <html>
          ${addBase}
          <body>
          <div><a href="${hackageCmd}">Open on Hackage</a></div>
          ${bytes.toString()}
          </body>
          </html>
          `;
    } catch (e) {
      await window.showErrorMessage(e);
    }
    return panel;
  }

  // registers the browser in VSCode infrastructure
  export function registerDocsBrowser(alwaysOpenInHackage: boolean): Disposable {
    if (alwaysOpenInHackage) {
      return commands.registerCommand('haskell.showDocumentation', openDocumentationOnHackage);
    } else {
      return commands.registerCommand('haskell.showDocumentation', showDocumentation);
    }
  }

  async function openDocumentationOnHackage({
    hackageUri,
    inWebView = false,
  }: {
    hackageUri: string;
    inWebView: boolean;
  }) {
    try {
      // open on Hackage and close the original webview in VS code
      await env.openExternal(Uri.parse(hackageUri));
      if (inWebView) {
        await commands.executeCommand('workbench.action.closeActiveEditor');
      }
    } catch (e) {
      await window.showErrorMessage(e);
    }
  }

  export function registerDocsOpenOnHackage(): Disposable {
    return commands.registerCommand('haskell.openDocumentationOnHackage', openDocumentationOnHackage);
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

  function processLink(ms: MarkdownString | MarkedString): string | MarkdownString {
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
