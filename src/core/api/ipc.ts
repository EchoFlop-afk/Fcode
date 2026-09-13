import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  ChatRequest,
  Conversation,
  ConversationMeta,
  FileEntry,
  GrepMatch,
  GitStatus,
  Message,
  ModelInfo,
  ProviderConfig,
  ProviderStatusInfo,
  QuotaCheck,
  Settings,
  StreamEvent,
  TerminalEvent,
  UsageSnapshot,
  Promotion,
  PromotionStatus,
} from "../types";

export { invoke };

export type StreamHandle = {
  streamId: number;
  cancel: () => Promise<void>;
};

/**
 * Starts a provider chat stream. Events arrive via the Tauri IPC channel.
 * If the backend rejects the request up front (not configured, quota
 * exhausted, ...), the rejection is surfaced as an `error` event so callers
 * have a single event-driven contract.
 */
export function streamChat(
  request: ChatRequest,
  onEvent: (e: StreamEvent) => void
): StreamHandle {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  const handle: StreamHandle = {
    streamId: 0,
    cancel: async () => {
      if (handle.streamId) {
        await invoke("cancel_stream", { streamId: handle.streamId }).catch(() => {});
      }
    },
  };
  invoke<number>("chat_stream", { request, onEvent: channel })
    .then((id) => {
      handle.streamId = id;
    })
    .catch((err) => {
      onEvent({
        type: "error",
        code: "internal",
        category: "internal",
        message: typeof err === "string" ? err : err?.message ?? "Request failed",
        retriable: false,
      });
    });
  return handle;
}

export const api = {
  // settings
  settingsGet: () => invoke<Settings>("settings_get"),
  settingsSave: (settings: Settings) => invoke<void>("settings_save", { settings }),

  // conversations
  conversationCreate: (conversation: Conversation) =>
    invoke<void>("conversation_create", { conversation }),
  conversationSave: (conversation: Conversation) =>
    invoke<void>("conversation_save", { conversation }),
  conversationList: () => invoke<ConversationMeta[]>("conversation_list"),
  conversationGet: (id: string) => invoke<Conversation | null>("conversation_get", { id }),
  conversationDelete: (id: string) => invoke<void>("conversation_delete", { id }),
  conversationRename: (id: string, title: string) =>
    invoke<void>("conversation_rename", { id, title }),
  conversationPin: (id: string, pinned: boolean) =>
    invoke<void>("conversation_pin", { id, pinned }),
  conversationSearch: (query: string, limit?: number) =>
    invoke<ConversationMeta[]>("conversation_search", { query, limit }),
  conversationAppendMessages: (
    id: string,
    messages: Message[],
    model?: string,
    provider?: string
  ) =>
    invoke<void>("conversation_append_messages", {
      id,
      messages,
      model,
      provider,
    }),
  autoTitle: (text: string) => invoke<string>("auto_title_cmd", { text }),

  // providers
  providerKeyStatus: (providerId: string) =>
    invoke<{ providerId: string; keyPresent: boolean; masked?: string }>(
      "provider_key_status",
      { providerId }
    ),
  providerSetKey: (providerId: string, key: string) =>
    invoke<void>("provider_set_key", { providerId, key }),
  providerDeleteKey: (providerId: string) =>
    invoke<void>("provider_delete_key", { providerId }),
  providerAddCustom: (name: string, baseUrl: string) =>
    invoke<ProviderConfig>("provider_add_custom", { name, baseUrl }),
  providerRemove: (providerId: string) => invoke<void>("provider_remove", { providerId }),
  providerValidate: (providerId: string) =>
    invoke<ProviderStatusInfo>("provider_validate", { providerId }),
  providerModels: (providerId: string) =>
    invoke<ModelInfo[]>("provider_models", { providerId }),

  // streaming
  estimateTokens: (text: string) => invoke<number>("estimate_tokens_cmd", { text }),

  // tools
  toolExecute: (
    name: string,
    args: Record<string, unknown>,
    projectRoot?: string,
    onOutput?: (e: TerminalEvent) => void
  ): Promise<unknown> => {
    if (onOutput) {
      const channel = new Channel<TerminalEvent>();
      channel.onmessage = onOutput;
      return invoke("tool_execute", { name, args, projectRoot, onOutput: channel });
    }
    const channel = new Channel<TerminalEvent>();
    return invoke("tool_execute", { name, args, projectRoot, onOutput: channel });
  },
  commandRisk: (command: string) => invoke<string>("command_risk", { command }),

  // filesystem (user-driven)
  fsRead: (path: string, projectRoot?: string) =>
    invoke<{ content: string; truncated: boolean; size: number }>("fs_read", {
      path,
      projectRoot,
    }),
  fsWrite: (path: string, content: string, projectRoot?: string) =>
    invoke<number>("fs_write", { path, content, projectRoot }),
  fsListDir: (path: string, projectRoot?: string) =>
    invoke<FileEntry[]>("fs_list_dir", { path, projectRoot }),
  fsTree: (depth: number, projectRoot?: string) =>
    invoke<FileEntry[]>("fs_tree", { depth, projectRoot }),
  fsSearch: (query: string, maxResults?: number, projectRoot?: string) =>
    invoke<FileEntry[]>("fs_search", { query, maxResults, projectRoot }),
  fsGrep: (pattern: string, isRegex?: boolean, maxResults?: number, projectRoot?: string) =>
    invoke<GrepMatch[]>("fs_grep", { pattern, isRegex, maxResults, projectRoot }),
  fsDelete: (path: string, recursive?: boolean, projectRoot?: string) =>
    invoke<void>("fs_delete", { path, recursive, projectRoot }),
  projectInspect: (projectRoot?: string) => invoke<Record<string, unknown>>("project_inspect", { projectRoot }),

  // git
  gitStatus: (projectRoot?: string) => invoke<GitStatus>("git_status", { projectRoot }),
  gitDiff: (projectRoot?: string) => invoke<string>("git_diff", { projectRoot }),
  gitLog: (max?: number, projectRoot?: string) =>
    invoke<{ hash: string; author: string; date: string; subject: string }[]>("git_log", {
      max,
      projectRoot,
    }),

  // terminal
  terminalRun: (
    sessionId: string,
    command: string,
    projectRoot: string | undefined,
    onEvent: (e: TerminalEvent) => void
  ) => {
    const channel = new Channel<TerminalEvent>();
    channel.onmessage = onEvent;
    return invoke<{ sessionId: string; cwd: string }>("terminal_run", {
      sessionId,
      command,
      projectRoot,
      onEvent: channel,
    });
  },
  terminalStop: (sessionId: string) => invoke<void>("terminal_stop", { sessionId }),
  terminalCwd: (sessionId: string) => invoke<string | null>("terminal_cwd", { sessionId }),

  // usage & quotas
  usageGet: () => invoke<UsageSnapshot>("usage_get"),
  usageReset: () => invoke<void>("usage_reset"),
  promotionsList: () => invoke<PromotionStatus[]>("promotions_list"),
  promotionsSave: (promotions: Promotion[]) =>
    invoke<void>("promotions_save", { promotions }),
  quotaCheck: (providerId: string, model: string) =>
    invoke<QuotaCheck>("quota_check", { providerId, model }),

  // import / export
  exportData: (path: string) => invoke<number>("export_data", { path }),
  importData: (path: string) => invoke<number>("import_data", { path }),
};
