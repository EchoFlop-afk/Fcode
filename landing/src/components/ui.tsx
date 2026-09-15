import { useEffect, useRef, type ReactNode } from "react";

export const REPO_URL = "https://github.com/Aero-Inx/Fcode";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const DOCS_URL = `${REPO_URL}#readme`;
export const LICENSE_URL = `${REPO_URL}/blob/master/LICENSE`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const VERSION = "v1.0.0-beta";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-6 ${className}`}>{children}</div>;
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-visible");
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function SectionHead({
  index,
  label,
  title,
  desc,
}: {
  index: string;
  label: string;
  title: ReactNode;
  desc?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="mono-label">
        <span className="text-brand">{index}</span>
        <span className="mx-2 text-fg3/50">/</span>
        {label}
      </p>
      <h2 className="mt-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg sm:text-[32px]">
        {title}
      </h2>
      {desc && <p className="mt-3 text-sm leading-6 text-fg2">{desc}</p>}
    </div>
  );
}
