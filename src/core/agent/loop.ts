import type { Message, Settings, ToolCall } from "../types";
import { api } from "../api/ipc";
import { normalizeError } from "../ai/errors/taxonomy";
import { streamChat } from "../api/ipc";
import type { StreamHandle } from "../api/ipc";
import type { StreamEvent } from "../types";
import { AGENT_TOOLS, isFileMutatingTool, isReadOnlyTool, toolGroup } from "../ai/tools/definitions";
import { buildSystemPrompt, rankRelevantFiles, trimHistory, type ContextInput } from "../ai/context/builder";
import { fallbackChain, nextFallbackAfter, splitFullId, type FallbackStep } from "../ai/router/fallback";
import { parseTextToolCall, stripTextToolCall, TEXT_TOOL_PROTOCOL, renderToolList } from "./protocol";
import { newId, nowMs, truncate } from "../util/misc";
import { diffLines } from "../util/diff";

export interface ActivityItem {
  id: string;
  tool: string;
  argsPreview: string;
  status: "running" | "ok" | "error" | "denied";
  detail?: string;
  durationMs?: number;
  diff?: { path: string; lines: ReturnType<typeof diffLines> } | null;
  createdAt: number;
}

export type ApprovalRequest =
  | { kind: "tool"; tool: string; args: Record<string, unknown>; command?: string; risk?: string }
  | {
      kind: "diff";
      path: string;
      action: "write" | "edit" | "delete";
      oldContent: string;
      newContent: string;
      tool: string;
      args: Record<string, unknown>;
    };

export type ApprovalDecision = "allowOnce" | "always" | "deny";

export interface AgentDeps {
  settings: Settings;
  projectRoot: string | null;
  projectName: string;
  mode: "chat" | "agent";
  openFiles: string[];
  history: () => Message[];
  /** Called when the model name/provider used for the turn changed (fallback). */
  onModelChange?: (model: string, provider: string) => void;
}

export interface AgentEvents {
  /** live streaming updates for the in-flight assistant message */
  onLive: (msg: Message | null) => void;
  /** a finished message to append to the conversation */
  onMessage: (msg: Message) => void;
  onActivity: (a: ActivityItem) => void;
  requestApproval: (req: ApprovalRequest) => Promise<ApprovalDecision>;
  onNotice: (text: string, kind?: "info" | "warn" | "error") => void;
}

export interface TurnResult {
  ok: boolean;
  stopped: boolean;
  model: string;
  provider: string;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "please", "make",
  "file", "files", "code", "add", "change", "update", "fix", "when", "then",
]);

function salientWord(text: string): string | null {
  const words = text
    .split(/[^a-zA-Z0-9_.-]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  return words[0]?.toLowerCase() ?? null;
}

export class AgentRunner {
  private sessionGrants = new Set<string>();
  private current: StreamHandle | null = null;
  private stopped = false;

  constructor(
    private deps: AgentDeps,
    private events: AgentEvents
  ) {}

  stop(): void {
    this.stopped = true;
    this.current?.cancel().catch(() => {});
  }

  private grantKey(tool: string, args: Record<string, unknown>): string {
    if (tool === "terminal.run") {
      const cmd = String(args.command ?? "").trim();
      // Grant by executable prefix (first word) so "always allow npm" works.
      const first = cmd.split(/\s+/)[0] ?? "";
      return `terminal:${first}`;
    }
    return `tool:${tool}`;
  }

  private hasGrant(tool: string, args: Record<string, unknown>): boolean {
    const key = this.grantKey(tool, args);
    if (this.sessionGrants.has(key)) return true;
    if (tool === "terminal.run") {
      return this.sessionGrants.has("terminal:*");
    }
    return this.sessionGrants.has(`tool:${toolGroup(tool)}:*`);
  }

  async runTurn(userText: string, modelFullId: string): Promise<TurnResult> {
    this.stopped = false;
    const { settings } = this.deps;
    const [providerId] = splitFullId(modelFullId);

    const steps = fallbackChain(
      settings,
      modelFullId,
      settings.providers,
      this.catalog()
    );

    // Build user + context
    const context = await this.gatherContext(userText);
    let stepIndex = 0;
    let attemptContextTrim = false;

    // The conversation messages sent to the provider (system + history + user).
    const userMessage: Message = {
      id: newId("msg"),
      role: "user",
      content: userText,
      createdAt: nowMs(),
    };
    this.events.onMessage(userMessage);

    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      const prov = this.depsProvider(step.provider);
      if (!prov) {
        this.events.onNotice(`Provider '${step.provider}' is not configured.`, "error");
        stepIndex++;
        continue;
      }

      const result = await this.streamOnce(
        step,
        prov.supportsTools,
        context,
        attemptContextTrim
      );

      if (result.kind === "ok") {
        return { ok: true, stopped: false, model: step.model, provider: step.provider };
      }
      if (result.kind === "stopped") {
        return { ok: false, stopped: true, model: step.model, provider: step.provider };
      }
      if (result.kind === "context_limit" && !attemptContextTrim) {
        attemptContextTrim = true;
        this.events.onNotice(
          "Context limit hit - retrying with trimmed history and lighter context.",
          "warn"
        );
        continue; // retry same step once with trim
      }

      // Error: try fallback
      const next = nextFallbackAfter(steps, result.error, stepIndex);
      if (!next) {
        this.emitError(result.error, step);
        return { ok: false, stopped: false, model: step.model, provider: step.provider };
      }
      const decision = await this.maybeConfirmFallback(step, next, result.error);
      if (!decision) {
        this.emitError(result.error, step);
        return { ok: false, stopped: false, model: step.model, provider: step.provider };
      }
      this.events.onNotice(
        `Falling back to ${next.model} after ${result.error.category.replace(/_/g, " ")}.`,
        "info"
      );
      this.deps.onModelChange?.(next.model, next.provider);
      stepIndex = steps.indexOf(next);
    }
    return { ok: false, stopped: false, model: modelFullId, provider: providerId };
  }

  private emitError(error: ReturnType<typeof normalizeError>, step: FallbackStep): void {
    this.events.onMessage({
      id: newId("err"),
      role: "assistant",
      content: "",
      error: {
        code: error.code,
        category: error.category,
        message: error.message,
        provider: error.provider ?? step.provider,
        model: error.model ?? splitFullId(step.model)[1],
        status: error.status ?? null,
        retriable: error.retriable,
      },
      createdAt: nowMs(),
    });
  }

  private async maybeConfirmFallback(
    failed: FallbackStep,
    next: FallbackStep,
    error: ReturnType<typeof normalizeError>
  ): Promise<boolean> {
    if (failed.paid === next.paid) return true;
    if (!next.paid) return true;
    // Falling back to a paid model from a free one: never silent.
    return new Promise((resolve) => {
      this.events.onNotice(
        `Primary model failed (${error.category}). '${next.model}' is a PAID model - continue?`,
        "warn"
      );
      // The chat store routes this through an approval dialog.
      this.events
        .requestApproval({
          kind: "tool",
          tool: "__fallback__",
          args: { model: next.model },
          risk: "paid-fallback",
        })
        .then((d) => resolve(d !== "deny"));
    });
  }

  private depsProvider(id: string) {
    return this.deps.settings.providers.find((p) => p.id === id);
  }

  private catalog() {
    // Import cycle-free: read from the module-level cache set by stores.
    return getCatalogCache();
  }

  private async gatherContext(request: string): Promise<ContextInput> {
    const { projectRoot } = this.deps;
    const empty: ContextInput = {
      projectRoot: null,
      projectName: this.deps.projectName,
      treeLines: [],
      manifestExcerpts: [],
      readmeExcerpt: null,
      gitBranch: null,
      gitDirtyCount: 0,
      fileExcerpts: [],
      openFiles: this.deps.openFiles,
      mode: this.deps.mode,
    };
    if (!projectRoot) return empty;

    try {
      const [tree, inspect, git] = await Promise.all([
        api.fsTree(3, projectRoot).catch(() => []),
        api.projectInspect(projectRoot).catch(() => null),
        api.gitStatus(projectRoot).catch(() => null),
      ]);
      const treeLines = tree.map((e) => `${e.kind === "dir" ? "  " : "  "}${e.path}`);
      const manifests =
        ((inspect?.manifests as { file: string; excerpt: string }[]) ?? []) as {
          file: string;
          excerpt: string;
        }[];
      const readmeExcerpt = (inspect?.readmeExcerpt as string) ?? null;

      let fileExcerpts: { path: string; content: string }[] = [];
      // Agent mode: pick relevant files via grep + open files.
      const word = salientWord(request);
      const candidatePaths = new Set<string>(this.deps.openFiles);
      if (word) {
        const hits = await api
          .fsGrep(word, false, 20, projectRoot)
          .catch(() => []);
        for (const h of hits) candidatePaths.add(h.path);
      }
      if (this.deps.mode === "agent" && candidatePaths.size) {
        const paths = Array.from(candidatePaths).slice(0, 8);
        const contents = await Promise.all(
          paths.map((p) =>
            api.fsRead(p, projectRoot).then((r) => ({ path: p, content: r.content.slice(0, 8000) })).catch(() => null)
          )
        );
        fileExcerpts = rankRelevantFiles(request, contents.filter(Boolean) as { path: string; content: string }[], 5);
      } else if (this.deps.mode === "chat") {
        // Chat mode with a project: include a file only if named explicitly.
        for (const p of this.deps.openFiles) {
          if (request.toLowerCase().includes((p.split("/").pop() ?? p).toLowerCase())) {
            const r = await api.fsRead(p, projectRoot).catch(() => null);
            if (r) fileExcerpts.push({ path: p, content: r.content.slice(0, 6000) });
          }
        }
      }

      return {
        projectRoot,
        projectName: this.deps.projectName,
        treeLines: treeLines.slice(0, 120),
        manifestExcerpts: manifests,
        readmeExcerpt,
        gitBranch: git?.isRepo ? git.branch : null,
        gitDirtyCount: git?.entries?.length ?? 0,
        fileExcerpts,
        openFiles: this.deps.openFiles,
        mode: this.deps.mode,
      };
    } catch {
      return empty;
    }
  }

  private buildMessages(
    _step: FallbackStep,
    supportsTools: boolean,
    context: ContextInput,
    trim: boolean
  ): Message[] {
    const { settings } = this.deps;
    let system = buildSystemPrompt(context, settings.agent.contextBudgetTokens);
    if (this.deps.mode === "agent" && !supportsTools) {
      system += "\n" + TEXT_TOOL_PROTOCOL + "\n\nAvailable tools:\n" + renderToolList(AGENT_TOOLS);
    }
    const budget = settings.agent.contextBudgetTokens;
    let history = this.deps.history();
    if (trim) {
      history = trimHistory(history, Math.floor(budget * 0.6));
    }
    const sysMsg: Message = {
      id: "system",
      role: "system",
      content: system,
      createdAt: 0,
    };
    return [sysMsg, ...history];
  }

  /** One streaming attempt including the full tool loop for that attempt. */
  private async streamOnce(
    step: FallbackStep,
    supportsTools: boolean,
    context: ContextInput,
    trim: boolean
  ): Promise<
    | { kind: "ok" }
    | { kind: "stopped" }
    | { kind: "error"; error: ReturnType<typeof normalizeError> }
    | { kind: "context_limit"; error: ReturnType<typeof normalizeError> }
  > {
    const [providerId, model] = splitFullId(step.model);
    const started = nowMs();

    for (let iteration = 0; iteration < this.deps.settings.agent.maxIterations; iteration++) {
      if (this.stopped) return { kind: "stopped" };

      const messages = this.buildMessages(step, supportsTools, context, trim && iteration === 0);
      const useNativeTools = this.deps.mode === "agent" && supportsTools;

      const live: Message = {
        id: newId("msg"),
        role: "assistant",
        content: "",
        reasoning: "",
        toolCalls: [],
        model: model,
        provider: providerId,
        createdAt: nowMs(),
        streaming: true,
      };
      this.events.onLive(live);

      const assembledToolArgs: string[] = [];
      const toolNames: (string | null)[] = [];
      const finish = await new Promise<{
        reason: string;
        error?: ReturnType<typeof normalizeError>;
        usage?: { inputTokens: number; outputTokens: number };
      }>((resolve) => {
        const handle = streamChat(
          {
            providerId,
            model,
            messages,
            tools: useNativeTools ? AGENT_TOOLS : [],
          },
          (e: StreamEvent) => this.handleStreamEvent(e, live, assembledToolArgs, toolNames, resolve)
        );
        this.current = handle;
      });
      this.events.onLive(null);
      this.current = null;

      live.durationMs = nowMs() - started;
      live.streaming = false;

      if (finish.error) {
        const err = finish.error;
        if (err.category === "context_limit") return { kind: "context_limit", error: err };
        return { kind: "error", error: err };
      }

      // --- text protocol tool call? ---
      if (this.deps.mode === "agent" && !supportsTools && live.content) {
        const parsed = parseTextToolCall(live.content);
        if (parsed) {
          live.content = stripTextToolCall(live.content);
          live.toolCalls = [
            { id: newId("call"), name: parsed.name, arguments: parsed.arguments },
          ];
        }
      }

      const toolCalls = live.toolCalls ?? [];
      const hasToolWork = toolCalls.length > 0 && this.deps.mode === "agent";
      if (live.content || live.reasoning || hasToolWork) {
        if (finish.usage && !live.usage) {
          live.usage = {
            inputTokens: finish.usage.inputTokens,
            outputTokens: finish.usage.outputTokens,
            estimated: false,
          };
        }
        this.events.onMessage(live);
      }

      // --- tool calls? ---
      if (hasToolWork) {
        const results = await this.executeToolCalls(toolCalls, providerId, model);
        for (const r of results) this.events.onMessage(r);
        if (this.stopped) return { kind: "stopped" };
        continue; // next iteration with tool results in history
      }

      if (finish.reason === "cancelled") return { kind: "stopped" };
      return { kind: "ok" };
    }

    this.events.onNotice(
      `Agent stopped after reaching the iteration limit (${this.deps.settings.agent.maxIterations}).`,
      "warn"
    );
    return { kind: "ok" };
  }

  private handleStreamEvent(
    e: StreamEvent,
    live: Message,
    assembledToolArgs: string[],
    toolNames: (string | null)[],
    resolve: (r: {
      reason: string;
      error?: ReturnType<typeof normalizeError>;
      usage?: { inputTokens: number; outputTokens: number };
    }) => void
  ): void {
    switch (e.type) {
      case "delta":
        live.content += e.content;
        this.events.onLive(live);
        break;
      case "reasoning":
        live.reasoning = (live.reasoning ?? "") + e.content;
        this.events.onLive(live);
        break;
      case "toolCallStart": {
        assembledToolArgs[e.index] = "";
        toolNames[e.index] = e.name;
        const existing = live.toolCalls?.find((t) => t.id === e.id);
        if (!existing) {
          live.toolCalls = [
            ...(live.toolCalls ?? []),
            { id: e.id, name: e.name, arguments: "" },
          ];
          this.events.onLive(live);
        }
        break;
      }
      case "toolCallDelta": {
        assembledToolArgs[e.index] = (assembledToolArgs[e.index] ?? "") + e.delta;
        if (live.toolCalls?.[e.index]) {
          live.toolCalls[e.index] = {
            ...live.toolCalls[e.index],
            arguments: assembledToolArgs[e.index],
          };
          this.events.onLive(live);
        }
        break;
      }
      case "usage":
        live.usage = {
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          estimated: false,
        };
        break;
      case "done":
        resolve({ reason: e.finishReason });
        break;
      case "error":
        resolve({
          reason: "error",
          error: normalizeError(e),
        });
        break;
    }
  }

  /** Executes tool calls with approval gates; returns tool result messages. */
  private async executeToolCalls(
    calls: ToolCall[],
    providerId: string,
    model: string
  ): Promise<Message[]> {
    const results: Message[] = [];
    for (const call of calls) {
      if (this.stopped) break;
      const result = await this.executeOneTool(call);
      results.push({
        id: newId("tool"),
        role: "tool",
        content: result.content,
        toolCallId: call.id,
        toolName: call.name,
        model,
        provider: providerId,
        createdAt: nowMs(),
        durationMs: result.durationMs,
      });
    }
    return results;
  }

  private async executeOneTool(call: ToolCall): Promise<{ content: string; durationMs: number }> {
    const started = nowMs();
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      return { content: `Error: tool arguments are not valid JSON.`, durationMs: nowMs() - started };
    }

    const group = toolGroup(call.name);
    const perms = this.deps.settings.permissions;
    const perm = group === "filesystem" ? perms.filesystem : group === "terminal" ? perms.terminal : perms.git;

    const activityId = newId("act");
    const argsPreview = truncate(JSON.stringify(args), 120);
    const markActivity = (status: "running" | "ok" | "error" | "denied", detail?: string, diff?: ActivityItem["diff"]) =>
      this.events.onActivity({
        id: activityId,
        tool: call.name,
        argsPreview,
        status,
        detail,
        diff,
        createdAt: started,
      });

    // Disabled group => deny outright.
    if (perm === "disabled" && !isReadOnlyTool(call.name)) {
      markActivity("denied", `${group} tools are disabled in settings`);
      return {
        content: `Error: ${group} tools are disabled by the user's permission settings.`,
        durationMs: nowMs() - started,
      };
    }

    // File mutations: build diff, request approval (or auto).
    if (isFileMutatingTool(call.name)) {
      const approval = await this.handleFileMutation(call.name, args);
      markActivity(
        approval.status,
        approval.detail,
        approval.diff
      );
      return { content: approval.content, durationMs: nowMs() - started };
    }

    // Terminal: risk classification + approval.
    if (call.name === "terminal.run") {
      const command = String(args.command ?? "");
      const risk = await api.commandRisk(command).catch(() => "review");
      const needsApproval =
        risk === "dangerous" || (perm !== "auto" && !this.hasGrant(call.name, args));
      if (needsApproval) {
        const decision = await this.events.requestApproval({
          kind: "tool",
          tool: call.name,
          args,
          command,
          risk,
        });
        if (decision === "deny") {
          markActivity("denied", command);
          return { content: "Error: the user denied this command.", durationMs: nowMs() - started };
        }
        if (decision === "always") this.sessionGrants.add(this.grantKey(call.name, args));
      }
      markActivity("running", command);
      const outputLines: string[] = [];
      try {
        const result = (await api.toolExecute(
          call.name,
          args,
          this.deps.projectRoot ?? undefined,
          (ev) => {
            if (ev.type === "data" && ev.data) outputLines.push(`${ev.stream === "stderr" ? "[err] " : ""}${ev.data}`);
            if (ev.type === "error" && ev.message) outputLines.push(`[error] ${ev.message}`);
          }
        )) as { cwd?: string };
        const output = outputLines.slice(-400).join("\n");
        markActivity("ok", command);
        return {
          content: truncate(output || "(no output)", 16000) + (result?.cwd ? `\n(cwd: ${result.cwd})` : ""),
          durationMs: nowMs() - started,
        };
      } catch (e) {
        const err = normalizeError(e);
        markActivity("error", `${command} - ${err.message}`);
        return { content: `Error running command: ${err.message}`, durationMs: nowMs() - started };
      }
    }

    // Read-only tools + git: run directly.
    markActivity("running", argsPreview);
    try {
      const result = await api.toolExecute(call.name, args, this.deps.projectRoot ?? undefined);
      markActivity("ok", argsPreview);
      const content = typeof result === "string" ? result : JSON.stringify(result);
      return { content: truncate(content, 16000), durationMs: nowMs() - started };
    } catch (e) {
      const err = normalizeError(e);
      markActivity("error", err.message);
      return { content: `Error: ${err.message}`, durationMs: nowMs() - started };
    }
  }

  /** File write/edit/delete: compute diff, gate on approval, apply. */
  private async handleFileMutation(
    tool: string,
    args: Record<string, unknown>
  ): Promise<{ status: "ok" | "error" | "denied"; detail: string; content: string; diff?: ActivityItem["diff"] }> {
    const path = String(args.path ?? "");
    const root = this.deps.projectRoot;
    const perm = this.deps.settings.permissions.filesystem;

    let oldContent = "";
    let exists = false;
    if (root) {
      const read = await api.fsRead(path, root).catch(() => null);
      if (read) {
        exists = true;
        oldContent = read.content;
      }
    }
    if (tool === "filesystem.edit" && !exists) {
      return {
        status: "error",
        detail: path,
        content: `Error: cannot edit ${path} - file does not exist.`,
      };
    }

    let newContent = oldContent;
    if (tool === "filesystem.write") newContent = String(args.content ?? "");
    if (tool === "filesystem.edit") {
      const oldText = String(args.oldText ?? "");
      const newText = String(args.newText ?? "");
      const replaceAll = Boolean(args.replaceAll);
      const count = oldContent.split(oldText).length - 1;
      if (count === 0) {
        return {
          status: "error",
          detail: path,
          content: "Error: oldText not found in file. Read the file and retry with exact text.",
        };
      }
      if (count > 1 && !replaceAll) {
        return {
          status: "error",
          detail: path,
          content: `Error: oldText appears ${count} times. Provide more context or set replaceAll=true.`,
        };
      }
      newContent = replaceAll ? oldContent.split(oldText).join(newText) : oldContent.replace(oldText, newText);
    }
    if (tool === "filesystem.delete" && !exists) {
      return { status: "error", detail: path, content: `Error: ${path} does not exist.` };
    }

    const lines = diffLines(oldContent, newContent);
    const diff = { path, lines };

    // Approval gate (never silent unless auto mode).
    if (perm !== "auto" || !this.hasGrant(tool, args)) {
      const decision = await this.events.requestApproval({
        kind: "diff",
        path,
        action: tool === "filesystem.write" ? (exists ? "write" : "write") : tool === "filesystem.edit" ? "edit" : "delete",
        oldContent,
        newContent,
        tool,
        args,
      });
      if (decision === "deny") {
        return {
          status: "denied",
          detail: path,
          content: "Error: the user rejected this file change.",
          diff,
        };
      }
      if (decision === "always") this.sessionGrants.add(this.grantKey(tool, args));
    }

    try {
      if (tool === "filesystem.delete") {
        await api.toolExecute(tool, args, root ?? undefined);
      } else {
        await api.toolExecute(tool, { ...args, content: newContent }, root ?? undefined);
      }
      return {
        status: "ok",
        detail: path,
        content: `OK: ${tool.replace("filesystem.", "")} applied to ${path}.`,
        diff,
      };
    } catch (e) {
      const err = normalizeError(e);
      return { status: "error", detail: err.message, content: `Error: ${err.message}`, diff };
    }
  }
}

// --- module-level catalog cache (set by the models store; avoids a cycle) ---
let catalogCache: import("../types").ModelInfo[] = [];
export function setCatalogCache(models: import("../types").ModelInfo[]): void {
  catalogCache = models;
}
function getCatalogCache() {
  return catalogCache;
}
