# Release Checklist

Follow this list for items that must be completed for release of the `vscode-haskell` extension.

- [ ] Run `yarn audit` for security vulnerabilities.
  - Fix vulnerabilities.
- [ ] Run `yarn outdated` to find outdated package version, review what needs to be updated.
  - `yarn upgrade-interactive` and `yarn upgrade-interactive --latest` is helpful here.
- [ ] Run `haskell-language-server vscode-extension-schema` with the latest `haskell-language-server` to check if there have new fields.
- [ ] SemVer Compatible Version Bump in `package.json`
  - For pre-releases, we follow the version convention at: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions. We use `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions. For example: `2.0.*` for release and `2.1.*` for pre-release.
- [ ] Update ChangeLog.md. The output of `./GenChangelogs.hs` usually suffices.
- [ ] Update the README.md to have no outdated information.
- [ ] Make sure CI is succeeding.
- [ ] Perform the release by creating a [release in Github](https://github.com/haskell/vscode-haskell/releases)
  - Github actions will automatically release the extension to VSCode- and VSX-Marketplace.
  - If you want to create a pre-release, create a [pre-release in Github](https://github.com/haskell/vscode-haskell/releases). The github action will perform the appropriate actions automatically and publish the pre-release of the extension to VSCode- and VSX-Marketplace.

## Release CI

The release CI has access tokens for VSX Marketplace and the VSCode Marketplace.

Seemingly, the VSX Marketplace token does not expire. If it is lost for some reason, follow the steps below. Fendor can also generate a VSX Marketplace token.

The latter needs to be refreshed once a year.

* Send an email to `committee@haskell.org` requesting the token
  * Include your public GPG key so they can send you the token encrypted
* Update the repository secrets
  * People from the [@haskell-ide](https://github.com/orgs/haskell/teams/haskell-ide) have full access to the vscode-haskell repo and can update secrets

Last time the VSCode Marketplace token was updated: 2023-08-17
