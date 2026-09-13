import { describe, expect, it } from "vitest";
import { accessTag, filterModels, mergeCatalog } from "./catalog";
import { SEED_CATALOG, seededFull } from "./catalog";

const seeds = SEED_CATALOG.map(seededFull);

describe("mergeCatalog", () => {
  it("keeps seed entries when nothing is discovered", () => {
    expect(mergeCatalog([], seeds).length).toBeGreaterThanOrEqual(seeds.length);
  });

  it("merges discovered data over seeds without losing capability hints", () => {
    const discovered = [
      {
        ...seededFull(SEED_CATALOG.find((s) => s.id === "glm-4.6")!),
        contextWindow: 200000,
        coding: false, // provider reports nothing; seed says coding
        source: "discovered" as const,
      },
    ];
    const merged = mergeCatalog(discovered, seeds);
    const glm = merged.find((m) => m.fullId === "zai/glm-4.6")!;
    expect(glm.coding).toBe(true); // union of seed + discovered
    expect(glm.contextWindow).toBe(200000);
  });

  it("adds unknown discovered models", () => {
    const discovered = [
      {
        id: "brand-new-model", fullId: "openai/brand-new-model", provider: "openai",
        name: "Brand New", description: "", contextWindow: 0, inputPricePerM: 0,
        outputPricePerM: 0, free: false, local: false, coding: false, reasoning: false,
        vision: false, tools: true, tags: [], source: "discovered" as const,
      },
    ];
    const merged = mergeCatalog(discovered, []);
    expect(merged.some((m) => m.fullId === "openai/brand-new-model")).toBe(true);
  });

  it("OpenRouter :free suffix marks model free", () => {
    const discovered = [
      {
        id: "test/model:free", fullId: "openrouter/test/model:free", provider: "openrouter",
        name: "Test Free", description: "", contextWindow: 0, inputPricePerM: 0,
        outputPricePerM: 0, free: false, local: false, coding: false, reasoning: false,
        vision: false, tools: true, tags: [], source: "discovered" as const,
      },
    ];
    const merged = mergeCatalog(discovered, []);
    expect(merged.find((m) => m.id === "test/model:free")?.free).toBe(true);
  });
});

describe("filterModels", () => {
  const models = mergeCatalog([], seeds);

  it("filters free models", () => {
    const free = filterModels(models, { free: true });
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((m) => m.free)).toBe(true);
  });

  it("filters local models", () => {
    const local = filterModels(models, { local: true });
    expect(local.every((m) => m.local)).toBe(true);
  });

  it("filters by provider", () => {
    const zai = filterModels(models, { providers: ["zai"] });
    expect(zai.every((m) => m.provider === "zai")).toBe(true);
    expect(zai.length).toBeGreaterThan(0);
  });

  it("searches by name and provider", () => {
    const hits = filterModels(models, { query: "claude" });
    expect(hits.length).toBeGreaterThan(0);
    const byProvider = filterModels(models, { query: "ollama" });
    expect(byProvider.every((m) => m.provider === "ollama")).toBe(true);
  });

  it("combines capability filters", () => {
    const coding = filterModels(models, { coding: true, free: true });
    expect(coding.every((m) => m.coding && m.free)).toBe(true);
  });

  it("onlyFavorites filters by favorite set", () => {
    const favs = new Set(["zai/glm-4.6"]);
    const favsOnly = filterModels(models, { favorites: favs, onlyFavorites: true });
    expect(favsOnly.map((m) => m.fullId)).toEqual(["zai/glm-4.6"]);
  });
});

describe("accessTag", () => {
  it("labels local models LOCAL", () => {
    const local = mergeCatalog([], seeds).find((m) => m.provider === "ollama")!;
    expect(accessTag(local)).toBe("LOCAL");
  });

  it("labels free models FREE", () => {
    const free = mergeCatalog([], seeds).find((m) => m.free && !m.local)!;
    expect(accessTag(free)).toBe("FREE");
  });

  it("labels byok paid models BYOK", () => {
    const paid = mergeCatalog([], seeds).find((m) => !m.free && !m.local)!;
    expect(accessTag(paid)).toBe("BYOK");
  });
});
