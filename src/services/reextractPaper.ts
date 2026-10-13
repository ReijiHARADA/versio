import { getStorage } from "../data/runtime";
import { attachLinesToBlocks, layoutFileFromNative } from "../data/package/layoutFromExtraction";
import { projectionToPackage } from "../data/package/fromProjection";
import { loadPaperPackage, loadSourcePdfBytes, persistPaperPackage } from "../data/package/persist";
import { normalizeBlockText } from "../data/package/ids";
import { rememberDocument } from "../data/repositories/documentRepository";
import { extractAcademicPdf } from "./pdfExtraction/pipeline/extractAcademicPdf";
import { getBlocksByPaper, getPaper, savePaper } from "./database";
import type { Paper, PaperBlock, Section } from "../types/paper";

export type ReextractProgress = {
  message: string;
  done: number;
  total: number;
};

type ReextractResult = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
};

function exactSourceKey(block: PaperBlock): string {
  return `${block.type}|${normalizeBlockText(block.original ?? "")}`;
}

/**
 * Keep a completed translation only when the newly extracted source is byte-for-
 * byte equivalent after whitespace normalization. A changed extraction must be
 * translated again rather than inheriting a translation for different source.
 */
export function carryForwardExactTranslations(
  previous: PaperBlock[],
  next: PaperBlock[]
): PaperBlock[] {
  const byId = new Map(previous.map((block) => [block.id, block]));
  const bySource = new Map<string, PaperBlock[]>();
  for (const block of previous) {
    if (!block.translated || block.translationStatus !== "completed") continue;
    const key = exactSourceKey(block);
    const matches = bySource.get(key) ?? [];
    matches.push(block);
    bySource.set(key, matches);
  }
  const consumed = new Set<string>();
  return next.map((block) => {
    const sameId = byId.get(block.id);
    const inherited =
      sameId && sameId.translationStatus === "completed" &&
      exactSourceKey(sameId) === exactSourceKey(block)
        ? sameId
        : (bySource.get(exactSourceKey(block)) ?? []).find((candidate) => !consumed.has(candidate.id));
    if (!inherited) return block;
    consumed.add(inherited.id);
    return {
      ...block,
      translated: inherited.translated,
      translationStatus: "completed",
      metadata: {
        ...block.metadata,
        translationOutcome: inherited.metadata.translationOutcome,
        ...(typeof inherited.metadata.captionTranslated === "string"
          ? { captionTranslated: inherited.metadata.captionTranslated }
          : {}),
      },
    };
  });
}

function carryForwardSectionTranslations(previous: Section[], next: Section[]): Section[] {
  const previousByKey = new Map(
    previous
      .filter((section) => section.translatedTitle)
      .map((section) => [`${section.level}|${normalizeBlockText(section.originalTitle)}`, section])
  );
  return next.map((section) => {
    const match = previousByKey.get(`${section.level}|${normalizeBlockText(section.originalTitle)}`);
    return match?.translatedTitle ? { ...section, translatedTitle: match.translatedTitle } : section;
  });
}

/**
 * Rebuild a saved Paper Package from its immutable source.pdf. This is separate
 * from import so it retains the paper id, workspace membership, annotations,
 * and exact-source translations while replacing stale layout/assets atomically.
 */
export async function reextractPaper(
  paperId: string,
  onProgress?: (progress: ReextractProgress) => void
): Promise<ReextractResult> {
  const paper = await getPaper(paperId);
  if (!paper) throw new Error("論文が見つかりません");
  const { fs } = await getStorage();
  const [sourcePdf, existingPackage, previousBlocks] = await Promise.all([
    loadSourcePdfBytes(fs, paperId),
    loadPaperPackage(fs, paperId, { includeLayout: true }),
    getBlocksByPaper(paperId),
  ]);
  if (!sourcePdf) throw new Error("保存済みの元PDFがないため、抽出を更新できません");

  const fileName = paper.sourceFileName || paper.sourceFilePath || "paper.pdf";
  // Copy into a fresh ArrayBuffer-backed view. TypeScript's DOM declarations
  // reject a Uint8Array whose generic buffer could be SharedArrayBuffer.
  const file = new File([new Uint8Array(sourcePdf)], fileName, { type: "application/pdf" });
  const extracted = await extractAcademicPdf({
    paperId,
    filePath: fileName,
    fileHash: paper.sourceFileHash,
    file,
    extractFigures: true,
    previousBlocks,
    onProgress: (progress) => onProgress?.({
      message: progress.message,
      done: progress.done,
      total: progress.total,
    }),
  });
  const sections = carryForwardSectionTranslations(
    (existingPackage.structure.sections ?? []).map((section) => ({
      ...section,
      paperId,
      parentSectionId: section.parentSectionId ?? null,
      translatedTitle: section.translatedTitle ?? null,
      normalizedKind: section.normalizedKind as Section["normalizedKind"],
    })),
    extracted.sections
  );
  const blocks = carryForwardExactTranslations(
    previousBlocks,
    attachLinesToBlocks(extracted.blocks, extracted.layoutBlocks)
  );
  const nextPaper: Paper = {
    ...paper,
    ...extracted.paper,
    id: paperId,
    sourceFilePath: paper.sourceFilePath,
    sourceFileName: paper.sourceFileName ?? fileName,
    sourceStoredPath: paper.sourceStoredPath ?? `papers/${paperId}/source.pdf`,
    sourceFileHash: paper.sourceFileHash,
    titleTranslated:
      normalizeBlockText(extracted.paper.titleOriginal ?? "") === normalizeBlockText(paper.titleOriginal ?? "")
        ? paper.titleTranslated
        : null,
    favorite: paper.favorite,
    lastOpenedAt: paper.lastOpenedAt,
    lastReadBlockId: paper.lastReadBlockId,
    lastReadOffset: paper.lastReadOffset,
    createdAt: paper.createdAt,
    updatedAt: new Date().toISOString(),
    processingStatus: "partial",
    needsTranslationResume: true,
  };
  const pkg = projectionToPackage({
    paper: nextPaper,
    sections,
    blocks,
    revision: existingPackage.paper.revision,
    layout: layoutFileFromNative(extracted.native, blocks),
    sourcePdf,
  });
  const persisted = await persistPaperPackage(fs, pkg);
  nextPaper.packageRevision = persisted.revision;
  // The package write above is the durable transaction. Refresh the cache and
  // index afterwards; savePaper persists the updated index metadata and leaves
  // the rebuilt source/assets intact.
  rememberDocument(nextPaper, sections, blocks);
  await savePaper(nextPaper);
  return { paper: nextPaper, sections, blocks };
}
