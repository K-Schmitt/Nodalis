import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureMcp } from '../src/mcp';

describe('configureMcp (standalone)', () => {
  it('points the MCP entry at the bundled core, not the workspace', () => {
    const ws = mkdtempSync(join(tmpdir(), 'nod-ws-'));
    const extPath = join(tmpdir(), 'nodalis-ext');

    const file = configureMcp(
      { workspaceRoot: ws, corePort: 3000, webPort: 5173, autostart: false },
      extPath,
    );

    const cfg = JSON.parse(readFileSync(file, 'utf8')) as {
      servers: Record<string, { command: string; args: string[]; env: Record<string, string>; type?: string }>;
    };
    const entry = cfg.servers['archi-os'];
    expect(entry).toBeDefined();

    // Runs the bundled core under the editor's Node — never the workspace's core/dist.
    expect(entry.command).toBe(process.execPath);
    expect(entry.args.some((a) => a.includes(join('core-bundle', 'index.cjs')))).toBe(true);
    expect(entry.args.join(' ')).not.toContain(join(ws, 'core'));
    expect(entry.env.ELECTRON_RUN_AS_NODE).toBe('1');

    // No workspace definitions → falls back to the bundled ones under the extension.
    expect(entry.env.DEFINITIONS_PATH).toBe(join(extPath, 'definitions'));
  });
});
