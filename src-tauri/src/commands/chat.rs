use crate::error::{AppError};
use crate::models::{ChatRequest, FinishInfo, StreamEvent};
use crate::providers::adapter_for;
use crate::state::AppState;
use std::time::Instant;
use tauri::{AppHandle, Manager};
use tauri::ipc::Channel;

/// Streams a chat completion through the resolved provider adapter.
/// Returns a stream handle usable with `cancel_stream`.
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    request: ChatRequest,
    on_event: Channel<StreamEvent>,
) -> Result<u64, AppError> {
    let state = app.state::<AppState>();
    let provider_id = request.provider_id.clone();
    let model = request.model.clone();

    let cfg = {
        let settings = state.settings.read().unwrap();
        settings.provider(&provider_id).cloned().ok_or_else(|| {
            AppError::not_configured(format!("Provider '{provider_id}' is not configured"))
                .with_context(Some(provider_id.clone()), Some(model.clone()))
        })?
    };
    if !cfg.enabled {
        return Err(AppError::not_configured(format!(
            "Provider '{provider_id}' is disabled. Enable it in Settings → Providers."
        ))
        .with_context(Some(provider_id.clone()), Some(model.clone())));
    }
    let key = if cfg.requires_key {
        Some(
            crate::secrets::get_key(&provider_id)?.ok_or_else(|| {
                AppError::not_configured(format!(
                    "No API key configured for {provider_id}. Add one in Settings → Providers."
                ))
                .with_context(Some(provider_id.clone()), Some(model.clone()))
            })?,
        )
    } else {
        None
    };

    // Quota enforcement for active promotions. Runs in the Rust backend -
    // frontend quota values are never trusted.
    {
        let promos = state.promotions.lock().unwrap();
        let now = chrono::Utc::now();
        let model_full = format!("{provider_id}/{model}");
        if let Some(promo) = promos.active_for(&provider_id, &model_full, now) {
            let name = promo.name.clone();
            let remaining = promos.remaining(promo);
            if remaining == 0 {
                drop(promos);
                return Err(AppError::new(
                    "quota_exhausted",
                    "quota_exhausted",
                    format!("Promotion '{name}' has no remaining token budget."),
                )
                .with_context(Some(provider_id.clone()), Some(model.clone())));
            }
        }
    }

    let http = state.http.clone();
    let app_handle = app.clone();
    let events = on_event.clone();
    let (stream_id, cancel) = state.register_stream();

    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let adapter = adapter_for(cfg.kind);
        let result = adapter
            .stream_chat(&http, &cfg, key.as_deref(), &request, &events, cancel)
            .await;

        match result {
            Ok(finish) => {
                let (input, output, estimated) =
                    record_usage(&app_handle, &cfg.id, &request.model, &finish, &request);
                let _ = events.send(StreamEvent::Usage {
                    input_tokens: input,
                    output_tokens: output,
                });
                let _ = estimated;
                let _ = events.send(StreamEvent::Done {
                    finish_reason: finish.finish_reason,
                });
            }
            Err(err) => {
                let _ = events.send(StreamEvent::Error {
                    code: err.code.clone(),
                    category: err.category.clone(),
                    message: err.message.clone(),
                    status: err.status,
                    retriable: err.retriable,
                });
                log_error(&err, started.elapsed().as_millis() as u64);
            }
        }
        app_handle.state::<AppState>().unregister_stream(stream_id);
    });

    Ok(stream_id)
}

fn record_usage(
    app: &AppHandle,
    provider: &str,
    model: &str,
    finish: &FinishInfo,
    req: &ChatRequest,
) -> (u64, u64, bool) {
    let state = app.state::<AppState>();
    let input_chars: usize = req.messages.iter().map(|m| m.content.len()).sum();
    let input = finish
        .input_tokens
        .unwrap_or_else(|| (input_chars as u64).div_ceil(4));
    let output = finish
        .output_tokens
        .unwrap_or_else(|| finish.output_chars.div_ceil(4));
    let estimated = finish.input_tokens.is_none() || finish.output_tokens.is_none();

    state.usage.lock().unwrap().record(provider, model, input, output);
    state.save_usage();

    // Charge any active promotion for this model.
    let mut promos = state.promotions.lock().unwrap();
    let now = chrono::Utc::now();
    let model_full = format!("{provider}/{model}");
    if let Some(promo) = promos.active_for(provider, &model_full, now) {
        let promo_id = promo.id.clone();
        promos.record(&promo_id, input + output);
        drop(promos);
        state.save_promotions();
    }
    (input, output, estimated)
}

fn log_error(err: &AppError, duration_ms: u64) {
    // Never log secrets: provider/model/category only.
    eprintln!(
        "[fcode] provider={:?} model={:?} category={} code={} duration_ms={}",
        err.provider, err.model, err.category, err.code, duration_ms
    );
}

/// Cancels an active stream by handle.
#[tauri::command]
pub fn cancel_stream(app: AppHandle, stream_id: u64) -> Result<(), AppError> {
    app.state::<AppState>().cancel_stream(stream_id);
    Ok(())
}

#[tauri::command]
pub fn estimate_tokens_cmd(text: String) -> u64 {
    crate::models::estimate_tokens(&text)
}

/// Validates a provider connection.
#[tauri::command]
pub async fn provider_validate(
    app: AppHandle,
    provider_id: String,
) -> Result<crate::models::ProviderStatusInfo, AppError> {
    let state = app.state::<AppState>();
    let cfg = state
        .settings
        .read()
        .unwrap()
        .provider(&provider_id)
        .cloned()
        .ok_or_else(|| AppError::not_configured(format!("Unknown provider '{provider_id}'")))?;
    let key = if cfg.requires_key {
        crate::secrets::get_key(&provider_id)?
    } else {
        None
    };
    let adapter = adapter_for(cfg.kind);
    adapter.validate(&state.http, &cfg, key.as_deref()).await
}

/// Lists models available from a provider (live discovery).
#[tauri::command]
pub async fn provider_models(
    app: AppHandle,
    provider_id: String,
) -> Result<Vec<crate::models::ModelInfo>, AppError> {
    let state = app.state::<AppState>();
    let cfg = state
        .settings
        .read()
        .unwrap()
        .provider(&provider_id)
        .cloned()
        .ok_or_else(|| AppError::not_configured(format!("Unknown provider '{provider_id}'")))?;
    let key = if cfg.requires_key {
        crate::secrets::get_key(&provider_id)?
    } else {
        None
    };
    let adapter = adapter_for(cfg.kind);
    adapter.list_models(&state.http, &cfg, key.as_deref()).await
}
