# Haskell for Visual Studio Code

[![vsmarketplacebadge](https://vsmarketplacebadge.apphb.com/version/haskell.haskell.svg)](https://marketplace.visualstudio.com/items?itemName=haskell.haskell)

This extension adds language support for [Haskell](https://haskell.org), powered by the [Haskell Language Server](https://github.com/haskell/haskell-language-server).
As almost all features are provided by the server you might find interesting read its [documentation](https://haskell-language-server.readthedocs.io).

## Setup

This Extension comes with "batteries"-included and can manage your Haskell Language Server installations for you,
powered by [GHCup](https://www.haskell.org/ghcup/).
Installation of [GHCup](https://www.haskell.org/ghcup/) can not happen automatically, so if you want your HLS installations to be
managed by the Extension, you will have to follow the [installation instructions for GHCup](https://www.haskell.org/ghcup/).

**Note:** Make sure you have a working `ghcup` installation, before launching the Extension.

## Features

You can watch demos for some of these features [here](https://haskell-language-server.readthedocs.io/en/latest/features.html#demos).

- Warning and error diagnostics from GHC
- Type information and documentation on hover, [including your own comments](./configuration.md#how-to-show-local-documentation-on-hover).
- Jump to definition: [for now only for local code definitions](https://github.com/haskell/haskell-language-server/issues/708)
- Document symbols
- Highlight references in document
- Code completion
- Show documentation and sources in hackage
- Formatting via [Brittany](https://github.com/lspitzner/brittany), [Floskell](https://github.com/ennocramer/floskell), [Fourmolu](https://github.com/fourmolu/fourmolu), [Ormolu](https://github.com/tweag/ormolu) or [Stylish Haskell](https://github.com/haskell/stylish-haskell)
- [Multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces) support
- [Code evaluation](https://haskell-language-server.readthedocs.io/en/latest/features.html#code-evaluation), see its [Tutorial](https://github.com/haskell/haskell-language-server/blob/master/plugins/hls-eval-plugin/README.md)
- [Integration with](https://haskell-language-server.readthedocs.io/en/latest/features.html#retrie-integration) [retrie](https://hackage.haskell.org/package/retrie), a powerful, easy-to-use codemodding tool
- [Code lenses for explicit import lists](https://haskell-language-server.readthedocs.io/en/latest/features.html#explicit-import-lists)
- [Generate functions from type signatures, and intelligently complete holes using](https://haskell-language-server.readthedocs.io/en/latest/features.html#wingman) [Wingman (tactics)](https://github.com/haskell/haskell-language-server/tree/master/plugins/hls-tactics-plugin)
- [Integration](https://haskell-language-server.readthedocs.io/en/latest/features.html#hlint) with [hlint](https://github.com/ndmitchell/hlint), the most used haskell linter, to show diagnostics and apply hints via [apply-refact](https://github.com/mpickering/apply-refact)
- [Module name suggestions](https://haskell-language-server.readthedocs.io/en/latest/features.html#module-names) for insertion or correction
- [Call hierarchy support](https://haskell-language-server.readthedocs.io/en/latest/features.html#call-hierarchy)

## Requirements

- For standalone `.hs`/`.lhs` files, [ghc](https://www.haskell.org/ghc/) must be installed and on the PATH. The easiest way to install it is with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Cabal based projects, both ghc and [cabal-install](https://www.haskell.org/cabal/) must be installed and on the PATH. It can also be installed with [ghcup](https://www.haskell.org/ghcup/) or [Chocolatey](https://www.haskell.org/platform/windows.html) on Windows.
- For Stack based projects, [stack](http://haskellstack.org) must be installed and on the PATH.
- If you are installing from an offline VSIX file, you need to install [language-haskell](https://github.com/JustusAdam/language-haskell) too after installation (either from the marketplace or offline).
- Alternatively, you can let the extension manage your entire toolchain automatically (you'll be asked on first startup) via
  [ghcup](https://www.haskell.org/ghcup/), which should be pre-installed

## Configuration options

For a general picture about the server configuration, including the project setup, [you can consult the server documentation about the topic](https://haskell-language-server.readthedocs.io/en/latest/configuration.html).

### Path to server executable

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

### Set additional environment variables for the server

You can add additional environment variables for the lsp server using the configuration option `haskell.serverEnvironment`. For example, to change the cache directory used by the server you could set:

```json
{ "haskell.serverEnvironment": { "XDG_CACHE_HOME": "/path/to/my/cache" } }
```

as the server uses the XDG specification for cache directories.

The environment _only will be visible for the lsp server_, not for other extension tasks like find the server executable.

### Downloaded binaries

This extension will download `haskell-language-server` binaries and the rest of the toolchain if you selected to use GHCup during
first start. Check the `haskell.manageHLS` setting.

It will then download the newest version of haskell-language-server which has support for the required ghc.
That means it could use an older version than the latest one, without the last features and bug fixes.
For example, if a project needs ghc-8.10.4 the extension will download and use haskell-language-server-1.4.0, the latest version which supported ghc-8.10.4. Even if the latest global haskell language-server version is 1.5.1.

If you have disk space issues, check `ghcup gc --help`.

You can also instruct the extension to use a different installation directory for the toolchain,
e.g. to not interfere with system GHCup installation. Depending on your platform, add the full
resolved path like so:

```json
  "haskell.serverEnvironment": {
    "GHCUP_INSTALL_BASE_PREFIX": "/home/foo/.config/Code/User/globalStorage/haskell.haskell/"
  }
```

The internal storage paths for the extension depend on the platform:

| Platform | Path                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| macOS    | `~/Library/Application\ Support/Code/User/globalStorage/haskell.haskell/.ghcup` |
| Windows  | `%APPDATA%\Code\User\globalStorage\haskell.haskell\ghcup`                       |
| Linux    | `$HOME/.config/Code/User/globalStorage/haskell.haskell/.ghcup`                  |

If you want to manage HLS yourself, set `haskell.manageHLS` to `PATH` and make sure HLS is in your PATH
or set `haskell.serverExecutablePath` (overrides all other settings) to a valid executable.

If you need to set mirrors for ghcup download info, check the settings `haskell.metadataURL` and `haskell.releasesURL`.

### Setting a specific toolchain

When `manageHLS` is set to `GHCup`, you can define a specific toolchain (`hls`, `ghc`, `cabal` and `stack`),
either globally or per project. E.g.:

```json
{
  "haskell.toolchain": {
    "hls": "1.6.1.1",
    "cabal": "recommended",
    "stack": null
  }
}
```

This means:

1. install the `ghc` version corresponding to the project (default, because it's omitted)
2. install `hls` 1.6.1.1
3. install the recommended `cabal` version from ghcup
4. don't install any `stack` version

Another config could be:

```json
{
  "haskell.toolchain": {
    "ghc": "9.2.2",
    "hls": "latest",
    "cabal": "recommended"
  }
}
```

Meaning:

1. install `ghc` 9.2.2 regardless of what the project requires
2. always install latest `hls`, even if it doesn't support the given GHC version
3. install recommended `cabal`
4. install latest `stack` (default, because it's omitted)

The defaults (when omitted) are as follows:

1. install the project required `ghc` (corresponding to `with-compiler` setting in `cabal.project` for example)
2. install the latest `hls` version that supports the project required ghc version
3. install latest `cabal`
4. install latest `stack`

When a the value is `null`, the extension will refrain from installing it.

At last, if you don't want `ghcup` to manage any of the external tools except `hls`, you can use:

```json
{
  "haskell.toolchain": {
    "ghc": null,
    "cabal": null,
    "stack": null
  }
}
```

### Supported GHC versions

These are the versions of GHC that there are binaries of `haskell-language-server-1.7.0` for. Building from source may support more versions!

| GHC                                                                               | Linux | macOS | Windows |
| --------------------------------------------------------------------------------- | ----- | ----- | ------- |
| 9.2.2 ([limited](https://github.com/haskell/haskell-language-server/issues/2179)) | ✓     | ✓     | ✓       |
| 9.2.1 ([limited](https://github.com/haskell/haskell-language-server/issues/2179)) | ✓     | ✓     | ✓       |
| 9.0.2 ([limited](https://github.com/haskell/haskell-language-server/issues/297))  | ✓     | ✓     | ✓       |
| 8.10.7                                                                            | ✓     | ✓     | ✓       |
| 8.8.4                                                                             | ✓     | ✓     | ✓       |
| 8.6.5                                                                             | ✓     | ✓     | ✓       |

The exact list of binaries can be checked in the last release of haskell-language-server: <https://github.com/haskell/haskell-language-server/releases/latest>

You can check the current GHC versions support status and the policy followed for deprecations [here](https://haskell-language-server.readthedocs.io/en/latest/supported-versions.html).

## Using multi-root workspaces

First, check out [what multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) are. The idea of using multi-root workspaces, is to be able to work on several different Haskell projects, where the GHC version or stackage LTS could differ, and have it work smoothly.

The language server is now started for each workspace folder you have in your multi-root workspace, and several configurations are on a resource (i.e. folder) scope, instead of window (i.e. global) scope.

## Investigating and reporting problems

1. Go to extensions and right click `Haskell` and choose `Extensions Settings`
2. Scroll down to `Haskell › Trace: Server` and set it to `messages`.
3. Set `Haskell › Trace: Client` to `debug`. It will print all the environment variables so take care it does not contain any sensible information before sharing it.
4. Restart vscode and reproduce your problem
5. Go to the main menu and choose `View -> Output` (`Ctrl + Shift + U`)
6. On the new Output panel that opens on the right side in the drop down menu choose `Haskell (<your project>)`

Please include the output when filing any issues on the [haskell-language-server](https://github.com/haskell/haskell-language-server/issues/new) issue tracker.

## FAQ

### Troubleshooting

#### Check issues and tips in the haskell-language-server project

- Usually the error or unexpected behaviour is already reported in the [haskell language server issue tracker](https://github.com/haskell/haskell-language-server/issues). Finding the issue could be useful to help resolve it and sometimes includes a workaround for the issue.
- You can also check the [troubleshooting section](https://haskell-language-server.readthedocs.io/en/latest/troubleshooting.html) in the server documentation.

#### Restarting the language server

- Sometimes the language server might get stuck in a rut and stop responding to your latest changes.
  Should this occur you can try restarting the language server with <kbd>Ctrl</kbd> <kbd>shift</kbd> <kbd>P</kbd>/<kbd>⌘</kbd> <kbd>shift</kbd> <kbd>P</kbd> > Restart Haskell LSP Server.

#### `Failed to get project GHC version` on darwin M1 with stack

If you have installed stack via the official cannels, the binary will not be M1 native, but x86 and trigger the rosetta compatibility layer. GHCup provides real stack/HLS M1 binaries, so make sure you install stack via GHCup. Also see https://github.com/haskell/haskell-language-server/issues/2864

#### `GHC ABIs don't match`

If you're running stack with GHC 9.0.2, you will get this because of an outdated
GHC bindist that stack installs.

Force it to install the fixed bindist (that includes profiling libs) by adding this to your stack.yaml (depending on your platform):

```yml
setup-info:
  ghc:
    linux64-tinfo6:
      9.0.2:
        url: "https://downloads.haskell.org/ghc/9.0.2/ghc-9.0.2a-x86_64-fedora27-linux.tar.xz"
```

Alternatively let GHCup install the correct bindist and then set `system-ghc: true` in your `stack.yaml`.

Now make sure to remove cached/installed libraries to avoid getting segfaults at runtime.

If you hit this problem although you're not using stack or GHC 9.0.2, please report an issue. As a workaround, you can try to compile HLS from source (the extension should pick it up) via ghcup, see [https://haskell-language-server.readthedocs.io/en/stable/installation.html#ghcup](https://haskell-language-server.readthedocs.io/en/stable/installation.html#ghcup).

#### Using an old configuration

If something just doesn't work, but you recall an old configuration that did, you
may try forcing a particular setting, e.g. by disabling all automatic installations
except HLS:

```json
    "haskell.toolchain": {
        "hls": "1.6.1.0",
        "ghc": null,
        "cabal": null,
        "stack": null
    }
```

#### Stack/Cabal/GHC can not be found

Also make sure GHCup is installed and in `PATH`. If you're not starting VSCode from the terminal, you might need to add `${HOME}/.ghcup/bin` to PATH like so:

```json
  "haskell.serverEnvironment": {
    "PATH": "${HOME}/.ghcup/bin:$PATH"
  }
```

## Contributing

If you want to help, get started by reading [Contributing](https://github.com/haskell/vscode-haskell/blob/master/Contributing.md) for more details.

## Release Notes

See the [Changelog](https://github.com/haskell/vscode-haskell/blob/master/Changelog.md) for more details.
