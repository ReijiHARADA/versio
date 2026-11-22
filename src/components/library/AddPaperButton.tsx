import { useEffect, useRef, useState } from "react";
import { FileUp, Plus } from "lucide-react";
import { InfoPopover } from "../reader/InfoPopover";
import type { AnchorBox } from "../reader/memo/popoverPosition";
import { importByIdentifier } from "../../services/import/importByIdentifier";
import { isImeComposing } from "../../utils/ime";
import styles from "./AddPaperButton.module.css";

/** 「論文を追加」: a popover offering a PDF file pick or an arXiv id / DOI fetch. */
export function AddPaperButton({
  className,
  onPickFile,
  workspaceNodeId,
}: {
  className: string;
  onPickFile: () => void;
  workspaceNodeId?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // InfoPopover focuses its panel in a layout effect; move focus to the field after it.
  useEffect(() => {
    if (!anchor) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  const submit = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await importByIdentifier(value, { workspaceNodeId });
      setValue("");
      setAnchor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        title="論文を追加"
        aria-haspopup="dialog"
        aria-expanded={anchor != null}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setError(null);
          setAnchor(anchor ? null : { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }}
      >
        <Plus size={18} aria-hidden="true" />
        論文を追加
      </button>
      {anchor && (
        <InfoPopover anchor={anchor} title="論文を追加" onClose={() => setAnchor(null)}>
          <button
            type="button"
            className={styles.pickFile}
            aria-label="PDF ファイルを選択"
            onClick={() => {
              setAnchor(null);
              onPickFile();
            }}
          >
            <FileUp size={16} aria-hidden="true" />
            PDF ファイルを選択…
            <kbd className={styles.shortcut}>⌘O</kbd>
          </button>
          <p className={styles.sectionLabel}>arXiv・DOI から追加</p>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              className={styles.input}
              value={value}
              ref={inputRef}
              placeholder="arXiv:2101.01234 / 10.1371/… / URL"
              aria-label="arXiv ID または DOI"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isImeComposing(event)) event.preventDefault();
              }}
            />
            <button type="submit" className={styles.submit} disabled={busy || !value.trim()}>
              {busy ? "取得中..." : "追加"}
            </button>
          </form>
          <p className={styles.hint}>
            オープンアクセスの PDF を arXiv / OpenAlex 経由で取得します。出版社のサイトにしか無い論文は取得できません。
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </InfoPopover>
      )}
    </>
  );
}
