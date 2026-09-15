import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUi } from "../state/ui";
import { useProject } from "../state/project";
import { useSettings } from "../state/settings";
import { IconMinus, IconMaximize, IconX, IconChevronDown, IconSettings, IconChat, IconCode } from "./icons";
import { accessTag } from "../core/ai/models/catalog";

/** Tauri window APIs only exist inside the desktop app; plain vite dev has no internals. */
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function TitleBar() {
  const [, setMaximized] = useState(false);
  const { setView, setCodingMode, codingMode, openModelSelector, openSettings } = useUi();
  const { root, name } = useProject();
  const { models, activeModel, providerStatus, providers } = useSettings();
  const model = models.find((m) => m.fullId === activeModel);
  const providerCfg = providers.find((p) => p.id === model?.provider);
  const status = providerStatus[model?.provider ?? ""]?.status;

  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    const check = async () => setMaximized(await win.isMaximized());
    void check();
    const un = win.onResized(() => void check());
    return () => void un.then((f) => f());
  }, []);

  const dotClass = providerCfg?.isLocal
    ? status === "connected" ? "local" : "dim"
    : status === "connected"
      ? "ok"
      : status === "invalid_credentials" || status === "error"
        ? "err"
        : "dim";

  const providerLetter = (model?.provider ?? "?").charAt(0);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24">
            <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#181a1f" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <rect x="6.2" y="5" width="3" height="14" rx="1" fill="#6366f1" />
            <rect x="6.2" y="5" width="11.5" height="3" rx="1" fill="#6366f1" />
            <rect x="6.2" y="10.4" width="9" height="2.4" rx="1" fill="#4f46e5" />
          </svg>
        </span>
        <button
          className="tb-workspace"
          onClick={() => setView("projects")}
          data-tip="Workspace projects"
          aria-label="Workspace projects"
        >
          <span className="ws-app">Fcode</span>
          <span className="ws-sep">/</span>
          <span className="ws-name">{root ? name : "Workspace"}</span>
        </button>
        {root && (
          <div className="tb-mode" role="tablist" aria-label="View mode">
            <button
              className={`tb-mode-btn${codingMode ? "" : " active"}`}
              onClick={() => setCodingMode(false)}
              title="Chat view (Ctrl+Shift+E)"
              role="tab"
              aria-selected={!codingMode}
            >
              <IconChat size={11} /> Chat
            </button>
            <button
              className={`tb-mode-btn${codingMode ? " active" : ""}`}
              onClick={() => setCodingMode(true)}
              title="Coding view (Ctrl+Shift+E)"
              role="tab"
              aria-selected={codingMode}
            >
              <IconCode size={11} /> Code
            </button>
          </div>
        )}
      </div>

      <div className="titlebar-center">
        <button className="model-pill" onClick={openModelSelector} data-tip="Change model · Ctrl+K" aria-label="Change model">
          <span className={`provider-dot ${dotClass}`} />
          {model ? (
            <>
              <span className="model-pill-glyph" title={model.provider}>{providerLetter}</span>
              <span className="model-pill-name">{model.name || model.id}</span>
              <span className="tag" data-access={accessTag(model).toLowerCase()}>
                {accessTag(model)}
              </span>
            </>
          ) : (
            <span className="model-pill-name muted">Select model</span>
          )}
          <IconChevronDown size={10} className="model-pill-caret" />
        </button>
      </div>

      <div className="titlebar-right">
        <button className="icon-btn" onClick={() => openSettings()} title="Settings" aria-label="Settings">
          <IconSettings size={14} />
        </button>
        {inTauri && (
          <>
            <span className="tb-divider" data-tauri-drag-region />
            <button className="win-btn" onClick={() => void getCurrentWindow().minimize()} aria-label="Minimize">
              <IconMinus size={12} />
            </button>
            <button
              className="win-btn"
              onClick={() => void getCurrentWindow().toggleMaximize()}
              aria-label="Maximize"
            >
              <IconMaximize size={10} />
            </button>
            <button className="win-btn close" onClick={() => void getCurrentWindow().close()} aria-label="Close">
              <IconX size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
