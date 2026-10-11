import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as constants from './commands/constants';

export type CradleInfo = {
  file: string;
  ghcVersion: string;
  rootDir: string;
  inferred: boolean;
};

export class HaskellStatusBar {
  readonly item: vscode.StatusBarItem;
  private activeCradleInfo?: CradleInfo;
  private activeErrorMessage?: string;
  private readonly cradleInfoByFile = new Map<string, CradleInfo>();

  constructor(readonly version?: string) {
    // Set up the status bar item.
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  }

  refresh(): void {
    const version = this.version ?? '<unknown>';
    this.item.text = `Haskell`;

    this.item.command = constants.OpenLogsCommandName;
    this.item.tooltip = new vscode.MarkdownString('', true);
    this.item.tooltip.isTrusted = true;
    if (this.activeErrorMessage) {
      this.item.tooltip.appendText(this.activeErrorMessage);
      return;
    }

    if (this.activeCradleInfo) {
      const fileLink = this.renderFileLink(this.activeCradleInfo.file, this.activeCradleInfo.rootDir);
      const dependenciesSection = this.renderDependenciesSection();

      this.item.tooltip.appendMarkdown(
        `**Cradle Info**\n\n` +
        `Root: \`${this.activeCradleInfo.rootDir}\`\n\n` +
        `File: ${fileLink}\n\n` +
        `GHC: \`${this.activeCradleInfo.ghcVersion ?? '<unknown>'}\`\n\n` +
        `Inferred: \`${this.activeCradleInfo.inferred}\`\n\n` +
        dependenciesSection +
        `---\n\n`,
      );
    }
    this.item.tooltip.appendMarkdown(
      `[Extension Info](command:${constants.ShowExtensionVersions} "Show Extension Version"): Version ${version}\n\n` +
      `---\n\n` +
      `[$(terminal) Open Logs](command:${constants.OpenLogsCommandName} "Open the logs of the Server and Extension")\n\n` +
      `[$(debug-restart) Restart Server](command:${constants.RestartServerCommandName} "Restart Haskell Language Server")\n\n` +
      `[$(refresh) Restart Extension](command:${constants.RestartExtensionCommandName} "Restart vscode-haskell Extension")\n\n`,
    );
  }

  show() {
    this.item.show();
  }

  hide() {
    this.item.hide();
  }

  setCradleInfo(cradleInfo: CradleInfo): void {
    const normalized = vscode.Uri.file(cradleInfo.file).fsPath;
    this.activeErrorMessage = undefined;
    this.cradleInfoByFile.set(normalized, cradleInfo);
    this.refreshForDocument(vscode.window.activeTextEditor?.document);
  }

  setErrorMessage(message: string): void {
    this.activeCradleInfo = undefined;
    this.activeErrorMessage = message;
    this.cradleInfoByFile.clear();
    this.refresh();
  }

  clearStatusInfo(): void {
    this.activeCradleInfo = undefined;
    this.activeErrorMessage = undefined;
    this.cradleInfoByFile.clear();
    this.refresh();
  }

  clearCradleInfo(file: string): void {
    const normalized = vscode.Uri.file(file).fsPath;
    this.cradleInfoByFile.delete(normalized);
    if (this.activeCradleInfo?.file === normalized) {
      this.activeCradleInfo = undefined;
    }
    this.refresh();
  }

  refreshForDocument(document?: vscode.TextDocument): void {
    if (document?.uri.scheme !== 'file') return;

    const key = document.uri.fsPath;
    const found = this.cradleInfoByFile.get(key);

    this.activeCradleInfo = found;
    this.refresh();
  }

  dispose() {
    this.item.dispose();
  }

  // Make a clickable list of dependency files
  private renderDependenciesSection(): string {
    if (!this.activeCradleInfo) return '';

    const { activeCradleInfo } = this;
    const dependencies = this.getDependencyFiles(activeCradleInfo);
    if (dependencies.length === 0) return 'Dependencies: `none`\n\n';

    const links = dependencies.map((dependency) => this.renderFileLink(dependency, activeCradleInfo.rootDir)).join(', ');
    return `Dependencies: ${links}\n\n`;
  }

  // Uses Absolute path to make clickable links in statusbar items
  private renderFileLink(filePath: string, rootDir: string): string {
    const resolvedPath = this.resolvePath(filePath, rootDir);
    const uri = vscode.Uri.file(resolvedPath);
    const args = encodeURIComponent(JSON.stringify([uri]));
    const label = this.toRelativePath(resolvedPath, rootDir);

    return `[${label}](command:vscode.open?${args} "${resolvedPath}")`;
  }

  // Given a file path and root directoty, returns file location relative to root
  private toRelativePath(filePath: string, rootDir: string): string {
    const relativePath = path.relative(rootDir, filePath);
    return relativePath || path.basename(filePath);
  }

  // Returns absolute file path inCase Relative path is provided
  private resolvePath(filePath: string, rootDir: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  }

  // Find list of Dependency files from root based on Cradle inferred value
  // if inferred is false, search for hie.yaml
  // if inferred is true, search for cabal , stack files
  private getDependencyFiles(cradleInfo: CradleInfo): string[] {
    if (!cradleInfo.inferred) {
      const hieYamlPath = path.join(cradleInfo.rootDir, 'hie.yaml');
      return fs.existsSync(hieYamlPath) ? [hieYamlPath] : [];
    }

    if (!fs.existsSync(cradleInfo.rootDir)) {
      return [];
    }

    const entries = fs.readdirSync(cradleInfo.rootDir, { withFileTypes: true });
    const cabalFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.cabal'))
      .map((entry) => path.join(cradleInfo.rootDir, entry.name))
      .sort((left, right) => left.localeCompare(right));
    const otherConfigFiles = ['stack.yaml', 'cabal.project']
      .map((fileName) => path.join(cradleInfo.rootDir, fileName))
      .filter((filePath) => fs.existsSync(filePath));

    return [...cabalFiles, ...otherConfigFiles];
  }
}
