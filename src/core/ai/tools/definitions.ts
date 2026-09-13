import type { ToolDef } from "../../types";

/**
 * Tool schemas exposed to the model via native function calling.
 * Execution and permission checks happen in the agent loop; the Rust
 * backend enforces workspace sandboxing.
 */
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "filesystem.list",
    description:
      "List files and directories in the project, recursively up to depth (max 4). Use to explore the project structure.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative directory path. Empty = project root." },
        depth: { type: "number", description: "Max depth (1-4, default 2)." },
      },
      required: [],
    },
  },
  {
    name: "filesystem.read",
    description: "Read a text file. Returns its content (max 2MB).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
      },
      required: ["path"],
    },
  },
  {
    name: "filesystem.write",
    description:
      "Create or overwrite a text file with the given full content. Requires approval unless auto mode is on.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        content: { type: "string", description: "Complete new file content." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "filesystem.edit",
    description:
      "Replace an exact, unique text snippet in a file. Prefer this over rewriting whole files. Fails if oldText appears multiple times unless replaceAll is set.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        oldText: { type: "string", description: "Exact text to replace (include enough context to be unique)." },
        newText: { type: "string", description: "Replacement text." },
        replaceAll: { type: "boolean", description: "Replace every occurrence (default false)." },
      },
      required: ["path", "oldText", "newText"],
    },
  },
  {
    name: "filesystem.delete",
    description: "Delete a file or directory. Directories need recursive=true. Requires approval.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path." },
        recursive: { type: "boolean", description: "Allow deleting non-empty directories." },
      },
      required: ["path"],
    },
  },
  {
    name: "filesystem.search",
    description: "Search file and folder names (case-insensitive substring).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "filesystem.grep",
    description:
      "Search file contents. Case-insensitive substring by default; regex with isRegex. Skips binaries and vendored dirs.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        isRegex: { type: "boolean" },
        maxResults: { type: "number" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "terminal.run",
    description:
      "Run a shell command in the project directory (PowerShell on Windows). Output is captured; dangerous commands always require approval.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeoutMs: { type: "number", description: "Optional timeout in ms (max 600000)." },
      },
      required: ["command"],
    },
  },
  {
    name: "git.status",
    description: "Show working tree status (branch + changed files).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "git.diff",
    description: "Show the current uncommitted diff.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "git.log",
    description: "Show recent commit history.",
    parameters: {
      type: "object",
      properties: { max: { type: "number", description: "Max commits (default 20)." } },
      required: [],
    },
  },
  {
    name: "project.inspect",
    description:
      "Inspect the project: file counts, key manifests, README excerpt and git state.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export type ToolGroup = "filesystem" | "terminal" | "git";

export function toolGroup(name: string): ToolGroup {
  if (name.startsWith("terminal.")) return "terminal";
  if (name.startsWith("git.")) return "git";
  return "filesystem";
}

/** Read-only filesystem tools never need approval. */
export function isReadOnlyTool(name: string): boolean {
  return (
    name === "filesystem.read" ||
    name === "filesystem.list" ||
    name === "filesystem.search" ||
    name === "filesystem.grep" ||
    name === "project.inspect"
  );
}

/** Filesystem tools that modify files (diff-previewed before apply). */
export function isFileMutatingTool(name: string): boolean {
  return (
    name === "filesystem.write" ||
    name === "filesystem.edit" ||
    name === "filesystem.delete"
  );
}
