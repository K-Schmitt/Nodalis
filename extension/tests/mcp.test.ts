import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureMcp } from '../src/mcp';

type Entry = { command: string; args: string[]; env: Record<string, string>; type?: string };

function readServer(file: string, key: 'mcpServers' | 'servers'): Entry {
  const cfg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, Entry>>;
  return cfg[key]['nodalis'];
}

describe('configureMcp (global, multi-client)', () => {
  it('writes user-global VSCode, Cursor and Claude Code configs at the bundled core', () => {
    const home = mkdtempSync(join(tmpdir(), 'nod-home-'));
    const ws = mkdtempSync(join(tmpdir(), 'nod-ws-'));
    const extPath = join(tmpdir(), 'nodalis-ext');

    const files = configureMcp(
      { workspaceRoot: ws, corePort: 3000, webPort: 5173, autostart: false, autoBootstrap: true },
      extPath,
      { home, platform: 'linux' },
    );

    // One user-global file per client (never inside the workspace).
    expect(files).toEqual([
      join(home, '.config', 'Code', 'User', 'mcp.json'),
      join(home, '.cursor', 'mcp.json'),
      join(home, '.claude.json'),
    ]);
    for (const f of files) expect(f.startsWith(ws)).toBe(false);

    const vscode = readServer(files[0], 'servers');
    const cursor = readServer(files[1], 'mcpServers');
    const claude = readServer(files[2], 'mcpServers');

    for (const entry of [vscode, cursor, claude]) {
      // Runs the bundled core under the editor's Node — never the workspace's core/dist.
      expect(entry.command).toBe(process.execPath);
      expect(entry.args.some((a) => a.includes(join('core-bundle', 'index.cjs')))).toBe(true);
      expect(entry.env.ELECTRON_RUN_AS_NODE).toBe('1');
      // Global config uses the bundled definitions.
      expect(entry.env.DEFINITIONS_PATH).toBe(join(extPath, 'definitions'));
    }

    // VSCode uses the stdio shape; the plain clients omit `type`.
    expect(vscode.type).toBe('stdio');
    expect(cursor.type).toBeUndefined();
    expect(claude.type).toBeUndefined();
  });
});
