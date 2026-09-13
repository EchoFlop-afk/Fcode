import { Suspense, lazy, useEffect } from "react";
import { TitleBar } from "./ui/TitleBar";
import { Sidebar } from "./ui/Sidebar";
import { ChatView } from "./ui/chat/ChatView";
import { ModelSelector } from "./ui/ModelSelector";
import { CommandPalette } from "./ui/CommandPalette";
import { Toasts } from "./ui/Toasts";
import { ModelHub } from "./ui/ModelHub";
import { ProjectsView } from "./ui/ProjectsView";
import { UsageView } from "./ui/UsageView";
import { useUi } from "./state/ui";
import { useChat } from "./state/chat";
import { useSettings } from "./state/settings";
import { useProject } from "./state/project";

// Lazy-loaded: the coding layout pulls in CodeMirror and settings pulls in
// the dialog plugin. Keeps the initial bundle small.
const CodingLayout = lazy(() =>
  import("./ui/coding/CodingLayout").then((m) => ({ default: m.CodingLayout }))
);
const SettingsDialog = lazy(() =>
  import("./ui/SettingsDialog").then((m) => ({ default: m.SettingsDialog }))
);

export function App() {
  const { view, settingsOpen, modelSelectorOpen, paletteOpen, closeModelSelector, closePalette, closeSettings, toggleSidebar, setCodingMode, codingMode, setTerminalOpen } = useUi();
  const { settings, init } = useSettings();
  const { init: initChat, streaming, stop, setMode, mode } = useChat();
  const { root } = useProject();

  // Boot: load settings + conversations, restore active project.
  useEffect(() => {
    void (async () => {
      await init();
      await initChat();
      const active = useSettings.getState().settings.projects.active;
      if (active) {
        await useProject.getState().openProject(active).catch(() => {});
      }
      if (useSettings.getState().settings.general.defaultAgentMode) {
        setMode("agent");
      }
    })();
  }, []);

  // Theme + font size
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = settings.appearance.theme;
    el.style.setProperty("--base-font", `${settings.appearance.fontSize}px`);
  }, [settings.appearance.theme, settings.appearance.fontSize]);

  // Restore agent mode if the stored mode was agent (chat store default is chat).
  useEffect(() => {
    if (settings.general.defaultAgentMode && mode !== "agent" && !streaming) {
      setMode("agent");
    }
  }, [settings.general.defaultAgentMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (modelSelectorOpen) closeModelSelector();
        else if (paletteOpen) closePalette();
        else if (settingsOpen) closeSettings();
        else if (streaming) stop();
        return;
      }
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        useChat.getState().newConversation();
        useUi.getState().setView("chat");
      } else if (key === "k") {
        e.preventDefault();
        if (modelSelectorOpen) closeModelSelector(); else useUi.getState().openModelSelector();
      } else if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        if (paletteOpen) closePalette(); else useUi.getState().openPalette();
      } else if (key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (key === "t" && e.shiftKey) {
        e.preventDefault();
        if (useProject.getState().root) setTerminalOpen(!useUi.getState().terminalOpen);
      } else if (key === "e" && e.shiftKey) {
        e.preventDefault();
        if (useProject.getState().root) setCodingMode(!codingMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modelSelectorOpen, paletteOpen, settingsOpen, streaming, codingMode]);

  const mainView = () => {
    if (view === "hub") return <ModelHub />;
    if (view === "projects") return <ProjectsView />;
    if (view === "usage") return <UsageView />;
    // chat view: coding layout when a project is open and coding mode on
    return root && codingMode ? <CodingLayout /> : <ChatView />;
  };

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Suspense fallback={<div className="lazy-loading">Loading…</div>}>{mainView()}</Suspense>
        </main>
      </div>
      <ModelSelector />
      <CommandPalette />
      <Suspense fallback={null}>
        <SettingsDialog />
      </Suspense>
      <Toasts />
    </div>
  );
}
