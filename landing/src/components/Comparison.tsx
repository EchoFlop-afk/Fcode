import { Check, Minus, X } from "lucide-react";
import { Container, Reveal, SectionHead } from "./ui";

type Mark = "yes" | "no" | "partial";

function Mark({ ok }: { ok: Mark }) {
  if (ok === "yes") return <Check size={15} strokeWidth={2.5} className="mx-auto text-brand" />;
  if (ok === "no") return <X size={14} strokeWidth={2.25} className="mx-auto text-fg3/50" />;
  return <Minus size={14} strokeWidth={2.25} className="mx-auto text-fg3" />;
}

const rows: { feature: string; fcode: Mark; web: Mark; ide: Mark }[] = [
  { feature: "Native speed & low memory footprint", fcode: "yes", web: "no", ide: "partial" },
  { feature: "Multi-provider & BYOK support", fcode: "yes", web: "no", ide: "yes" },
  { feature: "Local offline LLM support (Ollama)", fcode: "yes", web: "no", ide: "partial" },
  { feature: "Zero telemetry / privacy-first", fcode: "yes", web: "no", ide: "no" },
  { feature: "Free & open source (MIT)", fcode: "yes", web: "no", ide: "partial" },
];

export default function Comparison() {
  return (
    <section className="border-t border-line">
      <Container className="py-20 sm:py-24">
        <Reveal>
          <SectionHead
            index="02"
            label="Comparison"
            title="Not another Electron wrapper."
            desc="Web UIs fight the browser. IDEs fight their own plugin systems. Fcode is a native shell built around one job."
          />
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-10 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] border-collapse bg-panel text-left">
              <thead>
                <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg3">
                  <th className="w-[42%] px-4 py-3 font-medium">Feature</th>
                  <th className="w-[19%] bg-brand/[0.08] px-4 py-3 text-center font-medium text-fg">
                    <span className="flex items-center justify-center gap-2">
                      Fcode
                      <span className="rounded border border-brand/30 bg-brand/15 px-1 py-px font-mono text-[9px] text-brand">
                        you
                      </span>
                    </span>
                  </th>
                  <th className="w-[19.5%] px-4 py-3 text-center font-medium">
                    Generic Web Interfaces
                  </th>
                  <th className="w-[19.5%] px-4 py-3 text-center font-medium">
                    Heavy Desktop IDEs
                  </th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {rows.map((r) => (
                  <tr key={r.feature} className="border-t border-line">
                    <td className="px-4 py-3 text-fg2">{r.feature}</td>
                    <td className="border-x border-brand/20 bg-brand/[0.08] px-4 py-3 text-center">
                      <Mark ok={r.fcode} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Mark ok={r.web} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Mark ok={r.ide} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-3 font-mono text-[11px] text-fg3">
            partial = possible with plugins, accounts, or per-seat licenses · verified against
            shipped builds, not marketing pages
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
