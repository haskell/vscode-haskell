{
  description = "VS Code Haskell extension development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # flake-utils for cross-platform support
    flake-utils.url = "github:numtide/flake-utils";
  };

  # Outputs define what our flake produces
  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    # This function creates outputs for each system (x86_64-linux, aarch64-darwin, etc.)
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        # Import nixpkgs for our specific system
        pkgs = nixpkgs.legacyPackages.${system};

      in
      {
        # Development shell with Node.js and VS Code extension tools
        devShells.default = pkgs.mkShell {
          name = "vscode-haskell-dev";

          packages = with pkgs; [
            # Node.js runtime (LTS version)
            nodejs_20

            # Package managers
            corepack # Enables yarn/npm/pnpm via packageManager field

            # VS Code extension development
            vscode # For testing extension
            vsce # VS Code Extension CLI (publish/package)

            # Additional tools
            git
            nixpkgs-fmt
          ];

          shellHook = ''
            echo "VS Code Haskell Extension Dev Environment"
            echo "Node: $(node --version)"
            echo "npm: $(npm --version 2>/dev/null || echo 'not active')"
            echo ""
            echo "Available commands:"
            echo "  npm install     - Install dependencies"
            echo "  npm build       - Build extension with webpack"
            echo "  npm run watch   - Watch mode"
            echo "  vsce package     - Create .vsix package"
            echo "  vsce publish     - Publish to marketplace"
          '';
        };
      }
    );
}
