{ pkgs ? import <nixpkgs> {} }:
with pkgs;
pkgs.mkYarnPackage {
  name = "vscode-hie-server";
  src = ./.;
  packageJSON = ./package.json;
  yarnLock = ./yarn.lock;

  installPhase = ''
    mkdir -p "$out/dist"
    yarn vscode:prepublish --output-path "$out/dist"
    mv deps/vscode-hie-server/{package.json,hie-vscode.sh,hie-vscode.bat} "$out"
  '';

  distPhase = ''
    true
  '';
}
