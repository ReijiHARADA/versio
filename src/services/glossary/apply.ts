import { applyGlossary, normalizeSourceGroundedTerminology } from "../llm/glossaryService";
import type { GlossaryEntry } from "../llm/types";
import {
  getBlocksByPaper,
  getGlossary,
  getPaper,
  getSectionsByPaper,
  saveBlocks,
  savePaper,
  saveSections,
} from "../database";
import type { Paper, PaperBlock, Section } from "../../types/paper";

export function assignBlockTranslation(block: PaperBlock, translated: string): void {
  block.translated = translated;
  block.translationStatus = "completed";
  block.metadata = { ...block.metadata, translationOutcome: "translated" };
  if (block.type === "figure" || block.type === "table") {
    block.metadata = { ...block.metadata, captionTranslated: translated };
  }
}

/**
 * Keep the exact source visible without the Reader failure surface. Used when
 * the model output is discarded by the quality gate: English original is safer
 * than painting every block as "翻訳に失敗しました".
 */
export function preserveSourceTranslation(block: PaperBlock, reason = "source_fallback"): void {
  block.translated = null;
  block.translationStatus = "completed";
  block.metadata = { ...block.metadata, translationOutcome: reason };
  if (block.type === "figure" || block.type === "table") {
    block.metadata = {
      ...block.metadata,
      captionTranslated: String(block.metadata.captionOriginal ?? block.original ?? ""),
    };
  }
}

export async function reapplyGlossary(paperId: string): Promise<{
  paper?: Paper;
  sections: Section[];
  blocks: PaperBlock[];
}> {
  const glossary: GlossaryEntry[] = await getGlossary(paperId);
  const paper = await getPaper(paperId);
  const sections = await getSectionsByPaper(paperId);
  const blocks = await getBlocksByPaper(paperId);
  if (glossary.length === 0) {
    return { paper, sections, blocks };
  }

  if (paper?.titleTranslated) {
    paper.titleTranslated = normalizeSourceGroundedTerminology(
      paper.titleOriginal ?? "",
      applyGlossary(paper.titleTranslated, glossary)
    );
    await savePaper(paper);
  }
  for (const section of sections) {
    if (!section.translatedTitle) continue;
    section.translatedTitle = normalizeSourceGroundedTerminology(
      section.originalTitle,
      applyGlossary(section.translatedTitle, glossary)
    );
  }
  if (sections.length) await saveSections(sections);
  for (const block of blocks) {
    if (!block.translated) continue;
    assignBlockTranslation(
      block,
      normalizeSourceGroundedTerminology(
        block.original ?? "",
        applyGlossary(block.translated, glossary)
      )
    );
  }
  if (blocks.some((block) => block.translated)) {
    await saveBlocks(blocks);
  }
  return { paper, sections, blocks };
}
