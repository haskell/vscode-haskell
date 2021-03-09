{ pkgs ? import <nixpkgs> {} }:
with pkgs;

# Please run `yarn import` first to generate yarn.lock!
pkgs.mkYarnPackage rec {
  name = "haskell";
  src = ./.;
  packageJSON = ./package.json;
  yarnLock = ./yarn.lock;

  installPhase = ''
    mkdir -p "$out/dist"
    yarn vscode:prepublish --output-path "$out/dist"
    mv deps/${name}/package.json "$out"
  '';

  distPhase = ''
    true
  '';
}
