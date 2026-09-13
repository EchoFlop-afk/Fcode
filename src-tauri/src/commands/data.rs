use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::store::conversations::Conversation;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Export bundle: settings (never includes API keys), conversations,
/// promotions and usage data.
#[derive(Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ExportBundle {
    pub version: u32,
    pub exported_at: String,
    pub settings: crate::store::settings::Settings,
    pub conversations: Vec<Conversation>,
    pub promotions: crate::store::promotions::PromotionsStore,
    pub usage: crate::store::usage::UsageStore,
}

impl Default for ExportBundle {
    fn default() -> Self {
        Self {
            version: 1,
            exported_at: String::new(),
            settings: Default::default(),
            conversations: vec![],
            promotions: Default::default(),
            usage: Default::default(),
        }
    }
}

#[tauri::command]
pub fn export_data(app: AppHandle, path: String) -> Result<usize, AppError> {
    let state = app.state::<AppState>();
    let bundle = collect_bundle(&state)?;
    let json = serde_json::to_vec_pretty(&bundle)?;
    std::fs::write(&path, json)
        .map_err(|e| AppError::storage(format!("Export failed: {e}")))?;
    Ok(bundle.conversations.len())
}

fn collect_bundle(state: &AppState) -> AppResult<ExportBundle> {
    let settings = state.settings.read().unwrap().clone();
    let mut conversations = Vec::new();
    for meta in state.conversations.load_index() {
        if let Some(conv) = state.conversations.load(&meta.id)? {
            conversations.push(conv);
        }
    }
    Ok(ExportBundle {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        settings,
        conversations,
        promotions: state.promotions.lock().unwrap().clone(),
        usage: state.usage.lock().unwrap().clone(),
    })
}

/// Imports an export bundle. Conversations are added by id (duplicates are
/// overwritten); settings are replaced.
#[tauri::command]
pub fn import_data(app: AppHandle, path: String) -> Result<usize, AppError> {
    let text = std::fs::read_to_string(&path)
        .map_err(|e| AppError::storage(format!("Import failed: {e}")))?;
    let bundle: ExportBundle =
        serde_json::from_str(&text).map_err(|e| AppError::bad_request(format!("Invalid export file: {e}")))?;

    let state = app.state::<AppState>();
    {
        // Replace settings; keep provider secrets untouched (they are keyed
        // by provider id in the credential store).
        *state.settings.write().unwrap() = bundle.settings.clone();
        state.save_settings().map_err(AppError::internal)?;
    }
    for conv in &bundle.conversations {
        state.conversations.save(conv)?;
    }
    {
        let mut promos = state.promotions.lock().unwrap();
        for p in &bundle.promotions.promotions {
            if !promos.promotions.iter().any(|x| x.id == p.id) {
                promos.promotions.push(p.clone());
            }
        }
        for (k, v) in &bundle.promotions.consumed {
            promos.consumed.insert(k.clone(), *v);
        }
        drop(promos);
        state.save_promotions();
    }
    {
        let mut usage = state.usage.lock().unwrap();
        for (k, v) in &bundle.usage.days {
            usage.days.insert(k.clone(), v.clone());
        }
        drop(usage);
        state.save_usage();
    }
    Ok(bundle.conversations.len())
}
