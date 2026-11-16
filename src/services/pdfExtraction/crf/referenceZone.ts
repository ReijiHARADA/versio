/**
 * Locate the references zone directly on the page text (what GROBID's
 * segmentation model does), so a missed heading or text dropped by the
 * projection cannot truncate the bibliography.
 *
 * Pages are cut into horizontal bands at lines that cross the column gutter;
 * inside a band the left column is read before the right one. Lines repeated
 * on several pages (running headers/footers) are dropped. The zone starts after
 * the last references heading line and runs to the end of the document; the
 * caller trims an appended appendix with `referencesEnd`.
 */
import type { ExtractedPage } from "../../pdfService";
import { joinItems, REFERENCES_TITLE } from "./referenceLines";
import type { RefLine } from "./segmentReferences";

type Item = ExtractedPage["textItems"][number];
type Line = RefLine & { page: number; y: number; height: number };

/** x of the column gutter, or null for a single-column page. */
function findGutter(items: Item[], width: number): number | null {
  const chars = (xs: Item[]) => xs.reduce((n, it) => n + it.text.length, 0);
  const total = chars(items);
  if (total < 200) return null;
  let best: { x: number; crossing: number } | null = null;
  for (let x = width * 0.3; x <= width * 0.7; x += 2) {
    const crossing = chars(items.filter((it) => it.x < x - 1 && it.x + it.width > x + 1));
    const left = chars(items.filter((it) => it.x + it.width <= x + 1));
    if (left < total * 0.2 || total - left - crossing < total * 0.2) continue;
    if (!best || crossing < best.crossing) best = { x, crossing };
  }
  return best && best.crossing <= total * 0.12 ? best.x : null;
}

function baselineGroups(items: Item[]): Item[][] {
  const groups: Item[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const group = groups.find((g) => Math.abs(g[0].y - item.y) <= Math.max(2, item.fontSize * 0.35));
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups.sort((a, b) => a[0].y - b[0].y);
}

function toLines(groups: Item[][], page: number): Line[] {
  const pitches = groups.slice(1).map((g, i) => g[0].y - groups[i][0].y).sort((a, b) => a - b);
  const medianPitch = pitches.length ? pitches[pitches.length >> 1] : Infinity;
  return groups.map((group, i) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    const x = ordered[0].x;
    const y = Math.min(...ordered.map((it) => it.y));
    return {
      text: joinItems(ordered),
      x,
      width: Math.max(...ordered.map((it) => it.x + it.width)) - x,
      // Weighted by characters, so a bold label or a superscript barely moves the line's size.
      fontSize: ordered.reduce((s, it) => s + it.fontSize * it.text.length, 0) / Math.max(1, ordered.reduce((n, it) => n + it.text.length, 0)),
      blockStart: i === 0 || group[0].y - groups[i - 1][0].y > medianPitch * 1.35,
      page,
      y,
      height: Math.max(...ordered.map((it) => it.y + it.height)) - y,
    };
  });
}

/** All text lines of one page in reading order (bands top to bottom, columns left to right). */
export function pageLines(page: ExtractedPage): Line[] {
  const items = page.textItems.filter((it) => it.text.trim() && !it.rotation);
  const gutter = findGutter(items, page.width);
  if (gutter === null) return toLines(baselineGroups(items), page.pageNumber);
  // Only text that clearly runs across the gutter (a full-width title or caption) splits the page into bands;
  // a column line that just touches the gutter does not.
  const crosses = (it: Item) => it.x < gutter - 20 && it.x + it.width > gutter + 20;
  const out: Line[] = [];
  let band: Item[] = [];
  const flush = () => {
    out.push(...toLines(baselineGroups(band.filter((it) => it.x + it.width / 2 < gutter)), page.pageNumber));
    out.push(...toLines(baselineGroups(band.filter((it) => it.x + it.width / 2 >= gutter)), page.pageNumber));
    band = [];
  };
  for (const group of baselineGroups(items)) {
    if (group.some(crosses)) {
      flush();
      out.push(...toLines([group], page.pageNumber));
    } else band.push(...group);
  }
  flush();
  return out;
}

const normalise = (s: string) => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
const isHeading = (text: string) => REFERENCES_TITLE.test(text.replace(/^[\s\dIVXivx.\-–:)]+/, "").trim());

const cache = new WeakMap<ExtractedPage[], Line[] | null>();

/** Reference-zone lines, or null when no references heading line exists on the pages. */
export function referenceZoneLines(pages: ExtractedPage[]): Line[] | null {
  if (!cache.has(pages)) cache.set(pages, computeZone(pages));
  return cache.get(pages) ?? null;
}

function computeZone(pages: ExtractedPage[]): Line[] | null {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const perPage = ordered.map(pageLines);
  // Running headers / footers: the same text (digits ignored) on 3+ pages.
  const seen = new Map<string, Set<number>>();
  perPage.forEach((lines, p) => lines.forEach((l) => {
    const key = normalise(l.text);
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(p);
  }));
  // Only in the page margins: "arXiv:1908.10063." repeats with digits masked, but inside the text.
  const repeated = (l: Line, height: number) =>
    (l.y < height * 0.08 || l.y + l.height > height * 0.92) && ((seen.get(normalise(l.text))?.size ?? 0) >= 3 || /^\s*\d{1,4}\s*$/.test(l.text));
  const all = perPage.flatMap((lines, p) => lines.filter((l) => !repeated(l, ordered[p].height)));
  let start = -1;
  all.forEach((l, i) => {
    if (isHeading(l.text)) start = i + 1;
  });
  // No heading text (drawn as an image or with unmapped glyphs): a "[1]" entry followed by [2] and [3].
  if (start < 0) {
    const first = all.findIndex((l, i) => /^\[1\]\s/.test(l.text) && ["[2]", "[3]"].every((label) => all.slice(i + 1, i + 80).some((m) => m.text.startsWith(label))));
    if (first >= 0) start = first;
  }
  if (start < 0 || start >= all.length) return null;
  const zone = trimZone(all.slice(start));
  if (zone.length) zone[0] = { ...zone[0], blockStart: true };
  return zone;
}

const AFTER_REFERENCES = /^(?:[A-Z]\.?\s+)?(?:appendix|appendices|supplementary (?:material|information|materials)|supporting information|publisher.?s note|author biograph|about the authors?)\b/i;

/**
 * The zone proper: it ends at an appendix-type or numbered section heading, and lines set in a
 * font other than the reference text (tables, captions, figure labels, an
 * appendix in body type) are left out. The reference font is the median of
 * the early lines that carry a year.
 */
export function trimZone<T extends { text: string; fontSize: number }>(lines: T[]): T[] {
  // Lines with a year are almost always reference text, even when a table follows the heading.
  const withYear = lines.slice(0, 200).filter((l) => /\b(?:19|20)\d{2}\b/.test(l.text));
  const sample = (withYear.length >= 3 ? withYear : lines.slice(0, 40)).map((l) => l.fontSize).sort((a, b) => a - b);
  const refFont = sample[sample.length >> 1] ?? 0;
  const sameFont = (l: { fontSize: number }) => Math.abs(l.fontSize - refFont) <= refFont * 0.05;
  const hasYear = (l: { text: string }) => /\b(?:19|20)\d{2}\b/.test(l.text);
  // Back matter can sit between two parts of the list (Frontiers: notes in the right column,
  // references continuing on the next page): a heading ends the zone only when no reference
  // text follows it.
  // Entry openings in the list's own style ("[3] ", "12. Smith", "Adaimi, R."), so neither prose
  // that cites a year nor a numbered list in an author-year paper's appendix counts.
  const STYLES = [/^\[\d+\]/, /^\d{1,3}\.\s+\p{Lu}/u, /^\p{Lu}[\p{L}'’-]+,\s+\p{Lu}/u];
  const opening = lines.slice(0, 40);
  const style = STYLES.map((re) => ({ re, n: opening.filter((l) => re.test(l.text)).length })).sort((a, b) => b.n - a.n)[0];
  const referencesFollow = (i: number) => style.n >= 3 && lines.slice(i + 1, i + 41).filter((l) => sameFont(l) && style.re.test(l.text)).length >= 3;
  let end = lines.length;
  for (let i = 2; i < lines.length; i += 1) {
    const { text, fontSize } = lines[i];
    // An appendix-type heading, or a numbered section heading ("A Tool Module", "B.2 Setup", "7 Proofs")
    // set larger than the references. Captions do not start with a section number, and a numbered
    // reference ("1. Smith J, ... 2020") carries a comma or a year.
    const numberedHeading =
      fontSize >= refFont * 1.1 && /^(?:[A-Z]|\d{1,2})(?:\.\d+)*\.?\s+\p{Lu}/u.test(text) && !/,/.test(text) && !hasYear(lines[i]);
    // ICLR-style appendix headings are set in capitals at the reference size ("A ETHICAL STATEMENT").
    const capsHeading = /^[A-Z](?:\.\d+)*\.?\s+[A-Z][A-Z0-9\s:&,()-]{3,}$/.test(text);
    if (text.length <= 80 && (AFTER_REFERENCES.test(text) || numberedHeading || capsHeading) && !referencesFollow(i)) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).filter(sameFont);
}
