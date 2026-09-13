import type { AppError } from "../../types";

const CATEGORY_TITLES: Record<string, string> = {
  invalid_api_key: "Invalid or missing API key",
  rate_limit: "Rate limited",
  insufficient_credits: "Insufficient credits",
  model_unavailable: "Model unavailable",
  context_limit: "Context limit exceeded",
  timeout: "Request timed out",
  network: "Network error",
  provider_error: "Provider error",
  bad_request: "Bad request",
  quota_exhausted: "Quota exhausted",
  not_configured: "Not configured",
  cancelled: "Stopped",
  permission_denied: "Permission denied",
  storage: "Storage error",
  internal: "Internal error",
};

const RETRIABLE_CATEGORIES = new Set([
  "rate_limit",
  "provider_error",
  "timeout",
  "network",
  "model_unavailable",
]);

/** Categories where falling back to another model is reasonable. */
export const FALLBACK_CATEGORIES = new Set([
  "rate_limit",
  "provider_error",
  "timeout",
  "network",
  "model_unavailable",
]);

export function categoryTitle(category: string): string {
  return CATEGORY_TITLES[category] ?? "Request failed";
}

export function isRetriable(err: AppError): boolean {
  if (err.retriable) return true;
  return RETRIABLE_CATEGORIES.has(err.category);
}

export function shouldFallback(err: AppError): boolean {
  return FALLBACK_CATEGORIES.has(err.category);
}

/** Normalizes unknown throwables into a structured AppError. */
export function normalizeError(e: unknown): AppError {
  if (e && typeof e === "object") {
    const anyE = e as Record<string, unknown>;
    if (typeof anyE.category === "string") {
      return {
        code: typeof anyE.code === "string" ? anyE.code : "internal",
        category: anyE.category,
        message: typeof anyE.message === "string" ? anyE.message : "Unknown error",
        provider: (anyE.provider as string) ?? null,
        model: (anyE.model as string) ?? null,
        status: (anyE.status as number) ?? null,
        retriable: Boolean(anyE.retriable),
      };
    }
    if (anyE.message) {
      return {
        code: "internal",
        category: "internal",
        message: String(anyE.message),
        provider: null,
        model: null,
        status: null,
        retriable: false,
      };
    }
  }
  if (typeof e === "string") {
    return {
      code: "internal",
      category: "internal",
      message: e,
      provider: null,
      model: null,
      status: null,
      retriable: false,
    };
  }
  return {
    code: "internal",
    category: "internal",
    message: "An unexpected error occurred",
    provider: null,
    model: null,
    status: null,
    retriable: false,
  };
}

export function describeError(err: AppError): {
  title: string;
  reason: string;
  actions: ("retry" | "changeModel" | "openSettings")[];
} {
  const title = categoryTitle(err.category);
  let reason = err.message;
  const actions: ("retry" | "changeModel" | "openSettings")[] = [];
  switch (err.category) {
    case "invalid_api_key":
      actions.push("openSettings");
      reason = err.message || "The provider rejected the credentials.";
      break;
    case "rate_limit":
      actions.push("retry", "changeModel");
      break;
    case "insufficient_credits":
      actions.push("openSettings", "changeModel");
      break;
    case "model_unavailable":
      actions.push("changeModel", "retry");
      break;
    case "context_limit":
      reason = "The conversation or project context exceeded the model's context window.";
      actions.push("changeModel");
      break;
    case "quota_exhausted":
      reason = err.message;
      actions.push("changeModel");
      break;
    case "not_configured":
      actions.push("openSettings");
      break;
    case "cancelled":
      reason = "Generation was stopped.";
      break;
    default:
      if (isRetriable(err)) actions.push("retry", "changeModel");
      else actions.push("retry");
  }
  return { title, reason, actions };
}
