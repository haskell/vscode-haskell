# Contributing

This document will briefly outline how to get started contributing to the `vscode-hie-server` Haskell language client for the [Haskell-IDE-Engine](https://github.com/haskell/haskell-ide-engine) language server.

## Dependencies and Building

For development, all you need is to,

* run `npm install -g typescript` to get [TypeScript](https://www.typescriptlang.org),
* run `npm install -g webpack` to get [Webpack](https://webpack.js.org),
* then run `npm install` in the project root to install development dependencies.

You can now also package up the extension with,

* `npm install -g vsce` to get the Extension Manager,
* `vsce package` which creates an extension package at `vscode-hie-server-<version>.vsix`.

_Note:_ that if you get errors running `vsce package`, it might help running `tsc -p ./` directly, since that gives the actual error output of the TypeScript compilation.

## Developing

* Launch VS Code, press `File` > `Open Folder`, open the `vscode-hie-server` folder;
* press `F5` to open a new window with the `vscode-hie-server` loaded (this will overwrite existing ones, e.g. from the marketplace);
* open a Haskell file with the **new** editor to test the LSP client;

You are now ready to make changes and debug. You can,

* set breakpoints in your code inside `src/extension.ts` to debug your extension;
* find output from your extension in the debug console;
* make changes to the code, and then
* relaunch the extension from the debug toolbar

_Note_: you can also reload (`Ctrl+R` or `Cmd+R` on macOS) the VS Code window with your extension to load your changes

#### Formatting

To keep a consistent style, it's best to run [prettier](https://prettier.io) on each save. If you are using VSCode, the settings are set to auto format on save.

There is usually an extension for your editor for prettier, e.g. [`esbenp.prettier-vscode`](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode), which you can install through the marketplace or via `ext install prettier-vscode`.

The configurations for prettier are located in `.prettierrc`.

## Navigating the Files

A brief overview of the files,

* `package.json` contains the basic information about the package, see [the full manifest for more](https://code.visualstudio.com/docs/extensionAPI/extension-manifest), such as telling VS Code which scope the LSP works on (Haskell and Literate Haskell in our case), and possible configuration
* `src/extension.ts` handles activating and deactivating the HIE language server, along with checking if HIE is installed
* `src/docsBrowser.ts` contains the logic for displaying the documentation browser (e.g. hover over a type like `mapM_` and click `Documentation` or `Source`)
* `src/commands/constants.ts` simply exports the rest of the commands in folder
* `src/commands/showType.ts` handles showing a type using `ghcmod:type`
* `src/commands/insertType.ts` handles inserting a type using the output of `ghcmod:type`

## Helpful Reading Material

We recommend checking out [Your First VS Code Extension](https://code.visualstudio.com/docs/extensions/example-hello-world) and [Creating a Language Server](https://code.visualstudio.com/docs/extensions/example-language-server) for some introduction to VS Code extensions.

## Running tests

There are two ways to run (the same) tests, you can either

* press `F8` to run the tests using `npm test`

or

* open the debug viewlet (`Ctrl+Shift+D` or `Cmd+Shift+D` on Mac) and from the launch configuration dropdown pick `Launch Tests`
* press `F5` to run the tests in a new window with your extension loaded
* see the output of the test result in the debug console
* make changes to `test/extension.test.ts` or create new test files inside the `test` folder
  * by convention, the test runner will only consider files matching the name pattern `**.test.ts`
  * you can create folders inside the `test` folder to structure your tests any way you want
