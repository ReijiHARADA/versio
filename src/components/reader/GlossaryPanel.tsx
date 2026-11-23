import { useState, type FormEvent } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import type { GlossaryEntry } from "../../services/llm/types";
import styles from "./GlossaryPanel.module.css";

type GlossaryPanelProps = {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
};

export function GlossaryPanel({ entries, onChange }: GlossaryPanelProps) {
  const [draftTerm, setDraftTerm] = useState("");
  const [draftTranslation, setDraftTranslation] = useState("");
  const canAdd = draftTerm.trim() !== "" && draftTranslation.trim() !== "";

  const updateEntry = (index: number, patch: Partial<GlossaryEntry>) => {
    onChange(
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const addEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    onChange([...entries, { term: draftTerm.trim(), translation: draftTranslation.trim() }]);
    setDraftTerm("");
    setDraftTranslation("");
  };

  return (
    <>
      <p className={styles.help}>
        登録した訳語は、この論文の訳文に反映されます。
      </p>
      <div className={styles.card}>
        {entries.length > 0 && (
          <div className={styles.header} aria-hidden="true">
            <span>原語</span>
            <span />
            <span>訳語</span>
            <span />
          </div>
        )}
        <ul className={styles.list}>
          {entries.map((entry, index) => (
            <li key={index} className={styles.row}>
              <input
                className={styles.input}
                value={entry.term}
                onChange={(e) => updateEntry(index, { term: e.target.value })}
                aria-label="英語の用語"
              />
              <ArrowRight className={styles.arrow} size={13} aria-hidden="true" />
              <input
                className={styles.input}
                value={entry.translation}
                onChange={(e) => updateEntry(index, { translation: e.target.value })}
                aria-label="日本語訳"
              />
              <button
                type="button"
                className={styles.remove}
                onClick={() => removeEntry(index)}
                aria-label={`「${entry.term}」を削除`}
                title="削除"
              >
                <X size={12} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
        <form className={`${styles.row} ${styles.draft}`} onSubmit={addEntry}>
          <input
            className={styles.input}
            placeholder="英語の用語"
            value={draftTerm}
            onChange={(e) => setDraftTerm(e.target.value)}
          />
          <ArrowRight className={styles.arrow} size={13} aria-hidden="true" />
          <input
            className={styles.input}
            placeholder="日本語訳"
            value={draftTranslation}
            onChange={(e) => setDraftTranslation(e.target.value)}
          />
          <button
            type="submit"
            className={styles.addButton}
            disabled={!canAdd}
            aria-label="追加"
            title="追加（Enter）"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </>
  );
}
