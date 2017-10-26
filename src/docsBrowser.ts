import * as vscode from 'vscode';
import { ProvideHoverSignature } from 'vscode-languageclient';
import { workspace, Disposable, ExtensionContext, languages, commands,
    MarkedString, MarkdownString, TextDocument, CancellationToken,
    Position as VPosition, ProviderResult, Hover as VHover } from 'vscode';


export namespace DocsBrowser {
    'use strict';

    //registers the browser in VSCode infrastructure
    export function registerDocsBrowser(): Disposable {
        class DocumentationContentProvider implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
                let fsUri = uri.with({scheme: "file"});
                return `<iframe src="${fsUri}" frameBorder="0" style="background: white; width: 100%; height: 100%; position:absolute; left: 0; right: 0; bottom: 0; top: 0px;" />`;
            }
        }
        let provider = new DocumentationContentProvider();

        let docPreviewReg = vscode.workspace.registerTextDocumentContentProvider('doc-preview', provider);

        let disposable = vscode.commands.registerCommand('haskell.showDocumentation', ({ title, path }: { title: string, path: string }) => {
            let uri = vscode.Uri.parse(path).with({scheme: 'doc-preview'});
            let arr = uri.path.match(/([^\/]+)\.[^.]+$/);
            let ttl = arr.length == 2 ? arr[1].replace(/-/gi, ".") : title;
            return vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, ttl).then((success) => {
            }, (reason) => {
                vscode.window.showErrorMessage(reason);
            });
        });

        return disposable;
    }

    export function hoverLinksMiddlewareHook(document: TextDocument, position: VPosition, token: CancellationToken, next: ProvideHoverSignature): ProviderResult<VHover> {
        const res = next(document, position, token);
        return Promise.resolve(res).then(r => {
            r.contents = r.contents.map(processLink);
            return r;
        });
    }

    function processLink(ms: MarkedString): MarkedString {
        function transform(s: string): string {
             return s.replace(/\[(.+)\]\((file:.+\/doc\/.+\.html#?.+)\)/ig, (all, title, path) => {
                let encoded = encodeURIComponent(JSON.stringify({title: title, path: path}));
                let cmd = 'command:haskell.showDocumentation?' + encoded;
                return `[${title}](${cmd})`;
            });
        }
        if (typeof ms === 'string') {
            let mstr = new MarkdownString(transform(ms));
            mstr.isTrusted = true;
            return mstr;
        } else {
            return ms;
        }
    }
}