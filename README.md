# Haskell for Visual Studio Code

This is the Visual Studio Code extension for the [Haskell programming language](https://haskell.org), powered by the [Haskell Langauge Server](https://github.com/haskell/haskell-language-server).

## Features

- Warning and error diagnostics
- Code actions and quick-fixes via [`apply-refact`](https://github.com/mpickering/apply-refact) (click the lightbulb)
- Type information and documentation on hover
- Jump to definition (`F12` or `Go to Definition` in the command palette)
- List all top level definitions
- Highlight references in document
- Code completion
- Formatting via [`brittany`](https://github.com/lspitzner/brittany) (`^ ⌥ B` or `Format Document` in command palette)
- [Multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) support

## Requirements

- For standalone `.hs`/`.lhs` files, [ghc](https://www.haskell.org/ghc/) must be installed and on the PATH. The easiest way to install it is with [ghcup](https://www.haskell.org/ghcup/).
- For Cabal based projects, [cabal-install](https://www.haskell.org/cabal/) must be installed and on the PATH. It can also be installed with [ghcup](https://www.haskell.org/ghcup/).
- For Stack based projects, [stack](http://haskellstack.org) must be installed and on the PATH.

## Supported GHC versions

| GHC    | Linux | macOS | Windows |
| ------ | ----- | ----- | ------- |
| 8.10.1 | ✓     | ✓     | ✓       |
| 8.8.3  | ✓     | ✓     |
| 8.8.2  | ✓     | ✓     |
| 8.6.5  | ✓     | ✓     | ✓       |
| 8.6.4  | ✓     | ✓     | ✓       |

## Language Servers

This extension also supports several other language servers for Haskell, some which need to be manually installed:

- [Haskell Language Server](https://github.com/haskell/haskell-language-server#installation): This is the default language server which will automatically be downloaded, so no installation should be needed. It builds upon ghcide by providing extra plugins and features.
- [ghcide](https://github.com/digital-asset/ghcide#install-ghcide): A fast and reliable LSP server with support for [basic features](https://github.com/digital-asset/ghcide#features).
- [Haskell IDE Engine](https://github.com/haskell/haskell-ide-engine#installation): A stable and mature language server, but note that development has moved from this to the Haskell Language Server.

## Extension Settings

You can disable HLint and also control the maximum number of reported problems,

```json
"haskell.hlintOn": true,
"haskell.maxNumberOfProblems": 100,
```

If the liquid haskell executable is installed, enable using it to
process haskell files on save.

```json
"haskell.liquidOn": true,
```

### Enable/disable server

You can enable or disable the chosen haskell language server via configuration. This is sometimes useful at workspace level, because multi-root workspaces do not yet allow you to manage extensions at the folder level, which can be necessary.

```json
"haskell.enable": true
```

### Path to server executable executable

If your server is manually installed and not on your path, you can also manually set the path to the executable.

```json
"haskell.serverExecutablePath": "~/.local/bin/hie"
```

There are a few placeholders which will be expanded:

- `~`, `${HOME}` and `${home}` will be expanded into your users' home folder.
- `${workspaceFolder}` and `${workspaceRoot}` will expand into your current project root.

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

## Downloaded language servers

This extension will download the language server binaries to a specific location depending on your system. If you find yourself running out of disk space, you can try deleting old versions of language servers in this directory. The extension will redownload them, no strings attached.
| Platform | Path |
|----------|------|
| macOS | `~/Library/Application\ Support/Code/User/globalStorage/alanz.vscode-hie-server/` |
| Windows | `%APPDATA%\Code\User\globalStorage\alanz.vscode-hie-server` |
| Linux | TODO |


## Investigating and reporting problems

1.  Go to extensions and right click `Haskell Language Server` and choose `Configure Extensions Settings`
2.  Scroll down to `Language Server Haskell › Trace: Server` and set it to `verbose`
3.  Restart vscode and reproduce your problem
4.  Go to the main menu and choose `View -> Output` (`Ctrl + Shift + U`)
5.  On the new Output panel that opens on the right side in the drop down menu choose `Haskell HIE (cabal)`

Now you will see the information which you can use to diagnose or report a problem

### Troubleshooting

* Usually the error or unexpected behaviour is already reported in the haskell language server [used by the extension](#hie-variant). Finding the issue in its issue tracker could be useful to help resolve it. Sometimes even it includes a workaround for the issue.
* Haskell language servers issue trackers:
  * haskell-ide-engine (the default haskell language server): https://github.com/haskell/haskell-ide-engine/issues
  * haskell-language-server: https://github.com/haskell/haskell-language-server/issues
* *Common issues*:
  * For now, the extension is not able to open a single haskell source file. You need to open a workspace or folder, configured to be built with cabal, stack or other hie-bios compatible program.
  * Check you don't have other haskell extensions active, they can interfere with each other.
## Contributing

If you want to help, get started by reading [Contributing](https://github.com/alanz/vscode-hie-server/blob/master/Contributing.md) for more details.

## Release Notes

See the [Changelog](https://github.com/alanz/vscode-hie-server/blob/master/Changelog.md) for more details.
