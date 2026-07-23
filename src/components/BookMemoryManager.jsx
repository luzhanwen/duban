import { useEffect, useMemo, useState } from "react";
import ChineseIcon from "./ChineseIcon.jsx";
import { updateBookCompanionSettings } from "../lib/books.js";
import {
  recordCompanionPolicyChange,
  syncCompanionMemoryRecordLink,
} from "../lib/companionEventStore.js";
import { buildCompanionMemoryLedger } from "../lib/companionMemoryLedger.js";
import { getCompanionSettings } from "../lib/companionPolicy.js";

export default function BookMemoryManager({
  book,
  events,
  onBookUpdated,
  onEventsUpdated,
}) {
  const settings = useMemo(() => getCompanionSettings(book?.readingProfile), [book?.readingProfile]);
  const memories = useMemo(
    () => buildCompanionMemoryLedger({ book, memory: settings.memory, events }),
    [book, events, settings.memory]
  );
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = memories.find((item) => item.id === selectedId) || memories[0] || null;

  useEffect(() => {
    setSelectedId((current) =>
      memories.some((item) => item.id === current) ? current : memories[0]?.id || ""
    );
  }, [memories]);

  useEffect(() => {
    setDraft(selected?.text || "");
    setConfirmDelete(false);
  }, [selected?.id, selected?.text]);

  async function persistMemoryItems(items, source) {
    const updatedBook = await updateBookCompanionSettings(book.id, {
      policy: settings.policy,
      memory: {
        ...settings.memory,
        initialized: true,
        items,
      },
    });
    if (!updatedBook) throw new Error("保存本书记忆失败。");
    onBookUpdated?.(updatedBook);
    const nextSettings = getCompanionSettings(updatedBook.readingProfile);
    const updatedEvents = await recordCompanionPolicyChange({
      bookId: book.id,
      itemKey: null,
      policy: nextSettings.policy,
      memory: nextSettings.memory,
      identity: `snapshot:${updatedBook.readingProfile?.updatedAt || updatedBook.updatedAt}`,
      timestamp: updatedBook.readingProfile?.updatedAt || updatedBook.updatedAt,
      source,
    });
    onEventsUpdated?.(updatedEvents);
    return updatedBook;
  }

  async function handleSave(event) {
    event.preventDefault();
    const text = draft.trim().replace(/\s+/g, " ").slice(0, 240);
    if (!selected || !text || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const now = new Date().toISOString();
      const nextItems = settings.memory.items.map((item) =>
        item.id === selected.id ? { ...item, text, updatedAt: now } : item
      );
      await persistMemoryItems(nextItems, "book_salon_edit");
      const updatedEvents = await syncCompanionMemoryRecordLink({
        bookId: book.id,
        itemId: selected.id,
        text,
      });
      onEventsUpdated?.(updatedEvents);
      setNotice("记忆已更新，来源关联保持不变。");
    } catch (reason) {
      setError(reason?.message || "保存本书记忆失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected || saving) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setNotice("再次点击确认撤销这条记忆。本节记录不会被删除。");
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const nextItems = settings.memory.items.filter((item) => item.id !== selected.id);
      await persistMemoryItems(nextItems, "book_salon_revocation");
      const updatedEvents = await syncCompanionMemoryRecordLink({
        bookId: book.id,
        itemId: selected.id,
      });
      onEventsUpdated?.(updatedEvents);
      setSelectedId(nextItems[0]?.id || "");
      setNotice("已撤销这条记忆，本节记录仍然保留。");
      setConfirmDelete(false);
    } catch (reason) {
      setError(reason?.message || "撤销本书记忆失败。");
    } finally {
      setSaving(false);
    }
  }

  if (memories.length === 0) {
    return (
      <div className="book-salon-memory-empty">
        <ChineseIcon name="archive" className="h-6 w-6" decorative />
        <strong>还没有保存本书记忆</strong>
        <p>阅读中明确保留的理解，会按来源章节出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="book-salon-memory-workspace">
      <div className="book-salon-memory-list" aria-label="本书记忆列表">
        <div className="book-salon-note-list-head">
          <span>按阅读顺序</span>
          <em>{memories.length} 条</em>
        </div>
        <div className="book-salon-memory-list-scroll">
          {memories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={selected?.id === item.id ? "is-selected" : ""}
              onClick={() => {
                setSelectedId(item.id);
                setNotice("");
                setError("");
              }}
            >
              <span>{item.sourceLabel}</span>
              <strong>{item.text}</strong>
              <em>{item.sourceTitle}</em>
            </button>
          ))}
        </div>
      </div>

      <form className="book-salon-memory-editor" onSubmit={handleSave}>
        <div className="book-salon-memory-source">
          <span>{selected.sourceLabel}</span>
          <strong>{selected.sourceTitle}</strong>
          <p>{selected.sourceDetail}</p>
        </div>
        <label>
          <span>读伴记住的内容</span>
          <textarea
            value={draft}
            maxLength={240}
            rows={7}
            onChange={(event) => setDraft(event.target.value)}
          />
          <small>{draft.trim().length}/240</small>
        </label>
        {(notice || error) && (
          <p className={error ? "book-salon-memory-message is-error" : "book-salon-memory-message"}>
            {error || notice}
          </p>
        )}
        <div className="book-salon-editor-actions">
          {confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>
              取消
            </button>
          )}
          <button type="button" className="is-danger" onClick={handleDelete} disabled={saving}>
            <ChineseIcon name="clear" className="h-4 w-4" decorative />
            {confirmDelete ? "确认撤销" : "撤销记忆"}
          </button>
          <button type="submit" className="is-primary" disabled={saving || !draft.trim()}>
            {saving ? "正在保存" : "保存修改"}
          </button>
        </div>
      </form>
    </div>
  );
}
