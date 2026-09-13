import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "../../state/chat";
import { useUi } from "../../state/ui";
import { useSettings } from "../../state/settings";
import type { Message, ToolCall } from "../../core/types";
import { RichMarkdown } from "../Markdown";
import {
  IconCopy, IconCheck, IconRefresh, IconTrash, IconEdit, IconSend, IconStop,
  IconAlert, IconBolt, IconBrain, IconWrench, IconTerminal, IconCode,
  IconChevronRight, IconChevronDown, IconFolder, IconSettings, IconKey,
} from "../icons";
import { diffLines, elideContext, diffStats } from "../../core/util/diff";
import type { ActivityItem } from "../../core/agent/loop";
import { truncate, formatRelativeTime } from "../../core/util/misc";

export function ChatView() {
  const { messages, live, activity } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, live?.content, live?.toolCalls?.length]);

  return (
    <div className="chat-view">
      <div className="chat-scroll" ref={scrollRef}>
        <MessageList messages={messages} live={live} activity={activity} />
        <ApprovalArea />
      </div>
      <Composer />
    </div>
  );
}

const MessageList = memo(function MessageList({
  messages, live, activity,
}: {
  messages: Message[];
  live: Message | null;
  activity: ActivityItem[];
}) {
  if (!messages.length && !live) return <EmptyState />;
  return (
    <div className="message-list">
      {messages.map((m) => (
        <MessageRow key={m.id} msg={m} />
      ))}
      {live && <LiveMessage msg={live} activity={activity} />}
    </div>
  );
});

function EmptyState() {
  const { mode, setMode } = useChat();
  const { openSettings } = useUi();
  const { providers, keyPresent } = useSettings();
  const connected = providers.filter((p) => p.enabled && (keyPresent[p.id] || p.isLocal));

  return (
    <div className="empty-state">
      <div className="empty-hero" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24">
          <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="none" stroke="#2a2f36" strokeWidth="1" />
          <rect x="6.2" y="5" width="3" height="14" rx="0.5" fill="#7cb342" />
          <rect x="6.2" y="5" width="11.5" height="3" rx="0.5" fill="#7cb342" />
          <rect x="6.2" y="10.4" width="9" height="2.4" rx="0.5" fill="#4f7d2a" />
        </svg>
      </div>
      <div className="empty-title">Fcode</div>
      <div className="empty-sub">Multi-provider AI client for coding work</div>
      {connected.length === 0 ? (
        <div className="empty-help">
          <p>Add an AI provider to get started. Your key stays in the Windows Credential Manager.</p>
          <button className="btn primary" onClick={() => openSettings("providers")}>
            <IconKey size={13} /> Open Providers
          </button>
          <p className="empty-note">
            Free model endpoints can be browsed without a key. Local models
            (Ollama / LM Studio) work fully offline.
          </p>
        </div>
      ) : (
        <div className="empty-help">
          <div className="provider-chips">
            {connected.map((p) => (
              <span key={p.id} className="provider-chip">
                <span className={`provider-dot ${p.isLocal ? "local" : "ok"}`} /> {p.name}
              </span>
            ))}
          </div>
          <div className="mode-row">
            <button className={`chip-btn${mode === "chat" ? " active" : ""}`} onClick={() => setMode("chat")}>Chat</button>
            <button className={`chip-btn${mode === "agent" ? " active" : ""}`} onClick={() => setMode("agent")}>
              <IconWrench size={11} /> Agent
            </button>
          </div>
        </div>
      )}
      <div className="empty-hints">
        <span><kbd>Ctrl</kbd><kbd>K</kbd> models</span>
        <span><kbd>Ctrl</kbd><kbd>P</kbd> commands</span>
        <span><kbd>Ctrl</kbd><kbd>N</kbd> new chat</span>
        <span><kbd>Ctrl</kbd><kbd>B</kbd> sidebar</span>
      </div>
    </div>
  );
}

function Avatar({ msg }: { msg: Message }) {
  if (msg.role === "user") return <div className="msg-avatar user" aria-hidden>Y</div>;
  if (msg.role === "tool") return <div className="msg-avatar tool" aria-hidden><IconWrench size={12} /></div>;
  return (
    <div className="msg-avatar assistant" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24">
        <rect x="6.2" y="5" width="3" height="14" rx="0.5" fill="currentColor" />
        <rect x="6.2" y="5" width="11.5" height="3" rx="0.5" fill="currentColor" />
        <rect x="6.2" y="10.4" width="9" height="2.4" rx="0.5" fill="currentColor" opacity="0.65" />
      </svg>
    </div>
  );
}

function HeadInfo({ msg }: { msg: Message }) {
  if (msg.role === "user") return <span className="role">You</span>;
  if (msg.role === "tool") {
    return (
      <span className="role" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, color: "var(--dim)" }}>
        {msg.toolName ?? "tool"} result
      </span>
    );
  }
  const { models } = useSettings.getState();
  const model = models.find((m) => m.id === msg.model || m.fullId === msg.model);
  return (
    <>
      <span className="role">{model ? model.name || model.id : msg.model || "Assistant"}</span>
      {msg.provider && <span className="role-provider">{msg.provider}</span>}
    </>
  );
}

export const MessageRow = memo(function MessageRow({ msg }: { msg: Message }) {
  const { regenerate, deleteMessage, editMessage, streaming } = useChat();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);

  if (msg.error && !msg.content) {
    return (
      <div className="message error" data-role="error">
        <Avatar msg={msg} />
        <div className="msg-main">
          <div className="message-head"><HeadInfo msg={msg} /></div>
          <ErrorCard msg={msg} />
        </div>
      </div>
    );
  }

  const copyMsg = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`message ${msg.role}`} data-role={msg.role}>
      <Avatar msg={msg} />
      <div className="msg-main">
        <div className="message-head">
          <HeadInfo msg={msg} />
          <span className="msg-time">{formatRelativeTime(msg.createdAt)}</span>
          {msg.usage && (
            <span className="usage-tag" title="Token usage">
              {msg.usage.inputTokens} in · {msg.usage.outputTokens} out{msg.usage.estimated ? " est" : ""}
            </span>
          )}
          <span className="message-actions">
            {msg.content && (
              <button className="icon-btn" onClick={copyMsg} title="Copy message" aria-label="Copy message">
                {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
              </button>
            )}
            {msg.role === "assistant" && !streaming && (
              <button className="icon-btn" onClick={() => void regenerate()} title="Regenerate" aria-label="Regenerate">
                <IconRefresh size={13} />
              </button>
            )}
            {msg.role === "user" && !streaming && (
              <>
                <button
                  className="icon-btn"
                  onClick={() => { setEditing(true); setEditText(msg.content); }}
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <IconEdit size={13} />
                </button>
                <button className="icon-btn" onClick={() => deleteMessage(msg.id)} title="Delete message" aria-label="Delete message">
                  <IconTrash size={13} />
                </button>
              </>
            )}
          </span>
        </div>

        {editing ? (
          <div className="message-edit">
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  setEditing(false);
                  void editMessage(msg.id, editText);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="Edit message text"
            />
            <div className="message-edit-actions">
              <button className="btn small" onClick={() => setEditing(false)}>Cancel</button>
              <button
                className="btn primary small"
                onClick={() => { setEditing(false); void editMessage(msg.id, editText); }}
              >
                Save & resend
              </button>
            </div>
          </div>
        ) : msg.role === "tool" ? (
          <ToolResult msg={msg} />
        ) : (
          <>
            {msg.reasoning && <ReasoningBlock text={msg.reasoning} />}
            {msg.content && <RichMarkdown content={msg.content} />}
            {msg.toolCalls && msg.toolCalls.length > 0 && <ToolCallList calls={msg.toolCalls} />}
            {msg.error && <ErrorInline msg={msg} />}
            {msg.stopped && <div className="stopped-note">Generation stopped.</div>}
          </>
        )}
      </div>
    </div>
  );
});

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reasoning">
      <button className="reasoning-toggle" onClick={() => setOpen(!open)}>
        <IconBrain size={12} /> Reasoning {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
      </button>
      {open && <div className="reasoning-body">{text}</div>}
    </div>
  );
}

function ToolResult({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tool-result">
      <button className="tool-result-toggle" onClick={() => setOpen(!open)}>
        {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        {truncate(msg.content.split("\n")[0], 90)}
      </button>
      {open && <pre className="tool-result-body">{msg.content}</pre>}
    </div>
  );
}

function ToolCallList({ calls }: { calls: ToolCall[] }) {
  return (
    <div className="tool-calls">
      {calls.map((c) => (
        <div key={c.id} className="tool-call">
          <IconWrench size={12} />
          <code>{c.name}</code>
          <span className="tool-call-args">{truncate(c.arguments, 140)}</span>
        </div>
      ))}
    </div>
  );
}

function ErrorInline({ msg }: { msg: Message }) {
  const err = msg.error!;
  return (
    <div className="error-inline">
      <IconAlert size={13} />
      <span>{err.message}</span>
    </div>
  );
}

function errorTitle(category: string): string {
  const titles: Record<string, string> = {
    invalid_api_key: "Invalid or missing API key",
    rate_limit: "Rate limited",
    insufficient_credits: "Insufficient credits",
    model_unavailable: "Model unavailable",
    context_limit: "Context limit exceeded",
    timeout: "Request timed out",
    network: "Network error",
    provider_error: "Provider error",
    quota_exhausted: "Quota exhausted",
    not_configured: "Provider not configured",
  };
  return titles[category] ?? "Request failed";
}

function ErrorCard({ msg }: { msg: Message }) {
  const err = msg.error!;
  const { openSettings } = useUi();
  const { models, setActiveModel } = useSettings();
  const { regenerate } = useChat();
  const otherModels = models.filter((m) => m.fullId !== `${err.provider}/${err.model}`).slice(0, 5);

  return (
    <div className="error-card">
      <div className="error-card-title"><IconAlert size={14} /> {errorTitle(err.category)}</div>
      <div className="error-card-rows">
        {err.provider && <div><span>Provider</span><code>{err.provider}</code></div>}
        {err.model && <div><span>Model</span><code>{err.model}</code></div>}
        {err.status && <div><span>HTTP</span><code>{err.status}</code></div>}
        <div><span>Reason</span><span>{err.message}</span></div>
      </div>
      <div className="error-card-actions">
        {err.retriable && (
          <button className="btn small" onClick={() => void regenerate()}>Try again</button>
        )}
        <button
          className="btn small"
          onClick={() => {
            if (otherModels[0]) setActiveModel(otherModels[0].fullId);
            useUi.getState().openModelSelector();
          }}
        >
          Change model
        </button>
        <button className="btn small ghost" onClick={() => openSettings("providers")}>
          <IconSettings size={12} /> Provider settings
        </button>
      </div>
    </div>
  );
}

function LiveMessage({ msg, activity }: { msg: Message; activity: ActivityItem[] }) {
  return (
    <div className="message assistant live" data-role="assistant">
      <Avatar msg={msg} />
      <div className="msg-main">
        <div className="message-head">
          <span className="role">{msg.model}</span>
          {msg.provider && <span className="role-provider">{msg.provider}</span>}
          <span className="streaming-indicator" aria-label="Generating" />
        </div>
        <ActivityFeed items={activity} />
        {msg.reasoning && <ReasoningBlock text={msg.reasoning} />}
        {msg.content ? (
          <RichMarkdown content={msg.content} />
        ) : msg.toolCalls && msg.toolCalls.length ? (
          <ToolCallList calls={msg.toolCalls} />
        ) : (
          <div className="thinking-dots"><span /><span /><span /></div>
        )}
      </div>
    </div>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) return null;
  return (
    <div className="activity-feed">
      {items.map((a) => (
        <ActivityRow key={a.id} item={a} />
      ))}
    </div>
  );
}

function toolIcon(tool: string) {
  if (tool.startsWith("terminal.")) return <IconTerminal size={12} />;
  if (tool.startsWith("filesystem.")) return <IconCode size={12} />;
  return <IconWrench size={12} />;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false);
  const statusIcon =
    item.status === "running" ? <span className="act-spinner" aria-label="running" />
      : item.status === "ok" ? <IconCheck size={12} className="ok" />
      : item.status === "denied" ? <IconBolt size={12} className="denied" />
      : <IconAlert size={12} className="err" />;
  return (
    <div className={`activity-row ${item.status}`}>
      <button className="activity-toggle" onClick={() => setOpen(!open)}>
        {item.diff && item.diff.lines.length ? (
          open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
        ) : null}
        {toolIcon(item.tool)}
        <code className="activity-tool">{item.tool}</code>
        <span className="activity-detail">{truncate(item.detail ?? item.argsPreview, 80)}</span>
        {item.durationMs != null && item.status !== "running" && (
          <span className="activity-dur">{(item.durationMs / 1000).toFixed(1)}s</span>
        )}
        {statusIcon}
      </button>
      {open && item.diff && <DiffPreview path={item.diff.path} lines={item.diff.lines} />}
      {open && !item.diff && <pre className="activity-args">{item.argsPreview}</pre>}
    </div>
  );
}

function DiffPreview({ path, lines }: { path: string; lines: ReturnType<typeof diffLines> }) {
  const elided = useMemo(() => elideContext(lines, 2), [lines]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  return (
    <div className="diff-preview">
      <div className="diff-head">
        <span className="diff-path">{path}</span>
        <span className="diff-stats">
          <span className="add">+{stats.added}</span>
          <span className="del">-{stats.removed}</span>
        </span>
      </div>
      <pre className="diff-body">
        {elided.map((l, i) =>
          l.type === "gap" ? (
            <div key={i} className="diff-line gap">⋯ {l.count} unchanged</div>
          ) : (
            <div key={i} className={`diff-line ${l.type}`}>
              <span className="ln">{l.type === "add" ? l.newLine ?? "" : l.oldLine ?? ""}</span>
              <span className="sign">{l.type === "add" ? "+" : l.type === "del" ? "-" : " "}</span>
              <span className="txt">{l.text}</span>
            </div>
          )
        )}
      </pre>
    </div>
  );
}

function ApprovalArea() {
  const { pendingApproval, resolveApproval, streaming } = useChat();
  if (!pendingApproval || !streaming) return null;

  if (pendingApproval.kind === "diff") {
    return <DiffApproval req={pendingApproval} onResolve={resolveApproval} />;
  }
  if (pendingApproval.tool === "__fallback__") {
    return (
      <div className="approval-card">
        <div className="approval-title"><IconAlert size={13} /> Paid model fallback</div>
        <p>
          Continue with paid model <code>{String(pendingApproval.args.model)}</code>?
          This may spend money on your provider account.
        </p>
        <div className="approval-actions">
          <button className="btn small" onClick={() => resolveApproval("deny")}>No</button>
          <button className="btn primary small" onClick={() => resolveApproval("allowOnce")}>Yes, continue</button>
        </div>
      </div>
    );
  }
  return <ToolApproval req={pendingApproval} onResolve={resolveApproval} />;
}

function ToolApproval({
  req, onResolve,
}: {
  req: Extract<NonNullable<ReturnType<typeof useChat.getState>["pendingApproval"]>, { kind: "tool" }>;
  onResolve: (d: "allowOnce" | "always" | "deny") => void;
}) {
  return (
    <div className="approval-card">
      <div className="approval-title">
        <IconWrench size={13} /> {req.tool === "terminal.run" ? "AI wants to run a command" : `AI wants to use ${req.tool}`}
      </div>
      <pre className="approval-command">{req.command ?? truncate(JSON.stringify(req.args), 300)}</pre>
      {req.risk === "dangerous" && (
        <p className="approval-warning"><IconAlert size={12} /> This command may be destructive.</p>
      )}
      <div className="approval-actions">
        <button className="btn primary small" onClick={() => onResolve("allowOnce")}>Allow once</button>
        <button className="btn small" onClick={() => onResolve("always")}>
          Always allow{req.command ? ` (${req.command.split(/\s+/)[0]})` : ""}
        </button>
        <button className="btn small ghost" onClick={() => onResolve("deny")}>Deny</button>
      </div>
    </div>
  );
}

function DiffApproval({
  req, onResolve,
}: {
  req: Extract<NonNullable<ReturnType<typeof useChat.getState>["pendingApproval"]>, { kind: "diff" }>;
  onResolve: (d: "allowOnce" | "always" | "deny") => void;
}) {
  const lines = useMemo(() => diffLines(req.oldContent, req.newContent), [req.oldContent, req.newContent]);
  const elided = useMemo(() => elideContext(lines, 3), [lines]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  return (
    <div className="approval-card diff-card">
      <div className="approval-title">
        <IconFolder size={13} /> AI Changes · {req.path}
        <span className="diff-stats">
          <span className="add">+{stats.added}</span>
          <span className="del">-{stats.removed}</span>
        </span>
      </div>
      <pre className="diff-body tall">
        {elided.map((l, i) =>
          l.type === "gap" ? (
            <div key={i} className="diff-line gap">⋯ {l.count} unchanged</div>
          ) : (
            <div key={i} className={`diff-line ${l.type}`}>
              <span className="ln">{l.type === "add" ? l.newLine ?? "" : l.oldLine ?? ""}</span>
              <span className="sign">{l.type === "add" ? "+" : l.type === "del" ? "-" : " "}</span>
              <span className="txt">{l.text}</span>
            </div>
          )
        )}
      </pre>
      <div className="approval-actions">
        <button className="btn primary small" onClick={() => onResolve("allowOnce")}>Accept</button>
        <button className="btn small" onClick={() => onResolve("always")}>Accept & allow edits this session</button>
        <button className="btn small ghost" onClick={() => onResolve("deny")}>Reject</button>
      </div>
    </div>
  );
}

function Composer() {
  const { send, stop, streaming, mode, setMode } = useChat();
  const { settings } = useSettings();
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || streaming) return;
    setText("");
    void send(t);
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={areaRef}
          rows={1}
          placeholder={mode === "agent" ? "Describe a task for the agent…" : "Ask anything…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && settings.general.sendOnEnter && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
        />
        <div className="composer-bar">
          <div className="composer-mode" role="tablist" aria-label="Mode">
            <button
              className={`chip-btn${mode === "chat" ? " active" : ""}`}
              onClick={() => setMode("chat")}
              title="Plain chat, no tools"
            >
              Chat
            </button>
            <button
              className={`chip-btn${mode === "agent" ? " active" : ""}`}
              onClick={() => setMode("agent")}
              title="Agent mode: file and terminal tools with approval"
            >
              <IconWrench size={11} /> Agent
            </button>
          </div>
          <span className="composer-hint">
            {mode === "agent" ? "tools require approval" : "Enter to send · Shift+Enter newline"}
          </span>
          <span className="spacer" />
          {streaming ? (
            <button className="send-btn stop" onClick={stop} title="Stop generation (Esc)" aria-label="Stop generation">
              <IconStop size={14} />
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!text.trim()} title="Send (Enter)" aria-label="Send message">
              <IconSend size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
