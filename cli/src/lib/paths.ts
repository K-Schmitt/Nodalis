import { existsSync as realExistsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as pathWin32 from 'node:path/win32';
import type { ClientId } from '../config.js';

export type ClientDescriptor = {
  id: ClientId;
  file: string;
  key: 'mcpServers' | 'servers';
  entry: 'plain' | 'stdio';
};

export type ClientContext = {
  home: string;
  platform: NodeJS.Platform;
  workspaceRoot: string;
  appData?: string;
};

export function clientContext(): ClientContext {
  return {
    home: homedir(),
    platform: process.platform,
    workspaceRoot: process.env.WORKSPACE_ROOT ?? process.cwd(),
    appData: process.env.APPDATA,
  };
}

function claudeFile(ctx: ClientContext): string {
  const name = 'claude_desktop_config.json';
  if (ctx.platform === 'win32') {
    const appData = ctx.appData ?? pathWin32.join(ctx.home, 'AppData', 'Roaming');
    return pathWin32.join(appData, 'Claude', name);
  }
  if (ctx.platform === 'darwin') {
    return join(ctx.home, 'Library', 'Application Support', 'Claude', name);
  }
  return join(ctx.home, '.config', 'Claude', name);
}

export function resolveClient(id: ClientId, ctx: ClientContext): ClientDescriptor {
  switch (id) {
    case 'cursor':
      return { id, file: join(ctx.home, '.cursor', 'mcp.json'), key: 'mcpServers', entry: 'plain' };
    case 'vscode':
      return { id, file: join(ctx.workspaceRoot, '.vscode', 'mcp.json'), key: 'servers', entry: 'stdio' };
    case 'claude':
      return { id, file: claudeFile(ctx), key: 'mcpServers', entry: 'plain' };
  }
}

const ALL: ClientId[] = ['cursor', 'claude', 'vscode'];

export function detectInstalledClients(
  ctx: ClientContext,
  exists: (p: string) => boolean = realExistsSync,
): ClientId[] {
  return ALL.filter((id) => {
    const d = resolveClient(id, ctx);
    return exists(d.file) || exists(dirname(d.file));
  });
}
