import { describe, expect, it } from "vitest";
import { parseTextToolCall, stripTextToolCall } from "./protocol";
import { promotionStatusView } from "../credits/quotas";
import type { PromotionStatus } from "../types";

describe("text tool protocol (fallback for providers without native tools)", () => {
  it("parses a well-formed tool block", () => {
    const content = 'Let me read that file.\n```fcode-tool\n{"name":"filesystem.read","arguments":{"path":"src/a.ts"}}\n```';
    const call = parseTextToolCall(content);
    expect(call?.name).toBe("filesystem.read");
    expect(JSON.parse(call!.arguments)).toEqual({ path: "src/a.ts" });
    expect(stripTextToolCall(content)).toBe("Let me read that file.");
  });

  it("returns null when no block present", () => {
    expect(parseTextToolCall("Just a normal answer")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseTextToolCall("```fcode-tool\n{not json}\n```")).toBeNull();
  });

  it("handles unterminated fences (streaming cut-off)", () => {
    expect(parseTextToolCall("text\n```fcode-tool\n{\"name\":\"x\"}")).toBeNull();
  });
});

describe("promotionStatusView", () => {
  const base: PromotionStatus = {
    promotion: {
      id: "p1", name: "Weekend Build", description: "test promo", provider: "openrouter",
      models: [], tokenBudget: 1000, startsAt: new Date(Date.now() - 3600e3).toISOString(),
      endsAt: new Date(Date.now() + 3600e3).toISOString(), reset: null, enabled: true,
    },
    used: 250,
    remaining: 750,
    expired: false,
    notStarted: false,
  };

  it("computes percent and active state", () => {
    const v = promotionStatusView(base);
    expect(v.percent).toBe(25);
    expect(v.state).toBe("active");
    expect(v.remaining).toBe(750);
  });

  it("flags exhausted promotions", () => {
    const v = promotionStatusView({ ...base, remaining: 0, used: 1000 });
    expect(v.state).toBe("exhausted");
    expect(v.percent).toBe(100);
  });

  it("flags expired promotions", () => {
    const v = promotionStatusView({ ...base, expired: true });
    expect(v.state).toBe("expired");
  });

  it("flags not-yet-started promotions", () => {
    const v = promotionStatusView({ ...base, notStarted: true });
    expect(v.state).toBe("upcoming");
  });
});
