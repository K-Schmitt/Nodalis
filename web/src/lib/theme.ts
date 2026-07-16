/**
 * Design tokens. Node/panel surfaces reference CSS variables (defined in
 * index.css for light + dark), so a single `data-theme` switch re-themes the
 * whole app without touching component code. Accent colours still come from the
 * paradigm definitions (`style.color` / `render.accent`).
 */
export const T = {
  surface: 'var(--surface)',
  surfaceAlt: 'var(--surface-alt)',
  text: 'var(--text)',
  textMuted: 'var(--text-muted)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  shadow: 'var(--shadow)',
  shadowLg: 'var(--shadow-lg)',
  accent: 'var(--accent)',
  accentHover: 'var(--accent-hover)',
  radiusSm: 6,
  radius: 8,
  radiusLg: 12,
} as const;

/** Pick a readable text colour (black/white) for a solid background. WCAG-ish. */
export function readableText(hex?: string): '#ffffff' | '#0f172a' {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance (sRGB), simplified.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

/** Colour pill for a data type shown in record rows (ERD columns, UML attrs). */
const TYPE_COLORS: Array<[RegExp, string]> = [
  [/^(u?int|integer|serial|bigint|smallint|number|float|double|decimal|numeric)/i, '#0ea5e9'],
  [/^(varchar|char|text|string|str)/i, '#22c55e'],
  [/^(bool|boolean)/i, '#a855f7'],
  [/^(date|time|timestamp|datetime)/i, '#f59e0b'],
  [/^(uuid|guid)/i, '#ec4899'],
  [/^(json|jsonb|object|map)/i, '#14b8a6'],
  [/^(enum)/i, '#8b5cf6'],
];
export function typeColor(type?: string): string {
  if (!type) return '#94a3b8';
  for (const [re, c] of TYPE_COLORS) if (re.test(type.trim())) return c;
  return '#94a3b8';
}

/**
 * Canonical EventStorming palette for DDD sticky-notes, keyed by the node's
 * category (or typeId leaf). Falls back to the definition colour.
 */
const EVENT_STORMING: Record<string, string> = {
  aggregate: '#FACC15',      // yellow
  entity: '#FDE68A',
  'value-object': '#FEF3C7',
  command: '#3B82F6',        // blue
  event: '#F97316',          // orange
  saga: '#C4B5FD',           // lilac
  policy: '#C4B5FD',
  projection: '#34D399',     // green (read model)
  'bounded-context': '#E2E8F0',
};
export function eventStormingColor(typeId?: string, fallback = '#94a3b8'): string {
  const leaf = typeId?.split(':').pop() ?? '';
  return EVENT_STORMING[leaf] ?? fallback;
}
