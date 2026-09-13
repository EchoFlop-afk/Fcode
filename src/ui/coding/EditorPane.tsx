import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, rectangularSelection, crosshairCursor, dropCursor } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { rust } from "@codemirror/lang-rust";
import { useProject } from "../../state/project";
import { IconSave } from "../icons";

const COMPARTMENT = new Compartment();

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs":
      return javascript({ jsx: true });
    case "ts": case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "json": case "jsonc":
      return json();
    case "md": case "markdown":
      return markdown();
    case "py":
      return python();
    case "html": case "htm": case "vue": case "svelte":
      return html();
    case "css": case "scss": case "less":
      return css();
    case "rs":
      return rust();
    default:
      return [];
  }
}

// Restrained theme matching the app tokens.
const fcodeTheme = EditorView.theme({
  "&": { backgroundColor: "var(--bg0)", color: "var(--text)", fontSize: "12.5px" },
  ".cm-content": { fontFamily: "var(--mono)", caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--bg0)",
    color: "var(--faint)",
    border: "none",
    borderRight: "1px solid var(--line)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--dim)" },
  ".cm-activeLine": { backgroundColor: "rgba(124,179,66,0.045)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "rgba(124,179,66,0.22) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.6" },
  ".cm-tooltip": { backgroundColor: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: "8px" },
  ".cm-panels": { backgroundColor: "var(--bg2)", color: "var(--text)" },
  ".cm-searchMatch": { backgroundColor: "rgba(124,179,66,0.18)" },
  ".cm-searchMatch-selected": { backgroundColor: "rgba(124,179,66,0.35)" },
});

export function EditorPane() {
  const { tabs, activeTab, updateBuffer, saveTab, reloadTab } = useProject();
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentPathRef = useRef<string | null>(null);

  const tab = tabs.find((t) => t.path === activeTab) ?? null;

  useEffect(() => {
    if (!parentRef.current) return;
    if (!viewRef.current) {
      const view = new EditorView({
        parent: parentRef.current,
        state: EditorState.create({ doc: "" }),
      });
      viewRef.current = view;
    }
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // (re)configure when the active tab changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!tab) {
      currentPathRef.current = null;
      view.setState(EditorState.create({ doc: "" }));
      return;
    }
    const exts = [
      lineNumbers(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentUnit.of("  "),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      COMPARTMENT.of(languageFor(tab.path)),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { void saveTab(tab.path); return true; } },
        { key: "Mod-f", preventDefault: true, run: openSearchPanel },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      fcodeTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && currentPathRef.current) {
          updateBuffer(currentPathRef.current, update.state.doc.toString());
        }
      }),
    ];
    view.setState(EditorState.create({ doc: tab.content, extensions: exts }));
    currentPathRef.current = tab.path;
  }, [activeTab, tabs.length]);

  if (!tab) {
    return (
      <div className="editor-pane empty">
        <p>Select a file to edit</p>
      </div>
    );
  }

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <span className="editor-path" title={tab.path}>{tab.path}</span>
        {tab.truncated && <span className="tag">truncated</span>}
        <div className="spacer" />
        <button className="icon-btn" onClick={() => void reloadTab(tab.path)} title="Reload from disk" aria-label="Reload file">
          ⟳
        </button>
        <button
          className={`icon-btn${tab.dirty ? " accent" : ""}`}
          onClick={() => void saveTab(tab.path)}
          title="Save (Ctrl+S)"
          aria-label="Save file"
        >
          <IconSave size={13} />
        </button>
      </div>
      <div className="editor-host" ref={parentRef} />
    </div>
  );
}

