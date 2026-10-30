import { create } from 'zustand';

export type DialogId = 'new' | 'export' | 'shortcuts' | 'about' | null;

interface UiState {
  dialog: DialogId;
  openDialog(d: DialogId): void;
  toast: { text: string; kind: 'info' | 'error' | 'warn'; id: number } | null;
  notify(text: string, kind?: 'info' | 'error' | 'warn'): void;
  /** Import warnings shown in a dismissible list. */
  warnings: string[];
  setWarnings(w: string[]): void;
  colorTarget: 'fill' | 'stroke';
  setColorTarget(t: 'fill' | 'stroke'): void;
  collapsed: Record<string, boolean>;
  toggleSection(id: string): void;
  spaceDown: boolean;
  setSpace(v: boolean): void;
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  toast: null,
  notify: (text, kind = 'info') => set({ toast: { text, kind, id: ++toastId } }),
  warnings: [],
  setWarnings: (warnings) => set({ warnings }),
  colorTarget: 'fill',
  setColorTarget: (colorTarget) => set({ colorTarget }),
  collapsed: {},
  toggleSection: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
  spaceDown: false,
  setSpace: (spaceDown) => set({ spaceDown }),
}));
