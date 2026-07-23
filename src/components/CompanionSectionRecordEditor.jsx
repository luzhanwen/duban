import { useEffect, useMemo, useState } from "react";
import ChineseIcon from "./ChineseIcon.jsx";
import { updateBookCompanionSettings } from "../lib/books.js";
import { getCompanionSettings } from "../lib/companionPolicy.js";
import {
  getCompanionSessionRecord,
  recordCompanionPolicyChange,
  saveCompanionSessionRecord,
} from "../lib/companionEventStore.js";
import {
  hasMeaningfulCompanionSectionRecord,
  withoutConfirmedCompanionSectionMemory,
} from "../lib/companionSectionRecord.js";
import {
  buildCompanionSessionEvidence,
  buildCompanionSessionRecord,
} from "../lib/companionTimeline.js";

export default function CompanionSectionRecordEditor({
  book,
  itemKey,
  journey,
  onBookUpdated,
}) {
  const summary = useMemo(
    () => buildCompanionSessionRecord(journey, { itemKey }),
    [itemKey, journey]
  );
  const evidence = useMemo(
    () => buildCompanionSessionEvidence(journey, { itemKey }),
    [itemKey, journey]
  );
  const eventIds = useMemo(
    () =>
      (Array.isArray(journey) ? journey : [])
        .filter((entry) => entry?.itemKey === itemKey && entry?.id)
        .map((entry) => entry.id.replace(/^journey:/, "event:")),
    [itemKey, journey]
  );
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeEvidence, setActiveEvidence] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotice("");
    setError("");
    getCompanionSessionRecord(book?.id, itemKey)
      .then((saved) => {
        if (active) setRecord(saved);
      })
      .catch((reason) => {
        if (!active) return;
        setRecord(null);
        setError(reason?.message || "读取本节记录失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [book?.id, itemKey]);

  const companionSettings = useMemo(
    () => getCompanionSettings(book?.readingProfile),
    [book?.readingProfile]
  );
  const linkedMemoryItem = useMemo(() => {
    const linkedId = record?.memoryLink?.itemId;
    return (
      companionSettings.memory.items.find((item) => item.id === linkedId) ||
      companionSettings.memory.items.find(
        (item) => item.source === "session_record" && item.sourceItemKey === itemKey
      ) ||
      null
    );
  }, [companionSettings.memory.items, itemKey, record?.memoryLink?.itemId]);

  const evidenceOptions = [
    {
      id: "questions",
      label: "回答",
      count: summary.counts.answers,
      title: "阅读中的问答",
      empty: "本节还没有问答。",
    },
    {
      id: "notes",
      label: "笔记",
      count: summary.counts.notes,
      title: "本节笔记",
      empty: "本节还没有笔记。",
    },
    {
      id: "reflections",
      label: "读后",
      count: summary.counts.reflections,
      title: "读后交流",
      empty: "本节还没有读后交流。",
    },
  ];
  const defaultEvidence = evidenceOptions.find((option) => option.count > 0)?.id || "";

  useEffect(() => {
    setActiveEvidence((current) => {
      const currentAvailable = evidenceOptions.some(
        (option) => option.id === current && option.count > 0
      );
      return currentAvailable ? current : defaultEvidence;
    });
  }, [defaultEvidence, itemKey]);

  const activeEvidenceOption = evidenceOptions.find((option) => option.id === activeEvidence);
  const activeEvidenceCards = activeEvidenceOption ? evidence[activeEvidenceOption.id] : [];

  async function handleForgetMemory() {
    if (!linkedMemoryItem || saving) return;
    setSaving(true);
    setError("");
    try {
      const settings = getCompanionSettings(book.readingProfile);
      const nextItems = settings.memory.items.filter((item) => item.id !== linkedMemoryItem.id);
      const updatedBook = await updateBookCompanionSettings(book.id, {
        policy: settings.policy,
        memory: {
          ...settings.memory,
          initialized: true,
          items: nextItems,
        },
      });
      if (!updatedBook) throw new Error("撤销本书记忆失败。");
      onBookUpdated?.(updatedBook);
      await recordCompanionPolicyChange({
        bookId: book.id,
        itemKey: null,
        policy: settings.policy,
        memory: getCompanionSettings(updatedBook.readingProfile).memory,
        identity: `snapshot:${updatedBook.readingProfile?.updatedAt || updatedBook.updatedAt}`,
        timestamp: updatedBook.readingProfile?.updatedAt || updatedBook.updatedAt,
        source: "session_record_revocation",
      });

      if (record && hasMeaningfulCompanionSectionRecord(record)) {
        const unlinked = withoutConfirmedCompanionSectionMemory(record);
        const saved = await saveCompanionSessionRecord({
          bookId: book.id,
          itemKey,
          record: unlinked,
          summary,
          eventIds,
        });
        setRecord(saved);
      }
      setNotice("已撤销这条读伴记忆，本节内容仍然保留。");
    } catch (reason) {
      setError(reason?.message || "撤销本书记忆失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="companion-section-record" data-companion-shared="record">
      <header className="companion-section-record-header">
        <div>
          <p>本节记录</p>
          <h2>本节留下了什么</h2>
        </div>
        <div className="companion-section-record-stats" aria-label="本节陪读记录">
          {evidenceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={activeEvidence === option.id ? "is-active" : ""}
              disabled={option.count === 0}
              aria-expanded={activeEvidence === option.id}
              aria-controls="companion-section-evidence"
              onClick={() =>
                setActiveEvidence((current) => (current === option.id ? "" : option.id))
              }
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </button>
          ))}
        </div>
      </header>

      {activeEvidenceOption && (
        <section
          id="companion-section-evidence"
          className="companion-section-record-evidence"
          aria-label={activeEvidenceOption.title}
        >
          <h3>{activeEvidenceOption.title}</h3>
          {activeEvidenceCards.length > 0 ? (
            <ol>
              {activeEvidenceCards.map((card) => (
                <li key={card.id} className={`is-${card.role || "record"}`}>
                  <span>{card.label}</span>
                  <p>{card.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>{activeEvidenceOption.empty}</p>
          )}
        </section>
      )}

      {loading && <p className="companion-section-record-status">正在读取本节记录…</p>}

      {!loading && linkedMemoryItem && (
        <div className="companion-section-memory-confirmation is-compact">
          <div>
            <p>本节关联记忆</p>
            <strong>{linkedMemoryItem.text}</strong>
          </div>
          <button type="button" className="is-quiet" disabled={saving} onClick={handleForgetMemory}>
            <ChineseIcon name="clear" className="h-4 w-4" decorative />
            {saving ? "正在撤销" : "撤销记忆"}
          </button>
        </div>
      )}

      {notice && <p className="companion-section-record-status is-success">{notice}</p>}
      {error && <p className="companion-section-record-status is-error">{error}</p>}
    </section>
  );
}
