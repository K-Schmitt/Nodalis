import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildEntry, mergeServer } from '@archi-os/cli/lib/mcp-config';
import type { ExtContext } from './config';

type McpTarget = {
  label: string;
  /** Config file path (workspace-scoped). */
  file: string;
  /** Top-level key holding the server map. */
  key: 'mcpServers' | 'servers';
  /** Entry shape: 'stdio' adds a `type` field (VSCode), 'plain' omits it. */
  entry: 'plain' | 'stdio';
};

/** Workspace-scoped MCP config locations, one per supported client. */
function targets(workspaceRoot: string): McpTarget[] {
  return [
    { label: 'VSCode', file: join(workspaceRoot, '.vscode', 'mcp.json'), key: 'servers', entry: 'stdio' },
    { label: 'Cursor', file: join(workspaceRoot, '.cursor', 'mcp.json'), key: 'mcpServers', entry: 'plain' },
    { label: 'Claude Code', file: join(workspaceRoot, '.mcp.json'), key: 'mcpServers', entry: 'plain' },
  ];
}

/**
 * Merge the Nodalis MCP entry into every supported client's workspace config
 * (VSCode, Cursor, Claude Code) — idempotent, each existing file backed up.
 *
 * Standalone: the MCP server is the core bundled inside the extension, launched
 * through the editor's own Node (ELECTRON_RUN_AS_NODE) — no repo checkout and no
 * external Node install. Definitions come from the workspace when present,
 * otherwise from the bundled defaults.
 *
 * @param extensionPath absolute install dir of the extension (context.extensionUri.fsPath)
 * @returns the list of config files written.
 */
export function configureMcp(ctx: ExtContext, extensionPath: string): string[] {
  const coreEntry = resolve(extensionPath, 'core-bundle', 'index.cjs');
  const wsDefs = resolve(ctx.workspaceRoot, 'definitions');
  const definitionsPath = existsSync(wsDefs) ? wsDefs : resolve(extensionPath, 'definitions');

  const written: string[] = [];
  for (const t of targets(ctx.workspaceRoot)) {
    const entry = buildEntry({
      distPath: coreEntry,
      workspaceRoot: ctx.workspaceRoot,
      browseRoot: ctx.workspaceRoot,
      entryShape: t.entry,
    });
    // Run the bundled core under the editor's Node; fall back to bundled definitions.
    entry.command = process.execPath;
    entry.args = [coreEntry];
    entry.env = { ...entry.env, ELECTRON_RUN_AS_NODE: '1', DEFINITIONS_PATH: definitionsPath };

    const existing = existsSync(t.file) ? readFileSync(t.file, 'utf8') : '{}';
    if (existsSync(t.file)) copyFileSync(t.file, `${t.file}.bak`);
    const merged = mergeServer(existing, entry, t.key);

    mkdirSync(dirname(t.file), { recursive: true });
    writeFileSync(t.file, merged, 'utf8');
    written.push(t.file);
  }
  return written;
}
