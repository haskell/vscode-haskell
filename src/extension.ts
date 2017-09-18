'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import * as vscode from 'vscode';

import * as path from 'path';

import { workspace, Disposable, ExtensionContext, languages, commands } from 'vscode';
import { LanguageClient, LanguageClientOptions,
		 SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';
import { RequestType, Range, Position } from 'vscode-languageclient';

import * as msg from 'vscode-jsonrpc';
import * as vscode from 'vscode';

import { InsertType } from './commands/insertType';
import { ShowType } from './commands/showType';

// --------------------------------------------------------------------
// Example from https://github.com/Microsoft/vscode/issues/2059
const fixProvider = {
    provideCodeActions: function(document, range, context, token) {
        return [{ title: "Command", command: "cursorUp" }];
    }
};

// --------------------------------------------------------------------

export function activate(context: ExtensionContext) {
    // const fixer = languages.registerCodeActionsProvider("haskell", fixProvider);
    // context.subscriptions.push(fixer);
	// The server is implemented in node
	//let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
	let startupScript = ( process.platform == "win32" ) ? "hie-vscode.bat" : "hie-vscode.sh";
	let serverPath = context.asAbsolutePath(path.join('.', startupScript));
	let serverExe =  { command: serverPath }
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let tempDir = ( process.platform == "win32" ) ? "%TEMP%" : "/tmp";
	let serverOptions: ServerOptions = {
		//run : { module: serverModule, transport: TransportKind.ipc },
		//debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
		run : { command: serverPath },
		debug: { command: serverPath, args: ["-d", "-l", path.join(tempDir, "hie.log")] }
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: ['haskell'],
		synchronize: {
			// Synchronize the setting section 'languageServerHaskell' to the server
			configurationSection: 'languageServerHaskell',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	// Create the language client and start the client.
	let langClient = new LanguageClient('Language Server Haskell', serverOptions, clientOptions);

	context.subscriptions.push(InsertType.registerCommand(langClient));
	ShowType.registerCommand(langClient).forEach(x => context.subscriptions.push(x));

	registerHiePointCommand(langClient,"hie.commands.demoteDef","hare:demote",context);
	registerHiePointCommand(langClient,"hie.commands.liftOneLevel","hare:liftonelevel",context);
	registerHiePointCommand(langClient,"hie.commands.liftTopLevel","hare:lifttotoplevel",context);
	registerHiePointCommand(langClient,"hie.commands.deleteDef","hare:deletedef",context);
	registerHiePointCommand(langClient,"hie.commands.genApplicative","hare:genapplicative",context);
	let disposable = langClient.start();

	context.subscriptions.push(disposable);
}

function registerHiePointCommand(langClient:LanguageClient,name:string,command:string,context:ExtensionContext) {
	let cmd2 = vscode.commands.registerTextEditorCommand(name, (editor, edit) => {
		let cmd = {
			command: command,
			arguments: [
				{
					file: editor.document.uri.toString(),
					pos: editor.selections[0].active
				}
			]
		};

		langClient.sendRequest("workspace/executeCommand", cmd).then(hints => {
			return true;
		}, e => {
			console.error(e);
		});
	});
	context.subscriptions.push(cmd2)
}
