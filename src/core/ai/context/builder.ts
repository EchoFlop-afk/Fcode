import type { Message } from "../../types";
import { estimateTokens } from "../../util/misc";

export interface ContextInput {
  projectRoot: string | null;
  projectName: string;
  /** Formatted tree lines from fs_tree (already capped by backend). */
  treeLines: string[];
  /** Excerpt of key manifests (package.json etc). */
  manifestExcerpts: { file: string; excerpt: string }[];
  readmeExcerpt: string | null;
  gitBranch: string | null;
  gitDirtyCount: number;
  /** Relevant file excerpts chosen for this request. */
  fileExcerpts: { path: string; content: string }[];
  /** Currently open editor tabs (paths only). */
  openFiles: string[];
  mode: "chat" | "agent";
}

/**
 * Assembles the system prompt with budgeted project context. Never sends the
 * whole project; selection happens via manifest/tree summaries and the
 * request-relevant file excerpts computed by selectRelevantFiles.
 */
export function buildSystemPrompt(ctx: ContextInput, budgetTokens: number): string {
  const sections: string[] = [];

  sections.push(
    ctx.mode === "agent"
      ? [
          "You are Fcode's coding agent, an AI pair programmer embedded in a desktop developer tool.",
          "Work like a senior engineer: understand the request, inspect the project with the provided tools, make focused changes, and verify them.",
          "Rules:",
          "- Use the provided tools to read files before editing them. Never guess file contents.",
          "- Prefer filesystem.edit (targeted replacement) over filesystem.write (full rewrite).",
          "- Keep changes minimal and consistent with the project's style.",
          "- After changing code, run an appropriate build/test command when one exists.",
          "- If a request is ambiguous, make a reasonable assumption and state it briefly.",
          "- Summarize what you changed at the end, as a short bullet list.",
        ].join("\n")
      : [
          "You are Fcode, a concise AI assistant in a desktop developer tool.",
          "Answer clearly and directly. Use markdown with fenced code blocks when useful.",
          "If the user asks about their project, use the project context below as background.",
        ].join("\n")
  );

  if (ctx.projectRoot) {
    const parts: string[] = [];
    parts.push(`Workspace: ${ctx.projectName} (${ctx.projectRoot})`);
    if (ctx.gitBranch) {
      parts.push(
        `Git: branch ${ctx.gitBranch}${ctx.gitDirtyCount > 0 ? `, ${ctx.gitDirtyCount} changed file(s)` : ", clean"}`
      );
    }
    if (ctx.treeLines.length) {
      parts.push(`Project structure:\n${ctx.treeLines.join("\n")}`);
    }
    for (const m of ctx.manifestExcerpts) {
      parts.push(`${m.file} (excerpt):\n${m.excerpt}`);
    }
    if (ctx.readmeExcerpt) {
      parts.push(`README (excerpt):\n${ctx.readmeExcerpt}`);
    }
    if (ctx.fileExcerpts.length) {
      const files = ctx.fileExcerpts
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");
      parts.push(`Relevant files for this request:\n${files}`);
    }
    if (ctx.openFiles.length) {
      parts.push(`Files open in the editor: ${ctx.openFiles.join(", ")}`);
    }
    sections.push(`# Project context\n\n${parts.join("\n\n")}`);
  }

  // Budget enforcement: drop the project context entirely if oversized,
  // then trim file excerpts oldest-first until within budget.
  let prompt = sections.join("\n\n");
  if (estimateTokens(prompt) > budgetTokens) {
    const trimmedExcerpts = [...ctx.fileExcerpts];
    while (trimmedExcerpts.length && estimateTokens(prompt) > budgetTokens) {
      trimmedExcerpts.pop();
      prompt = buildSystemPrompt({ ...ctx, fileExcerpts: trimmedExcerpts }, budgetTokens);
    }
    if (estimateTokens(prompt) > budgetTokens) {
      prompt = buildSystemPrompt({ ...ctx, treeLines: [], readmeExcerpt: null }, budgetTokens);
    }
  }
  return prompt;
}

/**
 * Selects files relevant to a request using simple heuristics:
 * names mentioned in the request, then grep hits for request keywords.
 * `candidates` are relative paths with their content already read.
 */
export function rankRelevantFiles(
  request: string,
  candidates: { path: string; content: string }[],
  limit = 6
): { path: string; content: string }[] {
  const reqLower = request.toLowerCase();
  const words = new Set(
    reqLower
      .split(/[^a-z0-9_.\-/]+/)
      .filter((w) => w.length >= 4)
  );
  const scored = candidates.map((c) => {
    const p = c.path.toLowerCase();
    let score = 0;
    if (reqLower.includes(p)) score += 10;
    const base = p.split("/").pop() ?? p;
    if (reqLower.includes(base)) score += 6;
    for (const w of words) {
      if (p.includes(w)) score += 2;
      const contentLower = c.content.length < 100_000 ? c.content.toLowerCase() : "";
      if (contentLower && contentLower.includes(w)) score += 0.5;
    }
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);
}

/** Trims history to fit the budget, always keeping the system prompt + last turns. */
export function trimHistory(messages: Message[], budgetTokens: number): Message[] {
  const kept: Message[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const cost = estimateTokens(m.content) + (m.toolCalls?.length ?? 0) * 40 + 12;
    if (total + cost > budgetTokens && kept.length > 4) break;
    total += cost;
    kept.unshift(m);
  }
  return kept;
}
