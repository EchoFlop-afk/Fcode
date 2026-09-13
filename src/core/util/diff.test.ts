import { describe, expect, it } from "vitest";
import { diffLines, diffStats, elideContext } from "./diff";

describe("diffLines", () => {
  it("detects added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nX\nc");
    const stats = diffStats(d);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(d.find((l) => l.type === "add")?.text).toBe("X");
    expect(d.find((l) => l.type === "del")?.text).toBe("b");
  });

  it("handles pure insertion", () => {
    const d = diffLines("a", "a\nb");
    expect(diffStats(d)).toEqual({ added: 1, removed: 0 });
  });

  it("handles empty old file (creation)", () => {
    const d = diffLines("", "line1\nline2");
    expect(diffStats(d).added).toBe(2);
    expect(diffStats(d).removed).toBe(0);
  });

  it("handles empty new file (deletion)", () => {
    const d = diffLines("gone", "");
    expect(diffStats(d).removed).toBe(1);
  });

  it("identical input produces no changes", () => {
    const d = diffLines("same\nlines", "same\nlines");
    expect(diffStats(d)).toEqual({ added: 0, removed: 0 });
  });

  it("degrades gracefully for huge files", () => {
    const a = Array.from({ length: 5001 }, (_, i) => `line ${i}`).join("\n");
    const d = diffLines(a, `${a}\nextra`);
    expect(d.length).toBeLessThan(5);
  });
});

describe("elideContext", () => {
  it("collapses long unchanged runs", () => {
    const lines = diffLines(
      Array.from({ length: 20 }, (_, i) => `same ${i}`).join("\n"),
      Array.from({ length: 20 }, (_, i) => (i === 10 ? `CHANGED` : `same ${i}`)).join("\n")
    );
    const elided = elideContext(lines, 2);
    const gaps = elided.filter((l) => l.type === "gap") as { type: "gap"; count: number }[];
    const kept = elided.filter((l) => l.type !== "gap") as { text: string }[];
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.reduce((n, g) => n + g.count, 0) + kept.length).toBe(lines.length);
    expect(kept.some((l) => l.text === "CHANGED")).toBe(true);
  });
});
