import type { AccessTag, ModelInfo } from "../../types";

export const CATALOG_VERSION = 4;

type Seed = Omit<ModelInfo, "fullId" | "provider" | "id" | "source"> & {
  provider: string;
  id: string;
};

function seed(s: Seed): Seed {
  return s;
}

/**
 * Seed catalog: stable, well-known model families. This is a convenience
 * index only - live discovery from providers (provider_models command)
 * supersedes it whenever the provider is reachable. Prices are per 1M tokens.
 */
export const SEED_CATALOG: Seed[] = [
  // --- OpenRouter (incl. genuinely free endpoints) ---
  seed({
    provider: "openrouter", id: "openai/gpt-4o-mini", name: "GPT-4o mini (OpenRouter)",
    description: "Fast, cheap OpenAI workhorse via OpenRouter.", contextWindow: 128000,
    inputPricePerM: 0.15, outputPricePerM: 0.6, free: false, local: false,
    coding: true, reasoning: false, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "openrouter", id: "deepseek/deepseek-chat-v3.1:free", name: "DeepSeek V3.1 (free)",
    description: "Free endpoint of DeepSeek's general chat model.", contextWindow: 64000,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: false,
    coding: true, reasoning: false, vision: false, tools: true, tags: ["free", "promo"],
  }),
  seed({
    provider: "openrouter", id: "qwen/qwen3-coder:free", name: "Qwen3 Coder (free)",
    description: "Free endpoint of Qwen3's coding model.", contextWindow: 128000,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: false,
    coding: true, reasoning: false, vision: false, tools: true, tags: ["free", "promo"],
  }),
  seed({
    provider: "openrouter", id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (free)",
    description: "Free endpoint of DeepSeek's reasoning model.", contextWindow: 64000,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: false,
    coding: true, reasoning: true, vision: false, tools: false, tags: ["free", "promo"],
  }),
  seed({
    provider: "openrouter", id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5 (OpenRouter)",
    description: "Strong agentic coding model via OpenRouter.", contextWindow: 200000,
    inputPricePerM: 3, outputPricePerM: 15, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok"],
  }),

  // --- Z.ai ---
  seed({
    provider: "zai", id: "glm-4.6", name: "GLM-4.6",
    description: "Z.ai flagship: agentic coding and long context.", contextWindow: 200000,
    inputPricePerM: 0.6, outputPricePerM: 2.2, free: false, local: false,
    coding: true, reasoning: true, vision: false, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "zai", id: "glm-4.5-air", name: "GLM-4.5-Air",
    description: "Lighter GLM with strong coding performance.", contextWindow: 128000,
    inputPricePerM: 0.2, outputPricePerM: 1.1, free: false, local: false,
    coding: true, reasoning: true, vision: false, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "zai", id: "glm-4.5-flash", name: "GLM-4.5-Flash",
    description: "Free-tier Z.ai flash model.", contextWindow: 128000,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: false,
    coding: true, reasoning: true, vision: false, tools: true, tags: ["free-tier", "byok"],
  }),

  // --- OpenAI ---
  seed({
    provider: "openai", id: "gpt-4o", name: "GPT-4o",
    description: "OpenAI multimodal flagship.", contextWindow: 128000,
    inputPricePerM: 2.5, outputPricePerM: 10, free: false, local: false,
    coding: true, reasoning: false, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "openai", id: "gpt-4o-mini", name: "GPT-4o mini",
    description: "Fast and inexpensive OpenAI model.", contextWindow: 128000,
    inputPricePerM: 0.15, outputPricePerM: 0.6, free: false, local: false,
    coding: true, reasoning: false, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "openai", id: "gpt-4.1", name: "GPT-4.1",
    description: "Strong long-context coding model.", contextWindow: 1000000,
    inputPricePerM: 2, outputPricePerM: 8, free: false, local: false,
    coding: true, reasoning: false, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "openai", id: "o4-mini", name: "o4-mini",
    description: "Compact reasoning model.", contextWindow: 200000,
    inputPricePerM: 1.1, outputPricePerM: 4.4, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok"],
  }),

  // --- Anthropic ---
  seed({
    provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5",
    description: "Best-in-class agentic coding and tool use.", contextWindow: 200000,
    inputPricePerM: 3, outputPricePerM: 15, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "anthropic", id: "claude-opus-4-1", name: "Claude Opus 4.1",
    description: "Anthropic's most capable model.", contextWindow: 200000,
    inputPricePerM: 15, outputPricePerM: 75, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok"],
  }),
  seed({
    provider: "anthropic", id: "claude-haiku-4-5", name: "Claude Haiku 4.5",
    description: "Fast Claude tier for everyday tasks.", contextWindow: 200000,
    inputPricePerM: 1, outputPricePerM: 5, free: false, local: false,
    coding: true, reasoning: false, vision: true, tools: true, tags: ["byok"],
  }),

  // --- Google ---
  seed({
    provider: "google", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro",
    description: "Large-context multimodal reasoning.", contextWindow: 1048576,
    inputPricePerM: 1.25, outputPricePerM: 10, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok", "free-tier"],
  }),
  seed({
    provider: "google", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash",
    description: "Fast Gemini with generous free tier.", contextWindow: 1048576,
    inputPricePerM: 0.3, outputPricePerM: 2.5, free: false, local: false,
    coding: true, reasoning: true, vision: true, tools: true, tags: ["byok", "free-tier"],
  }),
  seed({
    provider: "google", id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite",
    description: "Cheapest Gemini tier.", contextWindow: 1048576,
    inputPricePerM: 0.1, outputPricePerM: 0.4, free: false, local: false,
    coding: false, reasoning: false, vision: true, tools: true, tags: ["byok", "free-tier"],
  }),

  // --- Ollama (local, when pulled) ---
  seed({
    provider: "ollama", id: "qwen3:8b", name: "Qwen3 8B",
    description: "Local Qwen3 general model.", contextWindow: 32768,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: true, reasoning: true, vision: false, tools: true, tags: ["local"],
  }),
  seed({
    provider: "ollama", id: "qwen2.5-coder:7b", name: "Qwen2.5 Coder 7B",
    description: "Local coding specialist.", contextWindow: 32768,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: true, reasoning: false, vision: false, tools: true, tags: ["local"],
  }),
  seed({
    provider: "ollama", id: "llama3.1:8b", name: "Llama 3.1 8B",
    description: "Local Llama workhorse.", contextWindow: 131072,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: false, reasoning: false, vision: false, tools: true, tags: ["local"],
  }),
  seed({
    provider: "ollama", id: "gemma3:4b", name: "Gemma 3 4B",
    description: "Compact local Gemma.", contextWindow: 131072,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: false, reasoning: false, vision: true, tools: false, tags: ["local"],
  }),
  seed({
    provider: "ollama", id: "deepseek-r1:8b", name: "DeepSeek R1 8B",
    description: "Local reasoning model.", contextWindow: 32768,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: true, reasoning: true, vision: false, tools: false, tags: ["local"],
  }),

  // --- LM Studio (local, discovered live) ---
  seed({
    provider: "lmstudio", id: "local-model", name: "LM Studio model",
    description: "Models loaded in LM Studio are discovered live.", contextWindow: 0,
    inputPricePerM: 0, outputPricePerM: 0, free: true, local: true,
    coding: false, reasoning: false, vision: false, tools: true, tags: ["local"],
  }),
];

export function seededFull(m: Seed): ModelInfo {
  return {
    ...m,
    fullId: `${m.provider}/${m.id}`,
    source: "catalog",
  };
}

/** Merge live discovered models over the seed catalog. */
export function mergeCatalog(
  discovered: ModelInfo[],
  seeds: ModelInfo[] = SEED_CATALOG.map(seededFull)
): ModelInfo[] {
  const byFull = new Map<string, ModelInfo>();
  for (const s of seeds) byFull.set(s.fullId, { ...s });
  for (const d of discovered) {
    // Normalize the well-known OpenRouter ":free" suffix regardless of source.
    const normalized = d.id.endsWith(":free") ? { ...d, free: true } : d;
    const existing = byFull.get(d.fullId);
    if (existing) {
      // Discovered data wins for availability/pricing; keep seed capability
      // hints when the provider does not expose them.
      byFull.set(d.fullId, {
        ...existing,
        ...normalized,
        coding: normalized.coding || existing.coding,
        reasoning: normalized.reasoning || existing.reasoning,
        vision: normalized.vision || existing.vision,
        tools: normalized.tools && existing.tools,
        free: normalized.free || existing.free,
        local: normalized.local || existing.local,
        contextWindow: normalized.contextWindow || existing.contextWindow,
        inputPricePerM: normalized.inputPricePerM || existing.inputPricePerM,
        outputPricePerM: normalized.outputPricePerM || existing.outputPricePerM,
      });
    } else {
      byFull.set(d.fullId, normalized);
    }
  }
  return Array.from(byFull.values());
}

export interface ModelFilter {
  query?: string;
  providers?: string[];
  free?: boolean;
  local?: boolean;
  coding?: boolean;
  reasoning?: boolean;
  vision?: boolean;
  tools?: boolean;
  favorites?: Set<string>;
  onlyFavorites?: boolean;
  recent?: string[];
  onlyRecent?: boolean;
  sort?: "name" | "provider" | "context";
}

export function filterModels(models: ModelInfo[], f: ModelFilter): ModelInfo[] {
  let out = models;
  if (f.providers && f.providers.length) {
    out = out.filter((m) => f.providers!.includes(m.provider));
  }
  if (f.free) out = out.filter((m) => m.free);
  if (f.local) out = out.filter((m) => m.local);
  if (f.coding) out = out.filter((m) => m.coding);
  if (f.reasoning) out = out.filter((m) => m.reasoning);
  if (f.vision) out = out.filter((m) => m.vision);
  if (f.tools) out = out.filter((m) => m.tools);
  if (f.onlyFavorites && f.favorites) out = out.filter((m) => f.favorites!.has(m.fullId));
  if (f.onlyRecent && f.recent) {
    const rank = new Map(f.recent.map((id, i) => [id, i]));
    out = out.filter((m) => rank.has(m.fullId));
  }
  const q = f.query?.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.fullId.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }
  const sort = f.sort ?? "name";
  out = [...out].sort((a, b) => {
    if (sort === "provider") {
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
    }
    if (sort === "context") {
      return b.contextWindow - a.contextWindow || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Honest access label for a model. */
export function accessTag(m: ModelInfo): AccessTag {
  if (m.local) return "LOCAL";
  if (m.free) return "FREE";
  if (m.tags.includes("trial")) return "TRIAL";
  if (m.tags.includes("promo")) return "PROMO";
  return "BYOK";
}

export function sectionFor(m: ModelInfo, favorites: Set<string>, recent: string[]): string {
  if (favorites.has(m.fullId)) return "Favorites";
  if (recent.includes(m.fullId)) return "Recently Used";
  if (m.local) return "Local";
  if (m.free) return "Free";
  if (m.coding) return "Coding";
  return "All Models";
}
