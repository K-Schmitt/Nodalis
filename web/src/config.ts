declare global {
  interface Window { __NODALIS__?: { apiBaseUrl?: string } }
}

export const API_BASE_URL =
  (typeof window !== 'undefined' ? window.__NODALIS__?.apiBaseUrl : undefined)
  ?? import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:3000';
export const POLL_INTERVAL_MS = 2_000;
export const HEADER_HEIGHT_PX = 64;
