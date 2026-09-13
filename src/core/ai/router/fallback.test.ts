import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { fallbackChain, nextFallbackAfter, splitFullId } from "./fallback";
import { normalizeError, shouldFallback, describeError } from "../errors/taxonomy";
import { estimateTokens, formatTokens, truncate, newId } from "../../util/misc";

const settings = (over: Partial<typeof DEFAULT_SETTINGS.models> = {}): typeof DEFAULT_SETTINGS => ({
  ...DEFAULT_SETTINGS,
  models: {
    defaultModel: null,
    fallbacks: ["google/gemini-2.5-flash", "zai/glm-4.6"],
    fallbackEnabled: true,
    catalogRefreshedAt: null,
    ...over,
  },
});

describe("fallbackChain", () => {
  it("includes the primary plus enabled fallbacks", () => {
    const chain = fallbackChain(settings(), "zai/glm-4.6", [], []);
    expect(chain.map((s) => s.model)).toEqual(["zai/glm-4.6", "google/gemini-2.5-flash"]);
  });

  it("ignores fallbacks when disabled", () => {
    const chain = fallbackChain(settings({ fallbackEnabled: false }), "zai/glm-4.6", [], []);
    expect(chain.length).toBe(1);
  });

  it("skips fallbacks whose provider is disabled", () => {
    const providers = [{ id: "google", enabled: false }] as never[];
    const chain = fallbackChain(settings(), "zai/glm-4.6", providers, []);
    expect(chain.map((s) => s.model)).toEqual(["zai/glm-4.6"]);
  });

  it("marks known free models as not paid", () => {
    const catalog = [{ fullId: "google/gemini-2.5-flash", free: true, local: false }] as never[];
    const chain = fallbackChain(settings(), "zai/glm-4.6", [], catalog);
    const gemini = chain.find((s) => s.model === "google/gemini-2.5-flash")!;
    expect(gemini.paid).toBe(false);
  });
});

describe("nextFallbackAfter", () => {
  const steps = fallbackChain(settings(), "zai/glm-4.6", [], []);
  it("returns the next step for retriable errors", () => {
    const err = normalizeError({ category: "rate_limit", retriable: true });
    expect(nextFallbackAfter(steps, err, 0)?.model).toBe("google/gemini-2.5-flash");
  });

  it("returns null for non-fallback errors", () => {
    const err = normalizeError({ category: "invalid_api_key", retriable: false });
    expect(nextFallbackAfter(steps, err, 0)).toBeNull();
  });

  it("returns null at the end of the chain", () => {
    const err = normalizeError({ category: "provider_error", retriable: true });
    expect(nextFallbackAfter(steps, err, steps.length - 1)).toBeNull();
  });
});

describe("shouldFallback", () => {
  it("allows transient categories", () => {
    expect(shouldFallback(normalizeError({ category: "network" }))).toBe(true);
    expect(shouldFallback(normalizeError({ category: "timeout" }))).toBe(true);
  });
  it("never falls back on auth or quota errors", () => {
    expect(shouldFallback(normalizeError({ category: "invalid_api_key" }))).toBe(false);
    expect(shouldFallback(normalizeError({ category: "quota_exhausted" }))).toBe(false);
    expect(shouldFallback(normalizeError({ category: "insufficient_credits" }))).toBe(false);
  });
});

describe("splitFullId", () => {
  it("splits provider and model", () => {
    expect(splitFullId("openai/gpt-4o")).toEqual(["openai", "gpt-4o"]);
  });
  it("handles model ids containing slashes", () => {
    expect(splitFullId("openrouter/qwen/qwen3-coder:free")).toEqual([
      "openrouter",
      "qwen/qwen3-coder:free",
    ]);
  });
});

describe("normalizeError", () => {
  it("passes through structured backend errors", () => {
    const e = normalizeError({ code: "x", category: "rate_limit", message: "slow down", retriable: true, status: 429 });
    expect(e.category).toBe("rate_limit");
    expect(e.status).toBe(429);
  });
  it("wraps strings", () => {
    expect(normalizeError("boom").message).toBe("boom");
  });
  it("wraps Error objects", () => {
    expect(normalizeError(new Error("nope")).message).toBe("nope");
  });
});

describe("describeError", () => {
  it("suggests opening settings for auth errors", () => {
    const d = describeError(normalizeError({ category: "invalid_api_key" }));
    expect(d.actions).toContain("openSettings");
  });
  it("suggests retry for rate limits", () => {
    const d = describeError(normalizeError({ category: "rate_limit" }));
    expect(d.actions).toContain("retry");
  });
});

describe("misc utils", () => {
  it("estimateTokens approximates chars/4", () => {
    expect(estimateTokens("x".repeat(401))).toBe(Math.ceil(401 / 4));
  });
  it("formatTokens scales", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(3_400_000)).toBe("3.4M");
  });
  it("truncate adds ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
  });
  it("newId is unique", () => {
    const a = newId("x");
    const b = newId("x");
    expect(a).not.toBe(b);
    expect(a.startsWith("x_")).toBe(true);
  });
});
