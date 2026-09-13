use super::sse::LineDecoder;
use super::{provider_http_error, ProviderAdapter};
use crate::error::{AppError, AppResult};
use crate::models::{
    ChatRequest, FinishInfo, ModelInfo, ProviderConfig, ProviderStatusInfo, Role, StreamEvent,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

pub struct OllamaAdapter;

// Ollama streams NDJSON (one JSON object per line), not SSE.

fn headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert("Content-Type", HeaderValue::from_static("application/json"));
    h
}

fn chat_url(cfg: &ProviderConfig) -> String {
    format!("{}/api/chat", cfg.base_url.trim_end_matches('/'))
}

fn build_body(req: &ChatRequest) -> Value {
    let messages: Vec<Value> = req
        .messages
        .iter()
        .filter(|m| m.role != Role::Tool)
        .map(|m| {
            let mut obj = json!({
                "role": serde_json::to_value(m.role).unwrap(),
                "content": m.content,
            });
            if !m.tool_calls.is_empty() {
                obj["tool_calls"] = Value::Array(
                    m.tool_calls
                        .iter()
                        .map(|tc| {
                            let args = if tc.arguments.trim().is_empty() {
                                json!({})
                            } else {
                                serde_json::from_str(&tc.arguments).unwrap_or(json!({}))
                            };
                            json!({ "function": { "name": tc.name, "arguments": args } })
                        })
                        .collect(),
                );
            }
            obj
        })
        .collect();

    let mut body = json!({ "model": req.model, "messages": messages, "stream": true });
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
    }
    body
}

#[async_trait]
impl ProviderAdapter for OllamaAdapter {
    async fn stream_chat(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        _key: Option<&str>,
        req: &ChatRequest,
        events: &Channel<StreamEvent>,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<FinishInfo> {
        let body = build_body(req);
        let response = client
            .post(chat_url(cfg))
            .headers(headers())
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

        let mut tool_index: u32 = 0;
        let mut input_tokens: Option<u64> = None;
        let mut output_tokens: Option<u64> = None;
        let mut output_chars: u64 = 0;
        let mut finish_reason: Option<String> = None;

        // NDJSON: read byte chunks and decode complete lines.
        let mut stream = response.bytes_stream();
        let mut decoder = LineDecoder::new();
        'outer: while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                return Ok(FinishInfo {
                    finish_reason: "cancelled".into(),
                    output_chars,
                    input_tokens,
                    output_tokens,
                });
            }
            let mut lines = decoder.push(&chunk.map_err(AppError::from)?);
            lines.extend(decoder.finish());
            for line in lines {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let v: Value = match serde_json::from_str(trimmed) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(err) = v.get("error") {
                    let msg = err.as_str().unwrap_or("Ollama error");
                    return Err(AppError::new("provider_error", "provider_error", msg));
                }
                if let Some(message) = v.get("message") {
                    if let Some(text) = message["content"].as_str() {
                        if !text.is_empty() {
                            output_chars += text.chars().count() as u64;
                            let _ = events.send(StreamEvent::Delta { content: text.to_string() });
                        }
                    }
                    if let Some(text) = message["thinking"].as_str() {
                        if !text.is_empty() {
                            let _ = events.send(StreamEvent::Reasoning { content: text.to_string() });
                        }
                    }
                    if let Some(tcs) = message["tool_calls"].as_array() {
                        for tc in tcs {
                            let name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                            let args = serde_json::to_string(
                                tc["function"].get("arguments").unwrap_or(&json!({})),
                            )
                            .unwrap_or_else(|_| "{}".into());
                            let _ = events.send(StreamEvent::ToolCallStart {
                                index: tool_index,
                                id: format!("call_{tool_index}"),
                                name: name.clone(),
                            });
                            let _ = events.send(StreamEvent::ToolCallDelta {
                                index: tool_index,
                                delta: args,
                            });
                            tool_index += 1;
                        }
                    }
                }
                if v["done"].as_bool() == Some(true) {
                    input_tokens = v["prompt_eval_count"].as_u64();
                    output_tokens = v["eval_count"].as_u64();
                    finish_reason = Some(match v["done_reason"].as_str().unwrap_or("stop") {
                        "stop" => "stop".to_string(),
                        "length" => "length".to_string(),
                        other => other.to_string(),
                    });
                    break 'outer;
                }
            }
        }

        Ok(FinishInfo {
            output_chars,
            finish_reason: finish_reason.unwrap_or_else(|| "stop".into()),
            input_tokens,
            output_tokens,
        })
    }

    async fn list_models(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        _key: Option<&str>,
    ) -> AppResult<Vec<ModelInfo>> {
        let response = client
            .get(format!("{}/api/tags", cfg.base_url.trim_end_matches('/')))
            .headers(headers())
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            let body = super::read_error_body(response).await;
            return Err(provider_http_error(&cfg.id, None, status.as_u16(), &body));
        }
        let v: Value = response.json().await.map_err(AppError::from)?;
        let mut out = Vec::new();
        if let Some(arr) = v["models"].as_array() {
            for m in arr {
                let id = match m["name"].as_str() {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                let mut info = ModelInfo::catalog_stub(&cfg.id, &id);
                info.local = true;
                info.free = true;
                info.tags = vec!["local".into()];
                if let Some(size) = m["size"].as_u64() {
                    info.description = format!("Size: {:.1} GB", size as f64 / 1e9);
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
        _key: Option<&str>,
    ) -> AppResult<ProviderStatusInfo> {
        let result = client
            .get(format!("{}/api/version", cfg.base_url.trim_end_matches('/')))
            .headers(headers())
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await;
        match result {
            Ok(resp) if resp.status().is_success() => {
                let version = resp
                    .json::<Value>()
                    .await
                    .ok()
                    .and_then(|v| v["version"].as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                Ok(ProviderStatusInfo {
                    id: cfg.id.clone(),
                    status: "connected".into(),
                    detail: if version.is_empty() {
                        "Ollama is running".into()
                    } else {
                        format!("Ollama {version} is running")
                    },
                    key_present: false,
                })
            }
            _ => Ok(ProviderStatusInfo {
                id: cfg.id.clone(),
                status: "offline".into(),
                detail: "Ollama service not detected at localhost:11434".into(),
                key_present: false,
            }),
        }
    }
}
