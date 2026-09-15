import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Container, Reveal, RELEASES_URL, SectionHead } from "./ui";

type TabId = "git" | "winget" | "brew";

const tabs: {
  id: TabId;
  label: string;
  code: string;
  output: string[];
  soon?: boolean;
}[] = [
  {
    id: "git",
    label: "pnpm · git",
    code: "git clone https://github.com/Aero-Inx/Fcode.git\ncd Fcode\npnpm install && pnpm dev",
    output: ["› vite v7 ready in 812 ms", "› rust core compiled — tauri dev up"],
  },
  {
    id: "winget",
    label: "winget",
    soon: true,
    code: "winget install AeroInx.Fcode",
    output: ["› planned — packaging channel opens at stable", "› during beta: build from source (pnpm · git)"],
  },
  {
    id: "brew",
    label: "homebrew",
    soon: true,
    code: "brew install --cask fcode",
    output: ["› planned — packaging channel opens at stable", "› during beta: build from source (pnpm · git)"],
  },
];

const steps = [
  { title: "Clone the repository", desc: "MIT licensed. No account, no license key, no telemetry." },
  { title: "Install dependencies", desc: "pnpm resolves the React frontend and Rust core toolchain in one pass." },
  { title: "Launch & connect a provider", desc: "Paste an API key — or point at localhost for Ollama / LM Studio." },
];

export default function QuickStart() {
  const [tab, setTab] = useState<TabId>("git");
  const [copied, setCopied] = useState(false);
  const active = tabs.find((t) => t.id === tab)!;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = active.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="quickstart" className="border-t border-line">
      <Container className="grid items-start gap-10 py-20 sm:py-24 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <div>
          <Reveal>
            <SectionHead
              index="03"
              label="Quick start"
              title="Running in under a minute."
              desc="The whole stack is two package managers deep. Prefer installers? Grab the signed binary."
            />
          </Reveal>
          <div className="mt-8 space-y-5">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <div className="flex gap-3.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-line bg-white/[0.03] font-mono text-[11px] text-brand">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-fg">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-6 text-fg2">{s.desc}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={240}>
            <p className="mt-8 text-[13px] text-fg2">
              Just want the app?{" "}
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sky-400 transition-colors duration-150 ease-in-out hover:text-sky-300"
              >
                Download the .exe ↓
              </a>
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-[0_30px_70px_-24px_rgba(0,0,0,0.8)]">
            <div className="relative flex items-center gap-3 border-b border-line bg-[#0c0e12] px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3f4450]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3f4450]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3f4450]" />
              </span>
              <div className="flex rounded border border-line bg-canvas p-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    aria-pressed={tab === t.id}
                    className={`flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10.5px] transition-colors duration-150 ease-in-out ${
                      tab === t.id ? "bg-brand/15 text-fg" : "text-fg3 hover:text-fg2"
                    }`}
                  >
                    {t.label}
                    {t.soon && (
                      <span className="rounded bg-white/[0.06] px-1 py-px text-[8.5px] uppercase tracking-wide text-fg3">
                        soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={copy}
                aria-label="Copy install commands"
                className={`ml-auto flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10.5px] transition-colors duration-150 ease-in-out ${
                  copied
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-line bg-white/[0.03] text-fg3 hover:border-line-strong hover:text-fg"
                }`}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-7">
              <code>
                {active.code.split("\n").map((line, i) => (
                  <span key={i} className="block">
                    <span className="select-none text-fg3">$ </span>
                    {line.startsWith("git clone") ? (
                      <>
                        <span className="text-fg">git clone </span>
                        <span className="text-sky-400 underline decoration-sky-400/30 underline-offset-4">
                          https://github.com/Aero-Inx/Fcode.git
                        </span>
                      </>
                    ) : (
                      <span className="text-fg">{line}</span>
                    )}
                  </span>
                ))}
                {active.output.map((o) => (
                  <span key={o} className="block text-fg3">
                    {o}
                  </span>
                ))}
                <span className="block">
                  <span className="select-none text-fg3">$ </span>
                  <span className="caret" />
                </span>
              </code>
            </pre>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
