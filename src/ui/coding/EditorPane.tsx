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
import { useProject, type EditorTab } from "../../state/project";
import { IconSave } from "../icons";
import { ImagePreview } from "./ImagePreview";

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

// Flat theme matching the app tokens (indigo accent).
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
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "rgba(99,102,241,0.25) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.6" },
  ".cm-tooltip": { backgroundColor: "var(--overlay)", border: "1px solid var(--line2)", borderRadius: "5px" },
  ".cm-panels": { backgroundColor: "var(--bg2)", color: "var(--text)" },
  ".cm-searchMatch": { backgroundColor: "rgba(99,102,241,0.22)" },
  ".cm-searchMatch-selected": { backgroundColor: "rgba(99,102,241,0.45)" },
});

/** Text editor for a single file tab. Keyed by path so it mounts fresh. */
function TextEditor({ tab }: { tab: EditorTab }) {
  const { updateBuffer, saveTab, reloadTab } = useProject();
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!parentRef.current) return;
    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({ doc: tab.content }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [tab.path]);

  // (re)configure extensions when the file changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
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
        if (update.docChanged) {
          updateBuffer(tab.path, update.state.doc.toString());
        }
      }),
    ];
    view.setState(EditorState.create({ doc: tab.content, extensions: exts }));
  }, [tab.path]);

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

export function EditorPane() {
  const { tabs, activeTab } = useProject();
  const tab = tabs.find((t) => t.path === activeTab) ?? null;

  if (!tab) {
    return (
      <div className="editor-pane empty">
        <p>Select a file to edit</p>
      </div>
    );
  }

  if (tab.image) {
    return <ImagePreview key={tab.path} tab={tab} />;
  }

  return <TextEditor key={tab.path} tab={tab} />;
}
