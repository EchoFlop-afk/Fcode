import { useState, type ReactNode } from "react";
import { FileCode2, Folder, Lock } from "lucide-react";
import { Container, Reveal, SectionHead } from "./ui";
import { ProviderMark } from "./logos";

/* ------------------------------ micro visuals ----------------------------- */

function MiniSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-[16px] w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
        on ? "bg-brand" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute h-3 w-3 rounded-full bg-white shadow transition-transform duration-150 ${
          on ? "translate-x-[15px]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

function WorkspaceVisual() {
  const [tab, setTab] = useState<"chat" | "code">("code");
  return (
    <div className="mt-5 flex-1 overflow-hidden rounded-md border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-[#0c0e12] px-2 py-1.5">
        <div className="flex rounded border border-line bg-canvas p-0.5">
          {(["chat", "code"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors duration-150 ease-in-out ${
                tab === t ? "bg-brand/15 text-fg" : "text-fg3 hover:text-fg2"
              }`}
            >
              {t === "chat" ? "Chat" : "Code View"}
            </button>
          ))}
        </div>
        <span className="font-mono text-[9.5px] text-fg3">⌘1 ⌘2 ⌘3 switch models</span>
      </div>
      <div className="grid h-[210px] grid-cols-[104px_1fr] sm:grid-cols-[128px_1fr]">
        <div className="border-r border-line bg-[#0c0e12] py-1.5">
          {["src", "main.tsx", "lib", "chat.ts", "src-tauri", "core.rs"].map((f, i) => (
            <div
              key={f}
              style={{ paddingLeft: 8 + (i % 2 === 0 ? 0 : 10) }}
              className={`flex items-center gap-1 py-[3px] pr-1.5 text-[10px] ${
                i === 3 ? "bg-white/[0.06] text-fg" : "text-fg2"
              }`}
            >
              {i % 2 === 0 ? (
                <Folder size={9} className="shrink-0 text-fg3" />
              ) : (
                <FileCode2 size={9} className={`shrink-0 ${i === 5 ? "text-orange-400" : "text-sky-400"}`} />
              )}
              <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 overflow-hidden p-2.5">
          {tab === "chat" ? (
            <div className="space-y-2">
              <p className="ml-auto max-w-[85%] rounded border border-brand/25 bg-brand/10 px-2 py-1.5 text-[10.5px] leading-4 text-fg">
                Why does the stream drop on reconnect?
              </p>
              <p className="text-[10.5px] leading-4 text-fg2">
                The reader isn't re-armed after EOF — patch below:
              </p>
              <div className="rounded border border-line bg-canvas p-2 font-mono text-[10px] leading-4">
                <span className="block">
                  <span className="tok-p">+</span>{" "}
                  <span className="tok-t">reader</span>
                  <span className="tok-p">.</span>
                  <span className="tok-f">rearm</span>
                  <span className="tok-p">();</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] leading-[1.9]">
              {[
                <><span className="tok-k">export async function</span> <span className="tok-f">chatStream</span><span className="tok-p">(</span><span className="tok-t">prompt</span><span className="tok-p">:</span> <span className="tok-t">string</span><span className="tok-p">) {"{"}</span></>,
                <>{""}  <span className="tok-k">const</span> <span className="tok-t">ctx</span> <span className="tok-p">=</span> <span className="tok-t">budget</span><span className="tok-p">.</span><span className="tok-f">allocate</span><span className="tok-p">(</span><span className="tok-t">prompt</span><span className="tok-p">.</span><span className="tok-f">length</span><span className="tok-p">);</span></>,
                <><span className="tok-p">-     </span><span className="tok-k">await</span> <span className="tok-t">client</span><span className="tok-p">.</span><span className="tok-f">blocking</span><span className="tok-p">(</span><span className="tok-t">ctx</span><span className="tok-p">);</span></>,
                <><span className="tok-p">+     </span><span className="tok-k">await</span> <span className="tok-t">client</span><span className="tok-p">.</span><span className="tok-f">stream</span><span className="tok-p">(</span><span className="tok-t">ctx</span><span className="tok-p">);</span></>,
                <>{""}  <span className="tok-k">return</span> <span className="tok-f">pipe</span><span className="tok-p">(</span><span className="tok-t">res</span><span className="tok-p">, </span><span className="tok-t">tx</span><span className="tok-p">);</span></>,
                <><span className="tok-p">{"}"}</span><span className="caret" /></>,
              ].map((line, i) => (
                <div key={i} className={`flex ${i === 2 ? "bg-rose-500/[0.07]" : i === 3 ? "bg-emerald-500/[0.07]" : ""}`}>
                  <span className="w-6 shrink-0 select-none pr-2 text-right text-slate-600">{12 + i}</span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrivacyVisual() {
  return (
    <div className="mt-5 flex-1 rounded-md border border-line bg-panel">
      <div className="border-b border-line px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-mono text-[11px] text-fg2">
            <Lock size={11} className="text-brand" />
            sk-or-v1-••••••••••••••
          </span>
          <span className="tag">OS Keychain</span>
        </div>
      </div>
      {[
        ["Key storage", "AES-256-GCM via system vault"],
        ["Telemetry", "Disabled — no phone-home"],
        ["Crash reports", "Disabled"],
        ["Network egress", "Model APIs only"],
      ].map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0"
        >
          <span className="text-[11.5px] text-fg2">{k}</span>
          <span className="text-right text-[11.5px] text-fg">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ProviderSwitchVisual() {
  const models = [
    { id: "deepseek", name: "DeepSeek-R1", hotkey: "⌘1", status: "connected" },
    { id: "anthropic", name: "Claude 3.5 Sonnet", hotkey: "⌘2", status: "connected" },
    { id: "ollama", name: "qwen2.5-coder:7b", hotkey: "⌘3", status: "local" },
  ];
  return (
    <div className="mt-5 flex-1 rounded-md border border-line bg-panel">
      {models.map((m) => (
        <div
          key={m.name}
          className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0"
        >
          <ProviderMark id={m.id} name={m.name} size={15} />
          <span className="flex-1 truncate text-[12px] text-fg">{m.name}</span>
          <span className="tag">{m.hotkey}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              m.status === "local" ? "bg-sky-400" : "bg-emerald-400"
            } ${m.status !== "local" ? "dot-live" : ""}`}
          />
        </div>
      ))}
      <p className="px-3 py-2 font-mono text-[10px] text-fg3">
        mid-conversation switch · history preserved · 40ms
      </p>
    </div>
  );
}

function ContextVisual() {
  const segs = [
    { label: "system", v: 8, cls: "bg-brand/80" },
    { label: "history", v: 22, cls: "bg-sky-500/70" },
    { label: "files", v: 12, cls: "bg-indigo-300/50" },
  ];
  return (
    <div className="mt-5 flex-1 rounded-md border border-line bg-panel p-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        {segs.map((s) => (
          <span key={s.label} className={s.cls} style={{ width: `${s.v}%` }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segs.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 font-mono text-[10px] text-fg3">
            <span className={`h-1.5 w-1.5 rounded-sm ${s.cls}`} />
            {s.label} {s.v}k
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-fg3">
          <span className="h-1.5 w-1.5 rounded-sm bg-white/10" />
          free 86k
        </span>
      </div>
      <div className="mt-3 space-y-px border-t border-line">
        {[
          ["Cost", "$0.0042 / request"],
          ["Hard cap", "stop at 120k · warn at 100k"],
          ["Fallback", "DeepSeek-R1 → Claude 3.5 → Ollama"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-2">
            <span className="text-[11.5px] text-fg2">{k}</span>
            <span className="truncate font-mono text-[11px] text-fg">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentVisual() {
  return (
    <div className="mt-5 flex-1 rounded-md border border-line bg-panel">
      <div className="border-b border-line px-3 py-1.5 font-mono text-[10px] text-fg3">
        pwsh — sandboxed
      </div>
      <div className="space-y-1.5 px-3 py-2.5 font-mono text-[10.5px] leading-4">
        <p>
          <span className="text-sky-400">❯</span>{" "}
          <span className="text-fg">fcode agent "fix flaky auth test"</span>
        </p>
        {[
          ["terminal", "pnpm test", "41 passed · 1 fixed"],
          ["fs.patch", "src/auth.spec.ts", "+9 −2"],
          ["git", "commit -m", "ask to confirm"],
        ].map(([tool, arg, out]) => (
          <p key={tool} className="flex items-baseline justify-between gap-3">
            <span className="text-fg3">
              ● <span className="text-brand">{tool}</span> {arg}
            </span>
            <span className="shrink-0 text-emerald-400/80">{out}</span>
          </p>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px]">
        <span className="text-fg2">git push requires approval</span>
        <MiniSwitch on={false} />
      </div>
    </div>
  );
}

function FallbackVisual() {
  const chain = [
    { id: "deepseek", name: "DeepSeek-R1", role: "primary", state: "operational", dot: "bg-emerald-400" },
    { id: "anthropic", name: "Claude 3.5 Sonnet", role: "fallback 1", state: "standby", dot: "bg-sky-400" },
    { id: "ollama", name: "Ollama · local", role: "offline", state: "ready", dot: "bg-fg3" },
  ];
  return (
    <div className="mt-5 flex-1 rounded-md border border-line bg-panel">
      {chain.map((c) => (
        <div
          key={c.name}
          className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0"
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} ${c.dot === "bg-emerald-400" ? "dot-live" : ""}`} />
          <ProviderMark id={c.id} name={c.name} size={14} />
          <span className="flex-1 truncate text-[12px] text-fg">{c.name}</span>
          <span className="tag">{c.role}</span>
          <span className="hidden font-mono text-[10px] text-fg3 sm:inline">{c.state}</span>
        </div>
      ))}
      <p className="px-3 py-2 font-mono text-[10px] text-fg3">
        auto-failover on 5xx / timeout · retry ×2 · 300ms
      </p>
    </div>
  );
}

/* --------------------------------- section -------------------------------- */

type Cell = {
  title: string;
  desc: string;
  visual: ReactNode;
  span?: boolean;
};

const cells: Cell[] = [
  {
    title: "Dual Workspace Architecture",
    desc: "Switch seamlessly between dedicated AI Chat and an integrated Code View editor — same conversation, same context, zero reloads.",
    visual: <WorkspaceVisual />,
    span: true,
  },
  {
    title: "Local-First & Privacy Guaranteed",
    desc: "API keys are stored in native encrypted system vaults. Zero telemetry tracking.",
    visual: <PrivacyVisual />,
  },
  {
    title: "Instant Provider Switching",
    desc: "Hot-key switch between DeepSeek-R1, Claude 3.5 Sonnet, and local Ollama instances mid-conversation.",
    visual: <ProviderSwitchVisual />,
  },
  {
    title: "Context Budget & Token Controls",
    desc: "Real-time context window tracking, cost management, and configurable fallback chains.",
    visual: <ContextVisual />,
    span: true,
  },
  {
    title: "Agent Tools & Terminal Execution",
    desc: "Built-in sandboxed terminal execution, file modification permissions, and automated Git workflows.",
    visual: <AgentVisual />,
  },
  {
    title: "Custom Model Catalog & Fallbacks",
    desc: "Never get blocked by API downtime. Configure automatic fallback provider chains.",
    visual: <FallbackVisual />,
    span: true,
  },
];

export default function Bento() {
  return (
    <section id="features" className="border-t border-line">
      <Container className="py-20 sm:py-24">
        <Reveal>
          <SectionHead
            index="01"
            label="Features"
            title="Everything a client should do. Nothing it shouldn't."
            desc="Six capabilities, engineered into one lightweight desktop shell — no accounts, no wrappers, no lock-in."
          />
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {cells.map((c) => (
              <div
                key={c.title}
                className={`flex flex-col bg-surface p-5 transition-colors duration-150 ease-in-out hover:bg-raised ${
                  c.span ? "md:col-span-2" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold tracking-[-0.01em] text-fg">{c.title}</h3>
                  <span className="font-mono text-[10px] text-fg3">
                    {String(cells.indexOf(c) + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-1.5 max-w-md text-[13px] leading-6 text-fg2">{c.desc}</p>
                {c.visual}
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
