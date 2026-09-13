use crate::error::AppResult;
use crate::store::{read_json, write_json_atomic};
use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ModelUsage {
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProviderUsage {
    pub models: HashMap<String, ModelUsage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DayUsage {
    pub providers: HashMap<String, ProviderUsage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UsageStore {
    pub days: HashMap<String, DayUsage>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub by_provider: Vec<ProviderSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSummary {
    pub provider: String,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub models: Vec<ModelSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub model: String,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl UsageStore {
    pub fn today() -> String {
        Utc::now().format("%Y-%m-%d").to_string()
    }

    pub fn record(&mut self, provider: &str, model: &str, input_tokens: u64, output_tokens: u64) {
        let day = self.days.entry(Self::today()).or_default();
        let prov = day.providers.entry(provider.to_string()).or_default();
        let m = prov.models.entry(model.to_string()).or_default();
        m.requests += 1;
        m.input_tokens += input_tokens;
        m.output_tokens += output_tokens;
    }

    fn summary_for(&self, keys: &[String]) -> UsageSummary {
        let mut summary = UsageSummary::default();
        let mut providers: HashMap<String, ProviderSummary> = HashMap::new();
        for key in keys {
            if let Some(day) = self.days.get(key) {
                for (provider_id, prov) in &day.providers {
                    let ps = providers.entry(provider_id.clone()).or_insert_with(|| {
                        ProviderSummary {
                            provider: provider_id.clone(),
                            requests: 0,
                            input_tokens: 0,
                            output_tokens: 0,
                            models: vec![],
                        }
                    });
                    for (model, mu) in &prov.models {
                        summary.requests += mu.requests;
                        summary.input_tokens += mu.input_tokens;
                        summary.output_tokens += mu.output_tokens;
                        ps.requests += mu.requests;
                        ps.input_tokens += mu.input_tokens;
                        ps.output_tokens += mu.output_tokens;
                        if let Some(ms) = ps.models.iter_mut().find(|m| m.model == *model) {
                            ms.requests += mu.requests;
                            ms.input_tokens += mu.input_tokens;
                            ms.output_tokens += mu.output_tokens;
                        } else {
                            ps.models.push(ModelSummary {
                                model: model.clone(),
                                requests: mu.requests,
                                input_tokens: mu.input_tokens,
                                output_tokens: mu.output_tokens,
                            });
                        }
                    }
                }
            }
        }
        let mut list: Vec<ProviderSummary> = providers.into_values().collect();
        for p in &mut list {
            p.models.sort_by(|a, b| b.requests.cmp(&a.requests));
        }
        list.sort_by(|a, b| b.requests.cmp(&a.requests));
        summary.by_provider = list;
        summary
    }

    pub fn today_summary(&self) -> UsageSummary {
        self.summary_for(&[Self::today()])
    }

    pub fn month_summary(&self) -> UsageSummary {
        let now = Utc::now();
        let prefix = format!("{:04}-{:02}", now.year(), now.month());
        let keys: Vec<String> = self
            .days
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        self.summary_for(&keys)
    }

    /// Removes entries older than `retention_days`.
    pub fn prune(&mut self, retention_days: u32) {
        if retention_days == 0 {
            return;
        }
        let cutoff = Utc::now() - chrono::Duration::days(retention_days as i64);
        let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
        self.days.retain(|k, _| k.as_str() >= cutoff_str.as_str());
    }
}

pub fn load_or_default(path: PathBuf) -> UsageStore {
    read_json(&path).ok().flatten().unwrap_or_default()
}

pub fn save(path: &PathBuf, store: &UsageStore) -> AppResult<()> {
    write_json_atomic(path, store)
}
