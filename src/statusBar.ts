import * as vscode from 'vscode';
import * as constants from './commands/constants';

export class HaskellStatusBar {
  readonly item: vscode.StatusBarItem;
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

  dispose() {
    this.item.dispose();
  }
}
