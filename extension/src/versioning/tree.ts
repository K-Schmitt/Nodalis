import * as vscode from 'vscode';
import { listVersions, type Version } from './api';

export class VersionsProvider implements vscode.TreeDataProvider<Version> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private baseUrl: () => string | null) {}

  refresh(): void { this.emitter.fire(); }

  getTreeItem(v: Version): vscode.TreeItem {
    const item = new vscode.TreeItem(v.label, vscode.TreeItemCollapsibleState.None);
    item.description = `${new Date(v.createdAt).toLocaleString()} · ${v.nodeCount}n/${v.edgeCount}e`;
    item.tooltip = `${v.kind} · ${v.id}`;
    item.iconPath = new vscode.ThemeIcon(v.kind === 'manual' ? 'bookmark' : 'history');
    item.contextValue = 'archi-os.version';
    item.command = { command: 'archi-os.restoreVersion', title: 'Restore', arguments: [v] };
    return item;
  }

  async getChildren(): Promise<Version[]> {
    const base = this.baseUrl();
    if (!base) return [];
    try { return await listVersions(base); } catch { return []; }
  }
}
