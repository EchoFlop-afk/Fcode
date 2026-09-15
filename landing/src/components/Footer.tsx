import { Download } from "lucide-react";
import { Container, DOCS_URL, LICENSE_URL, RELEASES_URL, REPO_URL, VERSION } from "./ui";
import { Logomark, marks } from "./logos";

const footerLinks = [
  { label: "Release notes", href: `${REPO_URL}/releases` },
  { label: "GitHub repository", href: REPO_URL },
  { label: "Developer docs", href: DOCS_URL },
  { label: "MIT License", href: LICENSE_URL },
];

const manifest: [string, string][] = [
  ["version", VERSION],
  ["channel", "public beta"],
  ["license", "MIT — free forever"],
  ["shell", "Tauri 2 · Rust core"],
  ["ui", "React 19 · Vite"],
  ["platforms", "Windows 10/11 · macOS · Linux"],
  ["telemetry", "none"],
];

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <section className="border-b border-line">
        <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mono-label">
              <span className="text-brand">05</span>
              <span className="mx-2 text-fg3/50">/</span>Get started
            </p>
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg sm:text-[32px]">
              Your models. Your keys.
              <br />
              Your machine.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-fg2">
              Free and open source under MIT. Clone it, audit it, fork it — it's yours.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="btn-primary">
                <Download size={14} strokeWidth={2.25} />
                Download App
              </a>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-secondary">
                <img src={marks.github} alt="" className="h-4 w-4" />
                View Source Code
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] text-fg3">
              $ fcode --about
            </div>
            {manifest.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[11.5px] text-fg3">{k}</span>
                <span className="text-right text-[12.5px] text-fg">{v}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Logomark className="h-5 w-5" />
          <span className="text-sm font-semibold text-fg">Fcode</span>
          <span className="font-mono text-[11px] text-fg3">MIT © 2026</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {footerLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-fg3 transition-colors duration-150 ease-in-out hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
