import { describe, it, expect } from 'vitest';
import { resolveClient, detectInstalledClients } from '../../src/lib/paths.js';

const base = { home: '/home/u', workspaceRoot: '/ws', appData: 'C:\\Users\\u\\AppData\\Roaming' };

describe('resolveClient', () => {
  it('cursor → global mcp.json under home, mcpServers/plain', () => {
    const d = resolveClient('cursor', { ...base, platform: 'linux' });
    expect(d.file).toBe('/home/u/.cursor/mcp.json');
    expect(d.key).toBe('mcpServers');
    expect(d.entry).toBe('plain');
  });

  it('vscode → workspace .vscode/mcp.json, servers/stdio', () => {
    const d = resolveClient('vscode', { ...base, platform: 'linux' });
    expect(d.file).toBe('/ws/.vscode/mcp.json');
    expect(d.key).toBe('servers');
    expect(d.entry).toBe('stdio');
  });

  it('claude on linux → ~/.config/Claude', () => {
    const d = resolveClient('claude', { ...base, platform: 'linux' });
    expect(d.file).toBe('/home/u/.config/Claude/claude_desktop_config.json');
  });

  it('claude on darwin → Library/Application Support', () => {
    const d = resolveClient('claude', { ...base, platform: 'darwin' });
    expect(d.file).toBe('/home/u/Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('claude on win32 → APPDATA', () => {
    const d = resolveClient('claude', { ...base, platform: 'win32' });
    expect(d.file).toBe('C:\\Users\\u\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  });
});

describe('detectInstalledClients', () => {
  it('returns only clients whose file/dir exists', () => {
    const exists = (p: string) => p.includes('.cursor');
    const found = detectInstalledClients({ ...base, platform: 'linux' }, exists);
    expect(found).toContain('cursor');
    expect(found).not.toContain('vscode');
  });
});
