import type { ToolDef } from "../types";

/**
 * Fallback tool protocol for providers without native function calling.
 * The model emits a fenced ```fcode-tool block instead.
 */
export const TEXT_TOOL_PROTOCOL = `
# Tool usage protocol

This provider does not support native tool calling. To use a tool, respond with
EXACTLY ONE fenced code block tagged fcode-tool containing a JSON object, and
nothing else after it:

\`\`\`fcode-tool
{"name": "<tool name>", "arguments": { ... }}
\`\`\`

Then stop. The tool result will be sent back as the next message. When you do
not need a tool, reply normally without the block.`;

export function renderToolList(tools: ToolDef[]): string {
  return tools
    .map((t) => {
      const params = JSON.stringify(t.parameters);
      return `- ${t.name}: ${t.description} (arguments schema: ${params})`;
    })
    .join("\n");
}

export function parseTextToolCall(content: string): {
  name: string;
  arguments: string;
} | null {
  const match = content.match(/```fcode-tool\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed?.name === "string") {
      return {
        name: parsed.name,
        arguments:
          typeof parsed.arguments === "string"
            ? parsed.arguments
            : JSON.stringify(parsed.arguments ?? {}),
      };
    }
  } catch {
    // Malformed tool block - treat as plain content.
  }
  return null;
}

export function stripTextToolCall(content: string): string {
  return content.replace(/```fcode-tool\s*[\s\S]*?```/, "").trim();
}
