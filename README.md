# Haskell Language Server README

This is the README for the extension "vscode-hie-server".

It is the client interface to the Language Server Protocol server for
Haskell, as provided by the Haskell Ide Engine.

It is still under development.

To make use of it, do the following

```bash
git clone https://github.com/haskell/haskell-ide-engine
cd haskell-ide-engine
stack install
```

This extension is not yet on the vscode marketplace.  To use it in vscode,

```bash
$ npm install -g vsce
$ vsce package
```

This will create a file something like `vscode-hie-server-0.0.1.vsix`
according to the current version.

In vscode, open the extensions tab, and click on the `...` at the top right of it,
and use the `Install from VSIX...` option to locate and install the generated file.


# The following is the initial boilerplate, to be filled in eventually

After writing up a brief description, we recommend including the following
sections.

## Features

Describe specific features of your extension including screenshots of your
extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to
> show off your extension! We recommend short, focused animations that are easy
> to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and
how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the
`contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

