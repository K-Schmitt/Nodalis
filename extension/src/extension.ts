import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
  // Cheap, no-throw singletons the command handlers close over.
  engine = new Engine();
  const versions = new VersionsProvider(() => engine!.coreBaseUrl());

  const register = (id: string, fn: (...a: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  // ── Register ALL commands FIRST ──────────────────────────────────────────
  // Command registration must never depend on the optional UI wiring below;
  // if a status bar / tree / diagnostics step throws, the commands still exist.

  register('archi-os.open', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('Nodalis: open a workspace folder first.'); return; }
    const panel = openPanel(ctx, context.extensionUri);
    activePanels.add(panel);
    panel.onDidDispose(() => activePanels.delete(panel));
  });

  register('archi-os.start', async () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('Nodalis: open a workspace folder first.'); return; }
    try {
      const { webUrl } = await engine!.start(ctx, context.extensionUri.fsPath);
      statusBar!.setLive(webUrl);
      void vscode.window.showInformationMessage(`Nodalis runtime live — ${webUrl}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Nodalis start failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.stop', async () => {
    await engine?.stop();
    statusBar?.setStopped();
  });

  register('archi-os.configureMcp', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('Nodalis: open a workspace folder first.'); return; }
    try {
      const files = configureMcp(ctx, context.extensionUri.fsPath);
      void vscode.window.showInformationMessage(`Nodalis MCP configured globally for VSCode, Cursor & Claude Code (${files.length} files). Reload each client to pick it up.`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Nodalis MCP config failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.refreshVersions', () => versions.refresh());

  register('archi-os.createSnapshot', async () => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('Nodalis: start the runtime first.'); return; }
    const label = await vscode.window.showInputBox({ prompt: 'Snapshot label', placeHolder: 'e.g. before-refactor' });
    if (!label) return;
    try { await createSnapshot(base, label); versions.refresh(); void vscode.window.showInformationMessage(`Snapshot "${label}" created.`); }
    catch (err) { void vscode.window.showErrorMessage(`Snapshot failed: ${(err as Error).message}`); }
  });

  register('archi-os.restoreVersion', async (arg: unknown) => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('Nodalis: start the runtime first.'); return; }
    const v = arg as Version;
    const ok = await vscode.window.showWarningMessage(`Restore graph to "${v.label}"? This replaces the current graph.`, { modal: true }, 'Restore');
    if (ok !== 'Restore') return;
    try {
      await restoreVersion(base, v.id);
      for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
      void vscode.window.showInformationMessage(`Restored to "${v.label}".`);
    } catch (err) { void vscode.window.showErrorMessage(`Restore failed: ${(err as Error).message}`); }
  });

  // ── Best-effort UI wiring — must never break command registration above ───
  try {
    statusBar = new StatusBar();
    context.subscriptions.push({ dispose: () => statusBar?.dispose() });
    context.subscriptions.push(vscode.window.registerTreeDataProvider('archi-os.versions', versions));
    registerDiagnostics(context, () => {
      statusBar?.flashReload();
      for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
    });
  } catch (err) {
    void vscode.window.showErrorMessage(`Nodalis partial init (commands still available): ${(err as Error).message}`);
  }

  // Gated autostart: never spawn silently on mere .archi/ presence.
  const ctx = resolveContext();
  if (ctx?.autostart) {
    void vscode.commands.executeCommand('archi-os.start');
  }

  // First-run bootstrap: configure MCP + start runtime + open the panel once
  // per workspace, so a fresh install "just works" without the manual trio.
  void bootstrapFirstRun(context, ctx);
}

/** A folder is a Nodalis project only if it carries definitions to model. */
function isArchiWorkspace(root: string): boolean {
  return existsSync(resolve(root, '.archi')) || existsSync(resolve(root, 'definitions'));
}

/**
 * First-run setup. MCP config is global, so it runs once ever (own flag); the
 * runtime start + panel open run once per Nodalis workspace. Nothing is spawned
 * for non-Nodalis folders, and each flag is only set after its step succeeds,
 * so a failure retries on the next launch instead of wedging a broken state.
 */
async function bootstrapFirstRun(
  context: vscode.ExtensionContext,
  ctx: ReturnType<typeof resolveContext>,
): Promise<void> {
  if (!ctx?.autoBootstrap) return;
  // Never spawn a runtime or open a panel for a folder that isn't a Nodalis
  // project — opening any random workspace must stay side-effect free.
  if (!isArchiWorkspace(ctx.workspaceRoot)) return;
  // globalState may be absent in test harnesses; bail out safely if so.
  const state = context.globalState;
  if (!state?.get || !state.update) return;

  const MCP_KEY = 'archi-os.mcpConfigured';               // global — write once ever
  const bootKey = `archi-os.bootstrapped:${ctx.workspaceRoot}`; // per-workspace

  try {
    // MCP config writes global client files pointing at the bundled core; doing
    // it once avoids rewriting them on every launch while the runtime start fails.
    if (!state.get<boolean>(MCP_KEY)) {
      await vscode.commands.executeCommand('archi-os.configureMcp');
      await state.update(MCP_KEY, true);
    }

    if (state.get<boolean>(bootKey)) return;
    await vscode.commands.executeCommand('archi-os.start');
    // start swallows its own errors; only open + mark done if the runtime is
    // actually live (core AND web), else leave the flag unset so we retry.
    if (!engine?.isLive()) return;
    await vscode.commands.executeCommand('archi-os.open');
    await state.update(bootKey, true);
  } catch (err) {
    void vscode.window.showErrorMessage(`Nodalis first-run setup failed (will retry next launch): ${(err as Error).message}`);
  }
}

export function deactivate(): Thenable<void> | void {
  return engine?.stop();
}
