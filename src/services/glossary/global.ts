import { getGlossary, getSetting, saveSetting } from "../database";
import type { GlossaryEntry } from "../llm/types";

/** Settings key for the glossary shared by every paper (Settings → 翻訳 → 共通の用語集). */
export const GLOBAL_GLOSSARY_KEY = "globalGlossary";

function termKey(term: string): string {
  return term.trim().toLowerCase();
}

/** Drops blank rows and keeps the last entry for each term (case-insensitive). */
export function normalizeGlossaryEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  const byTerm = new Map<string, GlossaryEntry>();
  for (const entry of entries) {
    const term = entry.term.trim();
    const translation = entry.translation.trim();
    if (!term || !translation) continue;
    byTerm.set(termKey(term), { ...entry, term, translation });
  }
  return [...byTerm.values()];
}

export async function getGlobalGlossary(): Promise<GlossaryEntry[]> {
  const saved = await getSetting<GlossaryEntry[]>(GLOBAL_GLOSSARY_KEY);
  return Array.isArray(saved) ? normalizeGlossaryEntries(saved) : [];
}

export async function saveGlobalGlossary(entries: GlossaryEntry[]): Promise<GlossaryEntry[]> {
  const normalized = normalizeGlossaryEntries(entries);
  await saveSetting(GLOBAL_GLOSSARY_KEY, normalized);
  return normalized;
}

/** A paper's own entry wins over the shared one for the same term. */
export function mergeGlossaries(
  global: GlossaryEntry[],
  paper: GlossaryEntry[]
): GlossaryEntry[] {
  const paperTerms = new Set(paper.map((entry) => termKey(entry.term)));
  return [...global.filter((entry) => !paperTerms.has(termKey(entry.term))), ...paper];
}

/** Glossary used when translating a paper: shared entries plus the paper's own. */
export async function getTranslationGlossary(paperId: string): Promise<GlossaryEntry[]> {
  const [global, paper] = await Promise.all([getGlobalGlossary(), getGlossary(paperId)]);
  return mergeGlossaries(global, paper);
}
