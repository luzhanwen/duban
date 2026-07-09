use crate::storage::{self, StorageHealthReport, StorageState};
use reqwest::Url;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const LOG_SCHEMA_VERSION: u32 = 1;
const LOGS_DIR: &str = "logs";
const LOG_FILE_NAME: &str = "duban-diagnostics.jsonl";
const ROTATED_LOG_FILE_NAME: &str = "duban-diagnostics.1.jsonl";
const DIAGNOSTIC_EXPORTS_DIR: &str = "diagnostics";
const DIAGNOSTIC_PACKAGE_FORMAT: &str = "duban.diagnostics";
const DIAGNOSTIC_PACKAGE_VERSION: u32 = 1;
const MAX_LOG_BYTES: u64 = 1_048_576;
const MAX_EXPORTED_LOG_ENTRIES: usize = 400;
const MAX_STRING_CHARS: usize = 500;

pub struct DiagnosticLogState {
    log_path: PathBuf,
    rotated_log_path: PathBuf,
    app_version: String,
    lock: Mutex<()>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticLogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticLogEntry {
    schema_version: u32,
    timestamp: String,
    level: DiagnosticLogLevel,
    category: String,
    event: String,
    app_version: String,
    fields: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticPackage {
    format: String,
    package_version: u32,
    exported_at: String,
    app: DiagnosticAppSummary,
    storage: storage::DiagnosticStorageSnapshot,
    recent_logs: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticAppSummary {
    version: String,
    runtime: String,
    debug: bool,
    os: String,
    arch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticExportResult {
    path: String,
    file_name: String,
    byte_size: u64,
    exported_at: String,
    health_status: String,
    issue_count: usize,
    log_entry_count: usize,
}

#[tauri::command]
pub fn duban_diagnostics_health_check(
    state: State<'_, StorageState>,
) -> Result<StorageHealthReport, String> {
    storage::build_storage_health_report(state.inner())
}

#[tauri::command]
pub fn duban_diagnostics_export_package(
    app: AppHandle,
    log_state: State<'_, DiagnosticLogState>,
    storage_state: State<'_, StorageState>,
) -> Result<DiagnosticExportResult, String> {
    let exported_at = current_timestamp();
    let storage = storage::build_diagnostic_storage_snapshot(storage_state.inner())?;
    let health_status = storage.health.status().to_string();
    let issue_count = storage.health.issue_count();
    let recent_logs = log_state.read_recent_entries(MAX_EXPORTED_LOG_ENTRIES)?;
    let log_entry_count = recent_logs.len();
    let package = DiagnosticPackage {
        format: DIAGNOSTIC_PACKAGE_FORMAT.to_string(),
        package_version: DIAGNOSTIC_PACKAGE_VERSION,
        exported_at: exported_at.clone(),
        app: DiagnosticAppSummary {
            version: env!("CARGO_PKG_VERSION").to_string(),
            runtime: "tauri".to_string(),
            debug: cfg!(debug_assertions),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        },
        storage,
        recent_logs,
    };

    let package_value = serde_json::to_value(package)
        .map(redact_diagnostic_value)
        .map_err(|_| "诊断包序列化失败。".to_string())?;
    let text = serde_json::to_string_pretty(&package_value)
        .map_err(|_| "诊断包序列化失败。".to_string())?;
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位 App 数据目录。".to_string())?
        .join(DIAGNOSTIC_EXPORTS_DIR);
    fs::create_dir_all(&export_dir).map_err(|_| "无法创建诊断包目录。".to_string())?;
    let file_name = format!("duban-diagnostics-{exported_at}.json");
    let path = export_dir.join(&file_name);
    fs::write(&path, text.as_bytes()).map_err(|_| "写入诊断包失败。".to_string())?;
    let byte_size = fs::metadata(&path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();

    let _ = log_state.record_info(
        "diagnostics",
        "package_exported",
        json!({
            "fileName": file_name,
            "byteSize": byte_size,
            "healthStatus": health_status,
            "issueCount": issue_count,
            "logEntryCount": log_entry_count
        }),
    );

    Ok(DiagnosticExportResult {
        path: path.to_string_lossy().to_string(),
        file_name,
        byte_size,
        exported_at,
        health_status,
        issue_count,
        log_entry_count,
    })
}

impl DiagnosticLogState {
    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|_| "无法定位 App 数据目录。".to_string())?;
        Self::initialize_at(app_dir.join(LOGS_DIR), env!("CARGO_PKG_VERSION"))
    }

    fn initialize_at(log_dir: PathBuf, app_version: &str) -> Result<Self, String> {
        fs::create_dir_all(&log_dir).map_err(|_| "无法创建诊断日志目录。".to_string())?;
        let state = Self {
            log_path: log_dir.join(LOG_FILE_NAME),
            rotated_log_path: log_dir.join(ROTATED_LOG_FILE_NAME),
            app_version: app_version.to_string(),
            lock: Mutex::new(()),
        };
        state.rotate_if_needed()?;
        Ok(state)
    }

    pub fn record_info(&self, category: &str, event: &str, fields: Value) -> Result<(), String> {
        self.record(DiagnosticLogLevel::Info, category, event, fields)
    }

    pub fn record_error(&self, category: &str, event: &str, fields: Value) -> Result<(), String> {
        self.record(DiagnosticLogLevel::Error, category, event, fields)
    }

    pub fn read_recent_entries(&self, max_entries: usize) -> Result<Vec<Value>, String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "诊断日志暂时不可用。".to_string())?;
        let mut entries = Vec::new();
        for path in [&self.rotated_log_path, &self.log_path] {
            read_log_entries(path, &mut entries)?;
        }
        let start = entries.len().saturating_sub(max_entries);
        Ok(entries.into_iter().skip(start).collect())
    }

    pub fn record(
        &self,
        level: DiagnosticLogLevel,
        category: &str,
        event: &str,
        fields: Value,
    ) -> Result<(), String> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| "诊断日志暂时不可用。".to_string())?;
        self.rotate_if_needed()?;

        let entry = DiagnosticLogEntry {
            schema_version: LOG_SCHEMA_VERSION,
            timestamp: current_timestamp(),
            level,
            category: sanitize_label(category),
            event: sanitize_label(event),
            app_version: self.app_version.clone(),
            fields: redact_diagnostic_value(fields),
        };
        let line = serde_json::to_string(&entry).map_err(|_| "诊断日志序列化失败。".to_string())?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .map_err(|_| "无法写入诊断日志。".to_string())?;
        file.write_all(line.as_bytes())
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|_| "无法写入诊断日志。".to_string())
    }

    fn rotate_if_needed(&self) -> Result<(), String> {
        let Ok(metadata) = fs::metadata(&self.log_path) else {
            return Ok(());
        };
        if metadata.len() <= MAX_LOG_BYTES {
            return Ok(());
        }
        let _ = fs::remove_file(&self.rotated_log_path);
        fs::rename(&self.log_path, &self.rotated_log_path)
            .map_err(|_| "轮转诊断日志失败。".to_string())
    }
}

fn read_log_entries(path: &PathBuf, entries: &mut Vec<Value>) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let file = fs::File::open(path).map_err(|_| "读取诊断日志失败。".to_string())?;
    let reader = BufReader::new(file);
    for line in reader.lines() {
        let line = line.map_err(|_| "读取诊断日志失败。".to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            entries.push(redact_diagnostic_value(value));
        }
    }
    Ok(())
}

pub fn record_app_event(
    app: &AppHandle,
    level: DiagnosticLogLevel,
    category: &str,
    event: &str,
    fields: Value,
) {
    let state = app.state::<DiagnosticLogState>();
    let _ = state.record(level, category, event, fields);
}

pub fn redact_diagnostic_value(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(redact_diagnostic_object(object)),
        Value::Array(items) => {
            Value::Array(items.into_iter().map(redact_diagnostic_value).collect())
        }
        Value::String(text) => Value::String(sanitize_string(&text)),
        other => other,
    }
}

pub fn url_origin(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    let host = url.host_str()?;
    let mut origin = format!("{}://{}", url.scheme(), host);
    if let Some(port) = url.port() {
        origin.push_str(&format!(":{port}"));
    }
    Some(origin)
}

fn redact_diagnostic_object(object: Map<String, Value>) -> Map<String, Value> {
    object
        .into_iter()
        .map(|(key, value)| {
            let next_value = if is_sensitive_key(&key) {
                Value::String("[redacted]".to_string())
            } else if is_url_key(&key) {
                redact_url_value(value)
            } else {
                redact_diagnostic_value(value)
            };
            (sanitize_label(&key), next_value)
        })
        .collect()
}

fn redact_url_value(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(
            url_origin(&text)
                .unwrap_or_else(|| sanitize_string(&text))
                .chars()
                .take(MAX_STRING_CHARS)
                .collect(),
        ),
        other => redact_diagnostic_value(other),
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = normalize_key(key);
    if normalized.contains("apikey")
        || normalized.contains("authorization")
        || normalized.contains("password")
        || normalized.contains("secret")
        || normalized.contains("credential")
        || normalized.contains("privatekey")
        || normalized == "bearer"
        || normalized == "base64"
        || normalized == "rawjson"
    {
        return true;
    }

    matches!(
        normalized.as_str(),
        "prompt"
            | "system"
            | "messages"
            | "content"
            | "text"
            | "fulltext"
            | "pagetext"
            | "selectedtext"
            | "quote"
            | "excerpt"
            | "note"
            | "notes"
            | "chat"
            | "conversation"
            | "filebase64"
    )
}

fn is_url_key(key: &str) -> bool {
    let normalized = normalize_key(key);
    normalized == "url"
        || normalized == "baseurl"
        || normalized == "origin"
        || normalized.ends_with("url")
        || normalized.ends_with("origin")
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn sanitize_label(value: &str) -> String {
    let cleaned = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || character == '\0' {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    truncate_string(&cleaned, 120)
}

fn sanitize_string(value: &str) -> String {
    truncate_string(&redact_secret_like_text(value), MAX_STRING_CHARS)
}

fn truncate_string(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...[truncated]")
    } else {
        truncated
    }
}

fn redact_secret_like_text(value: &str) -> String {
    let value = replace_bearer_token(value);
    replace_prefixed_secret(&value, "sk-")
}

fn replace_bearer_token(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let mut output = String::new();
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find("bearer ") {
        let start = cursor + relative_start;
        output.push_str(&value[cursor..start]);
        let token_start = start + "bearer ".len();
        let token_end = ascii_token_end(value, token_start);
        if token_end > token_start {
            output.push_str("Bearer [redacted]");
            cursor = token_end;
        } else {
            output.push_str(&value[start..token_start]);
            cursor = token_start;
        }
    }
    output.push_str(&value[cursor..]);
    output
}

fn replace_prefixed_secret(value: &str, prefix: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let mut output = String::new();
    let mut cursor = 0;
    while let Some(relative_start) = lower[cursor..].find(prefix) {
        let start = cursor + relative_start;
        output.push_str(&value[cursor..start]);
        let token_end = ascii_token_end(value, start + prefix.len());
        if token_end.saturating_sub(start) >= 16 {
            output.push_str(prefix);
            output.push_str("[redacted]");
            cursor = token_end;
        } else {
            output.push_str(&value[start..start + prefix.len()]);
            cursor = start + prefix.len();
        }
    }
    output.push_str(&value[cursor..]);
    output
}

fn ascii_token_end(value: &str, start: usize) -> usize {
    let bytes = value.as_bytes();
    let mut end = start;
    while end < bytes.len() {
        let byte = bytes[end];
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
            end += 1;
        } else {
            break;
        }
    }
    end
}

fn current_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn diagnostic_redaction_removes_keys_and_secret_like_text() {
        let redacted = redact_diagnostic_value(json!({
            "apiKey": "sk-ant-example-example-example-example",
            "authorization": "Bearer abcdefghijklmnopqrstuvwxyz",
            "inputTokens": 42,
            "messages": [{ "role": "user", "content": "private page text" }],
            "errorMessage": "provider rejected sk-ant-example-example-example-example",
            "baseUrl": "https://api.example.com/v1/chat?secret=bad"
        }));

        assert_eq!(redacted["apiKey"], "[redacted]");
        assert_eq!(redacted["authorization"], "[redacted]");
        assert_eq!(redacted["messages"], "[redacted]");
        assert_eq!(redacted["inputTokens"], 42);
        assert_eq!(redacted["baseUrl"], "https://api.example.com");
        assert_eq!(redacted["errorMessage"], "provider rejected sk-[redacted]");
    }

    #[test]
    fn diagnostic_log_writes_jsonl_with_redaction() {
        let root = std::env::temp_dir().join(format!(
            "duban-diagnostics-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let state =
            DiagnosticLogState::initialize_at(root.clone(), "test-version").expect("init logger");

        state
            .record_info(
                "test",
                "write",
                json!({
                    "apiKey": "sk-ant-example-example-example-example",
                    "messageCount": 1
                }),
            )
            .expect("write log");

        let text = fs::read_to_string(root.join(LOG_FILE_NAME)).expect("read log");
        assert!(text.contains("\"event\":\"write\""));
        assert!(text.contains("\"messageCount\":1"));
        assert!(!text.contains("example-example"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn url_origin_keeps_only_origin() {
        assert_eq!(
            url_origin("https://api.example.com/v1/chat?key=secret").as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(
            url_origin("http://localhost:11434/v1").as_deref(),
            Some("http://localhost:11434")
        );
    }

    #[test]
    fn labels_drop_control_characters() {
        assert_eq!(sanitize_label("ai\nrequest"), "ai_request");
    }

    #[test]
    fn non_secret_short_sk_text_is_left_readable() {
        assert_eq!(redact_secret_like_text("missing sk-"), "missing sk-");
    }
}
