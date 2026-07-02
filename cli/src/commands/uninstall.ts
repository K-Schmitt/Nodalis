import { existsSync } from 'node:fs';
import { clientContext, resolveClient } from '../lib/paths.js';
import { unmergeServer } from '../lib/mcp-config.js';
import { clearRunRegistry } from '../lib/process.js';
import { atomicWrite, readCliConfig, readTextIfExists } from './init.js';
import { down } from './down.js';

export async function uninstall(): Promise<void> {
  const ctx = clientContext();
  const ws = ctx.workspaceRoot;

  await down(); // stop first

  const cfg = readCliConfig(ws);
  for (const id of cfg.clients) {
    const d = resolveClient(id, ctx);
    if (!existsSync(d.file)) continue;
    const before = readTextIfExists(d.file) ?? '';
    const after = unmergeServer(before, d.key);
    if (after !== before) {
      atomicWrite(d.file, after.endsWith('\n') ? after : after + '\n');
      console.log(`${id}: removed archi-os from ${d.file}`);
    }
  }

  clearRunRegistry(ws);
  console.log('Uninstalled. archi-os MCP entry removed (siblings and comments preserved).');
}
