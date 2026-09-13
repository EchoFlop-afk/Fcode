import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUi } from "../state/ui";
import { useProject } from "../state/project";
import { useSettings } from "../state/settings";
import { IconMinus, IconMaximize, IconX, IconChevronDown, IconSettings } from "./icons";
import { accessTag } from "../core/ai/models/catalog";

export function TitleBar() {
  const [, setMaximized] = useState(false);
  const { setCodingMode, codingMode, openModelSelector, openSettings } = useUi();
  const { root, name } = useProject();
  const { models, activeModel, providerStatus, providers } = useSettings();
  const model = models.find((m) => m.fullId === activeModel);
  const providerCfg = providers.find((p) => p.id === model?.provider);
  const status = providerStatus[model?.provider ?? ""]?.status;

  useEffect(() => {
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

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24">
            <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#14171a" stroke="#2a2f36" strokeWidth="1" />
            <rect x="6.2" y="5" width="3" height="14" rx="0.5" fill="#7cb342" />
            <rect x="6.2" y="5" width="11.5" height="3" rx="0.5" fill="#7cb342" />
            <rect x="6.2" y="10.4" width="9" height="2.4" rx="0.5" fill="#4f7d2a" />
          </svg>
        </span>
        <span className="titlebar-name">Fcode</span>
        {root && (
          <>
            <span className="tb-sep" data-tauri-drag-region>/</span>
            <span className="tb-project" title={root}>{name}</span>
            <button
              className={`chip-btn${codingMode ? " active" : ""}`}
              onClick={() => setCodingMode(!codingMode)}
              title="Toggle coding layout (Ctrl+Shift+E)"
            >
              {codingMode ? "Chat view" : "Coding view"}
            </button>
          </>
        )}
      </div>

      <div className="titlebar-center">
        <button className="model-pill" onClick={openModelSelector} title="Change model (Ctrl+K)">
          <span className={`provider-dot ${dotClass}`} />
          {model ? (
            <>
              <span className="model-pill-name">{model.name || model.id}</span>
              <span className="tag" data-access={accessTag(model).toLowerCase()}>
                {accessTag(model)}
              </span>
            </>
          ) : (
            <span className="model-pill-name muted">Select model</span>
          )}
          <IconChevronDown size={12} />
        </button>
      </div>

      <div className="titlebar-right">
        <button className="icon-btn" onClick={() => openSettings()} title="Settings" aria-label="Settings">
          <IconSettings size={15} />
        </button>
        <span className="tb-divider" data-tauri-drag-region />
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
