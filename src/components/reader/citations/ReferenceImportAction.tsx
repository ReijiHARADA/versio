import { useMemo, useRef, useState } from "react";
import {
  parseBibliographicIdentifier,
  type BibliographicIdentifier,
} from "../../../services/bibliography/identifiers";
import { guessReferenceTitle, type ReferenceCandidate } from "../../../services/bibliography/referenceMatch";
import { findCitedWork } from "../../../services/bibliography/searchReference";
import { importFirstAvailable } from "../../../services/import/importByIdentifier";
import { findPaperByIdentifiers } from "../../../services/import/referenceIdentifier";
import { useLibraryCache } from "../../../stores/libraryCache";
import { showToast } from "../../../stores/toastStore";
import { InfoPopover } from "../InfoPopover";
import infoStyles from "../InfoPopover.module.css";
import styles from "./ReferenceImportAction.module.css";
import type { AnchorBox } from "../memo/popoverPosition";

const inFlight = new Set<string>();
const keyOf = (identifiers: BibliographicIdentifier[]) =>
  identifiers.map((item) => `${item.kind}:${item.id.toLowerCase()}`).join("|");

/** Download and import a cited work; errors surface as a toast. */
function importCitedWork(identifiers: BibliographicIdentifier[], onSettled?: () => void) {
  const key = keyOf(identifiers);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  showToast({ kind: "info", message: "引用文献の PDF を取得しています…" });
  importFirstAvailable(identifiers)
    .catch((cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      showToast({ kind: "error", message: `論文を追加できませんでした: ${message}` });
    })
    .finally(() => {
      inFlight.delete(key);
      onSettled?.();
    });
}

function openPaper(paperId: string) {
  // HashRouter: works from any render tree (also markup tests without a Router).
  window.location.hash = `#/reader/${paperId}`;
}

/**
 * 「ライブラリに追加」 for a cited reference with an arXiv id / DOI,
 * 「ライブラリで開く」 when the library already holds it, and
 * 「題名で探す…」 (search, then confirm) when the reference names neither.
 */
export function ReferenceImportAction({
  identifiers,
  rawText,
  className,
  inline = false,
  onDone,
}: {
  identifiers: BibliographicIdentifier[];
  /** The reference text, for the title search when there is no identifier. */
  rawText: string;
  className: string;
  /** Show the search result inside the surrounding popover instead of a new one. */
  inline?: boolean;
  onDone?: () => void;
}) {
  const papers = useLibraryCache((state) => state.papers);
  const existing = useMemo(() => findPaperByIdentifiers(papers, identifiers), [papers, identifiers]);
  const [busy, setBusy] = useState(() => inFlight.has(keyOf(identifiers)));

  const searchable = useMemo(() => identifiers.length === 0 && guessReferenceTitle(rawText) != null, [identifiers, rawText]);
  if (identifiers.length === 0) {
    if (!searchable) return null;
    return <ReferenceTitleSearch rawText={rawText} className={className} inline={inline} onDone={onDone} />;
  }
  if (existing) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onDone?.();
          openPaper(existing.id);
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
        setBusy(true);
        importCitedWork(identifiers, () => setBusy(false));
        onDone?.();
      }}
    >
      {busy ? "PDF を取得中…" : "ライブラリに追加"}
    </button>
  );
}

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; candidate: ReferenceCandidate }
  | { status: "none" };

// Per reference text, so reopening a popover does not search again.
const searchResults = new Map<string, ReferenceCandidate | null>();

function ReferenceTitleSearch({
  rawText,
  className,
  inline,
  onDone,
}: {
  rawText: string;
  className: string;
  inline: boolean;
  onDone?: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const [state, setState] = useState<SearchState>(() => {
    const cached = searchResults.get(rawText);
    if (cached === undefined) return { status: "idle" };
    return cached ? { status: "found", candidate: cached } : { status: "none" };
  });
  const papers = useLibraryCache((s) => s.papers);

  const showResult = () => {
    if (inline) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  };

  const search = () => {
    if (state.status === "found") {
      showResult();
      return;
    }
    setState({ status: "searching" });
    findCitedWork(rawText)
      .then((candidate) => {
        searchResults.set(rawText, candidate);
        setState(candidate ? { status: "found", candidate } : { status: "none" });
        if (candidate) showResult();
        else showToast({ kind: "info", message: "この参考文献に当たる論文が見つかりませんでした" });
      })
      .catch((cause) => {
        setState({ status: "idle" });
        const message = cause instanceof Error ? cause.message : String(cause);
        showToast({ kind: "error", message: `検索できませんでした: ${message}` });
      });
  };

  if (state.status === "found" && (inline || anchor)) {
    const confirm = (
      <CandidateConfirm
        candidate={state.candidate}
        papers={papers}
        inline={inline}
        onCancel={() => (inline ? setState({ status: "idle" }) : setAnchor(null))}
        onDone={() => {
          setAnchor(null);
          onDone?.();
        }}
      />
    );
    if (inline) return confirm;
    return (
      <>
        <button ref={buttonRef} type="button" className={className} onClick={search}>
          題名で探す…
        </button>
        <InfoPopover anchor={anchor!} title="この論文ですか？" onClose={() => setAnchor(null)}>
          {confirm}
        </InfoPopover>
      </>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      disabled={state.status === "searching" || state.status === "none"}
      aria-busy={state.status === "searching"}
      title="Crossref / OpenAlex でこの参考文献を探します"
      onClick={search}
    >
      {state.status === "searching" ? "探しています…" : state.status === "none" ? "見つかりませんでした" : "題名で探す…"}
    </button>
  );
}

function CandidateConfirm({
  candidate,
  papers,
  inline,
  onCancel,
  onDone,
}: {
  candidate: ReferenceCandidate;
  inline: boolean;
  papers: ReturnType<typeof useLibraryCache.getState>["papers"];
  onCancel: () => void;
  onDone: () => void;
}) {
  const identifier = parseBibliographicIdentifier(candidate.doi);
  const identifiers = identifier ? [identifier] : [];
  const existing = findPaperByIdentifiers(papers, identifiers);
  const authors =
    candidate.authors.length > 3 ? `${candidate.authors.slice(0, 3).join(", ")} ほか` : candidate.authors.join(", ");
  const meta = [authors, candidate.year, candidate.venue].filter(Boolean).join(" · ");
  return (
    <div data-testid="reference-candidate" className={styles.candidate}>
      {inline ? <p className={styles.candidateLabel}>見つかった論文:</p> : null}
      <p className={infoStyles.term}>{candidate.title}</p>
      {meta ? <p className={infoStyles.meta}>{meta}</p> : null}
      <p className={infoStyles.meta}>{identifier?.kind === "arxiv" ? `arXiv:${identifier.id}` : `DOI ${candidate.doi}`}</p>
      <div className={inline ? styles.candidateActions : infoStyles.footer}>
        {existing ? (
          <button
            type="button"
            className={infoStyles.action}
            onClick={() => {
              onDone();
              openPaper(existing.id);
            }}
          >
            ライブラリで開く
          </button>
        ) : (
          <button
            type="button"
            className={infoStyles.action}
            disabled={identifiers.length === 0}
            onClick={() => {
              importCitedWork(identifiers);
              onDone();
            }}
          >
            ライブラリに追加
          </button>
        )}
        <button type="button" className={infoStyles.action} onClick={onCancel}>
          違う論文
        </button>
      </div>
    </div>
  );
}
