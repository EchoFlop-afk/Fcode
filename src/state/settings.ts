import { create } from "zustand";
import { api } from "../core/api/ipc";
import type { Settings, ProviderConfig, ProviderStatusInfo } from "../core/types";
import { setCatalogCache } from "../core/agent/loop";
import { mergeCatalog, SEED_CATALOG, seededFull } from "../core/ai/models/catalog";
import { DEFAULT_SETTINGS } from "../core/settings/defaults";
import type { ModelInfo } from "../core/types";

interface SettingsState {
  loaded: boolean;
  settings: Settings;
  providers: ProviderConfig[];
  providerStatus: Record<string, ProviderStatusInfo>;
  keyPresent: Record<string, boolean>;
  models: ModelInfo[];
  favorites: string[];
  recentModels: string[];
  activeModel: string | null;
  init: () => Promise<void>;
  update: (mutate: (s: Settings) => void) => Promise<void>;
  refreshProviderStatus: (id: string) => Promise<void>;
  refreshProviderModels: (id: string) => Promise<void>;
  refreshAllModels: () => Promise<void>;
  setActiveModel: (fullId: string) => void;
  toggleFavorite: (fullId: string) => void;
  pushRecentModel: (fullId: string) => void;
}

const FAV_KEY = "fcode.favorites";
const RECENT_KEY = "fcode.recentModels";
const MODEL_KEY = "fcode.activeModel";

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function loadLocal(key: string): string[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(key: string, value: string[]): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function seedModels(): ModelInfo[] {
  return mergeCatalog([], SEED_CATALOG.map(seededFull));
}

function storedActiveModel(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

function storeActiveModel(fullId: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(MODEL_KEY, fullId);
  } catch {
    // ignore
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  providers: [],
  providerStatus: {},
  keyPresent: {},
  models: seedModels(),
  favorites: loadLocal(FAV_KEY),
  recentModels: loadLocal(RECENT_KEY),
  activeModel: storedActiveModel(),

  init: async () => {
    let settings = DEFAULT_SETTINGS;
    try {
      settings = await api.settingsGet();
    } catch {
      // Not running inside Tauri (plain vite dev) - use defaults.
    }
    const models = seedModels();
    setCatalogCache(models);
    set({ loaded: true, settings, providers: settings.providers, models });

    if (!get().activeModel && settings.models.defaultModel) {
      set({ activeModel: settings.models.defaultModel });
    }
    for (const p of settings.providers) {
      if (p.enabled) get().refreshProviderStatus(p.id);
    }
    get().refreshAllModels();
  },

  update: async (mutate) => {
    const next = structuredClone(get().settings) as Settings;
    mutate(next);
    set({ settings: next, providers: next.providers });
    try {
      await api.settingsSave(next);
    } catch {
      // best-effort in browser dev mode
    }
  },

  refreshProviderStatus: async (id) => {
    try {
      const status = await api.providerValidate(id);
      const key = await api.providerKeyStatus(id);
      set((s) => ({
        providerStatus: { ...s.providerStatus, [id]: status },
        keyPresent: { ...s.keyPresent, [id]: key.keyPresent },
      }));
    } catch {
      set((s) => ({
        providerStatus: {
          ...s.providerStatus,
          [id]: { id, status: "error", detail: "Status check failed", keyPresent: false },
        },
      }));
    }
  },

  refreshProviderModels: async (id) => {
    try {
      const discovered = await api.providerModels(id);
      const merged = mergeCatalog(discovered, SEED_CATALOG.map(seededFull));
      set({ models: merged });
      setCatalogCache(merged);
    } catch {
      // provider offline / no key - keep catalog as-is
    }
  },

  refreshAllModels: async () => {
    const { providers } = get();
    for (const p of providers) {
      if (p.enabled) await get().refreshProviderModels(p.id);
    }
    await get().update((s) => {
      s.models.catalogRefreshedAt = Date.now();
    });
  },

  setActiveModel: (fullId) => {
    set({ activeModel: fullId });
    storeActiveModel(fullId);
    get().pushRecentModel(fullId);
  },

  toggleFavorite: (fullId) => {
    const favorites = get().favorites;
    const next = favorites.includes(fullId)
      ? favorites.filter((f) => f !== fullId)
      : [...favorites, fullId];
    set({ favorites: next });
    saveLocal(FAV_KEY, next);
  },

  pushRecentModel: (fullId) => {
    const recent = [fullId, ...get().recentModels.filter((m) => m !== fullId)].slice(0, 12);
    set({ recentModels: recent });
    saveLocal(RECENT_KEY, recent);
  },
}));
