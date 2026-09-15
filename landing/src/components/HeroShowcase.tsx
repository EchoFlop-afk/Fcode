import { useState, type ReactNode } from "react";
import { Check, ChevronDown, FileCode2, Folder, FolderOpen, Minus, Plus, Square, X } from "lucide-react";
import { Logomark, ProviderMark } from "./logos";
import { VERSION } from "./ui";

type Mode = "chat" | "code";

export default function HeroShowcase() {
  const [mode, setMode] = useState<Mode>("chat");
  return (
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-[0_40px_100px_-24px_rgba(0,0,0,0.85)]">
        <TitleBar mode={mode} onMode={setMode} />
        <div className="relative h-[500px] sm:h-[540px]">
          <Pane active={mode === "chat"}>
            <ChatView />
          </Pane>
          <Pane active={mode === "code"}>
            <CodeView />
          </Pane>
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[11px] text-fg3">
        Fcode {VERSION} — actual workspace UI · switch modes above
      </p>
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={`absolute inset-0 flex transition-opacity duration-200 ease-in-out ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function TitleBar({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div className="relative flex h-9 items-center justify-between border-b border-line bg-[#0c0e12] px-3">
      <div className="flex items-center gap-2">
        <Logomark className="h-4 w-4 rounded" />
        <span className="text-xs font-medium text-fg">Fcode</span>
        <span className="hidden font-mono text-[10px] text-fg3 sm:inline">{VERSION} · ~/dev/fcode</span>
      </div>

      <div
        role="tablist"
        aria-label="Workspace mode"
        className="absolute left-1/2 flex -translate-x-1/2 items-center rounded border border-line bg-canvas p-0.5"
      >
        {(
          [
            ["chat", "Chat Mode"],
            ["code", "Coding View"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => onMode(value)}
            className={`rounded px-2.5 py-0.5 font-mono text-[10.5px] transition-colors duration-150 ease-in-out ${
              mode === value ? "bg-brand/15 text-fg" : "text-fg3 hover:text-fg2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div aria-hidden className="flex items-center gap-0.5 text-fg3">
        <span className="grid h-6 w-7 place-items-center rounded hover:text-fg">
          <Minus size={11} />
        </span>
        <span className="grid h-6 w-7 place-items-center rounded hover:text-fg">
          <Square size={8} />
        </span>
        <span className="grid h-6 w-7 place-items-center rounded hover:text-fg">
          <X size={12} />
        </span>
      </div>
    </div>
  );
}

/* shared micro primitives */

function ChatRow({
  side,
  children,
}: {
  side: "user" | "ai";
  children: ReactNode;
}) {
  if (side === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded border border-brand/25 bg-brand/10 px-3 py-2 text-[12px] leading-5 text-fg">
          {children}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-brand font-mono text-[9px] font-semibold text-white">
        F
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

function CodeBlock({ filename, children }: { filename: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line px-2.5 py-1">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-fg3">
          <FileCode2 size={10} className="text-sky-400" />
          {filename}
        </span>
        <span className="font-mono text-[9px] text-fg3">utf-8 · ts</span>
      </div>
      <pre className="overflow-x-auto p-2.5 font-mono text-[11px] leading-[1.7]">{children}</pre>
    </div>
  );
}

/* ------------------------------- chat mode -------------------------------- */

const conversations = [
  { title: "Add sliding-window rate limiter", time: "14:02", active: true },
  { title: "Migrate auth to JWT refresh", time: "11:47" },
  { title: "Explain Rust IPC bridge", time: "09:15" },
  { title: "Fix flaky pnpm test suite", time: "Mon" },
];

function ChatView() {
  return (
    <div className="flex h-full w-full min-w-0">
      <aside className="hidden w-44 shrink-0 flex-col border-r border-line bg-[#0c0e12] md:flex">
        <div className="flex items-center justify-between px-2.5 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg3">Chats</span>
          <Plus size={12} className="text-fg3" />
        </div>
        <div className="mx-2 rounded border border-line bg-canvas px-2 py-1 font-mono text-[10px] text-fg3">
          Search… <span className="float-right">⌘K</span>
        </div>
        <div className="mt-2 flex-1 space-y-px px-1">
          {conversations.map((c) => (
            <div
              key={c.title}
              className={`flex items-center justify-between gap-2 rounded px-1.5 py-1.5 text-[11px] leading-4 ${
                c.active ? "bg-white/[0.06] text-fg" : "text-fg2 hover:bg-white/[0.03]"
              }`}
            >
              <span className="truncate">{c.title}</span>
              <span className="shrink-0 font-mono text-[9px] text-fg3">{c.time}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-fg2">
            <ProviderMark id="deepseek" name="DeepSeek" size={13} />
            DeepSeek-R1
            <span className="dot-live ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-hidden p-4">
          <ChatRow side="user">
            Add rate limiting to the login endpoint — 20 req/min per IP, respond 429 with
            Retry-After.
          </ChatRow>
          <ChatRow side="ai">
            <p className="text-[12px] leading-5 text-fg2">
              Added a sliding-window limiter and wired it into the login route:
            </p>
            <CodeBlock filename="src/middleware/rateLimit.ts">
              <span className="block">
                <span className="tok-k">const</span> <span className="tok-t">limiter</span>{" "}
                <span className="tok-p">=</span> <span className="tok-f">rateLimit</span>
                <span className="tok-p">({"{"}</span> <span className="tok-t">windowMs</span>
                <span className="tok-p">:</span> <span className="tok-n">60_000</span>
                <span className="tok-p">,</span> <span className="tok-t">max</span>
                <span className="tok-p">:</span> <span className="tok-n">20</span>{" "}
                <span className="tok-p">{"}"});</span>
              </span>
              <span className="block">
                <span className="tok-t">router</span>
                <span className="tok-p">.</span>
                <span className="tok-f">post</span>
                <span className="tok-p">(</span>
                <span className="tok-s">"/login"</span>
                <span className="tok-p">,</span> <span className="tok-t">limiter</span>
                <span className="tok-p">);</span>
                <span className="caret" />
              </span>
            </CodeBlock>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-line bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-fg2">
                <span className="text-sky-400">$</span> pnpm test
                <Check size={11} className="text-emerald-400" /> 42 passed · 2.1s
              </span>
              <span className="font-mono text-[10px] text-fg3">2 files changed</span>
            </div>
          </ChatRow>
        </div>

        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-fg3">
            <span className="flex items-center gap-1.5">
              <span className="text-fg2">context</span> main.tsx · lib/chat.ts
            </span>
            <span>
              12.4k / 128k tokens
            </span>
          </div>
          <div className="rounded border border-line bg-canvas px-3 py-2.5 transition-colors duration-150 ease-in-out focus-within:border-brand/50">
            <div className="flex items-center gap-3">
              <span className="flex-1 truncate text-[12px] text-fg3">
                Ask anything about your workspace…
              </span>
              <span className="hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg2 sm:inline-flex">
                <ProviderMark id="deepseek" name="DeepSeek" size={11} />
                DeepSeek-R1
                <ChevronDown size={10} className="text-fg3" />
              </span>
              <span className="grid h-6 w-6 place-items-center rounded bg-brand text-white">
                <ChevronDown size={12} className="-rotate-90" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ coding view ------------------------------- */

const tree: { name: string; depth: number; kind: "tsx" | "ts" | "rs" | "json" | "folder"; open?: boolean; active?: boolean }[] = [
  { name: "src", depth: 0, kind: "folder", open: true },
  { name: "main.tsx", depth: 1, kind: "tsx" },
  { name: "middleware", depth: 1, kind: "folder", open: true },
  { name: "rateLimit.ts", depth: 2, kind: "ts", active: true },
  { name: "lib", depth: 1, kind: "folder", open: true },
  { name: "chat.ts", depth: 2, kind: "ts" },
  { name: "src-tauri", depth: 0, kind: "folder", open: true },
  { name: "core.rs", depth: 1, kind: "rs" },
  { name: "package.json", depth: 0, kind: "json" },
];

const kindColor: Record<string, string> = {
  tsx: "text-sky-400",
  ts: "text-sky-400",
  rs: "text-orange-400",
  json: "text-amber-300/80",
  folder: "text-fg3",
};

function CodeView() {
  return (
    <div className="flex h-full w-full min-w-0">
      <aside className="hidden w-44 shrink-0 flex-col border-r border-line bg-[#0c0e12] py-2 md:flex">
        <p className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-fg3">
          Explorer
        </p>
        {tree.map((f) => (
          <div
            key={f.name}
            style={{ paddingLeft: 10 + f.depth * 12 }}
            className={`relative flex items-center gap-1.5 py-[3px] pr-2 text-[11px] ${
              f.active ? "bg-white/[0.06] text-fg" : "text-fg2"
            }`}
          >
            {f.active && (
              <span className="absolute inset-y-[3px] left-0 w-0.5 bg-brand" />
            )}
            {f.kind === "folder" ? (
              f.open ? (
                <FolderOpen size={12} className={`shrink-0 ${kindColor.folder}`} />
              ) : (
                <Folder size={12} className={`shrink-0 ${kindColor.folder}`} />
              )
            ) : (
              <FileCode2 size={12} className={`shrink-0 ${kindColor[f.kind]}`} />
            )}
            <span className="truncate">{f.name}</span>
          </div>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 items-end gap-1 border-b border-line bg-[#0c0e12] px-1.5">
          <span className="flex items-center gap-1.5 rounded-t border border-b-0 border-line bg-panel px-2.5 py-1.5 font-mono text-[10.5px] text-fg">
            <FileCode2 size={10} className="text-sky-400" />
            rateLimit.ts
            <X size={9} className="text-fg3" />
          </span>
          <span className="px-2.5 py-1.5 font-mono text-[10.5px] text-fg3">chat.ts</span>
        </div>

        <div className="flex-1 overflow-x-auto p-3 font-mono text-[11px] leading-[1.8]">
          {[
            { n: 12, c: <><span className="tok-k">export async function</span> <span className="tok-f">withRateLimit</span><span className="tok-p">(</span><span className="tok-t">req</span><span className="tok-p">, </span><span className="tok-t">handler</span><span className="tok-p">) {"{"}</span></> },
            { n: 13, c: <>{""}  <span className="tok-k">const</span> <span className="tok-t">ip</span> <span className="tok-p">=</span> <span className="tok-f">clientIp</span><span className="tok-p">(</span><span className="tok-t">req</span><span className="tok-p">);</span></> },
            { n: 14, c: <>{""}  <span className="tok-k">const</span> <span className="tok-t">res</span> <span className="tok-p">=</span> <span className="tok-k">await</span> <span className="tok-t">client</span><span className="tok-p">.</span><span className="tok-f">completeBlocking</span><span className="tok-p">(</span><span className="tok-t">ctx</span><span className="tok-p">);</span></>, del: true },
            { n: 15, c: <>{""}  <span className="tok-k">const</span> <span className="tok-t">res</span> <span className="tok-p">=</span> <span className="tok-k">await</span> <span className="tok-t">client</span><span className="tok-p">.</span><span className="tok-f">completeStream</span><span className="tok-p">(</span><span className="tok-t">ctx</span><span className="tok-p">);</span></>, add: true },
            { n: 16, c: <>{""}  <span className="tok-k">await</span> <span className="tok-f">flushTokens</span><span className="tok-p">(</span><span className="tok-t">res</span><span className="tok-p">, </span><span className="tok-t">tx</span><span className="tok-p">);</span></>, add: true },
            { n: 17, c: <>{""}  <span className="tok-k">return</span> <span className="tok-f">retryAfter</span><span className="tok-p">(</span><span className="tok-t">res</span><span className="tok-p">, </span><span className="tok-n">429</span><span className="tok-p">);</span></> },
            { n: 18, c: <><span className="tok-p">{"}"}</span><span className="caret" /></> },
          ].map((l) => (
            <div
              key={l.n}
              className={`flex ${l.add ? "bg-emerald-500/[0.07]" : l.del ? "bg-rose-500/[0.07]" : ""}`}
            >
              <span className="w-7 shrink-0 select-none pr-2.5 text-right text-slate-600">{l.n}</span>
              <span
                className={`w-3.5 shrink-0 select-none ${
                  l.add ? "text-emerald-400/90" : l.del ? "text-rose-400/90" : ""
                }`}
              >
                {l.add ? "+" : l.del ? "−" : ""}
              </span>
              <span className="whitespace-pre">{l.c}</span>
            </div>
          ))}
        </div>

        <div className="flex h-6 items-center justify-between border-t border-line bg-[#0c0e12] px-3 font-mono text-[9.5px] text-fg3">
          <span className="flex items-center gap-3">
            <span>main*</span>
            <span className="text-emerald-400/80">✓ 0 problems</span>
          </span>
          <span className="flex items-center gap-3">
            <span>TypeScript</span>
            <span className="hidden sm:inline">128k ctx</span>
            <span>Ln 16, Col 42</span>
          </span>
        </div>
      </div>

      <aside className="hidden w-60 shrink-0 flex-col border-l border-line bg-[#0c0e12] lg:flex">
        <p className="border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fg3">
          Assistant
        </p>
        <div className="flex-1 space-y-2.5 overflow-hidden p-3">
          <div className="flex flex-wrap gap-1">
            {["rateLimit.ts", "chat.ts"].map((f) => (
              <span key={f} className="tag !text-fg2">
                @ {f}
              </span>
            ))}
            <span className="tag">+ add</span>
          </div>
          <p className="text-[11.5px] leading-5 text-fg2">
            Replaced the blocking completion with the streaming client and added a flush task —
            first token now lands in ~120 ms.
          </p>
          <div className="inline-flex items-center gap-2 rounded border border-line bg-white/[0.03] px-2 py-1 font-mono text-[10px]">
            <span className="text-emerald-400">+1</span>
            <span className="text-rose-400">−1</span>
            <span className="text-fg3">rateLimit.ts</span>
          </div>
        </div>
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-1.5 text-[11px]">Apply diff</button>
            <button className="btn-secondary !py-1.5 text-[11px]">Dismiss</button>
          </div>
          <div className="rounded border border-line bg-canvas px-2.5 py-1.5 text-[11px] text-fg3">
            Ask about rateLimit.ts…
          </div>
        </div>
      </aside>
    </div>
  );
}
