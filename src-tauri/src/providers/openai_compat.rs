use super::sse::{parse_sse_json, sse_data, LineDecoder};
use super::{provider_http_error, ProviderAdapter};
use crate::error::{AppError, AppResult};
use crate::models::{
    ChatRequest, FinishInfo, ModelInfo, ProviderConfig, ProviderFlavor, ProviderStatusInfo,
    Role, StreamEvent,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

pub struct OpenAiCompatAdapter;

fn chat_url(cfg: &ProviderConfig) -> String {
    let base = cfg.base_url.trim_end_matches('/');
    format!("{base}/chat/completions")
}

fn models_url(cfg: &ProviderConfig) -> String {
    let base = cfg.base_url.trim_end_matches('/');
    format!("{base}/models")
}

fn headers(cfg: &ProviderConfig, key: Option<&str>) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert("Content-Type", HeaderValue::from_static("application/json"));
    if let Some(k) = key {
        if let Ok(v) = HeaderValue::from_str(&format!("Bearer {k}")) {
            h.insert(AUTHORIZATION, v);
        }
    }
    match cfg.flavor {
        ProviderFlavor::Openrouter => {
            h.insert("X-Title", HeaderValue::from_static("Fcode"));
        }
        _ => {}
    }
    h
}

fn build_body(cfg: &ProviderConfig, req: &ChatRequest) -> Value {
    let mut messages = Vec::new();
    for m in &req.messages {
        let mut obj = json!({ "role": serde_json::to_value(m.role).unwrap() });
        match m.role {
            Role::Tool => {
                obj["content"] = Value::String(m.content.clone());
                if let Some(id) = &m.tool_call_id {
                    obj["tool_call_id"] = Value::String(id.clone());
                }
            }
            Role::Assistant => {
                obj["content"] = if m.content.is_empty() {
                    Value::Null
                } else {
                    Value::String(m.content.clone())
                };
                if !m.tool_calls.is_empty() {
                    let tcs: Vec<Value> = m
                        .tool_calls
                        .iter()
                        .map(|tc| {
                            let args = if tc.arguments.trim().is_empty() {
                                "{}".to_string()
                            } else {
                                tc.arguments.clone()
                            };
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": { "name": tc.name, "arguments": args }
                            })
                        })
                        .collect();
                    obj["tool_calls"] = Value::Array(tcs);
                }
            }
            _ => {
                obj["content"] = Value::String(m.content.clone());
            }
        }
        messages.push(obj);
    }

    let mut body = json!({
        "model": req.model,
        "messages": messages,
        "stream": true,
    });
    if !req.tools.is_empty() {
        body["tools"] = Value::Array(
            req.tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        }
                    })
                })
                .collect(),
        );
        body["tool_choice"] = json!("auto");
    }
    if let Some(t) = req.temperature {
        body["temperature"] = json!(t);
    }
    if let Some(mt) = req.max_tokens {
        body["max_tokens"] = json!(mt);
    }
    // Usage reporting: only request from providers known to support it.
    if cfg.flavor == ProviderFlavor::Openai || cfg.flavor == ProviderFlavor::Openrouter {
        body["stream_options"] = json!({ "include_usage": true });
    }
    body
}

fn map_finish_reason(reason: &str) -> String {
    match reason {
        "stop" => "stop",
        "length" | "max_tokens" => "length",
        "tool_calls" | "function_call" => "tool_calls",
        "content_filter" => "content_filter",
        _ => reason,
    }
    .to_string()
}

#[async_trait]
impl ProviderAdapter for OpenAiCompatAdapter {
    async fn stream_chat(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
        req: &ChatRequest,
        events: &Channel<StreamEvent>,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<FinishInfo> {
        let body = build_body(cfg, req);
        let response = client
            .post(chat_url(cfg))
            .headers(headers(cfg, key))
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let err_body = super::read_error_body(response).await;
            return Err(provider_http_error(
                &cfg.id,
                Some(req.model.clone()),
                status.as_u16(),
                &err_body,
            ));
        }

        let mut stream = response.bytes_stream();
        let mut decoder = LineDecoder::new();
        // index -> (id, name); args accumulated per index
        let mut tool_meta: HashMap<u32, (String, String)> = HashMap::new();
        let mut finish_reason: Option<String> = None;
        let mut usage: Option<(u64, u64)> = None;
        let mut output_chars: u64 = 0;

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                return Ok(FinishInfo {
                    finish_reason: "cancelled".into(),
                    output_chars,
                    input_tokens: usage.map(|u| u.0),
                    output_tokens: usage.map(|u| u.1),
                });
            }
            let bytes = chunk.map_err(AppError::from)?;
            for line in decoder.push(&bytes) {
                if let Some(payload) = sse_data(&line) {
                    if let Some(v) = parse_sse_json(&payload)? {
                        if v.get("error").is_some() && v["choices"].is_null() {
                            let msg = v["error"]["message"]
                                .as_str()
                                .unwrap_or("Provider returned an error");
                            return Err(provider_http_error(
                                &cfg.id,
                                Some(req.model.clone()),
                                500,
                                msg,
                            ));
                        }
                        if let Some(u) = v.get("usage") {
                            if u.is_object() {
                                if let (Some(i), Some(o)) =
                                    (u["prompt_tokens"].as_u64(), u["completion_tokens"].as_u64())
                                {
                                    usage = Some((i, o));
                                }
                            }
                        }
                        if let Some(choices) = v["choices"].as_array() {
                            if let Some(choice) = choices.first() {
                                let delta = &choice["delta"];
                                if let Some(text) = delta["content"].as_str() {
                                    if !text.is_empty() {
                                        output_chars += text.chars().count() as u64;
                                        let _ = events.send(StreamEvent::Delta { content: text.to_string() });
                                    }
                                }
                                if let Some(text) = delta["reasoning_content"]
                                    .as_str()
                                    .or_else(|| delta["reasoning"].as_str())
                                {
                                    if !text.is_empty() {
                                        let _ = events.send(StreamEvent::Reasoning { content: text.to_string() });
                                    }
                                }
                                if let Some(tcs) = delta["tool_calls"].as_array() {
                                    for tc in tcs {
                                        let index = tc["index"].as_u64().unwrap_or(0) as u32;
                                        let id = tc["id"].as_str();
                                        let name = tc["function"]["name"].as_str();
                                        if id.is_some() || name.is_some() {
                                            let entry = tool_meta.entry(index).or_default();
                                            if let Some(id) = id {
                                                entry.0 = id.to_string();
                                            }
                                            if let Some(name) = name {
                                                entry.1 = name.to_string();
                                            }
                                            let _ = events.send(StreamEvent::ToolCallStart {
                                                index,
                                                id: entry.0.clone(),
                                                name: entry.1.clone(),
                                            });
                                        }
                                        if let Some(args) = tc["function"]["arguments"].as_str() {
                                            if !args.is_empty() {
                                                let _ = events.send(StreamEvent::ToolCallDelta {
                                                    index,
                                                    delta: args.to_string(),
                                                });
                                            }
                                        }
                                    }
                                }
                                if let Some(fr) = choice["finish_reason"].as_str() {
                                    finish_reason = Some(map_finish_reason(fr));
                                }
                            }
                        }
                    }
                }
            }
        }
        let _ = decoder.finish();

        Ok(FinishInfo {
            output_chars,
            finish_reason: finish_reason.unwrap_or_else(|| "stop".into()),
            input_tokens: usage.map(|u| u.0),
            output_tokens: usage.map(|u| u.1),
        })
    }

    async fn list_models(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
    ) -> AppResult<Vec<ModelInfo>> {
        let response = client
            .get(models_url(cfg))
            .headers(headers(cfg, key))
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            let body = super::read_error_body(response).await;
            return Err(provider_http_error(&cfg.id, None, status.as_u16(), &body));
        }
        let v: Value = response.json().await.map_err(AppError::from)?;
        let mut out = Vec::new();
        if let Some(arr) = v["data"].as_array() {
            for m in arr {
                let id = match m["id"].as_str() {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                let mut info = ModelInfo {
                    id: id.clone(),
                    full_id: format!("{}/{}", cfg.id, id),
                    provider: cfg.id.clone(),
                    name: m["name"].as_str().unwrap_or(&id).to_string(),
                    description: m["description"].as_str().unwrap_or("").to_string(),
                    ..ModelInfo::catalog_stub(&cfg.id, &id)
                };
                // OpenRouter-specific metadata
                if let Some(ctx) = m["context_length"].as_u64() {
                    info.context_window = ctx;
                }
                if let Some(pricing) = m.get("pricing") {
                    let pin = pricing["prompt"].as_str().and_then(|s| s.parse::<f64>().ok());
                    let pout = pricing["completion"]
                        .as_str()
                        .and_then(|s| s.parse::<f64>().ok());
                    if let (Some(pin), Some(pout)) = (pin, pout) {
                        info.input_price_per_m = pin * 1_000_000.0;
                        info.output_price_per_m = pout * 1_000_000.0;
                        info.free = pin == 0.0 && pout == 0.0;
                    }
                } else if cfg.flavor == ProviderFlavor::Lmstudio || cfg.is_local {
                    info.local = true;
                }
                if id.ends_with(":free") {
                    info.free = true;
                }
                info.apply_name_heuristics();
                out.push(info);
            }
        }
        Ok(out)
    }

    async fn validate(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
    ) -> AppResult<ProviderStatusInfo> {
        if cfg.requires_key && key.is_none() {
            return Ok(ProviderStatusInfo {
                id: cfg.id.clone(),
                status: "not_configured".into(),
                detail: "No API key configured".into(),
                key_present: false,
            });
        }
        let result = client
            .get(models_url(cfg))
            .headers(headers(cfg, key))
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await;
        match result {
            Ok(resp) => {
                let s = resp.status().as_u16();
                if s == 200 {
                    Ok(ProviderStatusInfo {
                        id: cfg.id.clone(),
                        status: "connected".into(),
                        detail: "Connection verified".into(),
                        key_present: key.is_some(),
                    })
                } else {
                    let body = super::read_error_body(resp).await;
                    let err = provider_http_error(&cfg.id, None, s, &body);
                    Ok(ProviderStatusInfo {
                        id: cfg.id.clone(),
                        status: match err.category.as_str() {
                            "invalid_api_key" => "invalid_credentials",
                            _ => "error",
                        }
                        .into(),
                        detail: err.message,
                        key_present: key.is_some(),
                    })
                }
            }
            Err(_) => Ok(ProviderStatusInfo {
                id: cfg.id.clone(),
                status: "offline".into(),
                detail: "Could not reach the provider endpoint".into(),
                key_present: key.is_some(),
            }),
        }
    }
}

impl ModelInfo {
    pub fn catalog_stub(provider: &str, id: &str) -> ModelInfo {
        ModelInfo {
            id: id.to_string(),
            full_id: format!("{provider}/{id}"),
            provider: provider.to_string(),
            name: id.to_string(),
            description: String::new(),
            context_window: 0,
            input_price_per_m: 0.0,
            output_price_per_m: 0.0,
            free: false,
            local: false,
            coding: false,
            reasoning: false,
            vision: false,
            tools: true,
            tags: vec![],
            source: "discovered".into(),
        }
    }

    /// Conservative capability inference from model naming when the provider
    /// does not expose structured capability data.
    pub fn apply_name_heuristics(&mut self) {
        let n = format!("{} {}", self.id, self.name).to_lowercase();
        if n.contains("coder") || n.contains("code") {
            self.coding = true;
        }
        if n.contains("vl") || n.contains("vision") {
            self.vision = true;
        }
        if n.contains("-r1") || n.contains("reasoning") || n.contains("thinking")
            || n.contains("o1") || n.contains("o3") || n.contains("o4")
        {
            self.reasoning = true;
        }
        if self.provider == "google" && n.contains("gemini") {
            self.vision = true;
        }
        if self.free {
            self.tags.push("free".into());
        }
        if self.local {
            self.tags.push("local".into());
        }
        self.tags.dedup();
    }
}
