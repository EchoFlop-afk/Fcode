pub mod anthropic;
pub mod google;
pub mod ollama;
pub mod openai_compat;
pub mod sse;

use crate::error::{AppError, AppResult};
use crate::models::{
    ChatRequest, FinishInfo, ModelInfo, ProviderConfig, ProviderKind, ProviderStatusInfo,
    StreamEvent,
};
use async_trait::async_trait;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::ipc::Channel;

/// Common interface every provider transport implements.
///
/// Adapters only emit content events (Delta / Reasoning / ToolCall*);
/// `run_chat` owns Usage + Done emission so usage accounting stays in
/// one place.
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    async fn stream_chat(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
        req: &ChatRequest,
        events: &Channel<StreamEvent>,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<FinishInfo>;

    async fn list_models(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
    ) -> AppResult<Vec<ModelInfo>>;

    async fn validate(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
    ) -> AppResult<ProviderStatusInfo>;
}

pub fn adapter_for(kind: ProviderKind) -> &'static dyn ProviderAdapter {
    match kind {
        ProviderKind::OpenaiCompat => &openai_compat::OpenAiCompatAdapter,
        ProviderKind::Anthropic => &anthropic::AnthropicAdapter,
        ProviderKind::Google => &google::GoogleAdapter,
        ProviderKind::Ollama => &ollama::OllamaAdapter,
    }
}

/// Classifies an HTTP error response from a provider into an AppError.
pub fn provider_http_error(
    provider: &str,
    model: Option<String>,
    status: u16,
    body: &str,
) -> AppError {
    let message = extract_provider_message(body)
        .unwrap_or_else(|| body.chars().take(300).collect());
    let code = match status {
        400 => "bad_request",
        401 | 403 => "invalid_api_key",
        402 => "insufficient_credits",
        404 => "model_unavailable",
        408 => "timeout",
        413 => "context_limit",
        429 => "rate_limit",
        500..=599 => "provider_error",
        _ => "provider_error",
    };
    let category = match status {
        401 | 403 => {
            if message.to_lowercase().contains("quota") {
                "rate_limit"
            } else {
                "invalid_api_key"
            }
        }
        402 => "insufficient_credits",
        404 => {
            if message.to_lowercase().contains("model") || model.is_some() {
                "model_unavailable"
            } else {
                "provider_error"
            }
        }
        408 => "timeout",
        413 => "context_limit",
        429 => "rate_limit",
        500..=599 => "provider_error",
        _ => "provider_error",
    };
    let retriable = matches!(category, "rate_limit" | "provider_error" | "timeout");
    AppError::new(code, category, message)
        .status(status)
        .with_context(Some(provider.to_string()), model)
        .when(retriable, |e| e.retriable())
}

trait When: Sized {
    fn when(self, cond: bool, f: impl FnOnce(Self) -> Self) -> Self {
        if cond {
            f(self)
        } else {
            self
        }
    }
}
impl When for AppError {}

fn extract_provider_message(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let message = v["error"]["message"]
        .as_str()
        .or_else(|| v["error"].as_str())
        .or_else(|| v["message"].as_str())
        .or_else(|| v["detail"].as_str());
    message.map(|s| s.to_string())
}

pub async fn read_error_body(response: reqwest::Response) -> String {
    match response.text().await {
        Ok(t) => t.chars().take(2000).collect(),
        Err(_) => String::new(),
    }
}
