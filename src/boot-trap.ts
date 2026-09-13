/**
 * Boot diagnostics: surfaces fatal frontend errors where they can be read
 * without devtools (window title + visible overlay). Runs before anything
 * else so even import-time crashes are captured.
 */

export function installBootTrap(): void {
  if (typeof window === "undefined") return;

  const show = (label: string, detail: string) => {
    try {
      document.title = `ERR: ${detail}`.slice(0, 140);
      const root = document.getElementById("root");
      if (root && !root.childElementCount) {
        const pre = document.createElement("pre");
        pre.style.cssText =
          "color:#e5534b;padding:16px;font:12px monospace;white-space:pre-wrap";
        pre.textContent = `${label}\n\n${detail}`;
        root.appendChild(pre);
      }
    } catch {
      // nothing else we can do
    }
  };

  window.addEventListener("error", (e) => {
    show("Uncaught error", `${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason);
    show("Unhandled rejection", reason);
  });
}
