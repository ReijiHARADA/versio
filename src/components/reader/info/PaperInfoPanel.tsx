import { useEffect, useState } from "react";
import type { Paper } from "../../../types/paper";
import { getPaperWithPackageMetadata } from "../../../services/database";
import { openExternalUrl } from "../../../services/openExternalUrl";
import { READ_STATUS_LABELS } from "../../../services/paperLibraryState";
import { PaperMetadataSheet } from "../../library/PaperMetadataSheet";
import styles from "./PaperInfoPanel.module.css";

function venueLine(paper: Paper): string | null {
  const bib = paper.bibliography ?? {};
  const volume = bib.volume ? (bib.issue ? `${bib.volume}(${bib.issue})` : bib.volume) : null;
  const parts = [paper.publication, volume, bib.pages ? `pp. ${bib.pages}` : null, paper.year ? String(paper.year) : null];
  const line = parts.filter(Boolean).join(", ");
  return line || null;
}

/** Inspector "情報" tab: read-only paper metadata; editing reuses the library's metadata sheet. */
export function PaperInfoPanel({ paper, workspaceNames }: { paper: Paper; workspaceNames: string[] }) {
  // The library index lacks package-only fields (DOI, bibliography, structured authors); the package has them.
  const [full, setFull] = useState<Paper | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let alive = true;
    void getPaperWithPackageMetadata(paper.id).then((loaded) => {
      if (alive) setFull(loaded ?? null);
    });
    return () => {
      alive = false;
    };
  }, [paper.id, paper.updatedAt]);

  // Tags and read status live only in SQLite, so the index copy is the fresh one.
  const p: Paper = full ? { ...full, tags: paper.tags, readStatus: paper.readStatus } : paper;
  const bib = p.bibliography ?? {};
  const affiliationNames = (p.affiliations ?? []).map((a) => a.name);
  const venue = venueLine(p);
  const links = [
    p.doi && { label: `DOI ${p.doi}`, href: `https://doi.org/${p.doi}` },
    bib.arxivId && { label: `arXiv ${bib.arxivId}`, href: `https://arxiv.org/abs/${bib.arxivId}` },
    bib.url && { label: bib.url, href: bib.url },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  return (
    <div className={styles.info}>
      <section className={styles.titleBlock}>
        <p className={styles.title}>{p.titleTranslated || p.titleOriginal || p.sourceFileName || "無題"}</p>
        {p.titleTranslated && p.titleOriginal && <p className={styles.originalTitle}>{p.titleOriginal}</p>}
      </section>

      <dl className={styles.fields}>
        {p.authors.length > 0 && (
          <Field label="著者">
            {p.authors.join(", ")}
            {affiliationNames.length > 0 && (
              <ul className={styles.affiliations}>
                {affiliationNames.map((name, i) => (
                  <li key={`${i}-${name}`}>{name}</li>
                ))}
              </ul>
            )}
          </Field>
        )}
        {venue && <Field label="掲載">{venue}{bib.publisher && <span className={styles.sub}>{bib.publisher}</span>}</Field>}
        {links.length > 0 && (
          <Field label="リンク">
            {links.map((link) => (
              <button key={link.href} type="button" className={styles.link} onClick={() => void openExternalUrl(link.href)}>
                {link.label}
              </button>
            ))}
          </Field>
        )}
        {(p.keywords?.length ?? 0) > 0 && <Field label="キーワード"><Chips items={p.keywords!} /></Field>}
        {(p.tags?.length ?? 0) > 0 && <Field label="タグ"><Chips items={p.tags!} /></Field>}
        {workspaceNames.length > 0 && <Field label="フォルダ"><Chips items={workspaceNames} /></Field>}
        <Field label="読書状態">{READ_STATUS_LABELS[p.readStatus ?? "unread"]}</Field>
        {p.pageCount > 0 && <Field label="ページ">{p.pageCount}</Field>}
      </dl>

      <button type="button" className={styles.edit} onClick={() => setEditing(true)}>
        書誌情報を編集
      </button>
      {editing && <PaperMetadataSheet paper={paper} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className={styles.chips}>
      {items.map((item) => (
        <span key={item} className={styles.chip}>{item}</span>
      ))}
    </span>
  );
}
