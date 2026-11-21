import type { Paper } from "../../types/paper";
import { getPaperWithPackageMetadata } from "../database";
import { saveCitationExport, type SavedExport } from "../../data/export/saveExport";
import { toBibTeX, toRIS } from "./formatCitation";

export type CitationFormat = "bibtex" | "ris";

/** The SQLite index lacks DOI / bibliography; read them from each paper.json. */
async function withPackageMetadata(papers: Paper[]): Promise<Paper[]> {
  const loaded = await Promise.all(
    papers.map(async (paper) => (await getPaperWithPackageMetadata(paper.id)) ?? paper)
  );
  return loaded.sort(
    (a, b) => (a.authors[0] ?? "").localeCompare(b.authors[0] ?? "") || (a.year ?? 0) - (b.year ?? 0)
  );
}

export async function formatCitations(papers: Paper[], format: CitationFormat): Promise<string> {
  const full = await withPackageMetadata(papers);
  return format === "bibtex" ? toBibTeX(full) : toRIS(full);
}

export async function exportCitations(
  papers: Paper[],
  format: CitationFormat,
  baseName: string
): Promise<SavedExport | null> {
  const text = await formatCitations(papers, format);
  const safe = baseName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "references";
  return saveCitationExport(`${safe}.${format === "bibtex" ? "bib" : "ris"}`, text);
}
