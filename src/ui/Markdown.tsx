import { memo, useMemo, useRef, useState, useDeferredValue } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import rust from "highlight.js/lib/languages/rust";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import powershell from "highlight.js/lib/languages/powershell";
import ini from "highlight.js/lib/languages/ini";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import diff from "highlight.js/lib/languages/diff";
import { IconCopy, IconCheck, IconFolder } from "./icons";
import { api } from "../core/api/ipc";
import { useProject } from "../state/project";
import { useUi } from "../state/ui";

// highlight.js language modules export registration functions; alias them
// explicitly (spreading them into objects breaks registerLanguage).
const LANGUAGES: [string, Parameters<typeof hljs.registerLanguage>[1]][] = [
  ["javascript", javascript],
  ["typescript", typescript],
  ["python", python],
  ["json", json],
  ["bash", bash],
  ["rust", rust],
  ["css", css],
  ["xml", xml],
  ["html", xml],
  ["markdown", markdown],
  ["sql", sql],
  ["yaml", yaml],
  ["toml", ini],
  ["ini", ini],
  ["powershell", powershell],
  ["go", go],
  ["java", java],
  ["cpp", cpp],
  ["c", cpp],
  ["csharp", csharp],
  ["diff", diff],
];
for (const [name, lang] of LANGUAGES) {
  hljs.registerLanguage(name, lang);
}
hljs.configure({ ignoreUnescapedHTML: true });

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function highlightCode(code: string, lang: string): { html: string; language: string } {
  const language = (lang || "").toLowerCase();
  if (language && hljs.getLanguage(language)) {
    return { html: hljs.highlight(code, { language }).value, language };
  }
  const auto = hljs.highlightAuto(code, ["javascript", "typescript", "python", "json", "bash", "rust"]);
  return { html: auto.value, language: language || auto.language || "" };
}

const EXT_BY_LANG: Record<string, string> = {
  typescript: "ts", ts: "ts", tsx: "tsx",
  javascript: "js", js: "js", jsx: "jsx",
  python: "py", py: "py",
  bash: "sh", shell: "sh", sh: "sh", powershell: "ps1",
  rust: "rs", json: "json", css: "css", html: "html", xml: "xml",
  markdown: "md", sql: "sql", yaml: "yml", toml: "toml",
  go: "go", java: "java", c: "c", cpp: "cpp", csharp: "cs",
  diff: "txt",
};

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { html } = useMemo(() => highlightCode(code, lang), [code, lang]);
  const { root, refreshTree } = useProject();

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const startApply = () => {
    const ext = EXT_BY_LANG[(lang || "").toLowerCase()] ?? "txt";
    const stamp = new Date();
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mm = String(stamp.getMinutes()).padStart(2, "0");
    const ss = String(stamp.getSeconds()).padStart(2, "0");
    setName(`snippet-${hh}${mm}${ss}.${ext}`);
    setApplying(true);
    setTimeout(() => {
      inputRef.current?.focus();
      const dot = `snippet-${hh}${mm}${ss}`.length;
      inputRef.current?.setSelectionRange(0, dot);
    }, 20);
  };

  const apply = async () => {
    const rel = name.trim().replace(/^\/+/, "");
    if (!rel || !root) return;
    try {
      await api.fsWrite(rel, code.endsWith("\n") ? code : `${code}\n`, root);
      void refreshTree();
      setApplying(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      useUi.getState().toast(`Saved to ${rel}`, "ok");
    } catch (e) {
      useUi.getState().toast(`Could not save: ${String(e)}`, "error");
    }
  };

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="codeblock-lang">{lang || "code"}</span>
        <span className="codeblock-actions">
          {applying ? (
            <>
              <input
                ref={inputRef}
                className="codeblock-apply-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void apply();
                  if (e.key === "Escape") setApplying(false);
                }}
                onBlur={() => setApplying(false)}
                aria-label="File name in workspace"
                spellCheck={false}
              />
              <button className="codeblock-apply" onMouseDown={(e) => e.preventDefault()} onClick={() => void apply()}>
                <IconCheck size={12} /> Save
              </button>
            </>
          ) : (
            <>
              {root && (
                <button
                  className="codeblock-apply"
                  onClick={startApply}
                  title="Save this snippet into the open workspace"
                >
                  {saved ? <IconCheck size={12} /> : <IconFolder size={12} />}
                  {saved ? "Saved" : "Apply to Workspace"}
                </button>
              )}
              <button className="icon-btn" onClick={copy} title="Copy code" aria-label="Copy code">
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
              </button>
            </>
          )}
        </span>
      </div>
      <pre>
        <code className={`hljs`} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

/**
 * Renders model output markdown. Model content is untrusted input:
 * sanitized with DOMPurify before it ever reaches the DOM.
 */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const deferred = useDeferredValue(content);
  const html = useMemo(() => {
    const raw = marked.parse(deferred ?? "", { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      FORBID_TAGS: ["style", "form", "input", "iframe", "script"],
      FORBID_ATTR: ["style", "onerror", "onclick"],
    });
  }, [deferred]);

  return (
    <div
      className="markdown"
      onClick={(e) => {
        // intercept code fences for copyable blocks
        const target = e.target as HTMLElement;
        if (target.tagName === "PRE") return;
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/** Split markdown into code blocks so we can attach copy buttons. */
export const RichMarkdown = memo(function RichMarkdown({ content }: { content: string }) {
  const parts = useMemo(() => splitCodeFences(content ?? ""), [content]);
  return (
    <div className="markdown">
      {parts.map((p, i) =>
        p.type === "code" ? (
          <CodeBlock key={i} code={p.text} lang={p.lang} />
        ) : (
          <PlainMarkdown key={i} content={p.text} />
        )
      )}
    </div>
  );
});

const PlainMarkdown = memo(function PlainMarkdown({ content }: { content: string }) {
  const deferred = useDeferredValue(content);
  const html = useMemo(() => {
    const raw = marked.parse(deferred, { async: false }) as string;
    return DOMPurify.sanitize(raw, { FORBID_TAGS: ["style", "form", "input", "iframe"] });
  }, [deferred]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

type Part = { type: "text" | "code"; text: string; lang: string };

export function splitCodeFences(text: string): Part[] {
  const parts: Part[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", text: text.slice(last, m.index), lang: "" });
    }
    parts.push({ type: "code", text: m[2].replace(/\n$/, ""), lang: m[1] || "" });
    last = fence.lastIndex;
  }
  if (last < text.length) {
    parts.push({ type: "text", text: text.slice(last), lang: "" });
  }
  return parts.length ? parts : [{ type: "text", text, lang: "" }];
}
