import { useMemo, useState } from "react";
import { useSettings } from "../state/settings";
import { useUi } from "../state/ui";
import { accessTag, filterModels } from "../core/ai/models/catalog";
import type { ModelInfo } from "../core/types";
import { IconRefresh, IconStar, IconCheck, IconSearch } from "./icons";
import { formatContextWindow, formatRelativeTime } from "../core/util/misc";

type Section = "recommended" | "free" | "coding" | "reasoning" | "vision" | "fast" | "local" | "recent" | "favorites" | "all";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "free", label: "Free" },
  { id: "coding", label: "Coding" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "fast", label: "Fast" },
  { id: "local", label: "Local" },
  { id: "recent", label: "Recently Used" },
  { id: "favorites", label: "Favorites" },
  { id: "all", label: "All Models" },
];

export function ModelHub() {
  const {
    models, favorites, recentModels, toggleFavorite, activeModel, setActiveModel,
    providerStatus, refreshAllModels, settings,
  } = useSettings();
  const [section, setSection] = useState<Section>("recommended");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const { openSettings } = useUi();

  const providerIds = useMemo(() => Array.from(new Set(models.map((m) => m.provider))), [models]);

  const bySection = useMemo(() => {
    const base = {
      query,
      providers: providerFilter ? [providerFilter] : undefined,
      favorites: new Set(favorites),
    };
    switch (section) {
      case "recommended": {
        const preferred = [
          "openai/gpt-4o-mini",
          "anthropic/claude-sonnet-4-5",
          "google/gemini-2.5-flash",
          "zai/glm-4.6",
          "openrouter/qwen/qwen3-coder:free",
        ];
        const set = new Set(preferred);
        const top = models.filter((m) => set.has(m.fullId));
        const rest = filterModels(models, { ...base }).slice(0, 30);
        return [...top, ...rest.filter((r) => !set.has(r.fullId))];
      }
      case "free":
        return filterModels(models, { ...base, free: true });
      case "coding":
        return filterModels(models, { ...base, coding: true });
      case "reasoning":
        return filterModels(models, { ...base, reasoning: true });
      case "vision":
        return filterModels(models, { ...base, vision: true });
      case "fast":
        // Fast tiers are identified by naming heuristics, not substring query.
        return filterModels(models, base).filter((m) =>
          /flash|mini|haiku|air|lite|nano|instant|small|turbo/i.test(`${m.id} ${m.name}`)
        );
      case "local":
        return filterModels(models, { ...base, local: true });
      case "recent":
        return filterModels(models, { ...base, recent: recentModels, onlyRecent: true });
      case "favorites":
        return filterModels(models, { ...base, favorites: new Set(favorites), onlyFavorites: true });
      default:
        return filterModels(models, base);
    }
  }, [section, models, query, providerFilter, favorites, recentModels]);

  return (
    <div className="hub">
      <div className="hub-head">
        <div>
          <h2>Models</h2>
          <p className="hub-sub">
            {settings.models.catalogRefreshedAt
              ? `Live catalogs refreshed ${formatRelativeTime(settings.models.catalogRefreshedAt)}`
              : "Seed catalog shown - refresh to discover live provider models"}
          </p>
        </div>
        <div className="hub-actions">
          <div className="side-search">
            <IconSearch size={13} />
            <input placeholder="Search models" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search models" />
          </div>
          <button className="btn small" onClick={() => void refreshAllModels()}>
            <IconRefresh size={12} /> Refresh
          </button>
          <button className="btn small ghost" onClick={() => openSettings("providers")}>
            Providers
          </button>
        </div>
      </div>

      <div className="hub-filters">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`chip-btn${section === s.id ? " active" : ""}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
        <span className="filter-sep" />
        {providerIds.map((p) => (
          <button
            key={p}
            className={`chip-btn${providerFilter === p ? " active" : ""}`}
            onClick={() => setProviderFilter(providerFilter === p ? null : p)}
          >
            {p}
            {providerStatus[p]?.status === "connected" ? " ●" : ""}
          </button>
        ))}
      </div>

      <div className="hub-list">
        {bySection.length === 0 && (
          <div className="hub-empty">
            No models in this section. Configure a provider or refresh the catalogs.
          </div>
        )}
        {bySection.map((m) => (
          <ModelCard
            key={m.fullId}
            model={m}
            active={activeModel === m.fullId}
            favorite={favorites.includes(m.fullId)}
            onUse={() => { setActiveModel(m.fullId); useUi.getState().setView("chat"); }}
            onFav={() => toggleFavorite(m.fullId)}
          />
        ))}
      </div>
    </div>
  );
}

function ModelCard({
  model, active, favorite, onUse, onFav,
}: {
  model: ModelInfo;
  active: boolean;
  favorite: boolean;
  onUse: () => void;
  onFav: () => void;
}) {
  const tag = accessTag(model);
  return (
    <div className={`model-card${active ? " active" : ""}`}>
      <div className="model-card-head">
        <span className="model-card-name" title={model.description}>{model.name || model.id}</span>
        <span className="tag" data-access={tag.toLowerCase()}>{tag}</span>
        <span className="spacer" />
        <button className={`icon-btn fav${favorite ? " on" : ""}`} onClick={onFav} aria-label="Toggle favorite">
          <IconStar size={13} />
        </button>
        {active ? (
          <span className="model-card-active"><IconCheck size={12} /> Active</span>
        ) : (
          <button className="btn small primary" onClick={onUse}>Use Model</button>
        )}
      </div>
      <div className="model-card-meta">
        <span>{model.provider}</span>
        <span>{formatContextWindow(model.contextWindow)}</span>
        {model.coding && <span className="cap">Coding</span>}
        {model.reasoning && <span className="cap">Reasoning</span>}
        {model.vision && <span className="cap">Vision</span>}
        {model.tools && <span className="cap">Tools</span>}
      </div>
      {model.description && <div className="model-card-desc">{model.description}</div>}
      {model.outputPricePerM > 0 && (
        <div className="model-card-price">
          ${model.inputPricePerM.toFixed(2)} in / ${model.outputPricePerM.toFixed(2)} out per 1M tokens
        </div>
      )}
    </div>
  );
}
