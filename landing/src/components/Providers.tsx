import { Container, Reveal } from "./ui";
import { ProviderMark } from "./logos";

const providers = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "anthropic", name: "Anthropic" },
  { id: "gemini", name: "Google Gemini" },
  { id: "openai", name: "OpenAI" },
  { id: "ollama", name: "Ollama" },
  { id: "lmstudio", name: "LM Studio" },
  { id: "zai", name: "Z.ai" },
];

export default function Providers() {
  return (
    <section id="models" className="border-t border-line">
      <Container className="py-14">
        <Reveal>
          <p className="mono-label text-center">
            Works with your favorite providers &amp; local LLMs
          </p>
        </Reveal>
        <Reveal delay={90}>
          <div className="mt-6 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-center gap-2.5 bg-canvas px-3 py-5 transition-colors duration-150 ease-in-out hover:bg-surface"
              >
                <ProviderMark id={p.id} name={p.name} size={17} />
                <span className="text-[13px] text-fg2">{p.name}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-4 text-center font-mono text-[11px] text-fg3">
            + any OpenAI-compatible endpoint. Bring your own key — or run fully offline.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
