import { Uri } from 'vscode';

export class HlsError extends Error {}

export class MissingToolError extends HlsError {
  public readonly tool: string;
  constructor(tool: string) {
    let prettyTool: string;
    switch (tool.toLowerCase()) {
      case 'stack':
        prettyTool = 'Stack';
        break;
      case 'cabal':
        prettyTool = 'Cabal';
        break;
      case 'ghc':
        prettyTool = 'GHC';
        break;
      case 'ghcup':
        prettyTool = 'GHCup';
        break;
      case 'haskell-language-server':
      case 'hls':
        prettyTool = 'HLS';
        break;
      default:
        prettyTool = tool;
        break;
    }
    super(`Project requires ${prettyTool} but it isn't installed`);
    this.tool = prettyTool;
  }

  public installLink(): Uri | null {
    switch (this.tool) {
      case 'Stack':
        return Uri.parse('https://docs.haskellstack.org/en/stable/install_and_upgrade/');
      case 'GHCup':
      case 'Cabal':
      case 'HLS':
      case 'GHC':
        return Uri.parse('https://www.haskell.org/ghcup/');
      default:
        return null;
    }
  }
}

export class NoMatchingHls extends Error {
  constructor(readonly ghcProjVersion: string) {
    super(`HLS does not support GHC ${ghcProjVersion} yet.`);
  }
  public docLink(): Uri {
    return Uri.parse('https://haskell-language-server.readthedocs.io/en/latest/support/ghc-version-support.html');
  }
}
