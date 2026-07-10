import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildEntry, mergeServer } from '@archi-os/cli/lib/mcp-config';
import { clientContext, resolveClient } from '@archi-os/cli/lib/paths';
import type { ExtContext } from './config';

/**
 * Merge the Nodalis MCP entry into the VSCode client config (idempotent, backed up).
 *
 * Standalone: the MCP server is the core bundled inside the extension, launched
 * through the editor's own Node (ELECTRON_RUN_AS_NODE) — no repo checkout and no
 * external Node install required. Definitions come from the workspace when
 * present, otherwise from the bundled defaults.
 *
 * @param extensionPath absolute install dir of the extension (context.extensionUri.fsPath)
 */
export function configureMcp(ctx: ExtContext, extensionPath: string): string {
  const clientCtx = { ...clientContext(), workspaceRoot: ctx.workspaceRoot };
  const client = resolveClient('vscode', clientCtx);

  const coreEntry = resolve(extensionPath, 'core-bundle', 'index.cjs');
  const wsDefs = resolve(ctx.workspaceRoot, 'definitions');
  const definitionsPath = existsSync(wsDefs) ? wsDefs : resolve(extensionPath, 'definitions');

  const entry = buildEntry({
    distPath: coreEntry,
    workspaceRoot: ctx.workspaceRoot,
    browseRoot: ctx.workspaceRoot,
    entryShape: client.entry,
  });
  // Run the bundled core under the editor's Node; fall back to bundled definitions.
  entry.command = process.execPath;
  entry.args = [coreEntry];
  entry.env = { ...entry.env, ELECTRON_RUN_AS_NODE: '1', DEFINITIONS_PATH: definitionsPath };

  const existing = existsSync(client.file) ? readFileSync(client.file, 'utf8') : '{}';
  if (existsSync(client.file)) copyFileSync(client.file, `${client.file}.bak`);
  const merged = mergeServer(existing, entry, client.key);

  mkdirSync(dirname(client.file), { recursive: true });
  writeFileSync(client.file, merged, 'utf8');
  return client.file;
}
