import { createServer } from 'node:http';
import { PortError } from '../errors.js';

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((res) => {
    const srv = createServer();
    srv.once('error', () => res(false));
    srv.once('listening', () => srv.close(() => res(true)));
    srv.listen(port, host);
  });
}

export async function findFreePort(preferred: number, host = '127.0.0.1'): Promise<number> {
  for (let p = preferred; p <= preferred + 50 && p <= 65535; p++) {
    if (await isPortFree(p, host)) return p;
  }
  throw new PortError(`No free port near ${preferred}.`);
}

export async function waitForHealth(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number; signal?: () => boolean } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (opts.signal?.()) throw new PortError('Process exited before becoming healthy.');
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new PortError(`Timed out waiting for ${url}.`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
