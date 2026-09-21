/**
 * PDF reading-order reconstruction.
 *
 * ACM-style 2-column pages are read:
 *   left column top → bottom, then right column top → bottom.
 * Items are never sorted by Y across columns (that interleaves
 * left and right lines into nonsense sentences).
 */

import type { BoundingBox } from "../types/paper";
import type { ExtractedPage, ExtractedTextItem } from "./pdfService";
import {
  isReferencesHeading,
  looksLikeSubjectClassification,
  toHalfwidthAscii,
} from "./translation/quality";

export type LayoutColumn = "left" | "right" | "spanning" | "single";

export type LayoutRole =
  | "header"
  | "footer"
  | "title"
  | "author"
  | "affiliation"
  | "heading"
  | "paragraph"
  | "figure_caption"
  | "table_caption"
  | "equation"
  | "footnote"
  | "copyright";

export type PageColumnLayout = {
  page: number;
  pageWidth: number;
  pageHeight: number;
  isMultiColumn: boolean;
  gutterX: number;
  leftX: number;
  rightX: number;
};

export type LayoutLine = {
  text: string;
  items: ExtractedTextItem[];
  page: number;
  column: LayoutColumn;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bbox: BoundingBox;
  rotation?: number;
  pageHeight?: number;
  pageWidth?: number;
  roleHint?: LayoutRole;
};

export type LayoutBlock = {
  role: LayoutRole;
  text: string;
  lines: LayoutLine[];
  pageStart: number;
  pageEnd: number;
  column: LayoutColumn;
  bbox: BoundingBox;
  rotation?: number;
  /** Set when geometry already proved this block crossed native columns. */
  preserveColumnContinuation?: boolean;
};

function lineUsesBoldFace(line: LayoutLine): boolean {
  return line.items.some((item) => /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(item.fontName));
}

const HEADER_Y = 48;
const FOOTER_MARGIN = 38;
const MIN_COLUMN_ITEMS = 8;
const SPAN_WIDTH_RATIO = 0.48;
// A native line can be slightly wider than its visual column because PDF
// text matrices include trailing advance width. Keep the spanning cutoff
// above ordinary column width while retaining the stricter detector sample.
const ASSIGN_SPAN_WIDTH_RATIO = 0.55;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function normalizedTextRotation(rotation: number | undefined): number {
  const normalized = ((rotation ?? 0) % 180 + 180) % 180;
  return normalized === 180 ? 0 : normalized;
}

function rotationDistance(a: number | undefined, b: number | undefined): number {
  const difference = Math.abs(normalizedTextRotation(a) - normalizedTextRotation(b));
  return Math.min(difference, 180 - difference);
}

function representativeTextRotation(rotations: number[]): number {
  const candidates = rotations.map(normalizedTextRotation);
  return candidates.reduce((best, candidate) =>
    candidates.reduce((sum, value) => sum + rotationDistance(candidate, value), 0) <
    candidates.reduce((sum, value) => sum + rotationDistance(best, value), 0)
      ? candidate
      : best
  );
}

function sameTextOrientation(a: number | undefined, b: number | undefined): boolean {
  // PDF.js can emit small per-span angle differences on one slanted line, but
  // labels on different spokes of a radial figure are separate text objects.
  return rotationDistance(a, b) <= 3;
}

function rotatedTextInterval(item: ExtractedTextItem, rotation: number): [number, number] {
  const radians = normalizedTextRotation(rotation) * Math.PI / 180;
  const start = item.x * Math.cos(radians) + item.y * Math.sin(radians);
  const end = start + item.width;
  return [Math.min(start, end), Math.max(start, end)];
}

function rotatedTextOverlaps(a: ExtractedTextItem, b: ExtractedTextItem): boolean {
  if (!sameTextOrientation(a.rotation, b.rotation) || Math.abs(normalizedTextRotation(a.rotation)) < 45) return false;
  const originDistance = Math.hypot(a.x - b.x, a.y - b.y);
  if (originDistance > Math.max(2, Math.min(a.fontSize, b.fontSize) * 1.5)) return false;
  const [aStart, aEnd] = rotatedTextInterval(a, a.rotation ?? 0);
  const [bStart, bEnd] = rotatedTextInterval(b, a.rotation ?? 0);
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  return overlap > Math.max(1, Math.min(a.width, b.width) * 0.15);
}

function unionBbox(items: ExtractedTextItem[], page: number): BoundingBox {
  const x = Math.min(...items.map((i) => i.x));
  const y = Math.min(...items.map((i) => i.y));
  const right = Math.max(...items.map((i) => i.x + i.width));
  const bottom = Math.max(...items.map((i) => i.y + i.height));
  return {
    page,
    x,
    y,
    width: right - x,
    height: Math.max(1, bottom - y),
  };
}

function blockBbox(lines: LayoutLine[]): BoundingBox {
  const boxes = lines.map((l) => l.bbox);
  const page = boxes[0]?.page ?? 1;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { page, x, y, width: right - x, height: Math.max(1, bottom - y) };
}

export function detectPageColumns(page: ExtractedPage): PageColumnLayout {
  const usable = page.textItems.filter((item) => {
    const inHeader = item.y < HEADER_Y;
    const inFooter = item.y > page.height - FOOTER_MARGIN;
    return !inHeader && !inFooter;
  });

  const fallback: PageColumnLayout = {
    page: page.pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    isMultiColumn: false,
    gutterX: page.width / 2,
    leftX: 0,
    rightX: page.width / 2,
  };

  const longLines = usable.filter(
    (item) =>
      item.width >= page.width * 0.25 && item.width <= page.width * 0.55
  );
  const sample =
    longLines.length >= 8
      ? longLines
      : usable.filter((item) => item.width < page.width * SPAN_WIDTH_RATIO);

  // Sparse pages with large figures may contain only a few body lines, too
  // few for the document-wide peak thresholds below. Three repeated pairs of
  // column-width text items on aligned baselines are still strong geometric
  // evidence of two columns, even when captions and figures dominate the
  // page. Requiring stable left/right x origins keeps ordinary label/body
  // rows from triggering the profile.
  const alignedColumnPairs = (() => {
    const candidates = usable.filter((item) =>
      item.width >= page.width * 0.22 && item.width <= page.width * 0.55 &&
      Math.abs(item.rotation ?? 0) < 45
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: ExtractedTextItem[][] = [];
    for (const item of candidates) {
      let row = rows.find((group) => Math.abs(group[0].y - item.y) <= Math.max(3, item.fontSize * 0.42));
      if (!row) rows.push(row = []);
      row.push(item);
    }
    const pairs = rows.flatMap((row) => {
      const pair = row.sort((a, b) => a.x - b.x).find((left, index, sorted) =>
        sorted.slice(index + 1).some((right) =>
          right.x >= left.x + left.width - 2 && right.x - left.x >= page.width * 0.35
        )
      );
      if (!pair) return [];
      const right = row.filter((item) => item !== pair && item.x > pair.x)
        .find((item) => item.x >= pair.x + pair.width - 2 && item.x - pair.x >= page.width * 0.35);
      // Table rows also produce repeated aligned cells. A page-column pair
      // should begin in the left body band and put the second column near the
      // center gutter; pairs wholly inside a centered table are not evidence
      // of a page-wide two-column layout.
      return right && pair.x <= page.width * 0.27 && right.x >= page.width * 0.38 && right.x <= page.width * 0.68
        ? [{ leftX: pair.x, rightX: right.x }]
        : [];
    });
    const seed = pairs.find((candidate) => pairs.filter((pair) =>
      Math.abs(pair.leftX - candidate.leftX) <= Math.max(18, page.width * 0.04) &&
      Math.abs(pair.rightX - candidate.rightX) <= Math.max(18, page.width * 0.04)
    ).length >= 3);
    if (!seed) return null;
    const matching = pairs.filter((pair) =>
      Math.abs(pair.leftX - seed.leftX) <= Math.max(18, page.width * 0.04) &&
      Math.abs(pair.rightX - seed.rightX) <= Math.max(18, page.width * 0.04)
    );
    return {
      leftX: median(matching.map((pair) => pair.leftX)),
      rightX: median(matching.map((pair) => pair.rightX)),
    };
  })();

  if (sample.length < MIN_COLUMN_ITEMS * 2) {
    if (!alignedColumnPairs) return fallback;
  }

  const peaks = alignedColumnPairs
    ? [alignedColumnPairs.leftX, alignedColumnPairs.rightX] as [number, number]
    : findTwoXPeaks(sample.map((item) => item.x), page.width * 0.18);
  if (!peaks) {
    return fallback;
  }

  const [leftX, rightX] = peaks;
  const leftItems = sample.filter(
    (i) => Math.abs(i.x - leftX) <= Math.abs(i.x - rightX)
  );
  const rightItems = sample.filter(
    (i) => Math.abs(i.x - leftX) > Math.abs(i.x - rightX)
  );
  const leftShare = leftItems.length / sample.length;
  const rightShare = rightItems.length / sample.length;
  const leftLong = leftItems.filter(
    (i) => i.width >= page.width * 0.22 && i.width <= page.width * 0.55
  );
  const rightLong = rightItems.filter(
    (i) => i.width >= page.width * 0.22 && i.width <= page.width * 0.55
  );
  const denseWordColumns =
    leftItems.length >= 250 &&
    rightItems.length >= 250 &&
    rightX - leftX >= page.width * 0.35;
  const denseUsableColumns =
    usable.length >= 700 &&
    usable.filter((item) => item.x + item.width <= page.width * 0.49).length >= 250 &&
    usable.filter((item) => item.x >= page.width * 0.51).length >= 250 &&
    rightX - leftX >= page.width * 0.35;
  const isMultiColumn = alignedColumnPairs
    ? rightX - leftX >= page.width * 0.22 && leftShare >= 0.22 && rightShare >= 0.22
    : leftItems.length >= MIN_COLUMN_ITEMS &&
      rightItems.length >= MIN_COLUMN_ITEMS &&
      (leftLong.length >= MIN_COLUMN_ITEMS &&
        rightLong.length >= MIN_COLUMN_ITEMS ||
        (denseWordColumns || denseUsableColumns)) &&
      rightX - leftX >= page.width * 0.22 &&
      leftShare >= 0.22 &&
      rightShare >= 0.22 &&
      leftShare <= 0.78 &&
      rightShare <= 0.78;

  if (!isMultiColumn) {
    return fallback;
  }

  const colWidth =
    median(longLines.map((item) => item.width)) || (rightX - leftX) * 0.8;
  const gutterX = (leftX + colWidth + rightX) / 2;

  return {
    page: page.pageNumber,
    pageWidth: page.width,
    pageHeight: page.height,
    isMultiColumn: true,
    gutterX,
    leftX,
    rightX,
  };
}

function findTwoXPeaks(
  xs: number[],
  minSeparation: number
): [number, number] | null {
  const binSize = 8;
  const bins = new Map<number, number>();
  for (const x of xs) {
    const bin = Math.round(x / binSize) * binSize;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const first = ranked[0];
  const second = ranked.find((peak) => Math.abs(peak[0] - first[0]) >= minSeparation);
  if (!second || second[1] < Math.max(4, first[1] * 0.2)) return null;
  const left = Math.min(first[0], second[0]);
  const right = Math.max(first[0], second[0]);
  return [left, right];
}

function assignColumn(
  item: ExtractedTextItem,
  layout: PageColumnLayout
): LayoutColumn {
  if (!layout.isMultiColumn) return "single";

  if (item.width > layout.pageWidth * ASSIGN_SPAN_WIDTH_RATIO) return "spanning";
  if (
    item.width > layout.pageWidth * 0.4 &&
    item.x < layout.gutterX - 20 &&
    item.x + item.width > layout.rightX + 20
  ) {
    return "spanning";
  }

  return item.x + item.width / 2 < layout.gutterX ? "left" : "right";
}

function joinItemTexts(items: ExtractedTextItem[]): string {
  // PDF text layers occasionally duplicate an entire span at nearly the same
  // coordinates (an invisible accessibility layer over visible text). Drop
  // only near-coincident, text-identical spans; repeated values in tables or
  // separate columns remain untouched.
  const uniqueItems = items.filter((item, index, all) => {
    const normalized = item.text.replace(/\s+/g, " ").trim();
    return !all.slice(0, index).some((previous) =>
      previous.text.replace(/\s+/g, " ").trim() === normalized &&
      Math.abs(previous.x - item.x) <= Math.max(2, item.width * 0.08) &&
      Math.abs(previous.y - item.y) <= Math.max(2, item.height * 0.8)
    );
  });
  const rotation = median(items.map((item) => item.rotation ?? 0));
  const sorted = [...uniqueItems].sort((a, b) => {
    if (Math.abs(rotation) >= 45) {
      // Rotate coordinates back onto the native text baseline before joining.
      const aPos = rotation > 0 ? -a.y : a.y;
      const bPos = rotation > 0 ? -b.y : b.y;
      return aPos - bPos || a.x - b.x;
    }
    return a.x - b.x || a.y - b.y;
  });
  if (sorted.length === 0) return "";

  let out = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.x - (prev.x + prev.width);
    const spaceThreshold = Math.max(1.1, prev.fontSize * 0.14);
    const needsSpace =
      gap > spaceThreshold && !/\s$/.test(out) && !/^\s/.test(cur.text);
    if (needsSpace) out += " ";
    out += cur.text;
  }
  return out.replace(/\s+/g, " ").trim();
}

function itemsToLine(
  items: ExtractedTextItem[],
  column: LayoutColumn,
  page: number,
  pageHeight?: number,
  pageWidth?: number,
): LayoutLine {
  const bbox = unionBbox(items, page);
  const fontSize =
    items.reduce((sum, i) => sum + i.fontSize, 0) / items.length;
  const bodyItems = items.filter((i) => i.fontSize >= fontSize * 0.82);
  const ySource = bodyItems.length > 0 ? bodyItems : items;
  return {
    text: joinItemTexts(items),
    items,
    page,
    column,
    x: bbox.x,
    y: median(ySource.map((i) => i.y)),
    width: bbox.width,
    height: bbox.height,
    fontSize,
    bbox,
    pageHeight,
    pageWidth,
    rotation: representativeTextRotation(items.map((item) => item.rotation ?? 0)),
  };
}

function clusterItemsIntoLines(
  items: ExtractedTextItem[],
  column: LayoutColumn,
  pageNumber: number,
  pageHeight?: number,
  pageWidth?: number,
): LayoutLine[] {
  if (items.length === 0) return [];

  const fontBase = median(items.map((i) => i.fontSize)) || 10;
  const yThreshold = Math.max(3.2, fontBase * 0.42);
  const sidebarBands = (() => {
    const bands = new Map<number, ExtractedTextItem[]>();
    for (const item of items) {
      const key = Math.round(item.x / 32) * 32;
      const band = bands.get(key);
      if (band) band.push(item);
      else bands.set(key, [item]);
    }
    const candidates = [...bands.entries()].sort((a, b) => a[0] - b[0]);
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
      const [leftX, leftItems] = candidates[leftIndex];
      const leftWidth = median(leftItems.map((item) => item.width));
      if (leftItems.length < 2 || leftWidth <= 0 || leftWidth > 140) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
        const [rightX, rightItems] = candidates[rightIndex];
        const rightWidth = median(rightItems.map((item) => item.width));
        if (rightItems.length >= 3 && rightX - leftX >= 80 &&
            rightWidth >= Math.max(fontBase * 10, leftWidth * 2.5)) {
          return { leftX, rightX };
        }
      }
    }
    return null;
  })();
  const sidebarSide = (item: ExtractedTextItem): "left" | "right" | null => {
    if (!sidebarBands) return null;
    const key = Math.round(item.x / 32) * 32;
    if (key === sidebarBands.leftX) return "left";
    if (key === sidebarBands.rightX) return "right";
    return null;
  };
  const bodyItems = items.filter((i) => i.fontSize >= fontBase * 0.82);
  const superItems = items.filter((i) => i.fontSize < fontBase * 0.82);
  const primary = bodyItems.length > 0 ? bodyItems : items;

  const sorted = [...primary].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: ExtractedTextItem[][] = [];
  const groupY: number[] = [];

  for (const item of sorted) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const groupRotation = representativeTextRotation(groups[i].map((groupItem) => groupItem.rotation ?? 0));
      const itemRotation = normalizedTextRotation(item.rotation);
      if (!sameTextOrientation(groupRotation, itemRotation)) continue;
      const itemSide = sidebarSide(item);
      if (itemSide && groups[i].some((groupItem) => {
        const groupSide = sidebarSide(groupItem);
        return groupSide !== null && groupSide !== itemSide;
      })) continue;
      const minX = Math.min(...groups[i].map((g) => g.x));
      const maxX = Math.max(...groups[i].map((g) => g.x + g.width));
      const detachedMarginAnnotation =
        item.width < 140 &&
        maxX - minX > 220 &&
        item.x + item.width < minX - Math.max(36, fontBase * 4);
      const existingGroupWidth = maxX - minX;
      const groupFont = median(groups[i].map((groupItem) => groupItem.fontSize));
      // A small left publication rail (dates, received/accepted labels, etc.)
      // can land on the same baseline as the first body word. A large gap and
      // font jump are enough to keep it separate even when PDF.js emits body
      // words as individual narrow spans. This is symmetric with
      // detachedMarginAnnotation above and uses geometry/style rather than
      // publisher wording.
      const detachedLeadingMarginAnnotation =
        existingGroupWidth < 150 &&
        item.x - maxX > Math.max(36, fontBase * 4) &&
        groupFont <= item.fontSize * 0.84;
      const dist = Math.abs(item.y - groupY[i]);
      const overlappingRotatedLabel = groups[i].some((groupItem) => rotatedTextOverlaps(groupItem, item));
      // A narrow publication/date annotation can share a baseline with a
      // full-width body line in publisher PDFs. It is a separate marginal
      // element, not a prefix of that prose. Keep this geometric rule narrow
      // so ordinary words and table cells remain in their native line.
      if (!detachedMarginAnnotation && !detachedLeadingMarginAnnotation && !overlappingRotatedLabel && dist <= yThreshold && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best === -1) {
      groups.push([item]);
      groupY.push(item.y);
    } else {
      groups[best].push(item);
      groupY[best] = median(groups[best].map((groupItem) => groupItem.y));
    }
  }

  for (const item of superItems) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const groupRotation = representativeTextRotation(groups[i].map((groupItem) => groupItem.rotation ?? 0));
      if (!sameTextOrientation(groupRotation, item.rotation)) continue;
      const minX = Math.min(...groups[i].map((g) => g.x));
      const maxX = Math.max(...groups[i].map((g) => g.x + g.width));
      const xNear = item.x >= minX - 24 && item.x <= maxX + 24;
      const dist = Math.abs(item.y - groupY[i]);
      if (xNear && dist < fontBase * 0.95 && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best >= 0) {
      groups[best].push(item);
      groupY[best] = median(groups[best].map((groupItem) => groupItem.y));
    } else {
      groups.push([item]);
      groupY.push(item.y);
    }
  }

  const separatedGroups = groups.flatMap((group) => {
    // Rotated tables are sometimes emitted on the same baseline as a
    // horizontal footnote. Keep those native items as separate lines so the
    // table region cannot absorb the note. Only split when the rotated side
    // has several items and the unrotated side contains real prose.
    const rotated = group.filter((item) => Math.abs(item.rotation ?? 0) >= 45);
    const horizontal = group.filter((item) => Math.abs(item.rotation ?? 0) < 45);
    const horizontalText = horizontal.map((item) => item.text).join(" ").trim();
    const horizontalWords = horizontalText.split(/\s+/).filter(Boolean).length;
    // Short footnotes/notes can be only three words.  Accept those only when
    // they look like prose (a lowercase word or sentence punctuation); this
    // keeps compact numeric/header cells in the rotated grid.
    const shortHorizontalProse = horizontalWords >= 3 &&
      /[a-z]/.test(horizontalText) && /[.!?,:;]$/.test(horizontalText);
    if (rotated.length >= 4 && (horizontalWords >= 4 || shortHorizontalProse)) return [rotated, horizontal];
    // A rotated matrix and its explanatory footnote can share a baseline and
    // rotation.  Matrix cells are short native items; the footnote is a
    // sentence-sized item. Split only with several short rotated cells plus a
    // clearly prose-like rotated item, preserving both source texts.
    const rotatedCells = rotated.filter((item) => item.width <= 48 && item.text.trim().split(/\s+/).length <= 3);
    const rotatedProse = rotated.filter((item) => item.width > 80 || item.text.trim().split(/\s+/).length >= 4);
    if (rotatedCells.length >= 3 && rotated.length >= 4 && rotatedProse.length > 0) {
      return [rotatedCells, rotated.filter((item) => !rotatedCells.includes(item))];
    }
    return [group];
  });
  return separatedGroups
    .map((group) => itemsToLine(group, column, pageNumber, pageHeight, pageWidth))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.y - b.y);
}

/** Split a bold inline subsection label from the body text that follows it.
 * Some journal templates keep `Subjects.` / `Experimental Procedure.` and
 * the first sentence on one baseline.  Treating the whole line as prose
 * loses the structural label; splitting is allowed only for a short bold
 * prefix with a sentence-like non-bold suffix, preserving the native items.
 */
function splitInlineSubheading(line: LayoutLine): LayoutLine[] {
  if (Math.abs(line.rotation ?? 0) >= 45 || line.items.length < 2) return [line];
  const ordered = [...line.items].sort((a, b) => a.x - b.x);
  let prefixCount = 0;
  while (prefixCount < ordered.length && /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(ordered[prefixCount].fontName)) {
    prefixCount += 1;
  }
  if (prefixCount === ordered.length) return [line];
  const prefixItems = ordered.slice(0, prefixCount);
  const suffixItems = ordered.slice(prefixCount);
  const prefix = joinItemTexts(prefixItems).trim();
  const suffix = joinItemTexts(suffixItems).trim();
  if (prefixCount === 0) {
    const firstFont = ordered[0]?.fontName;
    const transition = ordered.findIndex((item, index) => index > 0 && item.fontName !== firstFont);
    if (transition > 0 && transition < ordered.length) {
      const bodyItems = ordered.slice(0, transition);
      const headingItems = ordered.slice(transition);
      const bodyText = joinItemTexts(bodyItems).trim();
      const headingText = joinItemTexts(headingItems).trim();
      const prefixWords = bodyText.split(/\s+/);
      const suffixWords = headingText.split(/\s+/);
      const shortLabel = prefixWords.length <= 3 && bodyText.length <= 36 &&
        prefixWords.every((word) => /^[A-Z][A-Za-z-]*$/.test(word));
      const gap = headingItems[0].x - (bodyItems.at(-1)!.x + bodyItems.at(-1)!.width);
      const sentenceLikeSuffix = suffixWords.length >= 8 &&
        /^[A-Z(]/.test(headingText) &&
        (/[.!?]["')\]]?$/.test(headingText) || /-$/.test(headingText) || suffixWords.length >= 10);
      const suffixFonts = new Set(headingItems.slice(0, Math.min(4, headingItems.length)).map((item) => item.fontName));
      if (shortLabel && gap >= Math.max(5, line.fontSize * 0.55) && sentenceLikeSuffix && suffixFonts.size === 1) {
        const make = (items: ExtractedTextItem[]): LayoutLine => itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth);
        return [{ ...make(bodyItems), roleHint: "heading" }, make(headingItems)];
      }
      if (bodyText.length >= 12 && headingText.length <= 120 &&
          headingText.split(/\s+/).length <= 14 &&
          /^\d{1,2}(?:\.\d{1,2}){1,3}\.\s*[A-Z]/.test(headingText)) {
        const make = (items: ExtractedTextItem[]): LayoutLine => itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth);
        return [make(bodyItems), make(headingItems)];
      }
    }
    return [line];
  }
  if (!/^[A-Z][A-Za-z\s-]{2,58}[.:]$/.test(prefix)) return [line];
  if (suffix.split(/\s+/).length < 5 || !/^[A-Z(]/.test(suffix)) return [line];
  const make = (items: ExtractedTextItem[]): LayoutLine => itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth);
  return [make(prefixItems), make(suffixItems)];
}

function isRepeatedHeaderFooter(text: string, patterns: Set<string>): boolean {
  return patterns.has(normalizeChromeKey(text));
}

function normalizeChromeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ");
}

function detectHeaderFooterPatterns(pages: ExtractedPage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const topBand = Math.max(HEADER_Y, page.height * 0.08);
    const bottomBand = Math.max(FOOTER_MARGIN, page.height * 0.07);
    const edge = page.textItems.filter(
      (i) => i.y < topBand || i.y > page.height - bottomBand
    );
    const seen = new Set<string>();
    for (const item of edge) {
      const key = normalizeChromeKey(item.text);
      if (key.length < 4 || key.length > 140) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const patterns = new Set<string>();
  const threshold = Math.max(2, Math.floor(pages.length * 0.28));
  for (const [text, count] of counts) {
    if (count >= threshold) patterns.add(text);
  }
  return patterns;
}

function isPublicationMetadata(text: string): boolean {
  const match = layoutPlain(text).match(
    /^(?:received|accepted|published(?:\s+online)?|available\s+online|online\s+publication)\s*:?\s*(.+)$/i
  );
  if (!match) return false;
  const tokens = match[1].toLowerCase().match(/[a-z]+|\d{1,4}/g) ?? [];
  return tokens.length > 0 && tokens.every((token) =>
    token === "x" || token === "xx" || token === "xxx" || token === "xxxx" ||
    /^\d{1,4}$/.test(token) ||
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/.test(token)
  );
}

function isEdgeChrome(
  line: LayoutLine,
  layout: PageColumnLayout,
  patterns: Set<string>
): boolean {
  if (isFootnoteLine(line, layout.pageHeight, line.fontSize)) return false;
  // A table/figure may legitimately start at the physical top of a page
  // (especially a continued table). Preserve an explicit caption label before
  // applying the generic header band rule; ordinary running headers do not
  // satisfy these caption predicates.
  if (isTableCaption(line.text) || isFigureCaption(line.text)) return false;
  const topBand = Math.max(HEADER_Y, layout.pageHeight * 0.08);
  if (line.y < topBand) {
    // Journal PDFs can begin the next page with the continuation of a body
    // paragraph.  A blanket top-band rule drops that line before paragraph
    // stitching (for example a lowercase continuation or a hyphenated word
    // wrap in a two-column article).  Preserve body-like column lines while
    // retaining the chrome rule for spanning/short running headers.
    const text = line.text.trim();
    const bodyContinuation =
      line.column !== "spanning" &&
      (/[a-z(]/.test(text[0] ?? "") || /-$/.test(text) ||
        (text.split(/\s+/).length >= 6 && line.width >= layout.pageWidth * 0.32));
    if (!bodyContinuation) return true;
  }
  if (line.y > layout.pageHeight - FOOTER_MARGIN) return true;
  if (/^\d{1,3}$/.test(line.text.trim())) return true;
  if (isPublicationMetadata(line.text)) return true;
  if (patterns.has(normalizeChromeKey(line.text))) return true;
  if (isRepeatedHeaderFooter(line.text, patterns)) return true;
  if (
    /^(proceedings of|conference on|extended abstracts|tei\s+[’']?\d{2,4}|chi\s+[’']?\d{2,4}|uist\s+[’']?\d{2,4}|iswc\s+[’']?\d{2,4}|dis\s+[’']?\d{2,4}|cscw|imwut|ubicomp)/i.test(
      line.text.trim()
    )
  ) {
    return true;
  }
  return false;
}

function layoutPlain(text: string): string {
  return toHalfwidthAscii(text).replace(/．/g, ".").trim();
}

export function displayHeadingText(text: string): string {
  const cleaned = layoutPlain(text).replace(
    /^\d{1,3}\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s+\S)/,
    ""
  );
  return cleaned || text.trim();
}

function cjkCount(text: string): number {
  return (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
}

export function isFigureCaption(text: string): boolean {
  const caption = layoutPlain(text);
  if (/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*(?:\s*[:.：–—-]|\s*$)/i.test(caption)) {
    return true;
  }
  // Older proceedings often use `Fig. 1, Caption title…` rather than a
  // colon or full stop. Treat only an uppercase title-like continuation as a
  // caption; a normal sentence such as `Figure 2, the body…` stays prose.
  return /^(?:[Ff]igure|[Ff]ig\.?)\s*\d+[a-z]?\s*,\s*(?!(?:the|a|an|this|that|these|those|we|our|it|they|in|on|for)\b)[A-Z]/.test(caption);
}

export function isTableCaption(text: string): boolean {
  const caption = layoutPlain(text);
  if (/^(?:tables?|表)\s*\d+[a-z]?\s*\(continued\)$/i.test(caption)) return true;
  if (/^(?:tables?|表)\s*(?:\d+[a-z]?|[ivxlcdm]+)(?:\s*[:.：–—-]|\s*$)/i.test(caption)) return true;
  // Journal captions frequently omit punctuation: `Table 5 Factor ...`.
  // Require a title-like continuation so ordinary prose such as `Table 1 is`
  // remains a paragraph.
  const continuation = caption.match(/^(?:tables?|表)\s*(?:\d+[a-z]?|[ivxlcdm]+)\s+(.+)$/i)?.[1] ?? "";
  // A numbered table mentioned in running prose commonly starts with a
  // finite verb (`Table 4 shows ...`). It is a paragraph reference, not the
  // caption that labels the region. Keep the check lexical and format-neutral
  // so it applies across publishers without paper-specific strings.
  if (/^(?:shows?|presents?|indicates?|reports?|lists?|summarizes?|gives?|contains?|illustrates?)\b/i.test(continuation)) {
    return false;
  }
  return /^[A-Z][A-Za-z]/.test(continuation);
}

function isCopyright(text: string, fontSize: number, baseFont: number): boolean {
  if (fontSize > baseFont * 0.92) return false;
  return /permission to make digital or hard copies/i.test(text) ||
    /copyright\s+\d{4}[^.]{0,100}\b(?:acm|ieee|springer|elsevier)\b/i.test(text);
}

function splitInlineDoi(line: LayoutLine): LayoutLine[] {
  const match = line.text.match(/\b(?:https?:\/\/)?(?:dx\.)?doi\.org\/\S+/i);
  if (!match || match.index === undefined) return [line];
  const end = match.index + match[0].length;
  const tail = line.text.slice(end).trim();
  if (tail.split(/\s+/).filter(Boolean).length < 3) return [line];
  const head = line.text.slice(0, end).trim();
  const ratio = Math.max(0.2, Math.min(0.8, head.length / line.text.length));
  return [
    { ...line, text: head, width: line.width * ratio },
    { ...line, text: tail, x: line.x + line.width * ratio, width: line.width * (1 - ratio) },
  ];
}

function isFootnoteLine(
  line: { text: string; y: number; fontSize: number },
  pageHeight: number,
  baseFont: number
): boolean {
  const t = layoutPlain(line.text);
  if (!t) return false;
  if (line.fontSize > baseFont * 0.9 && line.fontSize > 9.2) return false;
  if (line.y < pageHeight * 0.7) return false;
  // Measurement/statistical lines can begin with a number but are body prose,
  // not footnotes (for example `180 bpm` or `94.25±4.63%`).
  if (/^\d{3,}(?:\b|[.,])/.test(t) || /^\d{1,3}[.,]\d/.test(t)) return false;
  // Native PDF text occasionally joins the superscript marker to the first
  // word (`1Please …`). Geometry and small type still identify it as a
  // footnote; requiring extracted whitespace would leak it into body prose.
  if (!/^(?:\*|†|‡|§|\d{1,2}|\[\d+\])\s*\S/.test(t)) return false;
  const afterMark = t.replace(/^(?:\*|†|‡|§|\d{1,2}|\[\d+\])\s*/, "");
  if (looksLikeSectionNumberedHeading(t) || looksLikeSectionNumberedHeading(afterMark)) {
    return false;
  }
  if (NAMED_HEADINGS.some((re) => re.test(afterMark))) return false;
  return true;
}

const BODY_START_HEADING =
  /^(?:(?:\d+\.)\s*)?(abstract|introduction|author keywords?|ccs concepts|index terms|keywords|はじめに|序論|序言|まえがき)\s*$/i;

function isBodyStartHeading(text: string): boolean {
  const t = layoutPlain(text);
  if (BODY_START_HEADING.test(t)) return true;
  return looksLikeSectionNumberedHeading(t);
}

export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/https?:\/\//i.test(t)) return true;
  if (/\bdoi:\s*10\./i.test(t) || /\bdoi\.org\b/i.test(t)) return true;
  if (/[?&][a-z_][a-z0-9_]*=/i.test(t)) return true;
  if (/\.(?:pdf|html?|aspx?)\b/i.test(t) && /[/=?&]/.test(t)) return true;
  return false;
}

const MATH_SYMBOLS = /[=+×÷∑∫√∞≈≠≤≥±∂∇]/g;
const FUNCTION_WORD =
  /^(the|a|an|of|and|or|to|in|on|for|from|with|when|that|this|is|as|by|into|account|not|yet|been|than|its|their)$/i;

/**
 * Displayed equations, not hyphenated English or bibliography URLs.
 * ASCII "-" is a word hyphen far more often than a minus sign.
 */
export function isEquationLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 140) return false;
  if (isFigureCaption(t) || isTableCaption(t)) return false;
  if (looksLikeUrl(t) || looksLikeEmail(t)) return false;
  if (/^(abstract|introduction|references|acknowledgements?)\b/i.test(t)) {
    return false;
  }

  const mathSymbols = t.match(MATH_SYMBOLS)?.length ?? 0;
  const minusOps =
    t.match(
      /(?:[A-Za-z0-9]\s+[−-]\s+[A-Za-z0-9]|[^\w]\s*−\s*[^\w])/g
    )?.length ?? 0;
  const greek = t.match(/[α-ωΑ-Ω](?![a-z])/g)?.length ?? 0;
  const math = mathSymbols + minusOps + greek;
  const hasEqNumber = /\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(t);

  if (math === 0 && !hasEqNumber) return false;

  const tokens = t.split(/\s+/);
  const functionWords = tokens.filter((w) =>
    FUNCTION_WORD.test(w.replace(/[^A-Za-z]/g, ""))
  ).length;
  if (functionWords >= 3) return false;

  // Statistical results are ordinary prose surprisingly often.  Geometry is
  // considered later by the evidence generator, but a sentence that contains
  // a statistic must never be made atomic as a displayed equation here.
  const proseWords = tokens.filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  const statisticalResult = /(?:\b[ntz]\s*=|[χΧxX²]\s*\(|\b[FPt]\s*\(|\bp\s*[<=>]|\b(?:AVE|CR|SE|RMSE|MAE|MPE|MAPE)\s*=)/i.test(t);
  if (statisticalResult && (proseWords >= 3 || /[,.;:]/.test(t))) return false;
  // Numeric measurement lists are often set as ordinary prose clauses, e.g.
  // `(2.53±0.37), sound complexity (2.32±0.29), and emotional levels ...`.
  // Treating these as equations detaches them from the unfinished paragraph
  // before them and lets a translator invent a grammatical claim from the
  // fragment. A multiword, comma-delimited expression is prose evidence unless
  // an explicit equation number anchors a displayed formula.
  const measurementListProse = !hasEqNumber && /\d/.test(t) && /[±%°]/.test(t) &&
    proseWords >= 2 && /(?:[,;]|\band\b)/i.test(t) && !/[=<>]/.test(t);
  if ((!hasEqNumber && proseWords >= 3 && /[,;]/.test(t) && /\d/.test(t)) || measurementListProse) return false;
  // Unit-bearing prose often contains a single minus sign or Greek symbol
  // while remaining an ordinary sentence fragment. A displayed equation is
  // normally symbol-dense and short; six or more prose words is a strong
  // negative signal unless an explicit equation number anchors the line.
  if (!hasEqNumber && proseWords >= 6) return false;
  // Very short operator-separated labels are commonly diagram annotations
  // (for example, component abbreviations) rather than equations.
  if (!hasEqNumber && !/[=<>≤≥≈≠]/.test(t) && tokens.every((token) => token.replace(/[^A-Za-z0-9]/g, "").length <= 3)) return false;

  if (hasEqNumber && math >= 1) return true;
  if (math < 2) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters > 48 && math < 3) return false;
  return tokens.length <= 24;
}

function styleStartsSubheading(
  previous: LayoutLine,
  next: LayoutLine,
  baseFont: number
): boolean {
  const text = layoutPlain(next.text);
  if (!text || text.length > 100 || text.split(/\s+/).length > 15) return false;
  if (/[.!?。．]$/.test(text) || looksLikeUrl(text) || looksLikeEmail(text)) return false;
  if (isFigureCaption(text) || isTableCaption(text) || isEquationLine(text)) return false;
  const titleCase = /^[A-Z][A-Za-z]*(?:[\s:–—-]+[A-Z][A-Za-z]*)*/.test(text);
  const uppercase = text.replace(/[^A-Za-z]/g, "").replace(/[^A-Z]/g, "").length >= 4 &&
    text.replace(/[^A-Z]/g, "").length / Math.max(1, text.replace(/[^A-Za-z]/g, "").length) > 0.7;
  const boldTransition = lineUsesBoldFace(next) && !lineUsesBoldFace(previous);
  const fontTransition = next.fontSize >= previous.fontSize + Math.max(0.35, baseFont * 0.04);
  return (titleCase || uppercase) && (boldTransition || fontTransition);
}

function isRepeatedHeadingLead(heading: LayoutLine, body: LayoutLine): boolean {
  const title = layoutPlain(heading.text);
  const next = layoutPlain(body.text);
  if (!title || !next || title.length > 90 || /[.!?。．]$/.test(title)) return false;
  const words = title.split(/\s+/);
  if (words.length < 2 || words.length > 10) return false;
  // This handles body-size subsection labels where typography alone cannot
  // distinguish a heading. Requiring title-shaped text plus an immediate
  // lexical reintroduction in the following prose is much more precise than
  // treating every short title-case line as a heading.
  if (!/^[A-Z][A-Za-z]*(?:[\s:–—-]+(?:[A-Z][A-Za-z]*|[a-z]{2,}|[IVX]+))*$/.test(title)) return false;
  const normalizedTitle = title.toLowerCase().replace(/[–—]/g, "-");
  const normalizedNext = next.toLowerCase().replace(/[–—]/g, "-");
  return new RegExp(`^(?:for\\s+(?:the\\s+)?)?${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalizedNext);
}

function captionShouldContinue(currentText: string, next: LayoutLine, baseFont: number): boolean {
  const nextText = next.text.trim();
  if (!nextText) return false;
  // Native extraction may place a table's first row or an equation directly
  // after its caption. Such lines have many independently positioned spans or
  // dense symbolic/numeric content; continuing the caption would merge the
  // region into prose and prevent the resolver from seeing its structure.
  const nextItems = next.items.length;
  const nextLetters = (nextText.match(/[A-Za-z]/g) ?? []).length;
  const nextDigits = (nextText.match(/\d/g) ?? []).length;
  const symbolic = /[=∑∫√∞≈≠≤≥±×÷αβγδ]/u.test(nextText);
  const cellLike = nextItems >= 8 ||
    (nextItems >= 4 && (symbolic || nextDigits / Math.max(nextLetters + nextDigits, 1) >= 0.3));
  const debug = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (debug === "1") {
    console.warn(`[PDF_CAPTION_CONTINUE] current=${JSON.stringify(currentText.slice(-120))} next=${JSON.stringify(nextText.slice(0, 120))} items=${nextItems} digits=${nextDigits} cellLike=${cellLike}`);
  }
  if (cellLike) return false;
  // Native streams sometimes emit a caption label (`Table 2`/`Figure 3`)
  // separately from its title.  A title-like continuation is safe only when
  // the current block is exactly that label; never relax this for a complete
  // caption, where the next heading must remain a new block.
  const labelOnly = /^(?:table|tables?|figure|fig\.?|表|図)\s*(?:\d+[a-z]?|[ivxlcdm]+)$/i.test(
    layoutPlain(currentText)
  );
  if (isHeadingLine(next, baseFont) && !labelOnly) return false;
  if (/^(abstract|introduction|ccs concepts|author keywords?|index terms|keywords)\b/i.test(nextText)) {
    return false;
  }
  if (looksLikeEmail(nextText) || looksLikeAffiliation(nextText)) return false;
  if (isCopyright(nextText, next.fontSize, baseFont)) return false;
  if (/[.!?]\s*$/.test(currentText) && /^[A-Z*]/.test(nextText) && nextText.length > 70) {
    return false;
  }
  return true;
}

const NAMED_HEADINGS = [
  /^abstract$/i,
  /^author keywords?$/i,
  /^acm classification keywords?$/i,
  /^ccs concepts$/i,
  /^introduction$/i,
  /^related work$/i,
  /^background$/i,
  /^conclusions?$/i,
  /^discussion$/i,
  /^references$/i,
  /^acknowledgements?$/i,
  /^method(s|ology)?$/i,
  /^results?$/i,
  /^はじめに$/,
  /^関連研究$/,
  /^背景$/,
  /^まとめ$/,
  /^おわりに$/,
  /^結論$/,
  /^考察$/,
  /^謝辞$/,
  /^参考文献$/,
  /^引用文献$/,
];

function looksLikeGrantIdentifier(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d{3,}(?:\.\d+){1,}$/.test(t)) return true;
  if (/^0\d+(?:\.\d+)+$/.test(t)) return true;
  const dotted = t.match(/^(\d+)(?:\.(\d+)){2,}$/);
  if (dotted && (dotted[1].length >= 3 || /^0/.test(dotted[1]))) return true;
  return false;
}

function startsWithGrantIdentifier(text: string): boolean {
  const first = (text.trim().split(/\s+/)[0] ?? "").replace(/[,;:]$/, "");
  return looksLikeGrantIdentifier(first);
}

function looksLikeSectionNumberedHeading(text: string): boolean {
  const t = layoutPlain(text).replace(
    /^\d{1,3}\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s+\S)/,
    ""
  );
  const match = t.match(/^(\d{1,2})((?:\.\d{1,2}){0,3})\.?\s+(.+)$/);
  if (!match) return false;
  if (/^0/.test(match[1])) return false;
  const rest = match[3].trim();
  if (!rest || rest.length > 70) return false;
  if (/[。．]/.test(rest)) return false;
  const first = rest.split(/\s+/)[0] ?? "";
  if (looksLikeGrantIdentifier(first) || looksLikeGrantIdentifier(rest)) {
    return false;
  }
  if (cjkCount(rest) >= 2) {
    const hadSinglePeriod = match[2] === "" && /^\d+\.\s+/.test(t);
    if (hadSinglePeriod && (rest.length > 20 || /[，,]/.test(rest))) {
      return false;
    }
    if (rest.length > 40 || /^[(（]/.test(rest)) return false;
    if (/[。．.]$/.test(rest) || /[，,]/.test(rest)) return false;
    return true;
  }
  if (!/^[A-Z(]/.test(rest)) return false;
  if (/[。.]$/.test(rest) && rest.length > 24) return false;
  if (match[2] === "" && /^\d+\.\s+/.test(t)) {
    // "6. Martin A. Conway..." is a bibliography item, not "6. Results"
    if (/\b(19|20)\d{2}\b/.test(rest) || /\b[A-Z]\.\s+[A-Z]/.test(rest)) {
      return false;
    }
    if (/\band\b/.test(rest) && /[A-Z][a-z]+\s+[A-Z]/.test(rest)) return false;
  }
  return rest.split(/\s+/).length <= 10;
}

function isGrantNumberContinuation(previous: string, next: string): boolean {
  const a = previous.trim();
  const b = next.trim();
  if (!a || !b) return false;
  if (/[.!?]$/.test(a)) return false;
  const nextFirst = b.split(/\s+/)[0] ?? b;
  if (
    /\b(?:grant|award|project|contract)\s+(?:numbers?|no\.?|#)\s*$/i.test(a) &&
    /^\d/.test(b)
  ) {
    return true;
  }
  if (/\bnumbers?\s*$/i.test(a) && looksLikeGrantIdentifier(nextFirst)) {
    return true;
  }
  if (!/[.!?]$/.test(a) && looksLikeGrantIdentifier(nextFirst)) {
    return true;
  }
  // "...grant number 016.128.303" wrapping onto "Research (NWO), awarded..."
  if (
    /\b(?:grant|award|project|contract)\s+(?:numbers?|no\.?|#)\b/i.test(a) &&
    /\d+(?:\.\d+){1,}/.test(a) &&
    /^[A-Z(]/.test(b) &&
    !looksLikeSectionNumberedHeading(b) &&
    !NAMED_HEADINGS.some((re) => re.test(b))
  ) {
    return true;
  }
  return false;
}

function isHeadingLine(line: LayoutLine, baseFont: number): boolean {
  const text = layoutPlain(line.text);
  if (!text || text.length > 90) return false;
  if (looksLikeGrantIdentifier(text) || startsWithGrantIdentifier(text)) {
    return false;
  }
  if (looksLikePaperCode(text)) return false;
  if (looksLikeSubjectClassification(text)) return false;
  if (isFigureCaption(text) || isTableCaption(text)) return false;
  if (looksLikeEmail(text) || looksLikeUrl(text) || looksLikeAffiliation(text)) {
    return false;
  }
  // A native stream may fuse a short numbered heading with the first words of
  // the following paragraph.  Once a reasonably long line contains sentence
  // punctuation followed by a new capitalized clause, prefer paragraph so the
  // body is not promoted into the heading role.
  if (text.length > 45 && /[.!?]\s+[A-Z]/.test(text)) return false;
  if (/^[a-z]/.test(text)) return false;
  if (/[-–—]$/.test(text) && text.split(/\s+/).length >= 4) return false;
  if (/^\d+\.\s+[A-Z]/.test(text) && !/^\d+\.\d+/.test(text)) {
    // "6. Martin A. Conway..." is a bibliography item, not "6. Results"
    if (/\b(19|20)\d{2}\b/.test(text) || /\b[A-Z]\.\s+[A-Z]/.test(text)) {
      return false;
    }
    if (/\band\b/.test(text) && /[A-Z][a-z]+\s+[A-Z]/.test(text)) return false;
  }
  if (NAMED_HEADINGS.some((re) => re.test(text))) return true;
  if (looksLikeSectionNumberedHeading(text)) return true;
  if (/^\d+\.?\s+[A-Z][A-Za-z].{0,40}$/.test(text) && text.split(/\s+/).length <= 8) {
    if (!/,/.test(text) && !/\b(19|20)\d{2}\b/.test(text) && !looksLikeGrantIdentifier(text)) {
      return true;
    }
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length >= 6 && upper.length / letters.length > 0.72) return true;
  // Many conference templates use body-size bold title case for subsection
  // labels.  Keep this as a generic, low-level observation; the resolver
  // later compares it with paragraph evidence and document style clusters.
  if (
    lineUsesBoldFace(line) &&
    /^[A-Z][A-Za-z]*(?:[\s:–—-]+(?:[A-Z][A-Za-z]*|[IVX]+|of|and|the|in|on|for|to))*[.:]?$/.test(text) &&
    text.split(/\s+/).length <= 14 &&
    !/[!?。．]$/.test(text)
  ) {
    return true;
  }
  if (line.fontSize > baseFont * 1.28 && text.length < 80 && text.split(/\s+/).length <= 12) {
    const hasTitleScript = /[A-Za-z]{3,}/.test(text) || /[぀-ヿ㐀-鿿]{3,}/u.test(text);
    if (!hasTitleScript) return false;
    if (/[.!?。．]$/.test(text) && text.split(/\s+/).length > 6) return false;
    if (looksLikePersonName(text)) return false;
    return true;
  }
  return false;
}

function looksLikeEmail(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function looksLikeAffiliation(text: string): boolean {
  return /(university|department|institute|college|faculty|laboratory|\blab\b|research (center|centre)|school of|architecture|industrial design|centre of excellence|faculty of|department of|\b(?:the )?(netherlands|australia|germany|france|japan|china|canada|sweden|denmark|finland|norway|italy|spain|switzerland|austria|belgium|ireland|scotland|england|wales)\b|\b(?:sydney|london|dundee|eindhoven|cambridge|oxford|toronto|melbourne|macquarie)\b|大学|大学院|研究所|学院|学部|学科|機構|高専)/i.test(
    text
  );
}

function looksLikePaperCode(text: string): boolean {
  return /^[A-Z]{1,3}-\d{2,4}$/.test(layoutPlain(text));
}

function looksLikeLatinAuthorLine(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  if (looksLikePaperCode(text) || looksLikePersonName(text)) return false;
  const t = layoutPlain(text)
    .replace(/[*,†‡§]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cjkCount(t) > 0 || t.length > 80 || t.length < 6) return false;
  if (/^\d/.test(t) || /[@/]/.test(t)) return false;
  const caps = t.split(/\s+/).filter((w) => {
    const fold = foldNameToken(w);
    return /^[A-Z][A-Za-z.'’-]*$/.test(fold) && fold.length >= 2;
  });
  const words = t.split(/\s+/).filter(Boolean);
  return caps.length >= 2 && caps.length <= 8 && caps.length >= words.length - 2;
}


const NAME_PARTICLE = /^(van|von|de|den|der|di|da|la|le|du|del|st|ter|bin|al)$/i;
const NAME_JOINER = /^(and|&)$/i;

function foldNameToken(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u00AF\u02C9\u203E]/g, "")
    .replace(/[^\p{L}.''’-]/gu, "");
}

function isNameToken(part: string, parts: string[]): boolean {
  if (/^[\u3040-\u30ff\u4e00-\u9fff]{1,4}$/.test(part)) return true;
  const fold = foldNameToken(part);
  if (/^[A-Z][A-Za-z.'’-]*$/.test(fold)) return true;
  if (/^[A-Z]\.$/.test(fold) || /^[A-Z]$/.test(fold)) return true;
  const hasMacronStub = parts.some((p) => {
    const f = foldNameToken(p);
    return /^[A-Z]$/.test(f) || p.endsWith("\u00AF") || p.endsWith("\u0304");
  });
  if (/^[a-z]{2,6}$/.test(fold) && hasMacronStub) return true;
  return false;
}

function looksLikePersonName(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  const cleaned = layoutPlain(text)
    .replace(/[*,†‡§]/g, " ")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 80 || cleaned.length < 3) return false;
  if (/^\d/.test(cleaned)) return false;
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2 || parts.length > 12) return false;
  const nameParts = parts.filter((p) => !NAME_PARTICLE.test(p) && !NAME_JOINER.test(p));
  if (nameParts.length < 2) return false;
  if (!nameParts.every((p) => isNameToken(p, nameParts))) return false;
  const substantial = nameParts.filter((p) => {
    if (/^[\u3040-\u30ff\u4e00-\u9fff]{1,4}$/.test(p)) return true;
    const fold = foldNameToken(p);
    return /^[A-Z][A-Za-z.'’-]*$/.test(fold);
  });
  return substantial.length >= 2;
}

function detectTitleFont(lines: LayoutLine[], baseFont: number): number {
  const pageOne = lines.filter((l) =>
    l.page === 1 && l.text.trim().length >= 8 &&
    !/^arxiv\b/i.test(l.text.trim()) && !looksLikeUrl(l.text)
  );
  if (pageOne.length === 0) return 0;
  const maxFont = Math.max(...pageOne.map((l) => l.fontSize));
  // Some journal mastheads use only a modest size increase for the title
  // (roughly 1.15–1.2× body). Keep the threshold above body while allowing
  // those style clusters; oversized arXiv headers are filtered above.
  if (maxFont < baseFont * 1.12) return 0;
  return maxFont;
}

function looksLikeTitleLine(
  line: LayoutLine,
  titleFont: number,
  baseFont: number
): boolean {
  if (line.page !== 1 || titleFont <= 0) return false;
  if (line.fontSize < titleFont * 0.9) return false;
  if (line.fontSize < baseFont * 1.12) return false;
  const text = line.text.trim();
  if (text.length < 8 || text.length > 180) return false;
  if (isBodyStartHeading(text) || NAMED_HEADINGS.some((re) => re.test(text))) {
    return false;
  }
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) {
    return false;
  }
  // Funding acknowledgements can use a larger masthead-like style and wrap
  // numeric grant identifiers across lines. They are metadata, never titles.
  if (/\b(?:grant|award|project|contract)\b/i.test(text) || /\b\d{2,}(?:\.\d+)+\b/.test(text)) {
    return false;
  }
  if (looksLikePaperCode(text)) return false;
  return true;
}

export function joinHyphenated(prev: string, next: string): string {
  if (/[-\u00ad\u2010\u2011]$/u.test(prev) && /^[a-z]/.test(next)) {
    // "jewellery-, memory- and interaction-" + "perspectives"
    if (/(?:,|and)\s+[A-Za-z]+[-\u00ad\u2010\u2011]$/iu.test(prev)) {
      return prev + next;
    }
    return prev.slice(0, -1) + next;
  }
  return `${prev} ${next}`;
}

function joinLines(lines: LayoutLine[]): string {
  if (lines.length === 0) return "";
  let text = lines[0].text.trim();
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i].text.trim();
    if (!next) continue;
    text = joinHyphenated(text, next);
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Checks that block text is reproducible from its native lines. */
export function hasSourceTextIntegrity(block: LayoutBlock): boolean {
  if (block.lines.length === 0) return block.text.trim().length === 0;
  return joinLines(block.lines) === block.text.replace(/\s+/g, " ").trim();
}

function sortColumnLines(lines: LayoutLine[]): LayoutLine[] {
  return [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 2-column reading order:
 * spanning top → left column (all) → right column (all) → spanning bottom.
 * Mid-page spanning bands (full-width figures) split the page so captions
 * are not dropped into the other column's sentences.
 */
function orderPageLines(lines: LayoutLine[], layout: PageColumnLayout): LayoutLine[] {
  if (!layout.isMultiColumn) {
    return sortColumnLines(lines);
  }

  const left = sortColumnLines(lines.filter((l) => l.column === "left"));
  const right = sortColumnLines(lines.filter((l) => l.column === "right"));
  const spanning = sortColumnLines(lines.filter((l) => l.column === "spanning"));

  const columnTop = Math.min(
    left[0]?.y ?? Infinity,
    right[0]?.y ?? Infinity
  );
  const columnBottom = Math.max(
    left[left.length - 1]?.y ?? 0,
    right[right.length - 1]?.y ?? 0
  );

  const spanningTop = spanning.filter((l) => l.y < columnTop - 6);
  // Footer/header metadata can be classified as spanning even when it sits
  // between the two column bands. It must not act as a mid-page cut, or the
  // tail of a left-column paragraph is emitted after the right column.
  const spanningChrome = spanning.filter((l) =>
    /^(?:arxiv\b|doi\s*[:.]|copyright\b|https?:\/\/doi\.org\/|\d+\s*$)/i.test(l.text.trim())
  );
  const spanningMid = spanning.filter(
    (l) => l.y >= columnTop - 6 && l.y <= columnBottom + 6 && !spanningChrome.includes(l)
  );
  const spanningBottom = spanning.filter((l) => l.y > columnBottom + 6);

  if (spanningMid.length === 0) {
    return [...spanningTop, ...left, ...right, ...spanningBottom];
  }

  const cuts = spanningMid.map((l) => l.y).sort((a, b) => a - b);
  const result: LayoutLine[] = [...spanningTop];
  let prevCut = -Infinity;
  for (const cut of cuts) {
    result.push(...left.filter((l) => l.y > prevCut && l.y < cut - 4));
    result.push(...right.filter((l) => l.y > prevCut && l.y < cut - 4));
    result.push(...spanningMid.filter((l) => Math.abs(l.y - cut) < 1));
    prevCut = cut;
  }
  result.push(...left.filter((l) => l.y > prevCut));
  result.push(...right.filter((l) => l.y > prevCut));
  result.push(...spanningBottom);
  return result;
}

function buildPageLines(
  page: ExtractedPage,
  layout: PageColumnLayout,
  patterns: Set<string>
): LayoutLine[] {
  const buckets: Record<LayoutColumn, ExtractedTextItem[]> = {
    left: [],
    right: [],
    spanning: [],
    single: [],
  };
  const spanningItems = page.textItems.filter((item) =>
    assignColumn(item, layout) === "spanning" && Math.abs(item.rotation ?? 0) < 45
  );
  const isAdjacentSpanningFragment = (item: ExtractedTextItem): boolean => {
    if (Math.abs(item.rotation ?? 0) >= 45) return false;
    return spanningItems.some((span) => {
      if (span === item || Math.abs(span.y - item.y) > Math.max(2, item.fontSize * 0.28) ||
          Math.abs(span.fontSize - item.fontSize) > 0.6) return false;
      const tinyPunctuation = item.width <= item.fontSize * 0.8 &&
        /^[’'“”".,;:!?()[\]{}\-–—]$/.test(item.text.trim());
      if (span.fontName !== item.fontName && !tinyPunctuation) return false;
      const gap = item.x >= span.x + span.width
        ? item.x - (span.x + span.width)
        : span.x >= item.x + item.width
          ? span.x - (item.x + item.width)
          : -1;
      // When one visual line is split by the document's column boundary,
      // assignColumn may put its trailing native text item into the next
      // column bucket. Rejoin only same-baseline, same-font items with a
      // normal inter-word gap; column order must not drop that continuation.
      return gap >= -1 && gap <= Math.max(20, item.fontSize * 2.2);
    });
  };
  const embeddedFigureText = (item: ExtractedTextItem): boolean => {
    const itemArea = Math.max(1, item.width * item.height);
    return (page.imagePlacements ?? []).some((image) => {
      if (image.width < 100 || image.height < 50) return false;
      const imageAreaRatio = (image.width * image.height) / Math.max(1, page.width * page.height);
      if (imageAreaRatio > 0.75 || (image.width > page.width * 0.88 && image.height > page.height * 0.88)) return false;
      const overlap = Math.max(0, Math.min(item.x + item.width, image.x + image.width) - Math.max(item.x, image.x)) *
        Math.max(0, Math.min(item.y + item.height, image.y + image.height) - Math.max(item.y, image.y));
      return overlap / itemArea >= 0.8;
    });
  };
  for (const item of page.textItems) {
    if (!item.text.trim()) continue;
    if (embeddedFigureText(item)) continue;
    const assigned = assignColumn(item, layout);
    const column = assigned !== "spanning" && isAdjacentSpanningFragment(item) ? "spanning" : assigned;
    buckets[column].push(item);
  }

  const lines: LayoutLine[] = [];
  (["spanning", "left", "right", "single"] as LayoutColumn[]).forEach((column) => {
    lines.push(
      ...clusterItemsIntoLines(buckets[column], column, page.pageNumber, layout.pageHeight, layout.pageWidth)
    );
  });

  const structurallySplit = lines.flatMap(splitInlineSubheading);

  // Opt-in line diagnostics for investigating generic caption/table boundaries.
  // Keep this disabled by default; it reports native geometry and style only.
  const lineDebug = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (lineDebug === "lines") {
    for (const line of structurallySplit) {
      if (/^(?:table|tables?|figure|fig\.?|表|図)\b/i.test(line.text.trim())) {
        console.warn(`[PDF_LAYOUT_LINE] page=${line.page} column=${line.column} y=${line.y.toFixed(2)} x=${line.x.toFixed(2)} width=${line.width.toFixed(2)} font=${line.items[0]?.fontName ?? "unknown"} size=${line.fontSize.toFixed(2)} items=${line.items.length} text=${JSON.stringify(line.text)}`);
      }
    }
  }

  const visible = structurallySplit.filter((line) => !isEdgeChrome(line, layout, patterns));
  const splitCandidates = visible.filter((line) => isBodyStartHeading(line.text));
  const splitAt =
    splitCandidates.length > 0
      ? splitCandidates.reduce((best, line) => (line.y < best.y ? line : best))
      : visible.find((line) => /^(abstract|introduction)$/i.test(line.text.trim()));
  if (layout.isMultiColumn && splitAt && page.pageNumber === 1) {
    const masthead = visible.filter((line) => line.y < splitAt.y);
    const body = visible.filter((line) => line.y >= splitAt.y);
    return [...orderPageLines(masthead, layout), ...orderPageLines(body, layout)];
  }

  return orderPageLines(visible, layout);
}

function isLongBodyLine(text: string): boolean {
  const t = layoutPlain(text);
  if (t.length > 50) return true;
  return cjkCount(t) >= 18;
}

function detectMastheadEnd(lines: LayoutLine[], baseFont: number): number {
  const pageOne = lines.filter((l) => l.page === 1);
  if (pageOne.length === 0) return -1;

  const named = pageOne.filter((l) => isBodyStartHeading(l.text));
  if (named.length > 0) {
    return Math.min(...named.map((l) => l.y));
  }

  const titleFont = detectTitleFont(pageOne, baseFont);
  const title = pageOne.find((l) => looksLikeTitleLine(l, titleFont, baseFont));
  const afterTitle = title ? title.y + Math.max(18, title.height) : 70;
  const body = pageOne.find(
    (l) =>
      l.y > afterTitle &&
      l.fontSize <= baseFont * 1.08 &&
      isLongBodyLine(l.text) &&
      !looksLikeEmail(l.text) &&
      !looksLikeAffiliation(l.text) &&
      !looksLikePersonName(l.text)
  );
  return body ? body.y : -1;
}

function roleForLine(
  line: LayoutLine,
  baseFont: number,
  mastheadEndY: number,
  inCopyright: boolean,
  titleFont: number,
  mastheadTitleTexts?: Set<string>
): LayoutRole {
  if (line.roleHint) return line.roleHint;
  const text = line.text.trim();
  if (isCopyright(text, line.fontSize, baseFont) || inCopyright) {
    return "copyright";
  }
  // Figure labels are frequently emitted on their own native line before the
  // caption body. Keeping the label as a caption lets the following nearby
  // title/caption lines use the same conservative continuation checks.
  if (/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*$/i.test(layoutPlain(text))) {
    return "figure_caption";
  }
  if (isFigureCaption(text)) return "figure_caption";
  if (isTableCaption(text)) return "table_caption";
  if (isEquationLine(text)) return "equation";
  if (
    line.page > 1 &&
    line.y < (line.pageHeight ?? 792) * 0.12 &&
    line.fontSize <= baseFont * 0.82 &&
    (looksLikePersonName(text) ||
      /^[A-Z][A-Za-z'’-]+\s+et\s+al\.?$/i.test(text) ||
      /[A-Za-z]{3,}.*[•·]\s*\d+\s*:\s*\d+\s*$/.test(text))
  ) {
    return "header";
  }
  if (isFootnoteLine(line, line.pageHeight ?? 792, baseFont)) {
    if (line.page === 1 && looksLikeAffiliation(text)) return "affiliation";
    return "footnote";
  }

  // Some arXiv/proceedings templates use a centered, body-sized title above
  // the author masthead.  `titleFont` intentionally remains conservative;
  // this document-level anchor supplies an independent geometry/order signal.
  if (mastheadTitleTexts?.has(text)) return "title";

  if (looksLikeTitleLine(line, titleFont, baseFont)) return "title";

  const inMasthead =
    line.page === 1 && mastheadEndY >= 0 && line.y < mastheadEndY;
  if (inMasthead) {
    // CJK journals frequently place an abstract immediately below the title
    // without an English "Abstract" anchor.  When masthead detection cannot
    // find that anchor, treating every line before the inferred body start as
    // affiliation turns the abstract into metadata.  A long CJK line with
    // sentence punctuation is stronger body evidence than the masthead
    // fallback and should remain translatable prose.
    const cjkBodyLine = cjkCount(text) >= 12 &&
      (/[，。；！？：]/u.test(text) || text.length >= 20) &&
      !looksLikeAffiliation(text);
    if (cjkBodyLine) return "paragraph";
    // Some journal layouts place the abstract immediately below a wrapped
    // title/author masthead without an `Abstract` anchor.  Long sentence-like
    // Latin lines are body evidence even when the masthead boundary was
    // inferred a few points too low.  Institution-shaped lines remain
    // metadata, and short author rows do not satisfy this condition.
    const words = text.split(/\s+/).filter(Boolean);
    const latinBodyLine = (words.length >= 16 || (line.width >= 180 && text.length >= 48)) &&
      !looksLikeAffiliation(text) &&
      (/[.!?]$/.test(text) || /-$/.test(text) || /[,;:]\s*$/.test(text) ||
        (line.width >= 240 && words.length >= 10));
    if (latinBodyLine) return "paragraph";
    // A narrow column fragment can be short after a PDF producer reflows a
    // spanning abstract. Lowercase/conjunction starts are continuation
    // evidence; institution and author-shaped lines are excluded above or
    // by the guards here.
    if (/^(?:[a-z]|and\b|but\b|or\b|which\b|that\b|where\b|while\b)/.test(text) &&
        line.width >= 70 && !looksLikeAffiliation(text) &&
        !looksLikeEmail(text)) {
      return "paragraph";
    }
    if (looksLikeGrantIdentifier(text) || startsWithGrantIdentifier(text)) {
      return "paragraph";
    }
    if (looksLikePaperCode(text)) return "affiliation";
    if (
      looksLikeEmail(text) ||
      looksLikePersonName(text) ||
      looksLikeLatinAuthorLine(text)
    ) {
      return "author";
    }
    return "affiliation";
  }

  if (isHeadingLine(line, baseFont)) return "heading";
  return "paragraph";
}

function canMerge(prev: LayoutLine, next: LayoutLine, baseFont: number): boolean {
  if (prev.page !== next.page) return false;
  if (prev.column !== next.column) return false;
  if (!sameTextOrientation(prev.rotation, next.rotation)) return false;
  const separatedMarginAndBody = Math.abs(prev.x - next.x) > Math.max(48, baseFont * 5) &&
    ((prev.width < 160 && next.width > 180) || (next.width < 160 && prev.width > 180));
  if (separatedMarginAndBody) return false;
  if (prev.items.some((a) => next.items.some((b) => rotatedTextOverlaps(a, b)))) return false;
  const baselineGap = next.y - prev.y;
  if (baselineGap > baseFont * 1.55) return false;
  return true;
}

function canMergeAffiliation(
  current: LayoutLine[],
  next: LayoutLine,
  baseFont: number
): boolean {
  if (current.length === 0) return false;
  const prev = current[current.length - 1];
  if (prev.page !== next.page || prev.column !== next.column) return false;
  if (!sameTextOrientation(prev.rotation, next.rotation)) return false;
  // Affiliation-style labels in a publisher's side rail can end with a comma
  // and share a baseline with body prose. They may only absorb a continuation
  // from their own x band; syntactic punctuation alone is not enough evidence.
  if (Math.abs(prev.x - next.x) > Math.max(18, baseFont * 1.8)) return false;
  if (next.y - prev.y > baseFont * 1.8) return false;
  if (next.fontSize > baseFont * 1.08) return false;
  const existing = joinLines(current);
  const nextText = next.text.trim();
  // An affiliation often wraps after a comma or conjunction.  Require either
  // that syntactic continuation or an institution/country marker on the next
  // line so a misclassified body paragraph cannot be absorbed into metadata.
  const syntacticContinuation = /(?:,|;|\band|\bof|\bfor|\bthe)$/i.test(existing);
  return syntacticContinuation || looksLikeAffiliation(nextText);
}

function groupLinesIntoBlocks(
  lines: LayoutLine[],
  baseFont: number
): LayoutBlock[] {
  const mastheadEndY = detectMastheadEnd(lines, baseFont);
  const titleFont = detectTitleFont(lines, baseFont);
  const mastheadTitleTexts = new Set<string>();
  const pageOne = lines.filter((line) => line.page === 1);
  const firstAuthorY = pageOne
    .filter((line) => {
      if (looksLikePersonName(line.text) || looksLikeLatinAuthorLine(line.text)) return true;
      const text = line.text.trim();
      const capitalWords = text.split(/\s+/).filter((word) => /^[A-Z][A-Za-z.'’-]{1,}$/.test(word));
      return capitalWords.length >= 2 && capitalWords.length <= 12 &&
        text.length <= 140 && !/^(?:arxiv|doi|http)/i.test(text) &&
        !/[.!?]$/.test(text);
    })
    .map((line) => line.y)
    .filter((y) => y > (pageOne[0]?.y ?? 0) + 8)
    .sort((a, b) => a - b)[0];
  if (firstAuthorY !== undefined) {
    for (const line of pageOne) {
      const text = line.text.trim();
      if (line.y >= firstAuthorY || (line.column === "right" && line.width < 300)) continue;
      if (text.length < 20 || text.length > 180 || /[.!?;]$/.test(text)) continue;
      if (isBodyStartHeading(text) || looksLikeAffiliation(text) || looksLikePersonName(text) || looksLikeLatinAuthorLine(text)) continue;
      mastheadTitleTexts.add(text);
    }
  }
  const blocks: LayoutBlock[] = [];
  let current: LayoutLine[] = [];
  let currentRole: LayoutRole | null = null;
  let copyrightStarted = false;
  let copyrightPage = -1;
  let copyrightColumn: LayoutColumn | null = null;
  let inReferences = false;

  const flush = () => {
    if (current.length === 0 || !currentRole) return;
    blocks.push({
      role: currentRole,
      text: joinLines(current),
      lines: current,
      pageStart: current[0].page,
      pageEnd: current[current.length - 1].page,
      column: current[0].column,
      bbox: blockBbox(current),
    });
    current = [];
    currentRole = null;
  };

  for (const sourceLine of lines) {
    for (const line of splitInlineDoi(sourceLine)) {
    if (!line.text.trim()) continue;
    if (line.page !== copyrightPage || line.column !== copyrightColumn) {
      copyrightStarted = false;
    }
    if (isCopyright(line.text, line.fontSize, baseFont)) {
      copyrightStarted = true;
      copyrightPage = line.page;
      copyrightColumn = line.column;
    }
    const isSplitTail = line !== sourceLine;
    const role = roleForLine(line, baseFont, mastheadEndY, isSplitTail ? false : copyrightStarted, titleFont, mastheadTitleTexts);
    if (isReferencesHeading(line.text)) {
      inReferences = true;
    }
    let forcedRole =
      inReferences &&
      role === "heading" &&
      !isReferencesHeading(line.text)
        ? "paragraph"
        : role;
    if (
      currentRole === "paragraph" &&
      forcedRole === "heading" &&
      isGrantNumberContinuation(joinLines(current), line.text)
    ) {
      forcedRole = "paragraph";
    }
    const atomic = forcedRole === "heading";

    if (currentRole === null) {
      current = [line];
      currentRole = forcedRole;
      continue;
    }

    if (
      currentRole === "paragraph" &&
      current.length === 1 &&
      forcedRole === "paragraph" &&
      isRepeatedHeadingLead(current[0], line)
    ) {
      blocks.push({
        role: "heading",
        text: joinLines(current),
        lines: current,
        pageStart: current[0].page,
        pageEnd: current[0].page,
        column: current[0].column,
        bbox: blockBbox(current),
      });
      current = [line];
      currentRole = "paragraph";
      continue;
    }

    const sameRole = forcedRole === currentRole;
    const previousRotated = current[current.length - 1].items.some((item) => Math.abs(item.rotation ?? 0) >= 45);
    const nextRotated = line.items.some((item) => Math.abs(item.rotation ?? 0) >= 45);
    const rotationCompatible = previousRotated === nextRotated;
    // Keep evidence from the full paragraph candidate: a rotated table grid
    // can be emitted as one native item per line, so inspecting only the last
    // line loses the repeated-cell pattern before a prose note is considered.
    const previousItems = current.flatMap((currentLine) => currentLine.items);
    const nextItems = line.items;
    const previousCellLike = previousItems.filter((item) => item.width <= 48 && item.text.trim().split(/\s+/).length <= 3).length >= 4;
    const nextCellLike = nextItems.filter((item) => item.width <= 48 && item.text.trim().split(/\s+/).length <= 3).length >= 4;
    const previousProseLike = previousItems.some((item) => item.width > 80 || item.text.trim().split(/\s+/).length >= 4);
    const nextProseLike = nextItems.some((item) => item.width > 80 || item.text.trim().split(/\s+/).length >= 4);
    const previousMinX = Math.min(...previousItems.map((item) => item.x));
    const previousMaxX = Math.max(...previousItems.map((item) => item.x + item.width));
    const nextMinX = Math.min(...nextItems.map((item) => item.x));
    const nextMaxX = Math.max(...nextItems.map((item) => item.x + item.width));
    const rotatedBandGap = previousRotated && nextRotated
      ? Math.max(nextMinX - previousMaxX, previousMinX - nextMaxX)
      : 0;
    const separatedRotatedBands = previousRotated && nextRotated &&
      rotatedBandGap > baseFont * 1.5 &&
      ((previousCellLike && nextItems.length >= 2) || (nextCellLike && previousItems.length >= 2));
    const previousMedianX = previousItems
      .map((item) => item.x)
      .sort((a, b) => a - b)[Math.floor(previousItems.length / 2)];
    const nextMedianX = nextItems
      .map((item) => item.x)
      .sort((a, b) => a - b)[Math.floor(nextItems.length / 2)];
    const rotatedBandJump = previousRotated && nextRotated &&
      Math.abs(nextMedianX - previousMedianX) > baseFont * 4;
    const rotationContentCompatible = !(
      previousRotated && nextRotated &&
      ((previousCellLike && nextProseLike) || (previousProseLike && nextCellLike) || separatedRotatedBands || rotatedBandJump)
    );
    const authorKindOk =
      currentRole !== "author" ||
      looksLikeEmail(joinLines(current)) === looksLikeEmail(line.text);
    const mergeable =
      sameRole &&
      !atomic &&
      authorKindOk &&
      currentRole !== "heading" &&
      currentRole !== "title" &&
      currentRole !== "figure_caption" &&
      currentRole !== "table_caption" &&
      currentRole !== "footnote" &&
      !styleStartsSubheading(current[current.length - 1], line, baseFont) &&
      rotationCompatible &&
      rotationContentCompatible &&
      canMerge(current[current.length - 1], line, baseFont);

    const affiliationContinue =
      currentRole === "affiliation" &&
      (forcedRole === "affiliation" || forcedRole === "paragraph") &&
      canMergeAffiliation(current, line, baseFont);

    const grantContinue =
      currentRole === "paragraph" &&
      forcedRole === "paragraph" &&
      line.page === current[current.length - 1].page &&
      line.column === current[current.length - 1].column &&
      line.y - current[current.length - 1].y < baseFont * 3.2 &&
      isGrantNumberContinuation(joinLines(current), line.text);

    const titleContinue =
      currentRole === "title" &&
      line.page === current[0].page &&
      (line.column === current[0].column ||
        (current[0].column === "spanning" && line.column !== "spanning" &&
          line.x < current[0].x + current[0].width &&
          line.x + line.width > current[0].x)) &&
      line.y - current[current.length - 1].y <
        Math.max(baseFont * 2.8, current[current.length - 1].fontSize * 1.35) &&
      // Some journal title lines use the display-title size with a baseline
      // gap slightly larger than body leading. Keep those lines together,
      // while requiring a matching font size so nearby author metadata does
      // not get absorbed into the title.
      Math.abs(line.fontSize - current[current.length - 1].fontSize) <= 1.2 &&
      // A title subtitle is often one short native line with a smaller font
      // and is therefore initially classified as affiliation/paragraph. Keep
      // it with the title when it is structurally close and cannot be an
      // author or institution line. Longer prose must still form a new block.
      (forcedRole === "title" ||
        (line.text.trim().split(/\s+/).filter(Boolean).length <= 6 &&
          line.text.trim().length <= 48 &&
          !looksLikePersonName(line.text) &&
          !looksLikeEmail(line.text)));

    const captionContinue =
      (currentRole === "figure_caption" || currentRole === "table_caption") &&
      sameTextOrientation(current[current.length - 1].rotation, line.rotation) &&
      line.page === current[0].page &&
      (line.column === current[0].column ||
        // Full-width captions can be emitted as a spanning line followed by
        // separate left/right fragments. Allow only unfinished caption text
        // with close vertical spacing to continue across those column labels.
        (currentRole === "figure_caption" &&
          !/[.!?]\s*$/.test(joinLines(current)) &&
          line.y - current[current.length - 1].y < baseFont * 2.4)) &&
      line.y - current[current.length - 1].y < baseFont * 2.4 &&
      (/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*$/i.test(layoutPlain(joinLines(current))) ||
        line.fontSize <= (current.find((part) =>
          !/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*$/i.test(layoutPlain(part.text))
        )?.fontSize ?? current[0].fontSize) + 0.6) &&
      captionShouldContinue(joinLines(current), line, baseFont);

    const footnoteContinue =
      currentRole === "footnote" &&
      line.page === current[0].page &&
      line.column === current[0].column &&
      line.y - current[current.length - 1].y < baseFont * 2.2 &&
      // Only the first native-text line commonly retains the footnote marker;
      // subsequent small-type lines are ordinary prose fragments.
      (forcedRole === "footnote" || line.fontSize <= baseFont * 0.9);

    const headingContinue =
      currentRole === "heading" &&
      forcedRole === "heading" &&
      line.page === current[0].page &&
      line.column === current[0].column &&
      line.y - current[current.length - 1].y < baseFont * 2.2 &&
      Math.abs(line.fontSize - current[current.length - 1].fontSize) < 0.8 &&
      /^[A-Z0-9][A-Z0-9\s–—-]+$/.test(layoutPlain(line.text));

    if (mergeable || affiliationContinue || captionContinue || grantContinue || titleContinue || footnoteContinue || headingContinue) {
      current.push(line);
      continue;
    }

    flush();
    current = [line];
    currentRole = forcedRole;
    }
  }
  flush();
  const nonEmptyBlocks = splitMixedColumnBlocks(
    splitStyledHeadingPrefixes(
      rejoinCaptionStatisticFragments(blocks.filter((b) => b.text.length > 0)),
      median(blocks.flatMap((block) => block.lines.map((line) => line.fontSize))) || 9,
    )
  );
  logLayoutBlockBoundaries(nonEmptyBlocks);
  return splitMixedColumnBlocks(mergeColumnContinuations(nonEmptyBlocks));
}

/**
 * A full-width figure caption can share a baseline with the first line of the
 * adjacent text column. Tiny significance items (`p < .05`, `**`) then get
 * grouped as a separate line in that paragraph. Reattach only a short,
 * statistic-shaped line that sits on the caption's final baseline and uses
 * the caption font; leave all prose and unrelated numeric lines untouched.
 */
function rejoinCaptionStatisticFragments(blocks: LayoutBlock[]): LayoutBlock[] {
  const removed = new Set<LayoutBlock>();
  for (const caption of blocks) {
    if (caption.role !== "figure_caption" && caption.role !== "table_caption") continue;
    const tail = caption.lines.at(-1);
    if (!tail) continue;
    const captionFont = tail.fontSize;
    for (const candidate of blocks) {
      if (candidate === caption || candidate.role !== "paragraph") continue;
      const fragment = candidate.lines.find((line) =>
        line.page === tail.page &&
        Math.abs(line.y - tail.y) <= Math.max(2.5, captionFont * 0.42) &&
        Math.abs(line.fontSize - captionFont) <= 0.6 &&
        /^(?:[*†‡\s(]*p\s*[<=>≤≥]\s*\d(?:\.\d+)?\)?[),;.]?|[*†‡]{1,3}[),;.]?)$/i.test(line.text.trim())
      );
      if (!fragment) continue;
      caption.lines.push(fragment);
      caption.lines.sort((a, b) => a.y - b.y || a.x - b.x);
      caption.text = joinLines(caption.lines);
      caption.bbox = blockBbox(caption.lines);
      candidate.lines = candidate.lines.filter((line) => line !== fragment);
      if (candidate.lines.length === 0) {
        removed.add(candidate);
      } else {
        candidate.text = joinLines(candidate.lines);
        candidate.bbox = blockBbox(candidate.lines);
        candidate.pageStart = candidate.lines[0].page;
        candidate.pageEnd = candidate.lines.at(-1)!.page;
      }
      break;
    }
  }
  return blocks.filter((block) => !removed.has(block));
}

/** Keep a paragraph from spanning two native columns when the extractor has
 * already assigned its lines to distinct columns. A true spanning block has
 * `column=spanning` on every line; mixed left/right runs are a reading-order
 * boundary and must remain separate for the resolver to reason about. */
function splitMixedColumnBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    if (block.preserveColumnContinuation) {
      result.push(block);
      continue;
    }
    const columns = new Set(block.lines.map((line) => line.column));
    const lineWidths = block.lines.map((line) => line.width).filter((width) => width > 0);
    const typicalLineWidth = median(lineWidths) || 1;
    const startsMidPage = (block.lines[0]?.y ?? 0) > (block.lines[0]?.pageHeight ?? 792) * 0.35;
    // Quantize x origins coarsely enough to absorb glyph-level drift within
    // one column while still separating typical academic column gutters.
    const xBands = [...new Set(block.lines.map((line) => Math.round(line.x / 32) * 32))].sort((a, b) => a - b);
    const samePage = block.pageStart === block.pageEnd;
    const inferredTwoColumn = columns.size === 1 && xBands.length === 2 && samePage &&
      block.bbox.width >= typicalLineWidth * 1.65;
    const labelSidebar = columns.size === 1 && xBands.length === 2 && samePage && (() => {
      const splitX = (Math.min(...xBands) + Math.max(...xBands)) / 2;
      const left = block.lines.filter((line) => line.x <= splitX);
      const right = block.lines.filter((line) => line.x > splitX);
      const leftMedian = median(left.map((line) => line.width).filter((width) => width > 0));
      const rightMedian = median(right.map((line) => line.width).filter((width) => width > 0));
      return left.length >= 2 && right.length >= 3 && leftMedian > 0 && rightMedian > 0 &&
        leftMedian <= rightMedian * 0.35 && rightMedian >= typicalLineWidth * 0.85;
    })();
    const orderedColumns = [...new Set(block.lines.map((line) => line.column))];
    const leftLines = block.lines.filter((line) => line.column === "left");
    const rightLines = block.lines.filter((line) => line.column === "right");
    const leftTail = leftLines.at(-1)?.text.trim() ?? "";
    const rightHead = rightLines[0]?.text.trim() ?? "";
    const crossPageColumnContinuation = block.pageStart < block.pageEnd && (() => {
      const firstPage = block.pageStart;
      const before = block.lines.filter((line) => line.page === firstPage).at(-1);
      const after = block.lines.find((line) => line.page > firstPage);
      return before?.column === "right" && after?.column === "left" &&
        isSentenceContinuation(before.text, after.text);
    })();
    const clearColumnContinuation = orderedColumns.includes("left") && orderedColumns.includes("right") &&
      /^[a-z]/.test(rightHead) && !/[.!?;:]$/.test(leftTail);
    if (block.role !== "paragraph" || (!inferredTwoColumn && !labelSidebar && columns.size < 2) || columns.has("spanning") ||
        (!labelSidebar && block.bbox.width < typicalLineWidth * 1.65) || block.lines.length < 3 ||
        (!startsMidPage && !labelSidebar && (columns.size < 2 || clearColumnContinuation)) ||
        crossPageColumnContinuation) {
      result.push(block);
      continue;
    }
    if (inferredTwoColumn || labelSidebar) {
      const splitX = (Math.min(...xBands) + Math.max(...xBands)) / 2;
      const left = block.lines.filter((line) => line.x <= splitX).sort((a, b) => a.y - b.y);
      const right = block.lines.filter((line) => line.x > splitX).sort((a, b) => a.y - b.y);
      if (left.length >= 2 && right.length >= 2) {
        for (const run of [left, right]) {
          const text = joinLines(run);
          const role = labelSidebar && run === left && looksLikeAffiliation(text)
            ? "affiliation"
            : "paragraph";
          result.push({ role, text, lines: run, pageStart: run[0].page, pageEnd: run[run.length - 1].page, column: run[0].column, bbox: blockBbox(run) });
        }
        continue;
      }
    }
    let run: LayoutLine[] = [];
    let runColumn: LayoutColumn | null = null;
    const flushRun = () => {
      if (run.length === 0) return;
      result.push({
        role: "paragraph",
        text: joinLines(run),
        lines: run,
        pageStart: run[0].page,
        pageEnd: run[run.length - 1].page,
        column: run[0].column,
        bbox: blockBbox(run),
      });
      run = [];
    };
    for (const line of block.lines) {
      if (runColumn !== null && line.column !== runColumn) flushRun();
      runColumn = line.column;
      run.push(line);
    }
    flushRun();
    if (result.length === 0) result.push(block);
  }
  return result;
}

/**
 * Some native extractors put a multi-line numbered subsection and its first
 * body line in one paragraph stream. Split only when a short, numbered
 * prefix has a clear native style transition to body text. The conservative
 * bounds avoid treating ordinary bold inline text or table rows as headings.
 */
function splitStyledHeadingPrefixes(blocks: LayoutBlock[], baseFont: number): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    if (block.role !== "paragraph" || block.lines.length < 2) {
      result.push(block);
      continue;
    }
    const firstFont = block.lines[0].fontSize;
    const firstFonts = new Set(block.lines[0].items.map((item) => item.fontName));
    const prefixEnd = block.lines.findIndex((line, index) => {
      if (index <= 0) return false;
      const lineFonts = new Set(line.items.map((item) => item.fontName));
      const nativeStyleDrop = [...lineFonts].every((font) => !firstFonts.has(font));
      return line.fontSize <= firstFont - Math.max(0.35, baseFont * 0.04) || nativeStyleDrop;
    });
    if (prefixEnd <= 0 || prefixEnd > 3) {
      result.push(block);
      continue;
    }
    const prefixLines = block.lines.slice(0, prefixEnd);
    const prefixText = layoutPlain(joinLines(prefixLines));
    const prefixWords = prefixText.split(/\s+/).filter(Boolean);
    const numberedHeading = /^\d{1,2}(?:\.\d{1,2}){1,3}\.?\s+/.test(prefixText) &&
      prefixText.length <= 140 && prefixWords.length <= 18 &&
      !/[.!?。．]$/.test(prefixText);
    const bodyLine = block.lines[prefixEnd];
    if (!numberedHeading || bodyLine.x < block.lines[0].x - baseFont * 0.5) {
      result.push(block);
      continue;
    }
    result.push({
      role: "heading",
      text: joinLines(prefixLines),
      lines: prefixLines,
      pageStart: prefixLines[0].page,
      pageEnd: prefixLines[prefixLines.length - 1].page,
      column: prefixLines[0].column,
      bbox: blockBbox(prefixLines),
    });
    const bodyLines = block.lines.slice(prefixEnd);
    result.push({
      role: "paragraph",
      text: joinLines(bodyLines),
      lines: bodyLines,
      pageStart: bodyLines[0].page,
      pageEnd: bodyLines[bodyLines.length - 1].page,
      column: bodyLines[0].column,
      bbox: blockBbox(bodyLines),
    });
  }
  return result;
}

function logLayoutBlockBoundaries(blocks: LayoutBlock[]): void {
  const debugFlag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (debugFlag !== "1") return;
  for (const [index, block] of blocks.entries()) {
    const fonts = [...new Set(block.lines.flatMap((line) => line.items.map((item) => item.fontName)))];
    console.warn(`[PDF_LAYOUT_BLOCK] index=${index} role=${block.role} page=${block.pageStart}-${block.pageEnd} lines=${block.lines.length} fonts=${fonts.join(",")} text=${block.text.slice(0, 180)}`);
    const lineWidths = block.lines.map((line) => line.width).filter((width) => width > 0);
    const typicalLineWidth = median(lineWidths) || 1;
    if (fonts.length > 1 || block.bbox.width > typicalLineWidth * 1.65) {
      for (const [lineIndex, line] of block.lines.entries()) {
        const lineFonts = [...new Set(line.items.map((item) => item.fontName))].join(",");
        console.warn(`[PDF_LAYOUT_LINE] block=${index} line=${lineIndex} y=${line.y.toFixed(2)} x=${line.bbox.x.toFixed(2)} items=${line.items.length} fonts=${lineFonts} text=${line.text.slice(0, 160)}`);
      }
    }
  }
}

export function isSentenceContinuation(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  // A colon commonly introduces a list or table; do not carry that lead-in
  // into the next column/page stream.
  if (/[.!?:]$/.test(a)) return false;
  if (a.endsWith("-") && /^[a-z]/.test(b)) return true;
  // Author-year citations can be split by a physical page/column boundary,
  // e.g. `(Greenwood et al. 2005; Muth` → `1966), the ...`. Only treat a
  // leading year as continuation when it closes an unmatched citation group.
  if (a.lastIndexOf("(") > a.lastIndexOf(")") && /^(?:19|20)\d{2}(?:[;,)]|\b)/.test(b)) return true;
  if (isGrantNumberContinuation(a, b)) return true;
  // A PDF text stream may place a numbered cross-reference on the following
  // line/column (`... in Section` → `3`). Stitch only this explicit label +
  // number shape; arbitrary uppercase starts remain subject to the stricter
  // connector rule below.
  if (/\b(?:section|chapter|appendix|figure|table)$/i.test(a) && /^\d+(?:\.\d+)*(?:[.)]|\b)/.test(b)) {
    return true;
  }
  if (/^[a-z(]/.test(b)) return true;
  // Native PDF extraction can preserve a wrapped continuation with an
  // uppercase first word (for example, a proper noun or the start of a
  // parenthetical phrase).  Only accept this across a page/column boundary
  // when the preceding fragment ends in a syntactic connector.  This keeps
  // independent title/paragraph blocks from being merged merely because the
  // left block lacks terminal punctuation.
  const lastWord = a.match(/[A-Za-z][A-Za-z'’-]*$/)?.[0].toLowerCase();
  return (
    a.length >= 80 &&
    !!lastWord &&
    (/^(?:and|or|but|nor|to|of|for|from|with|in|on|by|that|which|as|than|via|the|a|an)$/.test(lastWord) ||
      // A wrapped noun phrase may end after its article and modifier at a
      // geometric block boundary (e.g. "an extended" / "WEAR Scale"). The
      // requirement that the continuation begins with a capitalized token
      // limits this to likely proper-name/label continuations.
      /\b(?:a|an|the)\s+(?:\w+\s+){0,2}\w+$/i.test(a)) &&
    /^[A-Z(]/.test(b)
  );
}

function normalizedRunningText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/**
 * Headers are normally classified before blocks are formed, but a title that
 * appears only on the title page and once as a running header has too little
 * repetition for that earlier page-level detector.  Treat a repeated, short
 * title-case block as transparent while looking for a paragraph continuation.
 * This is deliberately narrower than treating every short paragraph as chrome.
 */
function isRepeatedRunningHeader(block: LayoutBlock, repeatedTexts: Set<string>): boolean {
  const text = block.text.trim();
  if (block.role !== "paragraph" || block.lines.length > 2 || text.length < 8 || text.length > 140) {
    return false;
  }
  if (/[.!?;:]$/.test(text) || /\d{3,}/.test(text)) return false;
  if (!repeatedTexts.has(normalizedRunningText(text))) return false;

  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  return words.length >= 2 && words.every((word) => /^[A-Z]/.test(word) || /^(?:for|and|of|the|in|on|to|with)$/i.test(word));
}

function isUnclassifiedFootnote(block: LayoutBlock): boolean {
  if (block.role !== "paragraph" || !/^\d+\s*\S/.test(block.text)) return false;
  const largestFont = Math.max(...block.lines.map((line) => line.fontSize));
  // Native extractors occasionally leave small numbered footnotes as
  // paragraphs.  Restrict this to text materially smaller than body copy.
  return largestFont > 0 && largestFont <= 7.5;
}

/** Author/contributor metadata is visually near the page boundary but is not
 * prose. Never use it as the source paragraph for cross-page stitching. */
function isAuthorMetadataBlock(block: LayoutBlock): boolean {
  if (block.role !== "paragraph") return false;
  return /(?:contributed equally|correspondence|corresponding author|requests for materials|should be addressed to|e-?mail\s*:|full list of author information|served as (?:a )?(?:special issue )?editor\b)/i.test(block.text);
}

/** Short publisher marks can be emitted as ordinary text at the page edge.
 * They are often mirrored between recto/verso pages, so exact x alignment is
 * weaker evidence than repeated text plus edge geometry. Keep this limited to
 * repeated numeric/symbol marks to avoid treating repeated body labels as
 * chrome. */
function isRepeatedEdgeMarker(block: LayoutBlock, repeatedTexts: Set<string>): boolean {
  const text = block.text.trim();
  if (block.role !== "paragraph" || text.length === 0 || text.length > 16 ||
      !/^[\d\s|.,:/()\-–—]+$/.test(text) ||
      !repeatedTexts.has(normalizedRunningText(text))) return false;
  return block.lines.length > 0 && block.lines.every((line) => {
    const height = line.pageHeight ?? 792;
    return line.y < height * 0.12 || line.y > height * 0.88;
  });
}

function isTransparentMetadataBlock(block: LayoutBlock, repeatedTexts: Set<string>): boolean {
  return block.role === "header" || block.role === "footer" || block.role === "footnote" ||
    block.role === "affiliation" || block.role === "copyright" || isUnclassifiedFootnote(block) ||
    isAuthorMetadataBlock(block) || isRepeatedRunningHeader(block, repeatedTexts) ||
    isRepeatedEdgeMarker(block, repeatedTexts);
}

/** A narrow single-column margin item may be interleaved in reading order
 * with body text when the page's sidebar is too sparse to trigger column
 * detection. It is transparent only when native x geometry places the whole
 * item clearly left of a wide body line. */
function isDetachedSingleColumnMarginBlock(block: LayoutBlock, bodyX: number): boolean {
  const gapToBody = bodyX - (block.bbox.x + block.bbox.width);
  const pageWidth = block.lines[0]?.pageWidth ?? 612;
  return block.column === "single" && block.bbox.width <= 160 &&
    gapToBody >= 12 && gapToBody <= pageWidth * 0.3 &&
    block.lines.length > 0 &&
    block.lines.every((line) => line.column === "single");
}

function hasRotatedNativeLine(block: LayoutBlock): boolean {
  return block.lines.some((line) => Math.abs(line.rotation ?? 0) >= 45);
}

function mergeColumnContinuations(blocks: LayoutBlock[]): LayoutBlock[] {
  const textCounts = new Map<string, number>();
  for (const block of blocks) {
    const text = normalizedRunningText(block.text);
    if (text) textCounts.set(text, (textCounts.get(text) ?? 0) + 1);
  }
  const repeatedTexts = new Set([...textCounts].filter(([, count]) => count >= 2).map(([text]) => text));
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    let targetIdx = result.length - 1;
    while (
      targetIdx >= 0 &&
      (result[targetIdx].role === "copyright" ||
        result[targetIdx].role === "header" ||
        result[targetIdx].role === "footer" ||
        result[targetIdx].role === "footnote" ||
        result[targetIdx].role === "affiliation" ||
        isUnclassifiedFootnote(result[targetIdx]) ||
        isAuthorMetadataBlock(result[targetIdx]) ||
        isRepeatedRunningHeader(result[targetIdx], repeatedTexts) ||
        isRepeatedEdgeMarker(result[targetIdx], repeatedTexts) ||
        isDetachedSingleColumnMarginBlock(result[targetIdx], block.bbox.x) ||
        // A figure/table caption can be physically placed between two lines
        // of one paragraph. It must remain its own canonical block, but must
        // not hide an unambiguously incomplete paragraph from its continuation.
        result[targetIdx].role === "figure_caption" ||
        result[targetIdx].role === "table_caption")
    ) {
      targetIdx--;
    }
    const skippedInterveningMetadata = targetIdx < result.length - 1;
    const target = targetIdx >= 0 ? result[targetIdx] : null;
    const targetLine = target?.lines.at(-1);
    const nextLine = block.lines[0];
    const skippedBlocks = targetIdx >= 0 ? result.slice(targetIdx + 1) : [];
    const safeColumnMetadataGap = Boolean(
      skippedBlocks.length > 0 && target && targetLine &&
      skippedBlocks.every((skipped) => {
        const transparent = skipped.role === "header" || skipped.role === "footer" || skipped.role === "footnote" ||
          skipped.role === "affiliation" || skipped.role === "copyright" ||
          isUnclassifiedFootnote(skipped) || isAuthorMetadataBlock(skipped) ||
          isRepeatedRunningHeader(skipped, repeatedTexts);
        const precedesTailPage = skipped.pageEnd < targetLine.page;
        const followsTailOnSameColumn = skipped.pageStart === targetLine.page && skipped.pageEnd === targetLine.page &&
          skipped.column === targetLine.column && skipped.lines[0]?.y !== undefined && skipped.lines[0].y > targetLine.y;
        if (transparent && (precedesTailPage || followsTailOnSameColumn)) return true;
        // A floating caption/table can sit below the unfinished left-column
        // tail while the paragraph resumes at the top of the right column.
        // Treat it as a gap only when the caption is below the tail, ends
        // before the continuation's x-band, and the continuation is near top.
        return (skipped.role === "figure_caption" || skipped.role === "table_caption") &&
          targetLine.page === nextLine?.page && skipped.pageStart === targetLine.page &&
          targetLine.column === "left" && nextLine?.column === "right" &&
          skipped.pageEnd === targetLine.page && skipped.bbox.y > targetLine.y &&
          skipped.bbox.x < (nextLine?.x ?? 0) - 40 &&
          (nextLine?.y ?? Number.MAX_SAFE_INTEGER) < (nextLine?.pageHeight ?? 0) * 0.32;
      })
    );
    const safeBoundaryMetadataGap = Boolean(
      skippedBlocks.length > 0 && target && targetLine &&
      target.lines.at(-1)?.column !== undefined &&
      skippedBlocks.every((skipped) => {
        const sourcePageMetadata = skipped.pageStart === target.pageEnd && skipped.pageEnd === target.pageEnd;
        const nextPageRunningHeader = skipped.pageStart === block.pageStart &&
          skipped.pageEnd === block.pageStart && isRepeatedRunningHeader(skipped, repeatedTexts);
        const nextPageCaption = skipped.pageStart === block.pageStart && skipped.pageEnd === block.pageStart &&
          (skipped.role === "figure_caption" || skipped.role === "table_caption") &&
          skipped.bbox.y + skipped.bbox.height < (nextLine?.y ?? Number.NEGATIVE_INFINITY);
        const lowerPageFootnote = skipped.pageStart === block.pageStart && skipped.pageEnd === block.pageStart &&
          skipped.role === "footnote" && skipped.bbox.y > (nextLine?.y ?? Number.POSITIVE_INFINITY);
        if (!sourcePageMetadata && !nextPageRunningHeader && !nextPageCaption && !lowerPageFootnote) return false;
        if (isTransparentMetadataBlock(skipped, repeatedTexts) &&
          skipped.lines.every((line) => line.column !== targetLine.column)) return true;
        if (isRepeatedEdgeMarker(skipped, repeatedTexts) &&
          skipped.lines.every((line) => line.column === targetLine.column && line.y > targetLine.y)) return true;
        // A caption in the opposite visual column and a footnote below the
        // paragraph tail can be interleaved in native reading order. They are
        // transparent only when geometry proves they are outside source text.
        if ((skipped.role === "figure_caption" || skipped.role === "table_caption") &&
          skipped.bbox.x >= targetLine.x + targetLine.width - 2) return true;
        if (nextPageCaption || lowerPageFootnote) return true;
        return skipped.role === "footnote" &&
          skipped.lines.every((line) => line.y > targetLine.y && line.column === targetLine.column);
      })
    );
    const safeContinuationMetadataGap = skippedBlocks.length > 0 && skippedBlocks.every((skipped) => {
      if (isTransparentMetadataBlock(skipped, repeatedTexts)) return true;
      if (isDetachedSingleColumnMarginBlock(skipped, targetLine?.x ?? Number.NEGATIVE_INFINITY)) return true;
      if (skipped.role !== "figure_caption" && skipped.role !== "table_caption") return false;
      const captionBottom = skipped.bbox.y + skipped.bbox.height;
      const captionOnEarlierPage = skipped.pageEnd < (targetLine?.page ?? Number.NEGATIVE_INFINITY);
      const precedesSourceTail = skipped.pageEnd === target?.pageEnd && captionBottom < (targetLine?.y ?? Number.NEGATIVE_INFINITY);
      const precedesContinuation = skipped.pageStart === block.pageStart && captionBottom < (nextLine?.y ?? Number.NEGATIVE_INFINITY);
      return captionOnEarlierPage || precedesSourceTail || precedesContinuation;
    });
    const completeLeadingContinuation = (() => {
      if (!target || target.role !== "paragraph" || block.role !== "paragraph" || !targetLine || !nextLine) return null;
      if (!skippedInterveningMetadata || !safeContinuationMetadataGap) return null;
      if (targetLine.page !== nextLine.page || targetLine.column !== "left" || nextLine.column !== "right") return null;
      if (targetLine.y < (targetLine.pageHeight ?? 792) * 0.68 || nextLine.y >= targetLine.y - 16) return null;
      if (Math.abs(targetLine.fontSize - nextLine.fontSize) > 0.8 || /[.!?:]$/.test(target.text.trim())) return null;
      const prefixLines: LayoutLine[] = [];
      let prefixText = "";
      for (const line of block.lines) {
        if (line.page !== nextLine.page || line.column !== "right") break;
        prefixLines.push(line);
        prefixText = joinLines(prefixLines);
        if (/[.!?]["')\]]*$/.test(prefixText.trim())) return { lines: prefixLines, text: prefixText };
      }
      return null;
    })();
    const joinsCompleteLeadingContinuation = Boolean(
      completeLeadingContinuation && target && block &&
      isSentenceContinuation(target.text, completeLeadingContinuation.text)
    );
    const joinsSameColumnContinuation = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      (!skippedInterveningMetadata || safeContinuationMetadataGap) && targetLine && nextLine &&
      targetLine.page === nextLine.page && targetLine.column === "single" && nextLine.column === "single" &&
      Math.abs(targetLine.x - nextLine.x) <= 18 && nextLine.y > targetLine.y &&
      nextLine.y - targetLine.y <= Math.max(targetLine.fontSize, nextLine.fontSize) * 3.2 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      !/[.!?:]$/.test(target.text.trim()) && isSentenceContinuation(target.text, block.text)
    );
    const debugFlag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
    const wrapsAcrossColumnsAtPageBottom = Boolean(
      target && (!skippedInterveningMetadata || safeColumnMetadataGap) &&
      target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "left" && block.column === "right" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart &&
      target.text.length >= 80 &&
      !/[.!?:]$/.test(target.text.trim()) &&
      targetLine && nextLine &&
      targetLine.page === nextLine.page &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      (targetLine.y > (targetLine.pageHeight ?? 792) * 0.68 &&
        nextLine.y < (nextLine.pageHeight ?? 792) * 0.32 ||
        nextLine.y < targetLine.y - Math.max(30, targetLine.fontSize * 3)) &&
      isSentenceContinuation(target.text, block.text)
    );
    const wrapsAcrossPhysicalColumns = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      (!skippedInterveningMetadata || safeColumnMetadataGap) && targetLine && nextLine &&
      targetLine.page === nextLine.page && targetLine.column === "left" && nextLine.column === "right" &&
      target.pageEnd === block.pageStart && target.text.length >= 80 &&
      !/[.!?:]$/.test(target.text.trim()) &&
      targetLine.y > (targetLine.pageHeight ?? 792) * 0.68 &&
      nextLine.y < (nextLine.pageHeight ?? 792) * 0.32 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      isSentenceContinuation(target.text, block.text)
    );
    const wrapsAcrossAdjacentColumnTails = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      (!skippedInterveningMetadata || skippedBlocks.every((skipped) =>
        (skipped.role === "figure_caption" || skipped.role === "table_caption") &&
          skipped.bbox.y + skipped.bbox.height < (nextLine?.y ?? Number.NEGATIVE_INFINITY) ||
        isTransparentMetadataBlock(skipped, repeatedTexts)
      )) &&
      target.pageEnd === block.pageStart && block.pageStart === block.pageEnd &&
      targetLine?.page === nextLine?.page && targetLine?.column === "left" && nextLine?.column === "right" &&
      target.text.trim().length >= 80 && !/[.!?:]$/.test(target.text.trim()) &&
      targetLine && nextLine && targetLine.page === nextLine.page &&
      targetLine.y > (targetLine.pageHeight ?? 792) * 0.68 &&
      nextLine.y > (nextLine.pageHeight ?? 792) * 0.68 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      isSentenceContinuation(target.text, block.text)
    );
    const geometrySameLineContinuation = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      skippedInterveningMetadata &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && target.column === block.column &&
      target.lines.length >= 2 && block.lines.length >= 2 &&
      target.text.length >= 80 && !/[.!?:]$/.test(target.text.trim()) &&
      targetLine && nextLine && targetLine.page === nextLine.page &&
      Math.abs(targetLine.x - nextLine.x) <= Math.max(4, targetLine.fontSize * 0.45) &&
      nextLine.y > targetLine.y &&
      nextLine.y - targetLine.y <= Math.max(targetLine.fontSize, nextLine.fontSize) * 1.65 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8
    );
    const crossesPageBoundary =
      target && (!skippedInterveningMetadata || safeBoundaryMetadataGap || safeContinuationMetadataGap) &&
      target.pageEnd + 1 === block.pageStart &&
      // A short edge marker (page number, publisher logo text, or a dangling
      // numeric label) must never become the left side of a paragraph merely
      // because the next page starts with lowercase prose. Real paragraph
      // continuations have a substantial source tail; otherwise preserve the
      // two blocks and let later role/input validation handle the fragment.
      target.text.trim().length >= 24 &&
      (target.column === block.column ||
        // Reading order wraps from the right column of one page to the left
        // column of the next page in ordinary two-column proceedings.
        (target.column === "right" && block.column === "left") ||
        // A full-width paragraph can continue in the first body column of
        // the next page.  The next paragraph may begin below a page-top
        // figure, so its y position alone is not a reliable boundary here.
        (target.column === "single" && (block.column === "single" || block.column === "left"))) &&
      (target.lines[target.lines.length - 1]?.y ?? 0) >
        (target.lines[target.lines.length - 1]?.pageHeight ?? Number.MAX_SAFE_INTEGER) * 0.68 &&
      ((target.column === "right" && block.column === "left" && skippedInterveningMetadata &&
          (safeBoundaryMetadataGap || safeContinuationMetadataGap) && isSentenceContinuation(target.text, block.text)) ||
        (target.column === "single" && (block.column === "single" || block.column === "left")) ||
        (block.lines[0]?.y ?? Number.MAX_SAFE_INTEGER) <
          (block.lines[0]?.pageHeight ?? 0) * 0.32);
    const canContinueAcrossColumns = Boolean(
      target && (
        ((!skippedInterveningMetadata || safeColumnMetadataGap) && targetLine && nextLine &&
          targetLine.column === "left" && nextLine.column === "right" &&
          targetLine.page === nextLine.page && target.pageEnd === block.pageStart &&
          targetLine.y > (targetLine.pageHeight ?? 792) * 0.68 &&
          nextLine.y < (nextLine.pageHeight ?? 792) * 0.32) ||
        ((!skippedInterveningMetadata || safeColumnMetadataGap) && target.column === "left" && block.column === "right" && target.pageEnd === block.pageStart &&
          ((target.lines[0]?.y ?? 0) <= (target.lines[0]?.pageHeight ?? 792) * 0.35 ||
            (target.lines.at(-1)?.y ?? Number.MAX_SAFE_INTEGER) >
              (target.lines.at(-1)?.pageHeight ?? 792) * 0.68)) ||
        // A full-width paragraph can continue below an intervening figure in
        // the first physical column of the same page. The continuation test
        // below still requires an unfinished source sentence and a lower-case
        // next fragment, so this does not join independent body paragraphs.
        (target.column === "single" && (block.column === "left" || block.column === "right") && target.pageEnd === block.pageStart) ||
        crossesPageBoundary
      )
    );
    if (debugFlag === "1" && target && target.column === "left" && block.column === "right") {
      console.warn(`[PDF_LAYOUT_CROSS_COLUMN] target=${target.text.slice(-70)} next=${block.text.slice(0, 70)} skipped=${skippedInterveningMetadata} wrap=${wrapsAcrossColumnsAtPageBottom} continuation=${isSentenceContinuation(target.text, block.text)} targetY=${targetLine?.y}/${targetLine?.pageHeight} nextY=${nextLine?.y}/${nextLine?.pageHeight} targetPage=${target.pageStart}-${target.pageEnd} nextPage=${block.pageStart}-${block.pageEnd} rotated=${hasRotatedNativeLine(target)}/${hasRotatedNativeLine(block)}`);
    }
    if (
      target && target.role === "paragraph" && block.role === "paragraph" &&
      (joinsCompleteLeadingContinuation || joinsSameColumnContinuation || geometrySameLineContinuation || wrapsAcrossColumnsAtPageBottom || wrapsAcrossPhysicalColumns || wrapsAcrossAdjacentColumnTails ||
        (canContinueAcrossColumns && isSentenceContinuation(target.text, block.text))) &&
      !(hasRotatedNativeLine(target) !== hasRotatedNativeLine(block))
    ) {
      if (debugFlag === "1" && target.pageStart === block.pageStart && target.column !== block.column) {
        console.warn(`[PDF_LAYOUT_MERGE] page=${block.pageStart} ${target.column}->${block.column} targetY=${target.lines[0]?.y?.toFixed(1)} blockY=${block.lines[0]?.y?.toFixed(1)} left=${target.text.slice(-100)} right=${block.text.slice(0, 100)}`);
      }
      if (joinsCompleteLeadingContinuation && completeLeadingContinuation) {
        target.text = joinHyphenated(target.text, completeLeadingContinuation.text).replace(/\s+/g, " ").trim();
        target.lines = [...target.lines, ...completeLeadingContinuation.lines];
        block.lines = block.lines.slice(completeLeadingContinuation.lines.length);
        if (block.lines.length > 0) {
          block.text = joinLines(block.lines);
          block.pageStart = block.lines[0].page;
          block.pageEnd = block.lines.at(-1)!.page;
          block.bbox = blockBbox(block.lines);
          result.push(block);
        }
      } else {
        target.text = joinHyphenated(target.text, block.text).replace(/\s+/g, " ").trim();
        target.lines = [...target.lines, ...block.lines];
        target.pageEnd = block.pageEnd;
      }
      target.bbox = blockBbox(target.lines);
      if (target.column !== block.column) target.preserveColumnContinuation = true;
      continue;
    }
    result.push(block);
  }
  return result.map((block) =>
    isRepeatedEdgeMarker(block, repeatedTexts)
      ? { ...block, role: "footer" as LayoutRole }
      : isRepeatedRunningHeader(block, repeatedTexts)
        ? { ...block, role: "header" as LayoutRole }
      : block
  );
}

function columnBand(
  column: LayoutColumn,
  layout: PageColumnLayout
): { x: number; width: number } {
  const leftMargin = Math.max(layout.leftX - 10, 18);
  const rightMargin = 18;
  if (!layout.isMultiColumn || column === "spanning" || column === "single") {
    return {
      x: leftMargin,
      width: Math.max(40, layout.pageWidth - leftMargin - rightMargin),
    };
  }
  if (column === "left") {
    return {
      x: leftMargin,
      width: Math.max(40, layout.gutterX - leftMargin - 10),
    };
  }
  return {
    x: layout.gutterX + 8,
    width: Math.max(40, layout.pageWidth - layout.gutterX - 8 - rightMargin),
  };
}

function overlapsBand(
  box: BoundingBox,
  band: { x: number; width: number }
): boolean {
  return box.x < band.x + band.width && band.x < box.x + box.width;
}

function isSubstantialCropBound(block: LayoutBlock): boolean {
  if (
    block.role === "heading" ||
    block.role === "title" ||
    block.role === "figure_caption" ||
    block.role === "table_caption" ||
    block.role === "author" ||
    block.role === "affiliation"
  ) {
    return true;
  }
  if (block.role === "paragraph") {
    return block.text.replace(/\s+/g, " ").trim().length >= 48;
  }
  return false;
}

export function figureLookupKey(text: string, page: number): string {
  const match = layoutPlain(text).match(/^(?:figure|fig\.?|tables?|図|表)\s*(\d+[a-z]?)/i);
  return match ? `${page}:${match[1]}` : `${page}:${text.slice(0, 48)}`;
}

/**
 * Region immediately above a figure caption, used to rasterize the figure.
 * Top-origin coordinates, matching layout bboxes.
 */
export function figureImageRect(
  caption: LayoutBlock,
  blocks: LayoutBlock[],
  layout: PageColumnLayout
): BoundingBox | null {
  const band = columnBand(caption.column, layout);
  const captionTop = caption.bbox.y;
  let topBound = HEADER_Y;

  for (const block of blocks) {
    if (block.pageStart !== caption.pageStart) continue;
    if (
      block.role === caption.role &&
      block.text === caption.text &&
      Math.abs(block.bbox.y - caption.bbox.y) < 0.5
    ) {
      continue;
    }
    if (
      block.role === "header" ||
      block.role === "footer" ||
      block.role === "copyright"
    ) {
      continue;
    }
    if (!isSubstantialCropBound(block)) continue;
    const blockBottom = block.bbox.y + block.bbox.height;
    if (blockBottom > captionTop - 2) continue;
    if (!overlapsBand(block.bbox, band)) continue;
    if (blockBottom > topBound) topBound = blockBottom;
  }

  const pad = 3;
  let y = topBound + pad;
  const bottom = captionTop - pad;
  let height = bottom - y;
  if (height < 36) return null;

  const maxHeight = layout.pageHeight * 0.58;
  if (height > maxHeight) {
    y = bottom - maxHeight;
    height = maxHeight;
  }

  const x = Math.max(0, Math.min(band.x, caption.bbox.x) - 6);
  const right = Math.min(
    layout.pageWidth,
    Math.max(band.x + band.width, caption.bbox.x + caption.bbox.width) + 6
  );

  return {
    page: caption.pageStart,
    x,
    y,
    width: Math.max(24, right - x),
    height,
  };
}

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function rectOverlapArea(a: LayoutRect, b: LayoutRect): number {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  );
  return width * height;
}

/**
 * Assign each rectangle to at most one region: the region with the largest
 * unpadded overlap. Side-by-side figures must not share an image just because
 * a crop band's padding touches the neighbor.
 */
export function assignRectsToRegions<T extends LayoutRect>(
  rects: T[],
  regions: { id: string; rect: LayoutRect }[]
): Map<string, T[]> {
  const assigned = new Map<string, T[]>();
  for (const region of regions) {
    if (!assigned.has(region.id)) assigned.set(region.id, []);
  }

  for (const rect of rects) {
    let bestId: string | null = null;
    let bestArea = 0;
    let bestCenterDist = Number.POSITIVE_INFINITY;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    for (const region of regions) {
      const area = rectOverlapArea(rect, region.rect);
      if (area <= 0) continue;
      const rx = region.rect.x + region.rect.width / 2;
      const ry = region.rect.y + region.rect.height / 2;
      const dist = (cx - rx) ** 2 + (cy - ry) ** 2;
      const closer = Math.abs(area - bestArea) <= 0.5 && dist < bestCenterDist;
      if (area > bestArea + 0.5 || closer) {
        bestArea = area;
        bestCenterDist = dist;
        bestId = region.id;
      }
    }

    if (bestId) assigned.get(bestId)?.push(rect);
  }

  return assigned;
}

export function reconstructDocument(pages: ExtractedPage[]): {
  layouts: PageColumnLayout[];
  lines: LayoutLine[];
  blocks: LayoutBlock[];
  baseFontSize: number;
} {
  const patterns = detectHeaderFooterPatterns(pages);
  const layouts = pages.map(detectPageColumns);
  const lines: LayoutLine[] = [];

  for (let i = 0; i < pages.length; i++) {
    lines.push(...buildPageLines(pages[i], layouts[i], patterns));
  }

  const bodyFont = median(
    lines
      .filter((l) => l.text.length > 40)
      .map((l) => l.fontSize)
  ) || 10;

  const blocks = groupLinesIntoBlocks(lines, bodyFont);
  // A masthead in the opposite horizontal band can interrupt title lines in
  // y-sorted native reading order. Reattach only short, same-style lines that
  // align with the title and leave unrelated lines in their original block.
  for (const title of blocks.filter((block) => block.role === "title" && block.pageStart === 1)) {
    const lastTitleLine = title.lines.at(-1);
    if (!lastTitleLine) continue;
    for (let blockIndex = blocks.indexOf(title) + 1; blockIndex < blocks.length; blockIndex++) {
      const candidateBlock = blocks[blockIndex];
      if (candidateBlock.pageStart !== 1) break;
      const matchingLines = candidateBlock.lines.filter((line) =>
        line.y > (title.lines.at(-1)?.y ?? lastTitleLine.y) &&
        line.y - (title.lines.at(-1)?.y ?? lastTitleLine.y) <= Math.max(bodyFont * 2.8, line.fontSize * 1.35) &&
        Math.abs(line.x - lastTitleLine.x) <= 6 &&
        Math.abs(line.fontSize - lastTitleLine.fontSize) <= 1.2 &&
        line.text.trim().length <= 48 &&
        line.text.trim().split(/\s+/).filter(Boolean).length <= 6 &&
        !looksLikePersonName(line.text) && !looksLikeEmail(line.text)
      );
      if (matchingLines.length === 0) continue;
      const matchingSet = new Set(matchingLines);
      const remainingLines = candidateBlock.lines.filter((line) => !matchingSet.has(line));
      title.lines.push(...matchingLines);
      title.lines.sort((a, b) => a.y - b.y || a.x - b.x);
      title.text = title.lines.map((line) => line.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      title.pageEnd = 1;
      title.bbox = blockBbox(title.lines);
      if (remainingLines.length === 0) {
        blocks.splice(blockIndex, 1);
        blockIndex--;
      } else {
        candidateBlock.lines = remainingLines;
        candidateBlock.text = remainingLines.map((line) => line.text.trim()).join(" ").replace(/\s+/g, " ").trim();
        candidateBlock.bbox = blockBbox(remainingLines);
      }
      break;
    }
  }
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG === "1") {
    console.warn(`[PDF_GROUPED_LINES] lines=${lines.length} blocks=${blocks.length} bodyFont=${bodyFont.toFixed(2)}`);
    lines.forEach((line, index) => {
      console.warn(`[PDF_LINE] index=${index} page=${line.page} column=${line.column} x=${line.x.toFixed(1)} y=${line.y.toFixed(1)} font=${line.fontSize.toFixed(1)} items=${line.items.length} text=${line.text.slice(0, 120)}`);
    });
  }
  return { layouts, lines, blocks, baseFontSize: bodyFont };
}

export function formatReadingOrderLog(
  blocks: LayoutBlock[],
  options: { pages?: number[] } = {}
): string {
  const wanted = options.pages ? new Set(options.pages) : null;
  const parts: string[] = [];
  let lastPage = -1;
  let lastColumn: LayoutColumn | null = null;

  for (const block of blocks) {
    if (wanted && !wanted.has(block.pageStart)) continue;
    if (block.role === "header" || block.role === "footer") continue;
    if (block.pageStart !== lastPage) {
      parts.push(`\n===== PAGE ${block.pageStart} =====`);
      lastPage = block.pageStart;
      lastColumn = null;
    }
    if (block.column !== lastColumn) {
      parts.push(`--- column: ${block.column} ---`);
      lastColumn = block.column;
    }
    parts.push(`[${block.role}] ${block.text}`);
  }
  return parts.join("\n");
}
