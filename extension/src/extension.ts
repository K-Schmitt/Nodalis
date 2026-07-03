import * as vscode from 'vscode';
import { resolveContext } from './config';
import { Engine } from './engine';
import { configureMcp } from './mcp';
import { StatusBar } from './statusbar';
import { openPanel } from './webview/panel';

let engine: Engine | null = null;
let statusBar: StatusBar | null = null;

export function activate(context: vscode.ExtensionContext): void {
  engine = new Engine();
  statusBar = new StatusBar();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  const register = (id: string, fn: (...a: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  register('archi-os.open', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    openPanel(ctx, context.extensionUri);
  });

  register('archi-os.start', async () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    try {
      const { webUrl } = await engine!.start(ctx);
      statusBar!.setLive(webUrl);
      void vscode.window.showInformationMessage(`ARCHI-OS runtime live — ${webUrl}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`ARCHI-OS start failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.stop', async () => {
    await engine?.stop();
    statusBar?.setStopped();
  });

  register('archi-os.configureMcp', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    try {
      const file = configureMcp(ctx);
      void vscode.window.showInformationMessage(`ARCHI-OS MCP configured: ${file}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`ARCHI-OS MCP config failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.createSnapshot', () => vscode.window.showInformationMessage('ARCHI-OS: snapshot (M4).'));
  register('archi-os.refreshVersions', () => vscode.window.showInformationMessage('ARCHI-OS: versions (M4).'));

  // Gated autostart: never spawn silently on mere .archi/ presence.
  const ctx = resolveContext();
  if (ctx?.autostart) {
    void vscode.commands.executeCommand('archi-os.start');
  }
}

export function deactivate(): Thenable<void> | void {
  return engine?.stop();
}
