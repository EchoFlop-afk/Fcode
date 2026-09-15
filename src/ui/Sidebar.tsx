import { useState } from "react";
import { useUi } from "../state/ui";
import { useChat } from "../state/chat";
import { useProject } from "../state/project";
import {
  IconPlus, IconSearch, IconSettings, IconFolder, IconChart, IconSidebar,
  IconTrash, IconPin, IconEdit, IconCpu,
} from "./icons";
import { formatRelativeTime, truncate } from "../core/util/misc";

export function Sidebar() {
  const { view, setView, sidebarOpen, toggleSidebar, openSettings } = useUi();
  const { root, name } = useProject();

  if (!sidebarOpen) {
    return (
      <div className="sidebar collapsed">
        <button className="icon-btn" onClick={toggleSidebar} data-tip="Expand sidebar · Ctrl+B" aria-label="Expand sidebar">
          <IconSidebar size={16} />
        </button>
        <button className="icon-btn" onClick={() => setView("chat")} data-tip="New chat · Ctrl+N" aria-label="New chat">
          <IconPlus size={16} />
        </button>
        <div className="spacer" />
        <NavButton view={view} setView={setView} target="projects" icon={<IconFolder size={16} />} label="Projects" compact sub={root ? name : undefined} />
        <NavButton view={view} setView={setView} target="hub" icon={<IconCpu size={16} />} label="Models" compact />
        <NavButton view={view} setView={setView} target="usage" icon={<IconChart size={16} />} label="Usage" compact />
        <button className="icon-btn" onClick={() => openSettings()} data-tip="Settings" aria-label="Settings">
          <IconSettings size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="new-chat-btn" onClick={() => { useChat.getState().newConversation(); setView("chat"); }}>
          <IconPlus size={13} />
          <span className="nc-label">New Chat</span>
          <kbd>Ctrl+N</kbd>
        </button>
        <button className="icon-btn" onClick={toggleSidebar} data-tip="Collapse · Ctrl+B" aria-label="Collapse sidebar">
          <IconSidebar size={14} />
        </button>
      </div>
      <ConversationSearch />
      <div className="side-label">Chats</div>
      <ConversationList />
      <div className="side-nav">
        <NavButton view={view} setView={setView} target="projects" icon={<IconFolder size={15} />} label="Projects" sub={root ? name : undefined} />
        <NavButton view={view} setView={setView} target="hub" icon={<IconCpu size={15} />} label="Models" />
        <NavButton view={view} setView={setView} target="usage" icon={<IconChart size={15} />} label="Usage" />
      </div>
      <div className="sidebar-foot">
        <button className="ws-pill" onClick={() => openSettings()} data-tip="Workspace settings" aria-label="Workspace settings">
          <span className="ws-pill-icon">
            <IconFolder size={13} />
          </span>
          <span className="ws-pill-name">{root ? name : "Local workspace"}</span>
          <IconSettings size={13} />
        </button>
      </div>
    </div>
  );
}

function NavButton({
  view, setView, target, icon, label, compact, sub,
}: {
  view: string;
  setView: (v: "chat" | "hub" | "projects" | "usage") => void;
  target: "chat" | "hub" | "projects" | "usage";
  icon: React.ReactNode;
  label: string;
  compact?: boolean;
  sub?: string;
}) {
  return (
    <button
      className={`nav-item${view === target ? " active" : ""}${compact ? " compact" : ""}`}
      onClick={() => setView(target)}
      data-tip={compact ? (sub ? `${label} · ${sub}` : label) : undefined}
      aria-label={label}
    >
      {icon}
      {!compact && <span>{label}</span>}
      {!compact && sub && <span className="nav-sub">{sub}</span>}
    </button>
  );
}

function ConversationSearch() {
  const { search, searchQuery } = useChat();
  return (
    <div className="side-search">
      <IconSearch size={12} />
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
              <div className="conv-actions">
                <button
                  className="icon-btn"
                  aria-label="Conversation options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === c.id ? null : c.id);
                  }}
                >
                  ⋯
                </button>
                <button
                  className="icon-btn"
                  aria-label="Delete conversation"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                >
                  <IconTrash size={11} />
                </button>
              </div>
              {menuFor === c.id && (
                <div className="ctx-menu" onMouseLeave={() => setMenuFor(null)}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); setMenuFor(null); }}>
                    <IconEdit size={12} /> Rename
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); pinConversation(c.id, !c.pinned); setMenuFor(null); }}>
                    <IconPin size={12} /> {c.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button className="danger" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); setMenuFor(null); }}>
                    <IconTrash size={12} /> Delete
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
