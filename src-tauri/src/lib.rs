mod storage;

use futures_util::StreamExt;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const STREAM_CHUNK_EVENT: &str = "duban-ai-stream-chunk";
const STREAM_DONE_EVENT: &str = "duban-ai-stream-done";
const STREAM_ERROR_EVENT: &str = "duban-ai-stream-error";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiRequest {
    settings: AiSettings,
    system: Option<String>,
    messages: Vec<ChatMessage>,
    max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSettings {
    provider: String,
    anthropic: AnthropicSettings,
    openai_compatible: OpenAiCompatibleSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnthropicSettings {
    api_key: String,
    model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiCompatibleSettings {
    api_key: String,
    base_url: Option<String>,
    model: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiResponse {
    text: String,
    usage: Option<Value>,
    model: String,
    id: String,
    finish_reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunkPayload {
    request_id: String,
    text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamDonePayload {
    request_id: String,
    result: AiResponse,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorPayload {
    request_id: String,
    message: String,
}

#[tauri::command]
async fn duban_ai_call_model(request: AiRequest) -> Result<AiResponse, String> {
    let client = build_client()?;
    match request.settings.provider.as_str() {
        "openai-compatible" => call_openai_compatible(&client, &request, false).await,
        _ => call_anthropic(&client, &request, false).await,
    }
}

#[tauri::command]
async fn duban_ai_stream_model(
    app: AppHandle,
    request_id: String,
    request: AiRequest,
) -> Result<AiResponse, String> {
    let client = build_client()?;
    let result = match request.settings.provider.as_str() {
        "openai-compatible" => stream_openai_compatible(&client, &app, &request_id, &request).await,
        _ => stream_anthropic(&client, &app, &request_id, &request).await,
    };

    match result {
        Ok(response) => {
            let _ = app.emit(
                STREAM_DONE_EVENT,
                StreamDonePayload {
                    request_id,
                    result: response.clone(),
                },
            );
            Ok(response)
        }
        Err(message) => {
            let _ = app.emit(
                STREAM_ERROR_EVENT,
                StreamErrorPayload {
                    request_id,
                    message: message.clone(),
                },
            );
            Err(message)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            duban_ai_call_model,
            duban_ai_stream_model,
            storage::duban_storage_get_item,
            storage::duban_storage_set_item,
            storage::duban_storage_set_file,
            storage::duban_storage_remove_item,
            storage::duban_storage_keys,
            storage::duban_storage_clear,
            storage::duban_storage_scan_orphan_files,
            storage::duban_storage_delete_orphan_files,
            storage::duban_storage_export_backup,
            storage::duban_storage_import_backup,
            storage::duban_storage_list_backups,
            storage::duban_storage_preview_backup,
            storage::duban_storage_import_backup_id,
            storage::duban_storage_preview_backup_path,
            storage::duban_storage_import_backup_path,
            storage::duban_storage_delete_backup,
            storage::duban_storage_update_backup_metadata
        ])
        .setup(|app| {
            let storage_state =
                storage::StorageState::initialize(app.handle()).map_err(std::io::Error::other)?;
            app.manage(storage_state);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .build()
        .map_err(|_| "网络客户端初始化失败，请稍后重试。".to_string())
}

async fn call_anthropic(
    client: &Client,
    request: &AiRequest,
    stream: bool,
) -> Result<AiResponse, String> {
    let config = &request.settings.anthropic;
    let api_key = resolve_api_key(&config.api_key, "anthropic")?;

    let body = build_anthropic_body(request, stream);
    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|_| "网络请求失败，请检查网络连接后重试。".to_string())?;

    if !response.status().is_success() {
        return Err(humanize_anthropic_error(
            response.status(),
            read_error_message(response).await,
        ));
    }

    let data: Value = response
        .json()
        .await
        .map_err(|_| "模型服务返回了无法解析的响应。".to_string())?;

    let text = data
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|block| {
                    (block.get("type").and_then(Value::as_str) == Some("text"))
                        .then(|| block.get("text").and_then(Value::as_str).unwrap_or(""))
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    Ok(AiResponse {
        text,
        usage: data.get("usage").cloned(),
        model: data
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&config.model)
            .to_string(),
        id: data
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        finish_reason: data
            .get("stop_reason")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    })
}

async fn stream_anthropic(
    client: &Client,
    app: &AppHandle,
    request_id: &str,
    request: &AiRequest,
) -> Result<AiResponse, String> {
    let config = &request.settings.anthropic;
    let api_key = resolve_api_key(&config.api_key, "anthropic")?;

    let body = build_anthropic_body(request, true);
    let response = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|_| "网络请求失败，请检查网络连接后重试。".to_string())?;

    if !response.status().is_success() {
        return Err(humanize_anthropic_error(
            response.status(),
            read_error_message(response).await,
        ));
    }

    let mut full = String::new();
    let mut usage: Option<Value> = None;
    let mut response_model = config.model.clone();
    let mut id = String::new();
    let mut finish_reason = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|_| "流式响应读取失败，请稍后重试。".to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let events = take_sse_events(&mut buffer);

        for event_text in events {
            for payload in sse_data_payloads(&event_text) {
                if payload == "[DONE]" {
                    continue;
                }

                let event: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
                if event.get("type").and_then(Value::as_str) == Some("message_start") {
                    if let Some(next_usage) = event
                        .get("message")
                        .and_then(|message| message.get("usage"))
                    {
                        usage = Some(next_usage.clone());
                    }
                    if let Some(model) = event
                        .get("message")
                        .and_then(|message| message.get("model"))
                        .and_then(Value::as_str)
                    {
                        response_model = model.to_string();
                    }
                    if let Some(next_id) = event
                        .get("message")
                        .and_then(|message| message.get("id"))
                        .and_then(Value::as_str)
                    {
                        id = next_id.to_string();
                    }
                }

                if event.get("type").and_then(Value::as_str) == Some("message_delta") {
                    if let Some(reason) = event
                        .get("delta")
                        .and_then(|delta| delta.get("stop_reason"))
                        .and_then(Value::as_str)
                    {
                        finish_reason = reason.to_string();
                    }
                    if let Some(delta_usage) = event.get("usage") {
                        usage = Some(merge_usage(usage.take(), delta_usage.clone()));
                    }
                }

                if event.get("type").and_then(Value::as_str) == Some("content_block_delta") {
                    let piece = event
                        .get("delta")
                        .and_then(|delta| delta.get("text"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if !piece.is_empty() {
                        full.push_str(piece);
                        emit_stream_chunk(app, request_id, piece);
                    }
                }

                if event.get("type").and_then(Value::as_str) == Some("error") {
                    return Err(event
                        .get("error")
                        .and_then(|error| error.get("message"))
                        .and_then(Value::as_str)
                        .unwrap_or("流式响应出错。")
                        .to_string());
                }
            }
        }
    }

    Ok(AiResponse {
        text: full,
        usage,
        model: response_model,
        id,
        finish_reason,
    })
}

async fn call_openai_compatible(
    client: &Client,
    request: &AiRequest,
    stream: bool,
) -> Result<AiResponse, String> {
    let config = &request.settings.openai_compatible;
    validate_openai_config(config)?;
    let api_key = resolve_api_key(&config.api_key, "openai-compatible")?;

    let endpoint = format!(
        "{}/chat/completions",
        normalize_base_url(config.base_url.as_deref())
    );
    let body = build_openai_body(request, stream);
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|_| "网络请求失败，请检查网络连接后重试。".to_string())?;

    if !response.status().is_success() {
        return Err(humanize_openai_error(
            response.status(),
            read_error_message(response).await,
        ));
    }

    let data: Value = response
        .json()
        .await
        .map_err(|_| "模型服务返回了无法解析的响应。".to_string())?;
    let text = data
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    Ok(AiResponse {
        text,
        usage: normalize_openai_usage(data.get("usage")),
        model: data
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&config.model)
            .to_string(),
        id: data
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        finish_reason: data
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("finish_reason"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    })
}

async fn stream_openai_compatible(
    client: &Client,
    app: &AppHandle,
    request_id: &str,
    request: &AiRequest,
) -> Result<AiResponse, String> {
    let config = &request.settings.openai_compatible;
    validate_openai_config(config)?;
    let api_key = resolve_api_key(&config.api_key, "openai-compatible")?;

    let endpoint = format!(
        "{}/chat/completions",
        normalize_base_url(config.base_url.as_deref())
    );
    let body = build_openai_body(request, true);
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|_| "网络请求失败，请检查网络连接后重试。".to_string())?;

    if !response.status().is_success() {
        return Err(humanize_openai_error(
            response.status(),
            read_error_message(response).await,
        ));
    }

    let mut full = String::new();
    let mut response_model = config.model.clone();
    let mut finish_reason = String::new();
    let mut usage: Option<Value> = None;
    let mut id = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|_| "流式响应读取失败，请稍后重试。".to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let events = take_sse_events(&mut buffer);

        for event_text in events {
            for payload in sse_data_payloads(&event_text) {
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }

                let event: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
                if let Some(model) = event.get("model").and_then(Value::as_str) {
                    response_model = model.to_string();
                }
                if let Some(next_id) = event.get("id").and_then(Value::as_str) {
                    id = next_id.to_string();
                }
                if let Some(next_usage) = normalize_openai_usage(event.get("usage")) {
                    usage = Some(next_usage);
                }

                let choice = event
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|choices| choices.first());
                if let Some(reason) = choice
                    .and_then(|choice| choice.get("finish_reason"))
                    .and_then(Value::as_str)
                {
                    finish_reason = reason.to_string();
                }
                let piece = choice
                    .and_then(|choice| choice.get("delta"))
                    .and_then(|delta| delta.get("content"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !piece.is_empty() {
                    full.push_str(piece);
                    emit_stream_chunk(app, request_id, piece);
                }
            }
        }
    }

    Ok(AiResponse {
        text: full,
        usage,
        model: response_model,
        id,
        finish_reason,
    })
}

fn build_anthropic_body(request: &AiRequest, stream: bool) -> Value {
    let mut body = Map::new();
    body.insert(
        "model".to_string(),
        Value::String(request.settings.anthropic.model.clone()),
    );
    body.insert(
        "max_tokens".to_string(),
        json!(request.max_tokens.unwrap_or(1024)),
    );
    body.insert("messages".to_string(), json!(request.messages));
    if let Some(system) = non_empty_string(request.system.as_deref()) {
        body.insert("system".to_string(), Value::String(system.to_string()));
    }
    if stream {
        body.insert("stream".to_string(), Value::Bool(true));
    }
    Value::Object(body)
}

fn build_openai_body(request: &AiRequest, stream: bool) -> Value {
    let config = &request.settings.openai_compatible;
    let mut messages = Vec::new();
    if let Some(system) = non_empty_string(request.system.as_deref()) {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: system.to_string(),
        });
    }
    messages.extend(request.messages.clone());

    let mut body = Map::new();
    body.insert("model".to_string(), Value::String(config.model.clone()));
    body.insert("messages".to_string(), json!(messages));
    if stream {
        body.insert("stream".to_string(), Value::Bool(true));
    }
    let token_key = if is_kimi_base_url(config.base_url.as_deref()) {
        "max_completion_tokens"
    } else {
        "max_tokens"
    };
    body.insert(
        token_key.to_string(),
        json!(request.max_tokens.unwrap_or(1024)),
    );
    Value::Object(body)
}

fn validate_key(api_key: &str) -> Result<(), String> {
    if api_key.trim().is_empty() {
        Err("尚未设置 API Key，请先到「设置」里填写。".to_string())
    } else {
        Ok(())
    }
}

fn resolve_api_key(candidate: &str, provider: &str) -> Result<String, String> {
    let trimmed = candidate.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }

    let saved = storage::read_ai_api_key(provider)?;
    let api_key = saved.unwrap_or_default();
    validate_key(&api_key)?;
    Ok(api_key)
}

fn validate_openai_config(config: &OpenAiCompatibleSettings) -> Result<(), String> {
    if config.model.trim().is_empty() {
        Err("尚未设置模型名，请先到「设置」里填写。".to_string())
    } else {
        Ok(())
    }
}

fn normalize_base_url(value: Option<&str>) -> String {
    value
        .filter(|text| !text.trim().is_empty())
        .unwrap_or(DEFAULT_OPENAI_BASE_URL)
        .trim()
        .trim_end_matches('/')
        .to_string()
}

fn is_kimi_base_url(value: Option<&str>) -> bool {
    value
        .unwrap_or("")
        .to_ascii_lowercase()
        .contains("moonshot.cn")
        || value
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains("platform.kimi.com")
}

fn non_empty_string(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|text| !text.is_empty())
}

fn emit_stream_chunk(app: &AppHandle, request_id: &str, text: &str) {
    let _ = app.emit(
        STREAM_CHUNK_EVENT,
        StreamChunkPayload {
            request_id: request_id.to_string(),
            text: text.to_string(),
        },
    );
}

fn take_sse_events(buffer: &mut String) -> Vec<String> {
    let normalized = buffer.replace("\r\n", "\n");
    let mut parts: Vec<String> = normalized.split("\n\n").map(str::to_string).collect();
    let remainder = parts.pop().unwrap_or_default();
    *buffer = remainder;
    parts
}

fn sse_data_payloads(event_text: &str) -> Vec<String> {
    event_text
        .lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim)
        .map(str::to_string)
        .collect()
}

fn merge_usage(existing: Option<Value>, delta: Value) -> Value {
    let mut merged = existing
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    if let Some(delta_object) = delta.as_object() {
        for (key, value) in delta_object {
            merged.insert(key.clone(), value.clone());
        }
    }
    Value::Object(merged)
}

fn normalize_openai_usage(value: Option<&Value>) -> Option<Value> {
    let usage = value?;
    Some(json!({
      "input_tokens": usage
        .get("input_tokens")
        .or_else(|| usage.get("prompt_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0),
      "output_tokens": usage
        .get("output_tokens")
        .or_else(|| usage.get("completion_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0),
      "total_tokens": usage.get("total_tokens").and_then(Value::as_u64),
    }))
}

async fn read_error_message(response: reqwest::Response) -> Option<String> {
    let text = response.text().await.ok()?;
    let data: Value = serde_json::from_str(&text).ok()?;
    data.get("error")
        .and_then(|error| error.get("message"))
        .or_else(|| data.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn humanize_anthropic_error(status: StatusCode, message: Option<String>) -> String {
    match status.as_u16() {
        401 => "API Key 无效或未授权，请检查设置里的 Key 是否正确。".to_string(),
        403 => "无权访问（403）。请确认这个 Key 有调用权限。".to_string(),
        429 => "请求过于频繁或额度不足（429），请稍后再试，或检查账户额度。".to_string(),
        500 | 529 => "Anthropic 服务暂时不可用，请稍后重试。".to_string(),
        _ => message.unwrap_or_else(|| format!("请求失败：{}", status.as_u16())),
    }
}

fn humanize_openai_error(status: StatusCode, message: Option<String>) -> String {
    match status.as_u16() {
        401 => "API Key 无效或未授权，请检查设置里的 Key。".to_string(),
        403 => "无权访问（403）。请确认这个 Key 有调用权限。".to_string(),
        404 => "接口地址或模型不存在（404）。请检查 Base URL 和模型名。".to_string(),
        429 => "请求过于频繁或额度不足（429），请稍后再试或检查账户额度。".to_string(),
        code if code >= 500 => "模型服务暂时不可用，请稍后重试。".to_string(),
        _ => message.unwrap_or_else(|| format!("请求失败：{}", status.as_u16())),
    }
}
