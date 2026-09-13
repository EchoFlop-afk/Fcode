import { describe, expect, it } from "vitest";
import { buildSystemPrompt, rankRelevantFiles, trimHistory } from "./builder";
import type { Message } from "../../types";
import { newId, nowMs } from "../../util/misc";

function msg(content: string, role: Message["role"] = "user"): Message {
  return { id: newId("m"), role, content, createdAt: nowMs() };
}

describe("buildSystemPrompt", () => {
  it("contains agent rules in agent mode", () => {
    const p = buildSystemPrompt(
      {
        projectRoot: null, projectName: "x", treeLines: [], manifestExcerpts: [],
        readmeExcerpt: null, gitBranch: null, gitDirtyCount: 0, fileExcerpts: [],
        openFiles: [], mode: "agent",
      },
      24000
    );
    expect(p).toContain("coding agent");
    expect(p).toContain("filesystem.edit");
  });

  it("includes project context when a project is open", () => {
    const p = buildSystemPrompt(
      {
        projectRoot: "C:/proj", projectName: "proj",
        treeLines: ["  src/", "  src/main.rs", "  Cargo.toml"],
        manifestExcerpts: [{ file: "Cargo.toml", excerpt: "[package]\nname = \"proj\"" }],
        readmeExcerpt: "My project", gitBranch: "main", gitDirtyCount: 2,
        fileExcerpts: [{ path: "src/main.rs", content: "fn main() {}" }],
        openFiles: [], mode: "agent",
      },
      24000
    );
    expect(p).toContain("C:/proj");
    expect(p).toContain("branch main");
    expect(p).toContain("fn main() {}");
    expect(p).toContain("Cargo.toml");
  });

  it("drops file excerpts when over budget", () => {
    const big = "x".repeat(40000);
    const p = buildSystemPrompt(
      {
        projectRoot: "C:/proj", projectName: "proj", treeLines: [], manifestExcerpts: [],
        readmeExcerpt: null, gitBranch: null, gitDirtyCount: 0,
        fileExcerpts: [{ path: "big.txt", content: big }],
        openFiles: [], mode: "chat",
      },
      2000
    );
    // Budget enforced: either excerpt dropped or prompt trimmed under budget.
    expect(p.length).toBeLessThan(big.length / 2 + 500);
  });
});

describe("rankRelevantFiles", () => {
  it("ranks files whose names appear in the request", () => {
    const picked = rankRelevantFiles(
      "please fix the bug in parser.ts",
      [
        { path: "src/parser.ts", content: "export function parse() {}" },
        { path: "src/other.ts", content: "unrelated" },
        { path: "README.md", content: "docs" },
      ]
    );
    expect(picked[0]?.path).toBe("src/parser.ts");
  });

  it("returns empty when nothing matches", () => {
    const picked = rankRelevantFiles("hello world", [{ path: "a.ts", content: "no match here" }]);
    expect(picked).toEqual([]);
  });

  it("respects the limit", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: `mention ${i}`,
    }));
    const request = "touch file1.ts file2.ts file3.ts and file5.ts";
    const picked = rankRelevantFiles(request, candidates, 3);
    expect(picked.length).toBeLessThanOrEqual(3);
  });
});

describe("trimHistory", () => {
  it("keeps the most recent messages", () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg(`message number ${i} `.repeat(20)));
    const kept = trimHistory(messages, 800);
    expect(kept.length).toBeLessThan(50);
    expect(kept[kept.length - 1].content).toBe(messages[49].content);
  });

  it("always keeps a few recent messages even over budget", () => {
    const messages = Array.from({ length: 10 }, () => msg("x".repeat(5000)));
    const kept = trimHistory(messages, 10);
    expect(kept.length).toBeGreaterThanOrEqual(1);
  });
});
