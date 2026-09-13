import type { Settings } from "../types";

/**
 * Default settings used on first run and as the fallback when the backend
 * is unreachable (e.g. plain `vite` dev in a browser). Provider keys are
 * never part of settings - they live in the OS credential store.
 */
export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  general: { autoTitle: true, sendOnEnter: true, defaultAgentMode: false },
  appearance: { theme: "dark", fontSize: 13 },
  providers: [],
  models: {
    defaultModel: null,
    fallbacks: [],
    fallbackEnabled: false,
    catalogRefreshedAt: null,
  },
  agent: { maxIterations: 25, contextBudgetTokens: 24000 },
  permissions: { filesystem: "ask", terminal: "ask", git: "ask" },
  terminal: { shell: "powershell", timeoutSecs: 180 },
  projects: { active: null, recent: [] },
  advanced: { logToFile: false },
};
