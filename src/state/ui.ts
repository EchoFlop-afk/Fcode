import { create } from "zustand";

export type ViewKind = "chat" | "hub" | "projects" | "usage";

export type ToastKind = "info" | "warn" | "error" | "ok";

export interface Toast {
  id: string;
  text: string;
  kind: ToastKind;
}

interface UiState {
  view: ViewKind;
  sidebarOpen: boolean;
  codingMode: boolean;
  terminalOpen: boolean;
  modelSelectorOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  settingsSection: string;
  toasts: Toast[];

  setView: (v: ViewKind) => void;
  toggleSidebar: () => void;
  setCodingMode: (on: boolean) => void;
  setTerminalOpen: (on: boolean) => void;
  openModelSelector: () => void;
  closeModelSelector: () => void;
  openPalette: () => void;
  closePalette: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
}

export const useUi = create<UiState>((set) => ({
  view: "chat",
  sidebarOpen: true,
  codingMode: false,
  terminalOpen: false,
  modelSelectorOpen: false,
  paletteOpen: false,
  settingsOpen: false,
  settingsSection: "general",
  toasts: [],

  setView: (v) => set({ view: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCodingMode: (on) => set({ codingMode: on }),
  setTerminalOpen: (on) => set({ terminalOpen: on }),
  openModelSelector: () => set({ modelSelectorOpen: true }),
  closeModelSelector: () => set({ modelSelectorOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openSettings: (section) =>
    set({ settingsOpen: true, settingsSection: section ?? "general" }),
  closeSettings: () => set({ settingsOpen: false }),

  toast: (text, kind = "info") => {
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === "error" ? 8000 : 4500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
