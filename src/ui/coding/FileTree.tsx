import { useEffect, useRef, useState } from "react";
import { useUi } from "../../state/ui";
import { openFolderPicker } from "../CommandPalette";
import { useProject } from "../../state/project";
import { IconFolder, IconFile, IconChevronRight, IconChevronDown, IconTrash, IconRefresh, IconTerminal, IconX } from "../icons";
import { api } from "../../core/api/ipc";
import type { FileEntry } from "../../core/types";
import { formatTokens } from "../../core/util/misc";

export function FileTree() {
  const { root, tree, refreshTree, openFile, activeTab } = useProject();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[] | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (!root) return;
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const hits = await api.fsSearch(q.trim(), 60, root).catch(() => []);
    setResults(hits);
  };

  if (!root) {
    return (
      <div className="filetree empty">
        <p>No project open</p>
        <button className="btn primary small" onClick={() => void openFolderPicker()}>
          <IconFolder size={13} /> Open folder
        </button>
      </div>
    );
  }

  return (
    <div className="filetree">
      <div className="filetree-head">
        <input
          className="filetree-search"
          placeholder="Search files…"
          value={query}
          onChange={(e) => void search(e.target.value)}
          aria-label="Search files"
        />
        <button className="icon-btn" onClick={() => void refreshTree()} title="Refresh" aria-label="Refresh tree">
          <IconRefresh size={12} />
        </button>
      </div>
      <div className="filetree-body">
        {results
          ? results.map((e) => (
              <FileRow
                key={e.path}
                entry={e}
                depth={0}
                activeTab={activeTab}
                onOpen={() => void openFile(e.path)}
              />
            ))
          : tree
              .filter((e) => e.kind === "file" || e.path.split("/").length === 1)
              .map((e) => (
                <TreeNode
                  key={e.path}
                  entry={e}
                  depth={0}
                  activeTab={activeTab}
                  onOpen={() => void openFile(e.path)}
                />
              ))}
      </div>
    </div>
  );
}

function TreeNode({
  entry, depth, activeTab, onOpen,
}: {
  entry: FileEntry;
  depth: number;
  activeTab: string | null;
  onOpen: () => void;
}) {
  const { tree, expandedDirs, toggleDir } = useProject();
  const isDir = entry.kind === "dir";
  const expanded = expandedDirs.has(entry.path);

  const children = isDir && expanded
    ? tree.filter((e) => e.path.startsWith(`${entry.path}/`) && e.path.split("/").length === entry.path.split("/").length + 1)
    : [];

  return (
    <>
      <div
        className={`tree-row${!isDir && activeTab === entry.path ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (isDir ? toggleDir(entry.path) : onOpen())}
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
      >
        {isDir ? (
          expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
        ) : (
          <IconFile size={12} className="dim" />
        )}
        <span className="tree-name">{entry.name}</span>
        {!isDir && entry.size > 0 && <span className="tree-size">{formatTokens(entry.size)}b</span>}
      </div>
      {children.map((c) => (
        <TreeNode
          key={c.path}
          entry={c}
          depth={depth + 1}
          activeTab={activeTab}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function FileRow({ entry, activeTab, onOpen }: { entry: FileEntry; depth: number; activeTab: string | null; onOpen: () => void }) {
  return (
    <div className={`tree-row${activeTab === entry.path ? " active" : ""}`} onClick={onOpen}>
      {entry.kind === "dir" ? <IconFolder size={12} /> : <IconFile size={12} className="dim" />}
      <span className="tree-name">{entry.path}</span>
    </div>
  );
}

export function EditorTabs() {
  const { tabs, activeTab, setActiveTab, closeTab } = useProject();
  if (!tabs.length) return null;
  return (
    <div className="editor-tabs">
      {tabs.map((t) => (
        <div
          key={t.path}
          className={`editor-tab${activeTab === t.path ? " active" : ""}`}
          onClick={() => setActiveTab(t.path)}
        >
          <span className="tab-name">{t.path.split("/").pop()}</span>
          {t.dirty && <span className="tab-dirty" title="Unsaved changes" />}
          <button
            className="icon-btn tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(t.path); }}
            aria-label="Close tab"
          >
            <IconX size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function TerminalPanel() {
  const { root } = useProject();
  const { terminalOpen, setTerminalOpen } = useUi();
  const [lines, setLines] = useState<{ stream: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const SESSION = "ui";

  useEffect(() => {
    if (root) {
      api.terminalCwd(SESSION).then((c) => setCwd(c ?? root)).catch(() => {});
    }
  }, [root]);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [lines]);

  if (!terminalOpen || !root) return null;

  const run = async () => {
    const command = input.trim();
    if (!command) return;
    setInput("");
    setHistory((h) => [command, ...h].slice(0, 100));
    setHistoryIdx(-1);
    setLines((l) => [...l, { stream: "cmd", text: `${cwd}> ${command}` }]);
    try {
      await api.terminalRun(SESSION, command, root, (ev) => {
        if (ev.type === "data" && ev.data) {
          setLines((l) => [...l.slice(-3000), { stream: ev.stream ?? "stdout", text: ev.data! }]);
        } else if (ev.type === "error" && ev.message) {
          setLines((l) => [...l.slice(-3000), { stream: "stderr", text: `error: ${ev.message}` }]);
        } else if (ev.type === "exit") {
          api.terminalCwd(SESSION).then((c) => c && setCwd(c)).catch(() => {});
        }
      });
    } catch (e) {
      setLines((l) => [...l, { stream: "stderr", text: String(e) }]);
    }
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-head">
        <IconTerminal size={13} />
        <span>Terminal</span>
        <span className="terminal-cwd" title={cwd}>{cwd}</span>
        <button className="icon-btn" onClick={() => setLines([])} title="Clear" aria-label="Clear terminal">
          <IconTrash size={12} />
        </button>
        <button className="icon-btn" onClick={() => setTerminalOpen(false)} aria-label="Close terminal">
          <IconX size={12} />
        </button>
      </div>
      <div className="terminal-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className={`terminal-line ${l.stream === "stderr" ? "err" : l.stream === "cmd" ? "cmd" : ""}`}>
            {l.text}
          </div>
        ))}
      </div>
      <div className="terminal-input">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = Math.min(historyIdx + 1, history.length - 1);
              if (history[next]) {
                setHistoryIdx(next);
                setInput(history[next]);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = historyIdx - 1;
              setHistoryIdx(next);
              setInput(next >= 0 ? history[next] ?? "" : "");
            }
          }}
          placeholder="Type a command (PowerShell)…"
          aria-label="Terminal input"
        />
      </div>
    </div>
  );
}
