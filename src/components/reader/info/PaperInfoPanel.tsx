import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Paper, PaperBlock, Section } from "../../../types/paper";
import { getPaperWithPackageMetadata } from "../../../services/database";
import { openExternalUrl } from "../../../services/openExternalUrl";
import { READ_STATUS_LABELS } from "../../../services/paperLibraryState";
import { copyBibTeX } from "../../../services/bibliography/copyBibTeX";
import { PaperMetadataSheet } from "../../library/PaperMetadataSheet";
import {
  ENTRY_TYPE_LABELS,
  authorsWithAffiliationNumbers,
  formatDate,
  paperInfoStats,
} from "./paperInfoData";
import styles from "./PaperInfoPanel.module.css";

type Props = {
  paper: Paper;
  blocks: PaperBlock[];
  sections: Section[];
  workspaceNames: string[];
  annotationCount: number;
  glossaryCount: number;
};

/**
 * Inspector "情報" tab, laid out like reference managers' item panes (Zotero / Mendeley):
 * header, abstract, citation fields, library state, and what this paper contains.
 * Read-only; editing reuses the library's metadata sheet.
 */
export function PaperInfoPanel({ paper, blocks, sections, workspaceNames, annotationCount, glossaryCount }: Props) {
  // The library index lacks package-only fields (DOI, bibliography, structured authors); the package has them.
  const [full, setFull] = useState<Paper | null>(null);
  const [editing, setEditing] = useState(false);
  const [abstractOpen, setAbstractOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void getPaperWithPackageMetadata(paper.id).then((loaded) => {
      if (alive) setFull(loaded ?? null);
    });
    return () => {
      alive = false;
    };
  }, [paper.id, paper.updatedAt]);

  // Tags, read status and favorite live only in SQLite, so the index copy is the fresh one.
  const p: Paper = full
    ? { ...full, tags: paper.tags, readStatus: paper.readStatus, favorite: paper.favorite, lastOpenedAt: paper.lastOpenedAt }
    : paper;
  const bib = p.bibliography ?? {};
  const stats = useMemo(() => paperInfoStats(blocks, sections), [blocks, sections]);
  const authors = authorsWithAffiliationNumbers(p);
  const affiliations = p.affiliations ?? [];
  const numbered = authors.some((a) => a.marks.length > 0);
  const abstractText = stats.abstract.map((para) => para.translated || para.original).filter(Boolean) as string[];
  const volumeIssue = bib.volume ? (bib.issue ? `${bib.volume}（${bib.issue}）` : bib.volume) : bib.issue ? `（${bib.issue}）` : null;
  const progress = stats.translatable > 0 ? Math.round((stats.translated / stats.translatable) * 100) : null;

  return (
    <div className={styles.info}>
      <section className={styles.head}>
        {bib.entryType && <span className={styles.typeBadge}>{ENTRY_TYPE_LABELS[bib.entryType]}</span>}
        <p className={styles.title}>{p.titleTranslated || p.titleOriginal || p.sourceFileName || "無題"}</p>
        {p.titleTranslated && p.titleOriginal && <p className={styles.originalTitle}>{p.titleOriginal}</p>}
        {authors.length > 0 && (
          <p className={styles.authors}>
            {authors.map((author, i) => (
              <span key={`${i}-${author.name}`}>
                {author.name}
                {numbered && author.marks.length > 0 && <sup>{author.marks.join(",")}</sup>}
                {i < authors.length - 1 && ", "}
              </span>
            ))}
          </p>
        )}
        {affiliations.length > 0 && (
          <ol className={styles.affiliations}>
            {affiliations.map((a, i) => (
              <li key={a.id}>
                {numbered && <sup>{i + 1}</sup>}
                {a.name}
              </li>
            ))}
          </ol>
        )}
      </section>

      {abstractText.length > 0 && (
        <Section title="概要">
          <div className={abstractOpen ? styles.abstract : `${styles.abstract} ${styles.clamped}`}>
            {abstractText.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
          <button type="button" className={styles.textButton} onClick={() => setAbstractOpen((v) => !v)}>
            {abstractOpen ? "折りたたむ" : "すべて表示"}
          </button>
        </Section>
      )}

      <Section title="書誌情報">
        <dl className={styles.rows}>
          <Row label="種別">{bib.entryType ? ENTRY_TYPE_LABELS[bib.entryType] : null}</Row>
          <Row label="掲載誌">{p.publication}</Row>
          <Row label="巻（号）">{volumeIssue}</Row>
          <Row label="ページ">{bib.pages}</Row>
          <Row label="発行年">{p.year}</Row>
          <Row label="出版社">{bib.publisher}</Row>
          <Row label="DOI">{p.doi && <Link href={`https://doi.org/${p.doi}`}>{p.doi}</Link>}</Row>
          <Row label="arXiv">{bib.arxivId && <Link href={`https://arxiv.org/abs/${bib.arxivId}`}>{bib.arxivId}</Link>}</Row>
          <Row label="URL">{bib.url && <Link href={bib.url}>{bib.url}</Link>}</Row>
          <Row label="キーワード">{(p.keywords?.length ?? 0) > 0 && <Chips items={p.keywords!} />}</Row>
        </dl>
        <div className={styles.actions}>
          <button type="button" className={styles.textButton} onClick={() => void copyBibTeX(p)}>
            BibTeX をコピー
          </button>
          <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
            書誌情報を編集
          </button>
        </div>
      </Section>

      <Section title="ライブラリ">
        <dl className={styles.rows}>
          <Row label="読書状態">{READ_STATUS_LABELS[p.readStatus ?? "unread"]}</Row>
          <Row label="お気に入り">{p.favorite ? "★ 登録済み" : null}</Row>
          <Row label="タグ">{(p.tags?.length ?? 0) > 0 && <Chips items={p.tags!} />}</Row>
          <Row label="フォルダ">{workspaceNames.length > 0 && <Chips items={workspaceNames} />}</Row>
          <Row label="追加日">{formatDate(p.createdAt)}</Row>
          <Row label="最後に開いた日">{formatDate(p.lastOpenedAt)}</Row>
        </dl>
      </Section>

      <Section title="この論文">
        <dl className={styles.rows}>
          <Row label="翻訳">
            {progress != null && `${progress}%（${stats.translated} / ${stats.translatable} 段落）`}
          </Row>
          <Row label="ページ数">{p.pageCount > 0 ? p.pageCount : null}</Row>
          <Row label="図・表">{stats.figures + stats.tables > 0 ? `図 ${stats.figures}・表 ${stats.tables}` : null}</Row>
          <Row label="参考文献">{stats.references > 0 ? `${stats.references} 件` : null}</Row>
          <Row label="メモ">{annotationCount > 0 ? `${annotationCount} 件` : null}</Row>
          <Row label="用語">{glossaryCount > 0 ? `${glossaryCount} 件` : null}</Row>
          <Row label="元ファイル">{p.sourceFileName}</Row>
        </dl>
      </Section>

      {editing && <PaperMetadataSheet paper={paper} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** Empty values are skipped, as reference managers hide unfilled fields in read view. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === false || children === "") return null;
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.link} onClick={() => void openExternalUrl(href)}>
      {children}
    </button>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className={styles.chips}>
      {items.map((item) => (
        <span key={item} className={styles.chip}>
          {item}
        </span>
      ))}
    </span>
  );
}
