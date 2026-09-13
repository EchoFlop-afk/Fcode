import { create } from "zustand";
import { api } from "../core/api/ipc";
import type { Conversation, ConversationMeta, Message } from "../core/types";
import { AgentRunner, type ActivityItem, type ApprovalDecision, type ApprovalRequest } from "../core/agent/loop";
import { splitFullId } from "../core/ai/router/fallback";
import { newId, nowMs } from "../core/util/misc";
import { useSettings } from "./settings";
import { useProject } from "./project";
import { useUi } from "./ui";

export type AgentMode = "chat" | "agent";

interface ChatState {
  conversations: ConversationMeta[];
  activeId: string | null;
  messages: Message[];
  /** live in-flight assistant message (streaming) */
  live: Message | null;
  mode: AgentMode;
  streaming: boolean;
  activity: ActivityItem[];
  pendingApproval: ApprovalRequest | null;
  approvalResolver: ((d: ApprovalDecision) => void) | null;
  runner: AgentRunner | null;
  turnModel: string | null;
  turnProvider: string | null;
  searchQuery: string;

  init: () => Promise<void>;
  search: (q: string) => void;
  setMode: (m: AgentMode) => void;
  newConversation: () => void;
  openConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string, pinned: boolean) => Promise<void>;

  send: (text: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  editMessage: (id: string, newContent: string) => Promise<void>;
  deleteMessage: (id: string) => void;

  resolveApproval: (d: ApprovalDecision) => void;
}

function previewOf(messages: Message[]): string {
  const last = [...messages].reverse().find((m) => m.content);
  return last ? last.content.replace(/\s+/g, " ").slice(0, 120) : "";
}

export const useChat = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  live: null,
  mode: "chat",
  streaming: false,
  activity: [],
  pendingApproval: null,
  approvalResolver: null,
  runner: null,
  turnModel: null,
  turnProvider: null,
  searchQuery: "",

  init: async () => {
    const conversations = await api.conversationList().catch(() => []);
    set({ conversations });
  },

  search: (q) => set({ searchQuery: q }),

  setMode: (m) => set({ mode: m }),

  newConversation: () => {
    set({ activeId: null, messages: [], activity: [], live: null });
  },

  openConversation: async (id) => {
    if (get().streaming) get().stop();
    const conv = await api.conversationGet(id).catch(() => null);
    if (!conv) return;
    set({ activeId: id, messages: conv.messages, activity: [], live: null });
  },

  deleteConversation: async (id) => {
    await api.conversationDelete(id).catch(() => {});
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      return {
        conversations,
        ...(s.activeId === id ? { activeId: null, messages: [] } : {}),
      };
    });
  },

  renameConversation: async (id, title) => {
    await api.conversationRename(id, title).catch(() => {});
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  pinConversation: async (id, pinned) => {
    await api.conversationPin(id, pinned).catch(() => {});
    set((s) => {
      const conversations = s.conversations.map((c) =>
        c.id === id ? { ...c, pinned } : c
      );
      conversations.sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
      );
      return { conversations };
    });
  },

  send: async (text) => {
    const textTrimmed = text.trim();
    if (!textTrimmed || get().streaming) return;

    const settingsState = useSettings.getState();
    const modelFull = settingsState.activeModel ?? settingsState.settings.models.defaultModel;
    if (!modelFull) {
      useUi.getState().toast("Select a model first (Ctrl+K).", "warn");
      useUi.getState().openModelSelector();
      return;
    }

    const [providerId, model] = splitFullId(modelFull);

    // Pre-flight quota check for promotion-backed models.
    try {
      const quota = await api.quotaCheck(providerId, model);
      if (!quota.allowed) {
        useUi.getState().toast(quota.reason ?? "Quota exhausted for this model.", "error");
        return;
      }
    } catch {
      // quota check is advisory; the backend enforces it regardless
    }

    let convId = get().activeId;
    if (!convId) {
      convId = newId("conv");
      const now = nowMs();
      const conv: Conversation = {
        meta: {
          id: convId,
          title: settingsState.settings.general.autoTitle
            ? textTrimmed.split("\n")[0].slice(0, 60)
            : "New Chat",
          createdAt: now,
          updatedAt: now,
          model,
          provider: providerId,
          pinned: false,
          messageCount: 0,
          preview: "",
        },
        messages: [],
      };
      await api.conversationCreate(conv).catch(() => {});
      set((s) => ({
        activeId: convId,
        conversations: [conv.meta, ...s.conversations],
      }));
    }

    const projectState = useProject.getState();
    const runner = new AgentRunner(
      {
        settings: settingsState.settings,
        projectRoot: projectState.root,
        projectName: projectState.name,
        mode: get().mode,
        openFiles: projectState.tabs.map((t) => t.path),
        history: () => get().messages.filter((m) => m.role !== "system" && !m.streaming),
        onModelChange: (m, p) => set({ turnModel: m, turnProvider: p }),
      },
      {
        onLive: (msg) => set({ live: msg }),
        onMessage: (msg) => {
          set((s) => ({ messages: [...s.messages, msg] }));
          void persistMessages([msg], providerId, model);
        },
        onActivity: (a) => {
          set((s) => {
            const existing = s.activity.findIndex((x) => x.id === a.id);
            if (existing >= 0) {
              const activity = [...s.activity];
              activity[existing] = a;
              return { activity };
            }
            return { activity: [...s.activity, a] };
          });
        },
        requestApproval: (req) => {
          return new Promise<ApprovalDecision>((resolve) => {
            set({ pendingApproval: req, approvalResolver: resolve });
          });
        },
        onNotice: (text, kind) => useUi.getState().toast(text, kind ?? "info"),
      }
    );

    set({
      streaming: true,
      runner,
      turnModel: model,
      turnProvider: providerId,
      activity: [],
    });

    try {
      await runner.runTurn(textTrimmed, modelFull);
    } finally {
      set({ streaming: false, live: null, runner: null });
      void refreshConversationMeta();
    }
  },

  stop: () => {
    get().runner?.stop();
    const live = get().live;
    if (live) {
      live.streaming = false;
      live.stopped = true;
      set((s) => ({
        messages: [...s.messages, live],
        live: null,
      }));
      void persistMessages([live], live.provider ?? null, live.model ?? null);
    }
    set({ streaming: false });
  },

  regenerate: async () => {
    if (get().streaming) return;
    const messages = get().messages;
    // Find last assistant message index; drop it and re-send previous user msg.
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userText = messages[lastUserIdx].content;
    // Remove messages after (and including) the last user message.
    const removed = messages.slice(lastUserIdx);
    set({ messages: messages.slice(0, lastUserIdx) });
    void removePersisted(removed);
    await get().send(userText);
  },

  editMessage: async (id, newContent) => {
    const messages = get().messages;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const removed = messages.slice(idx + 1);
    const edited: Message = { ...messages[idx], content: newContent };
    set({ messages: [...messages.slice(0, idx), edited] });
    void removePersisted(removed);
    await get().send(newContent);
  },

  deleteMessage: (id) => {
    const messages = get().messages;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const removed = messages.slice(idx, idx + 1);
    set({ messages: messages.filter((m) => m.id !== id) });
    void removePersisted(removed);
  },

  resolveApproval: (d) => {
    const resolver = get().approvalResolver;
    set({ pendingApproval: null, approvalResolver: null });
    resolver?.(d);
  },
}));

function persistMessages(messages: Message[], provider: string | null, model: string | null): void {
  const { activeId } = useChat.getState();
  if (!activeId) return;
  api
    .conversationAppendMessages(
      activeId,
      messages.map((m) => ({ ...m, streaming: false, stopped: m.stopped ?? false })),
      model ?? undefined,
      provider ?? undefined
    )
    .then(() => refreshConversationMeta())
    .catch(() => {});
}

async function removePersisted(messages: Message[]): Promise<void> {
  const { activeId } = useChat.getState();
  if (!activeId || !messages.length) return;
  const conv = await api.conversationGet(activeId).catch(() => null);
  if (!conv) return;
  const removedIds = new Set(messages.map((m) => m.id));
  conv.messages = conv.messages.filter((m) => !removedIds.has(m.id));
  conv.meta.messageCount = conv.messages.length;
  conv.meta.updatedAt = nowMs();
  conv.meta.preview = previewOf(conv.messages);
  await api.conversationSave(conv).catch(() => {});
  void refreshConversationMeta();
}

async function refreshConversationMeta(): Promise<void> {
  const conversations = await api.conversationList().catch(() => []);
  useChat.setState({ conversations });
}
