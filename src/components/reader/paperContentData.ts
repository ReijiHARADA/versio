import { useMemo, useRef } from "react";
import type { Annotation } from "../../types/annotation";
import type { PaperBlock, Section } from "../../types/paper";
import {
  indexReferenceBlocks,
  isPageNumberArtifactBlock,
  looksLikeConferenceRunningHeader,
} from "../../services/citations";
import { isReferencesHeading } from "../../services/translation/quality";

export function isVisibleContentBlock(block: PaperBlock): boolean {
  if (block.type === "heading") return false;
  if (isPageNumberArtifactBlock(block.original, block.translated)) return false;
  if (looksLikeConferenceRunningHeader(block.original ?? "")) return false;
  const role = String(block.metadata?.role ?? "");
  return role !== "author" && role !== "affiliation" && role !== "copyright";
}

function isCitationReferenceBlock(block: PaperBlock): boolean {
  return (
    block.type === "reference" ||
    typeof block.metadata?.referenceId === "string"
  );
}

/** Keep a stable array identity while only body paragraphs are translating. */
export function useStableReferenceBlocks(blocks: PaperBlock[]): PaperBlock[] {
  const stableRef = useRef<PaperBlock[]>([]);
  return useMemo(() => {
    const next = blocks.filter(isCitationReferenceBlock);
    const prev = stableRef.current;
    if (
      prev.length === next.length &&
      prev.every(
        (block, index) =>
          block.id === next[index].id &&
          block.original === next[index].original &&
          block.metadata?.referenceId === next[index].metadata?.referenceId
      )
    ) {
      return prev;
    }
    stableRef.current = next;
    return next;
  }, [blocks]);
}

/** Reference id → anchor index that keeps its identity while the entries are unchanged. */
export function useStableReferenceIndex(blocks: PaperBlock[]): Map<string, string> {
  const stableRef = useRef<Map<string, string>>(new Map());
  return useMemo(() => {
    const next = indexReferenceBlocks(blocks);
    const prev = stableRef.current;
    if (prev.size === next.size) {
      let same = true;
      for (const [key, value] of next) {
        if (prev.get(key) !== value) {
          same = false;
          break;
        }
      }
      if (same) return prev;
    }
    stableRef.current = next;
    return next;
  }, [blocks]);
}

export function groupAnnotationsByBlock(annotations: Annotation[]): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const list = map.get(annotation.blockId);
    if (list) list.push(annotation);
    else map.set(annotation.blockId, [annotation]);
  }
  return map;
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

/** Visible content blocks grouped by section, in input order. */
export function groupVisibleBlocksBySection(blocks: PaperBlock[]): Map<string, PaperBlock[]> {
  const map = new Map<string, PaperBlock[]>();
  for (const block of blocks) {
    if (!block.sectionId || !isVisibleContentBlock(block)) continue;
    const list = map.get(block.sectionId);
    if (list) list.push(block);
    else map.set(block.sectionId, [block]);
  }
  return map;
}

/** Visible content blocks with no known section, in reading order. */
export function orphanVisibleBlocks(blocks: PaperBlock[], sectionIds: Set<string>): PaperBlock[] {
  return blocks
    .filter((block) => {
      if (!isVisibleContentBlock(block)) return false;
      return !block.sectionId || !sectionIds.has(block.sectionId);
    })
    .sort((a, b) => a.order - b.order);
}
