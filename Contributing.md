# Contributing

## Dependencies and Building

Run `npm install` in the project root to install the development dependencies.

You can also package up the extension with

- `npm install -g vsce` to get the Extension Manager,
- `npm install` to build the extension
- `vsce package` which creates an extension package at `haskell-<version>.vsix`.

_Note:_ that if you get errors running `vsce package`, it might help running `tsc -p ./` directly, since that gives the actual error output of the TypeScript compilation.

## Developing inside VS Code

- Launch VS Code, press `File` > `Open Folder`, open the `vscode-haskell` folder;
- press `F5` to open a new window with the `vscode-haskell` loaded (this will overwrite existing ones, e.g. from the marketplace);
- open a Haskell file with the **new** editor to test the LSP client;

You are now ready to make changes and debug. You can,

- set breakpoints in your code inside `src/extension.ts` to debug your extension;
- find output from your extension in the debug console;
- make changes to the code, and then
- relaunch the extension from the debug toolbar

_Note_: you can also reload (`Ctrl+R` or `Cmd+R` on macOS) the VS Code window with your extension to load your changes

#### Formatting

[prettier](https://prettier.io) is automatically run o neach commit via husky. If you are developing within VS Code, the settings are set to auto format on save.
The configurations for prettier are located in `.prettierrc`.

## Navigating the Files

A brief overview of the files,

- `package.json` contains the basic information about the package, see [the full manifest for more](https://code.visualstudio.com/docs/extensionAPI/extension-manifest), such as telling VS Code which scope the LSP works on (Haskell and Literate Haskell in our case), and possible configuration
- `src/extension.ts` is the main entrypoint to the extension, and handles launching the language server.
- `src/hlsBinaries.ts` handles automatically installing the pre-built `haskell-language-server` binaries
- `src/utils.ts` has some functions for downloading files and checking if executables are on the path
- `src/docsBrowser.ts` contains the logic for displaying the documentation browser (e.g. hover over a type like `mapM_` and click `Documentation` or `Source`)

## Helpful Reading Material

We recommend checking out [Your First VS Code Extension](https://code.visualstudio.com/docs/extensions/example-hello-world) and [Creating a Language Server](https://code.visualstudio.com/docs/extensions/example-language-server) for some introduction to VS Code extensions.
