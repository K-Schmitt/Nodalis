import * as vscode from 'vscode';
import { resolveContext } from './config';

export function activate(context: vscode.ExtensionContext): void {
  const register = (id: string, fn: (...a: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  register('archi-os.open', () => vscode.window.showInformationMessage('ARCHI-OS: open (M1).'));
  register('archi-os.start', () => vscode.window.showInformationMessage('ARCHI-OS: start (M2).'));
  register('archi-os.stop', () => vscode.window.showInformationMessage('ARCHI-OS: stop (M2).'));
  register('archi-os.configureMcp', () => vscode.window.showInformationMessage('ARCHI-OS: MCP (M2).'));
  register('archi-os.createSnapshot', () => vscode.window.showInformationMessage('ARCHI-OS: snapshot (M4).'));
  register('archi-os.refreshVersions', () => vscode.window.showInformationMessage('ARCHI-OS: versions (M4).'));

  const ctx = resolveContext();
  console.log('[archi-os] activated', ctx ? `ws=${ctx.workspaceRoot}` : 'no workspace');
}

export function deactivate(): void {
  // Runtime teardown wired in Task 8.
}
