import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildEntry, mergeServer } from '@archi-os/cli/lib/mcp-config';
import { clientContext, resolveClient } from '@archi-os/cli/lib/paths';
import type { ExtContext } from './config';

/** Merge the archi-os MCP entry into the VSCode client config (idempotent, backed up). */
export function configureMcp(ctx: ExtContext): string {
  const clientCtx = { ...clientContext(), workspaceRoot: ctx.workspaceRoot };
  const client = resolveClient('vscode', clientCtx);

  const distPath = `${ctx.workspaceRoot}/core/dist/index.js`;
  const entry = buildEntry({
    distPath,
    workspaceRoot: ctx.workspaceRoot,
    browseRoot: ctx.workspaceRoot,
    entryShape: client.entry,
  });

  const existing = existsSync(client.file) ? readFileSync(client.file, 'utf8') : '{}';
  if (existsSync(client.file)) copyFileSync(client.file, `${client.file}.bak`);
  const merged = mergeServer(existing, entry, client.key);

  mkdirSync(dirname(client.file), { recursive: true });
  writeFileSync(client.file, merged, 'utf8');
  return client.file;
}
