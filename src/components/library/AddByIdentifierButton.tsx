import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { InfoPopover } from "../reader/InfoPopover";
import type { AnchorBox } from "../reader/memo/popoverPosition";
import { importByIdentifier } from "../../services/import/importByIdentifier";
import { isImeComposing } from "../../utils/ime";
import styles from "./AddByIdentifierButton.module.css";

/** Secondary to 「論文を追加」: paste an arXiv id / DOI to fetch its open-access PDF. */
export function AddByIdentifierButton({ workspaceNodeId }: { workspaceNodeId?: string }) {
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
        className={styles.trigger}
        title="arXiv・DOI から追加"
        aria-label="arXiv・DOI から追加"
        aria-expanded={anchor != null}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setError(null);
          setAnchor(anchor ? null : { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }}
      >
        <Link2 size={16} aria-hidden="true" />
      </button>
      {anchor && (
        <InfoPopover anchor={anchor} title="arXiv・DOI から追加" onClose={() => setAnchor(null)}>
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
