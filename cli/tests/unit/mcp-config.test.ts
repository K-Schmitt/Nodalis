import { describe, it, expect } from 'vitest';
import { parse } from 'jsonc-parser';
import { buildEntry, mergeServer, unmergeServer } from '../../src/lib/mcp-config.js';
import { McpConfigError } from '../../src/errors.js';

const entry = buildEntry('/abs/core/dist/index.js', '/abs', 'plain');
const vscodeEntry = buildEntry('/abs/core/dist/index.js', '/abs', 'stdio');

describe('buildEntry', () => {
  it('plain entry has no type', () => {
    expect(entry.type).toBeUndefined();
    expect(entry.command).toBe('node');
    expect(entry.args).toEqual(['/abs/core/dist/index.js']);
    expect(entry.env.WORKSPACE_ROOT).toBe('/abs');
  });
  it('stdio entry adds type', () => {
    expect(vscodeEntry.type).toBe('stdio');
  });
});

describe('mergeServer', () => {
  it('adds archi-os under mcpServers to empty text', () => {
    const out = mergeServer('', entry, 'mcpServers');
    expect(parse(out).mcpServers['archi-os'].command).toBe('node');
  });

  it('preserves sibling servers', () => {
    const input = '{ "mcpServers": { "other": { "command": "x" } } }';
    const out = mergeServer(input, entry, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers.other.command).toBe('x');
    expect(j.mcpServers['archi-os'].command).toBe('node');
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
    expect(j.servers['archi-os'].type).toBe('stdio');
    expect(j.mcpServers).toBeUndefined();
  });

  it('throws on unparseable input', () => {
    expect(() => mergeServer('{ not json', entry, 'mcpServers')).toThrow(McpConfigError);
  });
});

describe('unmergeServer', () => {
  it('removes only archi-os', () => {
    const input = mergeServer('{ "mcpServers": { "other": { "command": "x" } } }', entry, 'mcpServers');
    const out = unmergeServer(input, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers['archi-os']).toBeUndefined();
    expect(j.mcpServers.other.command).toBe('x');
  });
});
