use crate::error::AppResult;
use crate::store::{read_json, write_json_atomic};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// A generic, legitimate promotional/free-quota entitlement.
///
/// These are definitions owned by *this application* (or its user) — e.g. a
/// gateway the app owner operates, or trial allowances they are authorized to
/// grant. Fcode never reads, reuses, or bypasses another product's private
/// credit systems.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Promotion {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Provider id this promotion applies to (e.g. "openrouter", "custom-gateway")
    pub provider: String,
    /// Model full-ids ("provider/model") the promotion covers. Empty = all models of the provider.
    pub models: Vec<String>,
    pub token_budget: u64,
    /// RFC 3339 timestamps
    pub starts_at: String,
    pub ends_at: String,
    /// Optional recurring reset: "daily" | "weekly" | null
    pub reset: Option<String>,
    pub enabled: bool,
}

impl Default for Promotion {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            provider: String::new(),
            models: vec![],
            token_budget: 0,
            starts_at: Utc::now().to_rfc3339(),
            ends_at: Utc::now().to_rfc3339(),
            reset: None,
            enabled: false,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PromotionsStore {
    pub promotions: Vec<Promotion>,
    /// tokens consumed per promotion id
    pub consumed: HashMap<String, u64>,
}

impl PromotionsStore {
    fn parse(ts: &str) -> Option<DateTime<Utc>> {
        DateTime::parse_from_rfc3339(ts)
            .ok()
            .map(|d| d.with_timezone(&Utc))
    }

    pub fn active_for(&self, provider: &str, model_full_id: &str, now: DateTime<Utc>) -> Option<&Promotion> {
        self.promotions.iter().find(|p| {
            if !p.enabled || p.provider != provider {
                return false;
            }
            if !p.models.is_empty() && !p.models.iter().any(|m| m == model_full_id) {
                return false;
            }
            let starts = Self::parse(&p.starts_at);
            let ends = Self::parse(&p.ends_at);
            let in_window = match (starts, ends) {
                (Some(s), Some(e)) => now >= s && now <= e,
                (Some(s), None) => now >= s,
                (None, Some(e)) => now <= e,
                (None, None) => true,
            };
            in_window && self.remaining(p) > 0
        })
    }

    pub fn remaining(&self, promo: &Promotion) -> u64 {
        self.consumed
            .get(&promo.id)
            .copied()
            .map(|used| promo.token_budget.saturating_sub(used))
            .unwrap_or(promo.token_budget)
    }

    pub fn record(&mut self, promo_id: &str, tokens: u64) {
        *self.consumed.entry(promo_id.to_string()).or_insert(0) += tokens;
    }
}

/// Status view for the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromotionStatus {
    pub promotion: Promotion,
    pub used: u64,
    pub remaining: u64,
    pub expired: bool,
    pub not_started: bool,
}

impl PromotionsStore {
    pub fn statuses(&self) -> Vec<PromotionStatus> {
        let now = Utc::now();
        self.promotions
            .iter()
            .map(|p| {
                let expired = Self::parse(&p.ends_at)
                    .map(|e| now > e)
                    .unwrap_or(false);
                let not_started = Self::parse(&p.starts_at)
                    .map(|s| now < s)
                    .unwrap_or(false);
                PromotionStatus {
                    promotion: p.clone(),
                    used: self.consumed.get(&p.id).copied().unwrap_or(0),
                    remaining: self.remaining(p),
                    expired,
                    not_started,
                }
            })
            .collect()
    }
}

pub fn load_or_default(path: PathBuf) -> PromotionsStore {
    if !path.exists() {
        // Seed an example (disabled) promotion documenting the schema.
        let seed = PromotionsStore {
            promotions: vec![Promotion {
                id: "example-weekend-build".into(),
                name: "Weekend Build".into(),
                description: "Example promotional entitlement. Edit promotions.json to create your own - this sample is disabled and grants nothing until enabled and pointed at a provider you operate or are authorized to use.".into(),
                provider: "openrouter".into(),
                models: vec![],
                token_budget: 300_000_000,
                starts_at: "2026-01-02T00:00:00Z".into(),
                ends_at: "2026-01-04T18:00:00Z".into(),
                reset: None,
                enabled: false,
            }],
            consumed: HashMap::new(),
        };
        let _ = write_json_atomic(&path, &seed);
        return seed;
    }
    read_json(&path).ok().flatten().unwrap_or_default()
}

pub fn save(path: &PathBuf, store: &PromotionsStore) -> AppResult<()> {
    write_json_atomic(path, store)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn promo(id: &str, start: &str, end: &str, budget: u64) -> Promotion {
        Promotion {
            id: id.into(),
            name: id.into(),
            provider: "openrouter".into(),
            models: vec!["openrouter/test-model:free".into()],
            token_budget: budget,
            starts_at: start.into(),
            ends_at: end.into(),
            enabled: true,
            ..Default::default()
        }
    }

    #[test]
    fn window_and_quota() {
        let store = PromotionsStore {
            promotions: vec![promo(
                "p1",
                "2026-01-01T00:00:00Z",
                "2026-12-31T00:00:00Z",
                1000,
            )],
            consumed: [("p1".to_string(), 900)].into_iter().collect(),
        };
        let now = Utc::now();
        // Remaining budget
        assert_eq!(
            store.remaining(&store.promotions[0]),
            100
        );
        assert!(store.active_for("openrouter", "openrouter/test-model:free", now).is_some());
        // Wrong model
        assert!(store.active_for("openrouter", "openrouter/other", now).is_none());
        // Wrong provider
        assert!(store.active_for("openai", "openrouter/test-model:free", now).is_none());
    }

    #[test]
    fn expired_promotion_inactive() {
        let store = PromotionsStore {
            promotions: vec![promo("p2", "2020-01-01T00:00:00Z", "2020-02-01T00:00:00Z", 1000)],
            consumed: Default::default(),
        };
        assert!(store
            .active_for("openrouter", "openrouter/test-model:free", Utc::now())
            .is_none());
    }

    #[test]
    fn exhausted_promotion_inactive() {
        let store = PromotionsStore {
            promotions: vec![promo(
                "p3",
                "2020-01-01T00:00:00Z",
                "2099-01-01T00:00:00Z",
                100,
            )],
            consumed: [("p3".to_string(), 150)].into_iter().collect(),
        };
        assert!(store
            .active_for("openrouter", "openrouter/test-model:free", Utc::now())
            .is_none());
    }
}
