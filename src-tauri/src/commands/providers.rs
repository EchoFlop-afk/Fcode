use crate::error::AppError;
use crate::state::AppState;
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderKeyStatus {
    pub provider_id: String,
    pub key_present: bool,
    pub masked: Option<String>,
}

#[tauri::command]
pub fn provider_key_status(_app: AppHandle, provider_id: String) -> ProviderKeyStatus {
    let key = crate::secrets::get_key(&provider_id).ok().flatten();
    ProviderKeyStatus {
        provider_id: provider_id.clone(),
        key_present: key.is_some(),
        masked: key.as_deref().map(crate::secrets::mask_key),
    }
}

/// Stores an API key in the OS credential store. The key never enters
/// settings.json, logs, or the conversation store.
#[tauri::command]
pub fn provider_set_key(app: AppHandle, provider_id: String, key: String) -> Result<(), AppError> {
    if key.trim().is_empty() {
        return Err(AppError::bad_request("API key must not be empty"));
    }
    crate::secrets::set_key(&provider_id, key.trim())?;
    let _ = app;
    Ok(())
}

#[tauri::command]
pub fn provider_delete_key(provider_id: String) -> Result<(), AppError> {
    crate::secrets::delete_key(&provider_id)
}

/// Adds a custom OpenAI-compatible provider.
#[tauri::command]
pub fn provider_add_custom(
    app: AppHandle,
    name: String,
    base_url: String,
) -> Result<crate::models::ProviderConfig, AppError> {
    if name.trim().is_empty() || base_url.trim().is_empty() {
        return Err(AppError::bad_request("Name and base URL are required"));
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err(AppError::bad_request("Base URL must start with http:// or https://"));
    }
    let id = format!(
        "custom-{}",
        name.trim().to_lowercase().replace(' ', "-")
    );
    let state = app.state::<AppState>();
    {
        let settings = state.settings.read().unwrap();
        if settings.provider(&id).is_some() {
            return Err(AppError::bad_request(format!(
                "A provider named '{name}' already exists"
            )));
        }
    }
    let cfg = {
        let mut settings = state.settings.write().unwrap();
        settings.add_custom_provider(id, name.trim().to_string(), base_url.trim().trim_end_matches('/').to_string());
        settings.providers.last().unwrap().clone()
    };
    state.save_settings().map_err(AppError::internal)?;
    Ok(cfg)
}

#[tauri::command]
pub fn provider_remove(app: AppHandle, provider_id: String) -> Result<(), AppError> {
    if crate::models::ProviderConfig::builtin(&provider_id).is_some() {
        return Err(AppError::bad_request("Built-in providers cannot be removed; disable them instead"));
    }
    let state = app.state::<AppState>();
    {
        let mut settings = state.settings.write().unwrap();
        settings.providers.retain(|p| p.id != provider_id);
    }
    state.save_settings().map_err(AppError::internal)?;
    crate::secrets::delete_key(&provider_id)?;
    Ok(())
}
