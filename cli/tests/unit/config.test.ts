import { describe, it, expect } from 'vitest';
import { parseCliConfig, DEFAULT_CONFIG } from '../../src/config.js';
import { McpConfigError } from '../../src/errors.js';

describe('parseCliConfig', () => {
  it('accepts a valid config', () => {
    const cfg = parseCliConfig({ ports: { core: 3000, web: 4173 }, clients: ['cursor'] });
    expect(cfg.ports.core).toBe(3000);
    expect(cfg.clients).toEqual(['cursor']);
  });

  it('rejects an unknown client', () => {
    expect(() => parseCliConfig({ ports: { core: 3000, web: 4173 }, clients: ['emacs'] }))
      .toThrow(McpConfigError);
  });

  it('rejects a non-integer port', () => {
    expect(() => parseCliConfig({ ports: { core: 3000.5, web: 4173 }, clients: [] }))
      .toThrow(McpConfigError);
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_CONFIG.ports.core).toBe(3000);
    expect(DEFAULT_CONFIG.ports.web).toBe(4173);
  });
});
