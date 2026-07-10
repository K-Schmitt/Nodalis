import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureMcp } from '../src/mcp';

type Entry = { command: string; args: string[]; env: Record<string, string>; type?: string };

function readServer(file: string, key: 'mcpServers' | 'servers'): Entry {
  const cfg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, Entry>>;
  return cfg[key]['archi-os'];
}

describe('configureMcp (standalone, multi-client)', () => {
  it('writes VSCode, Cursor and Claude Code configs pointing at the bundled core', () => {
    const ws = mkdtempSync(join(tmpdir(), 'nod-ws-'));
    const extPath = join(tmpdir(), 'nodalis-ext');

    const files = configureMcp(
      { workspaceRoot: ws, corePort: 3000, webPort: 5173, autostart: false },
      extPath,
    );

    // One file per client, all inside the workspace.
    expect(files).toEqual([
      join(ws, '.vscode', 'mcp.json'),
      join(ws, '.cursor', 'mcp.json'),
      join(ws, '.mcp.json'),
    ]);

    const vscode = readServer(join(ws, '.vscode', 'mcp.json'), 'servers');
    const cursor = readServer(join(ws, '.cursor', 'mcp.json'), 'mcpServers');
    const claude = readServer(join(ws, '.mcp.json'), 'mcpServers');

    for (const entry of [vscode, cursor, claude]) {
      // Runs the bundled core under the editor's Node — never the workspace's core/dist.
      expect(entry.command).toBe(process.execPath);
      expect(entry.args.some((a) => a.includes(join('core-bundle', 'index.cjs')))).toBe(true);
      expect(entry.args.join(' ')).not.toContain(join(ws, 'core'));
      expect(entry.env.ELECTRON_RUN_AS_NODE).toBe('1');
      expect(entry.env.DEFINITIONS_PATH).toBe(join(extPath, 'definitions'));
    }

    // VSCode uses the stdio shape; the plain clients omit `type`.
    expect(vscode.type).toBe('stdio');
    expect(cursor.type).toBeUndefined();
    expect(claude.type).toBeUndefined();
  });
});
