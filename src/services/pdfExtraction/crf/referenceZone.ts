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
      fontSize: ordered.reduce((s, it) => s + it.fontSize, 0) / ordered.length,
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
  const crosses = (it: Item) => it.x < gutter - 1 && it.x + it.width > gutter + 1;
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
  const repeated = (l: Line) => (seen.get(normalise(l.text))?.size ?? 0) >= 3 || /^\s*\d{1,4}\s*$/.test(l.text);
  const all = perPage.flat().filter((l) => !repeated(l));
  let start = -1;
  all.forEach((l, i) => {
    if (isHeading(l.text)) start = i;
  });
  if (start < 0 || start === all.length - 1) return null;
  const zone = trimZone(all.slice(start + 1));
  if (zone.length) zone[0] = { ...zone[0], blockStart: true };
  return zone;
}

const AFTER_REFERENCES = /^(?:[A-Z]\.?\s+)?(?:appendix|appendices|supplementary (?:material|information|materials)|supporting information|publisher.?s note|author biograph|about the authors?)\b/i;

/**
 * The zone proper: it ends at an appendix-type heading, and lines set in a
 * font other than the reference text (tables, captions, figure labels, an
 * appendix in body type) are left out. The reference font is the median of
 * the early lines that carry a year.
 */
export function trimZone<T extends { text: string; fontSize: number }>(lines: T[]): T[] {
  // Lines with a year are almost always reference text, even when a table follows the heading.
  const withYear = lines.slice(0, 200).filter((l) => /\b(?:19|20)\d{2}\b/.test(l.text));
  const sample = (withYear.length >= 3 ? withYear : lines.slice(0, 40)).map((l) => l.fontSize).sort((a, b) => a - b);
  const refFont = sample[sample.length >> 1] ?? 0;
  let end = lines.length;
  for (let i = 2; i < lines.length; i += 1) {
    if (lines[i].text.length <= 80 && AFTER_REFERENCES.test(lines[i].text)) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).filter((l) => Math.abs(l.fontSize - refFont) <= refFont * 0.05);
}
