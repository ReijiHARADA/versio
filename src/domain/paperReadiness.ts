import type { PaperBlock, ProcessingStatus } from "../types/paper";
import { isBusyProcessingStatus } from "../services/paperStatus";

export type PaperReadiness = "preparing" | "readable" | "translating" | "needs_attention";

export type PaperReadinessView = {
  readiness: PaperReadiness;
  label: string;
  canOpen: boolean;
};

export function hasReadableBody(blocks: PaperBlock[] | undefined): boolean {
  if (!blocks?.length) return false;
  return blocks.some((block) => {
    if (block.type === "reference") return false;
    return Boolean(block.original || block.translated);
  });
}

export function translationPercent(
  blocks: PaperBlock[] | undefined,
  shouldTranslate: (block: PaperBlock) => boolean
): number | null {
  if (!blocks?.length) return null;
  const targets = blocks.filter((block) => shouldTranslate(block));
  if (targets.length === 0) return 100;
  const done = targets.filter(
    (block) => block.translationStatus === "completed" || block.translationStatus === "skipped"
  ).length;
  return Math.round((done / targets.length) * 100);
}

export function derivePaperReadiness(input: {
  processingStatus: ProcessingStatus;
  blocks?: PaperBlock[];
}): PaperReadinessView {
  const { processingStatus, blocks } = input;
  const bodyLoaded = blocks !== undefined;
  const readable = hasReadableBody(blocks);

  if (processingStatus === "failed") {
    // Unloaded body: trust index — package usually still opens.
    return {
      readiness: "needs_attention",
      label: "要確認",
      canOpen: bodyLoaded ? readable : true,
    };
  }
  if (processingStatus === "partial") {
    return {
      readiness: "needs_attention",
      label: "要確認",
      canOpen: bodyLoaded ? readable : true,
    };
  }
  if (processingStatus === "translating" || processingStatus === "glossary") {
    return {
      readiness: "translating",
      label: "翻訳中",
      canOpen: true,
    };
  }
  if (processingStatus === "queued" || processingStatus === "extracting" || processingStatus === "structuring") {
    if (!bodyLoaded) {
      return { readiness: "preparing", label: "準備中", canOpen: false };
    }
    if (!readable) {
      return { readiness: "preparing", label: "準備中", canOpen: false };
    }
    return { readiness: "translating", label: "翻訳中", canOpen: true };
  }
  if (isBusyProcessingStatus(processingStatus) && !readable) {
    return { readiness: "preparing", label: "準備中", canOpen: false };
  }
  if (isBusyProcessingStatus(processingStatus) && readable) {
    return { readiness: "translating", label: "翻訳中", canOpen: true };
  }
  // ready / unknown — openable from library without loading body first
  return { readiness: "readable", label: "読めます", canOpen: true };
}

/** Text label only — progress is shown as a bar in the library row. */
export function formatTranslationProgressLabel(readiness: PaperReadiness): string {
  if (readiness === "translating") return "翻訳中";
  if (readiness === "preparing") return "準備中";
  if (readiness === "needs_attention") return "要確認";
  return "読めます";
}
