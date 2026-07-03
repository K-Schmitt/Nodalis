import * as vscode from 'vscode';

export class StatusBar {
  private item: vscode.StatusBarItem;
  private steady = '$(circle-slash) ARCHI-OS';

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'archi-os.open';
    this.setStopped();
    this.item.show();
  }

  setLive(url: string): void {
    this.steady = '$(broadcast) ARCHI-OS Live';
    this.item.text = this.steady;
    this.item.tooltip = `Runtime live — ${url}`;
  }

  setStopped(): void {
    this.steady = '$(circle-slash) ARCHI-OS';
    this.item.text = this.steady;
    this.item.tooltip = 'Runtime stopped — click to open';
  }

  flashReload(): void {
    this.item.text = '$(sync~spin) rules reloaded';
    setTimeout(() => { this.item.text = this.steady; }, 1500);
  }

  dispose(): void { this.item.dispose(); }
}
