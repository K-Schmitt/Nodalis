import { create } from 'zustand';
import { API_BASE_URL } from '../config.js';
import type { WorkspaceInfo, RecentWorkspace, Preset, DirListing } from '../types.js';
import { useGraphStore } from './useGraphStore.js';

interface WorkspaceState {
  active: WorkspaceInfo | null;
  recent: RecentWorkspace[];
  presets: Preset[];
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  fetchPresets: () => Promise<void>;
  openWorkspace: (path: string) => Promise<boolean>;
  createWorkspace: (path: string, name: string, presetId: string) => Promise<boolean>;
  browse: (path?: string) => Promise<DirListing | null>;
  clearError: () => void;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(url, {
    method: url.endsWith('/active') ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  active: null,
  recent: [],
  presets: [],
  loading: false,
  error: null,

  init: async () => {
    set({ loading: true });
    await Promise.all([get().fetchWorkspaces(), get().fetchPresets()]);
    set({ loading: false });
  },

  fetchWorkspaces: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces`);
      const data = await res.json() as { active: WorkspaceInfo | null; recent: RecentWorkspace[] };
      set({ active: data.active, recent: data.recent });
    } catch (err) {
      console.error('[WorkspaceStore] fetchWorkspaces failed:', err);
    }
  },

  openWorkspace: async (path) => {
    const { ok, data } = await postJson(`${API_BASE_URL}/api/workspaces/active`, { path });
    if (!ok) {
      set({ error: (data as { message?: string }).message ?? 'Failed to open workspace' });
      return false;
    }
    await get().fetchWorkspaces();
    await useGraphStore.getState().refresh();
    set({ error: null });
    return true;
  },

  createWorkspace: async (path, name, presetId) => {
    const { ok, data } = await postJson(`${API_BASE_URL}/api/workspaces`, { path, name, presetId });
    if (!ok) {
      set({ error: (data as { message?: string }).message ?? 'Failed to create workspace' });
      return false;
    }
    await get().fetchWorkspaces();
    await useGraphStore.getState().refresh();
    set({ error: null });
    return true;
  },

  browse: async (path) => {
    try {
      const url = new URL(`${API_BASE_URL}/api/fs/list`);
      if (path) url.searchParams.set('path', path);
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        set({ error: body.message ?? 'Failed to list folder' });
        return null;
      }
      return await res.json() as DirListing;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Network error' });
      return null;
    }
  },

  fetchPresets: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/presets`);
      const data = await res.json() as { presets: Preset[] };
      set({ presets: data.presets });
    } catch (err) {
      console.error('[WorkspaceStore] fetchPresets failed:', err);
    }
  },

  clearError: () => set({ error: null }),
}));
