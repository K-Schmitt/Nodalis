import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as pathWin32 from 'node:path/win32';
import { buildEntry, mergeServer } from '@nodalis/cli/lib/mcp-config';
import type { ExtContext } from './config';

/** Minimal host description (injectable for tests). */
export type HostEnv = { home: string; platform: NodeJS.Platform; appData?: string };

function defaultHost(): HostEnv {
  return { home: homedir(), platform: process.platform, appData: process.env.APPDATA };
}

type McpTarget = {
  label: string;
  /** Config file path (user-global). */
  file: string;
  /** Top-level key holding the server map. */
  key: 'mcpServers' | 'servers';
  /** Entry shape: 'stdio' adds a `type` field (VSCode), 'plain' omits it. */
  entry: 'plain' | 'stdio';
};

/** VSCode user-profile mcp.json location, per OS. */
function vscodeUserFile(host: HostEnv): string {
  if (host.platform === 'win32') {
    const appData = host.appData ?? pathWin32.join(host.home, 'AppData', 'Roaming');
    return pathWin32.join(appData, 'Code', 'User', 'mcp.json');
  }
  if (host.platform === 'darwin') {
    return join(host.home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
  }
  return join(host.home, '.config', 'Code', 'User', 'mcp.json');
}

/** User-global MCP config locations, one per supported client. */
function targets(host: HostEnv): McpTarget[] {
  return [
    { label: 'VSCode', file: vscodeUserFile(host), key: 'servers', entry: 'stdio' },
    { label: 'Cursor', file: join(host.home, '.cursor', 'mcp.json'), key: 'mcpServers', entry: 'plain' },
    { label: 'Claude Code', file: join(host.home, '.claude.json'), key: 'mcpServers', entry: 'plain' },
  ];
}

/**
 * Merge the Nodalis MCP entry into every supported client's **user-global**
 * config (VSCode, Cursor, Claude Code) — idempotent, each existing file backed
 * up. Configure once; the server is then available in every project.
 *
 * Standalone: the MCP server is the core bundled inside the extension, launched
 * through the editor's own Node (ELECTRON_RUN_AS_NODE) — no repo checkout and no
 * external Node install. It uses the bundled definitions and operates on the
 * workspace that is currently active in Nodalis (tracked in global state).
 *
 * @param extensionPath absolute install dir of the extension (context.extensionUri.fsPath)
 * @param host injectable host env (defaults to the real machine)
 * @returns the list of config files written.
 */
export function configureMcp(ctx: ExtContext, extensionPath: string, host: HostEnv = defaultHost()): string[] {
  const coreEntry = resolve(extensionPath, 'core-bundle', 'index.cjs');
  const definitionsPath = resolve(extensionPath, 'definitions');

  const written: string[] = [];
  for (const t of targets(host)) {
    const entry = buildEntry({
      distPath: coreEntry,
      workspaceRoot: ctx.workspaceRoot,
      browseRoot: ctx.workspaceRoot,
      entryShape: t.entry,
    });
    // Run the bundled core under the editor's Node; use the bundled definitions.
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
