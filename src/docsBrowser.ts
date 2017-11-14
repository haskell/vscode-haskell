import * as vscode from 'vscode';
import {
    CancellationToken,
    commands,
    Disposable,
    ExtensionContext,
    Hover as VHover,
    languages,
    MarkdownString,
    MarkedString,
    Position as VPosition,
    ProviderResult,
    TextDocument,
    workspace
} from 'vscode';
import { ProvideHoverSignature } from 'vscode-languageclient';

export namespace DocsBrowser {
    'use strict';

    // registers the browser in VSCode infrastructure
    export function registerDocsBrowser(): Disposable {
        class DocumentationContentProvider implements vscode.TextDocumentContentProvider {
            public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
                const fsUri = uri.with({scheme: 'file'});
                // tslint:disable-next-line:max-line-length
                return `<iframe src="${fsUri}" frameBorder="0" style="background: white; width: 100%; height: 100%; position:absolute; left: 0; right: 0; bottom: 0; top: 0px;" />`;
            }
        }
        const provider = new DocumentationContentProvider();

        const docPreviewReg = vscode.workspace.registerTextDocumentContentProvider('doc-preview', provider);

        const disposable = vscode.commands.registerCommand('haskell.showDocumentation',
            async ({ title, path }: { title: string, path: string }) => {
                const uri = vscode.Uri.parse(path).with({scheme: 'doc-preview'});
                const arr = uri.path.match(/([^\/]+)\.[^.]+$/);
                const ttl = arr.length === 2 ? arr[1].replace(/-/gi, '.') : title;
                let result;
                try {
                    result = await vscode
                        .commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, ttl);
                } catch (e) {
                    vscode.window.showErrorMessage(e);
                }
                return result;
                // return vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, ttl)
                //     .catch((reason) => { vscode.window.showErrorMessage(reason); });
            // return vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, ttl)
                //     .then((success) => {
                //     }, (reason) => {
                //         vscode.window.showErrorMessage(reason);
                //     });
        });

        return disposable;
    }

    export function hoverLinksMiddlewareHook(
            document: TextDocument,
            position: VPosition, token: CancellationToken, next: ProvideHoverSignature): ProviderResult<VHover> {
        const res = next(document, position, token);
        return Promise.resolve(res).then(r => {
            r.contents = r.contents.map(processLink);
            return r;
        });
    }

    function processLink(ms: MarkedString): MarkedString {
        function transform(s: string): string {
             return s.replace(/\[(.+)\]\((file:.+\/doc\/.+\.html#?.+)\)/ig, (all, title, path) => {
                const encoded = encodeURIComponent(JSON.stringify({title, path}));
                const cmd = 'command:haskell.showDocumentation?' + encoded;
                return `[${title}](${cmd})`;
            });
        }
        if (typeof ms === 'string') {
            const mstr = new MarkdownString(transform(ms));
            mstr.isTrusted = true;
            return mstr;
        } else {
            return ms;
        }
    }
}
