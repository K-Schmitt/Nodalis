import { describe, it, expect } from 'vitest';
import { validateDefinitionText } from '../src/diagnostics-core';

const VALID = JSON.stringify(
  { typeId: 'tech:frontend:react', label: 'React', category: 'frontend', style: { shape: 'rectangle', color: '#61DAFB' } },
  null, 2,
);

const INVALID = JSON.stringify(
  { typeId: 'tech:frontend:react', label: 'React', category: 'frontend', style: { shape: 'rectangle', color: 'blue' } },
  null, 2,
);

describe('validateDefinitionText', () => {
  it('returns no diagnostics for a valid definition', () => {
    expect(validateDefinitionText(VALID)).toEqual([]);
  });

  it('flags the bad color and points at its line', () => {
    const diags = validateDefinitionText(INVALID);
    expect(diags.length).toBeGreaterThan(0);
    const colorLine = INVALID.split('\n').findIndex((l) => l.includes('"color"'));
    expect(diags.some((d) => d.line === colorLine)).toBe(true);
    expect(diags[0].message.toLowerCase()).toContain('color');
  });

  it('returns a diagnostic (not throw) on invalid JSON', () => {
    const diags = validateDefinitionText('{ not json');
    expect(diags.length).toBeGreaterThan(0);
  });
});
