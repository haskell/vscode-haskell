# Haskell for Visual Studio Code

[![vsmarketplacebadge](https://vsmarketplacebadge.apphb.com/version/haskell.haskell.svg)](https://marketplace.visualstudio.com/items?itemName=haskell.haskell)

This extension adds language support for [Haskell](https://haskell.org), powered by the [Haskell Language Server](https://github.com/haskell/haskell-language-server).

## Features

- Warning and error diagnostics from GHC
- Type information and documentation on hover
- Jump to definition
- Document symbols
- Highlight references in document
- Code completion
- Formatting via Brittany, Floskell, Fourmolu, Ormolu or Stylish Haskell
- [Multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) support
- Code evaluation (Haskell Language Server), see ([Tutorial](https://github.com/haskell/haskell-language-server/blob/master/plugins/hls-eval-plugin/README.md))

  ![Eval Demo](https://raw.githubusercontent.com/haskell/haskell-language-server/master/plugins/hls-eval-plugin/demo.gif)

- Integration with [retrie](https://hackage.haskell.org/package/retrie)

  ![Retrie Demo](https://i.imgur.com/Ev7B87k.gif)

- Code lenses for explicit import lists

  ![Imports code lens Demo](https://imgur.com/pX9kvY4.gif)

- Generate functions from type signatures, and intelligently complete holes using [Wingman (tactics)](https://github.com/haskell/haskell-language-server/tree/master/plugins/hls-tactics-plugin)

  ![Wingman Demo](https://user-images.githubusercontent.com/307223/92657198-3d4be400-f2a9-11ea-8ad3-f541c8eea891.gif)

- Integration with [hlint](https://github.com/ndmitchell/hlint) to show diagnostics and apply hints via [apply-refact](https://github.com/mpickering/apply-refact)

  ![Hlint Demo](https://user-images.githubusercontent.com/54035/110860028-8f9fa900-82bc-11eb-9fe5-6483d8bb95e6.gif)

- Module name suggestions for insertion or correction

  ![Module Name Demo](https://user-images.githubusercontent.com/54035/110860755-78ad8680-82bd-11eb-9845-9ea4b1cc1f76.gif)

## Requirements

- For standalone `.hs`/`.lhs` files, [ghc](https://www.haskell.org/ghc/) must be installed and on the PATH. The easiest way to install it is with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Cabal based projects, both ghc and [cabal-install](https://www.haskell.org/cabal/) must be installed and on the PATH. It can also be installed with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Stack based projects, [stack](http://haskellstack.org) must be installed and on the PATH.

## Configuration options

### Path to server executable executable

If your server is manually installed and not on your path, you can also manually set the path to the executable.

```json
"haskell.serverExecutablePath": "~/.local/bin/haskell-language-server"
```

There are a few placeholders which will be expanded:

- `~`, `${HOME}` and `${home}` will be expanded into your users' home folder.
- `${workspaceFolder}` and `${workspaceRoot}` will expand into your current project root.

#### Security warning

The option has `resource` scope so it can be changed per workspace.
This supposes it could be used to execute arbitrary programs adding a `.vscode/settings.json` in the workspace folder including this option with the appropiate path.
For this reason its scope will be changed to `machine` so users only will be able to change it globally.
See #387 for more details.

### Local documentation

Haskell Language Server can display Haddock documentation on hover and completions if the project and
its dependencies have been built with the `-haddock` GHC flag.

- For cabal:

  - Add to your global config file (e.g. `~/.cabal/config`):

    ```yaml
    program-default-options
      ghc-options: -haddock
    ```

  - Or, for a single project, run `cabal configure --ghc-options=-haddock`

- For stack, add to global `$STACK_ROOT\config.yaml`, or project's `stack.yaml`:

  ```yaml
  ghc-options:
    '$everything': -haddock
  ```

  Note that this flag will cause compilation errors if a dependency contains invalid Haddock markup,
  until GHC 9.0 which [will report warnings](https://gitlab.haskell.org/ghc/ghc/-/merge_requests/2377)
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

| GHC                                                                              | Linux | macOS | Windows |
| -------------------------------------------------------------------------------- | ----- | ----- | ------- |
| 9.0.1 ([limited](https://github.com/haskell/haskell-language-server/issues/297)) | ✓     | ✓     | ✓       |
| 8.10.5                                                                           | ✓     | ✓     | ✓       |
| 8.10.4                                                                           | ✓     | ✓     | ✓       |
| 8.10.3                                                                           | ✓     | ✓     | ✓       |
| 8.10.2                                                                           | ✓     | ✓     | ✓       |
| 8.8.4                                                                            | ✓     | ✓     | ✓       |
| 8.8.3                                                                            | ✓     | ✓     |         |
| 8.8.2                                                                            | ✓     | ✓     |         |
| 8.6.5                                                                            | ✓     | ✓     | ✓       |
| 8.6.4                                                                            | ✓     | ✓     | ✓       |

The exact list of binaries can be checked in the last release of haskell-language-server: <https://github.com/haskell/haskell-language-server/releases/latest>

## Using multi-root workspaces

First, check out [what multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) are. The idea of using multi-root workspaces, is to be able to work on several different Haskell projects, where the GHC version or stackage LTS could differ, and have it work smoothly.

The language server is now started for each workspace folder you have in your multi-root workspace, and several configurations are on a resource (i.e. folder) scope, instead of window (i.e. global) scope.

## Investigating and reporting problems

1. Go to extensions and right click `Haskell Language Server` and choose `Extensions Settings`
2. Scroll down to `Language Server Haskell › Trace: Server` and set it to `messages`
3. Restart vscode and reproduce your problem
4. Go to the main menu and choose `View -> Output` (`Ctrl + Shift + U`)
5. On the new Output panel that opens on the right side in the drop down menu choose `Haskell (<your project>)`

Please include the output when filing any issues on the [haskell-language-server](https://github.com/haskell/haskell-language-server/issues/new) issue tracker.

### Troubleshooting

- Sometimes the language server might get stuck in a rut and stop responding to your latest changes.
  Should this occur you can try restarting the language server with <kbd>Ctrl</kbd> <kbd>shift</kbd> <kbd>P</kbd>/<kbd>⌘</kbd> <kbd>shift</kbd> <kbd>P</kbd> > Restart Haskell LSP Server.
- Usually the error or unexpected behaviour is already reported in the [haskell language server issue tracker](https://github.com/haskell/haskell-language-server/issues). Finding the issue could be useful to help resolve it and sometimes includes a workaround for the issue.

## Contributing

If you want to help, get started by reading [Contributing](https://github.com/haskell/vscode-haskell/blob/master/Contributing.md) for more details.

## Release Notes

See the [Changelog](https://github.com/haskell/vscode-haskell/blob/master/Changelog.md) for more details.
