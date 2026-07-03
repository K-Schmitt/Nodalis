export type Theme = 'dark' | 'light';

export type ExtToWeb =
  | { type: 'init'; payload: { apiBaseUrl: string; theme: Theme; workspacePath: string } }
  | { type: 'theme'; payload: { theme: Theme } }
  | { type: 'refresh' };

export type WebToExt =
  | { type: 'ready' }
  | { type: 'open-external'; payload: { url: string } };

const WEB_TO_EXT = new Set(['ready', 'open-external']);

export function isWebToExt(msg: unknown): msg is WebToExt {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return typeof t === 'string' && WEB_TO_EXT.has(t);
}
