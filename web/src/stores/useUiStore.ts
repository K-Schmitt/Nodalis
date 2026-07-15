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

const readInitialPaletteOpen = (): boolean => {
  if (typeof window === 'undefined') return true;
  const saved = window.localStorage.getItem('archi-palette-open');
  return saved === null ? true : saved === 'true';
};

interface UiState {
  theme: ThemeMode;
  toggleTheme: () => void;

  /** Left-hand node-type palette open/collapsed. */
  paletteOpen: boolean;
  togglePalette: () => void;

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
  const initialPaletteOpen = readInitialPaletteOpen();
  return {
    theme: initial,
    toggleTheme: () =>
      set((s) => {
        const next: ThemeMode = s.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { window.localStorage.setItem('archi-theme', next); } catch { /* ignore */ }
        return { theme: next };
      }),

    paletteOpen: initialPaletteOpen,
    togglePalette: () =>
      set((s) => {
        const next = !s.paletteOpen;
        try { window.localStorage.setItem('archi-palette-open', String(next)); } catch { /* ignore */ }
        return { paletteOpen: next };
      }),

    cmdkOpen: false,
    setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),

    hoverRelationId: null,
    setHoverRelationId: (hoverRelationId) => set({ hoverRelationId }),

    hoverNodeId: null,
    setHoverNodeId: (hoverNodeId) => set({ hoverNodeId }),
  };
});
