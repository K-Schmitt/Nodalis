import * as vscode from 'vscode';

export type ExtContext = {
  workspaceRoot: string;
  corePort: number;
  webPort: number;
  autostart: boolean;
};

/** Resolve the active workspace root and configured ports. */
export function resolveContext(): ExtContext | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return null;
  const cfg = vscode.workspace.getConfiguration('archiOs');
  return {
    workspaceRoot: folder.uri.fsPath,
    corePort: 3000,
    webPort: 5173,
    autostart: cfg.get<boolean>('autostart', false),
  };
}
