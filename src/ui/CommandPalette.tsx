import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "../state/ui";
import { useChat } from "../state/chat";
import { useProject } from "../state/project";
import { useSettings } from "../state/settings";
import { IconSearch } from "./icons";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function collectCommands(): Command[] {
  const ui = useUi.getState();
  const chat = useChat.getState();
  const project = useProject.getState();
  const settings = useSettings.getState();

  const commands: Command[] = [
    { id: "new-chat", label: "New Chat", hint: "Ctrl+N", run: () => { chat.newConversation(); ui.setView("chat"); } },
    { id: "change-model", label: "Change Model", hint: "Ctrl+K", run: () => ui.openModelSelector() },
    { id: "search-models", label: "Search Models", hint: "Ctrl+K", run: () => { ui.setView("hub"); } },
    { id: "open-settings", label: "Open Settings", run: () => ui.openSettings() },
    { id: "open-providers", label: "Open Providers", run: () => ui.openSettings("providers") },
    { id: "open-projects", label: "Open Projects", run: () => ui.setView("projects") },
    { id: "open-usage", label: "Open Usage", run: () => ui.setView("usage") },
    { id: "toggle-agent", label: `Toggle Agent Mode (now: ${chat.mode})`, run: () => chat.setMode(chat.mode === "agent" ? "chat" : "agent") },
    { id: "toggle-auto-approval", label: "Toggle Auto Approval", run: () => {
      void settings.update((s) => {
        const allAuto = s.permissions.filesystem === "auto" && s.permissions.terminal === "auto" && s.permissions.git === "auto";
        s.permissions = allAuto
          ? { filesystem: "ask", terminal: "ask", git: "ask" }
          : { filesystem: "auto", terminal: "auto", git: "auto" };
      });
      ui.toast("Approval mode updated.", "ok");
    } },
    { id: "clear-conversation", label: "Clear Conversation", run: () => { chat.newConversation(); } },
    { id: "toggle-sidebar", label: "Toggle Sidebar", hint: "Ctrl+B", run: () => ui.toggleSidebar() },
  ];

  if (project.root) {
    commands.push(
      { id: "open-project-settings", label: "Project Settings", run: () => ui.openSettings("projects") },
      { id: "toggle-terminal", label: "Toggle Terminal", run: () => ui.setTerminalOpen(!ui.terminalOpen) },
      { id: "toggle-coding", label: `Toggle Coding Layout (now: ${ui.codingMode ? "on" : "off"})`, run: () => ui.setCodingMode(!ui.codingMode) },
    );
  } else {
    commands.push({ id: "open-project-folder", label: "Open Project…", run: () => void openFolderPicker() });
  }

  return commands;
}

export async function openFolderPicker(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ directory: true, multiple: false });
    if (typeof path === "string") {
      await useProject.getState().openProject(path);
      useUi.getState().setView("chat");
      useUi.getState().toast(`Opened project: ${path}`, "ok");
      return path;
    }
  } catch {
    useUi.getState().toast("Folder picker unavailable (run inside the desktop app).", "error");
  }
  return null;
}

export function CommandPalette() {
  const { paletteOpen, closePalette } = useUi();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => collectCommands(), [paletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const filtered = commands.filter(
    (c) => c.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlight];
      if (cmd) {
        closePalette();
        cmd.run();
      }
    }
  };

  return (
    <div className="overlay" onMouseDown={closePalette}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-head">
          <IconSearch size={14} />
          <input
            ref={inputRef}
            placeholder="Type a command…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            aria-label="Command palette"
          />
        </div>
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">No matching commands</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`palette-row${i === highlight ? " highlighted" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => { closePalette(); c.run(); }}
            >
              <span>{c.label}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
