import githubUrl from "../assets/logos/github.svg";
import windowsUrl from "../assets/logos/windows.svg";
import openrouterUrl from "../assets/logos/openrouter.svg";
import geminiUrl from "../assets/logos/gemini.svg";
import deepseekUrl from "../assets/logos/deepseek.svg";
import anthropicUrl from "../assets/logos/anthropic.svg";
import qwenUrl from "../assets/logos/qwen.svg";
import ollamaUrl from "../assets/logos/ollama.svg";
import openaiUrl from "../assets/logos/openai.svg";

export const marks = { github: githubUrl, windows: windowsUrl };

const providerSvgs: Record<string, { url: string; invert?: boolean }> = {
  openrouter: { url: openrouterUrl },
  gemini: { url: geminiUrl },
  deepseek: { url: deepseekUrl },
  anthropic: { url: anthropicUrl },
  qwen: { url: qwenUrl },
  ollama: { url: ollamaUrl },
  openai: { url: openaiUrl },
};

const tileLabels: Record<string, string> = {
  lmstudio: "LM",
  zai: "Z",
};

export function ProviderMark({
  id,
  name,
  size = 18,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  const svg = providerSvgs[id];
  if (svg) {
    return (
      <img
        src={svg.url}
        alt={`${name} logo`}
        className={`shrink-0 ${svg.invert ? "brightness-0 invert" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }}
      className="grid shrink-0 place-items-center rounded border border-line bg-white/[0.05] font-mono font-medium text-fg2"
    >
      {tileLabels[id] ?? name.slice(0, 1)}
    </span>
  );
}

export function TerminalGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m5 7 5 5-5 5" />
      <path d="M13 17h6" />
    </svg>
  );
}

export function Logomark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[5px] bg-brand text-white ${className}`}
    >
      <TerminalGlyph className="h-[55%] w-[55%]" />
    </span>
  );
}
