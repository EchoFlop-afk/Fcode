import { create } from "zustand";
import { api } from "../core/api/ipc";
import { useSettings } from "./settings";
import { useUi } from "./ui";
import type { FileEntry, GitStatus } from "../core/types";

export interface EditorTab {
  path: string;
  content: string;
  original: string;
  dirty: boolean;
  truncated: boolean;
  /** image preview tabs carry a data URL instead of text content */
  image?: { dataUrl: string; size: number };
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"]);

interface ProjectState {
  root: string | null;
  name: string;
  tree: FileEntry[];
  tabs: EditorTab[];
  activeTab: string | null;
  git: GitStatus | null;
  expandedDirs: Set<string>;

  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  refreshTree: () => Promise<void>;
  refreshGit: () => Promise<void>;
  toggleDir: (path: string) => void;

  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateBuffer: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  reloadTab: (path: string) => Promise<void>;
}

function dirName(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function expandParent(path: string): void {
  const dir = dirName(path);
  if (dir) {
    const next = new Set(useProject.getState().expandedDirs);
    next.add(dir);
    useProject.setState({ expandedDirs: next });
  }
}

export const useProject = create<ProjectState>((set, get) => ({
  root: null,
  name: "",
  tree: [],
  tabs: [],
  activeTab: null,
  git: null,
  expandedDirs: new Set(),

  openProject: async (path) => {
    set({ root: path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path });
    await get().refreshTree();
    await get().refreshGit();
    // persist as active + recent project
    await useSettingsStoreUpdate(path);
  },

  closeProject: () => {
    set({ root: null, name: "", tree: [], tabs: [], activeTab: null, git: null });
    void useSettings.getState().update((s) => {
      s.projects.active = null;
    });
  },

  refreshTree: async () => {
    const root = get().root;
    if (!root) return;
    const tree = await api.fsTree(3, root).catch(() => []);
    set({ tree });
  },

  refreshGit: async () => {
    const root = get().root;
    if (!root) return;
    const git = await api.gitStatus(root).catch(() => null);
    set({ git });
  },

  toggleDir: (path) => {
    const next = new Set(get().expandedDirs);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set({ expandedDirs: next });
  },

  openFile: async (path) => {
    const root = get().root;
    if (!root) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTab: path });
      return;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (IMAGE_EXTS.has(ext)) {
      const img = await api.fsReadDataUrl(path, root).catch(() => null);
      if (!img) {
        useUi.getState().toast(`Could not load image: ${path}`, "error");
        return;
      }
      set((s) => ({
        tabs: [
          ...s.tabs,
          { path, content: "", original: "", dirty: false, truncated: false, image: { dataUrl: img.dataUrl, size: img.size } },
        ],
        activeTab: path,
      }));
      expandParent(path);
      return;
    }
    const r = await api.fsRead(path, root).catch(() => null);
    if (!r) return;
    set((s) => ({
      tabs: [
        ...s.tabs,
        { path, content: r.content, original: r.content, dirty: false, truncated: r.truncated },
      ],
      activeTab: path,
    }));
    expandParent(path);
  },

  closeTab: (path) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activeTab = s.activeTab;
      if (activeTab === path) {
        activeTab = tabs.length ? tabs[tabs.length - 1].path : null;
      }
      return { tabs, activeTab };
    });
  },

  setActiveTab: (path) => set({ activeTab: path }),

  updateBuffer: (path, content) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (tab?.image) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content, dirty: content !== t.original } : t
      ),
    }));
  },

  saveTab: async (path) => {
    const root = get().root;
    const tab = get().tabs.find((t) => t.path === path);
    if (!root || !tab || tab.image) return;
    await api.fsWrite(path, tab.content, root);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, original: t.content, dirty: false } : t
      ),
    }));
    void get().refreshGit();
  },

  reloadTab: async (path) => {
    const root = get().root;
    const tab = get().tabs.find((t) => t.path === path);
    if (!root || !tab || tab.image) return;
    const r = await api.fsRead(path, root).catch(() => null);
    if (!r) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content: r.content, original: r.content, dirty: false } : t
      ),
    }));
  },
}));

async function useSettingsStoreUpdate(path: string): Promise<void> {
  await useSettings.getState().update((s) => {
    s.projects.active = path;
    s.projects.recent = [path, ...s.projects.recent.filter((p) => p !== path)].slice(0, 10);
  });
}
