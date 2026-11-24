import { useEffect, useRef, useState } from "react";
import {
  getGlobalGlossary,
  saveGlobalGlossary,
} from "../../services/glossary/global";
import type { GlossaryEntry } from "../../services/llm/types";
import { SettingsCard } from "./SettingsPrimitives";
import styles from "./SettingsScreen.module.css";
import local from "./GlobalGlossaryCard.module.css";

type Draft = GlossaryEntry & { key: number };

let nextKey = 0;
const toDraft = (entry: GlossaryEntry): Draft => ({ ...entry, key: nextKey++ });

/** Settings → 翻訳: terms applied to every paper's translation (a paper's own entry wins). */
export function GlobalGlossaryCard() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    void getGlobalGlossary().then((entries) => {
      setDrafts(entries.map(toDraft));
      setLoaded(true);
    });
  }, []);

  const persist = (next: Draft[]) => {
    void saveGlobalGlossary(next.map(({ key: _key, ...entry }) => entry));
  };

  const update = (key: number, patch: Partial<GlossaryEntry>) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const remove = (key: number) => {
    const next = draftsRef.current.filter((draft) => draft.key !== key);
    setDrafts(next);
    persist(next);
  };

  const add = () => {
    setDrafts((current) => [
      ...current,
      toDraft({ term: "", translation: "" }),
    ]);
  };

  return (
    <SettingsCard title="共通の用語集">
      <div className={local.body}>
        <p className={styles.hint}>
          すべての論文の翻訳で、英語の用語をここで決めた訳語にそろえます。論文ごとの用語集に同じ用語があれば、そちらが優先されます。これから翻訳する文章に効きます。
        </p>
        {drafts.length > 0 ? (
          <ul className={local.list} aria-label="共通の用語集">
            <li className={local.columns} aria-hidden="true">
              <span>英語の用語</span>
              <span>訳語</span>
              <span />
            </li>
            {drafts.map((draft) => (
              <li key={draft.key} className={local.entry}>
                <span className={styles.inputField}>
                  <input
                    className={local.input}
                    aria-label="英語の用語"
                    placeholder="例: cognitive load"
                    value={draft.term}
                    onChange={(event) =>
                      update(draft.key, { term: event.target.value })
                    }
                    onBlur={() => persist(draftsRef.current)}
                  />
                </span>
                <span className={styles.inputField}>
                  <input
                    className={local.input}
                    aria-label="訳語"
                    placeholder="例: 認知負荷"
                    value={draft.translation}
                    onChange={(event) =>
                      update(draft.key, { translation: event.target.value })
                    }
                    onBlur={() => persist(draftsRef.current)}
                  />
                </span>
                <button
                  type="button"
                  className={styles.ghostButton}
                  aria-label={`${draft.term || "この行"}を削除`}
                  onClick={() => remove(draft.key)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.button}
            disabled={!loaded}
            onClick={add}
          >
            用語を追加
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
