import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUi } from "../state/ui";
import { useProject } from "../state/project";
import { useSettings } from "../state/settings";
import { IconMinus, IconMaximize, IconX, IconChevronDown } from "./icons";
import { accessTag } from "../core/ai/models/catalog";
import { truncate } from "../core/util/misc";

export function TitleBar() {
  const [, setMaximized] = useState(false);
  const { setCodingMode, codingMode, openModelSelector } = useUi();
  const { root, name } = useProject();
  const { models, activeModel } = useSettings();
  const model = models.find((m) => m.fullId === activeModel);

  useEffect(() => {
    const win = getCurrentWindow();
    const check = async () => setMaximized(await win.isMaximized());
    void check();
    const un = win.onResized(() => void check());
    return () => void un.then((f) => f());
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <rect x="2" y="2" width="20" height="20" rx="4" fill="#0D0E10" />
            <rect x="6" y="5" width="3" height="14" fill="#7CB342" />
            <rect x="6" y="5" width="11" height="3" fill="#7CB342" />
            <rect x="6" y="10" width="9" height="2.4" fill="#4e7a2a" />
          </svg>
        </span>
        <span className="titlebar-title">Fcode</span>
        {root && (
          <>
            <span className="titlebar-sep" data-tauri-drag-region>/</span>
            <span className="titlebar-project" title={root}>{name}</span>
            <button
              className={`chip-btn${codingMode ? " active" : ""}`}
              onClick={() => setCodingMode(!codingMode)}
              title="Toggle coding layout"
            >
              {codingMode ? "Chat view" : "Coding view"}
            </button>
          </>
        )}
      </div>

      <div className="titlebar-center">
        <button className="model-pill" onClick={openModelSelector} title="Change model (Ctrl+K)">
          {model ? (
            <>
              <span className={`model-pill-name${model.free ? " free" : ""}`}>
                {model.name || model.id}
              </span>
              <span className="tag" data-access={accessTag(model).toLowerCase()}>
                {accessTag(model)}
              </span>
              <IconChevronDown size={12} />
            </>
          ) : (
            <>
              <span className="model-pill-name muted">Select model</span>
              <IconChevronDown size={12} />
            </>
          )}
        </button>
      </div>

      <div className="titlebar-right">
        <span className="titlebar-drag-space" data-tauri-drag-region />
        <button className="win-btn" onClick={() => void getCurrentWindow().minimize()} aria-label="Minimize">
          <IconMinus size={13} />
        </button>
        <button
          className="win-btn"
          onClick={() => void getCurrentWindow().toggleMaximize()}
          aria-label="Maximize"
        >
          <IconMaximize size={11} />
        </button>
        <button className="win-btn close" onClick={() => void getCurrentWindow().close()} aria-label="Close">
          <IconX size={13} />
        </button>
      </div>
    </div>
  );
}

export function modelLabel(fullId: string | null | undefined, models: { fullId: string; name: string }[]): string {
  if (!fullId) return "";
  const m = models.find((x) => x.fullId === fullId);
  return m ? truncate(m.name, 30) : fullId;
}
