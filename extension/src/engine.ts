import { resolve, delimiter } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnManaged, stopEntry, type ProcEntry } from '@nodalis/cli/lib/process';
import { findFreePort, waitForHealth } from '@nodalis/cli/lib/ports';
import { startStaticServer } from '@nodalis/cli/lib/static-server';
import type { ExtContext } from './config';

export class Engine {
  private core: ProcEntry | null = null;
  private web: { port: number; close(): void } | null = null;
  private startPromise: Promise<{ corePort: number; webUrl: string }> | null = null;

  isRunning(): boolean {
    return this.core !== null;
  }

  /** True only when BOTH the core and the web server are up. */
  isLive(): boolean {
    return this.core !== null && this.web !== null;
  }

  /** core base URL when running, else null. */
  coreBaseUrl(): string | null {
    return this.core ? `http://localhost:${this.core.port}` : null;
  }

  /**
   * Spawn the bundled core (attached → dies on deactivate) + serve the bundled
   * web frontend in-process. Everything ships inside the extension, so the
   * runtime starts on any workspace without the repo being cloned/built.
   *
   * @param extensionPath absolute install dir of the extension (context.extensionUri.fsPath)
   */
  async start(ctx: ExtContext, extensionPath: string): Promise<{ corePort: number; webUrl: string }> {
    if (this.core && this.web) return { corePort: this.core.port, webUrl: `http://localhost:${this.web.port}` };
    // Collapse concurrent start() calls (autostart + bootstrap, double-clicks)
    // onto a single launch so we never spawn the runtime twice.
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.launch(ctx, extensionPath).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async launch(ctx: ExtContext, extensionPath: string): Promise<{ corePort: number; webUrl: string }> {
    const coreEntry = resolve(extensionPath, 'core-bundle', 'index.cjs');
    if (!existsSync(coreEntry)) throw new Error('core bundle missing from the extension — rebuild the .vsix.');

    // Always load the bundled defaults; layer the workspace's own definitions on
    // top when present (later root wins by typeId/preset id) so a workspace can
    // extend AND override the base set instead of replacing it wholesale.
    const bundledDefs = resolve(extensionPath, 'definitions');
    const wsDefs = resolve(ctx.workspaceRoot, 'definitions');
    const definitionsPath = existsSync(wsDefs) ? `${bundledDefs}${delimiter}${wsDefs}` : bundledDefs;

    const corePort = await findFreePort(ctx.corePort);
    const core = spawnManaged({
      workspaceRoot: ctx.workspaceRoot,
      name: 'core',
      command: process.execPath,
      commandArgs: [coreEntry],
      env: {
        // In the VSCode extension host, process.execPath is the editor binary
        // (Code.exe / Electron), not node. This flag makes it run as a plain
        // Node interpreter — so the bundled core runs without any external Node.
        ELECTRON_RUN_AS_NODE: '1',
        RUN_HTTP_SERVER: 'true',
        PORT: String(corePort),
        WORKSPACE_ROOT: ctx.workspaceRoot,
        DEFINITIONS_PATH: definitionsPath,
      },
      mode: 'attached',
      port: corePort,
    });
    this.core = core;

    // Atomic start: if health or the web server fails, roll back the core so
    // engine state reflects "not running" (isLive()/coreBaseUrl() stay honest
    // and the caller can safely retry) instead of leaking a dangling process.
    try {
      await waitForHealth(`http://127.0.0.1:${corePort}/health`, {
        timeoutMs: 20000,
        signal: () => { try { process.kill(core.pid, 0); return false; } catch { return true; } },
      });

      const distRoot = resolve(extensionPath, 'web-dist');
      if (!existsSync(distRoot)) throw new Error('web bundle missing from the extension — rebuild the .vsix.');
      this.web = await startStaticServer({
        distRoot,
        apiBaseUrl: `http://localhost:${corePort}`,
        port: ctx.webPort,
      });
    } catch (err) {
      this.web?.close();
      this.web = null;
      try { await stopEntry(core); } catch { /* best-effort cleanup */ }
      this.core = null;
      throw err;
    }

    return { corePort, webUrl: `http://localhost:${this.web.port}` };
  }

  async stop(): Promise<void> {
    this.web?.close();
    this.web = null;
    if (this.core) { await stopEntry(this.core); this.core = null; }
  }
}
