/**
 * Decide whether a bibliographic search hit (Crossref / OpenAlex) is the work a
 * raw reference string names. Precision first: a wrong paper in the library is
 * worse than "not found", so every check must pass.
 */

export type ReferenceCandidate = {
  title: string;
  /** Bare DOI (10.x/…); arXiv DOIs (10.48550/arXiv.*) route to arXiv downstream. */
  doi: string;
  year?: number;
  /** Family names (or display names) in order. */
  authors: string[];
  venue?: string;
  source: "crossref" | "openalex";
};

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const compact = (text: string) => normalizeForMatch(text).replace(/\s+/g, "");
const isCjk = (text: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

/** Share of the candidate title the reference contains (1 = the whole title, in order). */
export function titleCoverage(raw: string, title: string): number {
  const rawCompact = compact(raw);
  const titleCompact = compact(title);
  if (titleCompact.length < 8) return 0;
  if (rawCompact.includes(titleCompact)) return 1;
  if (isCjk(title)) return 0;
  const rawTokens = new Set(normalizeForMatch(raw).split(" "));
  const titleTokens = normalizeForMatch(title)
    .split(" ")
    .filter((token) => token.length >= 2);
  if (titleTokens.length < 3) return 0;
  return titleTokens.filter((token) => rawTokens.has(token)).length / titleTokens.length;
}

function yearsIn(raw: string): number[] {
  return [...raw.matchAll(/(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/g)].map((m) => Number(m[1]));
}

function firstAuthorPresent(raw: string, authors: string[]): boolean {
  if (authors.length === 0) return true;
  const rawNorm = ` ${normalizeForMatch(raw)} `;
  const rawCompact = compact(raw);
  const name = authors[0];
  if (isCjk(name)) return rawCompact.includes(compact(name).slice(0, 2));
  const parts = normalizeForMatch(name).split(" ").filter((p) => p.length >= 2);
  // Display names ("Ashish Vaswani") → any part; the family name is usually last.
  return parts.some((part) => rawNorm.includes(` ${part} `));
}

export const TITLE_COVERAGE_MIN = 0.9;

export type MatchVerdict = { candidate: ReferenceCandidate; coverage: number } | null;

// Preprint servers and repositories that mint their own DOI for a work published elsewhere.
const PREPRINT_DOI_RE = /^10\.(1101|31234|31219|31235|20944|21203|2139|22541|36227|5281|6084)\//;
const PREPRINT_MENTION_RE = /\b(preprint|biorxiv|medrxiv|psyarxiv|ssrn|research square|zenodo|figshare|osf)\b/i;

function venueMentioned(raw: string, venue?: string): boolean {
  if (!venue) return false;
  const v = compact(venue);
  return v.length >= 4 && compact(raw).includes(v);
}

/**
 * Among candidates whose title, year and first author all agree with the
 * reference, prefer the one whose venue the reference names, then a published
 * version over a preprint DOI (unless the reference cites a preprint).
 */
export function pickReferenceMatch(raw: string, candidates: ReferenceCandidate[]): MatchVerdict {
  const years = yearsIn(raw);
  const citesPreprint = PREPRINT_MENTION_RE.test(raw);
  let best: { verdict: NonNullable<MatchVerdict>; rank: number } | null = null;
  candidates.forEach((candidate, order) => {
    if (!candidate.doi || !candidate.title) return;
    const coverage = titleCoverage(raw, candidate.title);
    if (coverage < TITLE_COVERAGE_MIN) return;
    if (candidate.year && years.length > 0 && !years.some((y) => Math.abs(y - candidate.year!) <= 1)) return;
    if (!firstAuthorPresent(raw, candidate.authors)) return;
    const preprint = PREPRINT_DOI_RE.test(candidate.doi);
    const rank =
      (venueMentioned(raw, candidate.venue) ? 4 : 0) +
      (preprint === citesPreprint ? 2 : 0) +
      coverage -
      order * 0.01;
    if (!best || rank > best.rank) best = { verdict: { candidate, coverage }, rank };
  });
  return best ? (best as { verdict: NonNullable<MatchVerdict> }).verdict : null;
}

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  author?: Array<{ family?: string; given?: string; name?: string }>;
  "container-title"?: string[];
};

export function parseCrossrefSearch(json: string): ReferenceCandidate[] {
  const items = (JSON.parse(json)?.message?.items ?? []) as CrossrefItem[];
  return items.map((item) => ({
    title: item.title?.[0] ?? "",
    doi: item.DOI ?? "",
    year: (item.issued ?? item.published)?.["date-parts"]?.[0]?.[0] ?? undefined,
    authors: (item.author ?? []).map((a) => a.family ?? a.name ?? "").filter(Boolean),
    venue: item["container-title"]?.[0],
    source: "crossref" as const,
  }));
}

type OpenAlexWork = {
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } | null } | null;
};

export function parseOpenAlexSearch(json: string): ReferenceCandidate[] {
  const results = (JSON.parse(json)?.results ?? []) as OpenAlexWork[];
  return results.map((work) => ({
    title: work.title ?? work.display_name ?? "",
    doi: (work.doi ?? "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""),
    year: work.publication_year ?? undefined,
    authors: (work.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    venue: work.primary_location?.source?.display_name ?? undefined,
    source: "openalex" as const,
  }));
}

/** The reference text sent to the search APIs: no label, no links, bounded length. */
export function referenceQuery(raw: string): string {
  return raw
    .replace(/^\s*(\[\d+\]|\d+\.)\s*/, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

/**
 * Best guess at the title inside a reference string, for title-only search:
 * the longest sentence-like segment that is not an author list or a venue line.
 * A partial title is fine: the hit's full title is checked against the raw text.
 */
export function guessReferenceTitle(raw: string): string | null {
  const text = referenceQuery(raw).replace(/[“”"]/g, ". ");
  const segments = text
    // A period after a lowercase letter / digit / bracket (not an initial), "?" or "!", or "X.:".
    .split(/(?<=[\p{Ll}\d\)\]]{2})\.\s+|(?<=[?!])\s+|(?<=\b\p{Lu}\.):\s+|\(\s*(?:19|20)\d{2}[a-z]?\s*\)[.,:]?\s*/u)
    .map((s) => s.replace(/,?\s+(In\s|arXiv|CoRR|Proceedings\b|(?:19|20)\d{2}\b|pages?\s|pp\.).*$/s, ""))
    .map((s) => s.replace(/^[\s,.;:]+|[\s,.;:]+$/g, ""));
  const authorLike = (s: string) => {
    const words = s.split(/\s+/);
    const commas = (s.match(/,/g) ?? []).length;
    const capitalized = words.filter((w) => /^\p{Lu}/u.test(w)).length;
    return /\bet al\b/.test(s) || (commas >= 1 && capitalized / words.length > 0.7) || /^(\p{Lu}[\p{L}'-]+ \p{Lu}{1,3}\b,?\s*){2,}/u.test(s);
  };
  const pick = segments
    .filter((s) => s.split(/\s+/).length >= 3 && !authorLike(s))
    .sort((a, b) => b.length - a.length)[0];
  return pick ? pick.slice(0, 250) : null;
}
