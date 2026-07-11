import { describe, it, expect } from 'vitest';
import { parse } from 'jsonc-parser';
import { buildEntry, mergeServer, unmergeServer } from '../../src/lib/mcp-config.js';
import { McpConfigError } from '../../src/errors.js';

const entry = buildEntry({ distPath: '/abs/core/dist/index.js', workspaceRoot: '/abs', browseRoot: '/home/u', entryShape: 'plain' });
const vscodeEntry = buildEntry({
  distPath: '${workspaceFolder}/core/dist/index.js',
  workspaceRoot: '${workspaceFolder}',
  browseRoot: '${userHome}',
  entryShape: 'stdio',
});

describe('buildEntry', () => {
  it('plain entry has no type and enriched env (abs paths)', () => {
    expect(entry.type).toBeUndefined();
    expect(entry.command).toBe('node');
    expect(entry.args).toEqual(['/abs/core/dist/index.js']);
    expect(entry.env.WORKSPACE_ROOT).toBe('/abs');
    expect(entry.env.DEFINITIONS_PATH).toBe('/abs/definitions');
    expect(entry.env.WORKSPACE_BROWSE_ROOT).toBe('/home/u');
  });
  it('stdio entry adds type and keeps VSCode variables', () => {
    expect(vscodeEntry.type).toBe('stdio');
    expect(vscodeEntry.args).toEqual(['${workspaceFolder}/core/dist/index.js']);
    expect(vscodeEntry.env.WORKSPACE_ROOT).toBe('${workspaceFolder}');
    expect(vscodeEntry.env.DEFINITIONS_PATH).toBe('${workspaceFolder}/definitions');
    expect(vscodeEntry.env.WORKSPACE_BROWSE_ROOT).toBe('${userHome}');
  });
});

describe('mergeServer', () => {
  it('adds nodalis under mcpServers to empty text', () => {
    const out = mergeServer('', entry, 'mcpServers');
    expect(parse(out).mcpServers['nodalis'].command).toBe('node');
  });

  it('preserves sibling servers', () => {
    const input = '{ "mcpServers": { "other": { "command": "x" } } }';
    const out = mergeServer(input, entry, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers.other.command).toBe('x');
    expect(j.mcpServers['nodalis'].command).toBe('node');
  });

  it('preserves user comments (surgical edit)', () => {
    const input = '{\n  // keep me\n  "mcpServers": {}\n}';
    const out = mergeServer(input, entry, 'mcpServers');
    expect(out).toContain('// keep me');
  });

  it('is idempotent', () => {
    const once = mergeServer('', entry, 'mcpServers');
    const twice = mergeServer(once, entry, 'mcpServers');
    expect(twice).toBe(once);
  });

  it('uses the servers key for vscode', () => {
    const out = mergeServer('', vscodeEntry, 'servers');
    const j = parse(out);
    expect(j.servers['nodalis'].type).toBe('stdio');
    expect(j.mcpServers).toBeUndefined();
  });

  it('throws on unparseable input', () => {
    expect(() => mergeServer('{ not json', entry, 'mcpServers')).toThrow(McpConfigError);
  });
});

describe('unmergeServer', () => {
  it('removes only nodalis', () => {
    const input = mergeServer('{ "mcpServers": { "other": { "command": "x" } } }', entry, 'mcpServers');
    const out = unmergeServer(input, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers['nodalis']).toBeUndefined();
    expect(j.mcpServers.other.command).toBe('x');
  });
});
