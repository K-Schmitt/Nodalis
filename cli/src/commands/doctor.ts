import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { clientContext, resolveClient } from '../lib/paths.js';
import { isPortFree } from '../lib/ports.js';
import { isEntryAlive, readRunRegistry } from '../lib/process.js';
import { readCliConfig } from './init.js';

type Check = { label: string; ok: boolean; detail?: string };

export async function doctor(): Promise<void> {
  const ctx = clientContext();
  const checks: Check[] = [];

  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ label: `Node >= 20 (${process.versions.node})`, ok: major >= 20 });

  const coreDist = resolve(ctx.workspaceRoot, 'core', 'dist', 'index.js');
  const coreBuilt = existsSync(coreDist);
  checks.push({ label: 'core built (core/dist/index.js)', ok: coreBuilt, detail: coreBuilt ? undefined : 'run: npm run build:core' });

  const cfg = readCliConfig(ctx.workspaceRoot);
  for (const id of cfg.clients) {
    const d = resolveClient(id, ctx);
    checks.push({ label: `MCP config present: ${id}`, ok: existsSync(d.file), detail: d.file });
  }

  const reg = readRunRegistry(ctx.workspaceRoot);
  const coreFree = await isPortFree(cfg.ports.core);
  const ownsPort = !coreFree && reg?.core?.port === cfg.ports.core && isEntryAlive(reg.core);
  checks.push({
    label: `preferred core port ${cfg.ports.core}`,
    ok: coreFree || ownsPort,
    detail: coreFree ? 'free' : ownsPort ? 'in use by archi-os (running)' : 'in use by another process (fallback will apply)',
  });

  if (reg?.core) {
    checks.push({ label: `core process alive (pid ${reg.core.pid})`, ok: isEntryAlive(reg.core) });
  }

  let failures = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✖'} ${c.label}${c.detail ? `  → ${c.detail}` : ''}`);
    if (!c.ok) failures++;
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
}
