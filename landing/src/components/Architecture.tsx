import { Container, Reveal, SectionHead } from "./ui";

const layers = [
  {
    flow: "UI",
    tech: "React 19 · Vite",
    rows: [
      ["Renderer", "Virtualized chat history"],
      ["Streaming", "Token-level repaints"],
      ["Theming", "Native window chrome"],
    ],
  },
  {
    flow: "IPC",
    tech: "Tauri 2 · invoke",
    rows: [
      ["Bridge", "Typed command channel"],
      ["Events", "Backpressured streams"],
      ["Isolation", "Allowlisted capabilities"],
    ],
  },
  {
    flow: "Core",
    tech: "Rust · tokio",
    rows: [
      ["HTTP", "Streaming SSE clients"],
      ["Sandbox", "Scoped command runner"],
      ["Vault", "OS keychain access"],
    ],
  },
];

export default function Architecture() {
  return (
    <section id="architecture" className="border-t border-line">
      <Container className="py-20 sm:py-24">
        <Reveal>
          <SectionHead
            index="04"
            label="Architecture"
            title="A native shell, not a browser in a trench coat."
            desc="The UI never talks to the network. A Rust core owns providers, secrets, and process execution — the web layer only renders."
          />
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-10 flex flex-wrap items-stretch gap-2 font-mono text-[11px]">
            {["ui · react 19", "ipc · tauri invoke", "core · rust", "providers · https"].map(
              (step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded border border-line bg-surface px-3 py-2 text-fg2">
                    {step}
                  </span>
                  {i < 3 && <span className="text-fg3">→</span>}
                </div>
              ),
            )}
            <span className="flex items-center gap-2 font-sans text-[11px] text-fg3">
              — keys never leave the core process
            </span>
          </div>
        </Reveal>

        <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {layers.map((l, i) => (
            <Reveal key={l.flow} delay={i * 80} className="h-full">
              <div className="flex h-full flex-col bg-surface">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="font-mono text-[12px] text-fg">{l.flow}</span>
                  <span className="font-mono text-[10.5px] text-fg3">{l.tech}</span>
                </div>
                {l.rows.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-[12px] text-fg2">{k}</span>
                    <span className="text-right text-[12px] text-fg">{v}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
