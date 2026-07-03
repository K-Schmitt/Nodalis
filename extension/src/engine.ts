import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnManaged, stopEntry, type ProcEntry } from '@archi-os/cli/lib/process';
import { findFreePort, waitForHealth } from '@archi-os/cli/lib/ports';
import { startStaticServer } from '@archi-os/cli/lib/static-server';
import type { ExtContext } from './config';

export class Engine {
  private core: ProcEntry | null = null;
  private web: { port: number; close(): void } | null = null;

  isRunning(): boolean {
    return this.core !== null;
  }

  /** core base URL when running, else null. */
  coreBaseUrl(): string | null {
    return this.core ? `http://localhost:${this.core.port}` : null;
  }

  /** Spawn core (attached → dies on deactivate) + serve web/dist in-process. */
  async start(ctx: ExtContext): Promise<{ corePort: number; webUrl: string }> {
    if (this.core) return { corePort: this.core.port, webUrl: `http://localhost:${this.web?.port}` };

    const coreDist = resolve(ctx.workspaceRoot, 'core', 'dist', 'index.js');
    if (!existsSync(coreDist)) throw new Error('core not built. Run: npm run build -w core');

    const corePort = await findFreePort(ctx.corePort);
    const core = spawnManaged({
      workspaceRoot: ctx.workspaceRoot,
      name: 'core',
      command: process.execPath,
      commandArgs: [coreDist],
      env: { RUN_HTTP_SERVER: 'true', PORT: String(corePort), WORKSPACE_ROOT: ctx.workspaceRoot },
      mode: 'attached',
      port: corePort,
    });
    this.core = core;

    await waitForHealth(`http://127.0.0.1:${corePort}/health`, {
      timeoutMs: 20000,
      signal: () => { try { process.kill(core.pid, 0); return false; } catch { return true; } },
    });

    const distRoot = resolve(ctx.workspaceRoot, 'web', 'dist');
    if (!existsSync(distRoot)) throw new Error('web not built. Run: npm run build -w web');
    this.web = await startStaticServer({
      distRoot,
      apiBaseUrl: `http://localhost:${corePort}`,
      port: ctx.webPort,
    });

    return { corePort, webUrl: `http://localhost:${this.web.port}` };
  }

  async stop(): Promise<void> {
    this.web?.close();
    this.web = null;
    if (this.core) { await stopEntry(this.core); this.core = null; }
  }
}
