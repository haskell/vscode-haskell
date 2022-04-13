# Release Checklist

Follow this list for items that must be completed for release of the `vscode-haskell` extension.

- [ ] Run `yarn audit` for security vulnerabilities.
  - Fix vulnerabilities.
- [ ] Run `yarn outdated` to find outdated package version, review what needs to be updated.
  - `yarn upgrade-interactive` and `yarn upgrade-interactive --latest` is helpful here.
- [ ] SemVer Compatible Version Bump in `package.json`
  - For pre-releases, we follow the version convention at: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions. We use `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions. For example: `2.0.*` for release and `2.1.*` for pre-release.
- [ ] Update ChangeLog.md. The output of `./GenChangelogs.hs` usually suffices.
- [ ] Update the README.md to have no outdated information.
- [ ] Make sure CI is succeeding.
- [ ] Perform the release by creating a [release in Github](https://github.com/haskell/vscode-haskell/releases)
  - Github actions will automatically release the extension to VSCode- and VSX-Marketplace.
  - If you want to create a pre-release, create a [pre-release in Github](https://github.com/haskell/vscode-haskell/releases). The github action will perform the appropriate actions automatically and publish the pre-release of the extension to VSCode- and VSX-Marketplace.
