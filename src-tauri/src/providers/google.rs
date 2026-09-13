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
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

pub struct GoogleAdapter;

fn headers(key: Option<&str>) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert("Content-Type", HeaderValue::from_static("application/json"));
    if let Some(k) = key {
        if let Ok(v) = HeaderValue::from_str(k) {
            h.insert("x-goog-api-key", v);
        }
    }
    h
}

/// Gemini's function declaration schema is an OpenAPI subset: drop unsupported
/// keys and uppercase the type names.
fn sanitize_schema(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, val) in map {
                match k.as_str() {
                    "$schema" | "additionalProperties" => continue,
                    "type" => {
                        if let Some(t) = val.as_str() {
                            out.insert("type".into(), json!(t.to_uppercase()));
                        }
                    }
                    _ => {
                        out.insert(k.clone(), sanitize_schema(val));
                    }
                }
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sanitize_schema).collect()),
        other => other.clone(),
    }
}

fn parts_for(m: &Message) -> Vec<Value> {
    let mut parts: Vec<Value> = Vec::new();
    if !m.content.is_empty() {
        parts.push(json!({ "text": m.content }));
    }
    for tc in &m.tool_calls {
        let args = if tc.arguments.trim().is_empty() {
            json!({})
        } else {
            serde_json::from_str(&tc.arguments).unwrap_or(json!({}))
        };
        parts.push(json!({ "functionCall": { "name": tc.name, "args": args } }));
    }
    if let Some(tc_id) = &m.tool_call_id {
        // Tool result -> functionResponse part
        parts = vec![json!({
            "functionResponse": {
                "name": m.tool_name.clone().unwrap_or_else(|| tc_id.clone()),
                "response": { "result": m.content },
            }
        })];
    }
    if parts.is_empty() {
        parts.push(json!({ "text": "(empty)" }));
    }
    parts
}

fn convert(req: &ChatRequest) -> Value {
    let mut system_parts: Vec<String> = Vec::new();
    let mut contents: Vec<Value> = Vec::new();
    for m in &req.messages {
        match m.role {
            Role::System => {
                if !m.content.is_empty() {
                    system_parts.push(m.content.clone());
                }
            }
            Role::User => contents.push(json!({ "role": "user", "parts": parts_for(m) })),
            Role::Tool => {
                // tool result -> user turn with functionResponse
                contents.push(json!({ "role": "user", "parts": parts_for(m) }));
            }
            Role::Assistant => contents.push(json!({ "role": "model", "parts": parts_for(m) })),
        }
    }
    let mut body = json!({ "contents": contents });
    if !system_parts.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system_parts.join("\n\n") }] });
    }
    if !req.tools.is_empty() {
        body["tools"] = json!([{
            "functionDeclarations": req.tools.iter().map(|t| json!({
                "name": t.name,
                "description": t.description,
                "parameters": sanitize_schema(&t.parameters),
            })).collect::<Vec<_>>()
        }]);
    }
    if let Some(t) = req.temperature {
        body["generationConfig"] = json!({ "temperature": t });
    }
    body
}

fn chat_url(cfg: &ProviderConfig, model: &str) -> String {
    let base = cfg.base_url.trim_end_matches('/');
    format!("{base}/models/{model}:streamGenerateContent?alt=sse")
}

#[async_trait]
impl ProviderAdapter for GoogleAdapter {
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
            return Err(AppError::not_configured("Google API key is not configured"));
        }
        let body = convert(req);
        let response = client
            .post(chat_url(cfg, &req.model))
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
        let mut tool_index: u32 = 0;

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
                        if let Some(usage) = v.get("usageMetadata") {
                            input_tokens = usage["promptTokenCount"].as_u64();
                            output_tokens = usage["candidatesTokenCount"].as_u64();
                        }
                        if let Some(candidates) = v["candidates"].as_array() {
                            if let Some(c) = candidates.first() {
                                if let Some(parts) = c["content"]["parts"].as_array() {
                                    for part in parts {
                                        if part.get("functionCall").is_some() {
                                            let name = part["functionCall"]["name"]
                                                .as_str()
                                                .unwrap_or("")
                                                .to_string();
                                            let args = serde_json::to_string(
                                                part["functionCall"].get("args").unwrap_or(&json!({})),
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
                                        } else if part["thought"].as_bool() == Some(true) {
                                            if let Some(t) = part["text"].as_str() {
                                                if !t.is_empty() {
                                                    let _ = events.send(StreamEvent::Reasoning { content: t.to_string() });
                                                }
                                            }
                                        } else if let Some(t) = part["text"].as_str() {
                                            if !t.is_empty() {
                                                    output_chars += t.chars().count() as u64;
                                                let _ = events.send(StreamEvent::Delta { content: t.to_string() });
                                            }
                                        }
                                    }
                                }
                                if let Some(fr) = c["finishReason"].as_str() {
                                    finish_reason = Some(match fr {
                                        "STOP" => "stop".to_string(),
                                        "MAX_TOKENS" => "length".to_string(),
                                        other => other.to_lowercase(),
                                    });
                                }
                            }
                        }
                        if v.get("error").is_some() {
                            let msg = v["error"]["message"].as_str().unwrap_or("Provider error");
                            return Err(provider_http_error(
                                &cfg.id,
                                Some(req.model.clone()),
                                500,
                                msg,
                            ));
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
            .get(format!("{}/models", cfg.base_url.trim_end_matches('/')))
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
        if let Some(arr) = v["models"].as_array() {
            for m in arr {
                let raw_name = m["name"].as_str().unwrap_or("");
                let id = raw_name.strip_prefix("models/").unwrap_or(raw_name).to_string();
                if id.is_empty() {
                    continue;
                }
                let methods: Vec<String> = m["supportedGenerationMethods"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                if !methods.is_empty()
                    && !methods.iter().any(|x| x == "generateContent")
                {
                    continue;
                }
                let mut info = ModelInfo::catalog_stub(&cfg.id, &id);
                info.name = m["displayName"].as_str().unwrap_or(&id).to_string();
                info.description = m["description"].as_str().unwrap_or("").to_string();
                info.context_window = m["inputTokenLimit"].as_u64().unwrap_or(0);
                info.tags.push("free-tier".into());
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
            .get(format!("{}/models", cfg.base_url.trim_end_matches('/')))
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
