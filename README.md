# Haskell Language Server Client
Client interface to the Language Server Protocol server for Haskell, as provided by the Haskell IDE Engine. Check the [requirements](#user-content-requirements) for dependencies.

__It is still under development!__ If you want to help, get started by reading [Contributing](https://github.com/alanz/vscode-hie-server/blob/master/Contributing.md) for more details.

## Requirements
The language client requires you to manually install the [HIE](https://github.com/haskell/haskell-ide-engine) language server,

```bash
$ git clone https://github.com/haskell/haskell-ide-engine
$ cd haskell-ide-engine
$ stack install
```

## Features
Language server client for haskell using the [HIE](https://github.com/haskell/haskell-ide-engine) language server. Supports,

- Diagnostics via HLint and GHC warnings/errors
- Code actions and quick-fixes via [`apply-refact`](https://github.com/mpickering/apply-refact) (click the lightbulb)
- Type information and documentation (via hoogle) on hover
- Jump to definition (`F12` or `Go to Definition` in command palette)
- List all top level definitions
- Highlight references in document
- Completion
- Formatting via [`brittany`](https://github.com/lspitzner/brittany) (`^ ⌥ B` or `Format Document` in command palette)
- Renaming via [`HaRe`](https://github.com/alanz/HaRe) (`F2` or `Rename Symbol` in command palette)

Additionally the language server itself features,
- Supports plain GHC projects, cabal projects (sandboxed and non sandboxed) and stack projects
- Fast due to caching of compile info

## Extension Settings
You can disable HLint and also control the maximum number of reported problems,

```json
"languageServerHaskell.hlintOn": true,
"languageServerHaskell.maxNumberOfProblems": 100,
```

#### HIE Wrapper

Furthermore, the extension supports multiple ways of initializing hie, depending on your needs. The first one is to use the hie-wrapper that follows this extension, and tries to pick the right hie for your GHC version. The following,

```json
"languageServerHaskell.useHieWrapper": true,
```

makes VSCode use the `hie-wrapper.sh` file to start hie through. This does assume that you built the hie executable using make build, but will fall back to plain hie.

#### Custom Wrapper

If you need more control, and want to have a custom wrapper, either in your specific project or somewhere else on your computer, you can set a custom wrapper via,

```json
"languageServerHaskell.useCustomHieWrapper": true,
"languageServerHaskell.useCustomHieWrapperPath": "~/wrapper-in-home.sh",
```

There are a few placeholders which will be expanded:

- `~`, `${HOME}` and `${home}` will be expanded into your users' home folder.
- `${workspaceFolder}` and `${workspaceRoot}` will expand into your current project root.

This can be beneficial if you are using something like nix, to have a wrapper script tailored to your setup.

## Manual Installation
Either install the extension via the marketplace (preferred), or if you are testing an unreleased version by,

```bash
$ npm install -g vsce
$ git clone https://github.com/alanz/vscode-hie-server
$ cd vscode-hie-server
$ npm install
$ vsce package
```

This will create a file something like `vscode-hie-server-<version>.vsix`
according to the current version.

In VS Code, open the extensions tab, and click on the `...` at the top right of it,
and use the `Install from VSIX...` option to locate and install the generated file.

## Known Issues
Only works for GHC 8.0.2 projects at the moment.

## Release Notes

See the [Changelog](https://github.com/alanz/vscode-hie-server/blob/master/Changelog.md) for more details.
