import { describe, it, expect } from 'vitest';
import { injectRuntimeConfig, resolveSafePath } from '../../src/lib/static-server.js';

describe('injectRuntimeConfig', () => {
  it('injects before </head>', () => {
    const out = injectRuntimeConfig('<html><head><title>x</title></head><body></body></html>', 'http://localhost:3000');
    expect(out).toContain('window.__NODALIS__');
    expect(out.indexOf('__NODALIS__')).toBeLessThan(out.indexOf('</head>'));
  });
  it('escapes the url safely into JSON', () => {
    const out = injectRuntimeConfig('<head></head>', 'http://localhost:3000');
    expect(out).toContain('"apiBaseUrl":"http://localhost:3000"');
  });
});

describe('resolveSafePath', () => {
  it('confines to distRoot', () => {
    expect(resolveSafePath('/app/dist', '/index.html')).toBe('/app/dist/index.html');
  });
  it('rejects traversal', () => {
    expect(resolveSafePath('/app/dist', '/../../etc/passwd')).toBeNull();
  });
});
