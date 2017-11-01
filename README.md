# Haskell Language Server

[Available on the VSCode marketplace](https://marketplace.visualstudio.com/items?itemName=alanz.vscode-hie-server)

Client interface to the Language Server Protocol server for Haskell, as provided by the Haskell IDE Engine.

It is still under development.

To make use of it, do the following

```bash
git clone https://github.com/haskell/haskell-ide-engine
cd haskell-ide-engine
stack install
```

Also, make sure the extension is installed in vscode, either via the
marketplace (preferred), or if you are testing an unreleased version by

```bash
$ npm install -g vsce
$ vsce package
```

This will create a file something like `vscode-hie-server-0.0.3.vsix`
according to the current version.

In vscode, open the extensions tab, and click on the `...` at the top right of it,
and use the `Install from VSIX...` option to locate and install the generated file.

## Features

Language server client for haskell.

## Requirements

If you have any requirements or dependencies, add a section describing those and
how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the
`contributes.configuration` extension point.

None at present

## Known Issues

Only works for GHC 8.0.2 projects at the moment

## Release Notes

### 0.0.4

Show documents in a tab, by @AlexeyRaga

Add a configuration option to enable/disable `hlint`.

### 0.0.3

Add "Haskell: Show type" command, bound to Ctrl-alt-t (Cmd-alt-t on mac). This
calls the `ghc-mod` `type` command on the current cursor location or highlighted
region. Thanks to @AlexeyRaga

Add a check for having the `hie` executable in the path on startup, to prevent
an endless failure to start if the executable is not there. Thanks to @DavidEichman

### 0.0.2

Add some HaRe commands, accesible via the command palette.

### 0.0.1

Initial release of haskell-ide-engine vscode extension, for brave pioneers.

