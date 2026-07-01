import { create } from 'zustand';

export type ToastKind = 'error' | 'success' | 'info';
export interface Toast { id: string; kind: ToastKind; message: string; code?: string }

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, code?: string) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, code) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, code }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
