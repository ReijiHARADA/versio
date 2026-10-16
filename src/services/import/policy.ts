import type { PaperBlock, Section } from "../../types/paper";
import {
  isReferencesHeading,
  looksLikeBibliographyEntry,
  shouldTranslateCaption,
  shouldTranslateHeading,
  shouldTranslateParagraph,
} from "../translation/quality";

export function asSectionIdSet(value: unknown): Set<string> {
  if (value instanceof Set) {
    return value as Set<string>;
  }
  if (Array.isArray(value)) {
    return new Set(value.filter((id): id is string => typeof id === "string"));
  }
  return new Set();
}

export function referenceSectionIds(sections: Section[]): Set<string> {
  return new Set(
    sections
      .filter(
        (section) =>
          section.normalizedKind === "references" || isReferencesHeading(section.originalTitle)
      )
      .map((section) => section.id)
  );
}

export function shouldTranslateSection(section: Section): boolean {
  if (section.normalizedKind === "references") return false;
  if (isReferencesHeading(section.originalTitle)) return false;
  return shouldTranslateHeading(section.originalTitle);
}

export function shouldTranslateBlock(
  block: PaperBlock,
  refSectionIds: Set<string> = new Set()
): boolean {
  const ids = asSectionIdSet(refSectionIds);
  if (!block.original) return false;
  if (block.translationStatus === "skipped") return false;
  if (block.type === "reference") return false;
  if (block.sectionId && ids.has(block.sectionId)) return false;
  if (isReferencesHeading(block.original)) return false;
  if (looksLikeBibliographyEntry(block.original)) return false;
  const role = String(block.metadata?.role ?? "");
  if (role === "author" || role === "affiliation" || role === "copyright") {
    return false;
  }
  if (block.type === "heading") return false;
  if (block.type === "paragraph" || block.type === "footnote") {
    // Extraction can attach geometry-backed warnings when a physical block
    // is likely an unfinished continuation. Preserve the source until the
    // layout resolver repairs it instead of sending the fragment to MADLAD.
    if (block.metadata?.translationInputWarning) return false;
    // A colon-ended lead-in immediately followed by a projected list is a
    // complete translation unit in its own right. The layout resolver marks
    // it explicitly after seeing the list successor, so the generic
    // single-block completeness heuristic must not reject it again.
    if (block.metadata?.listRole === "intro") return true;
    if (block.metadata?.listRole === "item") {
      // List items are independent translation units. They often omit a
      // terminal period, so the paragraph completeness gate must not discard
      // meaningful bullets or numbered procedure/design directions.
      return (block.original.match(/[A-Za-z]{3,}/g)?.length ?? 0) >= 3;
    }
    return shouldTranslateParagraph(block.original);
  }
  if (block.type === "figure" || block.type === "table") {
    const caption = String(block.metadata.captionOriginal ?? block.original ?? "");
    return shouldTranslateCaption(caption);
  }
  return false;
}

export function isRetryableTranslationFailure(
  block: PaperBlock,
  refSectionIds: Set<string> = new Set()
): boolean {
  if (block.translationStatus !== "failed") return false;
  // Transport failures keep the retry surface for paragraphs, captions, and
  // list items alike. Quality-preserved source blocks are completed, not failed.
  if (
    block.type !== "paragraph" &&
    block.type !== "footnote" &&
    block.type !== "figure" &&
    block.type !== "table"
  ) {
    return false;
  }
  return shouldTranslateBlock(block, asSectionIdSet(refSectionIds));
}
