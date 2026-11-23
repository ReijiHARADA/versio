import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Paper } from "../../types/paper";
import { getPaperWithPackageMetadata, updatePaperMetadata } from "../../services/database";
import { parseBibliographicIdentifier } from "../../services/bibliography/identifiers";
import { fetchBibliographicRecord } from "../../services/bibliography/fetchRecord";
import { useLibraryCache } from "../../stores/libraryCache";
import { showToast } from "../../stores/toastStore";
import styles from "./PaperMetadataSheet.module.css";
import { useMotionState } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

type Form = {
  title: string;
  authors: string;
  publication: string;
  year: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
};

function toForm(paper: Paper): Form {
  const bib = paper.bibliography ?? {};
  return {
    title: paper.titleOriginal ?? "",
    authors: paper.authors.join("\n"),
    publication: paper.publication ?? "",
    year: paper.year ? String(paper.year) : "",
    volume: bib.volume ?? "",
    issue: bib.issue ?? "",
    pages: bib.pages ?? "",
    doi: paper.doi ?? "",
    url: bib.url ?? "",
  };
}

const nullable = (value: string) => value.trim() || null;
const optional = (value: string) => value.trim() || undefined;

type Props = { paper: Paper; onClose: () => void };

/** Sheet for citation metadata: fetch by DOI / arXiv on demand, review, then save. */
export function PaperMetadataSheet({ paper, onClose }: Props) {
  const motionState = useMotionState();
  const titleId = useId();
  const [full, setFull] = useState<Paper | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lookup, setLookup] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPaperWithPackageMetadata(paper.id).then((loaded) => {
      if (!alive) return;
      const source = loaded ?? paper;
      setFull(source);
      setForm(toForm(source));
      setLookup(source.bibliography?.arxivId ? `arXiv:${source.bibliography.arxivId}` : source.doi ?? "");
    });
    return () => {
      alive = false;
    };
  }, [paper]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const fetchRecord = async () => {
    const identifier = parseBibliographicIdentifier(lookup);
    if (!identifier) {
      setError("DOI か arXiv ID（または doi.org / arxiv.org の URL）を入力してください");
      return;
    }
    setError(null);
    setFetching(true);
    try {
      const record = await fetchBibliographicRecord(identifier);
      setForm((current) =>
        current
          ? {
              ...current,
              title: record.title ?? current.title,
              authors: record.authors?.join("\n") ?? current.authors,
              publication: record.publication ?? current.publication,
              year: record.year ? String(record.year) : current.year,
              volume: record.bibliography.volume ?? current.volume,
              issue: record.bibliography.issue ?? current.issue,
              pages: record.bibliography.pages ?? current.pages,
              doi: record.doi ?? current.doi,
              url: record.bibliography.url ?? current.url,
            }
          : current
      );
      setFull((current) =>
        current
          ? {
              ...current,
              bibliography: {
                ...current.bibliography,
                entryType: record.bibliography.entryType,
                publisher: record.bibliography.publisher,
                arxivId: record.bibliography.arxivId,
              },
            }
          : current
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!form || !full) return;
    const year = form.year.trim() ? Number(form.year.trim()) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 9999)) {
      setError("発行年は 4 桁の数字で入力してください");
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePaperMetadata(paper.id, {
        titleOriginal: nullable(form.title),
        authors: form.authors.split("\n"),
        publication: nullable(form.publication),
        year,
        doi: nullable(form.doi),
        bibliography: Object.fromEntries(
          Object.entries({
            ...full.bibliography,
            volume: optional(form.volume),
            issue: optional(form.issue),
            pages: optional(form.pages),
            url: optional(form.url),
          }).filter(([, value]) => value !== undefined)
        ),
      });
      if (updated) useLibraryCache.getState().updatePaper(paper.id, updated);
      showToast({ kind: "success", message: "書誌情報を保存しました" });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof Form, extra?: { wide?: boolean }) =>
    form ? (
      <Label text={label} style={extra?.wide ? { gridColumn: "1 / -1" } : undefined}>
        <input className={styles.input} value={form[key]} onChange={(e) => set(key)(e.target.value)} />
      </Label>
    ) : null;

  return createPortal(
    <div
      className={`${styles.overlay} ${motion.overlay}`} data-motion={motionState}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // React events bubble through the portal to the paper card (open / drag); stop them here.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section className={`${styles.sheet} ${motion.sheet}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            書誌情報
          </h2>
          <button type="button" className={styles.closeButton} aria-label="閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.lookupRow}>
            <Label text="DOI / arXiv ID">
              <input
                className={styles.input}
                value={lookup}
                placeholder="10.1145/… または arXiv:2101.01234"
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void fetchRecord();
                }}
              />
            </Label>
            <button type="button" className={styles.button} disabled={fetching || !form} onClick={() => void fetchRecord()}>
              {fetching ? "取得中..." : "取得"}
            </button>
          </div>
          <p className={styles.hint}>
            「取得」を押したときだけ Crossref / arXiv に問い合わせます。内容を確認してから保存してください。
          </p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {form ? (
            <div className={styles.grid}>
              {field("タイトル（原題）", "title", { wide: true })}
              <Label text="著者（1 行に 1 人）" style={{ gridColumn: "1 / -1" }}>
                <textarea className={styles.textarea} value={form.authors} onChange={(e) => set("authors")(e.target.value)} />
              </Label>
              {field("掲載誌・会議", "publication", { wide: true })}
              {field("発行年", "year")}
              {field("巻", "volume")}
              {field("号", "issue")}
              {field("ページ", "pages")}
              <span style={{ gridColumn: "span 2" }}>{field("DOI", "doi")}</span>
              {field("URL", "url", { wide: true })}
            </div>
          ) : (
            <p className={styles.hint}>読み込み中...</p>
          )}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className={styles.primaryButton} disabled={saving || !form} onClick={() => void save()}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function Label({ text, style, children }: { text: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <label className={styles.label} style={style}>
      {text}
      <span className={styles.field}>{children}</span>
    </label>
  );
}
