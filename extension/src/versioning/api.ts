export type Version = {
  id: string;
  label: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  kind: 'auto' | 'manual';
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function listVersions(base: string): Promise<Version[]> {
  const data = await json<{ versions: Version[] }>(await fetch(`${base}/api/versions`));
  return data.versions;
}

export async function createSnapshot(base: string, label: string): Promise<Version> {
  const data = await json<{ version: Version }>(
    await fetch(`${base}/api/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  );
  return data.version;
}

export async function restoreVersion(base: string, id: string): Promise<void> {
  await json<{ success: boolean }>(
    await fetch(`${base}/api/versions/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  );
}
