# Contributing

This document will briefly outline how to get started contributing to the `vscode-hie-server` Haskell language client for the [Haskell-IDE-Engine](https://github.com/haskell/haskell-ide-engine) language server.

## Dependencies and Building

For development, all you need is to,

- run `npm install -g typescript` to get TypeScript,
- then run `npm install` in the project root to install development dependencies.

You can now also package up the extension with,

- `vsce package` 

which creates an extension package at `vscode-hie-server-<version>.vsix`.

_Note:_ that if you get errors running `vsce package`, it might help running `tsc -p ./` directly, since that gives the actual error output of the TypeScript compilation.

## Developing
* Launch VS Code, press `File` > `Open Folder`, open the `vscode-hie-server` folder;
* press `F5` to open a new window with the `vscode-hie-server` loaded (this will overwrite existing ones, e.g. from the marketplace);
* open a Haskell file with the __new__ editor to test the LSP client;

You are now ready to make changes and debug. You can,

* set breakpoints in your code inside `src/extension.ts` to debug your extension;
* find output from your extension in the debug console;
* make changes to the code, and then
* relaunch the extension from the debug toolbar

_Note_: you can also reload (`Ctrl+R` or `Cmd+R` on macOS) the VS Code window with your extension to load your changes

## What's in the folder
* This folder contains all of the files necessary for your extension
* `package.json` - this is the manifest file in which you declare your extension and command.
The sample plugin registers a command and defines its title and command name. With this information
VS Code can show the command in the command palette. It doesn’t yet need to load the plugin.
* `src/extension.ts` - this is the main file where you will provide the implementation of your command.
The file exports one function, `activate`, which is called the very first time your extension is
activated (in this case by executing the command). Inside the `activate` function we call `registerCommand`.
We pass the function containing the implementation of the command as the second parameter to
`registerCommand`.

## Explore the API
* you can open the full set of our API when you open the file `node_modules/vscode/vscode.d.ts`

## Run tests
* open the debug viewlet (`Ctrl+Shift+D` or `Cmd+Shift+D` on Mac) and from the launch configuration dropdown pick `Launch Tests`
* press `F5` to run the tests in a new window with your extension loaded
* see the output of the test result in the debug console
* make changes to `test/extension.test.ts` or create new test files inside the `test` folder
    * by convention, the test runner will only consider files matching the name pattern `**.test.ts`
    * you can create folders inside the `test` folder to structure your tests any way you want