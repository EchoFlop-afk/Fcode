import { useState } from "react";
import { useSettings } from "../state/settings";
import { useUi } from "../state/ui";
import { api } from "../core/api/ipc";
import { openFolderPicker } from "./CommandPalette";
import { open as saveDialog } from "@tauri-apps/plugin-dialog";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { IconX, IconRefresh, IconTrash, IconKey, IconCheck, IconAlert, IconEye, IconEyeOff } from "./icons";
import { formatRelativeTime } from "../core/util/misc";
import type { PermissionMode, ProviderConfig } from "../core/types";

const SECTIONS = [
  ["general", "General"],
  ["appearance", "Appearance"],
  ["providers", "Providers"],
  ["models", "Models"],
  ["agent", "Agent"],
  ["tools", "Tools & Permissions"],
  ["terminal", "Terminal"],
  ["projects", "Projects"],
  ["usage", "Usage Data"],
  ["shortcuts", "Shortcuts"],
  ["advanced", "Advanced"],
] as const;

export function SettingsDialog() {
  const { settingsOpen, settingsSection, closeSettings } = useUi();
  const [section, setSection] = useState(settingsSection);
  if (!settingsOpen) return null;
  return (
    <div className="overlay" onMouseDown={closeSettings}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={`settings-nav-item${section === id ? " active" : ""}`} onClick={() => setSection(id)}>
              {label}
            </button>
          ))}
          <span className="spacer" />
          <button className="icon-btn" onClick={closeSettings} aria-label="Close settings">
            <IconX size={14} />
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section" key={section}>
            {section === "general" && <GeneralSection />}
            {section === "appearance" && <AppearanceSection />}
            {section === "providers" && <ProvidersSection />}
            {section === "models" && <ModelsSection />}
            {section === "agent" && <AgentSection />}
            {section === "tools" && <ToolsSection />}
            {section === "terminal" && <TerminalSection />}
            {section === "projects" && <ProjectsSection />}
            {section === "usage" && <UsageSection />}
            {section === "shortcuts" && <ShortcutsSection />}
            {section === "advanced" && <AdvancedSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle${value ? " on" : ""}`} onClick={() => onChange(!value)} role="switch" aria-checked={value} aria-label={label}>
      <span className="toggle-knob" />
    </button>
  );
}

/** Accent-filled range slider: fill portion is driven by the --range-fill CSS var. */
function Slider({
  value, min, max, step, onChange, label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--range-fill": `${pct}%` } as React.CSSProperties}
      aria-label={label}
    />
  );
}

function GeneralSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <h3>General</h3>
      <Field label="Auto-title conversations from first message">
        <Toggle value={settings.general.autoTitle} label="Auto-title" onChange={(v) => void update((s) => { s.general.autoTitle = v; })} />
      </Field>
      <Field label="Send message on Enter (Shift+Enter for newline)">
        <Toggle value={settings.general.sendOnEnter} label="Send on Enter" onChange={(v) => void update((s) => { s.general.sendOnEnter = v; })} />
      </Field>
      <Field label="Default to Agent mode for new conversations">
        <Toggle value={settings.general.defaultAgentMode} label="Default agent mode" onChange={(v) => void update((s) => { s.general.defaultAgentMode = v; })} />
      </Field>
    </>
  );
}

function AppearanceSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <h3>Appearance</h3>
      <Field label="Theme">
        <select
          value={settings.appearance.theme}
          onChange={(e) => void update((s) => { s.appearance.theme = e.target.value as "dark" | "light"; })}
          aria-label="Theme"
        >
          <option value="dark">Dark (default)</option>
          <option value="light">Light</option>
        </select>
      </Field>
      <Field label={`Font size: ${settings.appearance.fontSize}px`}>
        <Slider
          value={settings.appearance.fontSize}
          min={11}
          max={17}
          label="Font size"
          onChange={(v) => void update((s) => { s.appearance.fontSize = v; })}
        />
      </Field>
    </>
  );
}

function ProvidersSection() {
  const { settings, update, providerStatus, keyPresent, refreshProviderStatus, refreshProviderModels } = useSettings();
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyVisible, setKeyVisible] = useState<Record<string, boolean>>({});

  const setProvider = (id: string, mutate: (p: ProviderConfig) => void) => {
    void update((s) => {
      const p = s.providers.find((x) => x.id === id);
      if (p) mutate(p);
    });
  };

  const saveKey = async (id: string) => {
    const key = keyDrafts[id]?.trim();
    if (!key) return;
    try {
      await api.providerSetKey(id, key);
      setKeyDrafts((d) => ({ ...d, [id]: "" }));
      await refreshProviderStatus(id);
      useUi.getState().toast("API key saved to Windows Credential Manager.", "ok");
    } catch (e) {
      useUi.getState().toast(`Failed to save key: ${String(e)}`, "error");
    }
  };

  const removeKey = async (id: string) => {
    await api.providerDeleteKey(id).catch(() => {});
    await refreshProviderStatus(id);
  };

  const addCustom = async () => {
    if (!customName.trim() || !customUrl.trim()) return;
    try {
      await api.providerAddCustom(customName.trim(), customUrl.trim());
      setCustomName("");
      setCustomUrl("");
      await useSettings.getState().init();
      useUi.getState().toast("Custom provider added.", "ok");
    } catch (e) {
      useUi.getState().toast(String(e), "error");
    }
  };

  return (
    <>
      <h3>Providers</h3>
      <p className="dim">
        API keys are stored in the Windows Credential Manager and never appear in logs,
        conversation files, or exports.
      </p>
      {settings.providers.map((p) => {
        const status = providerStatus[p.id];
        return (
          <div key={p.id} className="provider-card">
            <div className="provider-head">
              <StatusDot status={status?.status ?? (keyPresent[p.id] ? "configured" : "not_configured")} />
              <span className="provider-name">{p.name}</span>
              <span className="dim">{p.isLocal ? "local" : p.kind}</span>
              <span className="spacer" />
              <Toggle value={p.enabled} label={`Enable ${p.name}`} onChange={(v) => setProvider(p.id, (x) => { x.enabled = v; })} />
            </div>
            <Field label="Base URL">
              <input
                value={p.baseUrl}
                onChange={(e) => setProvider(p.id, (x) => { x.baseUrl = e.target.value; })}
                spellCheck={false}
                aria-label={`${p.name} base URL`}
              />
            </Field>
            {p.requiresKey && (
              <Field label="API key" hint="Your API key is used to access this provider. It is stored securely on this device.">
                <div className="key-row">
                  <div className="key-wrap">
                    <input
                      type={keyVisible[p.id] ? "text" : "password"}
                      placeholder={keyPresent[p.id] ? "•••• saved - enter to replace" : "Enter API key"}
                      value={keyDrafts[p.id] ?? ""}
                      onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveKey(p.id); }}
                      aria-label={`${p.name} API key`}
                    />
                    <button
                      type="button"
                      className="key-visibility"
                      onClick={() => setKeyVisible((v) => ({ ...v, [p.id]: !v[p.id] }))}
                      aria-label={keyVisible[p.id] ? "Hide API key" : "Show API key"}
                      title={keyVisible[p.id] ? "Hide API key" : "Show API key"}
                    >
                      {keyVisible[p.id] ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                    </button>
                  </div>
                  <button className="btn small" onClick={() => void saveKey(p.id)}><IconKey size={12} /> Save</button>
                  {keyPresent[p.id] && (
                    <button className="btn small ghost" onClick={() => void removeKey(p.id)}><IconTrash size={12} /></button>
                  )}
                </div>
              </Field>
            )}
            <div className="provider-actions">
              <button className="btn small" onClick={() => void refreshProviderStatus(p.id)}>
                Test connection
              </button>
              <button className="btn small ghost" onClick={() => void refreshProviderModels(p.id)}>
                Load models
              </button>
              {status && <span className="provider-status-detail dim">{status.detail}</span>}
              {!["openrouter", "zai", "openai", "anthropic", "google", "ollama", "lmstudio"].includes(p.id) && (
                <button
                  className="btn small danger ghost"
                  onClick={async () => {
                    await api.providerRemove(p.id).catch((e) => useUi.getState().toast(String(e), "error"));
                    await useSettings.getState().init();
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}

      <h3>Add custom OpenAI-compatible provider</h3>
      <Field label="Name">
        <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="My Provider" />
      </Field>
      <Field label="Base URL" hint="e.g. https://example.com/v1">
        <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://example.com/v1" spellCheck={false} />
      </Field>
      <button className="btn" onClick={() => void addCustom()} disabled={!customName.trim() || !customUrl.trim()}>
        Add provider
      </button>
    </>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls: Record<string, string> = {
    connected: "ok",
    configured: "ok",
    invalid_credentials: "err",
    not_configured: "dim",
    offline: "dim",
    error: "err",
    rate_limited: "warn",
  };
  return <span className={`status-dot ${cls[status] ?? "dim"}`} title={status} />;
}

function ModelsSection() {
  const { settings, update, models, refreshAllModels } = useSettings();
  const catalogModels = models;
  return (
    <>
      <h3>Models</h3>
      <Field label="Default model (full id, e.g. openai/gpt-4o-mini)">
        <input
          value={settings.models.defaultModel ?? ""}
          onChange={(e) => void update((s) => { s.models.defaultModel = e.target.value || null; })}
          list="model-ids"
          spellCheck={false}
        />
        <datalist id="model-ids">
          {catalogModels.slice(0, 300).map((m) => (
            <option key={m.fullId} value={m.fullId}>{m.provider} · {m.name}</option>
          ))}
        </datalist>
      </Field>
      <div className="field">
        <span className="field-label">Fallback chain</span>
        <div className="fallback-list">
          {settings.models.fallbacks.map((fb, i) => (
            <div key={i} className="fallback-row">
              <input
                value={fb}
                onChange={(e) => void update((s) => { s.models.fallbacks[i] = e.target.value; })}
                list="model-ids"
                spellCheck={false}
              />
              <button className="icon-btn" aria-label="Remove fallback" onClick={() => void update((s) => { s.models.fallbacks.splice(i, 1); })}>
                <IconX size={12} />
              </button>
            </div>
          ))}
          <button className="btn small" onClick={() => void update((s) => { s.models.fallbacks.push(""); })}>
            Add fallback
          </button>
        </div>
        <span className="field-hint">
          Used when the selected model fails (rate limit, outage). Paid fallbacks are never
          used without confirmation.
        </span>
      </div>
      <Field label="Enable model fallback">
        <Toggle value={settings.models.fallbackEnabled} label="Fallback enabled" onChange={(v) => void update((s) => { s.models.fallbackEnabled = v; })} />
      </Field>
      <div className="provider-actions">
        <button className="btn small" onClick={() => void refreshAllModels()}>
          <IconRefresh size={12} /> Refresh live catalogs
        </button>
        <span className="dim">
          {settings.models.catalogRefreshedAt ? `updated ${formatRelativeTime(settings.models.catalogRefreshedAt)}` : "seed data only"}
        </span>
      </div>
    </>
  );
}

function AgentSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <h3>Agent</h3>
      <Field label={`Max tool iterations per turn: ${settings.agent.maxIterations}`}>
        <Slider
          value={settings.agent.maxIterations}
          min={5}
          max={50}
          label="Max iterations"
          onChange={(v) => void update((s) => { s.agent.maxIterations = v; })}
        />
      </Field>
      <Field label={`Context budget: ${settings.agent.contextBudgetTokens} tokens (est.)`}>
        <Slider
          value={settings.agent.contextBudgetTokens}
          min={4000}
          max={100000}
          step={2000}
          label="Context budget"
          onChange={(v) => void update((s) => { s.agent.contextBudgetTokens = v; })}
        />
      </Field>
    </>
  );
}

const MODES: PermissionMode[] = ["ask", "auto", "disabled"];

function ToolsSection() {
  const { settings, update } = useSettings();
  const groups: { key: "filesystem" | "terminal" | "git"; label: string; desc: string }[] = [
    { key: "filesystem", label: "Filesystem", desc: "Reads are always allowed. Writes/edits/deletes follow this mode and show diffs." },
    { key: "terminal", label: "Terminal", desc: "Destructive commands always require confirmation, even in auto mode." },
    { key: "git", label: "Git", desc: "Status/diff/log are read-only and always allowed." },
  ];
  return (
    <>
      <h3>Tools & Permissions</h3>
      {groups.map((g) => (
        <Field key={g.key} label={g.label} hint={g.desc}>
          <div className="seg">
            {MODES.map((m) => (
              <button
                key={m}
                className={`seg-btn${settings.permissions[g.key] === m ? " active" : ""}`}
                onClick={() => void update((s) => { s.permissions[g.key] = m; })}
              >
                {m === "ask" ? "Ask" : m === "auto" ? "Auto" : "Disabled"}
              </button>
            ))}
          </div>
        </Field>
      ))}
      <p className="dim"><IconAlert size={12} /> The AI is untrusted input. Approvals exist so you always see what it wants to do.</p>
    </>
  );
}

function TerminalSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <h3>Terminal</h3>
      <Field label="Shell">
        <select
          value={settings.terminal.shell}
          onChange={(e) => void update((s) => { s.terminal.shell = e.target.value as "powershell" | "cmd"; })}
          aria-label="Shell"
        >
          <option value="powershell">PowerShell</option>
          <option value="cmd">CMD</option>
        </select>
      </Field>
      <Field label={`Command timeout (agent tools): ${settings.terminal.timeoutSecs}s`}>
        <Slider
          value={settings.terminal.timeoutSecs}
          min={10}
          max={600}
          step={10}
          label="Terminal timeout"
          onChange={(v) => void update((s) => { s.terminal.timeoutSecs = v; })}
        />
      </Field>
    </>
  );
}

function ProjectsSection() {
  const { settings } = useSettings();
  return (
    <>
      <h3>Projects</h3>
      <Field label="Active project">
        <div className="key-row">
          <input value={settings.projects.active ?? ""} readOnly aria-label="Active project" />
          <button className="btn small" onClick={() => void openFolderPicker()}>Open…</button>
        </div>
      </Field>
      {settings.projects.recent.length > 0 && (
        <>
          <h4>Recent</h4>
          {settings.projects.recent.map((p) => (
            <div key={p} className="recent-row dim">{p}</div>
          ))}
        </>
      )}
    </>
  );
}

function UsageSection() {
  const { settings } = useSettings();
  return (
    <>
      <h3>Usage data</h3>
      <p className="dim">
        Usage is stored locally in usage.json and pruned after 180 days. Nothing is sent anywhere.
      </p>
      <button
        className="btn small danger"
        onClick={async () => {
          await api.usageReset().catch(() => {});
          useUi.getState().toast("Usage data cleared.", "ok");
        }}
      >
        <IconTrash size={12} /> Clear usage data
      </button>
      <Field label="Dark theme also dims usage charts">
        <span className="dim">{settings.appearance.theme === "dark" ? "on" : "off"}</span>
      </Field>
    </>
  );
}

function ShortcutsSection() {
  const rows: [string, string][] = [
    ["Ctrl+N", "New chat"],
    ["Ctrl+K", "Model selector"],
    ["Ctrl+P", "Command palette"],
    ["Ctrl+B", "Toggle sidebar"],
    ["Ctrl+Enter", "Send message"],
    ["Esc", "Stop generation / close overlay"],
    ["Ctrl+S", "Save editor file"],
    ["Ctrl+F", "Find in editor"],
  ];
  return (
    <>
      <h3>Keyboard shortcuts</h3>
      <table className="usage-table shortcuts">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td><code>{k}</code></td><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AdvancedSection() {
  const { settings, update } = useSettings();
  return (
    <>
      <h3>Advanced</h3>
      <Field label="Log provider errors to console (provider/model/category only - never secrets)">
        <Toggle value={settings.advanced.logToFile} label="Log to file" onChange={(v) => void update((s) => { s.advanced.logToFile = v; })} />
      </Field>
      <h4>Import / export</h4>
      <p className="dim">
        Exports include settings, conversations, promotions and usage. API keys are never exported.
      </p>
      <div className="provider-actions">
        <button
          className="btn small"
          onClick={async () => {
            try {
              const path = await saveDialog({
                title: "Export Fcode data",
                defaultPath: "fcode-export.json",
                filters: [{ name: "JSON", extensions: ["json"] }],
              });
              if (typeof path === "string") {
                const n = await api.exportData(path);
                useUi.getState().toast(`Exported ${n} conversation(s).`, "ok");
              }
            } catch (e) {
              useUi.getState().toast(String(e), "error");
            }
          }}
        >
          Export data…
        </button>
        <button
          className="btn small"
          onClick={async () => {
            try {
              const path = await openDialog({
                title: "Import Fcode data",
                multiple: false,
                filters: [{ name: "JSON", extensions: ["json"] }],
              });
              if (typeof path === "string") {
                const n = await api.importData(path);
                await useSettings.getState().init();
                useUi.getState().toast(`Imported ${n} conversation(s).`, "ok");
              }
            } catch (e) {
              useUi.getState().toast(String(e), "error");
            }
          }}
        >
          Import data…
        </button>
        <span className="dim"><IconCheck size={12} /> keys never exported</span>
      </div>
    </>
  );
}
