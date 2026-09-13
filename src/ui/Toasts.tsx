import { useUi } from "../state/ui";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";

export function Toasts() {
  const { toasts, dismissToast } = useUi();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === "error" ? <IconAlert size={13} /> : t.kind === "ok" ? <IconCheck size={13} /> : <IconInfo size={13} />}
          <span>{t.text}</span>
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <IconX size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
