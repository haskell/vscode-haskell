# Changelog for vscode-haskell

## 2.6.0

- Upgrade project to use latest eslint version
  ([#1150](https://github.com/haskell/vscode-haskell/pull/1150))  by @fendor
- Fix windows CI
  ([#1149](https://github.com/haskell/vscode-haskell/pull/1149))  by @fendor
- Manually install ghcup into image
  ([#1119](https://github.com/haskell/vscode-haskell/pull/1119))  by @fendor
- bump vscode-languageclient version to 9.0.1
  ([#1108](https://github.com/haskell/vscode-haskell/pull/1108))  by @jetjinser
- Add cabalFormattingProvider to package.json
  ([#1100](https://github.com/haskell/vscode-haskell/pull/1100))  by @fendor
- Prepare 2.4.4
  ([#1083](https://github.com/haskell/vscode-haskell/pull/1083))  by @fendor

## 2.5.3

- Split out packaging action
  ([#1080](https://github.com/haskell/vscode-haskell/pull/1080)) by @fendor
- Add Session Loading style to list of known configs
  ([#1077](https://github.com/haskell/vscode-haskell/pull/1077)) by @fendor
- Tooling update
  ([#1043](https://github.com/haskell/vscode-haskell/pull/1043)) by @bzm3r
- Add `haskell.plugin.fourmolu.config.path` option
  ([#987](https://github.com/haskell/vscode-haskell/pull/987)) by @georgefst

## 2.5.2

- Includes changes of the 2.4.3 release

## 2.5.1

- Includes changes of the 2.4.2 release

## 2.5.0

- Add tracking of cabal files
  ([#618](https://github.com/haskell/vscode-haskell/pull/618)) by @fendor

## 2.4.3

- Address invalid byte sequence error #1022
  ([#1022](https://github.com/haskell/vscode-haskell/pull/1022)) by @felixlinker
- Always set the cwd for the executable (#1011)
  ([#1011](https://github.com/haskell/vscode-haskell/pull/1011)) by @fendor

## 2.4.2

- Add stan plugin option #1000
  ([#1000](https://github.com/haskell/vscode-haskell/pull/1000)) by @fendor
- Probe for GHCup binary wrt #962
  ([#963](https://github.com/haskell/vscode-haskell/pull/963)) by @hasufell
- Bump old hls version and upgrade test runner to macos-latest
  ([#960](https://github.com/haskell/vscode-haskell/pull/960)) by @July541
- Increase time limitation to make test on Windows more stable
  ([#959](https://github.com/haskell/vscode-haskell/pull/959)) by @July541
- Update release docs for refreshing CI tokens
  ([#942](https://github.com/haskell/vscode-haskell/pull/942)) by @fendor

## 2.4.1

- Downgrade vscode-languageclient
  ([#934](https://github.com/haskell/vscode-haskell/pull/934)) by @fendor
- Bump vscode to 1.80.0
  ([#912](https://github.com/haskell/vscode-haskell/pull/912)) by @July541

## 2.4.0

- Prepare release 2.4.0
  ([#906](https://github.com/haskell/vscode-haskell/pull/906)) by @VeryMilkyJoe
- Simplify tests
  ([#904](https://github.com/haskell/vscode-haskell/pull/904)) by @July541
- Remove unused code
  ([#898](https://github.com/haskell/vscode-haskell/pull/898)) by @fendor
- Remove hoogle command from vscode extension
  ([#896](https://github.com/haskell/vscode-haskell/pull/896)) by @fendor
- Update readme
  ([#886](https://github.com/haskell/vscode-haskell/pull/886)) by @VeryMilkyJoe
- Fix broken tests
  ([#880](https://github.com/haskell/vscode-haskell/pull/880)) by @July541
- Update README.md: clarify how to use Stack with vscode-haskell extension
  ([#874](https://github.com/haskell/vscode-haskell/pull/874)) by @miguel-negrao
- Remove debugger tools from CI
  ([#873](https://github.com/haskell/vscode-haskell/pull/873)) by @fendor
- Refactor tests to work correctly
  ([#872](https://github.com/haskell/vscode-haskell/pull/872)) by @July541
- Downgrade vscode language client to 7.0.0
  ([#853](https://github.com/haskell/vscode-haskell/pull/853)) by @fendor
- Update badge url for VSCode Marketplace
  ([#851](https://github.com/haskell/vscode-haskell/pull/851)) by @fendor

## 2.2.4

- Downgrade vscode language client to 7.0.0
  ([#843](https://github.com/haskell/vscode-haskell/pull/853)) by @fendor

## 2.2.3

- Prepare release 2.2.3
  ([#843](https://github.com/haskell/vscode-haskell/pull/843)) by @fendor
- Add new plugins fields
  ([#842](https://github.com/haskell/vscode-haskell/pull/842)) by @fendor
  - Migrate to eslint
    ([#782](https://github.com/haskell/vscode-haskell/pull/782)) by @fendor
- Bump minor versions of package dependencies
  ([#781](https://github.com/haskell/vscode-haskell/pull/781)) by @fendor
- Update unsupported GHC doc link
  ([#776](https://github.com/haskell/vscode-haskell/pull/776)) by @limaak
- Fix release CI
  ([#775](https://github.com/haskell/vscode-haskell/pull/775)) by @fendor
- Fix mistake in generated ChangeLog
  ([#774](https://github.com/haskell/vscode-haskell/pull/774)) by @fendor

## 2.2.2

- Add link to HLS installation webpage
  ([#751](https://github.com/haskell/vscode-haskell/pull/751)) by @fendor
- Change scope of serverExecutablePath to machine-overridable
  ([#742](https://github.com/haskell/vscode-haskell/pull/742)) by @fendor
- Add Fourmolu config property
  ([#736](https://github.com/haskell/vscode-haskell/pull/736)) by @georgefst
- Add missing configuration options for the latest HLS version
  ([#717](https://github.com/haskell/vscode-haskell/pull/717)) by @fendor
- Change sensible to sensitive
  ([#709](https://github.com/haskell/vscode-haskell/pull/709)) by @ploeh

## 2.2.1

- Fix test-suite for new GHCUp release
  ([#672](https://github.com/haskell/vscode-haskell/pull/672)) by @fendor
- Bump webpack from 5.73.0 to 5.74.0
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump typescript from 4.4.0 to 4.7.4
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump @types/node from 18.0.4 to 18.6.1
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump @typescript-eslint/eslint-plugin from 5.30.6 to 5.31.0
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump @typescript-eslint/parser from 5.30.6 to 5.31.0
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump prettier from 2.6.2 to 2.7.1
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Bump mocha from 9.2.1 to 10.0.0
  ([#657](https://github.com/haskell/vscode-haskell/pull/657)) by @fendor
- Add dependabot.yml
  ([#633](https://github.com/haskell/vscode-haskell/pull/633)) by @fendor
- Replace x32 with ia32 for Architecture matching
  ([#631](https://github.com/haskell/vscode-haskell/pull/631)) by @fendor
- Toolchain management dialog: add hint for beginners
  ([#621](https://github.com/haskell/vscode-haskell/pull/621)) by @runeksvendsen
- Fix trace.server option
  ([#617](https://github.com/haskell/vscode-haskell/pull/617)) by @coltenwebb
- Add TOC
  ([#615](https://github.com/haskell/vscode-haskell/pull/615)) by @hasufell
- Cleanups
  ([#605](https://github.com/haskell/vscode-haskell/pull/605)) by @hasufell
- Link to VSCode settings page
  ([#603](https://github.com/haskell/vscode-haskell/pull/603)) by @hasufell
- Refactor toInstall shenanigans
  ([#600](https://github.com/haskell/vscode-haskell/pull/600)) by @hasufell
- Fix confusing download dialog popup
  ([#599](https://github.com/haskell/vscode-haskell/pull/599)) by @hasufell
- More troubleshooting
  ([#598](https://github.com/haskell/vscode-haskell/pull/598)) by @hasufell

## 2.2.0

- Bump version to 2.2.0 (Syncs up pre-release and release version)
  ([#594](https://github.com/haskell/vscode-haskell/pull/594)) by @fendor

## 2.0.1

- Bad error message when ghcup is not installed
  ([#591](https://github.com/haskell/vscode-haskell/pull/591)) by @hasufell
- Better error message if we can't find a HLS version for a given GHC
  ([#588](https://github.com/haskell/vscode-haskell/pull/588)) by @hasufell
- Properly convert release metadata from json
  ([#585](https://github.com/haskell/vscode-haskell/pull/585)) by @fendor
- Ignore missing entries in Release Metadata
  ([#582](https://github.com/haskell/vscode-haskell/pull/582)) by @fendor
- Add Tool class and print stacktraces
  ([#579](https://github.com/haskell/vscode-haskell/pull/579)) by @fendor
- List Env Vars we care about only
  ([#578](https://github.com/haskell/vscode-haskell/pull/578)) by @fendor
- Prepare pre-release 2.1.0
  ([#574](https://github.com/haskell/vscode-haskell/pull/574)) by @fendor
- Enable pre-release feature for VSX Marketplace
  ([#573](https://github.com/haskell/vscode-haskell/pull/573)) by @fendor
- Add prettier script
  ([#566](https://github.com/haskell/vscode-haskell/pull/566)) by @fendor
- Remove accidental run command
  ([#565](https://github.com/haskell/vscode-haskell/pull/565)) by @fendor
- Upgrade dependencies
  ([#564](https://github.com/haskell/vscode-haskell/pull/564)) by @fendor
- Add new configuration options for rename plugin
  ([#563](https://github.com/haskell/vscode-haskell/pull/563)) by @OliverMadine
- Introduce 'haskell.toolchain' setting
  ([#562](https://github.com/haskell/vscode-haskell/pull/562)) by @hasufell
- Improve
  ([#558](https://github.com/haskell/vscode-haskell/pull/558)) by @hasufell
- Remove stdout/sterr from user error message
  ([#556](https://github.com/haskell/vscode-haskell/pull/556)) by @fendor
- Fix npm security issue
  ([#555](https://github.com/haskell/vscode-haskell/pull/555)) by @fendor
- No colour output for GHCup
  ([#554](https://github.com/haskell/vscode-haskell/pull/554)) by @fendor
- Add eval plugin configuration
  ([#549](https://github.com/haskell/vscode-haskell/pull/549)) by @xsebek
- Manage all the Haskell things
  ([#547](https://github.com/haskell/vscode-haskell/pull/547)) by @hasufell
- Consider user installed HLSes (e.g. via ghcup compile)
  ([#543](https://github.com/haskell/vscode-haskell/pull/543)) by @hasufell
- Update README.MD GHC support
  ([#537](https://github.com/haskell/vscode-haskell/pull/537)) by @cptwunderlich
- fix: change deprecated Haskell Platform install link to GHCup
  ([#536](https://github.com/haskell/vscode-haskell/pull/536)) by @HEIGE-PCloud
- Update HLS installation method
  ([#533](https://github.com/haskell/vscode-haskell/pull/533)) by @hasufell
- Fixes related with paths
  ([#518](https://github.com/haskell/vscode-haskell/pull/518)) by @jneira
- Reorganize troubleshooting section
  ([#516](https://github.com/haskell/vscode-haskell/pull/516)) by @jneira

## 1.8.0

This release includes some interesting new features:

- You can now pass custom environment variables to the lsp server
  with the `haskell.serverEnvironment` config option per project basis,
  thanks to [@jacobprudhomme](https://github.com/jacobprudhomme).
  - For example: `"haskell.serverEnvironment": { "XDG_CACHE_HOME": "/path/to/my/cache" }`
- With this version the extension will try to use the newer lsp server version
  which supports the ghc used by the project being loaded, thanks to [@mduerig](https://github.com/mduerig)
  - WARNING: This will suppose it will use an older version than the latest one,
    without its features and bug fixes.
- The extension has lot of more log traces now, which hopefully will help to
  identify the cause of issues

### Pull requests merged for 1.8.0

- Update supported ghc versions for hls-1.5.1
  ([#514](https://github.com/haskell/vscode-haskell/pull/514)) by @jneira
- Fix hole_severity option: Use integer instead of string
  ([#511](https://github.com/haskell/vscode-haskell/pull/511)) by @mirko-plowtech
- Update issue templates
  ([#509](https://github.com/haskell/vscode-haskell/pull/509)) by @jneira
- Add traces for download hls
  ([#508](https://github.com/haskell/vscode-haskell/pull/508)) by @jneira
- support old hls versions compatible with the requested ghc version
  ([#506](https://github.com/haskell/vscode-haskell/pull/506)) by @mduerig
- Fix ci: ensure we have a supported ghc version in PATH
  ([#496](https://github.com/haskell/vscode-haskell/pull/496)) by @jneira
- Trace environment variables
  ([#495](https://github.com/haskell/vscode-haskell/pull/495)) by @jneira
- Pass environment variables to LSP
  ([#494](https://github.com/haskell/vscode-haskell/pull/494)) by @jacobprudhomme
- Reorganize README
  ([#491](https://github.com/haskell/vscode-haskell/pull/491)) by @jneira
- Fix error handling of server exec discovery in windows
  ([#486](https://github.com/haskell/vscode-haskell/pull/486)) by @jneira
- Bump versions of ts, cheerio, mocha
  ([#485](https://github.com/haskell/vscode-haskell/pull/485)) by @jneira
- Improve serverExecutablePath description and error when pointing to a directory
  ([#484](https://github.com/haskell/vscode-haskell/pull/484)) by @jneira
- Add integration smoke test
  ([#481](https://github.com/haskell/vscode-haskell/pull/481)) by @jneira
- Setup the test suite
  ([#475](https://github.com/haskell/vscode-haskell/pull/475)) by @jneira

## 1.7.1

- Bug fix release due to #471 and fixed with #469 thanks to [@berberman](https://github.com/berberman)

## 1.7.0

- Add an option to set server command line arguments thanks to [@cdsmith](https://github.com/cdsmith) <https://github.com/haskell/vscode-haskell/pull/464>
  - It includes a new config option `haskell.serverExtraArgs` to being able to pass extra argument to the lsp server executable
- Update config options to match last haskell-language-server version <https://github.com/haskell/vscode-haskell/pull/463>
  - It removes `haskell.diagnosticsOnChange` and `haskell.formatOnImportOn` cause they were unused in the server
  - It adds `haskell.checkProject`, `haskell.maxCompletions` and `haskell.plugin.refineImports.globalOn`
- Fix showDocumentation command thanks to [@pranaysashank](https://github.com/pranaysashank) <https://github.com/haskell/vscode-haskell/pull/452>
  - It fixes partially showing the documentation directly in vscode. The documentation is rendered but internal links still does not work
  - Two config options has been added: `haskell.openDocumentationInHackage` and `haskell.openSourceInHackage` with default value `true`
    - So documentation will be opened using the hackage url in an external navigator by default
    - If you prefer having them in vscode you will need to change them to `false`
- Create output channel only if there are no existing clients thanks to [@pranaysashank](https://github.com/pranaysashank) <https://github.com/haskell/vscode-haskell/pull/448>
  - This fixes the creation of several output channels for the extension

## 1.6.1

- Fix wrapper call to get project ghc version in windows with spaces in path (<https://github.com/haskell/vscode-haskell/pull/439>)

## 1.6.0

- Bump up vscode version to 1.52.0 (#424) by [@berberman](https://github.com/berberman)
  - To match the lsp spec version used in haskell-language-version and fix <https://github.com/haskell/haskell-language-server/issues/2068>

## 1.5.1

- Add much more logging in the client side, configured with `haskell.trace.client`
- Fix error handling of `working out project ghc` and a bug when the path to the executable contains spaces (See #421)
  - And dont use a shell to spawn the subprocess in non windows systems
  - Show the progress as a cancellable notification
- Add commands `Start Haskell LSP server` and `Stop Haskell LSP server`

## 1.5.0

- Emit warning about limited support for ghc-9.x on hls executable download
- Fix `working out project ghc` progress notificacion
- Fix tactics config, thanks to @isovector
- Update server config to match haskell-language-server-1.3.0 one

## 1.4.0

- Restore `resource` scope for `haskell.serverExecutablePath` temporary. The `machine` scope will be set again after giving users a period of time to let them adapt theirs workflows and changing or adding some option in the extension itself to help that adjustement (see #387).

## 1.3.0

- Add `haskell.releasesURL` option to override where to look for HLS releases search for HLS downloads, thanks to @soiamsoNG
- With this version _the only supported lsp server variant is [`haskell-language-server`](https://github.com/haskell/haskell-language-server)_
- Add support for generic plugin configuration. Thanks to it, each plugin capability (diagnostics, code actions, code lenses, etc) or the entire plugin can be disabled
- Add some plugin specic options:
  - [wingman](https://haskellwingman.dev/) (aka tactics) plugin
    - `haskell.plugin.tactic.config.features`: Feature set used by the plugin
    - `haskell.plugin.tactics.config.hole_severity`: The severity to use when showing hole diagnostics
    - `haskell.plugin.tactic.config.max_use_ctor_actions`: Maximum number of `Use constructor <x>` code actions that can appear
    - `haskell.plugin.tactics.config.timeout_duration`: The timeout for Wingman actions, in seconds
  - completions
    - `haskell.plugin.ghcide-completions.config.autoExtendOn`: Extends the import list automatically when completing a out-of-scope identifier
    - `haskell.plugin.ghcide-completions.config.snippetsOn`: Inserts snippets when using code completions
  - type signature lenses - `haskell.plugin.ghcide-type-lenses.config.mode`: Control how type lenses are shown
- The option `haskell.serverExecutablePath` has now `machine` scope, so it can be only changed globally by the user. It avoids a potential security vulnerability as folders containing `.vscode/settings.json` with that option could execute arbitrary programs.
- Deprecated options:
  - `haskell.hlintOn`: use `haskell.plugin.hlint.globalOn` instead.
  - `haskell.completionSnippetsOn`: use `haskell.plugin.ghcide-completions.config.snippetsOn`
- Fixed a small typo that caused the server not to be loaded in `.lhs` files, thanks to @Max7cd

## 1.2.0

- Add option to open local documentation on Hackage (@DunetsNM)
- Add `haskell.updateBehaviour` option to configure when to check for updates
  (@WorldSEnder)
- Use locally installed servers on connection failure (@WorldSEnder)

## 1.1.0

- Add Fourmolu as a plugin formatter provider (@georgefst)
- Remove the `haskell.enable` configuration option, since VS Code now allows
  you to disable extensions on a per workspace basis
- Display errors when fetching from the GitHub API properly

## 1.0.1

- Switch the default formatter to Ormolu to match haskell-language-server
- Fix `haskell.serverExecutablePath` not working with absolute paths on Windows
  (@winestone)
- Improve the help text and error message when `haskell.serverExecutablePath`
  is not found
- Fix the rendering of the markdown table in the README (@Darren8098)

## 1.0.0

- vscode-haskell now lives under the Haskell organisation
- Can now download zip archived binaries, which the Windows binaries are now distributed as
- Improve README (@pepeiborra @jaspervdj)

## 0.1.1

- Fix the restart server and import identifier commands

## 0.1.0

`vscode-hie-server`/`Haskell Language Server` is now just Haskell, and will soon
be published under the Haskell organisation as `haskell-vscode`.
This release makes haskell-language-server the default langauge server of choice
and automatically downloads and installs binaries. Installation from source is
still supported though and any binaries located on your PATH for the selected
langauge server will be used instead.

### Important!

As part of this, your configuration may be reset as the keys move from
`languageServerHaskell.completionSnippetsOn` to `haskell.completionSnippetsOn`.

- Fix the document and source browser
- Remove obselete commands that are no longer supported by any of the language
  servers
  - Show type command
  - Insert type command
  - HaRe commands
  - Case split commands

## 0.0.40

Change the way the backend is configured, simplifying it.

- remove wrapper scripts (hie-vscode.sh/hie-vscode.bat)
- dropdown choice between `haskell-ide-engine`, `haskell-language-server` or
  `ghcide` in the `hieVariant` setting.
- this can be overridden by an explicit `hieExecutablePath`, as before.

## 0.0.39

Remove verbose logging option, it is not longer supported.

## 0.0.38

Bump dependencies

## 0.0.37

Trying again, working 0.0.35

- Add Restart command (@gdziadkiewicz)
- Add Ormolu as a formatter option (@DavSanchez)
- Update README

## 0.0.36

- Roll back to 0.0.34

## 0.0.35

- Add Restart command (@gdziadkiewicz)
- Add Ormolu as a formatter option (@DavSanchez)
- Update README

## 0.0.34

- Remove --lsp parameter from hie-vscode.bat

## 0.0.33

- Introduced configuration setting `noLspParam`, default `false` to control
  setting the `--lsp` flag for the hie server. So by default we will set the
  command line argument for the server, but it can be turned off.

## 0.0.32

- Re-enable the `--lsp` flag for the hie server
- Update some deps for security vulnerabilities

## 0.0.31

- Log to stderr (vscode output) by default, add option for logfile (@bubba)

## 0.0.30

- Bundle using webpack (@chrismwendt)
- Bump protocol version to 3.15 prerelease (@alanz)
  This allows working progress reporting from hie.
- Update casesplit plugin (@Avi-D-coder)

## 0.0.29

- bump protocol version to 3.15 (prerelease) (@alanz)
- upgrade deps, including avoiding vulnerabilities on lodash (@alanz)
- warn about compile time and wrapped hie (@janat08)

## 0.0.28

- remove unused `lsp` flag (@bubba)
- do not start `hie` if `hie-wrapper` crashes (@bubba)
- Expose diagnosticsOnChange option for settings (Frederik Ramcke)
- Avoid CVE on `extend` package
- Enable displaying window progress (@bubba)

## 0.0.27

- Re-enable search feature for documentation (@anonimitoraf)
  Accesed via `ctrl-f`.

## 0.0.26

- Show documentation content using Webview API (@EdAllonby)
- npm audit fix (@alanz)

## 0.0.25

- Add vsce dependency to "Contributing" document (@EdAllonby)
- Add formatterProvider config (@bubba)
- Bugfix for stack version on windows (@beauzeaux)
- Update settings to match hie version 0.7.0.0 (@alanz)
- npm audit fix (@bubba)

## 0.0.24

- Add snippet config option (@bubba)

## 0.0.23

- Fix multi-process issue, where vscode would launch multiple hie instances.
  By @kfigiela

## 0.0.22

- Add configuration option to enable liquid haskell processing. This
  is a preview feature of hie from
  ca2d3eaa19da8ec9d55521b461d8e2e8cffee697 on 2019-09-05.

## 0.0.21

- Remove languageServerHaskell.useHieWrapper, We now use hie-wrapper
  by default.
- Update the vscode-languageclient to v4.4.0
- Fix #98 Import identifier insertion line `moduleLine` is now the
  first line that is (trimmed) `where` or ends with `where` or ends
  with `)where`. (@mpilgrem)

## 0.0.20

- Add the case-split function (@txsmith). Required hie >= 0.2.1.0
- Update the vscode-languageclient to v4.2.0 (@Bubba)
- Use the hie-wrapper executable now installed with hie to choose the
  right version of hie to use for the given project.

## 0.0.19

- Fix hie launch on windows with logging off (#90). Thanks @Tehnix.

## 0.0.18

- Support GHC 8.4.3 in the wrapper file
- The `languageServerHaskell.trace.server` parameter now affects
  `/tmp/hie.log`, as well as ghc-mod `--vomit` output.
- Add an Import identifier command, by @chrismwendt

## 0.0.17

- Support GHC 8.4.2 in the wrapper file
- Update dependencies to avoid security vulnerability.
- Use os.tmpdir() for the hie.log file

## 0.0.15

Support the new webview-api for the documentation browser, thanks to @AlexeyRaga.

## 0.0.14

Revert `vscode-languageclient` dependency to version 3.5.0, since version 4.x for some
reason breaks the documentation browser.

## 0.0.13

Add configuration to set the path to your HIE executable, if it's not on your PATH. Note
that this adds the `--lsp` argument to the call of this executable.

## 0.0.12

Add configuration to enable/disable HIE, useful for multi-root workspaces.

## 0.0.11

Add additional marketplace categories.

## 0.0.10

Add support for multi-root workspaces, thanks to @tehnix. See the README section
on [_Using multi-root workspaces_](https://github.com/alanz/vscode-hie-server#using-multi-root-workspaces) for more.

## 0.0.9

Publish to the visual studio marketplace through travis CI via git tags. E.g.
`git tag -a 0.0.9 -m "Version 0.0.9"` and then `git push origin 0.0.9`.

## 0.0.8

Add new haskell-ide-engine logo, thanks to @damienflament

Add rudimentary support for detecting the project GHC version and using the
appropriate hie version. This currently only works on Linux (contributors on
other platforms, please jump in with appropriate scripts) and requires
`haskell-ide-engine` built via the `Makefile` added in
https://github.com/haskell/haskell-ide-engine/pull/447. Thanks to @Tehnix

## 0.0.7

Update `package-lock.json` to fresh dependencies.

Add show type _of selected expression_ on hover feature, by @halhenke

Added options for how to display the same information when using the show type
command menu, by @halhenke

Moved the configuration setting about showing trace information into the proper
scope, by @halhenke

## 0.0.6

Update `package-lock.json` to fresh dependencies.

Update the installation check on Win32 platforms, by @soylens.

Use `tslint` on the plugin sources, by @halhenke.

## 0.0.5

Stop the output channel from taking focus on startup, by @Tehnix and @halhenke

Rework and improve the document layout, for gihub and the marketplace, by @Tehnix

Set up Travis testing an potential auto-deply to marketplace, by @Tehnix

## 0.0.4

Show documents in a tab, by @AlexeyRaga

Add a configuration option to enable/disable `hlint`.

## 0.0.3

Add "Haskell: Show type" command, bound to Ctrl-alt-t (Cmd-alt-t on mac). This
calls the `ghc-mod` `type` command on the current cursor location or highlighted
region. Thanks to @AlexeyRaga

Add a check for having the `hie` executable in the path on startup, to prevent
an endless failure to start if the executable is not there. Thanks to @DavidEichman

## 0.0.2

Add some HaRe commands, accesible via the command palette.

## 0.0.1

Initial release of haskell-ide-engine VS Code extension, for brave pioneers.
