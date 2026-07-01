import { create } from 'zustand';
import { API_BASE_URL, POLL_INTERVAL_MS } from '../config.js';

export interface ProposalPreview {
  nodesToAdd:    Array<{ id: string; typeId: string; label: string; style: { shape: string; color: string; icon?: string } }>;
  edgesToAdd:    Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
  nodesToDelete: Array<{ id: string; label: string; typeId: string }>;
  edgesToDelete: Array<{ id: string }>;
  nodesToUpdate: Array<{ id: string; changes: Record<string, unknown> }>;
}

export interface PendingProposal {
  id: string;
  author: string;
  operations: Array<{ op: string; payload: Record<string, unknown> }>;
  preview: ProposalPreview;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  rejectionReason?: string;
}

interface ProposalState {
  pending: PendingProposal[];
  isPolling: boolean;
  fetchPending: () => Promise<void>;
  accept: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useProposalStore = create<ProposalState>((set, get) => ({
  pending: [],
  isPolling: false,

  fetchPending: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/proposals/pending`);
      if (!res.ok) return;
      const data = await res.json() as { proposals: PendingProposal[] };
      set({ pending: data.proposals });
    } catch (err) {
      console.error('[ProposalStore] fetch failed:', err);
    }
  },

  accept: async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    });
    if (res.ok) {
      set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
    }
  },

  reject: async (id, reason) => {
    const res = await fetch(`${API_BASE_URL}/api/proposals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      }),
    });
    if (res.ok) {
      set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
    }
  },

  startPolling: () => {
    if (pollingInterval) return;
    set({ isPolling: true });
    get().fetchPending();
    pollingInterval = setInterval(() => get().fetchPending(), POLL_INTERVAL_MS);
  },

  stopPolling: () => {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    set({ isPolling: false });
  },
}));
