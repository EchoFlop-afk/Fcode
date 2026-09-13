import type { ModelInfo, ProviderConfig, Settings } from "../../types";
import { shouldFallback } from "../errors/taxonomy";
import type { AppError } from "../../types";

export interface FallbackStep {
  model: string;
  provider: string;
  modelInfo?: ModelInfo;
  /** true when using this fallback may spend money (paid model). */
  paid: boolean;
  reason: string;
}

/**
 * Builds the ordered fallback chain for a primary model: the primary itself,
 * then the user's configured fallbacks (enabled only).
 */
export function fallbackChain(
  settings: Settings,
  primaryModel: string,
  providers: ProviderConfig[],
  catalog: ModelInfo[]
): FallbackStep[] {
  const steps: FallbackStep[] = [];
  const primaryFull = primaryModel;
  const primaryInfo = catalog.find((m) => m.fullId === primaryFull);
  const [primaryProvider] = splitFullId(primaryFull);

  if (primaryInfo) {
    steps.push({
      model: primaryFull,
      provider: primaryProvider,
      modelInfo: primaryInfo,
      paid: !primaryInfo.free && !primaryInfo.local,
      reason: "selected model",
    });
  } else {
    // Model not in catalog (e.g. custom): derive provider from id.
    steps.push({
      model: primaryFull,
      provider: primaryProvider,
      paid: false,
      reason: "selected model",
    });
  }

  if (!settings.models.fallbackEnabled) return steps;

  for (const fb of settings.models.fallbacks) {
    const [provider] = splitFullId(fb);
    const info = catalog.find((m) => m.fullId === fb);
    const providerCfg = providers.find((p) => p.id === provider);
    if (providerCfg && !providerCfg.enabled) continue;
    if (steps.some((s) => s.model === fb)) continue;
    steps.push({
      model: fb,
      provider,
      modelInfo: info,
      paid: info ? !info.free && !info.local : true,
      reason: "fallback",
    });
  }
  return steps;
}

/**
 * Decides whether the next fallback step may be used. Paid fallbacks never
 * engage silently: the caller must confirm with the user first.
 */

export function splitFullId(fullId: string): [string, string] {
  const idx = fullId.indexOf("/");
  if (idx === -1) return ["", fullId];
  return [fullId.slice(0, idx), fullId.slice(idx + 1)];
}

/** Convenience wrapper used by the agent loop. */
export function nextFallbackAfter(
  steps: FallbackStep[],
  failed: AppError,
  failedIndex: number
): FallbackStep | null {
  if (!shouldFallback(failed)) return null;
  return steps[failedIndex + 1] ?? null;
}
