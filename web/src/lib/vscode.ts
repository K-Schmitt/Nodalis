export type VsCodeApi = {
  postMessage(msg: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | null | undefined;

/** Returns the VSCode webview API when running inside the extension, else null. */
export function getVsCodeApi(): VsCodeApi | null {
  if (cached !== undefined) return cached;
  cached = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  return cached;
}

export const isWebview = (): boolean => getVsCodeApi() !== null;

/** Subscribe to messages pushed by the extension host. Returns an unsubscribe fn. */
export function onExtensionMessage(
  cb: (msg: { type: string; payload?: unknown }) => void,
): () => void {
  const handler = (e: MessageEvent): void => {
    const data = e.data as { type?: unknown };
    if (data && typeof data.type === 'string') cb(data as { type: string; payload?: unknown });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
