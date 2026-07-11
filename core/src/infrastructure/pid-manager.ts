import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

/**
 * PID file manager — ensures only one instance of the HTTP server runs at a time.
 *
 * On startup:
 *  1. Check if the port is already bound.
 *  2. If yes and a PID file exists → kill the stale process gracefully.
 *  3. Write the current PID to the PID file.
 *  4. Register cleanup on exit so the file is always removed.
 */
export class PidManager {
  private readonly pidPath: string;

  constructor(private readonly port: number, workspaceRoot: string) {
    const archiDir = path.resolve(workspaceRoot, '.nodalis');
    if (!fs.existsSync(archiDir)) fs.mkdirSync(archiDir, { recursive: true });
    this.pidPath = path.join(archiDir, 'http-server.pid');
  }

  /**
   * Call this BEFORE starting the HTTP server.
   * Kills any stale process found on the port, then writes the current PID.
   */
  async acquirePort(): Promise<void> {
    const inUse = await this.isPortInUse();

    if (inUse) {
      const killed = await this.killStalePid();
      if (!killed) {
        // Port is taken by something unrelated — fail fast with a clear message
        console.error(
          `\n❌  Port ${this.port} is already in use by an unknown process.\n` +
          `    Run: lsof -ti:${this.port} | xargs kill -9\n`
        );
        process.exit(1);
      }

      // Give the OS a moment to release the port
      await sleep(500);

      // Confirm it's free now
      if (await this.isPortInUse()) {
        console.error(`❌  Port ${this.port} still in use after killing stale process.`);
        process.exit(1);
      }
    }

    this.writePid();
    this.registerCleanup();
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private isPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'EADDRINUSE');
      });
      server.once('listening', () => {
        server.close(() => resolve(false));
      });
      server.listen(this.port, '0.0.0.0');
    });
  }

  private async killStalePid(): Promise<boolean> {
    if (!fs.existsSync(this.pidPath)) return false;

    let pid: number;
    try {
      pid = parseInt(fs.readFileSync(this.pidPath, 'utf-8').trim(), 10);
      if (isNaN(pid)) return false;
    } catch {
      return false;
    }

    try {
      // SIGTERM first (graceful)
      process.kill(pid, 'SIGTERM');
      console.log(`⚠️  Killed stale Nodalis process (PID ${pid}) on port ${this.port}`);
      await sleep(300);

      // If still alive, force kill
      try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }

      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        // Process doesn't exist anymore — stale PID file
        console.log(`ℹ️  Stale PID file (${pid}) — process already gone`);
        return true; // port might be free now
      }
      return false;
    }
  }

  private writePid(): void {
    fs.writeFileSync(this.pidPath, String(process.pid), 'utf-8');
  }

  private registerCleanup(): void {
    const cleanup = () => {
      try { if (fs.existsSync(this.pidPath)) fs.unlinkSync(this.pidPath); } catch { /* ignore */ }
    };
    process.on('exit', cleanup);
    process.on('SIGINT',  () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('uncaughtException', (err) => { console.error('Uncaught:', err); cleanup(); process.exit(1); });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
