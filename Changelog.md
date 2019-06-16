### 0.0.28

* remove unused `lsp` flag (@bubba)
* do not start `hie` if `hie-wrapper` crashes (@bubba)
* Expose diagnosticsOnChange option for settings (Frederik Ramcke)
* Avoid CVE on `extend` package
* Enable displaying window progress (@bubba)

### 0.0.27

* Re-enable search feature for documentation (@anonimitoraf)
  Accesed via `ctrl-f`.

### 0.0.26

* Show documentation content using Webview API (@EdAllonby)
* npm audit fix (@alanz)

### 0.0.25

* Add vsce dependency to "Contributing" document (@EdAllonby)
* Add formatterProvider config (@bubba)
* Bugfix for stack version on windows (@beauzeaux)
* Update settings to match hie version 0.7.0.0 (@alanz)
* npm audit fix (@bubba)

### 0.0.24

* Add snippet config option (@bubba)

### 0.0.23

* Fix multi-process issue, where vscode would launch multiple hie instances.
  By @kfigiela

### 0.0.22

* Add configuration option to enable liquid haskell processing. This
  is a preview feature of hie from
  ca2d3eaa19da8ec9d55521b461d8e2e8cffee697 on 2019-09-05.

### 0.0.21

* Remove languageServerHaskell.useHieWrapper, We now use hie-wrapper
  by default.
* Update the vscode-languageclient to v4.4.0
* Fix #98 Import identifier insertion line `moduleLine` is now the
  first line that is (trimmed) `where` or ends with `where` or ends
  with `)where`. (@mpilgrem)

### 0.0.20

* Add the case-split function (@txsmith). Required hie >= 0.2.1.0
* Update the vscode-languageclient to v4.2.0 (@Bubba)
* Use the hie-wrapper executable now installed with hie to choose the
  right version of hie to use for the given project.

### 0.0.19

* Fix hie launch on windows with logging off (#90). Thanks @Tehnix.

### 0.0.18

* Support GHC 8.4.3 in the wrapper file
* The `languageServerHaskell.trace.server` parameter now affects
  `/tmp/hie.log`, as well as ghc-mod `--vomit` output.
* Add an Import identifier command, by @chrismwendt

### 0.0.17

* Support GHC 8.4.2 in the wrapper file
* Update dependencies to avoid security vulnerability.
* Use os.tmpdir() for the hie.log file

### 0.0.15

Support the new webview-api for the documentation browser, thanks to @AlexeyRaga.

### 0.0.14

Revert `vscode-languageclient` dependency to version 3.5.0, since version 4.x for some
reason breaks the documentation browser.

### 0.0.13

Add configuration to set the path to your HIE executable, if it's not on your PATH. Note
that this adds the `--lsp` argument to the call of this executable.

### 0.0.12

Add configuration to enable/disable HIE, useful for multi-root workspaces.

### 0.0.11

Add additional marketplace categories.

### 0.0.10

Add support for multi-root workspaces, thanks to @tehnix. See the README section
on [_Using multi-root workspaces_](https://github.com/alanz/vscode-hie-server#using-multi-root-workspaces) for more.

### 0.0.9

Publish to the visual studio marketplace through travis CI via git tags. E.g.
`git tag -a 0.0.9 -m "Version 0.0.9"` and then `git push origin 0.0.9`.

### 0.0.8

Add new haskell-ide-engine logo, thanks to @damienflament

Add rudimentary support for detecting the project GHC version and using the
appropriate hie version. This currently only works on Linux (contributors on
other platforms, please jump in with appropriate scripts) and requires
`haskell-ide-engine` built via the `Makefile` added in
https://github.com/haskell/haskell-ide-engine/pull/447. Thanks to @Tehnix

### 0.0.7

Update `package-lock.json` to fresh dependencies.

Add show type _of selected expression_ on hover feature, by @halhenke

Added options for how to display the same information when using the show type
command menu, by @halhenke

Moved the configuration setting about showing trace information into the proper
scope, by @halhenke

### 0.0.6

Update `package-lock.json` to fresh dependencies.

Update the installation check on Win32 platforms, by @soylens.

Use `tslint` on the plugin sources, by @halhenke.

### 0.0.5

Stop the output channel from taking focus on startup, by @Tehnix and @halhenke

Rework and improve the document layout, for gihub and the marketplace, by @Tehnix

Set up Travis testing an potential auto-deply to marketplace, by @Tehnix

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

Initial release of haskell-ide-engine VS Code extension, for brave pioneers.
