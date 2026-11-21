import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Paper } from "../../types/paper";
import { InfoPopover } from "../reader/InfoPopover";
import type { AnchorBox } from "../reader/memo/popoverPosition";
import { useLibraryCache } from "../../stores/libraryCache";
import { applyPaperTags } from "../../services/paperLibraryState";
import { isImeComposing } from "../../utils/ime";
import styles from "./PaperTagsPopover.module.css";

const NO_TAGS: string[] = [];

type Props = { paper: Paper; anchor: AnchorBox; onClose: () => void };

/** Local tag edit (Popover per UI principles); every change saves immediately. */
export function PaperTagsPopover({ paper, anchor, onClose }: Props) {
  const tags = useLibraryCache((state) => state.papers.find((p) => p.id === paper.id)?.tags) ?? NO_TAGS;
  const papers = useLibraryCache((state) => state.papers);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // InfoPopover focuses its panel in a layout effect; take focus back for typing.
  useEffect(() => inputRef.current?.focus(), []);
  const suggestions = useMemo(() => {
    const own = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
    const query = draft.trim().toLocaleLowerCase();
    return [...new Set(papers.flatMap((p) => p.tags ?? []))]
      .filter((tag) => !own.has(tag.toLocaleLowerCase()) && tag.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b, "ja"))
      .slice(0, 8);
  }, [papers, tags, draft]);

  const save = (next: string[]) => void applyPaperTags(paper.id, next);
  const add = (value: string) => {
    const parts = value.split(/[,、]/);
    if (parts.some((part) => part.trim())) save([...tags, ...parts]);
    setDraft("");
  };

  return (
    <InfoPopover anchor={anchor} title="タグ" onClose={onClose}>
      <div className={styles.chips}>
        {tags.length === 0 ? <span className={styles.empty}>タグはありません</span> : null}
        {tags.map((tag) => (
          <span key={tag} className={styles.chip}>
            {tag}
            <button
              type="button"
              className={styles.remove}
              aria-label={`タグ「${tag}」を外す`}
              onClick={() => save(tags.filter((t) => t !== tag))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        className={styles.input}
        value={draft}
        placeholder="タグを追加（Enter）"
        aria-label="タグを追加"
        ref={inputRef}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (isImeComposing(event)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && !draft && tags.length) {
            save(tags.slice(0, -1));
          }
        }}
      />
      {suggestions.length > 0 ? (
        <div className={styles.chips}>
          {suggestions.map((tag) => (
            <button key={tag} type="button" className={styles.suggestion} onClick={() => add(tag)}>
              + {tag}
            </button>
          ))}
        </div>
      ) : null}
    </InfoPopover>
  );
}
