import * as vscode from 'vscode';
import { resolveContext } from './config';
import { Engine } from './engine';
import { configureMcp } from './mcp';
import { StatusBar } from './statusbar';
import { openPanel } from './webview/panel';
import { registerDiagnostics } from './diagnostics';
import { VersionsProvider } from './versioning/tree';
import { createSnapshot, restoreVersion, type Version } from './versioning/api';

let engine: Engine | null = null;
let statusBar: StatusBar | null = null;
const activePanels = new Set<vscode.WebviewPanel>();

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
    const panel = openPanel(ctx, context.extensionUri);
    activePanels.add(panel);
    panel.onDidDispose(() => activePanels.delete(panel));
  });

  const versions = new VersionsProvider(() => engine!.coreBaseUrl());
  context.subscriptions.push(vscode.window.registerTreeDataProvider('archi-os.versions', versions));

  registerDiagnostics(context, () => {
    statusBar?.flashReload();
    for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
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

  register('archi-os.refreshVersions', () => versions.refresh());

  register('archi-os.createSnapshot', async () => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('ARCHI-OS: start the runtime first.'); return; }
    const label = await vscode.window.showInputBox({ prompt: 'Snapshot label', placeHolder: 'e.g. before-refactor' });
    if (!label) return;
    try { await createSnapshot(base, label); versions.refresh(); void vscode.window.showInformationMessage(`Snapshot "${label}" created.`); }
    catch (err) { void vscode.window.showErrorMessage(`Snapshot failed: ${(err as Error).message}`); }
  });

  register('archi-os.restoreVersion', async (arg: unknown) => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('ARCHI-OS: start the runtime first.'); return; }
    const v = arg as Version;
    const ok = await vscode.window.showWarningMessage(`Restore graph to "${v.label}"? This replaces the current graph.`, { modal: true }, 'Restore');
    if (ok !== 'Restore') return;
    try {
      await restoreVersion(base, v.id);
      for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
      void vscode.window.showInformationMessage(`Restored to "${v.label}".`);
    } catch (err) { void vscode.window.showErrorMessage(`Restore failed: ${(err as Error).message}`); }
  });

  // Gated autostart: never spawn silently on mere .archi/ presence.
  const ctx = resolveContext();
  if (ctx?.autostart) {
    void vscode.commands.executeCommand('archi-os.start');
  }
}

export function deactivate(): Thenable<void> | void {
  return engine?.stop();
}
