/**
 * Resume eligibility from SQLite index metadata only — never opens a Paper Package.
 */
import type { Paper, ProcessingStatus } from "../../types/paper";

const ACTIVE_RESUME_STATUSES = new Set<ProcessingStatus>([
  "queued",
  "extracting",
  "structuring",
  "glossary",
  "translating",
  "partial",
  "failed",
]);

export function computeNeedsTranslationResume(
  status: ProcessingStatus,
  explicit?: boolean
): boolean {
  if (typeof explicit === "boolean") return explicit;
  return ACTIVE_RESUME_STATUSES.has(status);
}

export function shouldResumeFromIndex(paper: Paper): boolean {
  if (paper.needsTranslationResume === true) return true;
  if (paper.needsTranslationResume === false) return false;
  // Legacy rows before the column existed: only non-ready statuses.
  return ACTIVE_RESUME_STATUSES.has(paper.processingStatus);
}

export function withResumeFlag(
  paper: Paper,
  needsResume?: boolean
): Paper {
  const flag =
    needsResume ??
    computeNeedsTranslationResume(paper.processingStatus, paper.needsTranslationResume);
  return { ...paper, needsTranslationResume: flag };
}
