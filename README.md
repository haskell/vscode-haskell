# Haskell for Visual Studio Code

[![](https://vsmarketplacebadge.apphb.com/version/haskell.haskell.svg)](https://marketplace.visualstudio.com/items?itemName=haskell.haskell)

This extension adds language support for [Haskell](https://haskell.org), powered by the [Haskell Language Server](https://github.com/haskell/haskell-language-server).

## Features

- Warning and error diagnostics from GHC
- Type information and documentation on hover
- Jump to definition
- Document symbols
- Highlight references in document
- Code completion
- Formatting via Brittany, Floskell, Ormolu or Stylish Haskell
- [Multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) support
- Code evaluation (Haskell Language Server)

  ![Eval](https://i.imgur.com/bh992sT.gif)

## Requirements

- For standalone `.hs`/`.lhs` files, [ghc](https://www.haskell.org/ghc/) must be installed and on the PATH. The easiest way to install it is with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Cabal based projects, both ghc and [cabal-install](https://www.haskell.org/cabal/) must be installed and on the PATH. It can also be installed with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Stack based projects, [stack](http://haskellstack.org) must be installed and on the PATH.

## Language Servers

Whilst this extension is powered by the Haskell Language Server by default, it also supports several others which can be manually installed:

- [Haskell Language Server](https://github.com/haskell/haskell-language-server#installation): This is the default language server which will automatically be downloaded, so it does not need manual installation. It builds upon ghcide by providing extra plugins and features.
- [ghcide](https://github.com/digital-asset/ghcide#install-ghcide): A fast and reliable LSP server with support for [basic features](https://github.com/digital-asset/ghcide#features).
- [Haskell IDE Engine](https://github.com/haskell/haskell-ide-engine#installation): A legacy language server, you probably shouldn't use this one. Haskell Language Server replaces it instead.

You can choose which language server to use from the "Haskell > Language Server Variant" configuration option.

## Configuration options

### Path to server executable executable

If your server is manually installed and not on your path, you can also manually set the path to the executable.

```json
"haskell.serverExecutablePath": "~/.local/bin/hie"
```

There are a few placeholders which will be expanded:

- `~`, `${HOME}` and `${home}` will be expanded into your users' home folder.
- `${workspaceFolder}` and `${workspaceRoot}` will expand into your current project root.

## Haskell Language Server specifics

### Local documentation

Haskell Language Server can display Haddock documentation on hover and completions if the project and
its dependencies have been built with the `-haddock` GHC flag.

- For cabal:

  - Add to your global config file (e.g. `~/.cabal/config`):
    ```
    program-default-options
      ghc-options: -haddock
    ```
  - Or, for a single project, run `cabal configure --ghc-options=-haddock`

- For stack, add to global `$STACK_ROOT\config.yaml`, or project's `stack.yaml`:
  ```
  ghc-options:
    "$everything": -haddock
  ```
  Note that this flag will cause compilation errors if a dependency contains invalid Haddock markup,
  until GHC 8.12 which [will report warnings](https://gitlab.haskell.org/ghc/ghc/-/merge_requests/2377)
  instead.

### Downloaded binaries

This extension will download `haskell-language-server` binaries to a specific location depending on your system. If you find yourself running out of disk space, you can try deleting old versions of language servers in this directory. The extension will redownload them, no strings attached.

| Platform | Path                                                                      |
| -------- | ------------------------------------------------------------------------- |
| macOS    | `~/Library/Application\ Support/Code/User/globalStorage/haskell.haskell/` |
| Windows  | `%APPDATA%\Code\User\globalStorage\haskell.haskell`                       |
| Linux    | `$HOME/.config/Code/User/globalStorage/haskell.haskell`                   |

Note that if `haskell-language-server-wrapper`/`haskell-language-server` is already on the PATH, then the extension will launch it directly instead of downloading binaries.

### Supported GHC versions

These are the versions of GHC that there are binaries of `haskell-language-server` for. Building from source may support more versions!

| GHC    | Linux | macOS | Windows |
| ------ | ----- | ----- | ------- |
| 8.10.2 | ✓     | ✓     | ✓       |
| 8.10.1 | ✓     | ✓     | ✓       |
| 8.8.4  | ✓     | ✓     | ✓       |
| 8.8.3  | ✓     | ✓     | ✓       |
| 8.8.2  | ✓     | ✓     |         |
| 8.6.5  | ✓     | ✓     | ✓       |
| 8.6.4  | ✓     | ✓     | ✓       |

## Using multi-root workspaces

First, check out [what multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) are. The idea of using multi-root workspaces, is to be able to work on several different Haskell projects, where the GHC version or stackage LTS could differ, and have it work smoothly.

The language server is now started for each workspace folder you have in your multi-root workspace, and several configurations are on a resource (i.e. folder) scope, instead of window (i.e. global) scope.

## Investigating and reporting problems

1.  Go to extensions and right click `Haskell` and choose `Configure Extensions Settings`
2.  Scroll down to `Language Server Haskell › Trace: Server` and set it to `verbose`
3.  Restart vscode and reproduce your problem
4.  Go to the main menu and choose `View -> Output` (`Ctrl + Shift + U`)
5.  On the new Output panel that opens on the right side in the drop down menu choose `Haskell`

Please include the output when filing any issues on the relevant language server's issue tracker.

### Troubleshooting

- Sometimes the language server might get stuck in a rut and stop responding to your latest changes.
  Should this occur you can try restarting the language server with <kbd>Ctrl</kbd> <kbd>shift</kbd> <kbd>P</kbd>/<kbd>⌘</kbd> <kbd>shift</kbd> <kbd>P</kbd> > Restart Haskell LSP Server.
- Usually the error or unexpected behaviour is already reported in the haskell language server [used by the extension](#hie-variant). Finding the issue in its issue tracker could be useful to help resolve it. Sometimes even it includes a workaround for the issue.
- Haskell language servers issue trackers:
  - haskell-language-server: https://github.com/haskell/haskell-language-server/issues
  - ghcide: https://github.com/haskell/ghcide/issues
- _Common issues_:
  - For now, the extension is not able to open a single haskell source file. You need to open a workspace or folder, configured to be built with cabal, stack or other hie-bios compatible program.
  - Check you don't have other haskell extensions active, they can interfere with each other.

## Contributing

If you want to help, get started by reading [Contributing](https://github.com/haskell/vscode-haskell/blob/master/Contributing.md) for more details.

## Release Notes

See the [Changelog](https://github.com/haskell/vscode-haskell/blob/master/Changelog.md) for more details.
