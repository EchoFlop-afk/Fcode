use super::sse::{parse_sse_json, sse_data, LineDecoder};
use super::{provider_http_error, ProviderAdapter};
use crate::error::{AppError, AppResult};
use crate::models::{
    ChatRequest, FinishInfo, Message, ModelInfo, ProviderConfig, ProviderStatusInfo, Role,
    StreamEvent,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::{json, Map, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

pub struct AnthropicAdapter;

fn headers(key: Option<&str>) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert("Content-Type", HeaderValue::from_static("application/json"));
    h.insert(
        "anthropic-version",
        HeaderValue::from_static("2023-06-01"),
    );
    if let Some(k) = key {
        if let Ok(v) = HeaderValue::from_str(k) {
            h.insert("x-api-key", v);
        }
    }
    h
}

fn chat_url(cfg: &ProviderConfig) -> String {
    format!("{}/v1/messages", cfg.base_url.trim_end_matches('/'))
}

/// Anthropic requires strictly alternating user/assistant turns and rejects
/// system/tool roles inside messages. Merge consecutive same-role messages.
fn convert_messages(messages: &[Message]) -> (String, Vec<Value>) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut turns: Vec<(Role, Value)> = Vec::new();

    for m in messages {
        match m.role {
            Role::System => {
                if !m.content.is_empty() {
                    system_parts.push(m.content.clone());
                }
            }
            Role::User => {
                let mut blocks: Vec<Value> = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.content }));
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "text", "text": "(empty message)" }));
                }
                push_turn(&mut turns, Role::User, blocks);
            }
            Role::Tool => {
                // Tool results are delivered in user turns as tool_result blocks.
                let blocks = vec![json!({
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id.clone().unwrap_or_default(),
                    "content": m.content,
                })];
                push_turn(&mut turns, Role::User, blocks);
            }
            Role::Assistant => {
                let mut blocks: Vec<Value> = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.content }));
                }
                if let Some(reasoning) = &m.reasoning {
                    if !reasoning.is_empty() {
                        blocks.push(json!({ "type": "text", "text": reasoning }));
                    }
                }
                for tc in &m.tool_calls {
                    let args = if tc.arguments.trim().is_empty() {
                        Value::Object(Map::new())
                    } else {
                        serde_json::from_str(&tc.arguments).unwrap_or(Value::Object(Map::new()))
                    };
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": args,
                    }));
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "text", "text": "(continue)" }));
                }
                push_turn(&mut turns, Role::Assistant, blocks);
            }
        }
    }

    // Anthropic requires the first turn to be a user turn.
    if turns.first().map(|(r, _)| *r) != Some(Role::User) {
        turns.insert(
            0,
            (
                Role::User,
                json!([{ "type": "text", "text": "(begin)" }]),
            ),
        );
    }

    let out: Vec<Value> = turns
        .into_iter()
        .map(|(role, blocks)| json!({ "role": role_name(role), "content": blocks }))
        .collect();
    (system_parts.join("\n\n"), out)
}

fn role_name(r: Role) -> &'static str {
    match r {
        Role::User => "user",
        Role::Assistant => "assistant",
        _ => "user",
    }
}

fn push_turn(turns: &mut Vec<(Role, Value)>, role: Role, mut blocks: Vec<Value>) {
    if let Some((last_role, last_blocks)) = turns.last_mut() {
        if *last_role == role {
            last_blocks.as_array_mut().unwrap().append(&mut blocks);
            return;
        }
    }
    turns.push((role, Value::Array(blocks)));
}

fn map_stop_reason(reason: &str) -> String {
    match reason {
        "end_turn" | "stop_sequence" => "stop",
        "max_tokens" => "length",
        "tool_use" => "tool_calls",
        _ => reason,
    }
    .to_string()
}

#[async_trait]
impl ProviderAdapter for AnthropicAdapter {
    async fn stream_chat(
        &self,
        client: &reqwest::Client,
        cfg: &ProviderConfig,
        key: Option<&str>,
        req: &ChatRequest,
        events: &Channel<StreamEvent>,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<FinishInfo> {
        if key.is_none() {
            return Err(AppError::not_configured("Anthropic API key is not configured"));
        }
        let (system, messages) = convert_messages(&req.messages);
        let mut body = json!({
            "model": req.model,
            "max_tokens": req.max_tokens.unwrap_or(8192),
            "messages": messages,
            "stream": true,
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if !req.tools.is_empty() {
            body["tools"] = Value::Array(
                req.tools
                    .iter()
                    .map(|t| {
                        json!({
                            "name": t.name,
                            "description": t.description,
                            "input_schema": t.parameters,
                        })
                    })
                    .collect(),
            );
        }
        if let Some(t) = req.temperature {
            body["temperature"] = json!(t);
        }

        let response = client
            .post(chat_url(cfg))
            .headers(headers(key))
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
        let mut input_tokens: Option<u64> = None;
        let mut output_tokens: Option<u64> = None;
        let mut output_chars: u64 = 0;
        let mut finish_reason: Option<String> = None;

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                return Ok(FinishInfo {
                    finish_reason: "cancelled".into(),
                    output_chars,
                    input_tokens,
                    output_tokens,
                });
            }
            for line in decoder.push(&chunk.map_err(AppError::from)?) {
                if let Some(payload) = sse_data(&line) {
                    if let Some(v) = parse_sse_json(&payload)? {
                        match v["type"].as_str().unwrap_or("") {
                            "message_start" => {
                                input_tokens = v["message"]["usage"]["input_tokens"].as_u64();
                            }
                            "content_block_start" => {
                                let index = v["index"].as_u64().unwrap_or(0) as u32;
                                let cb = &v["content_block"];
                                if cb["type"] == "tool_use" {
                                    let _ = events.send(StreamEvent::ToolCallStart {
                                        index,
                                        id: cb["id"].as_str().unwrap_or("").to_string(),
                                        name: cb["name"].as_str().unwrap_or("").to_string(),
                                    });
                                }
                            }
                            "content_block_delta" => {
                                let index = v["index"].as_u64().unwrap_or(0) as u32;
                                let delta = &v["delta"];
                                match delta["type"].as_str().unwrap_or("") {
                                    "text_delta" => {
                                        if let Some(t) = delta["text"].as_str() {
                                            if !t.is_empty() {
                                                        output_chars += t.chars().count() as u64;
                                                let _ = events.send(StreamEvent::Delta { content: t.to_string() });
                                            }
                                        }
                                    }
                                    "thinking_delta" => {
                                        if let Some(t) = delta["thinking"].as_str() {
                                            if !t.is_empty() {
                                                let _ = events.send(StreamEvent::Reasoning { content: t.to_string() });
                                            }
                                        }
                                    }
                                    "input_json_delta" => {
                                        if let Some(t) = delta["partial_json"].as_str() {
                                            if !t.is_empty() {
                                                let _ = events.send(StreamEvent::ToolCallDelta { index, delta: t.to_string() });
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            "message_delta" => {
                                if let Some(sr) = v["delta"]["stop_reason"].as_str() {
                                    finish_reason = Some(map_stop_reason(sr));
                                }
                                if let Some(o) = v["usage"]["output_tokens"].as_u64() {
                                    output_tokens = Some(o);
                                }
                            }
                            "error" => {
                                let msg = v["error"]["message"]
                                    .as_str()
                                    .unwrap_or("Provider stream error");
                                return Err(provider_http_error(
                                    &cfg.id,
                                    Some(req.model.clone()),
                                    500,
                                    msg,
                                ));
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        let _ = decoder.finish();

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
        key: Option<&str>,
    ) -> AppResult<Vec<ModelInfo>> {
        let response = client
            .get(format!("{}/v1/models", cfg.base_url.trim_end_matches('/')))
            .headers(headers(key))
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
                let mut info = ModelInfo::catalog_stub(&cfg.id, &id);
                info.name = m["display_name"].as_str().unwrap_or(&id).to_string();
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
        if key.is_none() {
            return Ok(ProviderStatusInfo {
                id: cfg.id.clone(),
                status: "not_configured".into(),
                detail: "No API key configured".into(),
                key_present: false,
            });
        }
        let result = client
            .get(format!("{}/v1/models", cfg.base_url.trim_end_matches('/')))
            .headers(headers(key))
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
                        key_present: true,
                    })
                } else {
                    let body = super::read_error_body(resp).await;
                    let err = provider_http_error(&cfg.id, None, s, &body);
                    Ok(ProviderStatusInfo {
                        id: cfg.id.clone(),
                        status: if err.category == "invalid_api_key" {
                            "invalid_credentials".into()
                        } else {
                            "error".into()
                        },
                        detail: err.message,
                        key_present: true,
                    })
                }
            }
            Err(_) => Ok(ProviderStatusInfo {
                id: cfg.id.clone(),
                status: "offline".into(),
                detail: "Could not reach the provider endpoint".into(),
                key_present: true,
            }),
        }
    }
}
