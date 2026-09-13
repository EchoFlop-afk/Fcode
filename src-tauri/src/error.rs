use serde::Serialize;
use std::fmt;

/// Application error type. Serialized to the frontend as a structured object
/// so the UI can render understandable, actionable errors.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    /// One of: invalid_api_key, rate_limit, insufficient_credits,
    /// model_unavailable, context_limit, timeout, network, provider_error,
    /// bad_request, quota_exhausted, not_configured, cancelled,
    /// permission_denied, storage, internal
    pub category: String,
    pub message: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub status: Option<u16>,
    pub retriable: bool,
}

impl AppError {
    pub fn new(code: &str, category: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            category: category.to_string(),
            message: message.into(),
            provider: None,
            model: None,
            status: None,
            retriable: false,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal", "internal", message)
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new("bad_request", "bad_request", message)
    }

    pub fn not_configured(message: impl Into<String>) -> Self {
        Self::new("not_configured", "not_configured", message)
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self::new("storage", "storage", message)
    }

    pub fn with_context(mut self, provider: Option<String>, model: Option<String>) -> Self {
        self.provider = provider;
        self.model = model;
        self
    }

    pub fn retriable(mut self) -> Self {
        self.retriable = true;
        self
    }

    pub fn status(mut self, status: u16) -> Self {
        self.status = Some(status);
        self
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            return AppError::new("timeout", "timeout", "The request timed out.").retriable();
        }
        if e.is_connect() {
            return AppError::new("network", "network", format!("Connection failed: {e}"))
                .retriable();
        }
        if e.is_body() || e.is_decode() {
            return AppError::new("provider_error", "provider_error", format!("Invalid response from provider: {e}")).retriable();
        }
        AppError::new("network", "network", format!("Network error: {e}")).retriable()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::storage(format!("File system error: {e}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::bad_request(format!("Data error: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
