import type { Paper, PaperBlock, Section } from "../../../types/paper";

export const ENTRY_TYPE_LABELS: Record<NonNullable<NonNullable<Paper["bibliography"]>["entryType"]>, string> = {
  article: "学術論文",
  inproceedings: "会議論文",
  preprint: "プレプリント",
  book: "書籍",
  misc: "その他",
};

const NON_TRANSLATED_TYPES = new Set<PaperBlock["type"]>(["heading", "reference", "equation"]);

export type PaperInfoStats = {
  /** Abstract paragraphs, translated text first (original until translated). */
  abstract: { translated: string | null; original: string | null }[];
  references: number;
  figures: number;
  tables: number;
  translatable: number;
  translated: number;
};

export function paperInfoStats(blocks: PaperBlock[], sections: Section[]): PaperInfoStats {
  const abstractSections = new Set(sections.filter((s) => s.normalizedKind === "abstract").map((s) => s.id));
  const stats: PaperInfoStats = { abstract: [], references: 0, figures: 0, tables: 0, translatable: 0, translated: 0 };
  for (const block of blocks) {
    if (block.type === "reference") stats.references++;
    else if (block.type === "figure") stats.figures++;
    else if (block.type === "table") stats.tables++;
    if (block.type === "paragraph" && block.sectionId && abstractSections.has(block.sectionId)) {
      stats.abstract.push({ translated: block.translated, original: block.original });
    }
    if (!NON_TRANSLATED_TYPES.has(block.type) && block.original && block.translationStatus !== "skipped") {
      stats.translatable++;
      if (block.translationStatus === "completed") stats.translated++;
    }
  }
  return stats;
}

/** Authors with 1-based affiliation numbers, in the order affiliations are listed. */
export function authorsWithAffiliationNumbers(paper: Paper): { name: string; marks: number[] }[] {
  const order = new Map((paper.affiliations ?? []).map((a, i) => [a.id, i + 1]));
  if (paper.authorsStructured?.length) {
    return paper.authorsStructured.map((a) => ({
      name: a.name,
      marks: a.affiliationIds.map((id) => order.get(id)).filter((n): n is number => n != null),
    }));
  }
  return paper.authors.map((name) => ({ name, marks: [] }));
}

export function formatDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("ja-JP");
}
