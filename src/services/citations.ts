import type { PaperBlock } from "../types/paper";

const CITATION_RE = /\[(\d+(?:\s*[,–—-]\s*\d+)*)\]/g;

export function parseCitationGroups(
  text: string
): { start: number; end: number; keys: string[] }[] {
  const groups: { start: number; end: number; keys: string[] }[] = [];
  const re = new RegExp(CITATION_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const keys = expandCitationKeys(match[1]);
    if (keys.length === 0) continue;
    groups.push({ start: match.index, end: match.index + match[0].length, keys });
  }
  return groups;
}

export function expandCitationKeys(inner: string): string[] {
  const keys: string[] = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const range = part.match(/^(\d+)\s*[–—-]\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > 0 && to >= from && to - from <= 20) {
        for (let n = from; n <= to; n++) keys.push(String(n));
      }
      continue;
    }
    if (/^\d+$/.test(part)) keys.push(part);
  }
  return [...new Set(keys)];
}

export function referenceKeyFromText(text: string): string | null {
  const t = text.trim();
  const bracket = t.match(/^\[(\d+)\]/);
  if (bracket) return bracket[1];
  const numbered = t.match(/^(\d+)\.\s+[A-Z]/);
  if (!numbered) return null;
  // "2007. Research Through Design…" is a year-title continuation, not cite #2007.
  const n = Number(numbered[1]);
  if (n >= 1900 && n <= 2100) return null;
  return numbered[1];
}

const CONFERENCE_VENUE =
  /\b(?:TEI|CHI|UIST|DIS|CSCW|ISWC|MobileHCI|UbiComp|IMWUT|ISS|IDC|ICMI|IUI|ASSETS|AutomotiveUI)\s+'?\d{2,4}\b/i;

/**
 * ACM-style running headers that interrupt REFERENCES across a page break
 * (e.g. "Share, Show And Tell TEI 2016, February 14–17, 2016, Eindhoven…").
 */
export function looksLikeConferenceRunningHeader(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length < 28 || t.length > 180) return false;
  if (/^(?:\[\d+\]|\d{1,3}[.)])\s+/.test(t)) return false;
  if (/https?:\/\//i.test(t) || /\bdoi\s*:/i.test(t)) return false;
  if (/^(?:proceedings of|extended abstracts|conference on)\b/i.test(t)) return true;
  const hasVenueYear = CONFERENCE_VENUE.test(t);
  const hasDate =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(
      t
    );
  return hasVenueYear && hasDate;
}

/** Year-title fragment after authors were cut by a page/header break. */
export function looksLikeYearTitleReferenceContinuation(text: string): boolean {
  const t = text.trim();
  return /^(?:19|20)\d{2}[a-z]?\.\s+[A-Z][\s\S]{12,220}$/.test(t);
}

/** Numbered/unnumbered author list that ends before the year/title. */
export function looksLikeAuthorsOnlyReferenceStub(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 180) return false;
  if (/\b(?:19|20)\d{2}[a-z]?\b/.test(t)) return false;
  return /^(?:(?:\[\d+\]|\d{1,3}[.)])\s+)?[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*(?:,\s+[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*)*,?\s+and\s+[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*\.\s*$/.test(
    t
  );
}

/**
 * Rejoin author stubs with the following year-title line when a page header
 * had split a bibliography entry (display-time / projection fallback).
 */
export function coalesceSplitReferenceBlocks<T extends { original?: string | null; type: string; metadata?: Record<string, unknown> }>(
  blocks: T[]
): T[] {
  const out: T[] = [];
  for (const block of blocks) {
    const last = out.at(-1);
    const text = (block.original ?? "").trim();
    const lastText = (last?.original ?? "").trim();
    const lastIsRef =
      last?.type === "reference" || String(last?.metadata?.role ?? "") === "reference";
    if (
      last &&
      lastIsRef &&
      looksLikeAuthorsOnlyReferenceStub(lastText) &&
      looksLikeYearTitleReferenceContinuation(text)
    ) {
      out[out.length - 1] = {
        ...last,
        type: "reference",
        original: `${lastText} ${text}`.replace(/\s+/g, " ").trim(),
        metadata: { ...(last.metadata ?? {}), role: "reference" },
      };
      continue;
    }
    out.push(block);
  }
  return out;
}

/** PDF footer / running head: a lone page index, not bibliography content. */
export function isStandalonePageNumberLine(text: string): boolean {
  return /^\d{1,3}$/.test(text.trim());
}

/**
 * Hide PDF page-marker artifacts in Reader / projection.
 * Covers body footnotes and older packages where Markdown dropped the
 * original "49" but ja.md / translation.json still carry the digit.
 */
export function isPageNumberArtifactBlock(
  original: string | null | undefined,
  translated: string | null | undefined = null
): boolean {
  const o = (original ?? "").trim();
  const t = (translated ?? "").trim();
  if (isStandalonePageNumberLine(o)) return true;
  // Markdown may have dropped the digit while translation still holds it.
  return !o && isStandalonePageNumberLine(t);
}

/**
 * Paragraph-shaped bibliography line (e.g. ACM `14. Author. 2007. …`).
 * Used when re-projecting older packages where some entries stayed `paragraph`.
 */
export function looksLikeBibliographyEntry(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isStandalonePageNumberLine(trimmed)) return false;
  if (looksLikeConferenceRunningHeader(trimmed)) return false;
  if (looksLikeYearTitleReferenceContinuation(trimmed)) return true;
  const key = referenceKeyFromText(trimmed);
  if (!key) return false;
  if (/\b(?:19|20)\d{2}[a-z]?\b/.test(trimmed)) return true;
  return trimmed.length >= 48 && /[A-Za-z]{3,}/.test(trimmed);
}

export function indexReferenceBlocks(
  blocks: PaperBlock[]
): Map<string, string> {
  const index = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (block.type !== "reference" && String(block.metadata?.role ?? "") !== "reference") {
      if (block.type !== "paragraph") continue;
    }
    const source = block.original || "";
    const key = referenceKeyFromText(source);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const target =
      typeof block.metadata.referenceId === "string" && block.metadata.referenceId
        ? block.metadata.referenceId
        : block.id;
    if (!index.has(key)) index.set(key, target);
  }
  for (const [key, count] of counts) {
    if (count !== 1) index.delete(key);
  }
  return index;
}

export function uniqueCitationTarget(
  keys: string[],
  index: Map<string, string>
): string | null {
  if (keys.length !== 1) return null;
  return index.get(keys[0]) ?? null;
}

export type ReferenceLink = {
  start: number;
  end: number;
  href: string;
};

const URL_RE = /https?:\/\/[^\s<>"'）)]+/gi;
const DOI_RE = /\b(?:doi:\s*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi;

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/g, "");
}

export function normalizeReferenceHref(raw: string): string | null {
  const trimmed = stripTrailingPunctuation(raw.trim());
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const doi = trimmed.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];
  if (doi) return `https://doi.org/${stripTrailingPunctuation(doi)}`;
  return null;
}

export function parseReferenceLinks(text: string): ReferenceLink[] {
  const covered: Array<{ start: number; end: number }> = [];
  const links: ReferenceLink[] = [];

  const overlaps = (start: number, end: number) =>
    covered.some((span) => start < span.end && end > span.start);

  const add = (start: number, end: number, raw: string) => {
    const href = normalizeReferenceHref(raw);
    if (!href || overlaps(start, end)) return;
    covered.push({ start, end });
    links.push({ start, end, href });
  };

  const urlRe = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    const raw = stripTrailingPunctuation(match[0]);
    add(match.index, match.index + raw.length, raw);
  }

  const doiRe = new RegExp(DOI_RE.source, "gi");
  while ((match = doiRe.exec(text)) !== null) {
    const raw = stripTrailingPunctuation(match[0]);
    add(match.index, match.index + raw.length, raw);
  }

  return links.sort((a, b) => a.start - b.start);
}
