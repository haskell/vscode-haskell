# Release Checklist

Follow this list for items that must be completed for release of the `vscode-haskell` extension.

- [ ] Run `yarn audit` for security vulnerabilities.
  - Fix vulnerabilities.
- [ ] Run `yarn outdated` to find outdated package version, review what needs to be updated.
  - `yarn upgrade-interactive` and `yarn upgrade-interactive --latest` is helpful here.
- [ ] Run `cat test/testdata/schema/*/vscode-extension-schema.golden.json | jq --sort-keys -s add` in the `haskell-language-server` repo and add new configuration items.
- [ ] SemVer Compatible Version Bump in `package.json`
  - For pre-releases, we follow the version convention at: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions. We use `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions. For example: `2.0.*` for release and `2.1.*` for pre-release.
- [ ] Update ChangeLog.md. The output of `./GenChangelogs.hs` usually suffices.
- [ ] Update the README.md to have no outdated information.
- [ ] Make sure CI is succeeding.
- [ ] Perform the release by creating a [release in Github](https://github.com/haskell/vscode-haskell/releases)
  - Github actions will automatically release the extension to VSCode- and VSX-Marketplace.
  - If you want to create a pre-release, create a [pre-release in Github](https://github.com/haskell/vscode-haskell/releases). The github action will perform the appropriate actions automatically and publish the pre-release of the extension to VSCode- and VSX-Marketplace.

## Branching policy

Sometimes there is a release (stable) and pre-release (unstable) at the same time and we need to do a release for the stable release and sometimes we need to do a release for the pre-release series.
To simplify the release management, the following policy is in place:

- The branch `master` contains the current pre-release
  - As such, its `package.json` must always have the form `major.ODD_NUMBER.patch`
  - Dependency version bumps are automatically performed by dependabot against `master`
  - For each release, a tag must be created
- Stable releases are located on a separate branch called `release-<major.EVEN_NUMBER>`
  - Before a release, the branch is rebased on top of current master
  - For each stable release, a tag must be created of the form `major.EVEN_NUMBER.patch`

## Release CI

The release CI has access tokens for VSX Marketplace and the VSCode Marketplace.

Seemingly, the VSX Marketplace token does not expire. If it is lost for some reason, follow the steps below. Fendor can also generate a VSX Marketplace token.

The latter needs to be refreshed once a year.

- Send an email to `committee@haskell.org` requesting the token
  - Include your public GPG key so they can send you the token encrypted
- Update the repository secrets
  - People from the [@haskell-ide](https://github.com/orgs/haskell/teams/haskell-ide) have full access to the vscode-haskell repo and can update secrets

Last time the VSCode Marketplace token was updated: 2023-08-17
