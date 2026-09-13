import { useState } from "react";
import { useUi } from "../state/ui";
import { useChat } from "../state/chat";
import {
  IconPlus, IconSearch, IconSettings, IconFolder, IconChart, IconSidebar,
  IconTrash, IconPin, IconEdit, IconTerminal,
} from "./icons";
import { formatRelativeTime, truncate } from "../core/util/misc";

export function Sidebar() {
  const { view, setView, sidebarOpen, toggleSidebar, openSettings } = useUi();

  if (!sidebarOpen) {
    return (
      <div className="sidebar collapsed">
        <button className="icon-btn big" onClick={toggleSidebar} title="Expand sidebar" aria-label="Expand sidebar">
          <IconSidebar size={16} />
        </button>
        <button className="icon-btn big" onClick={() => setView("chat")} title="New chat" aria-label="New chat">
          <IconPlus size={16} />
        </button>
        <div className="spacer" />
        <NavButton view={view} setView={setView} target="projects" icon={<IconFolder size={16} />} label="Projects" compact />
        <NavButton view={view} setView={setView} target="hub" icon={<IconTerminal size={16} />} label="Models" compact />
        <NavButton view={view} setView={setView} target="usage" icon={<IconChart size={16} />} label="Usage" compact />
        <button className="icon-btn big" onClick={() => openSettings()} title="Settings" aria-label="Settings">
          <IconSettings size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="btn primary block" onClick={() => { useChat.getState().newConversation(); setView("chat"); }}>
          <IconPlus size={14} /> New Chat
        </button>
        <button className="icon-btn" onClick={toggleSidebar} title="Collapse sidebar (Ctrl+B)" aria-label="Collapse sidebar">
          <IconSidebar size={15} />
        </button>
      </div>
      <ConversationSearch />
      <div className="side-label">Chats</div>
      <ConversationList />
      <div className="sidebar-foot">
        <NavButton view={view} setView={setView} target="projects" icon={<IconFolder size={15} />} label="Projects" />
        <NavButton view={view} setView={setView} target="hub" icon={<IconTerminal size={15} />} label="Models" />
        <NavButton view={view} setView={setView} target="usage" icon={<IconChart size={15} />} label="Usage" />
        <button className="nav-item" onClick={() => openSettings()}>
          <IconSettings size={15} /> Settings
        </button>
      </div>
    </div>
  );
}

function NavButton({
  view, setView, target, icon, label, compact,
}: {
  view: string;
  setView: (v: "chat" | "hub" | "projects" | "usage") => void;
  target: "chat" | "hub" | "projects" | "usage";
  icon: React.ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      className={`nav-item${view === target ? " active" : ""}${compact ? " compact" : ""}`}
      onClick={() => setView(target)}
      title={label}
    >
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  );
}

function ConversationSearch() {
  const { search, searchQuery } = useChat();
  return (
    <div className="side-search">
      <IconSearch size={13} />
      <input
        placeholder="Search chats"
        value={searchQuery}
        onChange={(e) => search(e.target.value)}
        aria-label="Search conversations"
      />
    </div>
  );
}

function ConversationList() {
  const { conversations, activeId, openConversation, deleteConversation, pinConversation, renameConversation, searchQuery } = useChat();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? conversations.filter((c) => c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q))
    : conversations;

  return (
    <div className="conv-list" role="list">
      {filtered.length === 0 && <div className="conv-empty">No conversations yet</div>}
      {filtered.map((c) => (
        <div
          key={c.id}
          className={`conv-item${activeId === c.id ? " active" : ""}`}
          onClick={() => { openConversation(c.id); useUi.getState().setView("chat"); }}
          role="listitem"
        >
          {editingId === c.id ? (
            <input
              autoFocus
              className="conv-rename"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  renameConversation(c.id, editTitle.trim() || c.title);
                  setEditingId(null);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              onBlur={() => setEditingId(null)}
              aria-label="Conversation title"
            />
          ) : (
            <>
              <div className="conv-item-main">
                <span className="conv-title" title={c.title}>{c.pinned ? "📌 " : ""}{truncate(c.title, 34)}</span>
                <span className="conv-time">{formatRelativeTime(c.updatedAt)}</span>
              </div>
              {c.preview && <div className="conv-preview">{truncate(c.preview, 48)}</div>}
              <button
                className="conv-menu-btn icon-btn"
                aria-label="Conversation options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === c.id ? null : c.id);
                }}
              >
                ⋯
              </button>
              {menuFor === c.id && (
                <div className="ctx-menu" onMouseLeave={() => setMenuFor(null)}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); setMenuFor(null); }}>
                    <IconEdit size={13} /> Rename
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); pinConversation(c.id, !c.pinned); setMenuFor(null); }}>
                    <IconPin size={13} /> {c.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button className="danger" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); setMenuFor(null); }}>
                    <IconTrash size={13} /> Delete
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
