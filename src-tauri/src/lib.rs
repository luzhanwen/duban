mod diagnostics;
mod storage;

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard, OnceLock,
    },
    time::Duration,
};

use diagnostics::{DiagnosticLogLevel, DiagnosticLogState};
use futures_util::{
    future::{select, Either},
    StreamExt,
};
use reqwest::{Client, RequestBuilder, Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tokio::time::sleep;

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const STREAM_CHUNK_EVENT: &str = "duban-ai-stream-chunk";
const STREAM_DONE_EVENT: &str = "duban-ai-stream-done";
const STREAM_ERROR_EVENT: &str = "duban-ai-stream-error";
const AI_CONNECT_TIMEOUT_SECS: u64 = 15;
const AI_REQUEST_TIMEOUT_SECS: u64 = 180;
const AI_MAX_ATTEMPTS: usize = 3;
const AI_CANCEL_POLL_MS: u64 = 80;
static AI_KEY_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static AI_CANCEL_REGISTRY: OnceLock<Mutex<HashMap<String, AiCancelToken>>> = OnceLock::new();

#[cfg(target_os = "macos")]
fn set_macos_dock_icon() {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    const ICON_BYTES: &[u8] = include_bytes!("../icons/icon.png");

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let image_data = NSData::with_bytes(ICON_BYTES);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &image_data) else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    unsafe {
        app.setApplicationIconImage(Some(&image));
    }
}

type AiResult<T> = Result<T, AiError>;
type AiCancelToken = Arc<AtomicBool>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiRequest {
    settings: AiSettings,
    system: Option<String>,
    messages: Vec<ChatMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
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
    truncated: bool,
    attempts: usize,
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
    code: String,
    kind: String,
    retryable: bool,
    status: Option<u16>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AiError {
    code: String,
    kind: String,
    message: String,
    retryable: bool,
    status: Option<u16>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiCancelResult {
    request_id: String,
    cancelled: bool,
}

#[tauri::command]
async fn duban_ai_call_model(
    app: AppHandle,
    request: AiRequest,
    request_id: Option<String>,
) -> AiResult<AiResponse> {
    record_ai_request_started(&app, &request, request_id.as_deref(), false);
    let result = async {
        let client = build_client()?;
        let cancel_token = register_ai_request(request_id.as_deref())?;
        let result = match request.settings.provider.as_str() {
            "openai-compatible" => {
                call_openai_compatible(&client, &request, false, cancel_token).await
            }
            _ => call_anthropic(&client, &request, false, cancel_token).await,
        };
        result
    }
    .await;
    unregister_ai_request(request_id.as_deref());
    record_ai_request_finished(&app, &request, request_id.as_deref(), false, &result);
    result
}

#[tauri::command]
async fn duban_ai_stream_model(
    app: AppHandle,
    request_id: String,
    request: AiRequest,
) -> AiResult<AiResponse> {
    record_ai_request_started(&app, &request, Some(&request_id), true);
    let result = async {
        let client = build_client()?;
        let cancel_token = register_ai_request(Some(&request_id))?;
        let result = match request.settings.provider.as_str() {
            "openai-compatible" => {
                stream_openai_compatible(&client, &app, &request_id, &request, cancel_token).await
            }
            _ => stream_anthropic(&client, &app, &request_id, &request, cancel_token).await,
        };
        result
    }
    .await;
    unregister_ai_request(Some(&request_id));
    record_ai_request_finished(&app, &request, Some(&request_id), true, &result);

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
        Err(error) => {
            let _ = app.emit(
                STREAM_ERROR_EVENT,
                StreamErrorPayload {
                    request_id,
                    message: error.message.clone(),
                    code: error.code.clone(),
                    kind: error.kind.clone(),
                    retryable: error.retryable,
                    status: error.status,
                },
            );
            Err(error)
        }
    }
}

#[tauri::command]
fn duban_ai_cancel_request(app: AppHandle, request_id: String) -> AiCancelResult {
    let cancelled = cancel_ai_request(&request_id);
    diagnostics::record_app_event(
        &app,
        DiagnosticLogLevel::Warn,
        "ai",
        "cancel_requested",
        json!({
            "requestId": request_id.trim(),
            "cancelled": cancelled
        }),
    );
    AiCancelResult {
        cancelled,
        request_id,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    builder
        .invoke_handler(tauri::generate_handler![
            duban_ai_call_model,
            duban_ai_stream_model,
            duban_ai_cancel_request,
            diagnostics::duban_diagnostics_health_check,
            diagnostics::duban_diagnostics_export_package,
            storage::duban_storage_get_item,
            storage::duban_storage_set_item,
            storage::duban_storage_set_file,
            storage::duban_storage_remove_item,
            storage::duban_storage_delete_book,
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
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            set_macos_dock_icon();

            storage::configure_keychain_service(&app.config().identifier)
                .map_err(std::io::Error::other)?;

            let diagnostic_log =
                DiagnosticLogState::initialize(app.handle()).map_err(std::io::Error::other)?;
            let _ = diagnostic_log.record_info(
                "app",
                "started",
                json!({
                    "runtime": "tauri",
                    "debug": cfg!(debug_assertions),
                    "os": std::env::consts::OS,
                    "arch": std::env::consts::ARCH,
                    "schemaVersion": storage::current_schema_version()
                }),
            );
            let storage_state = match storage::StorageState::initialize(app.handle()) {
                Ok(state) => {
                    let _ = diagnostic_log.record_info(
                        "storage",
                        "initialized",
                        json!({
                            "schemaVersion": storage::current_schema_version()
                        }),
                    );
                    state
                }
                Err(message) => {
                    let _ = diagnostic_log.record_error(
                        "storage",
                        "initialize_failed",
                        json!({
                            "schemaVersion": storage::current_schema_version(),
                            "errorMessage": message.clone()
                        }),
                    );
                    return Err(std::io::Error::other(message).into());
                }
            };
            app.manage(diagnostic_log);
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
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                diagnostics::record_app_event(
                    &window.app_handle(),
                    DiagnosticLogLevel::Info,
                    "app",
                    "window_hidden_to_background",
                    json!({
                        "label": window.label()
                    }),
                );
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen {
                has_visible_windows,
                ..
            } = event
            {
                if !has_visible_windows {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}

fn record_ai_request_started(
    app: &AppHandle,
    request: &AiRequest,
    request_id: Option<&str>,
    stream: bool,
) {
    diagnostics::record_app_event(
        app,
        DiagnosticLogLevel::Info,
        "ai",
        "request_started",
        ai_request_log_fields(request, request_id, stream, json!({})),
    );
}

fn record_ai_request_finished(
    app: &AppHandle,
    request: &AiRequest,
    request_id: Option<&str>,
    stream: bool,
    result: &AiResult<AiResponse>,
) {
    match result {
        Ok(response) => diagnostics::record_app_event(
            app,
            DiagnosticLogLevel::Info,
            "ai",
            "request_succeeded",
            ai_request_log_fields(
                request,
                request_id,
                stream,
                json!({
                    "status": "success",
                    "attempts": response.attempts,
                    "finishReason": response.finish_reason,
                    "truncated": response.truncated
                }),
            ),
        ),
        Err(error) if error.kind == "cancelled" => diagnostics::record_app_event(
            app,
            DiagnosticLogLevel::Warn,
            "ai",
            "request_cancelled",
            ai_request_log_fields(
                request,
                request_id,
                stream,
                json!({
                    "status": "cancelled",
                    "errorCode": error.code,
                    "errorKind": error.kind,
                    "retryable": error.retryable,
                    "httpStatus": error.status,
                    "errorMessage": error.message
                }),
            ),
        ),
        Err(error) => diagnostics::record_app_event(
            app,
            DiagnosticLogLevel::Error,
            "ai",
            "request_failed",
            ai_request_log_fields(
                request,
                request_id,
                stream,
                json!({
                    "status": "error",
                    "errorCode": error.code,
                    "errorKind": error.kind,
                    "retryable": error.retryable,
                    "httpStatus": error.status,
                    "errorMessage": error.message
                }),
            ),
        ),
    }
}

fn ai_request_log_fields(
    request: &AiRequest,
    request_id: Option<&str>,
    stream: bool,
    extra: Value,
) -> Value {
    let provider = request.settings.provider.as_str();
    let (model, origin) = if provider == "openai-compatible" {
        let config = &request.settings.openai_compatible;
        let base_url = normalize_base_url(config.base_url.as_deref());
        (
            config.model.as_str(),
            diagnostics::url_origin(&base_url).unwrap_or_else(|| "[invalid]".to_string()),
        )
    } else {
        (
            request.settings.anthropic.model.as_str(),
            "https://api.anthropic.com".to_string(),
        )
    };

    let mut fields = Map::new();
    fields.insert("provider".to_string(), Value::String(provider.to_string()));
    fields.insert("model".to_string(), Value::String(model.to_string()));
    fields.insert("baseUrlOrigin".to_string(), Value::String(origin));
    fields.insert("stream".to_string(), Value::Bool(stream));
    fields.insert("messageCount".to_string(), json!(request.messages.len()));
    fields.insert(
        "hasSystem".to_string(),
        Value::Bool(
            request
                .system
                .as_deref()
                .map(str::trim)
                .is_some_and(|text| !text.is_empty()),
        ),
    );
    fields.insert("maxTokens".to_string(), json!(request.max_tokens));
    fields.insert("temperature".to_string(), json!(request.temperature));
    if let Some(request_id) = request_id.map(str::trim).filter(|value| !value.is_empty()) {
        fields.insert(
            "requestId".to_string(),
            Value::String(request_id.to_string()),
        );
    }
    if let Some(extra_object) = extra.as_object() {
        for (key, value) in extra_object {
            fields.insert(key.clone(), value.clone());
        }
    }

    Value::Object(fields)
}

fn build_client() -> AiResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(AI_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(AI_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|_| AiError::internal("网络客户端初始化失败，请稍后重试。"))
}

pub(crate) fn clear_ai_key_cache() {
    if let Some(cache) = AI_KEY_CACHE.get() {
        if let Ok(mut keys) = cache.lock() {
            keys.clear();
        }
    }
}

#[cfg(test)]
fn read_cached_ai_key(provider: &str) -> Option<String> {
    lock_ai_key_cache().ok()?.get(provider).cloned()
}

#[cfg(test)]
fn cache_ai_key(provider: &str, api_key: &str) {
    if let Ok(mut keys) = lock_ai_key_cache() {
        keys.insert(provider.to_string(), api_key.to_string());
    }
}

fn lock_ai_key_cache() -> AiResult<MutexGuard<'static, HashMap<String, String>>> {
    AI_KEY_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| AiError::internal("读取 API Key 缓存失败，请重启应用后重试。"))
}

fn lock_ai_cancel_registry() -> AiResult<MutexGuard<'static, HashMap<String, AiCancelToken>>> {
    AI_CANCEL_REGISTRY
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| AiError::internal("读取 AI 请求取消状态失败，请重启应用后重试。"))
}

fn register_ai_request(request_id: Option<&str>) -> AiResult<Option<AiCancelToken>> {
    let Some(request_id) = request_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let token = Arc::new(AtomicBool::new(false));
    lock_ai_cancel_registry()?.insert(request_id.to_string(), token.clone());
    Ok(Some(token))
}

fn unregister_ai_request(request_id: Option<&str>) {
    let Some(request_id) = request_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    if let Ok(mut registry) = lock_ai_cancel_registry() {
        registry.remove(request_id);
    }
}

fn cancel_ai_request(request_id: &str) -> bool {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return false;
    }
    let Ok(registry) = lock_ai_cancel_registry() else {
        return false;
    };
    if let Some(token) = registry.get(request_id) {
        token.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

async fn wait_for_cancel(token: AiCancelToken) {
    while !token.load(Ordering::SeqCst) {
        sleep(Duration::from_millis(AI_CANCEL_POLL_MS)).await;
    }
}

fn is_truncated_finish_reason(reason: &str) -> bool {
    let normalized = reason.trim().to_ascii_lowercase().replace('-', "_");
    matches!(
        normalized.as_str(),
        "length" | "max_tokens" | "max_output_tokens" | "output_token_limit"
    )
}

async fn call_anthropic(
    client: &Client,
    request: &AiRequest,
    stream: bool,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<AiResponse> {
    let config = &request.settings.anthropic;
    let api_key = resolve_api_key(&config.api_key, "anthropic")?;

    let body = build_anthropic_body(request, stream);
    let (response, attempts) = send_ai_request_with_retry("anthropic", cancel_token, || {
        client
            .post(ANTHROPIC_API_URL)
            .header("x-api-key", api_key.as_str())
            .header("anthropic-version", "2023-06-01")
            .json(&body)
    })
    .await?;

    let data: Value = response
        .json()
        .await
        .map_err(classify_response_decode_error)?;

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
    let finish_reason = data
        .get("stop_reason")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

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
        truncated: is_truncated_finish_reason(&finish_reason),
        finish_reason,
        attempts,
    })
}

async fn stream_anthropic(
    client: &Client,
    app: &AppHandle,
    request_id: &str,
    request: &AiRequest,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<AiResponse> {
    let config = &request.settings.anthropic;
    let api_key = resolve_api_key(&config.api_key, "anthropic")?;

    let body = build_anthropic_body(request, true);
    let (response, attempts) =
        send_ai_request_with_retry("anthropic", cancel_token.clone(), || {
            client
                .post(ANTHROPIC_API_URL)
                .header("x-api-key", api_key.as_str())
                .header("anthropic-version", "2023-06-01")
                .json(&body)
        })
        .await?;

    let mut full = String::new();
    let mut usage: Option<Value> = None;
    let mut response_model = config.model.clone();
    let mut id = String::new();
    let mut finish_reason = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    loop {
        let item = if let Some(token) = cancel_token.clone() {
            match select(Box::pin(stream.next()), Box::pin(wait_for_cancel(token))).await {
                Either::Left((item, _)) => item,
                Either::Right((_, _)) => return Err(AiError::cancelled()),
            }
        } else {
            stream.next().await
        };
        let Some(item) = item else {
            break;
        };
        let bytes = item.map_err(classify_stream_read_error)?;
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
                    return Err(AiError::provider_stream_error(
                        event
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(Value::as_str),
                    ));
                }
            }
        }
    }

    Ok(AiResponse {
        text: full,
        usage,
        model: response_model,
        id,
        truncated: is_truncated_finish_reason(&finish_reason),
        finish_reason,
        attempts,
    })
}

async fn call_openai_compatible(
    client: &Client,
    request: &AiRequest,
    stream: bool,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<AiResponse> {
    let config = &request.settings.openai_compatible;
    validate_openai_config(config)?;
    let api_key = resolve_api_key(&config.api_key, "openai-compatible")?;

    let endpoint = format!(
        "{}/chat/completions",
        normalize_base_url(config.base_url.as_deref())
    );
    let body = build_openai_body(request, stream);
    let (response, attempts) =
        send_ai_request_with_retry("openai-compatible", cancel_token, || {
            client
                .post(endpoint.as_str())
                .bearer_auth(api_key.as_str())
                .json(&body)
        })
        .await?;

    let data: Value = response
        .json()
        .await
        .map_err(classify_response_decode_error)?;
    let text = data
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let finish_reason = data
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(Value::as_str)
        .unwrap_or_default()
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
        truncated: is_truncated_finish_reason(&finish_reason),
        finish_reason,
        attempts,
    })
}

async fn stream_openai_compatible(
    client: &Client,
    app: &AppHandle,
    request_id: &str,
    request: &AiRequest,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<AiResponse> {
    let config = &request.settings.openai_compatible;
    validate_openai_config(config)?;
    let api_key = resolve_api_key(&config.api_key, "openai-compatible")?;

    let endpoint = format!(
        "{}/chat/completions",
        normalize_base_url(config.base_url.as_deref())
    );
    let body = build_openai_body(request, true);
    let (response, attempts) =
        send_ai_request_with_retry("openai-compatible", cancel_token.clone(), || {
            client
                .post(endpoint.as_str())
                .bearer_auth(api_key.as_str())
                .json(&body)
        })
        .await?;

    let mut full = String::new();
    let mut response_model = config.model.clone();
    let mut finish_reason = String::new();
    let mut usage: Option<Value> = None;
    let mut id = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    loop {
        let item = if let Some(token) = cancel_token.clone() {
            match select(Box::pin(stream.next()), Box::pin(wait_for_cancel(token))).await {
                Either::Left((item, _)) => item,
                Either::Right((_, _)) => return Err(AiError::cancelled()),
            }
        } else {
            stream.next().await
        };
        let Some(item) = item else {
            break;
        };
        let bytes = item.map_err(classify_stream_read_error)?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let events = take_sse_events(&mut buffer);

        for event_text in events {
            for payload in sse_data_payloads(&event_text) {
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }

                let event: Value =
                    serde_json::from_str(&payload).map_err(|_| AiError::response_format())?;
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
        truncated: is_truncated_finish_reason(&finish_reason),
        finish_reason,
        attempts,
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
    if let Some(temperature) = normalize_temperature(request.temperature, 1.0) {
        body.insert("temperature".to_string(), json!(temperature));
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
    if let Some(temperature) = normalize_temperature(request.temperature, 2.0) {
        body.insert("temperature".to_string(), json!(temperature));
    }
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

fn normalize_temperature(value: Option<f32>, max: f32) -> Option<f32> {
    let value = value?;
    if !value.is_finite() {
        return None;
    }
    Some(value.clamp(0.0, max))
}

async fn send_ai_request_with_retry<F>(
    provider: &str,
    cancel_token: Option<AiCancelToken>,
    mut build_request: F,
) -> AiResult<(Response, usize)>
where
    F: FnMut() -> RequestBuilder,
{
    for attempt in 1..=AI_MAX_ATTEMPTS {
        match send_ai_request_once(build_request(), cancel_token.clone()).await {
            Ok(response) => {
                if response.status().is_success() {
                    return Ok((response, attempt));
                }

                let status = response.status();
                if should_retry_status(status) && attempt < AI_MAX_ATTEMPTS {
                    sleep_with_cancel(retry_delay(attempt), cancel_token.clone()).await?;
                    continue;
                }

                let message = read_error_message(response).await;
                return Err(classify_http_error(provider, status, message));
            }
            Err(ai_error) => {
                if ai_error.retryable && attempt < AI_MAX_ATTEMPTS {
                    sleep_with_cancel(retry_delay(attempt), cancel_token.clone()).await?;
                    continue;
                }

                return Err(ai_error);
            }
        }
    }

    Err(AiError::network())
}

async fn send_ai_request_once(
    request: RequestBuilder,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<Response> {
    if let Some(token) = cancel_token {
        return match select(Box::pin(request.send()), Box::pin(wait_for_cancel(token))).await {
            Either::Left((result, _)) => result.map_err(classify_transport_error),
            Either::Right((_, _)) => Err(AiError::cancelled()),
        };
    }

    request.send().await.map_err(classify_transport_error)
}

async fn sleep_with_cancel(
    duration: Duration,
    cancel_token: Option<AiCancelToken>,
) -> AiResult<()> {
    if let Some(token) = cancel_token {
        return match select(Box::pin(sleep(duration)), Box::pin(wait_for_cancel(token))).await {
            Either::Left((_, _)) => Ok(()),
            Either::Right((_, _)) => Err(AiError::cancelled()),
        };
    }

    sleep(duration).await;
    Ok(())
}

fn validate_key(api_key: &str) -> AiResult<()> {
    if api_key.trim().is_empty() {
        Err(AiError::config(
            "AI_KEY_MISSING",
            "尚未设置 API Key，请先到「设置」里填写。",
        ))
    } else {
        Ok(())
    }
}

fn resolve_api_key(candidate: &str, provider: &str) -> AiResult<String> {
    let trimmed = candidate.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }

    let mut keys = lock_ai_key_cache()?;
    if let Some(api_key) = keys.get(provider).cloned() {
        validate_key(&api_key)?;
        return Ok(api_key);
    }

    let saved = storage::read_ai_api_key(provider).map_err(|_| AiError::keychain_read())?;
    let api_key = saved.unwrap_or_default();
    validate_key(&api_key)?;
    keys.insert(provider.to_string(), api_key.clone());
    Ok(api_key)
}

fn validate_openai_config(config: &OpenAiCompatibleSettings) -> AiResult<()> {
    if config.model.trim().is_empty() {
        return Err(AiError::config(
            "AI_MODEL_MISSING",
            "尚未设置模型名，请先到「设置」里填写。",
        ));
    }

    validate_openai_base_url(&normalize_base_url(config.base_url.as_deref()))
}

fn validate_openai_base_url(base_url: &str) -> AiResult<()> {
    let url = Url::parse(base_url).map_err(|_| {
        AiError::base_url("请填写完整可用的 Base URL，例如 https://api.openai.com/v1。")
    })?;

    if !matches!(url.scheme(), "http" | "https") {
        return Err(AiError::base_url("Base URL 只支持 http 或 https 地址。"));
    }

    Ok(())
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

fn classify_http_error(provider: &str, status: StatusCode, message: Option<String>) -> AiError {
    let code = status.as_u16();
    if is_content_too_long(status, message.as_deref()) {
        return AiError::new(
            "AI_CONTENT_TOO_LONG",
            "content",
            "这次发送给模型的上下文太长。请缩短文本范围，或降低单次生成内容后重试。",
            false,
            Some(code),
        );
    }

    match code {
        400 => AiError::new(
            "AI_BAD_REQUEST",
            "configuration",
            "模型请求内容不符合接口要求。请检查模型、Base URL 和输入内容后重试。",
            false,
            Some(code),
        ),
        401 => AiError::new(
            "AI_AUTH_INVALID",
            "auth",
            "API Key 无效或未授权，请检查设置里的 Key 是否正确。",
            false,
            Some(code),
        ),
        403 => AiError::new(
            "AI_AUTH_FORBIDDEN",
            "auth",
            "无权访问模型服务。请确认这个 Key 有调用权限，或检查账户/组织权限。",
            false,
            Some(code),
        ),
        404 => AiError::new(
            "AI_MODEL_NOT_FOUND",
            "model",
            model_not_found_message(provider),
            false,
            Some(code),
        ),
        408 | 409 | 425 => AiError::new(
            "AI_PROVIDER_TEMPORARY",
            "network",
            "模型服务暂时没有完成请求，已自动重试但仍未成功。请稍后再试。",
            true,
            Some(code),
        ),
        429 => AiError::new(
            "AI_RATE_LIMITED",
            "rate_limit",
            "请求过于频繁或额度不足，已自动重试但仍未成功。请稍后再试，或检查账户额度。",
            true,
            Some(code),
        ),
        500 | 502 | 503 | 504 | 529 => AiError::new(
            "AI_PROVIDER_UNAVAILABLE",
            "provider",
            "模型服务暂时不可用，已自动重试但仍未成功。请稍后再试。",
            true,
            Some(code),
        ),
        _ => AiError::new(
            "AI_PROVIDER_ERROR",
            "provider",
            "模型服务返回错误。请稍后重试，或检查模型服务配置。",
            false,
            Some(code),
        ),
    }
}

fn classify_transport_error(error: reqwest::Error) -> AiError {
    if error.is_timeout() {
        return AiError::timeout();
    }

    if error.is_builder() {
        return AiError::base_url("Base URL 无法用于发起请求，请检查地址格式。");
    }

    if error.is_decode() {
        return AiError::response_format();
    }

    AiError::network()
}

fn classify_response_decode_error(error: reqwest::Error) -> AiError {
    if error.is_timeout() {
        return AiError::timeout();
    }

    AiError::response_format()
}

fn classify_stream_read_error(error: reqwest::Error) -> AiError {
    if error.is_timeout() {
        return AiError::timeout();
    }

    AiError::new(
        "AI_STREAM_READ_FAILED",
        "network",
        "流式响应读取失败，请稍后重试。",
        true,
        None,
    )
}

fn should_retry_status(status: StatusCode) -> bool {
    matches!(
        status.as_u16(),
        408 | 409 | 425 | 429 | 500 | 502 | 503 | 504 | 529
    )
}

fn retry_delay(attempt: usize) -> Duration {
    let millis = match attempt {
        1 => 400,
        2 => 1_000,
        _ => 1_600,
    };
    Duration::from_millis(millis)
}

fn is_content_too_long(status: StatusCode, message: Option<&str>) -> bool {
    if status.as_u16() == 413 {
        return true;
    }

    let Some(message) = message else {
        return false;
    };
    let lower = message.to_ascii_lowercase();
    (status.as_u16() == 400 || status.as_u16() == 422)
        && (lower.contains("context")
            || lower.contains("token")
            || lower.contains("too long")
            || lower.contains("maximum")
            || lower.contains("max_tokens")
            || lower.contains("length"))
}

fn model_not_found_message(provider: &str) -> &'static str {
    if provider == "openai-compatible" {
        "接口地址或模型不存在。请检查 Base URL 和模型名。"
    } else {
        "模型不存在或当前 Key 无权访问该模型。请检查模型名和账户权限。"
    }
}

impl AiError {
    fn new(code: &str, kind: &str, message: &str, retryable: bool, status: Option<u16>) -> Self {
        Self {
            code: code.to_string(),
            kind: kind.to_string(),
            message: message.to_string(),
            retryable,
            status,
        }
    }

    fn config(code: &str, message: &str) -> Self {
        Self::new(code, "configuration", message, false, None)
    }

    fn base_url(message: &str) -> Self {
        Self::new("AI_BASE_URL_INVALID", "base_url", message, false, None)
    }

    fn keychain_read() -> Self {
        Self::new(
            "AI_KEYCHAIN_READ_FAILED",
            "auth",
            "读取系统 Keychain 失败。",
            false,
            None,
        )
    }

    fn timeout() -> Self {
        Self::new(
            "AI_NETWORK_TIMEOUT",
            "network",
            "模型请求超时，已自动重试但仍未成功。请检查网络连接后再试。",
            true,
            None,
        )
    }

    fn network() -> Self {
        Self::new(
            "AI_NETWORK_FAILED",
            "network",
            "网络请求失败，已自动重试但仍未成功。请检查网络连接后再试。",
            true,
            None,
        )
    }

    fn response_format() -> Self {
        Self::new(
            "AI_RESPONSE_FORMAT_INVALID",
            "response_format",
            "模型服务返回了无法解析的响应，请稍后重试或检查模型服务配置。",
            false,
            None,
        )
    }

    fn provider_stream_error(message: Option<&str>) -> Self {
        if is_content_too_long(StatusCode::BAD_REQUEST, message) {
            return Self::new(
                "AI_CONTENT_TOO_LONG",
                "content",
                "这次发送给模型的上下文太长。请缩短文本范围，或降低单次生成内容后重试。",
                false,
                None,
            );
        }

        Self::new(
            "AI_STREAM_PROVIDER_ERROR",
            "provider",
            "模型服务在流式输出中返回错误。请稍后重试，或检查模型服务配置。",
            false,
            None,
        )
    }

    fn internal(message: &str) -> Self {
        Self::new("AI_INTERNAL_ERROR", "internal", message, false, None)
    }

    fn cancelled() -> Self {
        Self::new(
            "AI_REQUEST_CANCELLED",
            "cancelled",
            "已取消生成。",
            false,
            None,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_key_cache_can_be_cleared_without_keychain_access() {
        clear_ai_key_cache();
        cache_ai_key("anthropic", "sk-test");

        assert_eq!(read_cached_ai_key("anthropic").as_deref(), Some("sk-test"));
        assert_eq!(resolve_api_key("", "anthropic").as_deref(), Ok("sk-test"));

        clear_ai_key_cache();
        assert!(read_cached_ai_key("anthropic").is_none());
    }

    #[test]
    fn ai_http_errors_are_classified_without_provider_message_leakage() {
        let auth = classify_http_error("anthropic", StatusCode::UNAUTHORIZED, None);
        assert_eq!(auth.code, "AI_AUTH_INVALID");
        assert_eq!(auth.kind, "auth");
        assert!(!auth.retryable);

        let rate_limit = classify_http_error("anthropic", StatusCode::TOO_MANY_REQUESTS, None);
        assert_eq!(rate_limit.code, "AI_RATE_LIMITED");
        assert_eq!(rate_limit.kind, "rate_limit");
        assert!(rate_limit.retryable);

        let missing_model = classify_http_error("openai-compatible", StatusCode::NOT_FOUND, None);
        assert_eq!(missing_model.code, "AI_MODEL_NOT_FOUND");
        assert_eq!(missing_model.kind, "model");
        assert!(missing_model.message.contains("Base URL"));

        let content = classify_http_error(
            "anthropic",
            StatusCode::BAD_REQUEST,
            Some("maximum context length exceeded for this model".to_string()),
        );
        assert_eq!(content.code, "AI_CONTENT_TOO_LONG");
        assert_eq!(content.kind, "content");
        assert!(!content.message.contains("maximum context length"));
    }

    #[test]
    fn ai_retry_policy_only_retries_transient_statuses() {
        assert!(should_retry_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(should_retry_status(StatusCode::BAD_GATEWAY));
        assert!(should_retry_status(StatusCode::SERVICE_UNAVAILABLE));
        assert_eq!(retry_delay(1), Duration::from_millis(400));
        assert_eq!(retry_delay(2), Duration::from_millis(1_000));

        assert!(!should_retry_status(StatusCode::UNAUTHORIZED));
        assert!(!should_retry_status(StatusCode::FORBIDDEN));
        assert!(!should_retry_status(StatusCode::NOT_FOUND));
        assert!(!should_retry_status(StatusCode::BAD_REQUEST));
    }

    #[test]
    fn openai_base_url_validation_keeps_errors_actionable() {
        assert!(validate_openai_base_url("https://api.openai.com/v1").is_ok());
        assert!(validate_openai_base_url("http://localhost:11434/v1").is_ok());

        let invalid = validate_openai_base_url("not-a-url").unwrap_err();
        assert_eq!(invalid.code, "AI_BASE_URL_INVALID");
        assert_eq!(invalid.kind, "base_url");

        let unsupported = validate_openai_base_url("file:///tmp/model").unwrap_err();
        assert_eq!(unsupported.code, "AI_BASE_URL_INVALID");
        assert!(unsupported.message.contains("http"));
    }

    #[test]
    fn ai_finish_reason_detects_output_truncation() {
        assert!(is_truncated_finish_reason("max_tokens"));
        assert!(is_truncated_finish_reason("length"));
        assert!(is_truncated_finish_reason("MAX-OUTPUT-TOKENS"));
        assert!(is_truncated_finish_reason("output_token_limit"));

        assert!(!is_truncated_finish_reason("stop"));
        assert!(!is_truncated_finish_reason(""));
    }

    #[test]
    fn ai_temperature_is_clamped_for_provider_bounds() {
        assert_eq!(normalize_temperature(Some(-0.5), 1.0), Some(0.0));
        assert_eq!(normalize_temperature(Some(0.7), 1.0), Some(0.7));
        assert_eq!(normalize_temperature(Some(1.7), 1.0), Some(1.0));
        assert_eq!(normalize_temperature(Some(3.0), 2.0), Some(2.0));
        assert_eq!(normalize_temperature(None, 2.0), None);
    }

    #[test]
    fn ai_cancel_registry_marks_and_removes_requests() {
        let request_id = "test-cancel-request";
        unregister_ai_request(Some(request_id));
        let token = register_ai_request(Some(request_id))
            .expect("register")
            .expect("token");

        assert!(!token.load(Ordering::SeqCst));
        assert!(cancel_ai_request(request_id));
        assert!(token.load(Ordering::SeqCst));

        unregister_ai_request(Some(request_id));
        assert!(!cancel_ai_request(request_id));
    }
}
