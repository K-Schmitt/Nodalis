import { describe, it, expect } from 'vitest';
import { isWebToExt } from '../src/webview/bridge';

describe('bridge message guards', () => {
  it('accepts a valid ready message', () => {
    expect(isWebToExt({ type: 'ready' })).toBe(true);
  });

  it('accepts open-external with url', () => {
    expect(isWebToExt({ type: 'open-external', payload: { url: 'https://x' } })).toBe(true);
  });

  it('rejects unknown type', () => {
    expect(isWebToExt({ type: 'nope' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isWebToExt(null)).toBe(false);
    expect(isWebToExt('ready')).toBe(false);
  });
});
