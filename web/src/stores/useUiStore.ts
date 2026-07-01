import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const readInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('archi-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (mode: ThemeMode) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = mode;
};

interface UiState {
  theme: ThemeMode;
  toggleTheme: () => void;

  /** Command palette (Cmd/Ctrl-K) open state. */
  cmdkOpen: boolean;
  setCmdkOpen: (open: boolean) => void;

  /**
   * Cross-component hover highlight. When a record row referencing a relation
   * is hovered, edges matching this key light up (FK ↔ relation).
   */
  hoverRelationId: string | null;
  setHoverRelationId: (id: string | null) => void;

  /** Node currently hovered — used to emphasise its incident edges. */
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => {
  const initial = readInitialTheme();
  applyTheme(initial);
  return {
    theme: initial,
    toggleTheme: () =>
      set((s) => {
        const next: ThemeMode = s.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { window.localStorage.setItem('archi-theme', next); } catch { /* ignore */ }
        return { theme: next };
      }),

    cmdkOpen: false,
    setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),

    hoverRelationId: null,
    setHoverRelationId: (hoverRelationId) => set({ hoverRelationId }),

    hoverNodeId: null,
    setHoverNodeId: (hoverNodeId) => set({ hoverNodeId }),
  };
});
