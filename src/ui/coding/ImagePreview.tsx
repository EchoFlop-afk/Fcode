import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorTab } from "../../state/project";
import { formatTokens } from "../../core/util/misc";
import { IconChecker, IconMinus, IconPlus } from "../icons";

const MIN_SCALE = 0.02;
const MAX_SCALE = 24;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function fileNameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Preview pane for image files opened from the file tree.
 * Fit / free zoom / 1:1, Ctrl+wheel zoom, double-click toggles fit↔1:1,
 * and a transparency checkerboard that can be switched to a flat background.
 */
export function ImagePreview({ tab }: { tab: EditorTab }) {
  const img = tab.image!;
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState<number | null>(null); // null = fit
  const [checker, setChecker] = useState(true);

  // Contain-fit ratio (never upscales); recomputed on resize while in fit mode.
  const fitScale = useCallback((): number => {
    const stage = stageRef.current;
    if (!stage || !natural || !natural.w || !natural.h) return 1;
    const pad = 28;
    const w = (stage.clientWidth - pad) / natural.w;
    const h = (stage.clientHeight - pad) / natural.h;
    return Math.max(MIN_SCALE, Math.min(1, w, h));
  }, [natural]);

  const zoomBy = (factor: number) => {
    setScale((s) => clampScale((s ?? fitScale()) * factor));
  };

  // Ctrl+wheel zoom (non-passive so the browser page-zoom is suppressed).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => clampScale((s ?? fitScale()) * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fitScale]);

  const zoomLabel =
    scale === null
      ? natural
        ? `${Math.round(fitScale() * 100)}%`
        : "Fit"
      : `${Math.round(scale * 100)}%`;

  return (
    <div className="image-pane">
      <div className="image-toolbar">
        <span className="editor-path" title={tab.path}>{fileNameOf(tab.path)}</span>
        {natural && (
          <span className="image-meta">
            {natural.w} × {natural.h}
          </span>
        )}
        <span className="image-meta">{formatTokens(img.size)}b</span>
        <span className="spacer" />
        <div className="image-zoom-group" role="group" aria-label="Zoom">
          <button className="image-zoom-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out">
            <IconMinus size={11} />
          </button>
          <button
            className="image-zoom-label"
            onClick={() => setScale(scale === null ? 1 : null)}
            title={scale === null ? "Zoom to 100%" : "Fit to window"}
            aria-label={`Zoom level ${zoomLabel}`}
          >
            {scale === null ? `Fit ${zoomLabel}` : zoomLabel}
          </button>
          <button className="image-zoom-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in">
            <IconPlus size={11} />
          </button>
        </div>
        <button
          className={`image-zoom-btn text${scale === null ? " active" : ""}`}
          onClick={() => setScale(null)}
          aria-label="Fit to window"
          title="Fit to window"
        >
          Fit
        </button>
        <button
          className={`image-zoom-btn text${scale === 1 ? " active" : ""}`}
          onClick={() => setScale(1)}
          aria-label="Actual size"
          title="Actual size (1:1)"
        >
          1:1
        </button>
        <button
          className={`image-zoom-btn${checker ? " active" : ""}`}
          onClick={() => setChecker(!checker)}
          aria-label="Toggle transparency checkerboard"
          aria-pressed={checker}
          title="Transparency checkerboard"
        >
          <IconChecker size={13} />
        </button>
      </div>
      <div
        ref={stageRef}
        className={`image-stage${checker ? " checker" : ""}`}
        onDoubleClick={() => setScale(scale === null ? 1 : null)}
      >
        <div className={`image-frame${scale === null ? " fit" : ""}`}>
          <img
            src={img.dataUrl}
            alt={fileNameOf(tab.path)}
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            style={scale === null ? undefined : { width: natural ? natural.w * scale : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
