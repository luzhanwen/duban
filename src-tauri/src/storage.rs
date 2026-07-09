use crate::diagnostics::DiagnosticLogState;
use base64::{engine::general_purpose, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const BOOKS_KEY: &str = "books";
const SETTINGS_KEY: &str = "settings";
const PROGRESS_PREFIX: &str = "progress:";
const BOOK_PREFIX: &str = "book:";
const FILE_SUFFIX: &str = ":file";
const PAGES_SUFFIX: &str = ":pages";
const NOTES_SUFFIX: &str = ":notes";
const CHAT_SUFFIX: &str = ":chat";
const REFLECTION_SUFFIX: &str = ":reflection";
const COVER_SUFFIX: &str = ":cover";
const FORMATTED_TEXT_MARKER: &str = ":formatted-text:";
const QUESTIONS_MARKER: &str = ":questions:";
const KEYCHAIN_SERVICE: &str = "com.duban.reader.ai";
const KEYCHAIN_ANTHROPIC_ACCOUNT: &str = "anthropic.apiKey";
const KEYCHAIN_OPENAI_COMPATIBLE_ACCOUNT: &str = "openaiCompatible.apiKey";
const CURRENT_SCHEMA_VERSION: &str = "9";
const BACKUP_FORMAT: &str = "duban.local-backup";
const BACKUP_VERSION: u32 = 3;
const BACKUP_MANIFEST_FILE: &str = "manifest.json";
const BACKUP_FILES_DIR: &str = "files";

pub(crate) fn current_schema_version() -> &'static str {
    CURRENT_SCHEMA_VERSION
}

#[derive(Clone, Copy, Default)]
struct SettingsKeyStatus {
    anthropic: bool,
    openai_compatible: bool,
}

pub struct StorageState {
    conn: Mutex<Connection>,
    files_dir: PathBuf,
    backups_dir: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredItem {
    kind: String,
    value: Option<Value>,
    file: Option<StoredFileRead>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFileWrite {
    name: String,
    mime_type: String,
    base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFileRead {
    name: String,
    mime_type: String,
    size: u64,
    base64: String,
    local_path: Option<String>,
    relative_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBackup {
    format: String,
    backup_version: u32,
    schema_version: String,
    exported_at: String,
    app: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    manifest_sha256: Option<String>,
    includes_api_keys: bool,
    items: Vec<BackupItem>,
    files: Vec<BackupFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupItem {
    key: String,
    value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    key: String,
    name: String,
    mime_type: String,
    #[serde(default)]
    base64: String,
    #[serde(default)]
    relative_path: Option<String>,
    #[serde(default)]
    byte_size: Option<u64>,
    #[serde(default)]
    sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    backup_id: String,
    path: String,
    file_name: String,
    item_count: usize,
    file_count: usize,
    byte_size: u64,
    exported_at: String,
    manifest_sha256: Option<String>,
    includes_api_keys: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportResult {
    item_count: usize,
    file_count: usize,
    mode: String,
    imported_at: String,
    schema_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportRequest {
    backup_id: String,
    mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPathRequest {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPathImportRequest {
    path: String,
    mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMetadataUpdateRequest {
    backup_id: String,
    label: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupDeleteResult {
    backup_id: String,
    deleted_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    backup_id: String,
    path: String,
    label: Option<String>,
    notes: Option<String>,
    exported_at: String,
    schema_version: String,
    backup_version: u32,
    manifest_sha256: Option<String>,
    item_count: usize,
    file_count: usize,
    byte_size: u64,
    includes_api_keys: bool,
    valid: bool,
    issue_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    backup_id: String,
    path: String,
    label: Option<String>,
    notes: Option<String>,
    exported_at: String,
    schema_version: String,
    backup_version: u32,
    manifest_sha256: Option<String>,
    item_count: usize,
    file_count: usize,
    byte_size: u64,
    includes_api_keys: bool,
    book_count: usize,
    page_count: usize,
    progress_count: usize,
    note_count: usize,
    chat_count: usize,
    reflection_count: usize,
    guide_count: usize,
    formatted_text_count: usize,
    cover_count: usize,
    issues: Vec<BackupIssue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupIssue {
    severity: String,
    code: String,
    message: String,
    key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanFileReport {
    orphan_count: usize,
    byte_size: u64,
    files: Vec<OrphanFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanFile {
    relative_path: String,
    byte_size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanFileCleanupResult {
    deleted_count: usize,
    byte_size: u64,
    files: Vec<OrphanFile>,
    cleaned_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageHealthReport {
    checked_at: String,
    status: String,
    issue_count: usize,
    schema_version: String,
    expected_schema_version: String,
    sqlite_quick_check: String,
    table_counts: Vec<TableCount>,
    files: FileHealthReport,
    backups: DirectoryAccessReport,
    settings_key_status: DiagnosticSettingsKeyStatus,
    issues: Vec<StorageHealthIssue>,
}

impl StorageHealthReport {
    pub(crate) fn status(&self) -> &str {
        &self.status
    }

    pub(crate) fn issue_count(&self) -> usize {
        self.issue_count
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableCount {
    table: String,
    count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHealthReport {
    referenced_file_count: usize,
    missing_file_count: usize,
    unsafe_path_count: usize,
    orphan_count: usize,
    orphan_byte_size: u64,
    missing_files: Vec<MissingFile>,
    orphan_files: Vec<OrphanFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingFile {
    source: String,
    key: Option<String>,
    book_id: Option<String>,
    relative_path: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryAccessReport {
    name: String,
    exists: bool,
    readable: bool,
    writable: bool,
    issue: Option<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSettingsKeyStatus {
    anthropic_has_api_key: bool,
    openai_compatible_has_api_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageHealthIssue {
    severity: String,
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticStorageSnapshot {
    pub health: StorageHealthReport,
    pub backups: Vec<DiagnosticBackupSummary>,
    pub settings: Value,
    pub ai_diagnostics: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticBackupSummary {
    backup_id: String,
    exported_at: String,
    schema_version: String,
    backup_version: u32,
    item_count: usize,
    file_count: usize,
    byte_size: u64,
    includes_api_keys: bool,
    valid: bool,
    issue_count: usize,
}

impl StorageState {
    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|_| "无法定位 App 数据目录。".to_string())?;
        fs::create_dir_all(&app_dir).map_err(|_| "无法创建 App 数据目录。".to_string())?;

        let files_dir = app_dir.join("files");
        fs::create_dir_all(&files_dir).map_err(|_| "无法创建书籍文件目录。".to_string())?;
        let backups_dir = app_dir.join("backups");
        fs::create_dir_all(&backups_dir).map_err(|_| "无法创建备份目录。".to_string())?;

        let db_path = app_dir.join("duban.sqlite3");
        let mut conn =
            Connection::open(db_path).map_err(|_| "无法打开本地 SQLite 数据库。".to_string())?;
        initialize_schema(&mut conn, &files_dir)?;

        Ok(Self {
            conn: Mutex::new(conn),
            files_dir,
            backups_dir,
        })
    }
}

#[tauri::command]
pub fn duban_storage_get_item(
    key: String,
    state: State<'_, StorageState>,
) -> Result<Option<StoredItem>, String> {
    if key.trim().is_empty() {
        return Ok(None);
    }
    validate_key(&key)?;

    if key == BOOKS_KEY {
        let conn = lock_conn(&state)?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(load_books(&conn)?),
            file: None,
        }));
    }
    if key == SETTINGS_KEY {
        let conn = lock_conn(&state)?;
        return Ok(load_settings(&conn)?.map(|value| StoredItem {
            kind: "json".to_string(),
            value: Some(value),
            file: None,
        }));
    }
    if let Some(book_id) = progress_book_id(&key) {
        let conn = lock_conn(&state)?;
        return Ok(load_progress(&conn, book_id)?.map(|value| StoredItem {
            kind: "json".to_string(),
            value: Some(value),
            file: None,
        }));
    }
    if let Some(book_id) = book_suffix_id(&key, PAGES_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(load_pages(&conn, book_id)?),
            file: None,
        }));
    }
    if let Some(book_id) = book_suffix_id(&key, FILE_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(load_book_file_item(&conn, &state.files_dir, book_id)?);
    }
    if let Some(book_id) = book_suffix_id(&key, NOTES_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(load_notes(&conn, book_id)?),
            file: None,
        }));
    }
    if let Some(book_id) = book_suffix_id(&key, CHAT_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(load_messages(&conn, "chat_messages", book_id)?),
            file: None,
        }));
    }
    if let Some(book_id) = book_suffix_id(&key, REFLECTION_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(load_messages(&conn, "reflection_messages", book_id)?),
            file: None,
        }));
    }
    if let Some((book_id, item_key)) = guide_key_parts(&key) {
        let conn = lock_conn(&state)?;
        return Ok(
            load_guide(&conn, book_id, item_key)?.map(|value| StoredItem {
                kind: "json".to_string(),
                value: Some(value),
                file: None,
            }),
        );
    }
    if let Some(book_id) = book_suffix_id(&key, COVER_SUFFIX) {
        let conn = lock_conn(&state)?;
        return Ok(
            load_book_cover(&conn, &state.files_dir, book_id)?.map(|value| StoredItem {
                kind: "json".to_string(),
                value: Some(value),
                file: None,
            }),
        );
    }
    if let Some((book_id, item_key)) = formatted_text_key_parts(&key) {
        let conn = lock_conn(&state)?;
        return Ok(
            load_formatted_text(&conn, book_id, item_key)?.map(|value| StoredItem {
                kind: "json".to_string(),
                value: Some(value),
                file: None,
            }),
        );
    }

    let json_value = {
        let conn = lock_conn(&state)?;
        conn.query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![&key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取本地数据失败。".to_string())?
    };

    if let Some(text) = json_value {
        let value = serde_json::from_str(&text).map_err(|_| "本地数据格式损坏。".to_string())?;
        return Ok(Some(StoredItem {
            kind: "json".to_string(),
            value: Some(value),
            file: None,
        }));
    }

    let file_record = {
        let conn = lock_conn(&state)?;
        conn.query_row(
            "SELECT file_name, mime_type, file_size, relative_path FROM file_store WHERE key = ?1",
            params![&key],
            |row| {
                Ok(FileRecord {
                    file_name: row.get(0)?,
                    mime_type: row.get(1)?,
                    file_size: row.get::<_, i64>(2)?,
                    relative_path: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|_| "读取本地文件索引失败。".to_string())?
    };

    let Some(record) = file_record else {
        return Ok(None);
    };

    stored_file_item(&state.files_dir, record).map(Some)
}

#[tauri::command]
pub fn duban_storage_set_item(
    key: String,
    value: Value,
    state: State<'_, StorageState>,
) -> Result<Value, String> {
    validate_key(&key)?;
    let previous_file_path = {
        let mut conn = lock_conn(&state)?;
        sync_json_key(&mut conn, &state.files_dir, &key, &value)?
    };
    remove_file_if_exists(previous_file_path)?;
    Ok(value)
}

fn sync_json_key(
    conn: &mut Connection,
    files_dir: &Path,
    key: &str,
    value: &Value,
) -> Result<Option<PathBuf>, String> {
    if key == BOOKS_KEY {
        sync_books(conn, value)?;
        return Ok(None);
    }
    if key == SETTINGS_KEY {
        sync_settings(conn, value)?;
        return Ok(None);
    }
    if let Some(book_id) = progress_book_id(&key) {
        sync_progress(conn, book_id, value)?;
        return Ok(None);
    }
    if let Some(book_id) = book_suffix_id(&key, PAGES_SUFFIX) {
        sync_pages(conn, book_id, value)?;
        return Ok(None);
    }
    if let Some(book_id) = book_suffix_id(&key, NOTES_SUFFIX) {
        sync_notes(conn, book_id, value)?;
        return Ok(None);
    }
    if let Some(book_id) = book_suffix_id(&key, CHAT_SUFFIX) {
        sync_messages(conn, "chat_messages", book_id, value)?;
        return Ok(None);
    }
    if let Some(book_id) = book_suffix_id(&key, REFLECTION_SUFFIX) {
        sync_messages(conn, "reflection_messages", book_id, value)?;
        return Ok(None);
    }
    if let Some((book_id, item_key)) = guide_key_parts(&key) {
        sync_guide(conn, book_id, item_key, value)?;
        return Ok(None);
    }
    if let Some(book_id) = book_suffix_id(key, COVER_SUFFIX) {
        return sync_book_cover(conn, files_dir, book_id, value);
    }
    if let Some((book_id, item_key)) = formatted_text_key_parts(key) {
        sync_formatted_text(conn, book_id, item_key, value)?;
        return Ok(None);
    }

    let text = serde_json::to_string(value).map_err(|_| "本地数据序列化失败。".to_string())?;
    let previous_file_path = file_path_for_key(conn, files_dir, key)?;
    conn.execute(
        "INSERT INTO kv_store (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, text],
    )
    .map_err(|_| "写入本地数据失败。".to_string())?;
    if let Some(book_id) = book_suffix_id(key, FILE_SUFFIX) {
        conn.execute(
            "DELETE FROM book_files WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "清理旧书籍文件索引失败。".to_string())?;
    }
    conn.execute("DELETE FROM file_store WHERE key = ?1", params![key])
        .map_err(|_| "清理旧文件索引失败。".to_string())?;
    Ok(previous_file_path)
}

#[tauri::command]
pub fn duban_storage_set_file(
    key: String,
    file: StoredFileWrite,
    state: State<'_, StorageState>,
) -> Result<StoredFileRead, String> {
    validate_key(&key)?;
    let conn = lock_conn(&state)?;
    sync_file_key(&conn, &state.files_dir, &key, file)
}

fn sync_file_key(
    conn: &Connection,
    files_dir: &Path,
    key: &str,
    file: StoredFileWrite,
) -> Result<StoredFileRead, String> {
    let bytes = general_purpose::STANDARD
        .decode(file.base64.as_bytes())
        .map_err(|_| "本地文件内容解码失败。".to_string())?;
    let relative_path = key_to_file_name(&key);
    let path = files_dir.join(&relative_path);
    let file_name = clean_file_name(&file.name);
    let mime_type = file.mime_type;
    let file_size = bytes.len() as u64;
    let sha256 = sha256_hex(&bytes);
    fs::write(&path, &bytes).map_err(|_| "写入本地书籍文件失败。".to_string())?;

    let previous_file_path = file_path_for_key(conn, files_dir, key)?;
    if let Some(book_id) = book_suffix_id(key, FILE_SUFFIX) {
        conn.execute(
            "INSERT INTO book_files (
              book_id, file_name, mime_type, file_size, relative_path, sha256,
              import_source, last_verified_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'local-write', datetime('now'), datetime('now'), datetime('now'))
            ON CONFLICT(book_id) DO UPDATE SET
              file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              file_size = excluded.file_size,
              relative_path = excluded.relative_path,
              sha256 = excluded.sha256,
              import_source = excluded.import_source,
              last_verified_at = excluded.last_verified_at,
              updated_at = excluded.updated_at",
            params![
                book_id,
                &file_name,
                &mime_type,
                file_size as i64,
                &relative_path,
                &sha256
            ],
        )
        .map_err(|_| "写入书籍文件索引失败。".to_string())?;
        conn.execute("DELETE FROM file_store WHERE key = ?1", params![key])
            .map_err(|_| "清理旧文件索引失败。".to_string())?;
    } else {
        conn.execute(
            "INSERT INTO file_store (key, file_name, mime_type, file_size, relative_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
               file_name = excluded.file_name,
               mime_type = excluded.mime_type,
               file_size = excluded.file_size,
               relative_path = excluded.relative_path,
               updated_at = excluded.updated_at",
            params![
                key,
                &file_name,
                &mime_type,
                file_size as i64,
                &relative_path
            ],
        )
        .map_err(|_| "写入本地文件索引失败。".to_string())?;
    }
    conn.execute("DELETE FROM kv_store WHERE key = ?1", params![key])
        .map_err(|_| "清理旧数据失败。".to_string())?;

    if previous_file_path.as_deref() != Some(path.as_path()) {
        remove_file_if_exists(previous_file_path)?;
    }

    Ok(StoredFileRead {
        name: file_name,
        mime_type,
        size: file_size,
        base64: String::new(),
        local_path: Some(path.to_string_lossy().to_string()),
        relative_path: Some(relative_path),
    })
}

#[tauri::command]
pub fn duban_storage_remove_item(
    key: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    if key.trim().is_empty() {
        return Ok(());
    }
    validate_key(&key)?;

    if key == BOOKS_KEY {
        let conn = lock_conn(&state)?;
        conn.execute("DELETE FROM reading_plan_items", [])
            .map_err(|_| "删除阅读计划项失败。".to_string())?;
        conn.execute("DELETE FROM reading_plans", [])
            .map_err(|_| "删除阅读计划失败。".to_string())?;
        conn.execute("DELETE FROM book_chapters", [])
            .map_err(|_| "删除书籍章节索引失败。".to_string())?;
        conn.execute("DELETE FROM books", [])
            .map_err(|_| "删除书籍元数据失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![BOOKS_KEY])
            .map_err(|_| "清理旧书籍数据失败。".to_string())?;
        return Ok(());
    }
    if key == SETTINGS_KEY {
        let conn = lock_conn(&state)?;
        conn.execute("DELETE FROM app_settings WHERE id = 'settings'", [])
            .map_err(|_| "删除设置失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![SETTINGS_KEY])
            .map_err(|_| "删除设置失败。".to_string())?;
        delete_settings_secrets()?;
        return Ok(());
    }
    if let Some(book_id) = progress_book_id(&key) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM reading_item_progress WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "删除阅读项进度失败。".to_string())?;
        conn.execute(
            "DELETE FROM reading_progress WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "删除阅读进度失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧阅读进度失败。".to_string())?;
        return Ok(());
    }
    if let Some(book_id) = book_suffix_id(&key, PAGES_SUFFIX) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM book_pages WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "删除分页文本失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧分页文本失败。".to_string())?;
        return Ok(());
    }
    if let Some(book_id) = book_suffix_id(&key, FILE_SUFFIX) {
        let previous_file_path = {
            let conn = lock_conn(&state)?;
            let previous_file_path = file_path_for_key(&conn, &state.files_dir, &key)?;
            conn.execute(
                "DELETE FROM book_files WHERE book_id = ?1",
                params![book_id],
            )
            .map_err(|_| "删除书籍文件索引失败。".to_string())?;
            conn.execute("DELETE FROM file_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧文件索引失败。".to_string())?;
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧文件数据失败。".to_string())?;
            previous_file_path
        };
        return remove_file_if_exists(previous_file_path);
    }
    if let Some(book_id) = book_suffix_id(&key, NOTES_SUFFIX) {
        let conn = lock_conn(&state)?;
        conn.execute("DELETE FROM notes WHERE book_id = ?1", params![book_id])
            .map_err(|_| "删除笔记失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧笔记失败。".to_string())?;
        return Ok(());
    }
    if let Some(book_id) = book_suffix_id(&key, CHAT_SUFFIX) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM chat_messages WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "删除伴读聊天失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧伴读聊天失败。".to_string())?;
        return Ok(());
    }
    if let Some(book_id) = book_suffix_id(&key, REFLECTION_SUFFIX) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM reflection_messages WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|_| "删除读后交流失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧读后交流失败。".to_string())?;
        return Ok(());
    }
    if let Some((book_id, item_key)) = guide_key_parts(&key) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM reading_guides WHERE book_id = ?1 AND item_key = ?2",
            params![book_id, item_key],
        )
        .map_err(|_| "删除章节导读缓存失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧章节导读缓存失败。".to_string())?;
        return Ok(());
    }
    if let Some(book_id) = book_suffix_id(&key, COVER_SUFFIX) {
        let previous_file_path = {
            let conn = lock_conn(&state)?;
            let previous_file_path = cover_file_path(&conn, &state.files_dir, book_id)?;
            conn.execute(
                "DELETE FROM book_covers WHERE book_id = ?1",
                params![book_id],
            )
            .map_err(|_| "删除封面缓存失败。".to_string())?;
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧封面缓存失败。".to_string())?;
            previous_file_path
        };
        return remove_file_if_exists(previous_file_path);
    }
    if let Some((book_id, item_key)) = formatted_text_key_parts(&key) {
        let conn = lock_conn(&state)?;
        conn.execute(
            "DELETE FROM formatted_texts WHERE book_id = ?1 AND item_key = ?2",
            params![book_id, item_key],
        )
        .map_err(|_| "删除 AI 排版缓存失败。".to_string())?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧 AI 排版缓存失败。".to_string())?;
        return Ok(());
    }

    let previous_file_path = {
        let conn = lock_conn(&state)?;
        let previous_file_path = file_path_for_key(&conn, &state.files_dir, &key)?;
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
            .map_err(|_| "删除本地数据失败。".to_string())?;
        conn.execute("DELETE FROM file_store WHERE key = ?1", params![&key])
            .map_err(|_| "删除本地文件索引失败。".to_string())?;
        previous_file_path
    };

    remove_file_if_exists(previous_file_path)
}

#[tauri::command]
pub fn duban_storage_delete_book(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<bool, String> {
    let book_id = book_id.trim().to_string();
    if book_id.is_empty() {
        return Ok(false);
    }
    validate_book_id(&book_id)?;

    let file_paths = {
        let mut conn = lock_conn(&state)?;
        delete_book_records(&mut conn, &state.files_dir, &book_id)?
    };

    let mut seen_paths = BTreeSet::new();
    for path in file_paths {
        if seen_paths.insert(path.clone()) {
            let _ = remove_file_if_exists(Some(path));
        }
    }

    Ok(true)
}

#[tauri::command]
pub fn duban_storage_keys(state: State<'_, StorageState>) -> Result<Vec<String>, String> {
    let conn = lock_conn(&state)?;
    list_storage_keys(&conn)
}

fn list_storage_keys(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT key FROM kv_store
             UNION
             SELECT key FROM file_store
             UNION
             SELECT 'settings' WHERE EXISTS (SELECT 1 FROM app_settings WHERE id = 'settings')
             UNION
             SELECT 'books' WHERE EXISTS (SELECT 1 FROM books)
             UNION
             SELECT 'progress:' || book_id FROM reading_progress
             UNION
             SELECT 'book:' || book_id || ':pages' FROM book_pages GROUP BY book_id
             UNION
             SELECT 'book:' || book_id || ':file' FROM book_files
             UNION
             SELECT 'book:' || book_id || ':notes' FROM notes GROUP BY book_id
             UNION
             SELECT 'book:' || book_id || ':chat' FROM chat_messages GROUP BY book_id
             UNION
             SELECT 'book:' || book_id || ':reflection' FROM reflection_messages GROUP BY book_id
             UNION
             SELECT 'book:' || book_id || ':questions:' || item_key FROM reading_guides
             UNION
             SELECT 'book:' || book_id || ':cover' FROM book_covers
             UNION
             SELECT 'book:' || book_id || ':formatted-text:' || item_key FROM formatted_texts
             ORDER BY key",
        )
        .map_err(|_| "读取本地数据索引失败。".to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "读取本地数据索引失败。".to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "读取本地数据索引失败。".to_string())
}

#[tauri::command]
pub fn duban_storage_clear(state: State<'_, StorageState>) -> Result<(), String> {
    let conn = lock_conn(&state)?;
    clear_storage_data(&conn, &state.files_dir, true)
}

#[tauri::command]
pub fn duban_storage_scan_orphan_files(
    state: State<'_, StorageState>,
) -> Result<OrphanFileReport, String> {
    let conn = lock_conn(&state)?;
    scan_orphan_files(&conn, &state.files_dir)
}

#[tauri::command]
pub fn duban_storage_delete_orphan_files(
    state: State<'_, StorageState>,
) -> Result<OrphanFileCleanupResult, String> {
    let report = {
        let conn = lock_conn(&state)?;
        scan_orphan_files(&conn, &state.files_dir)?
    };

    for file in &report.files {
        let path = safe_file_path(&state.files_dir, &file.relative_path)?;
        if path.is_file() {
            fs::remove_file(path).map_err(|_| "删除孤儿文件失败。".to_string())?;
        }
    }

    Ok(OrphanFileCleanupResult {
        deleted_count: report.orphan_count,
        byte_size: report.byte_size,
        files: report.files,
        cleaned_at: current_timestamp(),
    })
}

fn clear_storage_data(
    conn: &Connection,
    files_dir: &Path,
    delete_secrets: bool,
) -> Result<(), String> {
    let preserved_key_status = if delete_secrets {
        SettingsKeyStatus::default()
    } else {
        load_settings(conn)?
            .as_ref()
            .map(settings_key_status)
            .unwrap_or_default()
    };

    conn.execute("DELETE FROM kv_store", [])
        .map_err(|_| "清空本地数据失败。".to_string())?;
    conn.execute("DELETE FROM app_settings", [])
        .map_err(|_| "清空设置失败。".to_string())?;
    conn.execute("DELETE FROM file_store", [])
        .map_err(|_| "清空本地文件索引失败。".to_string())?;
    conn.execute("DELETE FROM book_covers", [])
        .map_err(|_| "清空封面缓存失败。".to_string())?;
    conn.execute("DELETE FROM formatted_texts", [])
        .map_err(|_| "清空 AI 排版缓存失败。".to_string())?;
    conn.execute("DELETE FROM book_files", [])
        .map_err(|_| "清空书籍文件索引失败。".to_string())?;
    conn.execute("DELETE FROM book_pages", [])
        .map_err(|_| "清空分页文本失败。".to_string())?;
    conn.execute("DELETE FROM reading_guides", [])
        .map_err(|_| "清空章节导读缓存失败。".to_string())?;
    conn.execute("DELETE FROM reflection_messages", [])
        .map_err(|_| "清空读后交流失败。".to_string())?;
    conn.execute("DELETE FROM chat_messages", [])
        .map_err(|_| "清空伴读聊天失败。".to_string())?;
    conn.execute("DELETE FROM notes", [])
        .map_err(|_| "清空笔记失败。".to_string())?;
    conn.execute("DELETE FROM reading_item_progress", [])
        .map_err(|_| "清空阅读项进度失败。".to_string())?;
    conn.execute("DELETE FROM reading_progress", [])
        .map_err(|_| "清空阅读进度失败。".to_string())?;
    conn.execute("DELETE FROM reading_plan_items", [])
        .map_err(|_| "清空阅读计划项失败。".to_string())?;
    conn.execute("DELETE FROM reading_plans", [])
        .map_err(|_| "清空阅读计划失败。".to_string())?;
    conn.execute("DELETE FROM book_chapters", [])
        .map_err(|_| "清空书籍章节索引失败。".to_string())?;
    conn.execute("DELETE FROM books", [])
        .map_err(|_| "清空书籍元数据失败。".to_string())?;

    if delete_secrets {
        delete_settings_secrets()?;
    } else {
        restore_settings_key_status(conn, preserved_key_status)?;
    }

    if files_dir.exists() {
        fs::remove_dir_all(files_dir).map_err(|_| "清空本地书籍文件失败。".to_string())?;
    }
    fs::create_dir_all(files_dir).map_err(|_| "重建本地书籍目录失败。".to_string())
}

#[tauri::command]
pub fn duban_storage_export_backup(
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupExportResult, String> {
    let result: Result<BackupExportResult, String> = (|| {
        let exported_at = current_timestamp();
        let backup_id = format!("duban-backup-{exported_at}");
        let backup_dir = unique_backup_dir(&state.backups_dir, &backup_id)?;
        let backup_id = backup_dir
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&backup_id)
            .to_string();
        let backup_files_dir = backup_dir.join(BACKUP_FILES_DIR);
        fs::create_dir_all(&backup_files_dir).map_err(|_| "创建备份文件目录失败。".to_string())?;
        let mut backup = {
            let conn = lock_conn(&state)?;
            build_storage_backup(
                &conn,
                &state.files_dir,
                &exported_at,
                Some(&backup_files_dir),
            )?
        };
        let path = backup_dir.join(BACKUP_MANIFEST_FILE);
        write_backup_manifest(&path, &mut backup)?;
        let byte_size = directory_size(&backup_dir)?;
        let manifest_sha256 = backup.manifest_sha256.clone();

        Ok(BackupExportResult {
            backup_id,
            path: backup_dir.to_string_lossy().to_string(),
            file_name: BACKUP_MANIFEST_FILE.to_string(),
            item_count: backup.items.len(),
            file_count: backup.files.len(),
            byte_size,
            exported_at,
            manifest_sha256,
            includes_api_keys: backup.includes_api_keys,
        })
    })();

    match &result {
        Ok(export) => record_backup_event(
            diagnostic_log.inner(),
            "export_succeeded",
            json!({
                "backupId": export.backup_id,
                "itemCount": export.item_count,
                "fileCount": export.file_count,
                "byteSize": export.byte_size,
                "includesApiKeys": export.includes_api_keys
            }),
        ),
        Err(error) => {
            record_backup_error(diagnostic_log.inner(), "export_failed", error, json!({}))
        }
    }

    result
}

#[tauri::command]
pub fn duban_storage_import_backup(
    backup: StorageBackup,
    mode: Option<String>,
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupImportResult, String> {
    let import_mode = mode.unwrap_or_else(|| "replace".to_string());
    let item_count = backup.items.len();
    let file_count = backup.files.len();
    let schema_version = backup.schema_version.clone();
    let backup_version = backup.backup_version;
    let result: Result<BackupImportResult, String> =
        restore_storage_backup(backup, None, &import_mode, &state);

    match &result {
        Ok(import) => record_backup_event(
            diagnostic_log.inner(),
            "import_succeeded",
            json!({
                "source": "inline_json",
                "mode": import.mode,
                "itemCount": import.item_count,
                "fileCount": import.file_count,
                "schemaVersion": import.schema_version
            }),
        ),
        Err(error) => record_backup_error(
            diagnostic_log.inner(),
            "import_failed",
            error,
            json!({
                "source": "inline_json",
                "mode": import_mode,
                "itemCount": item_count,
                "fileCount": file_count,
                "schemaVersion": schema_version,
                "backupVersion": backup_version
            }),
        ),
    }

    result
}

#[tauri::command]
pub fn duban_storage_list_backups(
    state: State<'_, StorageState>,
) -> Result<Vec<BackupSummary>, String> {
    let mut summaries = Vec::new();
    if !state.backups_dir.exists() {
        return Ok(summaries);
    }

    let entries = fs::read_dir(&state.backups_dir).map_err(|_| "读取备份目录失败。".to_string())?;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Some(backup_id) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok((backup, base_dir, display_path)) = load_backup_by_id(&state.backups_dir, backup_id)
        else {
            continue;
        };
        if backup_id.starts_with('.') {
            continue;
        }
        let preview = build_backup_preview(backup_id, &display_path, &backup, base_dir.as_deref());
        summaries.push(BackupSummary {
            backup_id: backup_id.to_string(),
            path: display_path.to_string_lossy().to_string(),
            label: preview.label.clone(),
            notes: preview.notes.clone(),
            exported_at: backup.exported_at,
            schema_version: backup.schema_version,
            backup_version: backup.backup_version,
            manifest_sha256: preview.manifest_sha256.clone(),
            item_count: preview.item_count,
            file_count: preview.file_count,
            byte_size: preview.byte_size,
            includes_api_keys: preview.includes_api_keys,
            valid: preview.issues.iter().all(|issue| issue.severity != "error"),
            issue_count: preview.issues.len(),
        });
    }
    summaries.sort_by(|left, right| right.exported_at.cmp(&left.exported_at));
    Ok(summaries)
}

pub(crate) fn build_storage_health_report(
    state: &StorageState,
) -> Result<StorageHealthReport, String> {
    let conn = lock_conn(state)?;
    let schema_version = read_schema_version(&conn)?;
    let sqlite_quick_check = sqlite_quick_check(&conn)?;
    let table_counts = diagnostic_table_counts(&conn)?;
    let files = build_file_health_report(&conn, &state.files_dir)?;
    let backups = check_directory_access("backups", &state.backups_dir);
    let settings_key_status = diagnostic_settings_key_status(&conn)?;
    let mut issues = Vec::new();

    if schema_version != CURRENT_SCHEMA_VERSION {
        issues.push(storage_health_issue(
            "error",
            "schema-version-mismatch",
            "本地数据库 schema 版本与当前 App 期望版本不一致。",
        ));
    }
    if sqlite_quick_check != "ok" {
        issues.push(storage_health_issue(
            "error",
            "sqlite-quick-check-failed",
            "SQLite quick_check 未通过。",
        ));
    }
    if files.missing_file_count > 0 {
        issues.push(storage_health_issue(
            "error",
            "missing-local-files",
            "本地文件索引指向的文件缺失。",
        ));
    }
    if files.unsafe_path_count > 0 {
        issues.push(storage_health_issue(
            "error",
            "unsafe-local-file-paths",
            "本地文件索引中存在不安全相对路径。",
        ));
    }
    if files.orphan_count > 0 {
        issues.push(storage_health_issue(
            "warn",
            "orphan-local-files",
            "本地文件目录存在未被 SQLite 引用的文件。",
        ));
    }
    if !backups.readable {
        issues.push(storage_health_issue(
            "error",
            "backups-dir-unreadable",
            "备份目录不可读。",
        ));
    }
    if !backups.writable {
        issues.push(storage_health_issue(
            "error",
            "backups-dir-unwritable",
            "备份目录不可写。",
        ));
    }

    let status = if issues.iter().any(|issue| issue.severity == "error") {
        "error"
    } else if issues.iter().any(|issue| issue.severity == "warn") {
        "warn"
    } else {
        "ok"
    }
    .to_string();

    Ok(StorageHealthReport {
        checked_at: current_timestamp(),
        status,
        issue_count: issues.len(),
        schema_version,
        expected_schema_version: CURRENT_SCHEMA_VERSION.to_string(),
        sqlite_quick_check,
        table_counts,
        files,
        backups,
        settings_key_status,
        issues,
    })
}

pub(crate) fn build_diagnostic_storage_snapshot(
    state: &StorageState,
) -> Result<DiagnosticStorageSnapshot, String> {
    let health = build_storage_health_report(state)?;
    let conn = lock_conn(state)?;
    Ok(DiagnosticStorageSnapshot {
        health,
        backups: list_diagnostic_backup_summaries(state)?,
        settings: diagnostic_settings_summary(&conn)?,
        ai_diagnostics: diagnostic_ai_diagnostics(&conn)?,
    })
}

#[tauri::command]
pub fn duban_storage_preview_backup(
    backup_id: String,
    state: State<'_, StorageState>,
) -> Result<BackupPreview, String> {
    let (backup, base_dir, display_path) = load_backup_by_id(&state.backups_dir, &backup_id)?;
    Ok(build_backup_preview(
        &backup_id,
        &display_path,
        &backup,
        base_dir.as_deref(),
    ))
}

#[tauri::command]
pub fn duban_storage_import_backup_id(
    request: BackupImportRequest,
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupImportResult, String> {
    let backup_id = request.backup_id.clone();
    let import_mode = request.mode.clone();
    let result: Result<BackupImportResult, String> = (|| {
        let (backup, base_dir, _) = load_backup_by_id(&state.backups_dir, &request.backup_id)?;
        restore_storage_backup(backup, base_dir.as_deref(), &request.mode, &state)
    })();

    match &result {
        Ok(import) => record_backup_event(
            diagnostic_log.inner(),
            "import_succeeded",
            json!({
                "source": "managed_backup",
                "backupId": backup_id,
                "mode": import.mode,
                "itemCount": import.item_count,
                "fileCount": import.file_count,
                "schemaVersion": import.schema_version
            }),
        ),
        Err(error) => record_backup_error(
            diagnostic_log.inner(),
            "import_failed",
            error,
            json!({
                "source": "managed_backup",
                "backupId": backup_id,
                "mode": import_mode
            }),
        ),
    }

    result
}

#[tauri::command]
pub fn duban_storage_preview_backup_path(
    request: BackupPathRequest,
    _state: State<'_, StorageState>,
) -> Result<BackupPreview, String> {
    let (backup, base_dir, display_path, backup_id) = load_backup_by_path(&request.path)?;
    Ok(build_backup_preview(
        &backup_id,
        &display_path,
        &backup,
        base_dir.as_deref(),
    ))
}

#[tauri::command]
pub fn duban_storage_import_backup_path(
    request: BackupPathImportRequest,
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupImportResult, String> {
    let import_mode = request.mode.clone();
    let mut loaded_backup_id = String::new();
    let result: Result<BackupImportResult, String> = (|| {
        let (backup, base_dir, _, backup_id) = load_backup_by_path(&request.path)?;
        loaded_backup_id = backup_id;
        restore_storage_backup(backup, base_dir.as_deref(), &request.mode, &state)
    })();

    match &result {
        Ok(import) => record_backup_event(
            diagnostic_log.inner(),
            "import_succeeded",
            json!({
                "source": "external_path",
                "backupId": loaded_backup_id,
                "mode": import.mode,
                "itemCount": import.item_count,
                "fileCount": import.file_count,
                "schemaVersion": import.schema_version
            }),
        ),
        Err(error) => record_backup_error(
            diagnostic_log.inner(),
            "import_failed",
            error,
            json!({
                "source": "external_path",
                "backupId": loaded_backup_id,
                "mode": import_mode
            }),
        ),
    }

    result
}

#[tauri::command]
pub fn duban_storage_delete_backup(
    backup_id: String,
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupDeleteResult, String> {
    let requested_backup_id = backup_id.clone();
    let result: Result<BackupDeleteResult, String> = (|| {
        validate_backup_id(&backup_id)?;
        let path = state.backups_dir.join(&backup_id);
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|_| "删除备份目录失败。".to_string())?;
        } else if path.is_file() {
            fs::remove_file(&path).map_err(|_| "删除备份文件失败。".to_string())?;
        } else {
            return Err("找不到这个备份。".to_string());
        }

        Ok(BackupDeleteResult {
            backup_id,
            deleted_at: current_timestamp(),
        })
    })();

    match &result {
        Ok(delete) => record_backup_event(
            diagnostic_log.inner(),
            "delete_succeeded",
            json!({
                "backupId": delete.backup_id
            }),
        ),
        Err(error) => record_backup_error(
            diagnostic_log.inner(),
            "delete_failed",
            error,
            json!({
                "backupId": requested_backup_id
            }),
        ),
    }

    result
}

#[tauri::command]
pub fn duban_storage_update_backup_metadata(
    request: BackupMetadataUpdateRequest,
    state: State<'_, StorageState>,
    diagnostic_log: State<'_, DiagnosticLogState>,
) -> Result<BackupPreview, String> {
    let backup_id = request.backup_id.clone();
    let label_present = request
        .label
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let notes_present = request
        .notes
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let result: Result<BackupPreview, String> = (|| {
        let (mut backup, base_dir, display_path, manifest_path) =
            load_backup_by_id_with_manifest(&state.backups_dir, &request.backup_id)?;
        backup.label = clean_optional_text(request.label);
        backup.notes = clean_optional_text(request.notes);
        write_backup_manifest(&manifest_path, &mut backup)?;
        Ok(build_backup_preview(
            &request.backup_id,
            &display_path,
            &backup,
            base_dir.as_deref(),
        ))
    })();

    match &result {
        Ok(preview) => record_backup_event(
            diagnostic_log.inner(),
            "metadata_update_succeeded",
            json!({
                "backupId": preview.backup_id,
                "labelPresent": label_present,
                "notesPresent": notes_present
            }),
        ),
        Err(error) => record_backup_error(
            diagnostic_log.inner(),
            "metadata_update_failed",
            error,
            json!({
                "backupId": backup_id,
                "labelPresent": label_present,
                "notesPresent": notes_present
            }),
        ),
    }

    result
}

fn build_storage_backup(
    conn: &Connection,
    files_dir: &Path,
    exported_at: &str,
    backup_files_dir: Option<&Path>,
) -> Result<StorageBackup, String> {
    let mut items = Vec::new();
    let mut files = Vec::new();

    for key in list_storage_keys(conn)? {
        if should_skip_backup_key(&key) {
            continue;
        }

        if let Some(file) = load_backup_file(conn, files_dir, backup_files_dir, &key, files.len())?
        {
            files.push(file);
            continue;
        }

        if let Some(value) = load_backup_json_value(conn, files_dir, &key)? {
            items.push(BackupItem { key, value });
        }
    }

    Ok(StorageBackup {
        format: BACKUP_FORMAT.to_string(),
        backup_version: BACKUP_VERSION,
        schema_version: CURRENT_SCHEMA_VERSION.to_string(),
        exported_at: exported_at.to_string(),
        app: "读伴 · Duban".to_string(),
        label: None,
        notes: None,
        manifest_sha256: None,
        includes_api_keys: false,
        items,
        files,
    })
}

fn load_backup_json_value(
    conn: &Connection,
    files_dir: &Path,
    key: &str,
) -> Result<Option<Value>, String> {
    if key == BOOKS_KEY {
        return Ok(Some(load_books(conn)?));
    }
    if key == SETTINGS_KEY {
        return load_settings_backup_value(conn);
    }
    if let Some(book_id) = progress_book_id(key) {
        return load_progress(conn, book_id);
    }
    if let Some(book_id) = book_suffix_id(key, PAGES_SUFFIX) {
        return Ok(Some(load_pages(conn, book_id)?));
    }
    if let Some(book_id) = book_suffix_id(key, NOTES_SUFFIX) {
        return Ok(Some(load_notes(conn, book_id)?));
    }
    if let Some(book_id) = book_suffix_id(key, CHAT_SUFFIX) {
        return Ok(Some(load_messages(conn, "chat_messages", book_id)?));
    }
    if let Some(book_id) = book_suffix_id(key, REFLECTION_SUFFIX) {
        return Ok(Some(load_messages(conn, "reflection_messages", book_id)?));
    }
    if let Some((book_id, item_key)) = guide_key_parts(key) {
        return load_guide(conn, book_id, item_key);
    }
    if let Some(book_id) = book_suffix_id(key, COVER_SUFFIX) {
        return load_book_cover(conn, files_dir, book_id);
    }
    if let Some((book_id, item_key)) = formatted_text_key_parts(key) {
        return load_formatted_text(conn, book_id, item_key);
    }

    let text = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取备份数据失败。".to_string())?;

    text.map(|value| serde_json::from_str(&value).map_err(|_| "备份数据格式损坏。".to_string()))
        .transpose()
}

fn load_settings_backup_value(conn: &Connection) -> Result<Option<Value>, String> {
    let Some(mut value) = load_settings(conn)? else {
        return Ok(None);
    };

    strip_settings_secrets(&mut value);
    strip_settings_key_status(&mut value);
    Ok(Some(value))
}

fn strip_settings_secrets(value: &mut Value) {
    remove_path(value, &["anthropic", "apiKey"]);
    remove_path(value, &["openaiCompatible", "apiKey"]);
    remove_path(value, &["apiKey"]);
}

fn strip_settings_key_status(value: &mut Value) {
    remove_path(value, &["anthropic", "hasApiKey"]);
    remove_path(value, &["openaiCompatible", "hasApiKey"]);
    remove_path(value, &["hasApiKey"]);
}

fn load_backup_file(
    conn: &Connection,
    files_dir: &Path,
    backup_files_dir: Option<&Path>,
    key: &str,
    index: usize,
) -> Result<Option<BackupFile>, String> {
    let record = if let Some(book_id) = book_suffix_id(key, FILE_SUFFIX) {
        conn.query_row(
            "SELECT file_name, mime_type, file_size, relative_path FROM book_files WHERE book_id = ?1",
            params![book_id],
            |row| {
                Ok(FileRecord {
                    file_name: row.get(0)?,
                    mime_type: row.get(1)?,
                    file_size: row.get::<_, i64>(2)?,
                    relative_path: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|_| "读取书籍文件备份索引失败。".to_string())?
    } else {
        conn.query_row(
            "SELECT file_name, mime_type, file_size, relative_path FROM file_store WHERE key = ?1",
            params![key],
            |row| {
                Ok(FileRecord {
                    file_name: row.get(0)?,
                    mime_type: row.get(1)?,
                    file_size: row.get::<_, i64>(2)?,
                    relative_path: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|_| "读取本地文件备份索引失败。".to_string())?
    };

    let Some(record) = record else {
        return Ok(None);
    };

    let path = safe_file_path(files_dir, &record.relative_path)?;
    let bytes = fs::read(&path).map_err(|_| "备份失败，本地书籍文件不存在。".to_string())?;
    let byte_size = bytes.len() as u64;
    let sha256 = sha256_hex(&bytes);

    if let Some(backup_files_dir) = backup_files_dir {
        let relative_file_name = backup_file_name(key, &record.file_name, index);
        let backup_path = backup_files_dir.join(&relative_file_name);
        fs::write(&backup_path, &bytes).map_err(|_| "写入备份原始文件失败。".to_string())?;
        return Ok(Some(BackupFile {
            key: key.to_string(),
            name: record.file_name,
            mime_type: record.mime_type,
            base64: String::new(),
            relative_path: Some(format!("{BACKUP_FILES_DIR}/{relative_file_name}")),
            byte_size: Some(byte_size),
            sha256: Some(sha256),
        }));
    }

    Ok(Some(BackupFile {
        key: key.to_string(),
        name: record.file_name,
        mime_type: record.mime_type,
        base64: general_purpose::STANDARD.encode(bytes),
        relative_path: None,
        byte_size: Some(byte_size),
        sha256: Some(sha256),
    }))
}

fn restore_storage_backup(
    backup: StorageBackup,
    base_dir: Option<&Path>,
    mode: &str,
    state: &StorageState,
) -> Result<BackupImportResult, String> {
    let import_mode = normalize_import_mode(mode)?;
    let issues = validate_backup_report(&backup, base_dir);
    if issues.iter().any(|issue| issue.severity == "error") {
        return Err("备份校验未通过，请先查看校验报告。".to_string());
    }

    let restore_point = create_restore_point(state)?;
    match apply_storage_backup(backup, base_dir, import_mode, state) {
        Ok(result) => {
            let _ = fs::remove_dir_all(&restore_point.path);
            Ok(result)
        }
        Err(message) => {
            let rollback = apply_storage_backup(
                restore_point.backup,
                Some(&restore_point.path),
                "replace",
                state,
            );
            match rollback {
                Ok(_) => {
                    let _ = fs::remove_dir_all(&restore_point.path);
                    Err(format!("{message} 已自动恢复到导入前状态。"))
                }
                Err(rollback_message) => Err(format!(
                    "{message} 自动恢复失败：{rollback_message}。恢复点保留在 {}。",
                    restore_point.path.to_string_lossy()
                )),
            }
        }
    }
}

fn apply_storage_backup(
    backup: StorageBackup,
    base_dir: Option<&Path>,
    import_mode: &str,
    state: &StorageState,
) -> Result<BackupImportResult, String> {
    let imported_at = current_timestamp();
    let item_count = backup.items.len();
    let file_count = backup.files.len();

    let mut items = backup.items;
    items.sort_by_key(|item| backup_key_priority(&item.key));
    let mut files = backup.files;
    files.sort_by_key(|file| backup_key_priority(&file.key));

    let mut conn = lock_conn(state)?;
    if import_mode == "replace" {
        clear_storage_data(&conn, &state.files_dir, false)?;
    }

    for item in items {
        let previous_file_path = if import_mode == "merge" {
            merge_json_key(&mut conn, &state.files_dir, &item.key, &item.value)?
        } else {
            sync_json_key(&mut conn, &state.files_dir, &item.key, &item.value)?
        };
        remove_file_if_exists(previous_file_path)?;
    }

    for file in files {
        let stored_file = backup_file_to_stored_write(&file, base_dir)?;
        sync_file_key(&conn, &state.files_dir, &file.key, stored_file)?;
    }

    conn.execute(
        "INSERT INTO schema_meta (key, value)
         VALUES ('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![CURRENT_SCHEMA_VERSION],
    )
    .map_err(|_| "更新本地 schema 版本失败。".to_string())?;

    Ok(BackupImportResult {
        item_count,
        file_count,
        mode: import_mode.to_string(),
        imported_at,
        schema_version: CURRENT_SCHEMA_VERSION.to_string(),
    })
}

struct RestorePoint {
    path: PathBuf,
    backup: StorageBackup,
}

fn create_restore_point(state: &StorageState) -> Result<RestorePoint, String> {
    let restore_id = format!(".restore-point-{}", current_timestamp());
    let restore_dir = unique_backup_dir(&state.backups_dir, &restore_id)?;
    let restore_files_dir = restore_dir.join(BACKUP_FILES_DIR);
    fs::create_dir_all(&restore_files_dir).map_err(|_| "创建导入恢复点目录失败。".to_string())?;

    let mut backup = {
        let conn = lock_conn(state)?;
        build_storage_backup(
            &conn,
            &state.files_dir,
            &current_timestamp(),
            Some(&restore_files_dir),
        )?
    };
    backup.label = Some("导入前自动恢复点".to_string());
    backup.notes = Some("备份导入失败时用于自动回滚。".to_string());
    write_backup_manifest(&restore_dir.join(BACKUP_MANIFEST_FILE), &mut backup)?;

    Ok(RestorePoint {
        path: restore_dir,
        backup,
    })
}

fn merge_json_key(
    conn: &mut Connection,
    files_dir: &Path,
    key: &str,
    value: &Value,
) -> Result<Option<PathBuf>, String> {
    if key == BOOKS_KEY {
        let existing = load_books(conn)?;
        let mut merged = existing.as_array().cloned().unwrap_or_default();
        let incoming = value
            .as_array()
            .ok_or_else(|| "书籍列表必须是数组。".to_string())?;

        for incoming_book in incoming {
            let Some(incoming_id) = text_field(incoming_book, "id") else {
                continue;
            };
            if let Some(position) = merged
                .iter()
                .position(|book| text_field(book, "id").as_deref() == Some(incoming_id.as_str()))
            {
                merged[position] = incoming_book.clone();
            } else {
                merged.push(incoming_book.clone());
            }
        }

        sync_books(conn, &Value::Array(merged))?;
        return Ok(None);
    }

    sync_json_key(conn, files_dir, key, value)
}

fn backup_file_to_stored_write(
    file: &BackupFile,
    base_dir: Option<&Path>,
) -> Result<StoredFileWrite, String> {
    let bytes = backup_file_bytes(file, base_dir)?;
    verify_backup_file_bytes(file, &bytes)?;
    let base64 = general_purpose::STANDARD.encode(bytes);

    Ok(StoredFileWrite {
        name: file.name.clone(),
        mime_type: file.mime_type.clone(),
        base64,
    })
}

fn load_backup_by_id(
    backups_dir: &Path,
    backup_id: &str,
) -> Result<(StorageBackup, Option<PathBuf>, PathBuf), String> {
    load_backup_by_id_with_manifest(backups_dir, backup_id)
        .map(|(backup, base_dir, display_path, _)| (backup, base_dir, display_path))
}

fn load_backup_by_id_with_manifest(
    backups_dir: &Path,
    backup_id: &str,
) -> Result<(StorageBackup, Option<PathBuf>, PathBuf, PathBuf), String> {
    validate_backup_id(backup_id)?;
    let path = backups_dir.join(backup_id);
    if path.is_dir() {
        let manifest_path = path.join(BACKUP_MANIFEST_FILE);
        let backup = read_backup_manifest(&manifest_path)?;
        return Ok((backup, Some(path.clone()), path, manifest_path));
    }
    if path.is_file() {
        let backup = read_backup_manifest(&path)?;
        return Ok((
            backup,
            path.parent().map(Path::to_path_buf),
            path.clone(),
            path,
        ));
    }
    Err("找不到这个备份。".to_string())
}

fn load_backup_by_path(
    path_text: &str,
) -> Result<(StorageBackup, Option<PathBuf>, PathBuf, String), String> {
    let trimmed = path_text.trim();
    validate_external_backup_path_text(trimmed)?;

    let raw_path = PathBuf::from(expand_home_path(trimmed));
    let path = fs::canonicalize(&raw_path).map_err(|_| "找不到外部备份路径。".to_string())?;
    if path.is_dir() {
        let manifest_path = path.join(BACKUP_MANIFEST_FILE);
        let backup = read_backup_manifest(&manifest_path)?;
        let backup_id = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("external-backup")
            .to_string();
        return Ok((backup, Some(path.clone()), path, backup_id));
    }

    if path.is_file() {
        let backup = read_backup_manifest(&path)?;
        let backup_id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("external-backup")
            .to_string();
        return Ok((
            backup,
            path.parent().map(Path::to_path_buf),
            path,
            backup_id,
        ));
    }

    Err("找不到外部备份路径。".to_string())
}

fn read_backup_manifest(path: &Path) -> Result<StorageBackup, String> {
    let text = fs::read_to_string(path).map_err(|_| "读取备份 manifest 失败。".to_string())?;
    serde_json::from_str(&text).map_err(|_| "备份 manifest 格式损坏。".to_string())
}

fn read_schema_version(conn: &Connection) -> Result<String, String> {
    conn.query_row(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|_| "读取 schema 版本失败。".to_string())
    .map(|value| value.unwrap_or_else(|| "unknown".to_string()))
}

fn sqlite_quick_check(conn: &Connection) -> Result<String, String> {
    conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map_err(|_| "执行 SQLite quick_check 失败。".to_string())
}

fn diagnostic_table_counts(conn: &Connection) -> Result<Vec<TableCount>, String> {
    const TABLES: &[&str] = &[
        "books",
        "book_chapters",
        "book_files",
        "book_pages",
        "reading_plans",
        "reading_plan_items",
        "reading_progress",
        "reading_item_progress",
        "notes",
        "chat_messages",
        "reflection_messages",
        "reading_guides",
        "app_settings",
        "book_covers",
        "formatted_texts",
        "file_store",
        "kv_store",
        "schema_meta",
    ];

    TABLES
        .iter()
        .map(|table| {
            let count = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(|_| "读取数据表数量失败。".to_string())?;
            Ok(TableCount {
                table: (*table).to_string(),
                count: count.max(0) as u64,
            })
        })
        .collect()
}

fn build_file_health_report(
    conn: &Connection,
    files_dir: &Path,
) -> Result<FileHealthReport, String> {
    let indexed_files = indexed_file_refs(conn)?;
    let referenced_file_count = indexed_files.len();
    let mut missing_files = Vec::new();
    let mut missing_file_count = 0;
    let mut unsafe_path_count = 0;

    for file in indexed_files {
        match safe_file_path(files_dir, &file.relative_path) {
            Ok(path) if path.is_file() => {}
            Ok(_) => {
                missing_file_count += 1;
                push_limited_missing_file(
                    &mut missing_files,
                    MissingFile {
                        source: file.source,
                        key: file.key,
                        book_id: file.book_id,
                        relative_path: file.relative_path,
                        reason: "missing".to_string(),
                    },
                );
            }
            Err(_) => {
                unsafe_path_count += 1;
                push_limited_missing_file(
                    &mut missing_files,
                    MissingFile {
                        source: file.source,
                        key: file.key,
                        book_id: file.book_id,
                        relative_path: file.relative_path,
                        reason: "unsafe-path".to_string(),
                    },
                );
            }
        }
    }

    let orphan_report = scan_orphan_files(conn, files_dir)?;
    Ok(FileHealthReport {
        referenced_file_count,
        missing_file_count,
        unsafe_path_count,
        orphan_count: orphan_report.orphan_count,
        orphan_byte_size: orphan_report.byte_size,
        missing_files,
        orphan_files: orphan_report.files.into_iter().take(50).collect(),
    })
}

fn push_limited_missing_file(files: &mut Vec<MissingFile>, file: MissingFile) {
    if files.len() < 50 {
        files.push(file);
    }
}

struct IndexedFileRef {
    source: String,
    key: Option<String>,
    book_id: Option<String>,
    relative_path: String,
}

fn indexed_file_refs(conn: &Connection) -> Result<Vec<IndexedFileRef>, String> {
    let mut files = Vec::new();

    {
        let mut statement = conn
            .prepare("SELECT key, relative_path FROM file_store")
            .map_err(|_| "读取旧文件索引失败。".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(IndexedFileRef {
                    source: "file_store".to_string(),
                    key: Some(row.get(0)?),
                    book_id: None,
                    relative_path: row.get(1)?,
                })
            })
            .map_err(|_| "读取旧文件索引失败。".to_string())?;
        for row in rows {
            files.push(row.map_err(|_| "读取旧文件索引失败。".to_string())?);
        }
    }

    {
        let mut statement = conn
            .prepare("SELECT book_id, relative_path FROM book_files")
            .map_err(|_| "读取书籍文件索引失败。".to_string())?;
        let rows = statement
            .query_map([], |row| {
                let book_id = row.get::<_, String>(0)?;
                Ok(IndexedFileRef {
                    source: "book_files".to_string(),
                    key: Some(book_scoped_key(&book_id, FILE_SUFFIX)),
                    book_id: Some(book_id),
                    relative_path: row.get(1)?,
                })
            })
            .map_err(|_| "读取书籍文件索引失败。".to_string())?;
        for row in rows {
            files.push(row.map_err(|_| "读取书籍文件索引失败。".to_string())?);
        }
    }

    {
        let mut statement = conn
            .prepare("SELECT book_id, relative_path FROM book_covers")
            .map_err(|_| "读取封面文件索引失败。".to_string())?;
        let rows = statement
            .query_map([], |row| {
                let book_id = row.get::<_, String>(0)?;
                Ok(IndexedFileRef {
                    source: "book_covers".to_string(),
                    key: Some(book_scoped_key(&book_id, COVER_SUFFIX)),
                    book_id: Some(book_id),
                    relative_path: row.get(1)?,
                })
            })
            .map_err(|_| "读取封面文件索引失败。".to_string())?;
        for row in rows {
            files.push(row.map_err(|_| "读取封面文件索引失败。".to_string())?);
        }
    }

    Ok(files)
}

fn check_directory_access(name: &str, path: &Path) -> DirectoryAccessReport {
    let exists = path.exists();
    let readable = fs::read_dir(path).is_ok();
    let test_path = path.join(format!(
        ".duban-diagnostics-write-test-{}",
        current_timestamp()
    ));
    let writable = fs::write(&test_path, b"ok")
        .and_then(|_| fs::remove_file(&test_path))
        .is_ok();
    let issue = if !exists {
        Some("missing".to_string())
    } else if !readable {
        Some("unreadable".to_string())
    } else if !writable {
        Some("unwritable".to_string())
    } else {
        None
    };

    DirectoryAccessReport {
        name: name.to_string(),
        exists,
        readable,
        writable,
        issue,
    }
}

fn diagnostic_settings_key_status(
    conn: &Connection,
) -> Result<DiagnosticSettingsKeyStatus, String> {
    conn.query_row(
        "SELECT anthropic_has_api_key, openai_has_api_key FROM app_settings WHERE id = 'settings'",
        [],
        |row| {
            Ok(DiagnosticSettingsKeyStatus {
                anthropic_has_api_key: row.get::<_, i64>(0).unwrap_or_default() > 0,
                openai_compatible_has_api_key: row.get::<_, i64>(1).unwrap_or_default() > 0,
            })
        },
    )
    .optional()
    .map_err(|_| "读取设置密钥状态失败。".to_string())
    .map(|value| value.unwrap_or_default())
}

fn diagnostic_settings_summary(conn: &Connection) -> Result<Value, String> {
    let settings = conn
        .query_row(
            "SELECT provider, anthropic_model, anthropic_has_api_key,
                    openai_base_url, openai_model, openai_has_api_key
             FROM app_settings WHERE id = 'settings'",
            [],
            |row| {
                Ok(json!({
                    "provider": row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    "anthropic": {
                        "model": row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        "hasApiKey": row.get::<_, i64>(2).unwrap_or_default() > 0
                    },
                    "openaiCompatible": {
                        "baseUrl": row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        "model": row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                        "hasApiKey": row.get::<_, i64>(5).unwrap_or_default() > 0
                    }
                }))
            },
        )
        .optional()
        .map_err(|_| "读取诊断设置摘要失败。".to_string())?;

    Ok(settings.unwrap_or_else(|| json!({ "exists": false })))
}

fn diagnostic_ai_diagnostics(conn: &Connection) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT value FROM kv_store WHERE key = '__duban:ai-diagnostics'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|_| "读取 AI 调用诊断失败。".to_string())?
    .map(|text| serde_json::from_str(&text).map_err(|_| "AI 调用诊断格式损坏。".to_string()))
    .transpose()
}

fn list_diagnostic_backup_summaries(
    state: &StorageState,
) -> Result<Vec<DiagnosticBackupSummary>, String> {
    let mut summaries = Vec::new();
    if !state.backups_dir.exists() {
        return Ok(summaries);
    }

    let entries = fs::read_dir(&state.backups_dir).map_err(|_| "读取备份目录失败。".to_string())?;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Some(backup_id) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if backup_id.starts_with('.') {
            continue;
        }
        let Ok((backup, base_dir, display_path)) = load_backup_by_id(&state.backups_dir, backup_id)
        else {
            continue;
        };
        let preview = build_backup_preview(backup_id, &display_path, &backup, base_dir.as_deref());
        summaries.push(DiagnosticBackupSummary {
            backup_id: backup_id.to_string(),
            exported_at: backup.exported_at,
            schema_version: backup.schema_version,
            backup_version: backup.backup_version,
            item_count: preview.item_count,
            file_count: preview.file_count,
            byte_size: preview.byte_size,
            includes_api_keys: preview.includes_api_keys,
            valid: preview.issues.iter().all(|issue| issue.severity != "error"),
            issue_count: preview.issues.len(),
        });
    }
    summaries.sort_by(|left, right| right.exported_at.cmp(&left.exported_at));
    Ok(summaries)
}

fn storage_health_issue(severity: &str, code: &str, message: &str) -> StorageHealthIssue {
    StorageHealthIssue {
        severity: severity.to_string(),
        code: code.to_string(),
        message: message.to_string(),
    }
}

fn record_backup_event(log: &DiagnosticLogState, event: &str, fields: Value) {
    let _ = log.record_info("backup", event, fields);
}

fn record_backup_error(log: &DiagnosticLogState, event: &str, error: &String, mut fields: Value) {
    if let Some(object) = fields.as_object_mut() {
        object.insert("error".to_string(), Value::String(error.to_string()));
    }
    let _ = log.record_error("backup", event, fields);
}

fn write_backup_manifest(path: &Path, backup: &mut StorageBackup) -> Result<(), String> {
    finalize_backup_manifest(backup)?;
    let text =
        serde_json::to_string_pretty(backup).map_err(|_| "备份数据序列化失败。".to_string())?;
    fs::write(path, text.as_bytes()).map_err(|_| "写入备份 manifest 失败。".to_string())
}

fn finalize_backup_manifest(backup: &mut StorageBackup) -> Result<(), String> {
    backup.manifest_sha256 = None;
    backup.manifest_sha256 = Some(compute_manifest_sha256(backup)?);
    Ok(())
}

fn compute_manifest_sha256(backup: &StorageBackup) -> Result<String, String> {
    let mut normalized = backup.clone();
    normalized.manifest_sha256 = None;
    let bytes =
        serde_json::to_vec(&normalized).map_err(|_| "备份 manifest 序列化失败。".to_string())?;
    Ok(sha256_hex(&bytes))
}

fn build_backup_preview(
    backup_id: &str,
    path: &Path,
    backup: &StorageBackup,
    base_dir: Option<&Path>,
) -> BackupPreview {
    let issues = validate_backup_report(backup, base_dir);
    let mut preview = BackupPreview {
        backup_id: backup_id.to_string(),
        path: path.to_string_lossy().to_string(),
        label: backup.label.clone(),
        notes: backup.notes.clone(),
        exported_at: backup.exported_at.clone(),
        schema_version: backup.schema_version.clone(),
        backup_version: backup.backup_version,
        manifest_sha256: backup.manifest_sha256.clone(),
        item_count: backup.items.len(),
        file_count: backup.files.len(),
        byte_size: if path.is_dir() {
            directory_size(path).unwrap_or_default()
        } else {
            fs::metadata(path)
                .map(|metadata| metadata.len())
                .unwrap_or_default()
        },
        includes_api_keys: backup.includes_api_keys,
        book_count: 0,
        page_count: 0,
        progress_count: 0,
        note_count: 0,
        chat_count: 0,
        reflection_count: 0,
        guide_count: 0,
        formatted_text_count: 0,
        cover_count: 0,
        issues,
    };

    for item in &backup.items {
        if item.key == BOOKS_KEY {
            preview.book_count = item.value.as_array().map(Vec::len).unwrap_or_default();
        } else if book_suffix_id(&item.key, PAGES_SUFFIX).is_some() {
            preview.page_count += item.value.as_array().map(Vec::len).unwrap_or_default();
        } else if progress_book_id(&item.key).is_some() {
            preview.progress_count += 1;
        } else if book_suffix_id(&item.key, NOTES_SUFFIX).is_some() {
            preview.note_count += count_grouped_items(&item.value);
        } else if book_suffix_id(&item.key, CHAT_SUFFIX).is_some() {
            preview.chat_count += count_grouped_items(&item.value);
        } else if book_suffix_id(&item.key, REFLECTION_SUFFIX).is_some() {
            preview.reflection_count += count_grouped_items(&item.value);
        } else if guide_key_parts(&item.key).is_some() {
            preview.guide_count += 1;
        } else if book_suffix_id(&item.key, COVER_SUFFIX).is_some() {
            preview.cover_count += 1;
        } else if formatted_text_key_parts(&item.key).is_some() {
            preview.formatted_text_count += 1;
        }
    }

    preview
}

fn validate_backup_report(backup: &StorageBackup, base_dir: Option<&Path>) -> Vec<BackupIssue> {
    let mut issues = Vec::new();
    if backup.format != BACKUP_FORMAT {
        issues.push(backup_issue(
            "error",
            "invalid-format",
            "备份文件格式不正确。",
            None,
        ));
    }
    if backup.backup_version > BACKUP_VERSION {
        issues.push(backup_issue(
            "error",
            "unsupported-version",
            "备份文件版本高于当前 App 支持版本，请先升级读伴。",
            None,
        ));
    }
    if let Some(message) = validate_backup_schema_version(&backup.schema_version) {
        issues.push(backup_issue(
            "error",
            "unsupported-schema-version",
            &message,
            None,
        ));
    }
    match &backup.manifest_sha256 {
        Some(expected) => match compute_manifest_sha256(backup) {
            Ok(actual) if actual == expected.trim().to_lowercase() => {}
            Ok(_) => issues.push(backup_issue(
                "error",
                "manifest-sha256-mismatch",
                "备份 manifest 校验和不匹配，可能已被修改或损坏。",
                None,
            )),
            Err(message) => issues.push(backup_issue(
                "error",
                "manifest-sha256-unreadable",
                &message,
                None,
            )),
        },
        None if backup.backup_version >= 3 => issues.push(backup_issue(
            "error",
            "missing-manifest-sha256",
            "v3 备份缺少 manifest 校验和。",
            None,
        )),
        None => issues.push(backup_issue(
            "warn",
            "legacy-no-manifest-sha256",
            "旧版备份没有 manifest 校验和；导入前只能做基础结构校验。",
            None,
        )),
    }
    if backup.includes_api_keys {
        issues.push(backup_issue(
            "warn",
            "includes-api-keys",
            "备份声明包含 API Key；当前导入不会恢复 API Key。",
            None,
        ));
    }

    let mut item_keys = BTreeSet::new();
    for item in &backup.items {
        if !item_keys.insert(item.key.clone()) {
            issues.push(backup_issue(
                "error",
                "duplicate-key",
                "备份中存在重复数据 key。",
                Some(&item.key),
            ));
        }
        if let Err(message) = validate_key(&item.key) {
            issues.push(backup_issue(
                "error",
                "invalid-key",
                &message,
                Some(&item.key),
            ));
        }
        if item.key == BOOKS_KEY {
            validate_backup_books(&item.value, &mut issues);
        }
    }

    let mut file_keys = BTreeSet::new();
    for file in &backup.files {
        if !file_keys.insert(file.key.clone()) {
            issues.push(backup_issue(
                "error",
                "duplicate-file-key",
                "备份中存在重复文件 key。",
                Some(&file.key),
            ));
        }
        if let Err(message) = validate_key(&file.key) {
            issues.push(backup_issue(
                "error",
                "invalid-file-key",
                &message,
                Some(&file.key),
            ));
        }
        match backup_file_bytes(file, base_dir) {
            Ok(bytes) => {
                if let Err(message) = verify_backup_file_bytes(file, &bytes) {
                    issues.push(backup_issue(
                        "error",
                        "file-integrity-mismatch",
                        &message,
                        Some(&file.key),
                    ));
                }
                if file.sha256.is_none() && backup.backup_version >= 3 {
                    issues.push(backup_issue(
                        "error",
                        "missing-file-sha256",
                        "v3 备份文件缺少 sha256。",
                        Some(&file.key),
                    ));
                } else if file.sha256.is_none() {
                    issues.push(backup_issue(
                        "warn",
                        "legacy-no-file-sha256",
                        "旧版备份文件没有 sha256；导入前只能做大小和可读性校验。",
                        Some(&file.key),
                    ));
                }
            }
            Err(message) => issues.push(backup_issue(
                "error",
                "unreadable-file",
                &message,
                Some(&file.key),
            )),
        }
    }

    issues
}

fn normalize_import_mode(mode: &str) -> Result<&'static str, String> {
    match mode {
        "merge" => Ok("merge"),
        "" | "replace" => Ok("replace"),
        _ => Err("未知的备份导入模式。".to_string()),
    }
}

fn validate_backup_schema_version(schema_version: &str) -> Option<String> {
    if schema_version == "browser-indexeddb" {
        return None;
    }

    let Ok(backup_version) = schema_version.parse::<u32>() else {
        return Some("备份 schema 版本无法识别。".to_string());
    };
    let current = CURRENT_SCHEMA_VERSION.parse::<u32>().unwrap_or_default();
    if backup_version > current {
        Some("备份 schema 版本高于当前 App 支持版本，请先升级读伴。".to_string())
    } else {
        None
    }
}

fn validate_backup_books(value: &Value, issues: &mut Vec<BackupIssue>) {
    let Some(books) = value.as_array() else {
        issues.push(backup_issue(
            "error",
            "invalid-books-value",
            "备份中的书籍列表必须是数组。",
            Some(BOOKS_KEY),
        ));
        return;
    };

    let mut ids = BTreeSet::new();
    for book in books {
        let Some(id) = text_field(book, "id") else {
            issues.push(backup_issue(
                "error",
                "missing-book-id",
                "备份中有书籍缺少 id。",
                Some(BOOKS_KEY),
            ));
            continue;
        };
        if !ids.insert(id) {
            issues.push(backup_issue(
                "error",
                "duplicate-book-id",
                "备份中存在重复书籍 id。",
                Some(BOOKS_KEY),
            ));
        }
    }
}

fn backup_file_bytes(file: &BackupFile, base_dir: Option<&Path>) -> Result<Vec<u8>, String> {
    if !file.base64.trim().is_empty() {
        return general_purpose::STANDARD
            .decode(file.base64.as_bytes())
            .map_err(|_| "备份文件内容损坏。".to_string());
    }

    if let Some(relative_path) = &file.relative_path {
        let base_dir = base_dir.ok_or_else(|| "目录式备份缺少基础路径。".to_string())?;
        let path = safe_join(base_dir, relative_path)?;
        if !path.is_file() {
            return Err("目录式备份缺少原始文件。".to_string());
        }
        return fs::read(path).map_err(|_| "读取备份原始文件失败。".to_string());
    }

    Err("备份文件缺少内容。".to_string())
}

fn verify_backup_file_bytes(file: &BackupFile, bytes: &[u8]) -> Result<(), String> {
    if let Some(expected_size) = file.byte_size {
        let actual_size = bytes.len() as u64;
        if actual_size != expected_size {
            return Err(format!(
                "备份文件大小不匹配，应为 {expected_size} 字节，实际为 {actual_size} 字节。"
            ));
        }
    }

    if let Some(expected_hash) = &file.sha256 {
        let actual_hash = sha256_hex(bytes);
        if actual_hash != expected_hash.trim().to_lowercase() {
            return Err("备份文件 sha256 不匹配，可能已被修改或损坏。".to_string());
        }
    }

    Ok(())
}

fn backup_issue(severity: &str, code: &str, message: &str, key: Option<&str>) -> BackupIssue {
    BackupIssue {
        severity: severity.to_string(),
        code: code.to_string(),
        message: message.to_string(),
        key: key.map(str::to_string),
    }
}

fn count_grouped_items(value: &Value) -> usize {
    if let Some(array) = value.as_array() {
        return array.len();
    }
    value
        .as_object()
        .map(|object| {
            object
                .values()
                .map(|item| item.as_array().map(Vec::len).unwrap_or(1))
                .sum()
        })
        .unwrap_or_default()
}

fn validate_backup_id(backup_id: &str) -> Result<(), String> {
    if backup_id.trim().is_empty()
        || backup_id.contains('/')
        || backup_id.contains('\\')
        || backup_id == "."
        || backup_id == ".."
    {
        return Err("备份 id 无效。".to_string());
    }
    Ok(())
}

fn unique_backup_dir(backups_dir: &Path, base_id: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(backups_dir).map_err(|_| "创建备份目录失败。".to_string())?;
    for index in 0..100 {
        let backup_id = if index == 0 {
            base_id.to_string()
        } else {
            format!("{base_id}-{index}")
        };
        let path = backups_dir.join(&backup_id);
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|_| "创建备份目录失败。".to_string())?;
            return Ok(path);
        }
    }
    Err("无法创建唯一备份目录。".to_string())
}

fn backup_file_name(key: &str, original_name: &str, index: usize) -> String {
    let key_part = key.replace(|character: char| !character.is_ascii_alphanumeric(), "_");
    let name_part = clean_file_name(original_name);
    format!("{index:04}-{key_part}-{name_part}")
}

fn directory_size(path: &Path) -> Result<u64, String> {
    if path.is_file() {
        return fs::metadata(path)
            .map(|metadata| metadata.len())
            .map_err(|_| "读取备份大小失败。".to_string());
    }

    let mut total = 0;
    if !path.exists() {
        return Ok(total);
    }
    for entry in fs::read_dir(path).map_err(|_| "读取备份目录失败。".to_string())? {
        let entry = entry.map_err(|_| "读取备份目录失败。".to_string())?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            total += directory_size(&entry_path)?;
        } else {
            total += entry
                .metadata()
                .map(|metadata| metadata.len())
                .unwrap_or_default();
        }
    }
    Ok(total)
}

fn safe_join(base_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("备份文件路径无效。".to_string());
    }
    Ok(base_dir.join(path))
}

fn expand_home_path(path: &str) -> String {
    if path == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn clean_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn should_skip_backup_key(key: &str) -> bool {
    key.starts_with("__duban:migration:")
        || key.starts_with("__duban:ai-budget:")
        || key == "__duban:ai-diagnostics"
}

fn backup_key_priority(key: &str) -> u8 {
    if key == SETTINGS_KEY {
        return 0;
    }
    if key == BOOKS_KEY {
        return 1;
    }
    if book_suffix_id(key, FILE_SUFFIX).is_some() {
        return 2;
    }
    if book_suffix_id(key, PAGES_SUFFIX).is_some() {
        return 3;
    }
    if book_suffix_id(key, COVER_SUFFIX).is_some() || formatted_text_key_parts(key).is_some() {
        return 3;
    }
    if progress_book_id(key).is_some() {
        return 4;
    }
    if book_suffix_id(key, NOTES_SUFFIX).is_some()
        || book_suffix_id(key, CHAT_SUFFIX).is_some()
        || book_suffix_id(key, REFLECTION_SUFFIX).is_some()
        || guide_key_parts(key).is_some()
    {
        return 5;
    }
    10
}

fn current_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

fn initialize_schema(conn: &mut Connection, files_dir: &Path) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_store (
          key TEXT PRIMARY KEY,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS books (
          id TEXT PRIMARY KEY,
          title TEXT,
          author TEXT,
          format TEXT,
          file_name TEXT,
          file_type TEXT,
          file_size INTEGER,
          total_pages INTEGER,
          detection_source TEXT,
          parser TEXT,
          language TEXT,
          status TEXT,
          created_at TEXT,
          updated_at TEXT,
          list_order INTEGER NOT NULL DEFAULT 0,
          raw_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_books_list_order ON books(list_order);
        CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
        CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at);

        CREATE TABLE IF NOT EXISTS book_chapters (
          book_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          title TEXT,
          start_page INTEGER,
          end_page INTEGER,
          purpose TEXT,
          source TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, chapter_id),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_book_chapters_book_position
          ON book_chapters(book_id, position);

        CREATE TABLE IF NOT EXISTS book_files (
          book_id TEXT PRIMARY KEY,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          sha256 TEXT,
          import_source TEXT,
          last_verified_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS book_pages (
          book_id TEXT NOT NULL,
          page_index INTEGER NOT NULL,
          page_number INTEGER,
          text TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, page_index),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_book_pages_book_page_number
          ON book_pages(book_id, page_number);

        CREATE TABLE IF NOT EXISTS reading_plans (
          book_id TEXT PRIMARY KEY,
          status TEXT,
          generated_by TEXT,
          summary TEXT,
          item_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT,
          raw_json TEXT NOT NULL,
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reading_plan_items (
          book_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          day INTEGER,
          planned_date TEXT,
          title TEXT,
          type TEXT,
          start_page INTEGER,
          end_page INTEGER,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, item_key),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reading_plan_items_book_position
          ON reading_plan_items(book_id, position);
        CREATE INDEX IF NOT EXISTS idx_reading_plan_items_planned_date
          ON reading_plan_items(planned_date);

        CREATE TABLE IF NOT EXISTS reading_progress (
          book_id TEXT PRIMARY KEY,
          current_item_index INTEGER NOT NULL DEFAULT 0,
          last_read_at TEXT,
          reading_days_json TEXT NOT NULL,
          updated_at TEXT,
          raw_json TEXT NOT NULL,
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reading_item_progress (
          book_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          current_page INTEGER,
          completed_at TEXT,
          last_location_json TEXT,
          PRIMARY KEY (book_id, item_key),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reading_item_progress_book
          ON reading_item_progress(book_id);

        CREATE TABLE IF NOT EXISTS notes (
          book_id TEXT NOT NULL,
          id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          page_number INTEGER,
          text TEXT,
          note TEXT,
          assistant_content TEXT,
          source_message_id TEXT,
          source TEXT,
          created_at TEXT,
          updated_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, id),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_notes_book_item
          ON notes(book_id, item_key, position);

        CREATE TABLE IF NOT EXISTS chat_messages (
          book_id TEXT NOT NULL,
          id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT,
          quote_json TEXT,
          model TEXT,
          created_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, id),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_book_item
          ON chat_messages(book_id, item_key, position);

        CREATE TABLE IF NOT EXISTS reflection_messages (
          book_id TEXT NOT NULL,
          id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          position INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT,
          kind TEXT,
          model TEXT,
          created_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, id),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reflection_messages_book_item
          ON reflection_messages(book_id, item_key, position);

        CREATE TABLE IF NOT EXISTS reading_guides (
          book_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          status TEXT,
          provider TEXT,
          model TEXT,
          generated_at TEXT,
          raw_json TEXT NOT NULL,
          PRIMARY KEY (book_id, item_key),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reading_guides_book
          ON reading_guides(book_id);

        CREATE TABLE IF NOT EXISTS app_settings (
          id TEXT PRIMARY KEY,
          provider TEXT,
          anthropic_model TEXT,
          anthropic_has_api_key INTEGER NOT NULL DEFAULT 0,
          openai_base_url TEXT,
          openai_model TEXT,
          openai_input_price_per_mtok TEXT,
          openai_output_price_per_mtok TEXT,
          openai_has_api_key INTEGER NOT NULL DEFAULT 0,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS book_covers (
          book_id TEXT PRIMARY KEY,
          media_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          source TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS formatted_texts (
          book_id TEXT NOT NULL,
          item_key TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          generated_at TEXT,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (book_id, item_key),
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_formatted_texts_book
          ON formatted_texts(book_id);

        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        ",
    )
    .map_err(|_| "初始化本地数据库失败。".to_string())?;

    run_schema_migrations(conn, files_dir)
}

fn run_schema_migrations(conn: &mut Connection, files_dir: &Path) -> Result<(), String> {
    ensure_p62_schema_columns(conn)?;
    migrate_books_from_kv(conn)?;
    migrate_book_files_from_file_store(conn)?;
    migrate_pages_from_kv(conn)?;
    rebuild_reading_plans_from_books(conn)?;
    migrate_progress_from_kv(conn)?;
    migrate_notes_from_kv(conn)?;
    migrate_messages_from_kv(conn, CHAT_SUFFIX, "chat_messages")?;
    migrate_messages_from_kv(conn, REFLECTION_SUFFIX, "reflection_messages")?;
    migrate_guides_from_kv(conn)?;
    migrate_settings_from_kv(conn)?;
    migrate_covers_from_kv(conn, files_dir)?;
    migrate_formatted_texts_from_kv(conn)?;
    conn.execute(
        "INSERT INTO schema_meta (key, value)
         VALUES ('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![CURRENT_SCHEMA_VERSION],
    )
    .map_err(|_| "更新本地 schema 版本失败。".to_string())?;
    Ok(())
}

fn ensure_p62_schema_columns(conn: &Connection) -> Result<(), String> {
    add_column_if_missing(conn, "book_files", "import_source", "TEXT")?;
    add_column_if_missing(conn, "book_files", "last_verified_at", "TEXT")
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    if column_exists(conn, table, column)? {
        return Ok(());
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    conn.execute(&sql, [])
        .map_err(|_| format!("升级本地 schema 失败：无法给 {table} 增加 {column}。"))?;
    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|_| "读取本地 schema 信息失败。".to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|_| "读取本地 schema 信息失败。".to_string())?;

    for name in columns {
        if name.map_err(|_| "读取本地 schema 信息失败。".to_string())? == column {
            return Ok(true);
        }
    }

    Ok(false)
}

fn load_books(conn: &Connection) -> Result<Value, String> {
    let mut statement = conn
        .prepare("SELECT raw_json FROM books ORDER BY list_order ASC, created_at DESC")
        .map_err(|_| "读取书籍元数据失败。".to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "读取书籍元数据失败。".to_string())?;

    let mut books = Vec::new();
    for row in rows {
        let text = row.map_err(|_| "读取书籍元数据失败。".to_string())?;
        let value = serde_json::from_str(&text).map_err(|_| "书籍元数据格式损坏。".to_string())?;
        books.push(value);
    }

    Ok(Value::Array(books))
}

fn sync_books(conn: &mut Connection, value: &Value) -> Result<(), String> {
    let books = value
        .as_array()
        .ok_or_else(|| "书籍列表必须是数组。".to_string())?;
    let tx = conn
        .transaction()
        .map_err(|_| "开始书籍元数据事务失败。".to_string())?;

    tx.execute("DELETE FROM reading_plan_items", [])
        .map_err(|_| "重建阅读计划项失败。".to_string())?;
    tx.execute("DELETE FROM reading_plans", [])
        .map_err(|_| "重建阅读计划失败。".to_string())?;
    tx.execute("DELETE FROM book_chapters", [])
        .map_err(|_| "重建书籍章节索引失败。".to_string())?;

    let mut current_book_ids = BTreeSet::new();
    for (index, book) in books.iter().enumerate() {
        let id = text_field(book, "id").ok_or_else(|| "书籍缺少 id，无法保存。".to_string())?;
        current_book_ids.insert(id.clone());
        let raw_json =
            serde_json::to_string(book).map_err(|_| "书籍元数据序列化失败。".to_string())?;

        tx.execute(
            "INSERT INTO books (
              id, title, author, format, file_name, file_type, file_size, total_pages,
              detection_source, parser, language, status, created_at, updated_at, list_order, raw_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              author = excluded.author,
              format = excluded.format,
              file_name = excluded.file_name,
              file_type = excluded.file_type,
              file_size = excluded.file_size,
              total_pages = excluded.total_pages,
              detection_source = excluded.detection_source,
              parser = excluded.parser,
              language = excluded.language,
              status = excluded.status,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              list_order = excluded.list_order,
              raw_json = excluded.raw_json",
            params![
                &id,
                text_field(book, "title"),
                text_field(book, "author"),
                text_field(book, "format"),
                text_field(book, "fileName"),
                text_field(book, "fileType"),
                int_field(book, "fileSize"),
                int_field(book, "totalPages"),
                text_field(book, "detectionSource"),
                text_field(book, "parser"),
                text_field(book, "language"),
                text_field(book, "status"),
                text_field(book, "createdAt"),
                text_field(book, "updatedAt"),
                index as i64,
                raw_json,
            ],
        )
        .map_err(|_| "写入书籍元数据失败。".to_string())?;

        if let Some(chapters) = book.get("chapters").and_then(Value::as_array) {
            for (chapter_index, chapter) in chapters.iter().enumerate() {
                let chapter_id =
                    text_field(chapter, "id").unwrap_or_else(|| format!("chapter:{chapter_index}"));
                let raw_json = serde_json::to_string(chapter)
                    .map_err(|_| "章节元数据序列化失败。".to_string())?;

                tx.execute(
                    "INSERT INTO book_chapters (
                      book_id, chapter_id, position, title, start_page, end_page, purpose, source, raw_json
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        &id,
                        &chapter_id,
                        chapter_index as i64,
                        text_field(chapter, "title"),
                        int_field(chapter, "startPage"),
                        int_field(chapter, "endPage"),
                        text_field(chapter, "purpose"),
                        text_field(chapter, "source"),
                        raw_json,
                    ],
                )
                .map_err(|_| "写入章节元数据失败。".to_string())?;
            }
        }

        sync_reading_plan_tx(&tx, &id, book.get("readingPlan"))?;
    }

    let existing_ids = {
        let mut statement = tx
            .prepare("SELECT id FROM books")
            .map_err(|_| "读取旧书籍元数据失败。".to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| "读取旧书籍元数据失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧书籍元数据失败。".to_string())?
    };

    for existing_id in existing_ids {
        if !current_book_ids.contains(&existing_id) {
            tx.execute("DELETE FROM books WHERE id = ?1", params![&existing_id])
                .map_err(|_| "删除已移除书籍元数据失败。".to_string())?;
        }
    }

    tx.execute("DELETE FROM kv_store WHERE key = ?1", params![BOOKS_KEY])
        .map_err(|_| "清理旧书籍数据失败。".to_string())?;
    tx.commit()
        .map_err(|_| "提交书籍元数据事务失败。".to_string())
}

fn migrate_books_from_kv(conn: &mut Connection) -> Result<(), String> {
    let structured_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
        .map_err(|_| "检查书籍元数据失败。".to_string())?;
    let saved_books = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![BOOKS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取旧书籍数据失败。".to_string())?;

    let Some(text) = saved_books else {
        return Ok(());
    };

    if structured_count > 0 {
        conn.execute("DELETE FROM kv_store WHERE key = ?1", params![BOOKS_KEY])
            .map_err(|_| "清理旧书籍数据失败。".to_string())?;
        return Ok(());
    }

    let value = serde_json::from_str(&text).map_err(|_| "旧书籍数据格式损坏。".to_string())?;
    sync_books(conn, &value)
}

fn load_book_file_item(
    conn: &Connection,
    files_dir: &Path,
    book_id: &str,
) -> Result<Option<StoredItem>, String> {
    let record = conn
        .query_row(
            "SELECT file_name, mime_type, file_size, relative_path
             FROM book_files
             WHERE book_id = ?1",
            params![book_id],
            |row| {
                Ok(FileRecord {
                    file_name: row.get(0)?,
                    mime_type: row.get(1)?,
                    file_size: row.get::<_, i64>(2)?,
                    relative_path: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|_| "读取书籍文件索引失败。".to_string())?;

    record
        .map(|record| stored_file_item(files_dir, record).map(Some))
        .unwrap_or(Ok(None))
}

fn migrate_book_files_from_file_store(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare(
                "SELECT key, file_name, mime_type, file_size, relative_path, updated_at
                 FROM file_store
                 WHERE key LIKE ?1",
            )
            .map_err(|_| "读取旧书籍文件索引失败。".to_string())?;
        let rows = statement
            .query_map(params![format!("{BOOK_PREFIX}%{FILE_SUFFIX}")], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|_| "读取旧书籍文件索引失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧书籍文件索引失败。".to_string())?
    };

    for (key, file_name, mime_type, file_size, relative_path, updated_at) in rows {
        let Some(book_id) = book_suffix_id(&key, FILE_SUFFIX).map(str::to_string) else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            continue;
        }

        conn.execute(
            "INSERT INTO book_files (
              book_id, file_name, mime_type, file_size, relative_path,
              import_source, last_verified_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'legacy-file-store', ?6, ?6, ?6)
            ON CONFLICT(book_id) DO UPDATE SET
              file_name = excluded.file_name,
              mime_type = excluded.mime_type,
              file_size = excluded.file_size,
              relative_path = excluded.relative_path,
              import_source = excluded.import_source,
              last_verified_at = excluded.last_verified_at,
              updated_at = excluded.updated_at",
            params![
                &book_id,
                &file_name,
                &mime_type,
                file_size,
                &relative_path,
                &updated_at
            ],
        )
        .map_err(|_| "迁移书籍文件索引失败。".to_string())?;
        conn.execute("DELETE FROM file_store WHERE key = ?1", params![&key])
            .map_err(|_| "清理旧书籍文件索引失败。".to_string())?;
    }

    Ok(())
}

fn load_pages(conn: &Connection, book_id: &str) -> Result<Value, String> {
    let mut statement = conn
        .prepare(
            "SELECT raw_json
             FROM book_pages
             WHERE book_id = ?1
             ORDER BY page_index ASC",
        )
        .map_err(|_| "读取分页文本失败。".to_string())?;
    let rows = statement
        .query_map(params![book_id], |row| row.get::<_, String>(0))
        .map_err(|_| "读取分页文本失败。".to_string())?;

    let mut pages = Vec::new();
    for row in rows {
        let text = row.map_err(|_| "读取分页文本失败。".to_string())?;
        let value = serde_json::from_str(&text).map_err(|_| "分页文本格式损坏。".to_string())?;
        pages.push(value);
    }

    Ok(Value::Array(pages))
}

fn sync_pages(conn: &mut Connection, book_id: &str, value: &Value) -> Result<(), String> {
    let pages = value
        .as_array()
        .ok_or_else(|| "分页文本必须是数组。".to_string())?;
    let tx = conn
        .transaction()
        .map_err(|_| "开始分页文本事务失败。".to_string())?;

    tx.execute(
        "DELETE FROM book_pages WHERE book_id = ?1",
        params![book_id],
    )
    .map_err(|_| "重建分页文本失败。".to_string())?;

    for (index, page) in pages.iter().enumerate() {
        let page_number = int_field(page, "pageNumber").or_else(|| Some(index as i64 + 1));
        let page_text = page_text_field(page);
        let raw_json =
            serde_json::to_string(page).map_err(|_| "分页文本序列化失败。".to_string())?;

        tx.execute(
            "INSERT INTO book_pages (
              book_id, page_index, page_number, text, raw_json
            ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![book_id, index as i64, page_number, page_text, raw_json],
        )
        .map_err(|_| "写入分页文本失败。".to_string())?;
    }

    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![book_scoped_key(book_id, PAGES_SUFFIX)],
    )
    .map_err(|_| "清理旧分页文本失败。".to_string())?;
    tx.commit()
        .map_err(|_| "提交分页文本事务失败。".to_string())
}

fn migrate_pages_from_kv(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| "读取旧分页文本失败。".to_string())?;
        let rows = statement
            .query_map(params![format!("{BOOK_PREFIX}%{PAGES_SUFFIX}")], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "读取旧分页文本失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧分页文本失败。".to_string())?
    };

    for (key, text) in rows {
        let Some(book_id) = book_suffix_id(&key, PAGES_SUFFIX).map(str::to_string) else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            continue;
        }

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM book_pages WHERE book_id = ?1",
                params![&book_id],
                |row| row.get(0),
            )
            .map_err(|_| "检查分页文本失败。".to_string())?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧分页文本失败。".to_string())?;
            continue;
        }

        let pages: Value =
            serde_json::from_str(&text).map_err(|_| "旧分页文本格式损坏。".to_string())?;
        sync_pages(conn, &book_id, &pages)?;
    }

    Ok(())
}

fn load_book_cover(
    conn: &Connection,
    files_dir: &Path,
    book_id: &str,
) -> Result<Option<Value>, String> {
    let record = conn
        .query_row(
            "SELECT media_type, relative_path FROM book_covers WHERE book_id = ?1",
            params![book_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|_| "读取封面缓存失败。".to_string())?;

    let Some((media_type, relative_path)) = record else {
        return Ok(None);
    };

    let path = safe_file_path(files_dir, &relative_path)?;
    let bytes = fs::read(path).map_err(|_| "读取封面缓存文件失败。".to_string())?;
    let base64 = general_purpose::STANDARD.encode(bytes);
    Ok(Some(Value::String(format!(
        "data:{media_type};base64,{base64}"
    ))))
}

fn sync_book_cover(
    conn: &Connection,
    files_dir: &Path,
    book_id: &str,
    value: &Value,
) -> Result<Option<PathBuf>, String> {
    let data_url = value
        .as_str()
        .ok_or_else(|| "封面缓存必须是 data URL 字符串。".to_string())?;
    let (media_type, bytes) = decode_data_url(data_url)?;
    let relative_path = format!(
        "covers/{}",
        key_to_file_name(&book_scoped_key(book_id, COVER_SUFFIX))
    );
    let path = files_dir.join(&relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "创建封面缓存目录失败。".to_string())?;
    }
    fs::write(&path, &bytes).map_err(|_| "写入封面缓存文件失败。".to_string())?;

    let previous_file_path = cover_file_path(conn, files_dir, book_id)?;
    conn.execute(
        "INSERT INTO book_covers (
          book_id, media_type, byte_size, relative_path, source, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 'generated', datetime('now'))
        ON CONFLICT(book_id) DO UPDATE SET
          media_type = excluded.media_type,
          byte_size = excluded.byte_size,
          relative_path = excluded.relative_path,
          source = excluded.source,
          updated_at = excluded.updated_at",
        params![book_id, media_type, bytes.len() as i64, relative_path],
    )
    .map_err(|_| "写入封面缓存索引失败。".to_string())?;
    conn.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![book_scoped_key(book_id, COVER_SUFFIX)],
    )
    .map_err(|_| "清理旧封面缓存失败。".to_string())?;

    if previous_file_path.as_deref() == Some(path.as_path()) {
        Ok(None)
    } else {
        Ok(previous_file_path)
    }
}

fn cover_file_path(
    conn: &Connection,
    files_dir: &Path,
    book_id: &str,
) -> Result<Option<PathBuf>, String> {
    let relative_path = conn
        .query_row(
            "SELECT relative_path FROM book_covers WHERE book_id = ?1",
            params![book_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取封面缓存索引失败。".to_string())?;

    relative_path
        .map(|path| safe_file_path(files_dir, &path))
        .transpose()
}

fn migrate_covers_from_kv(conn: &Connection, files_dir: &Path) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| "读取旧封面缓存失败。".to_string())?;
        let rows = statement
            .query_map(params![format!("{BOOK_PREFIX}%{COVER_SUFFIX}")], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "读取旧封面缓存失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧封面缓存失败。".to_string())?
    };

    for (key, text) in rows {
        let Some(book_id) = book_suffix_id(&key, COVER_SUFFIX).map(str::to_string) else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧封面缓存失败。".to_string())?;
            continue;
        }

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM book_covers WHERE book_id = ?1",
                params![&book_id],
                |row| row.get(0),
            )
            .map_err(|_| "检查封面缓存失败。".to_string())?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧封面缓存失败。".to_string())?;
            continue;
        }

        let value: Value =
            serde_json::from_str(&text).map_err(|_| "旧封面缓存格式损坏。".to_string())?;
        if value.as_str().and_then(parse_data_url_header).is_none() {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理损坏封面缓存失败。".to_string())?;
            continue;
        }
        sync_book_cover(conn, files_dir, &book_id, &value)?;
    }

    Ok(())
}

fn load_formatted_text(
    conn: &Connection,
    book_id: &str,
    item_key: &str,
) -> Result<Option<Value>, String> {
    let text = conn
        .query_row(
            "SELECT raw_json FROM formatted_texts WHERE book_id = ?1 AND item_key = ?2",
            params![book_id, item_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取 AI 排版缓存失败。".to_string())?;

    text.map(|value| serde_json::from_str(&value).map_err(|_| "AI 排版缓存格式损坏。".to_string()))
        .transpose()
}

fn sync_formatted_text(
    conn: &Connection,
    book_id: &str,
    item_key: &str,
    value: &Value,
) -> Result<(), String> {
    let raw_json =
        serde_json::to_string(value).map_err(|_| "AI 排版缓存序列化失败。".to_string())?;
    conn.execute(
        "INSERT INTO formatted_texts (
          book_id, item_key, provider, model, generated_at, raw_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
        ON CONFLICT(book_id, item_key) DO UPDATE SET
          provider = excluded.provider,
          model = excluded.model,
          generated_at = excluded.generated_at,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at",
        params![
            book_id,
            item_key,
            text_field(value, "provider"),
            text_field(value, "model"),
            text_field(value, "generatedAt"),
            raw_json,
        ],
    )
    .map_err(|_| "写入 AI 排版缓存失败。".to_string())?;
    conn.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![formatted_text_key(book_id, item_key)],
    )
    .map_err(|_| "清理旧 AI 排版缓存失败。".to_string())?;
    Ok(())
}

fn migrate_formatted_texts_from_kv(conn: &Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| "读取旧 AI 排版缓存失败。".to_string())?;
        let rows = statement
            .query_map(
                params![format!("{BOOK_PREFIX}%{FORMATTED_TEXT_MARKER}%")],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|_| "读取旧 AI 排版缓存失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧 AI 排版缓存失败。".to_string())?
    };

    for (key, text) in rows {
        let Some((book_id, item_key)) = formatted_text_key_parts(&key)
            .map(|(book_id, item_key)| (book_id.to_string(), item_key.to_string()))
        else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧 AI 排版缓存失败。".to_string())?;
            continue;
        }

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM formatted_texts WHERE book_id = ?1 AND item_key = ?2",
                params![&book_id, &item_key],
                |row| row.get(0),
            )
            .map_err(|_| "检查 AI 排版缓存失败。".to_string())?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧 AI 排版缓存失败。".to_string())?;
            continue;
        }

        let value: Value =
            serde_json::from_str(&text).map_err(|_| "旧 AI 排版缓存格式损坏。".to_string())?;
        sync_formatted_text(conn, &book_id, &item_key, &value)?;
    }

    Ok(())
}

fn load_settings(conn: &Connection) -> Result<Option<Value>, String> {
    let structured_settings = conn
        .query_row(
            "SELECT raw_json FROM app_settings WHERE id = 'settings'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取设置失败。".to_string())?;

    if let Some(text) = structured_settings {
        let mut settings: Value =
            serde_json::from_str(&text).map_err(|_| "设置格式损坏。".to_string())?;
        strip_settings_secrets(&mut settings);
        return Ok(Some(settings));
    }

    let saved_settings = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取设置失败。".to_string())?;

    let mut settings = saved_settings
        .as_deref()
        .map(|text| serde_json::from_str(text).map_err(|_| "设置格式损坏。".to_string()))
        .transpose()?
        .unwrap_or_else(|| Value::Object(Map::new()));
    strip_settings_secrets(&mut settings);

    if saved_settings.is_some() {
        Ok(Some(settings))
    } else {
        Ok(None)
    }
}

fn sync_settings(conn: &Connection, settings: &Value) -> Result<(), String> {
    let previous_key_status = load_settings(conn)?
        .as_ref()
        .map(settings_key_status)
        .unwrap_or_default();
    let mut sanitized = settings_without_secrets(settings)?;
    preserve_missing_key_status(settings, &mut sanitized, previous_key_status);
    store_settings_record(conn, &sanitized)?;
    conn.execute("DELETE FROM kv_store WHERE key = ?1", params![SETTINGS_KEY])
        .map_err(|_| "清理旧设置失败。".to_string())?;
    Ok(())
}

fn store_settings_record(conn: &Connection, settings: &Value) -> Result<(), String> {
    let text = serde_json::to_string(settings).map_err(|_| "设置序列化失败。".to_string())?;

    conn.execute(
        "INSERT INTO app_settings (
          id, provider, anthropic_model, anthropic_has_api_key,
          openai_base_url, openai_model, openai_input_price_per_mtok,
          openai_output_price_per_mtok, openai_has_api_key, raw_json, updated_at
        ) VALUES (
          'settings', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          provider = excluded.provider,
          anthropic_model = excluded.anthropic_model,
          anthropic_has_api_key = excluded.anthropic_has_api_key,
          openai_base_url = excluded.openai_base_url,
          openai_model = excluded.openai_model,
          openai_input_price_per_mtok = excluded.openai_input_price_per_mtok,
          openai_output_price_per_mtok = excluded.openai_output_price_per_mtok,
          openai_has_api_key = excluded.openai_has_api_key,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at",
        params![
            text_field(settings, "provider"),
            settings
                .get("anthropic")
                .and_then(|value| text_field(value, "model")),
            bool_at_path(settings, &["anthropic", "hasApiKey"]) as i64,
            settings
                .get("openaiCompatible")
                .and_then(|value| text_field(value, "baseUrl")),
            settings
                .get("openaiCompatible")
                .and_then(|value| text_field(value, "model")),
            settings
                .get("openaiCompatible")
                .and_then(|value| text_field(value, "inputPricePerMTok")),
            settings
                .get("openaiCompatible")
                .and_then(|value| text_field(value, "outputPricePerMTok")),
            bool_at_path(settings, &["openaiCompatible", "hasApiKey"]) as i64,
            text,
        ],
    )
    .map_err(|_| "写入设置失败。".to_string())?;
    Ok(())
}

fn migrate_settings_from_kv(conn: &Connection) -> Result<(), String> {
    let saved_settings = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "读取旧设置失败。".to_string())?;

    let Some(text) = saved_settings else {
        return Ok(());
    };

    let mut settings: Value =
        serde_json::from_str(&text).map_err(|_| "旧设置格式损坏。".to_string())?;
    strip_settings_secrets(&mut settings);
    store_settings_record(conn, &settings)?;
    conn.execute("DELETE FROM kv_store WHERE key = ?1", params![SETTINGS_KEY])
        .map_err(|_| "清理旧设置失败。".to_string())?;
    Ok(())
}

fn settings_without_secrets(settings: &Value) -> Result<Value, String> {
    let mut sanitized = settings.clone();

    if let Some(api_key) = string_at_path(settings, &["anthropic", "apiKey"])
        .or_else(|| string_at_path(settings, &["apiKey"]))
    {
        sync_keychain_secret(KEYCHAIN_ANTHROPIC_ACCOUNT, &api_key)?;
        set_bool_at_path(&mut sanitized, &["anthropic", "hasApiKey"], true);
        remove_path(&mut sanitized, &["anthropic", "apiKey"]);
        remove_path(&mut sanitized, &["apiKey"]);
    }

    if let Some(api_key) = string_at_path(settings, &["openaiCompatible", "apiKey"]) {
        sync_keychain_secret(KEYCHAIN_OPENAI_COMPATIBLE_ACCOUNT, &api_key)?;
        set_bool_at_path(&mut sanitized, &["openaiCompatible", "hasApiKey"], true);
        remove_path(&mut sanitized, &["openaiCompatible", "apiKey"]);
    }

    Ok(sanitized)
}

fn settings_key_status(settings: &Value) -> SettingsKeyStatus {
    SettingsKeyStatus {
        anthropic: bool_at_path(settings, &["anthropic", "hasApiKey"]),
        openai_compatible: bool_at_path(settings, &["openaiCompatible", "hasApiKey"]),
    }
}

fn preserve_missing_key_status(source: &Value, target: &mut Value, previous: SettingsKeyStatus) {
    if previous.anthropic
        && !has_path(source, &["anthropic", "hasApiKey"])
        && string_at_path(source, &["anthropic", "apiKey"]).is_none()
        && string_at_path(source, &["apiKey"]).is_none()
    {
        set_bool_at_path(target, &["anthropic", "hasApiKey"], true);
    }

    if previous.openai_compatible
        && !has_path(source, &["openaiCompatible", "hasApiKey"])
        && string_at_path(source, &["openaiCompatible", "apiKey"]).is_none()
    {
        set_bool_at_path(target, &["openaiCompatible", "hasApiKey"], true);
    }
}

fn restore_settings_key_status(conn: &Connection, status: SettingsKeyStatus) -> Result<(), String> {
    if !status.anthropic && !status.openai_compatible {
        return Ok(());
    }

    let mut settings = Value::Object(Map::new());
    if status.anthropic {
        set_bool_at_path(&mut settings, &["anthropic", "hasApiKey"], true);
    }
    if status.openai_compatible {
        set_bool_at_path(&mut settings, &["openaiCompatible", "hasApiKey"], true);
    }
    store_settings_record(conn, &settings).map_err(|_| "恢复设置密钥状态失败。".to_string())
}

fn sync_keychain_secret(account: &str, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return delete_keychain_secret(account);
    }

    keychain_entry(account)?
        .set_password(trimmed)
        .map_err(|_| "写入系统 Keychain 失败。".to_string())?;
    crate::clear_ai_key_cache();
    Ok(())
}

fn read_keychain_secret(account: &str) -> Result<Option<String>, String> {
    match keychain_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("读取系统 Keychain 失败。".to_string()),
    }
}

pub fn read_ai_api_key(provider: &str) -> Result<Option<String>, String> {
    match provider {
        "openai-compatible" => read_keychain_secret(KEYCHAIN_OPENAI_COMPATIBLE_ACCOUNT),
        _ => read_keychain_secret(KEYCHAIN_ANTHROPIC_ACCOUNT),
    }
}

fn delete_settings_secrets() -> Result<(), String> {
    delete_keychain_secret(KEYCHAIN_ANTHROPIC_ACCOUNT)?;
    delete_keychain_secret(KEYCHAIN_OPENAI_COMPATIBLE_ACCOUNT)
}

fn delete_keychain_secret(account: &str) -> Result<(), String> {
    match keychain_entry(account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => {
            crate::clear_ai_key_cache();
            Ok(())
        }
        Err(_) => Err("删除系统 Keychain 凭据失败。".to_string()),
    }
}

fn keychain_entry(account: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, account).map_err(|_| "初始化系统 Keychain 凭据失败。".to_string())
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }

    current
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn bool_at_path(value: &Value, path: &[&str]) -> bool {
    let mut current = value;
    for key in path {
        let Some(next) = current.get(*key) else {
            return false;
        };
        current = next;
    }

    current.as_bool().unwrap_or(false)
}

fn has_path(value: &Value, path: &[&str]) -> bool {
    let mut current = value;
    for key in path {
        let Some(next) = current.get(*key) else {
            return false;
        };
        current = next;
    }

    true
}

fn set_bool_at_path(value: &mut Value, path: &[&str], flag: bool) {
    if path.is_empty() {
        return;
    }

    let mut current = value;
    for key in &path[..path.len() - 1] {
        if !current.is_object() {
            *current = Value::Object(Map::new());
        }
        let object = current.as_object_mut().expect("object checked");
        current = object
            .entry((*key).to_string())
            .or_insert_with(|| Value::Object(Map::new()));
    }

    if !current.is_object() {
        *current = Value::Object(Map::new());
    }
    if let Some(object) = current.as_object_mut() {
        object.insert(path[path.len() - 1].to_string(), Value::Bool(flag));
    }
}

fn remove_path(value: &mut Value, path: &[&str]) {
    if path.is_empty() {
        return;
    }

    let mut current = value;
    for key in &path[..path.len() - 1] {
        let Some(next) = current.get_mut(*key) else {
            return;
        };
        current = next;
    }

    if let Some(object) = current.as_object_mut() {
        object.remove(path[path.len() - 1]);
    }
}

fn parse_data_url_header(value: &str) -> Option<String> {
    let (header, _) = value.split_once(',')?;
    if !header.starts_with("data:") || !header.contains(";base64") {
        return None;
    }

    let media_type = header
        .trim_start_matches("data:")
        .split(';')
        .next()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("application/octet-stream");
    Some(media_type.to_string())
}

fn decode_data_url(value: &str) -> Result<(String, Vec<u8>), String> {
    let media_type = parse_data_url_header(value)
        .ok_or_else(|| "封面缓存必须是 base64 data URL。".to_string())?;
    let (_, data) = value
        .split_once(',')
        .ok_or_else(|| "封面缓存必须是 base64 data URL。".to_string())?;
    let bytes = general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "封面缓存内容解码失败。".to_string())?;
    Ok((media_type, bytes))
}

fn rebuild_reading_plans_from_books(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT id, raw_json FROM books ORDER BY list_order ASC")
            .map_err(|_| "读取书籍阅读计划失败。".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "读取书籍阅读计划失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取书籍阅读计划失败。".to_string())?
    };

    let tx = conn
        .transaction()
        .map_err(|_| "开始阅读计划事务失败。".to_string())?;
    tx.execute("DELETE FROM reading_plan_items", [])
        .map_err(|_| "重建阅读计划项失败。".to_string())?;
    tx.execute("DELETE FROM reading_plans", [])
        .map_err(|_| "重建阅读计划失败。".to_string())?;

    for (book_id, raw_json) in rows {
        let book: Value =
            serde_json::from_str(&raw_json).map_err(|_| "书籍元数据格式损坏。".to_string())?;
        sync_reading_plan_tx(&tx, &book_id, book.get("readingPlan"))?;
    }

    tx.commit()
        .map_err(|_| "提交阅读计划事务失败。".to_string())
}

fn sync_reading_plan_tx(
    tx: &rusqlite::Transaction<'_>,
    book_id: &str,
    plan: Option<&Value>,
) -> Result<(), String> {
    let Some(plan) = plan.filter(|value| value.is_object()) else {
        return Ok(());
    };
    let raw_json = serde_json::to_string(plan).map_err(|_| "阅读计划序列化失败。".to_string())?;
    let items = plan
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    tx.execute(
        "INSERT INTO reading_plans (
          book_id, status, generated_by, summary, item_count, updated_at, raw_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(book_id) DO UPDATE SET
          status = excluded.status,
          generated_by = excluded.generated_by,
          summary = excluded.summary,
          item_count = excluded.item_count,
          updated_at = excluded.updated_at,
          raw_json = excluded.raw_json",
        params![
            book_id,
            text_field(plan, "status"),
            text_field(plan, "generatedBy"),
            text_field(plan, "summary"),
            items.len() as i64,
            text_field(plan, "updatedAt"),
            raw_json,
        ],
    )
    .map_err(|_| "写入阅读计划失败。".to_string())?;

    for (index, item) in items.iter().enumerate() {
        let item_key = plan_item_key(item, index);
        let raw_json =
            serde_json::to_string(item).map_err(|_| "阅读计划项序列化失败。".to_string())?;
        tx.execute(
            "INSERT INTO reading_plan_items (
              book_id, item_key, position, day, planned_date, title, type, start_page, end_page, raw_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(book_id, item_key) DO UPDATE SET
              position = excluded.position,
              day = excluded.day,
              planned_date = excluded.planned_date,
              title = excluded.title,
              type = excluded.type,
              start_page = excluded.start_page,
              end_page = excluded.end_page,
              raw_json = excluded.raw_json",
            params![
                book_id,
                item_key,
                index as i64,
                int_field(item, "day"),
                text_field(item, "date"),
                text_field(item, "title"),
                text_field(item, "type"),
                int_field(item, "startPage"),
                int_field(item, "endPage"),
                raw_json,
            ],
        )
        .map_err(|_| "写入阅读计划项失败。".to_string())?;
    }

    Ok(())
}

fn load_progress(conn: &Connection, book_id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT raw_json FROM reading_progress WHERE book_id = ?1",
        params![book_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|_| "读取阅读进度失败。".to_string())?
    .map(|text| serde_json::from_str(&text).map_err(|_| "阅读进度格式损坏。".to_string()))
    .transpose()
}

fn sync_progress(conn: &mut Connection, book_id: &str, progress: &Value) -> Result<(), String> {
    if !progress.is_object() {
        return Err("阅读进度必须是对象。".to_string());
    }

    let raw_json =
        serde_json::to_string(progress).map_err(|_| "阅读进度序列化失败。".to_string())?;
    let reading_days = progress
        .get("readingDays")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let reading_days_json =
        serde_json::to_string(&reading_days).map_err(|_| "阅读日期序列化失败。".to_string())?;
    let item_keys = progress_item_keys(progress);
    let tx = conn
        .transaction()
        .map_err(|_| "开始阅读进度事务失败。".to_string())?;

    tx.execute(
        "INSERT INTO reading_progress (
          book_id, current_item_index, last_read_at, reading_days_json, updated_at, raw_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(book_id) DO UPDATE SET
          current_item_index = excluded.current_item_index,
          last_read_at = excluded.last_read_at,
          reading_days_json = excluded.reading_days_json,
          updated_at = excluded.updated_at,
          raw_json = excluded.raw_json",
        params![
            book_id,
            int_field(progress, "currentItemIndex").unwrap_or(0),
            text_field(progress, "lastReadAt"),
            reading_days_json,
            text_field(progress, "updatedAt"),
            raw_json,
        ],
    )
    .map_err(|_| "写入阅读进度失败。".to_string())?;
    tx.execute(
        "DELETE FROM reading_item_progress WHERE book_id = ?1",
        params![book_id],
    )
    .map_err(|_| "重建阅读项进度失败。".to_string())?;

    for item_key in item_keys {
        let location = progress
            .get("currentPageByItemKey")
            .and_then(|value| value.get(&item_key));
        let location_json = location
            .map(serde_json::to_string)
            .transpose()
            .map_err(|_| "阅读位置序列化失败。".to_string())?;

        tx.execute(
            "INSERT INTO reading_item_progress (
              book_id, item_key, current_page, completed_at, last_location_json
            ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                book_id,
                &item_key,
                location.and_then(|value| {
                    int_field(value, "pageNumber").or_else(|| value.as_i64())
                }),
                progress
                    .get("completedAtByItemKey")
                    .and_then(|value| value.get(&item_key))
                    .and_then(Value::as_str),
                location_json,
            ],
        )
        .map_err(|_| "写入阅读项进度失败。".to_string())?;
    }

    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![progress_key(book_id)],
    )
    .map_err(|_| "清理旧阅读进度失败。".to_string())?;
    tx.commit()
        .map_err(|_| "提交阅读进度事务失败。".to_string())
}

fn migrate_progress_from_kv(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE 'progress:%'")
            .map_err(|_| "读取旧阅读进度失败。".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "读取旧阅读进度失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧阅读进度失败。".to_string())?
    };

    for (key, text) in rows {
        let Some(book_id) = progress_book_id(&key).map(str::to_string) else {
            continue;
        };
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reading_progress WHERE book_id = ?1",
                params![&book_id],
                |row| row.get(0),
            )
            .map_err(|_| "检查阅读进度失败。".to_string())?;

        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧阅读进度失败。".to_string())?;
            continue;
        }

        let progress: Value =
            serde_json::from_str(&text).map_err(|_| "旧阅读进度格式损坏。".to_string())?;
        sync_progress(conn, &book_id, &progress)?;
    }

    Ok(())
}

fn load_notes(conn: &Connection, book_id: &str) -> Result<Value, String> {
    let mut statement = conn
        .prepare(
            "SELECT item_key, raw_json
             FROM notes
             WHERE book_id = ?1
             ORDER BY item_key ASC, position ASC",
        )
        .map_err(|_| "读取笔记失败。".to_string())?;
    let rows = statement
        .query_map(params![book_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "读取笔记失败。".to_string())?;
    let rows = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "读取笔记失败。".to_string())?;

    group_raw_json_by_item(rows, "笔记格式损坏。")
}

fn sync_notes(conn: &mut Connection, book_id: &str, value: &Value) -> Result<(), String> {
    let grouped = grouped_array_entries(value, "__legacy__", "笔记数据必须是对象或数组。")?;
    let tx = conn
        .transaction()
        .map_err(|_| "开始笔记事务失败。".to_string())?;

    tx.execute("DELETE FROM notes WHERE book_id = ?1", params![book_id])
        .map_err(|_| "重建笔记失败。".to_string())?;

    for (item_key, notes) in grouped {
        for (index, note) in notes.iter().enumerate() {
            let id = text_field(note, "id")
                .unwrap_or_else(|| format!("note:{book_id}:{item_key}:{index}"));
            let raw_json =
                serde_json::to_string(note).map_err(|_| "笔记序列化失败。".to_string())?;

            tx.execute(
                "INSERT INTO notes (
                  book_id, id, item_key, position, page_number, text, note,
                  assistant_content, source_message_id, source, created_at, updated_at, raw_json
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    book_id,
                    &id,
                    &item_key,
                    index as i64,
                    int_field(note, "pageNumber"),
                    text_field(note, "text"),
                    text_field(note, "note"),
                    text_field(note, "assistantContent"),
                    text_field(note, "sourceMessageId"),
                    text_field(note, "source"),
                    text_field(note, "createdAt"),
                    text_field(note, "updatedAt"),
                    raw_json,
                ],
            )
            .map_err(|_| "写入笔记失败。".to_string())?;
        }
    }

    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![book_scoped_key(book_id, NOTES_SUFFIX)],
    )
    .map_err(|_| "清理旧笔记失败。".to_string())?;
    tx.commit().map_err(|_| "提交笔记事务失败。".to_string())
}

fn migrate_notes_from_kv(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| "读取旧笔记失败。".to_string())?;
        let rows = statement
            .query_map(params![format!("{BOOK_PREFIX}%{NOTES_SUFFIX}")], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "读取旧笔记失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧笔记失败。".to_string())?
    };

    for (key, text) in rows {
        let Some(book_id) = book_suffix_id(&key, NOTES_SUFFIX).map(str::to_string) else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            continue;
        }

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE book_id = ?1",
                params![&book_id],
                |row| row.get(0),
            )
            .map_err(|_| "检查笔记失败。".to_string())?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧笔记失败。".to_string())?;
            continue;
        }

        let value: Value =
            serde_json::from_str(&text).map_err(|_| "旧笔记格式损坏。".to_string())?;
        sync_notes(conn, &book_id, &value)?;
    }

    Ok(())
}

fn load_messages(conn: &Connection, table: &str, book_id: &str) -> Result<Value, String> {
    let sql = match table {
        "chat_messages" => {
            "SELECT item_key, raw_json
             FROM chat_messages
             WHERE book_id = ?1
             ORDER BY item_key ASC, position ASC"
        }
        "reflection_messages" => {
            "SELECT item_key, raw_json
             FROM reflection_messages
             WHERE book_id = ?1
             ORDER BY item_key ASC, position ASC"
        }
        _ => return Err("未知消息表。".to_string()),
    };
    let error = message_error(table, "读取");
    let mut statement = conn.prepare(sql).map_err(|_| error.clone())?;
    let rows = statement
        .query_map(params![book_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| error.clone())?;
    let rows = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| error.clone())?;

    group_raw_json_by_item(rows, &message_error(table, "格式损坏"))
}

fn sync_messages(
    conn: &mut Connection,
    table: &str,
    book_id: &str,
    value: &Value,
) -> Result<(), String> {
    let grouped = grouped_array_entries(
        value,
        "__legacy__",
        &message_error(table, "数据必须是对象或数组"),
    )?;
    let tx = conn
        .transaction()
        .map_err(|_| message_error(table, "开始事务失败"))?;

    let delete_sql = match table {
        "chat_messages" => "DELETE FROM chat_messages WHERE book_id = ?1",
        "reflection_messages" => "DELETE FROM reflection_messages WHERE book_id = ?1",
        _ => return Err("未知消息表。".to_string()),
    };
    tx.execute(delete_sql, params![book_id])
        .map_err(|_| message_error(table, "重建失败"))?;

    for (item_key, messages) in grouped {
        for (index, message) in messages.iter().enumerate() {
            let id = text_field(message, "id")
                .unwrap_or_else(|| format!("{table}:{book_id}:{item_key}:{index}"));
            let role = text_field(message, "role").unwrap_or_else(|| "message".to_string());
            let raw_json =
                serde_json::to_string(message).map_err(|_| message_error(table, "序列化失败"))?;

            match table {
                "chat_messages" => {
                    let quote_json = message
                        .get("quote")
                        .filter(|value| !value.is_null())
                        .map(serde_json::to_string)
                        .transpose()
                        .map_err(|_| message_error(table, "引用序列化失败"))?;
                    tx.execute(
                        "INSERT INTO chat_messages (
                          book_id, id, item_key, position, role, content,
                          quote_json, model, created_at, raw_json
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        params![
                            book_id,
                            &id,
                            &item_key,
                            index as i64,
                            role,
                            text_field(message, "content"),
                            quote_json,
                            text_field(message, "model"),
                            text_field(message, "createdAt"),
                            raw_json,
                        ],
                    )
                    .map_err(|_| message_error(table, "写入失败"))?;
                }
                "reflection_messages" => {
                    tx.execute(
                        "INSERT INTO reflection_messages (
                          book_id, id, item_key, position, role, content,
                          kind, model, created_at, raw_json
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        params![
                            book_id,
                            &id,
                            &item_key,
                            index as i64,
                            role,
                            text_field(message, "content"),
                            text_field(message, "kind"),
                            text_field(message, "model"),
                            text_field(message, "createdAt"),
                            raw_json,
                        ],
                    )
                    .map_err(|_| message_error(table, "写入失败"))?;
                }
                _ => return Err("未知消息表。".to_string()),
            }
        }
    }

    let suffix = match table {
        "chat_messages" => CHAT_SUFFIX,
        "reflection_messages" => REFLECTION_SUFFIX,
        _ => return Err("未知消息表。".to_string()),
    };
    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![book_scoped_key(book_id, suffix)],
    )
    .map_err(|_| message_error(table, "清理旧数据失败"))?;
    tx.commit()
        .map_err(|_| message_error(table, "提交事务失败"))
}

fn migrate_messages_from_kv(
    conn: &mut Connection,
    suffix: &str,
    table: &str,
) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| message_error(table, "读取旧数据失败"))?;
        let rows = statement
            .query_map(params![format!("{BOOK_PREFIX}%{suffix}")], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| message_error(table, "读取旧数据失败"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| message_error(table, "读取旧数据失败"))?
    };

    let count_sql = match table {
        "chat_messages" => "SELECT COUNT(*) FROM chat_messages WHERE book_id = ?1",
        "reflection_messages" => "SELECT COUNT(*) FROM reflection_messages WHERE book_id = ?1",
        _ => return Err("未知消息表。".to_string()),
    };

    for (key, text) in rows {
        let Some(book_id) = book_suffix_id(&key, suffix).map(str::to_string) else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            continue;
        }

        let exists: i64 = conn
            .query_row(count_sql, params![&book_id], |row| row.get(0))
            .map_err(|_| message_error(table, "检查失败"))?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| message_error(table, "清理旧数据失败"))?;
            continue;
        }

        let value: Value =
            serde_json::from_str(&text).map_err(|_| message_error(table, "旧数据格式损坏"))?;
        sync_messages(conn, table, &book_id, &value)?;
    }

    Ok(())
}

fn load_guide(conn: &Connection, book_id: &str, item_key: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT raw_json
         FROM reading_guides
         WHERE book_id = ?1 AND item_key = ?2",
        params![book_id, item_key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|_| "读取章节导读缓存失败。".to_string())?
    .map(|text| serde_json::from_str(&text).map_err(|_| "章节导读缓存格式损坏。".to_string()))
    .transpose()
}

fn sync_guide(
    conn: &mut Connection,
    book_id: &str,
    item_key: &str,
    guide: &Value,
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|_| "开始章节导读缓存事务失败。".to_string())?;

    if guide.is_null() {
        tx.execute(
            "DELETE FROM reading_guides WHERE book_id = ?1 AND item_key = ?2",
            params![book_id, item_key],
        )
        .map_err(|_| "删除章节导读缓存失败。".to_string())?;
    } else {
        let raw_json =
            serde_json::to_string(guide).map_err(|_| "章节导读缓存序列化失败。".to_string())?;
        tx.execute(
            "INSERT INTO reading_guides (
              book_id, item_key, status, provider, model, generated_at, raw_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(book_id, item_key) DO UPDATE SET
              status = excluded.status,
              provider = excluded.provider,
              model = excluded.model,
              generated_at = excluded.generated_at,
              raw_json = excluded.raw_json",
            params![
                book_id,
                item_key,
                text_field(guide, "status"),
                text_field(guide, "provider"),
                text_field(guide, "model"),
                text_field(guide, "generatedAt"),
                raw_json,
            ],
        )
        .map_err(|_| "写入章节导读缓存失败。".to_string())?;
    }

    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1",
        params![guide_key(book_id, item_key)],
    )
    .map_err(|_| "清理旧章节导读缓存失败。".to_string())?;
    tx.commit()
        .map_err(|_| "提交章节导读缓存事务失败。".to_string())
}

fn migrate_guides_from_kv(conn: &mut Connection) -> Result<(), String> {
    let rows = {
        let mut statement = conn
            .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?1")
            .map_err(|_| "读取旧章节导读缓存失败。".to_string())?;
        let rows = statement
            .query_map(
                params![format!("{BOOK_PREFIX}%{QUESTIONS_MARKER}%")],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|_| "读取旧章节导读缓存失败。".to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "读取旧章节导读缓存失败。".to_string())?
    };

    for (key, text) in rows {
        let Some((book_id, item_key)) = guide_key_parts(&key)
            .map(|(book_id, item_key)| (book_id.to_string(), item_key.to_string()))
        else {
            continue;
        };
        if !book_exists(conn, &book_id)? {
            continue;
        }

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reading_guides WHERE book_id = ?1 AND item_key = ?2",
                params![&book_id, &item_key],
                |row| row.get(0),
            )
            .map_err(|_| "检查章节导读缓存失败。".to_string())?;
        if exists > 0 {
            conn.execute("DELETE FROM kv_store WHERE key = ?1", params![&key])
                .map_err(|_| "清理旧章节导读缓存失败。".to_string())?;
            continue;
        }

        let guide: Value =
            serde_json::from_str(&text).map_err(|_| "旧章节导读缓存格式损坏。".to_string())?;
        sync_guide(conn, &book_id, &item_key, &guide)?;
    }

    Ok(())
}

fn group_raw_json_by_item(rows: Vec<(String, String)>, parse_error: &str) -> Result<Value, String> {
    let mut grouped = Map::new();

    for (item_key, raw_json) in rows {
        let value: Value = serde_json::from_str(&raw_json).map_err(|_| parse_error.to_string())?;
        match grouped.get_mut(&item_key) {
            Some(Value::Array(items)) => items.push(value),
            _ => {
                grouped.insert(item_key, Value::Array(vec![value]));
            }
        }
    }

    Ok(Value::Object(grouped))
}

fn grouped_array_entries(
    value: &Value,
    legacy_item_key: &str,
    type_error: &str,
) -> Result<Vec<(String, Vec<Value>)>, String> {
    if let Some(object) = value.as_object() {
        let mut entries = Vec::new();
        for (item_key, item_values) in object {
            let items = item_values
                .as_array()
                .ok_or_else(|| type_error.to_string())?;
            entries.push((normalize_item_key(item_key, legacy_item_key), items.clone()));
        }
        return Ok(entries);
    }

    let array = value.as_array().ok_or_else(|| type_error.to_string())?;
    let mut grouped = BTreeMap::<String, Vec<Value>>::new();
    for item in array {
        let item_key = text_field(item, "itemKey").unwrap_or_else(|| legacy_item_key.to_string());
        grouped
            .entry(normalize_item_key(&item_key, legacy_item_key))
            .or_default()
            .push(item.clone());
    }

    Ok(grouped.into_iter().collect())
}

fn message_error(table: &str, action: &str) -> String {
    match table {
        "chat_messages" => format!("伴读聊天{action}。"),
        "reflection_messages" => format!("读后交流{action}。"),
        _ => format!("消息{action}。"),
    }
}

fn book_exists(conn: &Connection, book_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1",
        params![book_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(|_| "检查书籍元数据失败。".to_string())
}

fn text_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn int_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|field| {
        field
            .as_i64()
            .or_else(|| field.as_u64().and_then(|number| i64::try_from(number).ok()))
    })
}

fn page_text_field(value: &Value) -> String {
    value
        .get("text")
        .and_then(Value::as_str)
        .or_else(|| value.as_str())
        .unwrap_or_default()
        .to_string()
}

fn plan_item_key(item: &Value, index: usize) -> String {
    text_field(item, "id").unwrap_or_else(|| {
        let item_type = text_field(item, "type").unwrap_or_else(|| "item".to_string());
        format!("{item_type}:{index}")
    })
}

fn progress_book_id(key: &str) -> Option<&str> {
    key.strip_prefix(PROGRESS_PREFIX)
        .map(str::trim)
        .filter(|book_id| !book_id.is_empty())
}

fn progress_key(book_id: &str) -> String {
    format!("{PROGRESS_PREFIX}{book_id}")
}

fn book_suffix_id<'a>(key: &'a str, suffix: &str) -> Option<&'a str> {
    key.strip_prefix(BOOK_PREFIX)
        .and_then(|rest| rest.strip_suffix(suffix))
        .map(str::trim)
        .filter(|book_id| !book_id.is_empty())
}

fn guide_key_parts(key: &str) -> Option<(&str, &str)> {
    let rest = key.strip_prefix(BOOK_PREFIX)?;
    let (book_id, item_key) = rest.split_once(QUESTIONS_MARKER)?;
    let book_id = book_id.trim();
    let item_key = item_key.trim();
    if book_id.is_empty() || item_key.is_empty() {
        None
    } else {
        Some((book_id, item_key))
    }
}

fn formatted_text_key_parts(key: &str) -> Option<(&str, &str)> {
    let rest = key.strip_prefix(BOOK_PREFIX)?;
    let (book_id, item_key) = rest.split_once(FORMATTED_TEXT_MARKER)?;
    let book_id = book_id.trim();
    let item_key = item_key.trim();
    if book_id.is_empty() || item_key.is_empty() {
        None
    } else {
        Some((book_id, item_key))
    }
}

fn book_scoped_key(book_id: &str, suffix: &str) -> String {
    format!("{BOOK_PREFIX}{book_id}{suffix}")
}

fn collect_book_file_paths(
    conn: &Connection,
    files_dir: &Path,
    book_id: &str,
) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();

    if let Some(path) = file_path_for_key(conn, files_dir, &book_scoped_key(book_id, FILE_SUFFIX))?
    {
        paths.push(path);
    }
    if let Some(path) = cover_file_path(conn, files_dir, book_id)? {
        paths.push(path);
    }

    let mut statement = conn
        .prepare("SELECT relative_path FROM file_store WHERE key LIKE ?1")
        .map_err(|_| "读取书籍文件索引失败。".to_string())?;
    let rows = statement
        .query_map(params![format!("{BOOK_PREFIX}{book_id}:%")], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|_| "读取书籍文件索引失败。".to_string())?;
    for row in rows {
        paths.push(safe_file_path(
            files_dir,
            &row.map_err(|_| "读取书籍文件索引失败。".to_string())?,
        )?);
    }

    Ok(paths)
}

fn delete_book_records(
    conn: &mut Connection,
    files_dir: &Path,
    book_id: &str,
) -> Result<Vec<PathBuf>, String> {
    let file_paths = collect_book_file_paths(conn, files_dir, book_id)?;
    let tx = conn
        .transaction()
        .map_err(|_| "开始删除书籍事务失败。".to_string())?;

    tx.execute(
        "DELETE FROM kv_store WHERE key = ?1 OR key LIKE ?2",
        params![
            format!("{PROGRESS_PREFIX}{book_id}"),
            format!("{BOOK_PREFIX}{book_id}:%")
        ],
    )
    .map_err(|_| "清理书籍缓存失败。".to_string())?;
    tx.execute(
        "DELETE FROM file_store WHERE key LIKE ?1",
        params![format!("{BOOK_PREFIX}{book_id}:%")],
    )
    .map_err(|_| "清理书籍文件索引失败。".to_string())?;
    tx.execute("DELETE FROM books WHERE id = ?1", params![book_id])
        .map_err(|_| "删除书籍元数据失败。".to_string())?;
    tx.commit()
        .map_err(|_| "提交删除书籍事务失败。".to_string())?;

    Ok(file_paths)
}

fn guide_key(book_id: &str, item_key: &str) -> String {
    format!("{BOOK_PREFIX}{book_id}{QUESTIONS_MARKER}{item_key}")
}

fn formatted_text_key(book_id: &str, item_key: &str) -> String {
    format!("{BOOK_PREFIX}{book_id}{FORMATTED_TEXT_MARKER}{item_key}")
}

fn normalize_item_key(item_key: &str, fallback: &str) -> String {
    let trimmed = item_key.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn progress_item_keys(progress: &Value) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();

    if let Some(items) = progress.get("completedItemKeys").and_then(Value::as_array) {
        keys.extend(items.iter().filter_map(Value::as_str).map(str::to_string));
    }

    if let Some(object) = progress
        .get("completedAtByItemKey")
        .and_then(Value::as_object)
    {
        keys.extend(object.keys().cloned());
    }

    if let Some(object) = progress
        .get("currentPageByItemKey")
        .and_then(Value::as_object)
    {
        keys.extend(object.keys().cloned());
    }

    keys
}

fn lock_conn(state: &StorageState) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "本地数据库暂时不可用。".to_string())
}

fn validate_key(key: &str) -> Result<(), String> {
    validate_safe_identifier(key, "本地数据 key", 512)
}

fn validate_book_id(book_id: &str) -> Result<(), String> {
    validate_safe_identifier(book_id, "书籍 id", 256)
}

fn validate_safe_identifier(value: &str, label: &str, max_len: usize) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} 不能为空。"));
    }
    if trimmed.len() > max_len {
        return Err(format!("{label} 过长。"));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(format!("{label} 不能包含路径片段。"));
    }
    if trimmed
        .chars()
        .any(|character| character == '\0' || character.is_control())
    {
        return Err(format!("{label} 不能包含控制字符。"));
    }
    Ok(())
}

fn validate_external_backup_path_text(path_text: &str) -> Result<(), String> {
    if path_text.is_empty() {
        return Err("外部备份路径不能为空。".to_string());
    }
    if path_text.len() > 4096 {
        return Err("外部备份路径过长。".to_string());
    }
    if path_text
        .chars()
        .any(|character| character == '\0' || character.is_control())
    {
        return Err("外部备份路径不能包含控制字符。".to_string());
    }
    Ok(())
}

fn key_to_file_name(key: &str) -> String {
    let hex = key
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{hex}.blob")
}

fn scan_orphan_files(conn: &Connection, files_dir: &Path) -> Result<OrphanFileReport, String> {
    let referenced = referenced_relative_paths(conn)?;
    let mut files = Vec::new();

    if files_dir.exists() {
        collect_orphan_files(files_dir, files_dir, &referenced, &mut files)?;
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    let byte_size = files.iter().map(|file| file.byte_size).sum();
    Ok(OrphanFileReport {
        orphan_count: files.len(),
        byte_size,
        files,
    })
}

fn referenced_relative_paths(conn: &Connection) -> Result<BTreeSet<String>, String> {
    let mut referenced = BTreeSet::new();
    collect_relative_paths(
        conn,
        "SELECT relative_path FROM file_store",
        &mut referenced,
        "读取本地文件引用失败。",
    )?;
    collect_relative_paths(
        conn,
        "SELECT relative_path FROM book_files",
        &mut referenced,
        "读取书籍文件引用失败。",
    )?;
    collect_relative_paths(
        conn,
        "SELECT relative_path FROM book_covers",
        &mut referenced,
        "读取封面文件引用失败。",
    )?;
    Ok(referenced)
}

fn collect_relative_paths(
    conn: &Connection,
    sql: &str,
    referenced: &mut BTreeSet<String>,
    error: &str,
) -> Result<(), String> {
    let mut statement = conn.prepare(sql).map_err(|_| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| error.to_string())?;
    for row in rows {
        referenced.insert(normalize_relative_path_text(
            &row.map_err(|_| error.to_string())?,
        ));
    }
    Ok(())
}

fn collect_orphan_files(
    root: &Path,
    current: &Path,
    referenced: &BTreeSet<String>,
    files: &mut Vec<OrphanFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|_| "扫描本地文件目录失败。".to_string())?;
    for entry in entries {
        let entry = entry.map_err(|_| "扫描本地文件目录失败。".to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_orphan_files(root, &path, referenced, files)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }

        let Some(relative_path) = relative_path_text(root, &path) else {
            continue;
        };
        if referenced.contains(&relative_path) {
            continue;
        }
        let byte_size = fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        files.push(OrphanFile {
            relative_path,
            byte_size,
        });
    }
    Ok(())
}

fn relative_path_text(root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root)
        .ok()
        .map(|relative| normalize_relative_path_text(&relative.to_string_lossy()))
}

fn normalize_relative_path_text(value: &str) -> String {
    value.replace('\\', "/")
}

fn clean_file_name(name: &str) -> String {
    let cleaned = name
        .trim()
        .chars()
        .map(|character| {
            if character == '/' || character == '\\' || character.is_control() {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let cleaned = cleaned.trim_matches(|character| matches!(character, '.' | ' ' | '_'));
    if cleaned.is_empty() {
        "book.bin".to_string()
    } else if cleaned.len() > 180 {
        cleaned.chars().take(180).collect()
    } else {
        cleaned.to_string()
    }
}

fn file_path_for_key(
    conn: &Connection,
    files_dir: &Path,
    key: &str,
) -> Result<Option<PathBuf>, String> {
    if let Some(book_id) = book_suffix_id(key, FILE_SUFFIX) {
        let book_file_path = conn
            .query_row(
                "SELECT relative_path FROM book_files WHERE book_id = ?1",
                params![book_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "读取书籍文件索引失败。".to_string())?
            .map(|relative_path| safe_file_path(files_dir, &relative_path))
            .transpose()?;

        if book_file_path.is_some() {
            return Ok(book_file_path);
        }
    }

    conn.query_row(
        "SELECT relative_path FROM file_store WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|_| "读取旧文件索引失败。".to_string())?
    .map(|relative_path| safe_file_path(files_dir, &relative_path))
    .transpose()
}

fn stored_file_item(files_dir: &Path, record: FileRecord) -> Result<StoredItem, String> {
    let path = safe_file_path(files_dir, &record.relative_path)?;
    if !path.exists() {
        return Err("本地书籍文件不存在，请重新导入。".to_string());
    }

    Ok(StoredItem {
        kind: "file".to_string(),
        value: None,
        file: Some(StoredFileRead {
            name: record.file_name,
            mime_type: record.mime_type,
            size: record.file_size.max(0) as u64,
            base64: String::new(),
            local_path: Some(path.to_string_lossy().to_string()),
            relative_path: Some(record.relative_path),
        }),
    })
}

fn safe_file_path(files_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative_path);
    let components = path.components().collect::<Vec<_>>();
    let valid_shape = match components.as_slice() {
        [Component::Normal(_)] => true,
        [Component::Normal(dir), Component::Normal(_)] => dir.to_string_lossy() == "covers",
        _ => false,
    };
    if !valid_shape {
        return Err("本地文件路径不安全。".to_string());
    }
    if relative_path.contains('\\')
        || relative_path.contains("..")
        || relative_path
            .chars()
            .any(|character| character == '\0' || character.is_control())
    {
        return Err("本地文件路径不安全。".to_string());
    }
    Ok(files_dir.join(relative_path))
}

fn remove_file_if_exists(path: Option<PathBuf>) -> Result<(), String> {
    let Some(path) = path else {
        return Ok(());
    };
    if path.exists() {
        fs::remove_file(path).map_err(|_| "删除旧本地文件失败。".to_string())?;
    }
    Ok(())
}

#[derive(Debug)]
struct FileRecord {
    file_name: String,
    mime_type: String,
    file_size: i64,
    relative_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn row_count(conn: &Connection, table: &str, book_id: &str) -> i64 {
        let id_column = if table == "books" { "id" } else { "book_id" };
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE {id_column} = ?1"),
            params![book_id],
            |row| row.get(0),
        )
        .expect("count rows")
    }

    #[test]
    fn command_identifiers_reject_path_like_input() {
        assert!(validate_key("settings").is_ok());
        assert!(validate_key("book:book-1:formatted-text:item-1").is_ok());
        assert!(validate_key("book:../secret:file").is_err());
        assert!(validate_key("book/book-1/file").is_err());
        assert!(validate_key("book:\nbook-1:file").is_err());

        assert!(validate_book_id("book-1").is_ok());
        assert!(validate_book_id("../book-1").is_err());
        assert!(validate_book_id("book/1").is_err());
    }

    #[test]
    fn external_backup_paths_reject_control_characters() {
        assert!(validate_external_backup_path_text("~/Desktop/backup").is_ok());
        assert!(validate_external_backup_path_text("").is_err());
        assert!(validate_external_backup_path_text("backup\0manifest.json").is_err());
        assert!(validate_external_backup_path_text(&"a".repeat(4097)).is_err());
    }

    #[test]
    fn local_file_paths_stay_inside_allowed_shapes() {
        let files_dir = std::env::temp_dir().join("duban-safe-file-path-test");
        assert_eq!(
            safe_file_path(&files_dir, "abc.blob").expect("top-level blob"),
            files_dir.join("abc.blob")
        );
        assert_eq!(
            safe_file_path(&files_dir, "covers/abc.blob").expect("cover blob"),
            files_dir.join("covers/abc.blob")
        );
        assert!(safe_file_path(&files_dir, "../abc.blob").is_err());
        assert!(safe_file_path(&files_dir, "nested/abc.blob").is_err());
        assert!(safe_file_path(&files_dir, "covers/nested/abc.blob").is_err());
        assert!(safe_file_path(&files_dir, "abc\\blob").is_err());
    }

    #[test]
    fn file_names_are_sanitized_before_storage_and_backup() {
        assert_eq!(clean_file_name(" ../book\\draft.pdf "), "book_draft.pdf");
        assert_eq!(clean_file_name("\n\t"), "book.bin");
    }

    #[test]
    fn storage_health_report_passes_for_empty_initialized_store() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-health-ok-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        let backups_dir = root.join("backups");
        fs::create_dir_all(&files_dir).expect("create files dir");
        fs::create_dir_all(&backups_dir).expect("create backups dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");
        let state = StorageState {
            conn: Mutex::new(conn),
            files_dir,
            backups_dir,
        };

        let report = build_storage_health_report(&state).expect("health report");
        assert_eq!(report.status(), "ok");
        assert_eq!(report.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(report.sqlite_quick_check, "ok");
        assert!(report
            .table_counts
            .iter()
            .any(|table| table.table == "books"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn storage_health_report_flags_missing_indexed_files() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-health-missing-file-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        let backups_dir = root.join("backups");
        fs::create_dir_all(&files_dir).expect("create files dir");
        fs::create_dir_all(&backups_dir).expect("create backups dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");
        sync_file_key(
            &conn,
            &files_dir,
            "diagnostic-file",
            StoredFileWrite {
                name: "missing.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                base64: general_purpose::STANDARD.encode(b"missing soon"),
            },
        )
        .expect("sync file");
        fs::remove_file(files_dir.join(key_to_file_name("diagnostic-file")))
            .expect("remove indexed file");
        let state = StorageState {
            conn: Mutex::new(conn),
            files_dir,
            backups_dir,
        };

        let report = build_storage_health_report(&state).expect("health report");
        assert_eq!(report.status(), "error");
        assert_eq!(report.files.missing_file_count, 1);
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "missing-local-files"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn delete_book_records_removes_book_and_related_structured_data() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-delete-book-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");

        let books = json!([
            {
                "id": "book-1",
                "title": "Delete Me",
                "format": "pdf",
                "fileName": "delete-me.pdf",
                "fileType": "application/pdf",
                "fileSize": 4,
                "totalPages": 1
            },
            {
                "id": "book-2",
                "title": "Keep Me",
                "format": "pdf",
                "fileName": "keep-me.pdf",
                "fileType": "application/pdf",
                "fileSize": 4,
                "totalPages": 1
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &books).expect("sync books");
        sync_json_key(
            &mut conn,
            &files_dir,
            "book:book-1:pages",
            &json!([{ "pageNumber": 1, "text": "delete page" }]),
        )
        .expect("sync pages for deleted book");
        sync_json_key(
            &mut conn,
            &files_dir,
            "book:book-2:pages",
            &json!([{ "pageNumber": 1, "text": "keep page" }]),
        )
        .expect("sync pages for kept book");
        sync_file_key(
            &conn,
            &files_dir,
            "book:book-1:file",
            StoredFileWrite {
                name: "delete-me.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                base64: general_purpose::STANDARD.encode(b"test"),
            },
        )
        .expect("sync deleted book file");
        sync_file_key(
            &conn,
            &files_dir,
            "book:book-2:file",
            StoredFileWrite {
                name: "keep-me.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                base64: general_purpose::STANDARD.encode(b"keep"),
            },
        )
        .expect("sync kept book file");

        let deleted_paths =
            delete_book_records(&mut conn, &files_dir, "book-1").expect("delete book records");

        assert_eq!(row_count(&conn, "books", "book-1"), 0);
        assert_eq!(row_count(&conn, "book_pages", "book-1"), 0);
        assert_eq!(row_count(&conn, "book_files", "book-1"), 0);
        assert_eq!(row_count(&conn, "books", "book-2"), 1);
        assert_eq!(row_count(&conn, "book_pages", "book-2"), 1);
        assert_eq!(row_count(&conn, "book_files", "book-2"), 1);
        assert_eq!(
            load_books(&conn).expect("load books"),
            json!([
                {
                    "id": "book-2",
                    "title": "Keep Me",
                    "format": "pdf",
                    "fileName": "keep-me.pdf",
                    "fileType": "application/pdf",
                    "fileSize": 4,
                    "totalPages": 1
                }
            ])
        );
        assert_eq!(deleted_paths.len(), 1);
        assert!(deleted_paths[0].exists());
    }

    #[test]
    fn backup_roundtrip_restores_structured_data_and_files() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-backup-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");

        let books = json!([
            {
                "id": "book-1",
                "title": "Backup Test",
                "author": "Duban",
                "format": "pdf",
                "fileName": "backup-test.pdf",
                "fileType": "application/pdf",
                "fileSize": 4,
                "totalPages": 1,
                "chapters": [
                    {
                        "id": "chapter-1",
                        "title": "Chapter 1",
                        "startPage": 1,
                        "endPage": 1
                    }
                ]
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &books).expect("sync books");
        sync_json_key(
            &mut conn,
            &files_dir,
            "book:book-1:pages",
            &json!([{ "pageNumber": 1, "text": "hello backup" }]),
        )
        .expect("sync pages");
        sync_file_key(
            &conn,
            &files_dir,
            "book:book-1:file",
            StoredFileWrite {
                name: "backup-test.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                base64: general_purpose::STANDARD.encode(b"test"),
            },
        )
        .expect("sync file");

        let backup_dir = root.join("backup");
        let backup_files_dir = backup_dir.join(BACKUP_FILES_DIR);
        fs::create_dir_all(&backup_files_dir).expect("create backup files dir");
        let backup = build_storage_backup(&conn, &files_dir, "test", Some(&backup_files_dir))
            .expect("build backup");
        assert_eq!(backup.items.len(), 2);
        assert_eq!(backup.files.len(), 1);
        assert!(backup.files[0].base64.is_empty());
        assert!(backup.files[0].relative_path.is_some());
        assert_eq!(
            backup.files[0].sha256.as_deref(),
            Some(sha256_hex(b"test")).as_deref()
        );
        let mut backup = backup;
        write_backup_manifest(&backup_dir.join(BACKUP_MANIFEST_FILE), &mut backup)
            .expect("write backup manifest");
        assert!(backup.manifest_sha256.is_some());
        assert!(validate_backup_report(&backup, Some(&backup_dir)).is_empty());

        clear_storage_data(&conn, &files_dir, false).expect("clear storage");

        let mut items = backup.items;
        items.sort_by_key(|item| backup_key_priority(&item.key));
        for item in items {
            sync_json_key(&mut conn, &files_dir, &item.key, &item.value).expect("restore item");
        }
        for file in backup.files {
            let key = file.key.clone();
            let stored_file =
                backup_file_to_stored_write(&file, Some(&backup_dir)).expect("restore file data");
            sync_file_key(&conn, &files_dir, &key, stored_file).expect("restore file");
        }

        assert_eq!(
            load_books(&conn)
                .expect("load books")
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            load_pages(&conn, "book-1")
                .expect("load pages")
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let file_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM book_files", [], |row| row.get(0))
            .expect("count book files");
        assert_eq!(file_count, 1);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn backup_validation_rejects_tampered_directory_file() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-backup-hash-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");
        let books = json!([
            {
                "id": "book-1",
                "title": "Hash Test",
                "chapters": []
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &books).expect("sync books");
        sync_file_key(
            &conn,
            &files_dir,
            "book:book-1:file",
            StoredFileWrite {
                name: "hash-test.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                base64: general_purpose::STANDARD.encode(b"safe"),
            },
        )
        .expect("sync file");

        let backup_dir = root.join("backup");
        let backup_files_dir = backup_dir.join(BACKUP_FILES_DIR);
        fs::create_dir_all(&backup_files_dir).expect("create backup files dir");
        let mut backup = build_storage_backup(&conn, &files_dir, "test", Some(&backup_files_dir))
            .expect("build backup");
        write_backup_manifest(&backup_dir.join(BACKUP_MANIFEST_FILE), &mut backup)
            .expect("write backup manifest");

        let relative_path = backup.files[0]
            .relative_path
            .as_ref()
            .expect("relative file path");
        fs::write(backup_dir.join(relative_path), b"tampered").expect("tamper backup file");

        let issues = validate_backup_report(&backup, Some(&backup_dir));
        assert!(issues
            .iter()
            .any(|issue| { issue.severity == "error" && issue.code == "file-integrity-mismatch" }));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn replace_import_rolls_back_when_apply_fails() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-backup-rollback-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        let backups_dir = root.join("backups");
        fs::create_dir_all(&files_dir).expect("create test files dir");
        fs::create_dir_all(&backups_dir).expect("create backups dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");
        let existing_books = json!([
            {
                "id": "existing-book",
                "title": "Existing Book",
                "chapters": []
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &existing_books)
            .expect("sync existing book");

        let state = StorageState {
            conn: Mutex::new(conn),
            files_dir,
            backups_dir,
        };
        let mut bad_backup = StorageBackup {
            format: BACKUP_FORMAT.to_string(),
            backup_version: BACKUP_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION.to_string(),
            exported_at: "test".to_string(),
            app: "读伴 · Duban".to_string(),
            label: None,
            notes: None,
            manifest_sha256: None,
            includes_api_keys: false,
            items: vec![BackupItem {
                key: "progress:existing-book".to_string(),
                value: json!("not an object"),
            }],
            files: Vec::new(),
        };
        finalize_backup_manifest(&mut bad_backup).expect("finalize bad backup");

        let result = restore_storage_backup(bad_backup, None, "replace", &state);
        assert!(result
            .expect_err("restore should fail")
            .contains("已自动恢复到导入前状态"));

        let conn = state.conn.lock().expect("lock conn");
        let restored = load_books(&conn).expect("load restored books");
        let books = restored.as_array().expect("books array");
        assert_eq!(books.len(), 1);
        assert_eq!(
            text_field(&books[0], "id").as_deref(),
            Some("existing-book")
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn backup_merge_keeps_books_that_are_not_in_backup() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-backup-merge-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");

        let backup_books = json!([
            {
                "id": "book-from-backup",
                "title": "Backup Book",
                "chapters": []
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &backup_books).expect("sync backup book");
        let backup = build_storage_backup(&conn, &files_dir, "test", None).expect("build backup");

        clear_storage_data(&conn, &files_dir, false).expect("clear storage");
        let existing_books = json!([
            {
                "id": "existing-book",
                "title": "Existing Book",
                "chapters": []
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &existing_books)
            .expect("sync existing book");

        for item in backup.items {
            merge_json_key(&mut conn, &files_dir, &item.key, &item.value).expect("merge item");
        }

        let restored = load_books(&conn).expect("load books");
        let books = restored.as_array().expect("books array");
        assert_eq!(books.len(), 2);
        assert!(books
            .iter()
            .any(|book| text_field(book, "id").as_deref() == Some("existing-book")));
        assert!(books
            .iter()
            .any(|book| text_field(book, "id").as_deref() == Some("book-from-backup")));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn p62_migrates_settings_covers_and_formatted_text_out_of_kv() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-p62-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");
        let books = json!([
            {
                "id": "book-1",
                "title": "P6.2 Book",
                "chapters": []
            }
        ]);
        sync_json_key(&mut conn, &files_dir, BOOKS_KEY, &books).expect("sync books");

        let settings = json!({
            "provider": "anthropic",
            "anthropic": {
                "model": "claude-sonnet-4-6",
                "hasApiKey": true
            },
            "openaiCompatible": {
                "baseUrl": "https://api.openai.com/v1",
                "model": "gpt-5.4-mini"
            }
        });
        let cover = format!(
            "data:image/jpeg;base64,{}",
            general_purpose::STANDARD.encode(b"cover-bytes")
        );
        let formatted = json!({
            "markdown": "# Formatted",
            "provider": "anthropic",
            "model": "claude-sonnet-4-6",
            "generatedAt": "2026-06-18T00:00:00.000Z"
        });

        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![SETTINGS_KEY, serde_json::to_string(&settings).unwrap()],
        )
        .expect("insert legacy settings");
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![
                book_scoped_key("book-1", COVER_SUFFIX),
                serde_json::to_string(&cover).unwrap()
            ],
        )
        .expect("insert legacy cover");
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            params![
                formatted_text_key("book-1", "item-1"),
                serde_json::to_string(&formatted).unwrap()
            ],
        )
        .expect("insert legacy formatted text");

        migrate_settings_from_kv(&conn).expect("migrate settings");
        migrate_covers_from_kv(&conn, &files_dir).expect("migrate covers");
        migrate_formatted_texts_from_kv(&conn).expect("migrate formatted text");

        let kv_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM kv_store", [], |row| row.get(0))
            .expect("count kv");
        assert_eq!(kv_count, 0);
        let settings_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
            .expect("count settings");
        assert_eq!(settings_count, 1);
        let cover_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM book_covers", [], |row| row.get(0))
            .expect("count covers");
        assert_eq!(cover_count, 1);
        let formatted_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM formatted_texts", [], |row| row.get(0))
            .expect("count formatted text");
        assert_eq!(formatted_count, 1);

        assert_eq!(
            load_book_cover(&conn, &files_dir, "book-1")
                .expect("load cover")
                .and_then(|value| value.as_str().map(str::to_string)),
            Some(cover)
        );
        assert_eq!(
            load_formatted_text(&conn, "book-1", "item-1")
                .expect("load formatted")
                .and_then(|value| text_field(&value, "markdown")),
            Some("# Formatted".to_string())
        );

        let backup = build_storage_backup(&conn, &files_dir, "test", None).expect("build backup");
        assert!(backup
            .items
            .iter()
            .any(|item| item.key == book_scoped_key("book-1", COVER_SUFFIX)));
        assert!(backup
            .items
            .iter()
            .any(|item| item.key == formatted_text_key("book-1", "item-1")));
        let backup_settings = backup
            .items
            .iter()
            .find(|item| item.key == SETTINGS_KEY)
            .expect("backup settings");
        assert!(backup_settings
            .value
            .pointer("/anthropic/hasApiKey")
            .is_none());

        fs::write(files_dir.join("orphan.bin"), b"orphan").expect("write orphan file");
        let report = scan_orphan_files(&conn, &files_dir).expect("scan orphan files");
        assert_eq!(report.orphan_count, 1);
        assert_eq!(report.files[0].relative_path, "orphan.bin");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn legacy_settings_secrets_are_redacted_without_keychain_migration() {
        let root = std::env::temp_dir().join(format!(
            "duban-storage-settings-test-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let files_dir = root.join("files");
        fs::create_dir_all(&files_dir).expect("create test files dir");

        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        initialize_schema(&mut conn, &files_dir).expect("initialize schema");

        let legacy_settings = json!({
            "provider": "anthropic",
            "apiKey": "legacy-root-key",
            "anthropic": {
                "apiKey": "legacy-anthropic-key",
                "model": "claude-sonnet-4-6"
            },
            "openaiCompatible": {
                "apiKey": "legacy-openai-key",
                "baseUrl": "https://api.openai.com/v1",
                "model": "gpt-5.4-mini"
            }
        });
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))",
            params![
                SETTINGS_KEY,
                serde_json::to_string(&legacy_settings).expect("serialize legacy settings")
            ],
        )
        .expect("insert legacy settings");

        let loaded = load_settings(&conn)
            .expect("load settings")
            .expect("settings should exist");
        assert!(loaded.get("apiKey").is_none());
        assert!(loaded.pointer("/anthropic/apiKey").is_none());
        assert!(loaded.pointer("/openaiCompatible/apiKey").is_none());

        migrate_settings_from_kv(&conn).expect("migrate legacy settings");
        let raw: String = conn
            .query_row(
                "SELECT raw_json FROM app_settings WHERE id = 'settings'",
                [],
                |row| row.get(0),
            )
            .expect("read migrated settings");
        assert!(!raw.contains("apiKey"));
        let legacy_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM kv_store WHERE key = ?1",
                params![SETTINGS_KEY],
                |row| row.get(0),
            )
            .expect("count legacy settings");
        assert_eq!(legacy_count, 0);

        let redacted: Value = serde_json::from_str(&raw).expect("parse redacted settings");
        assert_eq!(
            text_field(&redacted, "provider").as_deref(),
            Some("anthropic")
        );
        assert_eq!(
            text_field(&redacted["anthropic"], "model").as_deref(),
            Some("claude-sonnet-4-6")
        );

        fs::remove_dir_all(root).ok();
    }
}
