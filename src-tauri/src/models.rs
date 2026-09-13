use serde::{Deserialize, Serialize};

pub const MESSAGE_OVERHEAD_TOKENS: u64 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    /// JSON-encoded arguments object
    #[serde(default)]
    pub arguments: String,
}

/// Universal message shape used for storage and provider requests.
/// All extra fields have defaults so partial data round-trips safely.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: Role,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub usage: Option<UsageInfo>,
    #[serde(default)]
    pub error: Option<ErrorInfo>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default = "default_true")]
    pub estimated: bool,
    #[serde(default)]
    pub cost_usd: Option<f64>,
}

fn default_true() -> bool {
    true
}

/// Mirrors AppError for persistence inside conversations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    pub code: String,
    pub category: String,
    pub message: String,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub status: Option<u16>,
    #[serde(default)]
    pub retriable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub provider_id: String,
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub tools: Vec<ToolDef>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

/// Events streamed from provider adapters to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum StreamEvent {
    Delta { content: String },
    Reasoning { content: String },
    ToolCallStart { index: u32, id: String, name: String },
    ToolCallDelta { index: u32, delta: String },
    Usage { input_tokens: u64, output_tokens: u64 },
    Done { finish_reason: String },
    Error { code: String, category: String, message: String, status: Option<u16>, retriable: bool },
}

/// Terminal output events.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TerminalEvent {
    Data { stream: String, data: String },
    Exit { code: Option<i32> },
    Error { message: String },
}

/// Wire protocol for the provider transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    OpenaiCompat,
    Anthropic,
    Google,
    Ollama,
}

/// Small behavioral variations between OpenAI-compatible providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderFlavor {
    Openai,
    Openrouter,
    Zai,
    Lmstudio,
    Custom,
    #[default]
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    #[serde(default)]
    pub flavor: ProviderFlavor,
    #[serde(default)]
    pub base_url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub requires_key: bool,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default = "default_true")]
    pub supports_tools: bool,
}

impl ProviderConfig {
    pub fn builtin(id: &str) -> Option<Self> {
        let cfg = match id {
            "openrouter" => Self {
                id: "openrouter".into(),
                name: "OpenRouter".into(),
                kind: ProviderKind::OpenaiCompat,
                flavor: ProviderFlavor::Openrouter,
                base_url: "https://openrouter.ai/api/v1".into(),
                enabled: true,
                requires_key: true,
                is_local: false,
                supports_tools: true,
            },
            "zai" => Self {
                id: "zai".into(),
                name: "Z.ai".into(),
                kind: ProviderKind::OpenaiCompat,
                flavor: ProviderFlavor::Zai,
                base_url: "https://api.z.ai/api/paas/v4".into(),
                enabled: true,
                requires_key: true,
                is_local: false,
                supports_tools: true,
            },
            "openai" => Self {
                id: "openai".into(),
                name: "OpenAI".into(),
                kind: ProviderKind::OpenaiCompat,
                flavor: ProviderFlavor::Openai,
                base_url: "https://api.openai.com/v1".into(),
                enabled: true,
                requires_key: true,
                is_local: false,
                supports_tools: true,
            },
            "anthropic" => Self {
                id: "anthropic".into(),
                name: "Anthropic".into(),
                kind: ProviderKind::Anthropic,
                flavor: ProviderFlavor::None,
                base_url: "https://api.anthropic.com".into(),
                enabled: true,
                requires_key: true,
                is_local: false,
                supports_tools: true,
            },
            "google" => Self {
                id: "google".into(),
                name: "Google Gemini".into(),
                kind: ProviderKind::Google,
                flavor: ProviderFlavor::None,
                base_url: "https://generativelanguage.googleapis.com/v1beta".into(),
                enabled: true,
                requires_key: true,
                is_local: false,
                supports_tools: true,
            },
            "ollama" => Self {
                id: "ollama".into(),
                name: "Ollama".into(),
                kind: ProviderKind::Ollama,
                flavor: ProviderFlavor::None,
                base_url: "http://localhost:11434".into(),
                enabled: true,
                requires_key: false,
                is_local: true,
                supports_tools: true,
            },
            "lmstudio" => Self {
                id: "lmstudio".into(),
                name: "LM Studio".into(),
                kind: ProviderKind::OpenaiCompat,
                flavor: ProviderFlavor::Lmstudio,
                base_url: "http://localhost:1234/v1".into(),
                enabled: true,
                requires_key: false,
                is_local: true,
                supports_tools: true,
            },
            _ => return None,
        };
        Some(cfg)
    }

    pub fn builtin_defaults() -> Vec<Self> {
        [
            "openrouter",
            "zai",
            "openai",
            "anthropic",
            "google",
            "ollama",
            "lmstudio",
        ]
        .iter()
        .filter_map(|id| Self::builtin(id))
        .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    /// Fully qualified id: "provider/model-id"
    pub full_id: String,
    pub provider: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub context_window: u64,
    #[serde(default)]
    pub input_price_per_m: f64,
    #[serde(default)]
    pub output_price_per_m: f64,
    #[serde(default)]
    pub free: bool,
    #[serde(default)]
    pub local: bool,
    #[serde(default)]
    pub coding: bool,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default)]
    pub vision: bool,
    #[serde(default = "default_true")]
    pub tools: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    /// "catalog" (seed registry) or "discovered" (live provider list)
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "catalog".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatusInfo {
    pub id: String,
    pub status: String, // connected | invalid_credentials | not_configured | offline | error
    pub detail: String,
    #[serde(default)]
    pub key_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishInfo {
    pub finish_reason: String,
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    /// Characters of streamed output, used to estimate tokens when the
    /// provider does not report usage.
    #[serde(default)]
    pub output_chars: u64,
}

/// Rough token estimate used when a provider does not report usage.
pub fn estimate_tokens(text: &str) -> u64 {
    (text.chars().count() as u64).div_ceil(4) + MESSAGE_OVERHEAD_TOKENS
}
