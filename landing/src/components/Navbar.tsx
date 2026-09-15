import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Container, RELEASES_URL, REPO_URL, VERSION } from "./ui";
import { marks, Logomark } from "./logos";

const links = [
  { label: "Features", href: "#features" },
  { label: "Supported Models", href: "#models" },
  { label: "Architecture", href: "#architecture" },
  { label: "Documentation", href: `${REPO_URL}#readme`, external: true },
  { label: "GitHub", href: REPO_URL, external: true },
];

function useStarCount() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.github.com/repos/Aero-Inx/Fcode")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.stargazers_count === "number") setStars(d.stargazers_count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stars;
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const stars = useStarCount();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-[12px]">
      <Container className="flex h-14 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Fcode home">
          <Logomark className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Fcode</span>
          <span className="tag">{VERSION.replace("-beta", "")}</span>
          <span className="tag-beta">BETA</span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="rounded px-2.5 py-1.5 text-[13px] text-fg2 transition-colors duration-150 ease-in-out hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary h-8 !px-2.5 py-0 text-[13px]"
            aria-label="Star Fcode on GitHub"
          >
            <img src={marks.github} alt="" className="h-3.5 w-3.5" />
            <span>Star</span>
            <span className="ml-1 border-l border-line pl-2 font-mono text-[11px] text-fg3">
              {stars === null ? "—" : stars.toLocaleString("en-US")}
            </span>
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="btn-primary h-8 py-0 text-[13px]">
            <Download size={14} strokeWidth={2.25} />
            Download App
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="grid h-8 w-8 place-items-center rounded border border-line text-fg2 transition-colors duration-150 ease-in-out hover:text-fg md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </Container>

      {open && (
        <div className="border-t border-line bg-canvas/95 backdrop-blur-[12px] md:hidden">
          <Container className="flex flex-col py-3">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2.5 text-sm text-fg2 transition-colors duration-150 ease-in-out hover:bg-white/[0.04] hover:text-fg"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-[13px]"
              >
                <img src={marks.github} alt="" className="h-3.5 w-3.5" />
                Star on GitHub
              </a>
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="btn-primary text-[13px]">
                <Download size={14} />
                Download App
              </a>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
