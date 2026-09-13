use crate::error::AppError;
use crate::state::AppState;
use crate::store::promotions::{Promotion, PromotionsStore};
use crate::store::usage::{UsageSummary, UsageStore};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub today: UsageSummary,
    pub month: UsageSummary,
}

#[tauri::command]
pub fn usage_get(app: AppHandle) -> UsageSnapshot {
    let state = app.state::<AppState>();
    let usage = state.usage.lock().unwrap();
    UsageSnapshot {
        today: usage.today_summary(),
        month: usage.month_summary(),
    }
}

#[tauri::command]
pub fn usage_reset(app: AppHandle) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    *state.usage.lock().unwrap() = UsageStore::default();
    state.save_usage();
    Ok(())
}

#[tauri::command]
pub fn promotions_list(app: AppHandle) -> Vec<crate::store::promotions::PromotionStatus> {
    app.state::<AppState>().promotions.lock().unwrap().statuses()
}

/// Persists promotion definitions (app-owner / power-user managed).
#[tauri::command]
pub fn promotions_save(app: AppHandle, promotions: Vec<Promotion>) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    {
        let mut store = state.promotions.lock().unwrap();
        *store = PromotionsStore {
            promotions,
            consumed: store.consumed.clone(),
        };
    }
    state.save_promotions();
    Ok(())
}

/// Pre-flight quota check used by the UI before sending.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaCheck {
    pub allowed: bool,
    pub promotion: Option<String>,
    pub remaining: Option<u64>,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn quota_check(app: AppHandle, provider_id: String, model: String) -> QuotaCheck {
    let state = app.state::<AppState>();
    let promos = state.promotions.lock().unwrap();
    let model_full = format!("{provider_id}/{model}");
    let now = chrono::Utc::now();
    match promos.active_for(&provider_id, &model_full, now) {
        Some(p) => {
            let remaining = promos.remaining(p);
            if remaining > 0 {
                QuotaCheck {
                    allowed: true,
                    promotion: Some(p.name.clone()),
                    remaining: Some(remaining),
                    reason: None,
                }
            } else {
                QuotaCheck {
                    allowed: false,
                    promotion: Some(p.name.clone()),
                    remaining: Some(0),
                    reason: Some(format!("Promotion '{}' is exhausted", p.name)),
                }
            }
        }
        None => QuotaCheck {
            allowed: true,
            promotion: None,
            remaining: None,
            reason: None,
        },
    }
}
