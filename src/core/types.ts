// Shared types mirroring the Rust backend (serde camelCase).

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
  costUsd?: number | null;
}

export interface ErrorInfo {
  code: string;
  category: string;
  message: string;
  provider?: string | null;
  model?: string | null;
  status?: number | null;
  retriable: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  reasoning?: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string | null;
  toolName?: string | null;
  model?: string | null;
  provider?: string | null;
  usage?: UsageInfo | null;
  error?: ErrorInfo | null;
  createdAt: number;
  durationMs?: number | null;
  /** UI-only: pending streaming marker */
  streaming?: boolean;
  /** UI-only: stopped before completion */
  stopped?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  providerId: string;
  model: string;
  messages: Message[];
  tools: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}

export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "toolCallStart"; index: number; id: string; name: string }
  | { type: "toolCallDelta"; index: number; delta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: string; category: string; message: string; status?: number | null; retriable: boolean };

export type ProviderKind = "openai_compat" | "anthropic" | "google" | "ollama";

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  requiresKey: boolean;
  isLocal: boolean;
  supportsTools: boolean;
}

export interface ProviderStatusInfo {
  id: string;
  status: "connected" | "invalid_credentials" | "not_configured" | "offline" | "error";
  detail: string;
  keyPresent: boolean;
}

export type AccessTag = "FREE" | "PAID" | "BYOK" | "LOCAL" | "TRIAL" | "PROMO";

export interface ModelInfo {
  id: string;
  fullId: string;
  provider: string;
  name: string;
  description: string;
  contextWindow: number;
  inputPricePerM: number;
  outputPricePerM: number;
  free: boolean;
  local: boolean;
  coding: boolean;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  tags: string[];
  source: "catalog" | "discovered";
}

export interface TerminalEvent {
  type: "data" | "exit" | "error";
  stream?: "stdout" | "stderr";
  data?: string;
  message?: string;
  code?: number | null;
}

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: string | null;
  provider?: string | null;
  pinned: boolean;
  messageCount: number;
  preview: string;
}

export interface Conversation {
  meta: ConversationMeta;
  messages: Message[];
}

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  size: number;
}

export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
}

export interface GitStatus {
  branch: string;
  isRepo: boolean;
  clean: boolean;
  entries: { status: string; path: string }[];
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  provider: string;
  models: string[];
  tokenBudget: number;
  startsAt: string;
  endsAt: string;
  reset?: "daily" | "weekly" | null;
  enabled: boolean;
}

export interface PromotionStatus {
  promotion: Promotion;
  used: number;
  remaining: number;
  expired: boolean;
  notStarted: boolean;
}

export interface UsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  byProvider: {
    provider: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    models: { model: string; requests: number; inputTokens: number; outputTokens: number }[];
  }[];
}

export interface UsageSnapshot {
  today: UsageSummary;
  month: UsageSummary;
}

export interface GeneralSettings {
  autoTitle: boolean;
  sendOnEnter: boolean;
  defaultAgentMode: boolean;
}
export interface AppearanceSettings {
  theme: "dark" | "light";
  fontSize: number;
}
export interface ModelSettings {
  defaultModel: string | null;
  fallbacks: string[];
  fallbackEnabled: boolean;
  catalogRefreshedAt: number | null;
}
export interface AgentSettings {
  maxIterations: number;
  contextBudgetTokens: number;
}
export interface PermissionsSettings {
  filesystem: PermissionMode;
  terminal: PermissionMode;
  git: PermissionMode;
}
export type PermissionMode = "ask" | "auto" | "disabled";
export interface TerminalSettings {
  shell: "powershell" | "cmd";
  timeoutSecs: number;
}
export interface ProjectsSettings {
  active: string | null;
  recent: string[];
}
export interface AdvancedSettings {
  logToFile: boolean;
}

export interface Settings {
  version: number;
  general: GeneralSettings;
  appearance: AppearanceSettings;
  providers: ProviderConfig[];
  models: ModelSettings;
  agent: AgentSettings;
  permissions: PermissionsSettings;
  terminal: TerminalSettings;
  projects: ProjectsSettings;
  advanced: AdvancedSettings;
}

export interface QuotaCheck {
  allowed: boolean;
  promotion?: string | null;
  remaining?: number | null;
  reason?: string | null;
}

export interface AppError {
  code: string;
  category: string;
  message: string;
  provider?: string | null;
  model?: string | null;
  status?: number | null;
  retriable: boolean;
}
