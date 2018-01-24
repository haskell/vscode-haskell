### 0.0.8

Add new haskell-ide-engine logo, thanks to @damienflament

Add rudimentary support for detecting the project GHC version and using the
appropriate hie version. This currently only works on Linux (contributors on
other platforms, please jump in with appropriate scripts) and requires
`haskell-ide-engine` built via the `Makefile` added in
https://github.com/haskell/haskell-ide-engine/pull/447.  Thanks to @Tehnix

### 0.0.7

Update `package-lock.json` to fresh dependencies.

Add show type *of selected expression* on hover feature, by @halhenke

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
