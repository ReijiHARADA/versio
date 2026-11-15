import type { PartialGroundTruth } from "../../services/pdfExtraction/benchmark";
import { normalizeName } from "./normalize";
import type { FieldGold, FieldName, FieldRecord, GoldSource } from "./types";

/** Lowercased, diacritic-folded text with whitespace, punctuation and hyphenation removed. */
function compact(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function familyKey(name: string, language: "en" | "ja"): string {
  const key = normalizeName(name, language);
  if (language === "ja" || !key.includes(" ")) return compact(key);
  return compact(key.slice(0, key.lastIndexOf(" ")));
}

/**
 * The gold and the PDF describe the same version: the title and the first
 * author's family name both appear in the text of the first two PDF pages.
 */
export function acceptPair(gold: FieldRecord, pdfFirstPageText: string, language: "en" | "ja"): boolean {
  if (!gold.title || gold.authors.length === 0) return false;
  const text = compact(pdfFirstPageText);
  const title = compact(gold.title);
  const family = familyKey(gold.authors[0].name, language);
  return title.length > 0 && family.length > 0 && text.includes(title) && text.includes(family);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Order-independent shuffle: items are sorted by id, then Fisher–Yates with a seeded PRNG. */
export function seededShuffle<T extends { id: string }>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const out = [...items].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function quotaKey(item: { source: GoldSource; discipline: string }): string {
  return `${item.source}/${item.discipline}`;
}

/**
 * Seeded per-stratum sample. Strata are `${source}/${discipline}`; a stratum
 * with fewer items than its quota returns what it has. Items whose stratum has
 * no quota are dropped.
 */
export function stratifiedSample<T extends { id: string; source: GoldSource; discipline: string; language: "en" | "ja" }>(
  items: T[],
  quota: Record<string, number>,
  seed: number,
): T[] {
  const taken: Record<string, number> = {};
  const out: T[] = [];
  for (const item of seededShuffle(items, seed)) {
    const key = quotaKey(item);
    const limit = quota[key] ?? 0;
    if ((taken[key] ?? 0) >= limit) continue;
    taken[key] = (taken[key] ?? 0) + 1;
    out.push(item);
  }
  return out;
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Hand-made ground truth: only the fields it records are trusted. Captions only when annotations are exhaustive. */
export function goldFromManual(gt: PartialGroundTruth, pdfPath: string, pdfSha256: string): FieldGold {
  const trustedFields: FieldName[] = [];
  const fields: FieldRecord = { title: null, authors: [], affiliations: [], emails: [], captions: [], references: [] };
  if (gt.title) {
    trustedFields.push("title");
    fields.title = gt.title;
  }
  if (gt.authors?.length) {
    trustedFields.push("authors");
    fields.authors = gt.authors.map((name) => ({ name, affiliationKeys: [] }));
  }
  if (gt.completeAnnotations && (gt.figureCaptions?.length || gt.tableCaptions?.length)) {
    trustedFields.push("captions");
    fields.captions = [
      ...(gt.figureCaptions ?? []).map((text) => ({ kind: "figure" as const, label: null, text })),
      ...(gt.tableCaptions ?? []).map((text) => ({ kind: "table" as const, label: null, text })),
    ];
  }
  return {
    id: `manual-${gt.id}`,
    source: "manual",
    language: KANA.test(gt.title ?? "") ? "ja" : "en",
    discipline: "manual",
    pdfPath,
    pdfSha256,
    trustedFields,
    fields,
  };
}
