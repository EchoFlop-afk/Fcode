import { useProject } from "../../state/project";
import { useChat } from "../../state/chat";
import { useUi } from "../../state/ui";
import { FileTree, EditorTabs, TerminalPanel } from "./FileTree";
import { EditorPane } from "./EditorPane";
import { ChatView } from "../chat/ChatView";
import { IconTerminal } from "../icons";

/**
 * Three-pane coding layout: Files | Editor + Terminal | Agent chat.
 */
export function CodingLayout() {
  const { root } = useProject();
  const { setTerminalOpen, terminalOpen } = useUi();
  const { streaming } = useChat();

  if (!root) {
    return <ChatView />;
  }

  return (
    <div className="coding-layout">
      <div className="coding-files">
        <FileTree />
      </div>
      <div className="coding-center">
        <EditorTabs />
        <div className="coding-editor">
          <EditorPane />
        </div>
        <button
          className={`terminal-fab${terminalOpen ? " open" : ""}`}
          onClick={() => setTerminalOpen(!terminalOpen)}
          title="Toggle terminal"
          aria-label="Toggle terminal"
        >
          <IconTerminal size={13} />
          {streaming && <span className="act-spinner" />}
        </button>
        <TerminalPanel />
      </div>
      <div className="coding-agent">
        <ChatView />
      </div>
    </div>
  );
}
