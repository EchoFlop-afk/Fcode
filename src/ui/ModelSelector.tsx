import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../state/settings";
import { useUi } from "../state/ui";
import { accessTag, filterModels } from "../core/ai/models/catalog";
import type { ModelInfo } from "../core/types";
import { IconSearch, IconStar, IconCheck, IconRefresh } from "./icons";
import { formatContextWindow } from "../core/util/misc";

export function ModelSelector() {
  const { modelSelectorOpen, closeModelSelector } = useUi();
  const {
    models, activeModel, setActiveModel, favorites, recentModels, toggleFavorite,
    providers, refreshAllModels,
  } = useSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "local" | "coding" | "reasoning" | "vision">("all");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modelSelectorOpen) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [modelSelectorOpen]);

  const providerIds = useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))),
    [models]
  );

  const results = useMemo(() => {
    return filterModels(models, {
      query,
      providers: providerFilter ? [providerFilter] : undefined,
      free: filter === "free" || undefined,
      local: filter === "local" || undefined,
      coding: filter === "coding" || undefined,
      reasoning: filter === "reasoning" || undefined,
      vision: filter === "vision" || undefined,
    }).slice(0, 200);
  }, [models, query, filter, providerFilter]);

  if (!modelSelectorOpen) return null;

  const groups = groupModels(results, favorites, recentModels);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModelSelector();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
      scrollHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      scrollHighlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = results[highlight];
      if (m) pick(m);
    }
  };

  const pick = (m: ModelInfo) => {
    setActiveModel(m.fullId);
    closeModelSelector();
  };

  const scrollHighlight = () => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-idx="${highlight}"]`);
      el?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <div className="overlay" onMouseDown={closeModelSelector}>
      <div className="model-selector" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="model-selector-head">
          <IconSearch size={14} />
          <input
            ref={inputRef}
            placeholder="Search models…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            aria-label="Search models"
          />
          <button
            className="icon-btn"
            title="Refresh model lists from providers"
            onClick={() => void refreshAllModels()}
          >
            <IconRefresh size={13} />
          </button>
        </div>

        <div className="model-filters">
          {(["all", "free", "local", "coding", "reasoning", "vision"] as const).map((f) => (
            <button
              key={f}
              className={`chip-btn${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
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
            </button>
          ))}
        </div>

        <div className="model-list" ref={listRef}>
          {results.length === 0 && (
            <div className="model-list-empty">
              No models found. Add a provider in Settings or refresh.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="model-group-label">{g.label}</div>
              {g.items.map((m) => {
                const idx = results.indexOf(m);
                return (
                  <div
                    key={m.fullId}
                    data-idx={idx}
                    className={`model-row${activeModel === m.fullId ? " active" : ""}${idx === highlight ? " highlighted" : ""}`}
                    onClick={() => pick(m)}
                  >
                    <span className="model-row-name">{m.name || m.id}</span>
                    <span className="model-row-id">{m.id}</span>
                    <span className="tag" data-access={accessTag(m).toLowerCase()}>{accessTag(m)}</span>
                    {m.coding && <span className="cap-pill tiny" title="Coding">{"</>"}</span>}
                    {m.reasoning && <span className="cap-pill tiny" title="Reasoning">R</span>}
                    {m.vision && <span className="cap-pill tiny" title="Vision">V</span>}
                    {m.tools && <span className="cap-pill tiny" title="Tools">T</span>}
                    <span className="model-row-ctx">{formatContextWindow(m.contextWindow)}</span>
                    <button
                      className={`icon-btn fav${favorites.includes(m.fullId) ? " on" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(m.fullId); }}
                      aria-label="Toggle favorite"
                    >
                      <IconStar size={12} />
                    </button>
                    {activeModel === m.fullId && <IconCheck size={13} className="active-check" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="model-selector-foot">
          {providers.length === 0
            ? "No providers configured - add one in Settings → Providers"
            : `${results.length} model${results.length === 1 ? "" : "s"}`}
          <span className="hint">↑↓ navigate · Enter select · Esc close</span>
        </div>
      </div>
    </div>
  );
}

function groupModels(
  models: ModelInfo[],
  favorites: string[],
  recent: string[]
): { label: string; items: ModelInfo[] }[] {
  const favSet = new Set(favorites);
  const recentIdx = new Map(recent.map((id, i) => [id, i]));
  const groups: Record<string, ModelInfo[]> = {
    Favorites: [],
    "Recently Used": [],
    Other: [],
  };
  for (const m of models) {
    if (favSet.has(m.fullId)) groups.Favorites.push(m);
    else if (recentIdx.has(m.fullId)) groups["Recently Used"].push(m);
    else groups.Other.push(m);
  }
  groups["Recently Used"].sort(
    (a, b) => (recentIdx.get(a.fullId) ?? 0) - (recentIdx.get(b.fullId) ?? 0)
  );
  return [
    { label: "Favorites", items: groups.Favorites },
    { label: "Recently Used", items: groups["Recently Used"] },
    ...(groups.Other.length ? [{ label: "All Models", items: groups.Other }] : []),
  ].filter((g) => g.items.length > 0);
}
