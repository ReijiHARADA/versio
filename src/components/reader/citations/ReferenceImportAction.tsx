import { useMemo, useState } from "react";
import type { BibliographicIdentifier } from "../../../services/bibliography/identifiers";
import { importFirstAvailable } from "../../../services/import/importByIdentifier";
import { findPaperByIdentifiers } from "../../../services/import/referenceIdentifier";
import { useLibraryCache } from "../../../stores/libraryCache";
import { showToast } from "../../../stores/toastStore";

const inFlight = new Set<string>();
const keyOf = (identifiers: BibliographicIdentifier[]) =>
  identifiers.map((item) => `${item.kind}:${item.id.toLowerCase()}`).join("|");

/**
 * 「ライブラリに追加」 for a cited reference with an arXiv id / DOI, or
 * 「ライブラリで開く」 when the library already holds it.
 */
export function ReferenceImportAction({
  identifiers,
  className,
  onDone,
}: {
  identifiers: BibliographicIdentifier[];
  className: string;
  onDone?: () => void;
}) {
  const papers = useLibraryCache((state) => state.papers);
  const existing = useMemo(() => findPaperByIdentifiers(papers, identifiers), [papers, identifiers]);
  const key = keyOf(identifiers);
  const [busy, setBusy] = useState(() => inFlight.has(key));

  if (identifiers.length === 0) return null;
  if (existing) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onDone?.();
          // HashRouter: works from any render tree (also markup tests without a Router).
          window.location.hash = `#/reader/${existing.id}`;
        }}
      >
        ライブラリで開く
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (inFlight.has(key)) return;
        inFlight.add(key);
        setBusy(true);
        showToast({ kind: "info", message: "引用文献の PDF を取得しています…" });
        importFirstAvailable(identifiers)
          .catch((cause) => {
            const message = cause instanceof Error ? cause.message : String(cause);
            showToast({ kind: "error", message: `論文を追加できませんでした: ${message}` });
          })
          .finally(() => {
            inFlight.delete(key);
            setBusy(false);
          });
        onDone?.();
      }}
    >
      {busy ? "PDF を取得中…" : "ライブラリに追加"}
    </button>
  );
}
