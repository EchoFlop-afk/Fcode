import { useRef, useState } from "react";
import { useProject } from "../../state/project";
import { useChat } from "../../state/chat";
import { useUi } from "../../state/ui";
import { FileTree, EditorTabs, TerminalPanel } from "./FileTree";
import { EditorPane } from "./EditorPane";
import { ChatView } from "../chat/ChatView";
import { IconTerminal } from "../icons";

const CHAT_WIDTH_KEY = "fcode.codingChatWidth";
const MIN_CHAT = 320;

function chatWidthMax(): number {
  return Math.min(860, Math.max(MIN_CHAT + 60, Math.round(window.innerWidth * 0.55)));
}

function initialChatWidth(): number {
  try {
    const v = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    if (Number.isFinite(v) && v >= MIN_CHAT && v <= chatWidthMax()) return Math.round(v);
  } catch {
    // no localStorage - fall through to default
  }
  return 420;
}

/**
 * Three-pane coding layout: Files | Editor + Terminal | Agent chat.
 * The editor/agent panes are separated by a draggable divider; the chosen
 * width persists in localStorage.
 */
export function CodingLayout() {
  const { root } = useProject();
  const { setTerminalOpen, terminalOpen } = useUi();
  const { streaming } = useChat();
  const [chatWidth, setChatWidth] = useState(initialChatWidth);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, startX: 0, startWidth: 0 });

  if (!root) {
    return <ChatView />;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { active: true, startX: e.clientX, startWidth: chatWidth };
    setDragging(true);
    document.body.classList.add("split-dragging");
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const delta = drag.current.startX - e.clientX;
    setChatWidth(Math.max(MIN_CHAT, Math.min(chatWidthMax(), drag.current.startWidth + delta)));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    document.body.classList.remove("split-dragging");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
    setChatWidth((w) => {
      try {
        localStorage.setItem(CHAT_WIDTH_KEY, String(w));
      } catch {
        // ignore quota errors
      }
      return w;
    });
  };

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
          {streaming && <span className="act-pulse" />}
        </button>
        <TerminalPanel />
      </div>
      <div
        className={`split-divider tip-below${dragging ? " dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        data-tip="Drag to resize"
      />
      <div className="coding-agent" style={{ width: chatWidth }}>
        <ChatView />
      </div>
    </div>
  );
}
