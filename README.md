# Haskell Language Server Client

Client interface to the Language Server Protocol server for Haskell, as provided by the [Haskell IDE Engine](https://github.com/haskell/haskell-ide-engine), [ghcide](https://github.com/digital-asset/ghcide) or the new [Haskell Language Server](https://github.com/haskell/haskell-language-server).
Check the [requirements](#user-content-requirements) for dependencies.

**It is still under development!** If you want to help, get started by reading [Contributing](https://github.com/alanz/vscode-hie-server/blob/master/Contributing.md) for more details.

## Requirements

The language client requires you to manually install at least one of:

* [Haskell IDE Engine](https://github.com/haskell/haskell-ide-engine#installation): It was the unique haskell LSP server supported by this extension until version `0.40.0`. It is stable and functional but it will be replaced sooner or later by the new Haskell Language Server (see below).
* [ghcide](https://github.com/digital-asset/ghcide#install-ghcide): A fast and reliable LSP server with the [main basic features](https://github.com/digital-asset/ghcide#features). Supported since the `0.40.0` version of the extension.
* [Haskell language server](https://github.com/haskell/haskell-language-server#installation): The future successor of haskell-ide-engine. It is still under heavy development and it does not have all the features of haskell-ide-engine, yet, so use at your own risk! It is supported since the `0.40.0` version of the extension.

## Features

Language server client for haskell using the [HIE](https://github.com/haskell/haskell-ide-engine) language server. Supports,

* Diagnostics via HLint and GHC warnings/errors
* Code actions and quick-fixes via [`apply-refact`](https://github.com/mpickering/apply-refact) (click the lightbulb)
* Type information and documentation (via hoogle) on hover
* Jump to definition (`F12` or `Go to Definition` in command palette)
* List all top level definitions
* Highlight references in document
* Completion
* Formatting via [`brittany`](https://github.com/lspitzner/brittany) (`^ ⌥ B` or `Format Document` in command palette)
* Renaming via [`HaRe`](https://github.com/alanz/HaRe) (`F2` or `Rename Symbol` in command palette)
* [Multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) support

Additionally the language server itself features,

* Supports plain GHC projects, cabal projects and stack projects
* Fast due to caching of compile info

The other two language servers ([ghcide](https://github.com/digital-asset/ghcide#features) and haskell-language-server) have a subset of the features described above.

## Supported GHC versions

vscode-hie-server depends on the chosen haskell language server to support different versions of GHC. At the moment of writing the following versions are supported using Haskell Ide Engine: 8.4, 8.6 and 8.8. ghcide and Haskell Language Server also have support for ghc 8.10. If your project uses any other GHC version it won't work.

## Extension Settings

You can disable HLint and also control the maximum number of reported problems,

```json
"languageServerHaskell.hlintOn": true,
"languageServerHaskell.maxNumberOfProblems": 100,
```

If the liquid haskell executable is installed, enable using it to
process haskell files on save.

```json
"languageServerHaskell.liquidOn": true,
```

### HIE Variant

Since `0.40` the extension has a selection over the three supported language servers:
`haskell-ide-engine`, `ghcide` and `haskell-language-server`.
The default one is `haskell-ide-engine`, although it will be changed by `haskell-language-server`
when it will be stable enough.

The extension will look for the language server executable in `$PATH` and it will call it
with the appropiate params depending on the extension settings.
However, not all extension settings can be applied to all the language servers:

* `haskell-ide-engine`: It supports all of them.
* `ghcide`: It does not support any of them.
* `haskell-language-server`: For now it only supports the log related settings: `Log File` and `Trace:server`. The goal is to support the same settings as `haskell-ide-engine`.

### Enable/disable HIE

You can enable or disable the chosen haskell language server via configuration. This is sometimes useful at workspace level, because multi-root workspaces do not yet allow you to manage extensions at the folder level, which can be necessary.

```json
"languageServerHaskell.enableHIE": true
```

### Path for hie executable

If your chosen haskell language server executable is not on your path, you can manually set it,

```json
"languageServerHaskell.hieExecutablePath": "~/.local/bin/hie"
```

There are a few placeholders which will be expanded:

* `~`, `${HOME}` and `${home}` will be expanded into your users' home folder.
* `${workspaceFolder}` and `${workspaceRoot}` will expand into your current project root.

## Docs on Hover/Generating Hoogle DB

For the most current documentation on this, see [Docs on Hover/Completion](https://github.com/haskell/haskell-ide-engine#docs-on-hovercompletion).

HIE supports fetching docs from haddock on hover. It will fallback on using a hoogle db(generally located in ~/.hoogle on linux)
if no haddock documentation is found.

To generate haddock documentation for stack projects:

```bash
$ cd your-project-directory
$ stack haddock --keep-going
```

To enable documentation generation for cabal projects, add the following to your ~/.cabal/config

```json
documentation: True
```

To generate a hoogle database that hie can use

```bash
$ cd haskell-ide-engine
$ stack --stack-yaml=<stack.yaml you used to build hie> exec hoogle generate
```

For now `ghcide`and `haskell-language-server` have not that fallback to the hoogle database, so
you should generate haddock documentation as described above.

## Manual Installation

Either install the extension via the marketplace (preferred), or if you are testing an unreleased version by,

```bash
$ npm install -g vsce
$ git clone https://github.com/alanz/vscode-hie-server
$ cd vscode-hie-server
$ npm ci
$ vsce package
```

This will create a file something like `vscode-hie-server-<version>.vsix`
according to the current version.

In VS Code, open the extensions tab, and click on the `...` at the top right of it,
and use the `Install from VSIX...` option to locate and install the generated file.

## Using multi-root workspaces

First, check out [what multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) are. The idea of using multi-root workspaces, is to be able to work on several different Haskell projects, where the GHC version or stackage LTS could differ, and have it work smoothly.

HIE is now started for each workspace folder you have in your multi-root workspace, and several configurations are on a resource (i.e. folder) scope, instead of window (i.e. global) scope.

## Investigating and reporting problems

1.  Go to extensions and right click `Haskell Language Server` and choose `Configure Extensions Settings`
2.  Scroll down to `Language Server Haskell › Trace: Server` and set it to `verbose`
3.  Restart vscode and reproduce your problem
4.  Go to the main menu and choose `View -> Output` (`Ctrl + Shift + U`)
5.  On the new Output panel that opens on the right side in the drop down menu choose `Haskell HIE (cabal)`

Now you will see the information which you can use to diagnose or report a problem

### Troubleshooting

* Usually the error or unexpected behaviour is already reported in issue tracker of the haskell language server [used by the extension](#hie-variant). Finding the issue in its issue tracker could be useful to help resolve it. Sometimes even it includes a workaround for the issue.
* Haskell language servers issue trackers:
  * haskell-ide-engine (the default haskell language server): https://github.com/haskell/haskell-ide-engine/issues
  * haskell-language-server: https://github.com/haskell/haskell-language-server/issues
* *Common issues*:
  * For now, the extension is not able to open a single haskell source file. You need to open a workspace or folder, configured to be built with cabal, stack or other hie-bios compatible program.
  * Check you don't have other haskell extensions active, they can interfere with each other.

## Release Notes

See the [Changelog](https://github.com/alanz/vscode-hie-server/blob/master/Changelog.md) for more details.
