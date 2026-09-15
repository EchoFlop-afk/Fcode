import { FlaskConical } from "lucide-react";
import HeroShowcase from "./HeroShowcase";
import { Container, Reveal, RELEASES_URL, REPO_URL, ISSUES_URL, VERSION } from "./ui";
import { marks } from "./logos";

export default function Hero() {
  return (
    <section id="top" className="pt-28 sm:pt-32">
      <Container className="text-center">
        <Reveal>
          <p className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-line bg-white/[0.02] px-3 py-1 text-xs text-fg2">
            <span className="tag-beta !py-0.5">
              <FlaskConical size={10} />
              BETA
            </span>
            <span className="font-medium text-fg">Open Source Desktop AI Client</span>
            <span className="text-fg3">•</span>
            <span>Built for Windows, macOS &amp; Linux</span>
          </p>
        </Reveal>

        <Reveal delay={70}>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-[38px] font-semibold leading-[1.08] tracking-[-0.03em] text-fg sm:text-[56px] lg:text-[64px]">
            The Native AI Coding Client
            <br className="hidden sm:block" /> Built for Real Developers.
          </h1>
        </Reveal>

        <Reveal delay={140}>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-[15px] leading-7 text-fg2 sm:text-base">
            Connect OpenRouter, Google Gemini, Ollama, and local models in one ultra-fast,
            local-first workspace. Complete privacy, zero setup friction, and total context
            control.
          </p>
        </Reveal>

        <Reveal delay={210}>
          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-primary h-auto flex-col gap-0 px-5 py-2 leading-tight"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <img src={marks.windows} alt="" className="h-4 w-4 brightness-0 invert" />
                Download for Windows (.exe)
              </span>
              <span className="text-[11px] font-normal text-white/60">
                {VERSION} • Free &amp; Open Source
              </span>
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary py-2.5"
            >
              <img src={marks.github} alt="" className="h-4 w-4" />
              View Source Code
            </a>
          </div>
        </Reveal>
        <Reveal delay={250}>
          <p className="mt-4 font-mono text-[11px] text-fg3">
            public beta — expect breaking changes ·{" "}
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-fg2 underline decoration-fg3/50 underline-offset-2 transition-colors duration-150 ease-in-out hover:text-fg"
            >
              report issues on GitHub
            </a>
          </p>
        </Reveal>
      </Container>

      <Container className="mt-12 sm:mt-14">
        <Reveal delay={160}>
          <HeroShowcase />
        </Reveal>
      </Container>
    </section>
  );
}
