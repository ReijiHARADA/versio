import type { PaperReadStatus } from "../types/paper";
import { setPaperLibraryState } from "./database";
import { useLibraryCache } from "../stores/libraryCache";

/** Trim, drop empties and case-insensitive duplicates, keep the first spelling. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export async function applyPaperReadStatus(paperId: string, readStatus: PaperReadStatus): Promise<void> {
  await setPaperLibraryState(paperId, { readStatus });
  useLibraryCache.getState().updatePaper(paperId, { readStatus });
}

export async function applyPaperTags(paperId: string, tags: string[]): Promise<void> {
  const next = normalizeTags(tags);
  await setPaperLibraryState(paperId, { tags: next });
  useLibraryCache.getState().updatePaper(paperId, { tags: next });
}
