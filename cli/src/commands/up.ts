import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError, ProcessError } from '../errors.js';
import { clientContext } from '../lib/paths.js';
import { findFreePort, waitForHealth } from '../lib/ports.js';
import {
  clearRunRegistry, isEntryAlive, readRunRegistry, spawnManaged, stopEntry, tailLog, writeRunRegistry, type RunRegistry,
} from '../lib/process.js';
import { startStaticServer } from '../lib/static-server.js';
import { readCliConfig } from './init.js';

export async function up(opts: { docker?: boolean; open?: boolean }): Promise<void> {
  const ctx = clientContext();
  const ws = ctx.workspaceRoot;

  const existing = readRunRegistry(ws);
  if (existing?.mode === 'docker') {
    console.log('Already up via docker compose. Run `nodalis down` first to switch mode.');
    return;
  }
  if (existing?.core && isEntryAlive(existing.core)) {
    console.log(`Already up — core on :${existing.core.port}${existing.web ? `, web on :${existing.web.port}` : ''}.`);
    return;
  }

  if (opts.docker) {
    const r = spawnSync('docker', ['compose', 'up', '-d'], { cwd: ws, stdio: 'inherit', shell: false });
    if (r.status !== 0) throw new ProcessError('docker compose up failed.');
    writeRunRegistry(ws, { mode: 'docker', startedAt: Date.now() });
    console.log('Started via docker compose.');
    return;
  }

  const cfg = readCliConfig(ws);
  const coreDist = resolve(ws, 'core', 'dist', 'index.js');
  if (!existsSync(coreDist)) throw new CliError('core not built. Run: npm run build:core');

  const corePort = await findFreePort(cfg.ports.core);
  const coreEntry = spawnManaged({
    workspaceRoot: ws, name: 'core', command: process.execPath, commandArgs: [coreDist],
    env: { RUN_HTTP_SERVER: 'true', PORT: String(corePort), WORKSPACE_ROOT: ws },
    mode: 'detached', port: corePort,
  });

  // Write core entry IMMEDIATELY so a later failure still leaves a killable process.
  const reg: RunRegistry = { mode: 'native', startedAt: Date.now(), core: coreEntry };
  writeRunRegistry(ws, reg);

  try {
    await waitForHealth(`http://127.0.0.1:${corePort}/health`, {
      timeoutMs: 20000, signal: () => !isEntryAlive(coreEntry),
    });
  } catch (err) {
    console.error(`✖ core failed to start.\n--- core.log (tail) ---\n${tailLog(ws, 'core')}`);
    throw err instanceof CliError ? err : new ProcessError('core did not become healthy.');
  }

  const distRoot = resolve(ws, 'web', 'dist');
  if (!existsSync(distRoot)) throw new CliError('web not built. Run: npm run build:web');

  const web = await startStaticServer({ distRoot, apiBaseUrl: `http://localhost:${corePort}`, port: cfg.ports.web });
  const webEntry = { pid: process.pid, port: web.port, startedAt: Date.now(), cmd: 'nodalis static-server' };
  writeRunRegistry(ws, { ...reg, web: webEntry });

  const webUrl = `http://localhost:${web.port}`;
  console.log(`\n✓ Nodalis ready\n  core: http://localhost:${corePort}\n  web:  ${webUrl}`);

  if (opts.open !== false) {
    if (process.platform === 'win32') {
      // `start` treats the first quoted token as a window title, hence the empty "".
      spawnSync('cmd', ['/c', 'start', '', webUrl], { stdio: 'ignore', shell: false });
    } else {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawnSync(opener, [webUrl], { stdio: 'ignore', shell: false });
    }
  }

  // Static server runs in THIS process; Ctrl-C tears down the whole stack
  // (foreground session owns core too) and clears the registry.
  await new Promise<void>((res) => {
    let shuttingDown = false;
    const shutdown = (): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      web.close();
      void stopEntry(coreEntry).finally(() => { clearRunRegistry(ws); res(); });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
