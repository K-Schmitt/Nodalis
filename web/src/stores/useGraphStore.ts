import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import { API_BASE_URL, POLL_INTERVAL_MS } from '../config.js';
import type { Definition, GraphOperation, ApiError, GraphContext, BreadcrumbEntry, EdgeType } from '../types.js';

interface ApplyResult {
  ok: boolean;
  errors?: ApiError[];
}

interface GraphStore {
  nodes: Node[];
  edges: Edge[];
  definitions: Definition[];
  selectedNodeId: string | null;
  isLive: boolean;
  lastUpdate: Date | null;
  lastError: string | null;

  /** Active graph context: breadcrumb trail, current preset, edge relation palette. */
  context: GraphContext | null;
  /** Relation id used for newly drawn edges (when the preset declares edgeTypes). */
  activeRelation: string | null;

  fetchGraph: () => Promise<void>;
  fetchDefinitions: () => Promise<void>;
  fetchContext: () => Promise<void>;
  refresh: () => Promise<void>;
  selectNode: (id: string | null) => void;
  setActiveRelation: (id: string | null) => void;
  clearError: () => void;

  /** Apply user edits directly. Returns ok=false + errors when the Core rejects them. */
  applyOperations: (operations: GraphOperation[]) => Promise<ApplyResult>;
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>;

  // ── Sub-graph drill-down ──
  navigateTo: (stack: BreadcrumbEntry[]) => Promise<void>;
  enterSubgraph: (nodeId: string, label: string) => Promise<void>;
  exitToRoot: () => Promise<void>;
  createSubgraph: (nodeId: string, presetId: string) => Promise<boolean>;

  startPolling: () => void;
  stopPolling: () => void;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  definitions: [],
  selectedNodeId: null,
  isLive: false,
  lastUpdate: null,
  lastError: null,
  context: null,
  activeRelation: null,

  fetchGraph: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/graph`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { nodes: Node[]; edges: Edge[] };
      set({ nodes: data.nodes, edges: data.edges, isLive: true, lastUpdate: new Date() });
    } catch (err) {
      console.error('[GraphStore] fetch failed:', err);
      set({ isLive: false });
    }
  },

  fetchDefinitions: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/definitions`);
      if (!res.ok) return;
      const defs = await res.json() as Definition[];
      set({ definitions: defs });
    } catch (err) {
      console.error('[GraphStore] definitions fetch failed:', err);
    }
  },

  fetchContext: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/graph/context`);
      if (!res.ok) return;
      const ctx = await res.json() as GraphContext;
      // Keep a valid active relation selected: default to the first edge type.
      const relations = ctx.edgeTypes ?? [];
      const current = get().activeRelation;
      const stillValid = current && relations.some((t: EdgeType) => t.id === current);
      set({
        context: ctx,
        activeRelation: stillValid ? current : (relations[0]?.id ?? null),
      });
    } catch (err) {
      console.error('[GraphStore] context fetch failed:', err);
    }
  },

  refresh: async () => {
    await Promise.all([get().fetchGraph(), get().fetchDefinitions(), get().fetchContext()]);
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  setActiveRelation: (id) => set({ activeRelation: id }),
  clearError: () => set({ lastError: null }),

  applyOperations: async (operations) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/graph/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations }),
      });
      if (res.ok) {
        await get().fetchGraph();
        set({ lastError: null });
        return { ok: true };
      }
      const body = await res.json().catch(() => ({})) as { errors?: ApiError[]; error?: string; message?: string };
      const errors = body.errors ?? [];
      const message = errors.length > 0
        ? errors.map((e) => e.message).join(' · ')
        : (body.message ?? body.error ?? `Request failed (HTTP ${res.status})`);
      set({ lastError: message });
      return { ok: false, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      set({ lastError: message });
      return { ok: false };
    }
  },

  updateNodePosition: async (id, x, y) => {
    try {
      await fetch(`${API_BASE_URL}/api/graph/nodes/${id}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch (err) {
      console.error('[GraphStore] position update failed:', err);
    }
  },

  // ── Sub-graph drill-down ──────────────────────────────────────────────────

  navigateTo: async (stack) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/graph/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stack }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        set({ lastError: body.message ?? body.error ?? 'Failed to switch graph' });
        return;
      }
      set({ selectedNodeId: null });
      await get().refresh();
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Network error' });
    }
  },

  enterSubgraph: async (nodeId, label) => {
    const current = get().context?.breadcrumb ?? [];
    await get().navigateTo([...current.filter((e) => e.id !== nodeId), { id: nodeId, label }]);
  },

  exitToRoot: async () => {
    await get().navigateTo([]);
  },

  createSubgraph: async (nodeId, presetId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/graph/nodes/${nodeId}/subgraph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        set({ lastError: body.message ?? body.error ?? 'Failed to create sub-graph' });
        return false;
      }
      await get().fetchGraph();
      set({ lastError: null });
      return true;
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Network error' });
      return false;
    }
  },

  startPolling: () => {
    get().refresh();
    if (pollingInterval) clearInterval(pollingInterval);
    // Poll the graph AND its context so the frontend follows drill-down navigation
    // (including when the MCP agent enters/exits a sub-graph).
    pollingInterval = setInterval(() => {
      get().fetchGraph();
      get().fetchContext();
    }, POLL_INTERVAL_MS);
  },

  stopPolling: () => {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    set({ isLive: false });
  },
}));
