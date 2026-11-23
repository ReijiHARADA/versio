import { useState } from "react";
import type { GlossaryEntry } from "../../services/llm/types";
import styles from "./GlossaryPanel.module.css";

type GlossaryPanelProps = {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
};

export function GlossaryPanel({ entries, onChange }: GlossaryPanelProps) {
  const [draftTerm, setDraftTerm] = useState("");
  const [draftTranslation, setDraftTranslation] = useState("");

  const updateEntry = (index: number, patch: Partial<GlossaryEntry>) => {
    onChange(
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    const term = draftTerm.trim();
    const translation = draftTranslation.trim();
    if (!term || !translation) return;
    onChange([...entries, { term, translation }]);
    setDraftTerm("");
    setDraftTranslation("");
  };

  return (
    <>
      <p className={styles.help}>
        採用した訳は翻訳後の置換と再翻訳に使います。用語と訳を直接直せます。
      </p>
      {entries.length === 0 ? (
        <p className={styles.empty}>まだ用語がありません。下から追加できます。</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry, index) => (
            <li key={`${entry.term}-${index}`} className={styles.item}>
              <span className={styles.field}>
                <input
                  className={styles.term}
                  value={entry.term}
                  onChange={(e) => updateEntry(index, { term: e.target.value })}
                  aria-label="英語の用語"
                />
              </span>
              <span className={styles.field}>
                <input
                  className={styles.translation}
                  value={entry.translation}
                  onChange={(e) => updateEntry(index, { translation: e.target.value })}
                  aria-label="日本語訳"
                />
              </span>
              <button type="button" className={styles.remove} onClick={() => removeEntry(index)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.add}>
        <span className={styles.field}>
          <input
            placeholder="英語の用語"
            value={draftTerm}
            onChange={(e) => setDraftTerm(e.target.value)}
          />
        </span>
        <span className={styles.field}>
          <input
            placeholder="日本語訳"
            value={draftTranslation}
            onChange={(e) => setDraftTranslation(e.target.value)}
          />
        </span>
        <button type="button" className={styles.addButton} onClick={addEntry}>
          追加
        </button>
      </div>
    </>
  );
}
