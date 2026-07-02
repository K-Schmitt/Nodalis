import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { isPortFree, findFreePort, waitForHealth } from '../../src/lib/ports.js';
import { PortError } from '../../src/errors.js';

function listen(port: number): Promise<() => void> {
  return new Promise((res) => {
    const s = createServer((_q, r) => r.end('ok'));
    s.listen(port, '127.0.0.1', () => res(() => s.close()));
  });
}

describe('ports', () => {
  it('isPortFree true for an unused high port', async () => {
    expect(await isPortFree(52999)).toBe(true);
  });

  it('findFreePort skips a busy preferred port', async () => {
    const close = await listen(52990);
    const p = await findFreePort(52990);
    expect(p).toBeGreaterThan(52990);
    close();
  });

  it('waitForHealth resolves against a live server', async () => {
    const close = await listen(52991);
    await expect(waitForHealth('http://127.0.0.1:52991/', { timeoutMs: 2000 })).resolves.toBeUndefined();
    close();
  });

  it('waitForHealth rejects when signal() reports child death', async () => {
    await expect(
      waitForHealth('http://127.0.0.1:52992/', { timeoutMs: 3000, intervalMs: 50, signal: () => true }),
    ).rejects.toBeInstanceOf(PortError);
  });
});
