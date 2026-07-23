# 读伴桌面存储 Schema

> 最后更新：2026-07-16
>
> 最后复核：2026-07-22，当前仍为 schema `10`、目录备份 `v3`。

本文档记录 Tauri 桌面版从 IndexedDB 迁移到 SQLite + App 数据目录后的目标 schema。它服务于 App 化阶段 5，和 [APP_EVOLUTION_LOG.md](./APP_EVOLUTION_LOG.md) 的分工是：

- 本文档记录数据表、字段、迁移顺序和约束。
- `APP_EVOLUTION_LOG.md` 记录每次实际推进、验证结果和限制。

## 存储边界

桌面版本地数据目录按通道隔离：

```text
正式：~/Library/Application Support/com.duban.reader/
测试：~/Library/Application Support/com.duban.reader.test/

目录内部：
  duban.sqlite3
  files/
  backups/
```

当前原则：

- SQLite 保存可查询、可迁移的结构化数据。
- 原始 PDF/MOBI 文件保存在 `files/` 目录，SQLite 只保存文件索引。
- 桌面备份文件保存在 `backups/` 目录，当前为 `manifest.json + files/` 目录式备份。
- 浏览器版继续使用 IndexedDB，桌面版通过 `storageAdapter` 分流到 Tauri command。
- 前端业务层先继续使用 `storage.js` / `books.js` 门面，逐步替换底层实现。
- `npm run tauri:dev` 固定使用 `com.duban.reader.test`；正式目录只允许 formal 构建访问。
- API Key 的 Keychain service 同样按 identifier 隔离，测试/正式不得共用。

## Schema 版本

`schema_meta` 保存本地数据库版本：

| key | value |
| --- | --- |
| `schema_version` | 当前为 `10` |

版本含义：

| 版本 | 内容 |
| --- | --- |
| `1` | 阶段 5.1：`kv_store` + `file_store`，通用 key-value 与文件索引。 |
| `2` | 阶段 5.3：新增结构化 `books` 和 `book_chapters`，`books` key 不再写入 `kv_store`。 |
| `3` | 阶段 5.4：新增结构化 `reading_plans`、`reading_plan_items`、`reading_progress` 和 `reading_item_progress`，`progress:{bookId}` 不再写入 `kv_store`。 |
| `4` | 阶段 5.5：新增结构化 `notes`、`chat_messages`、`reflection_messages` 和 `reading_guides`，对应 book scoped key 不再写入 `kv_store`。 |
| `5` | 阶段 5.6：新增结构化 `book_files` 和 `book_pages`，`book:{bookId}:file` / `book:{bookId}:pages` 不再写入通用表；桌面读取原始文件时返回本地文件引用。 |
| `6` | 阶段 5.7：桌面版 API Key 迁入系统 Keychain，`kv_store.settings` 只保留非敏感配置。 |
| `7` | 阶段 5.8：新增备份导出/导入命令，并将 schema 初始化收束为显式迁移器。 |
| `8` | 阶段 5.9：备份升级为目录式 manifest + files，支持备份清单、导入前预览、校验报告和合并导入；P6.1 在不升 DB schema 的前提下将备份格式升到 v3。 |
| `9` | P6.2：新增结构化 `app_settings`、`book_covers`、`formatted_texts`；`kv_store.settings`、`book:{id}:cover`、`book:{id}:formatted-text:{itemKey}` 迁出通用 KV；`book_files` 补充导入来源和最后校验时间。 |
| `10` | P7.5：新增结构化 `companion_events`，统一陪读事件、来源锚点、原数据引用、状态与 tombstone；目录式备份同步支持事件预览、校验和去重合并。 |

## 当前已实现表

### `kv_store`

保留给兼容旧 key 或临时低风险 JSON：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `TEXT PRIMARY KEY` | 兼容旧 IndexedDB key。 |
| `value` | `TEXT NOT NULL` | JSON 字符串。 |
| `updated_at` | `TEXT NOT NULL` | SQLite 写入时间。 |

P6.2 之后不应再把长期核心数据新增到这里。以下旧 key 已迁出：

- `settings` -> `app_settings`
- `book:{bookId}:cover` -> `book_covers` + `files/covers/`
- `book:{bookId}:formatted-text:{itemKey}` -> `formatted_texts`

### `file_store`

保留给非书籍文件索引或旧数据兼容。书籍原始文件已迁入 `book_files`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `TEXT PRIMARY KEY` | 兼容旧 key，例如 `book:{id}:file`。 |
| `file_name` | `TEXT NOT NULL` | 原始文件名。 |
| `mime_type` | `TEXT NOT NULL` | MIME 类型。 |
| `file_size` | `INTEGER NOT NULL` | 文件大小，单位 byte。 |
| `relative_path` | `TEXT NOT NULL` | 相对 `files/` 的路径。 |
| `updated_at` | `TEXT NOT NULL` | SQLite 写入时间。 |

### `books`

阶段 5.3 已实现。保存书籍元数据的结构化索引，同时保留完整 JSON，确保前端旧对象可以无损恢复。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 书籍 id。 |
| `title` | `TEXT` | 书名。 |
| `author` | `TEXT` | 作者。 |
| `format` | `TEXT` | `pdf` / `mobi`。 |
| `file_name` | `TEXT` | 原始文件名。 |
| `file_type` | `TEXT` | 原始 MIME。 |
| `file_size` | `INTEGER` | 原始文件大小。 |
| `total_pages` | `INTEGER` | PDF 页数或 MOBI 文本页数。 |
| `detection_source` | `TEXT` | 章节识别来源，例如 `outline`、`layout`、`text`、`toc`、`spine` 或 `fallback`。 |
| `parser` | `TEXT` | 解析器信息。 |
| `language` | `TEXT` | 语言。 |
| `status` | `TEXT` | `parsed` / `confirmed` / `planned` 等。 |
| `created_at` | `TEXT` | 创建时间。 |
| `updated_at` | `TEXT` | 更新时间。 |
| `list_order` | `INTEGER NOT NULL` | 书架顺序。 |
| `raw_json` | `TEXT NOT NULL` | 完整书籍对象 JSON。 |

说明：

- `books` 表是 `KEYS.books` 的桌面版 source of truth。
- `raw_json` 暂时保留 `readingProfile`、`readingPlan`、`wholeBookGuide` 等尚未结构化字段。
- P7.4 新增的 `readingProfile.companionPolicy` 与 `readingProfile.companionMemory` 仍保存在 `raw_json`，作为用户可编辑设置的 source of truth。P7.5 的 `companion_events` 只保存策略/记忆变更快照及其引用，不建立第二份可编辑真相源；旧 `companionFocus` 保留，不做覆盖或删除。
- 后续结构化表稳定后，再逐步减少对 `raw_json` 的依赖。

### `book_chapters`

阶段 5.3 已实现。保存书籍章节索引，当前仍从 `book.raw_json.chapters` 同步。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `chapter_id` | `TEXT NOT NULL` | 章节 id；旧数据缺失时使用 `chapter:{index}`。 |
| `position` | `INTEGER NOT NULL` | 章节顺序。 |
| `title` | `TEXT` | 章节标题。 |
| `start_page` | `INTEGER` | 起始页或文本页。 |
| `end_page` | `INTEGER` | 结束页或文本页。 |
| `purpose` | `TEXT` | `ignore` / `intro` / `main` / `appendix` 等。 |
| `source` | `TEXT` | outline、layout、text、toc、spine、fallback 等。 |
| `raw_json` | `TEXT NOT NULL` | 完整章节对象 JSON。 |

主键：

```text
(book_id, chapter_id)
```

外键：

```text
book_id -> books.id ON DELETE CASCADE
```

### `book_files`

阶段 5.6 已实现。替代书籍文件相关的 `file_store` 记录，让书籍与原始 PDF/MOBI 文件索引直接关联。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT PRIMARY KEY` | 所属书籍。 |
| `file_name` | `TEXT NOT NULL` | 原始文件名。 |
| `mime_type` | `TEXT NOT NULL` | MIME 类型。 |
| `file_size` | `INTEGER NOT NULL` | 文件大小。 |
| `relative_path` | `TEXT NOT NULL` | 相对 `files/` 的路径。 |
| `sha256` | `TEXT` | 文件 hash，用于备份校验和后续去重。 |
| `import_source` | `TEXT` | 写入来源，例如 `local-write` / `legacy-file-store`。 |
| `last_verified_at` | `TEXT` | 最后一次写入或校验时间。 |
| `created_at` | `TEXT NOT NULL` | 创建时间。 |
| `updated_at` | `TEXT NOT NULL` | 更新时间。 |

说明：

- `duban_storage_get_item("book:{id}:file")` 会从该表读取文件索引。
- 桌面端读取文件时返回 `localPath` 和 `relativePath` 文件引用，前端通过受限 Tauri fs 插件读取二进制/文本，不再依赖 `asset://` 状态码，也不在阅读时通过自定义 storage command 返回整本书的 base64。
- 现阶段首次上传仍由前端浏览器 File API 解析文件，再通过现有 command 保存到 App 数据目录；后续若接入原生文件选择器，可进一步减少首次导入时的 base64 IPC。

### `book_pages`

阶段 5.6 已实现。替代 `book:{id}:pages`，保存 PDF 页文本或 MOBI 文本页。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `page_index` | `INTEGER NOT NULL` | 0 基页索引。 |
| `page_number` | `INTEGER` | 1 基页码或文本页号。 |
| `text` | `TEXT NOT NULL` | 页文本。 |
| `raw_json` | `TEXT NOT NULL` | 完整页对象 JSON，保留 MOBI `sourceChapterId` 等额外字段。 |

主键：`(book_id, page_index)`。

说明：

- `duban_storage_get_item("book:{id}:pages")` 会从该表按 `page_index` 恢复成旧数组。
- `duban_storage_set_item("book:{id}:pages", value)` 会写入该表并清理旧 `kv_store` key。

### `reading_plans`

阶段 5.4 已实现。保存单本书阅读计划的结构化索引，同时保留完整 JSON。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT PRIMARY KEY` | 所属书籍。 |
| `status` | `TEXT` | 计划状态，例如 `draft`。 |
| `generated_by` | `TEXT` | 生成来源，例如 `local_opening`。 |
| `summary` | `TEXT` | 计划摘要。 |
| `item_count` | `INTEGER NOT NULL` | 阅读项数量。 |
| `updated_at` | `TEXT` | 更新时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整阅读计划 JSON。 |

说明：

- 当前仍从 `book.raw_json.readingPlan` 同步。
- 前端读取书籍对象时仍能拿到完整 `readingPlan`，上层 API 不变。

### `reading_plan_items`

阶段 5.4 已实现。保存每个阅读项的可查询索引。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id；缺失时使用 `{type}:{index}`。 |
| `position` | `INTEGER NOT NULL` | 计划顺序。 |
| `day` | `INTEGER` | 第几天。 |
| `planned_date` | `TEXT` | 计划阅读日期。 |
| `title` | `TEXT` | 阅读项标题。 |
| `type` | `TEXT` | `guide` / `main` 等。 |
| `start_page` | `INTEGER` | 起始页。 |
| `end_page` | `INTEGER` | 结束页。 |
| `raw_json` | `TEXT NOT NULL` | 完整阅读项 JSON。 |

主键：

```text
(book_id, item_key)
```

### `reading_progress`

阶段 5.4 已实现。替代 `progress:{bookId}`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT PRIMARY KEY` | 所属书籍。 |
| `current_item_index` | `INTEGER NOT NULL` | 当前阅读项序号。 |
| `last_read_at` | `TEXT` | 最近阅读时间。 |
| `reading_days_json` | `TEXT NOT NULL` | 打卡日期数组 JSON。 |
| `updated_at` | `TEXT` | 更新时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整进度 JSON。 |

说明：

- `duban_storage_get_item("progress:{bookId}")` 会从该表恢复完整旧对象。
- `duban_storage_set_item("progress:{bookId}")` 会写入该表并同步 `reading_item_progress`。
- P7.6 在 `raw_json.readStateByItemKey` 中按阅读项保存到达、有效阅读和完成范围。该字段为可选增量；旧进度没有该字段时按空状态读取，不触发 schema 迁移。
- 正文分块由前端根据现有页文本按需计算，不新增 SQLite 表；其内容指纹变化时，旧细粒度阅读范围会保守失效。

### `reading_item_progress`

阶段 5.4 已实现。拆出每个阅读项的完成状态和最近位置。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id。 |
| `current_page` | `INTEGER` | 最近页码或文本页。 |
| `completed_at` | `TEXT` | 完成时间。 |
| `last_location_json` | `TEXT` | 完整阅读位置 JSON。 |

主键：

```text
(book_id, item_key)
```

### `notes`

阶段 5.5 已实现。替代 `book:{id}:notes`，仍按阅读项 key 恢复成前端原来的分组对象。

2026-07-08 起，本书级「和读伴聊聊」里保存的读伴回答也复用这张表。可定位当前阅读项时写入当前 `item_key`，否则写入保留 `item_key = "__book_companion__"`；`source = "book-companion-chat"` 用于区分来自本书级聊天的沉淀笔记，不改变 schema。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `id` | `TEXT NOT NULL` | 笔记 id。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id。 |
| `position` | `INTEGER NOT NULL` | 当前阅读项内顺序。 |
| `page_number` | `INTEGER` | 页码或文本页。 |
| `text` | `TEXT` | 原文摘录。 |
| `note` | `TEXT` | 用户笔记。 |
| `assistant_content` | `TEXT` | 从读伴回答保存来的内容。 |
| `source_message_id` | `TEXT` | 关联的伴读消息 id。 |
| `source` | `TEXT` | 来源，例如 `selection` / `assistant` / `guide` / `book-companion-chat`。 |
| `created_at` | `TEXT` | 创建时间。 |
| `updated_at` | `TEXT` | 更新时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整笔记 JSON。 |

主键：`(book_id, id)`。

### `chat_messages`

阶段 5.5 已实现。替代 `book:{id}:chat`，仍按阅读项 key 恢复成前端原来的消息分组对象。

2026-07-08 起，本书级「和读伴聊聊」也复用这张表和 `book:{id}:chat` 分组对象，使用保留 `item_key = "__book_companion__"` 保存全书聊天历史。它不改变 schema，不覆盖各阅读项 sidebar 伴读问答；后续如果需要独立导出、搜索或长期记忆索引，再评估是否拆出 `book_companion_messages`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `id` | `TEXT NOT NULL` | 消息 id。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id。 |
| `position` | `INTEGER NOT NULL` | 当前阅读项内顺序。 |
| `role` | `TEXT NOT NULL` | `user` / `assistant` / `system`。 |
| `content` | `TEXT` | 消息内容。 |
| `quote_json` | `TEXT` | 引用原文对象 JSON。 |
| `model` | `TEXT` | 生成模型。 |
| `created_at` | `TEXT` | 创建时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整消息 JSON，保留 usage、cost、finishReason 等运行信息。 |

主键：`(book_id, id)`。

### `reflection_messages`

阶段 5.5 已实现。替代 `book:{id}:reflection`，和伴读聊天分表保存，便于后续独立导出、搜索和统计。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `id` | `TEXT NOT NULL` | 消息 id。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id。 |
| `position` | `INTEGER NOT NULL` | 当前阅读项内顺序。 |
| `role` | `TEXT NOT NULL` | `user` / `assistant` / `system`。 |
| `content` | `TEXT` | 消息内容。 |
| `kind` | `TEXT` | 读后交流消息类型，例如 `opening`。 |
| `model` | `TEXT` | 生成模型。 |
| `created_at` | `TEXT` | 创建时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整消息 JSON。 |

主键：`(book_id, id)`。

### `reading_guides`

阶段 5.5 已实现。替代 `book:{id}:questions:{itemKey}`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 id。 |
| `status` | `TEXT` | generated/failed 等。 |
| `provider` | `TEXT` | 生成供应商。 |
| `model` | `TEXT` | 生成模型。 |
| `generated_at` | `TEXT` | 生成时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整导读 JSON。 |

主键：`(book_id, item_key)`。

### `companion_events`

P7.5 已实现。前端兼容 key 为 `book:{bookId}:companion-events`，事件 schema 当前为 v1。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `id` | `TEXT NOT NULL` | 稳定事件 id；历史 payload 事件由原存储 id 确定性派生。 |
| `item_key` | `TEXT` | 阅读项 key；书级事件可以为空。 |
| `reading_item_id` | `TEXT` | 阅读项稳定 id。 |
| `scene` | `TEXT NOT NULL` | `guide` / `reading` / `reflection` / `book` / `system`。 |
| `type` | `TEXT NOT NULL` | 导读、提问、回答、笔记、策略变更、单次覆盖、介入状态或本节记录等事件类型。 |
| `status` | `TEXT NOT NULL` | `active` / `available` / `open` / `dismissed` / `completed` / `orphaned` / `deleted`。 |
| `source_kind` | `TEXT` | 来源类型，例如 PDF page、text page、selection。 |
| `source_page_number` | `INTEGER` | PDF 原书页码或文本页码的可查询投影。 |
| `content_fingerprint` | `TEXT` | 来源文本的短指纹；用于重定位和去重，不保存原文。 |
| `payload_store` | `TEXT` | 原内容所在存储，例如 guide/chat/reflection/notes。 |
| `payload_item_key` | `TEXT` | 原内容所属阅读项。 |
| `payload_source_id` | `TEXT` | 原内容 id。 |
| `created_at` | `TEXT NOT NULL` | 创建时间。 |
| `updated_at` | `TEXT NOT NULL` | 状态最后更新时间，也是合并冲突依据。 |
| `raw_json` | `TEXT NOT NULL` | 完整事件 JSON，包含 sourceAnchor、relatedEventIds 和轻量 metadata。 |

主键：`(book_id, id)`；`book_id -> books.id ON DELETE CASCADE`。

约束：

- `sourceAnchor` 可以保存 PDF 原书页码、文本页、字符范围、选区矩形和内容指纹，但禁止保存 `text` 或大段正文。
- 导读、聊天、读后交流和笔记仍由原结构化表保存正文；事件只保存 payload reference，读取旧记录时惰性生成并同步稳定事件。
- 删除记录使用 `status: deleted` tombstone。事件 merge 先比较 `updatedAt`，同时间优先保留 tombstone，防止旧备份复活已删除状态。
- `sync_companion_events` 在单个事务中校验并重建一本书的事件集；重复 id、错误 bookId 或非法事件会让整个写入回滚。
- P7.9.1 起，`session_record` 事件的 `metadata.record` 保存版本化本节索引：`schemaVersion`、`itemKey`、`understanding`、`openQuestions`、`sourceEventIds`、`memoryLink`、`createdAt` 和 `updatedAt`。当前完成页不直接编辑这些字段；问答、笔记和读后正文继续只从原 payload store 读取，不复制到事件。
- `memoryLink` 只记录用户明确确认后写入本书记忆的 item id、摘要文本和确认时间；保存本节记录不会自动创建记忆，修改记录也不会静默覆盖旧记忆。
- 用户撤销记忆时，从 `readingProfile.companionMemory.items` 移除对应来源项，同时将本节记录的 `memoryLink` 清空；本节理解、未解决问题和来源事件继续保留。
- 空记录、模型回答标题和历史兜底文案不会迁移为用户成果；旧有效 `metadata.takeaway` 仍可惰性读取。删除本节记录继续写 tombstone，不改变 schema 10 或目录备份 v3。
- P7.9.3 起，跨章节记忆清单仍从 `books.raw_json.readingProfile.companionMemory.items` 读取，并用 `sourceEventId -> companion_events.id` 回溯本节记录。旧数据仅在存在明确 `memoryLink.itemId` 或唯一来源对应时补齐 `sourceItemKey/sourceEventId`；不会按相似文本批量猜测来源。
- 在「整理这本书」修改章节记忆时同步更新对应 `session_record.metadata.record.memoryLink.text`；撤销时清空 `memoryLink`。两者均保留原本节记录和 payload source，继续使用现有事件 merge 与 tombstone 规则。

### `app_settings`

P6.2 已实现。替代 `kv_store.settings` 中的非敏感配置。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 当前固定为 `settings`。 |
| `provider` | `TEXT` | 当前供应商。 |
| `anthropic_model` | `TEXT` | Anthropic 模型名。 |
| `anthropic_has_api_key` | `INTEGER NOT NULL DEFAULT 0` | 本机是否记录过 Anthropic Key 的非敏感状态。 |
| `openai_base_url` | `TEXT` | OpenAI-compatible Base URL。 |
| `openai_model` | `TEXT` | OpenAI-compatible 模型名。 |
| `openai_input_price_per_mtok` | `TEXT` | 输入价格配置。 |
| `openai_output_price_per_mtok` | `TEXT` | 输出价格配置。 |
| `openai_has_api_key` | `INTEGER NOT NULL DEFAULT 0` | 本机是否记录过 OpenAI-compatible Key 的非敏感状态。 |
| `raw_json` | `TEXT NOT NULL` | 脱敏后的完整 settings JSON。 |
| `updated_at` | `TEXT NOT NULL` | 更新时间。 |

说明：

- API Key 只能进入系统 Keychain，不能进入 `app_settings.raw_json`。
- `hasApiKey` 只是 UI 状态标记，不是密钥，也不能通过它推导密钥内容；备份导出时必须移除。
- 如果旧数据已经有 Keychain 密钥但还没有 `hasApiKey` 标记，设置页只能显示状态未知，不能自动探测 Keychain。
- 进入设置页只读取 `app_settings`；设置页测试连接只使用当前输入的 API Key，不自动读取 Keychain。
- schema 初始化如果发现旧 `kv_store.settings` 中残留 API Key，只做脱敏并迁入 `app_settings`，不再自动迁移到 Keychain。
- 真正调用阅读页 AI 能力时，Tauri AI transport 才会在请求体缺少 API Key 的情况下从 Keychain 解析已保存密钥。
- AI transport 可以在当前 Tauri 进程内缓存一次已解析的 Keychain 密钥，减少连续模型请求造成的重复系统密码弹窗；缓存只在内存中，保存或删除 Keychain 密钥后必须清空。Keychain 读取与缓存写入需要处于同一锁内，避免并发请求同时读取 Keychain。
- 设置页 API Key 输入框留空保存不会删除既有 Keychain 密钥。
- P6.4.5 起，`raw_json.aiBudget` 保存非敏感预算配置，包括是否启用、单次输入/输出 token 上限、单次费用上限和每日费用上限。
- P6.4.6 起，`raw_json.aiProfiles` 保存非敏感任务模型 profile，包括任务开关、供应商、模型名、Base URL、价格、输出 token 上限和 temperature；不得保存 API Key。
- AI 预算日用量使用内部兼容 KV key `__duban:ai-budget:{YYYY-MM-DD}` 保存，只包含日期、任务类型、token 和估算费用；该前缀不进入备份。
- AI 调用诊断使用内部兼容 KV key `__duban:ai-diagnostics` 保存最近 20 条脱敏摘要，只包含任务、供应商、模型、Base URL origin、耗时、状态、错误码、HTTP 状态、尝试次数、token 和费用估算；该 key 不进入备份。

### `book_covers`

P6.2 已实现。替代 `book:{bookId}:cover`。封面图片文件写入 `files/covers/`，SQLite 保存索引。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT PRIMARY KEY` | 所属书籍。 |
| `media_type` | `TEXT NOT NULL` | 封面 MIME 类型。 |
| `byte_size` | `INTEGER NOT NULL` | 封面文件大小。 |
| `relative_path` | `TEXT NOT NULL` | 相对 `files/` 的路径。 |
| `source` | `TEXT` | 来源，例如 `generated`。 |
| `updated_at` | `TEXT NOT NULL` | 更新时间。 |

读取兼容：`duban_storage_get_item("book:{id}:cover")` 会从文件重组 data URL 返回给前端。

### `formatted_texts`

P6.2 已实现。替代 `book:{bookId}:formatted-text:{itemKey}`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | `TEXT NOT NULL` | 所属书籍。 |
| `item_key` | `TEXT NOT NULL` | 阅读项 key。 |
| `provider` | `TEXT` | 生成供应商。 |
| `model` | `TEXT` | 生成模型。 |
| `generated_at` | `TEXT` | 生成时间。 |
| `raw_json` | `TEXT NOT NULL` | 完整 AI 排版缓存 JSON。 |
| `updated_at` | `TEXT NOT NULL` | 更新时间。 |

主键：`(book_id, item_key)`。

## 本地文件清理

P6.2 新增孤儿文件扫描和清理命令：

- `duban_storage_scan_orphan_files`
- `duban_storage_delete_orphan_files`

扫描范围仅限 App 数据目录的 `files/`。引用来源包括 `file_store.relative_path`、`book_files.relative_path` 和 `book_covers.relative_path`；清理逻辑不会删除仍被 SQLite 引用的原始文件或封面文件。

## 书籍导入与删除约束

结构化 `book_files`、`book_pages`、`book_chapters`、阅读计划、进度、笔记、聊天和导读缓存都通过 `book_id -> books.id ON DELETE CASCADE` 关联到 `books`。

因此桌面端必须遵守以下顺序：

- 新书导入时，先写入 `books` 记录，再写入 `book:{id}:file` 和 `book:{id}:pages`。
- 如果文件或分页写入失败，需要回滚刚插入的 `books` 记录，避免书架留下半本书。
- 删除书籍时，不应只依赖前端逐个兼容 key 删除；桌面端优先调用语义化 command：
  - `duban_storage_delete_book(bookId)`

`duban_storage_delete_book` 的职责：

- 在删除数据库记录前收集原始文件和封面文件路径。
- 在事务内删除该书籍的兼容 `kv_store` / `file_store` 记录和 `books` 记录。
- 通过外键级联清理结构化 pages、计划、进度、笔记、聊天、读后交流、导读、封面和格式化正文缓存。
- 数据库删除成功后 best-effort 删除本地文件；文件删除失败不应阻断书籍从书架移除，残留文件可由孤儿文件扫描/清理命令处理。

该改动不提升 `schema_version`，因为表结构未变化，只是补充 Tauri command 和写入顺序约束。

## 备份格式

阶段 5.8 已实现基础备份；阶段 5.9 已升级为目录式备份；P6.1 将备份格式升到 v3，补上 manifest/file hash 和导入失败自动恢复点。

桌面备份目录：

- 文件位置：`~/Library/Application Support/com.duban.reader/backups/duban-backup-{timestamp}/`
- manifest：`manifest.json`
- 原始文件目录：`files/`
- `format`：`duban.local-backup`
- `backupVersion`：当前为 `3`
- `schemaVersion`：导出时的桌面 schema 版本
- `manifestSha256`：manifest 级 sha256；计算时会排除 `manifestSha256` 字段本身。
- `label` / `notes`：用户可在设置页维护的备份短名称和备注；修改后会重写 manifest 校验和。
- `includesApiKeys`：当前固定为 `false`
- `items`：按兼容 key 保存 JSON 数据，例如 `books`、`settings`、`book:{id}:pages`、`progress:{id}`、笔记、聊天、读后交流、章节导读、陪读事件、封面和 AI 排版缓存。
- 内部运行时 key 会跳过备份，例如 `__duban:migration:*` 和 `__duban:ai-budget:*`。
- `files`：按兼容 key 保存原始文件索引，使用 `relativePath` 指向 `files/` 下的真实文件；每个文件记录 `byteSize` 和 `sha256`；旧版 base64 JSON 备份仍可兼容导入。

导入边界：

- 导入支持 `merge` 和 `replace` 两种模式。
- `merge` 会保留当前书库中备份未涉及的数据；普通同 key 数据仍以备份为准，`companion-events` 则按事件 id、`updatedAt` 和 tombstone 逐条合并，避免重复或覆盖更新的本地状态。
- `replace` 会用备份覆盖当前书库、分页文本、进度、导读、笔记、聊天、读后交流和非敏感设置；导入前会创建隐藏恢复点，失败时自动恢复导入前状态。
- 导入不会从备份恢复 API Key，也不会删除当前系统 Keychain 中的读伴 API Key。
- 导入仍复用现有 `sync_books`、`sync_settings`、`sync_pages`、`sync_progress`、`sync_notes`、`sync_messages`、`sync_guide`、`sync_companion_events`、`sync_book_cover`、`sync_formatted_text` 和 `sync_file_key` 写入路径，避免绕开结构化表。
- 导入会在写入前校验备份格式、backupVersion、schemaVersion、重复 key、重复书籍 id、陪读事件 id/状态/来源隐私边界、manifest sha256、文件路径、防目录穿越、文件大小和文件 sha256。
- 设置页会读取 `backups/` 下的备份清单，展示导入前预览、校验报告、manifest hash、备份名称/备注、删除入口和外部目录/manifest 路径导入入口。

## 迁移顺序

1. 阶段 5.3：迁 `books` 和 `book_chapters`。已完成。
2. 阶段 5.4：迁 `reading_plans`、`reading_plan_items`、`reading_progress`、`reading_item_progress`。已完成。
3. 阶段 5.5：迁 `notes`、`chat_messages`、`reflection_messages`、`reading_guides`。已完成。
4. 阶段 5.6：迁 `book_files` 和 `book_pages`，并让桌面文件读取走本地文件引用。已完成。
5. 阶段 5.7：API Key 迁入系统 Keychain。已完成。
6. 阶段 5.8：备份导出/导入与 schema 迁移器。已完成。
7. 阶段 5.9：目录式备份、导入前预览、校验报告和合并导入。已完成。
8. P6.1：备份 v3、manifest/file sha256、导入失败自动恢复点、外部目录导入、备份名称/备注和删除入口。已完成。
9. P6.2：非敏感 settings、封面缓存、AI 排版缓存迁入结构化表；`book_files` 补充导入来源和最后校验时间；新增孤儿文件扫描/清理命令。已完成。
10. P7.5：新增 `companion_events`、旧记录惰性映射、来源锚点、策略/会话状态引用，以及事件备份预览、校验、合并和回滚夹具。已完成。
11. P7.9.1：在既有 `session_record` 事件中保存版本化本节记录和显式确认的记忆关联；不新增表或 schema 版本。已完成。
12. 后续：评估压缩归档、备份签名、更完整的历史整库迁移夹具，以及原生 UI 中的诊断/清理入口。
