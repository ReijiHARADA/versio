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
  | "chrome"
  | "header"
  | "footer"
  | "title"
  | "author"
  | "affiliation"
  | "heading"
  | "paragraph"
  | "figure_caption"
  | "table_caption"
  | "table"
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
  /** First-page asymmetric metadata rail beside a wide abstract column. */
  isAsymmetricRail?: boolean;
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
  /** Repeated multi-column geometry indicates a table row; never merge it into neighboring prose rows. */
  isGridRow?: boolean;
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
  /** Set when a same-page adjacent text-band continuation was proven. */
  adjacentBandContinuation?: boolean;
  /** A bare caption identifier was rejoined with a detached native title. */
  detachedCaptionTitleRepaired?: boolean;
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

  // Page-level rotation is already normalized into displayed coordinates at
  // extraction time. Treat the rotated page as one reading surface here: the
  // apparent x bands on landscape tables are cell columns, not document
  // columns. Synthetic rotated text items without page rotation retain the
  // existing column heuristics.
  if (Math.abs((page.rotation ?? 0) % 180) >= 45) return fallback;

  // A single-column PDF can contain several native text spans per visual
  // line. When most wide body rows include a span crossing the page midpoint,
  // the apparent left/right starts are fragments of one sentence, not two
  // columns. Make this decision before histogram/pair detection: both of
  // those otherwise amplify the same false peaks. Genuine two-column pages
  // may have a spanning title or caption, but not a persistent majority of
  // midpoint-crossing body rows.
  const midpointRows = (() => {
    const rows: ExtractedTextItem[][] = [];
    for (const item of [...usable].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.find((candidate) =>
        Math.abs(candidate[0].y - item.y) <= Math.max(2.5, item.fontSize * 0.3)
      );
      if (row) row.push(item);
      else rows.push([item]);
    }
    return rows.filter((row) => {
      const left = Math.min(...row.map((item) => item.x));
      const right = Math.max(...row.map((item) => item.x + item.width));
      return right - left > page.width * 0.55;
    });
  })();
  const hasSeparateColumnSpans = (row: ExtractedTextItem[]) =>
    row.some((item) => item.x < page.width * 0.5 && item.width >= page.width * 0.25) &&
    row.some((item) => item.x >= page.width * 0.5 && item.width >= page.width * 0.25);
  const midpointBridgedRows = midpointRows.filter((row) =>
    !hasSeparateColumnSpans(row) &&
    row.some((item) => item.x < page.width * 0.5 && item.x + item.width > page.width * 0.5)
  ).length;
  if (midpointBridgedRows >= 8 && midpointBridgedRows / Math.max(midpointRows.length, 1) >= 0.55) {
    return fallback;
  }

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

  // Some reference-heavy journal pages encode the left column as long text
  // spans but the right column as one native span per word. The ordinary
  // column detector intentionally ignores those short right spans, which can
  // make both columns appear to be one line and later mix their reading order.
  // Require persistent, separated geometry on both sides so a sidebar or a
  // single figure label cannot trigger this profile.
  const asymmetricWordColumns = (() => {
    const leftLong = usable.filter((item) =>
      item.x < page.width * 0.48 && item.width >= page.width * 0.25 &&
      item.width <= page.width * 0.55 && Math.abs(item.rotation ?? 0) < 45
    );
    const rightWords = usable.filter((item) =>
      item.x >= page.width * 0.5 && item.width <= page.width * 0.24 &&
      Math.abs(item.rotation ?? 0) < 45
    );
    const rightRows: number[] = [];
    for (const item of [...rightWords].sort((a, b) => a.y - b.y)) {
      const previous = rightRows.at(-1);
      if (previous === undefined || item.y - previous > Math.max(3, item.fontSize * 0.45)) rightRows.push(item.y);
    }
    if (leftLong.length < 8 || rightWords.length < 40 || rightRows.length < 8) return null;
    const leftX = median(leftLong.map((item) => item.x));
    // The right column is word-split, so its median x is deep inside the
    // column. Use the leading edge to keep short spans attached to the right
    // column during line clustering and reading-order reconstruction.
    const rightX = Math.min(...rightWords.map((item) => item.x));
    if (rightX - leftX < page.width * 0.35) return null;
    return { leftX, rightX };
  })();

  // Some journal first pages use an asymmetric metadata rail: a narrow
  // `Article history`/`Keywords` column sits beside a wide abstract column.
  // The ordinary two-column detector intentionally ignores the short rail
  // lines, which can make the abstract continue after the rail's keywords
  // (`... pa` + `tient data ...`). Detect this layout from persistent x bands
  // and y overlap without treating a title/author row as a column profile.
  const asymmetricRail = (() => {
    if (page.pageNumber !== 1) return null;
    // A lone `Abstract` heading is common in ordinary two-column papers and
    // is not enough to identify a metadata rail. Require the rail-specific
    // labels that distinguish article-info/keyword sidebars from a normal
    // abstract beside an author masthead.
    const pageText = page.textItems.map((item) => item.text).join(" ");
    if (!/article\s+history|keywords\s*:/i.test(pageText)) return null;
    const left = usable.filter((item) =>
      item.y >= page.height * 0.36 && item.x <= page.width * 0.18 && item.width <= page.width * 0.28 &&
      Math.abs(item.rotation ?? 0) < 5
    );
    const right = usable.filter((item) =>
      item.y >= page.height * 0.36 && item.x >= page.width * 0.28 && item.x <= page.width * 0.55 &&
      item.width >= 8 && Math.abs(item.rotation ?? 0) < 5
    );
    if (left.length < 15 || right.length < 30) return null;
    const leftY = { min: Math.min(...left.map((item) => item.y)), max: Math.max(...left.map((item) => item.y)) };
    const rightY = { min: Math.min(...right.map((item) => item.y)), max: Math.max(...right.map((item) => item.y)) };
    const overlap = Math.min(leftY.max, rightY.max) - Math.max(leftY.min, rightY.min);
    if (overlap < 100 || leftY.max - leftY.min < 140 || rightY.max - rightY.min < 100) return null;
    return {
      leftX: median(left.map((item) => item.x)),
      rightX: Math.min(...right.map((item) => item.x)),
      leftCount: left.length,
      rightCount: right.length,
    };
  })();
  if (process.env.PDF_LAYOUT_DEBUG === "columns" && page.pageNumber === 1) {
    console.warn(`[PDF_COLUMNS] asymmetric=${JSON.stringify(asymmetricRail)} sample=${sample.length}`);
  }

  if (sample.length < MIN_COLUMN_ITEMS * 2) {
    if (!alignedColumnPairs && !asymmetricWordColumns) return fallback;
  }

  const rowStartPeaks = findTwoRowStarts(usable, page.width);
  const peaks = alignedColumnPairs
    ? [alignedColumnPairs.leftX, alignedColumnPairs.rightX] as [number, number]
    : asymmetricWordColumns
      ? [asymmetricWordColumns.leftX, asymmetricWordColumns.rightX] as [number, number]
    : asymmetricRail
      ? [asymmetricRail.leftX, asymmetricRail.rightX] as [number, number]
    : rowStartPeaks ??
      findTwoXPeaks(sample.map((item) => item.x), page.width * 0.18);
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
    : asymmetricWordColumns
      ? rightX - leftX >= page.width * 0.35 && leftLong.length >= 8 &&
        usable.filter((item) => item.x >= page.width * 0.5 && item.width <= page.width * 0.24).length >= 40
    : asymmetricRail
      ? rightX - leftX >= page.width * 0.15 && asymmetricRail.leftCount >= 15 && asymmetricRail.rightCount >= 30
    : leftItems.length >= MIN_COLUMN_ITEMS &&
      rightItems.length >= MIN_COLUMN_ITEMS &&
      (rowStartPeaks != null || (leftLong.length >= MIN_COLUMN_ITEMS &&
        rightLong.length >= MIN_COLUMN_ITEMS ||
        (denseWordColumns || denseUsableColumns))) &&
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
    isAsymmetricRail: Boolean(asymmetricRail),
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

/**
 * Detect column origins from native word rows. Some PDFs emit one text item
 * per word, so a histogram of individual x positions is too diffuse to see
 * the two columns. Grouping by baseline first preserves the repeated origins
 * without depending on a publisher-specific font or title layout.
 */
function findTwoRowStarts(
  items: ExtractedTextItem[],
  pageWidth: number
): [number, number] | null {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: ExtractedTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) =>
      Math.abs(candidate[0].y - item.y) <= Math.max(2.5, item.fontSize * 0.3)
    );
    if (row) row.push(item);
    else rows.push([item]);
  }
  const starts: Array<{ x: number; y: number }> = [];
  for (const row of rows) {
    if (row.length < 2) continue;
    const left = Math.min(...row.map((item) => item.x));
    const right = Math.max(...row.map((item) => item.x + item.width));
    if (right - left <= pageWidth * 0.55) {
      starts.push({ x: left, y: row[0].y });
      continue;
    }
    // When both columns share a baseline, the row itself spans the gutter.
    // Count each side independently instead of discarding the row as a
    // full-width title or figure line.
    // A native span that crosses the page midpoint is a strong single-column
    // signal. Previously it was excluded from both side arrays, leaving only
    // the words at either edge and manufacturing two false column starts in
    // justified single-column PDFs.
    const hasSeparateColumnSpans =
      row.some((item) => item.x < pageWidth * 0.5 && item.width >= pageWidth * 0.25) &&
      row.some((item) => item.x >= pageWidth * 0.5 && item.width >= pageWidth * 0.25);
    if (!hasSeparateColumnSpans && row.some((item) => item.x < pageWidth * 0.5 && item.x + item.width > pageWidth * 0.5)) {
      starts.push({ x: left, y: row[0].y });
      continue;
    }
    const leftItems = row.filter((item) => item.x + item.width <= pageWidth * 0.5);
    const rightItems = row.filter((item) => item.x >= pageWidth * 0.5);
    if (leftItems.length >= 2) starts.push({ x: Math.min(...leftItems.map((item) => item.x)), y: row[0].y });
    if (rightItems.length >= 2) starts.push({ x: Math.min(...rightItems.map((item) => item.x)), y: row[0].y });
  }
  const binSize = 8;
  const bins = new Map<number, number>();
  for (const point of starts) {
    const bin = Math.round(point.x / binSize) * binSize;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  const ranked = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  const first = ranked[0];
  const second = first && ranked.find((peak) =>
    Math.abs(peak[0] - first[0]) >= pageWidth * 0.28
  );
  if (!first || !second || first[1] < MIN_COLUMN_ITEMS || second[1] < MIN_COLUMN_ITEMS ||
      second[1] < first[1] * 0.55) {
    return null;
  }
  const yRange = (x: number) => {
    const ys = starts.filter((point) => Math.abs(point.x - x) <= binSize).map((point) => point.y);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  };
  const leftRange = yRange(first[0]);
  const rightRange = yRange(second[0]);
  const overlap = Math.min(leftRange.max, rightRange.max) - Math.max(leftRange.min, rightRange.min);
  if (overlap < 80 || leftRange.max - leftRange.min < 120 || rightRange.max - rightRange.min < 120) {
    return null;
  }
  return [Math.min(first[0], second[0]), Math.max(first[0], second[0])];
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

function normalizeNativeSpacing(text: string): string {
  // Some native PDF text layers place a word immediately after a numeric
  // token (for example `949studies`) or omit the space after a sentence
  // terminator (`).Finally`). These are extraction boundaries, not source
  // content. Repair only unambiguous digit→lowercase-word and punctuation→
  // uppercase-word joins; identifiers such as `3D` and `rLPFC` are untouched.
  return text
    .replace(/(\d{2,})(?=[a-z]{3,}\b)/g, "$1 ")
    .replace(/([.!?])(?=[A-Z][a-z])/g, "$1 ")
    .replace(/(\d),\s+(?=\d{3}\s*[a-z])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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
  return normalizeNativeSpacing(out);
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

function splitSpanningGutterLines(lines: LayoutLine[], pageLayouts?: Map<number, PageColumnLayout>): LayoutLine[] {
  const result: LayoutLine[] = [];
  for (const line of lines) {
    if (line.items.length < 2) {
      result.push(line);
      continue;
    }
    const items = [...line.items].sort((a, b) => a.x - b.x);
    let largestGap = 0;
    let splitIndex = -1;
    for (let index = 1; index < items.length; index++) {
      const gap = items[index].x - (items[index - 1].x + items[index - 1].width);
      if (gap > largestGap) {
        largestGap = gap;
        splitIndex = index;
      }
    }
    const left = splitIndex > 0 ? items.slice(0, splitIndex) : [];
    const right = splitIndex > 0 ? items.slice(splitIndex) : [];
    const leftFont = median(left.map((item) => item.fontSize));
    const rightFont = median(right.map((item) => item.fontSize));
    const pageWidth = line.pageWidth ?? 612;
    const layout = pageLayouts?.get(line.page);
    const gutterGap = largestGap >= Math.max(48, pageWidth * 0.08);
    const shortRailPair = left.length <= 3 && right.length >= 4 && Math.abs(leftFont - rightFont) >= 1;
    // Some single-column journal pages place a narrow editor/reviewer rail
    // beside a full-width body line. Native PDF extraction can put both spans
    // into one line even when the gap is only ~15–25pt. Require a short rail,
    // a body-sized right span, and a clear font/width distinction before
    // splitting; ordinary prose word gaps do not satisfy this combination.
    const shortRailBodyPair = left.length <= 3 && right.length >= 1 &&
      left.reduce((sum, item) => sum + item.width, 0) <= Math.min(120, pageWidth * 0.2) &&
      right.reduce((max, item) => Math.max(max, item.width), 0) >= pageWidth * 0.45 &&
      largestGap >= Math.max(12, leftFont * 1.6) &&
      (Math.abs(leftFont - rightFont) >= 1 || leftFont <= rightFont * 0.86);
    const leftStart = left[0]?.x ?? Number.POSITIVE_INFINITY;
    const rightStart = right[0]?.x ?? Number.NEGATIVE_INFINITY;
    const fullColumnPair = Boolean(layout?.isMultiColumn &&
      left.length >= 4 && right.length >= 4 &&
      leftStart <= layout.leftX + pageWidth * 0.08 &&
      rightStart >= layout.rightX - pageWidth * 0.08 &&
      left.reduce((max, item) => Math.max(max, item.x + item.width), 0) - leftStart >= pageWidth * 0.28 &&
      right.reduce((max, item) => Math.max(max, item.x + item.width), 0) - rightStart >= pageWidth * 0.28 &&
      Math.abs(leftFont - rightFont) <= 1.5);
    const mixedColumnPair = Boolean(layout?.isMultiColumn &&
      largestGap >= Math.max(18, pageWidth * 0.025) &&
      leftStart <= layout.leftX + pageWidth * 0.08 &&
      rightStart >= layout.rightX - pageWidth * 0.08 &&
      left.reduce((max, item) => Math.max(max, item.x + item.width), 0) - leftStart >= pageWidth * 0.22 &&
      right.reduce((max, item) => Math.max(max, item.x + item.width), 0) - rightStart >= pageWidth * 0.08);
    const splitByGutter = (gutterGap && (shortRailPair || fullColumnPair || mixedColumnPair)) || shortRailBodyPair;
    if (!splitByGutter) {
      result.push(line);
      continue;
    }
    const pageMidpoint = (line.pageWidth ?? 612) * 0.48;
    const leftColumn = line.column === "spanning" ? "spanning" : line.x < pageMidpoint ? "left" : line.column;
    const rightColumn = right[0].x > pageMidpoint ? "right" : line.column;
    result.push(itemsToLine(left, leftColumn, line.page, line.pageHeight, line.pageWidth));
    result.push(itemsToLine(right, rightColumn, line.page, line.pageHeight, line.pageWidth));
  }
  return result;
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
  const sidebarBaselineTolerance = Math.max(yThreshold, median(items.map((item) => item.height)) * 0.7);
  const sidebarBands = (() => {
    // A publisher rail can sit beside a main text column even when the page
    // detector conservatively labels the page single-column (for example an
    // article-information/keywords rail beside an abstract). Some PDFs emit
    // the main text as one native item per word, so compare the assembled
    // horizontal runs on repeated baselines rather than each token's width.
    // Rotated table cells are excluded: their x coordinates do not describe
    // horizontal sidebar bands.
    const bodyStyleItems = items.filter((item) => item.fontSize <= fontBase * 1.35);
    if (bodyStyleItems.some((item) => Math.abs(item.rotation ?? 0) >= 45)) return null;

    const sorted = [...bodyStyleItems].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: ExtractedTextItem[][] = [];
    for (const item of sorted) {
      const row = rows.find((candidate) =>
        Math.abs(median(candidate.map((entry) => entry.y)) - item.y) <= yThreshold &&
        candidate.every((entry) => sameTextOrientation(entry.rotation, item.rotation))
      );
      if (row) row.push(item);
      else rows.push([item]);
    }

    const fragments: Array<{ x: number; width: number; y: number; fontSize: number }> = [];
    // Native spans inside prose are usually separated by a small word gap;
    // publisher tables often encode cells with a larger (but not huge) gap.
    // Keep those cells distinct so a 3+ column grid cannot masquerade as a
    // two-band margin rail.
    const segmentGap = Math.max(16, fontBase * 2);
    for (const row of rows) {
      const ordered = [...row].sort((a, b) => a.x - b.x);
      let segment: ExtractedTextItem[] = [];
      const flush = () => {
        if (segment.length === 0) return;
        const x = Math.min(...segment.map((entry) => entry.x));
        const right = Math.max(...segment.map((entry) => entry.x + entry.width));
        fragments.push({
          x,
          width: right - x,
          y: median(segment.map((entry) => entry.y)),
          fontSize: median(segment.map((entry) => entry.fontSize)),
        });
        segment = [];
      };
      for (const item of ordered) {
        const previous = segment.at(-1);
        const gap = previous ? item.x - (previous.x + previous.width) : 0;
        if (previous && gap > segmentGap) flush();
        segment.push(item);
      }
      flush();
    }

    const bands = new Map<number, typeof fragments>();
    for (const fragment of fragments) {
      const key = Math.round(fragment.x / 32) * 32;
      const band = bands.get(key);
      if (band) band.push(fragment);
      else bands.set(key, [fragment]);
    }
    const candidates = [...bands.entries()].sort((a, b) => a[0] - b[0]);
    const distinctRows = (ys: number[]) => {
      const sortedY = [...ys].sort((a, b) => a - b);
      const rows: number[] = [];
      for (const y of sortedY) {
        const last = rows.at(-1);
        if (last === undefined || y - last > yThreshold) rows.push(y);
      }
      return rows;
    };
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
      const [leftX, leftRuns] = candidates[leftIndex];
      if (distinctRows(leftRuns.map((run) => run.y)).length < 2) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
        const [rightX, rightRuns] = candidates[rightIndex];
        const matchedRuns: Array<{ left: (typeof leftRuns)[number]; right: (typeof rightRuns)[number] }> = [];
        for (const leftRun of leftRuns) {
          if (leftRun.width <= 0 || leftRun.width > 140) continue;
          const rightRun = rightRuns.find((candidateRun) =>
            Math.abs(candidateRun.y - leftRun.y) <= sidebarBaselineTolerance &&
            candidateRun.width >= Math.max(fontBase * 10, leftRun.width * 2.5) &&
            Math.abs(candidateRun.fontSize - leftRun.fontSize) <= Math.max(1.2, fontBase * 0.2)
          );
          if (rightRun) matchedRuns.push({ left: leftRun, right: rightRun });
        }
        const matchedRows = distinctRows(matchedRuns.map(({ left }) => left.y));
        const rowSpan = matchedRows.length > 1 ? Math.max(...matchedRows) - Math.min(...matchedRows) : 0;
        if ((matchedRows.length < 4 && rowSpan < fontBase * 2) || rightX - leftX < 80) continue;
        // Keep the actual co-baseline run extents. A page can contain a real
        // table or a title elsewhere; page-wide x thresholds would mislabel
        // those unrelated lines as sidebar content.
        return { leftX, rightX, matchedRuns };
      }
    }
    return null;
  })();
  const debugLayout = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (debugLayout === "1" && sidebarBands) {
    console.info(`[SIDEBAR_BANDS] page=${pageNumber} left=${sidebarBands.leftX} right=${sidebarBands.rightX} matchedRows=${sidebarBands.matchedRuns.length}`);
  }
  const sidebarSide = (item: ExtractedTextItem): "left" | "right" | null => {
    if (!sidebarBands) return null;
    const itemBand = Math.round(item.x / 32) * 32;
    const leftMatch = sidebarBands.matchedRuns.find(({ left }) =>
      Math.abs(item.y - left.y) <= sidebarBaselineTolerance &&
      (itemBand === sidebarBands.leftX || (item.x >= left.x - 8 && item.x <= left.x + left.width + 3))
    );
    if (leftMatch) return "left";
    const rightMatch = sidebarBands.matchedRuns.find(({ right }) =>
      Math.abs(item.y - right.y) <= sidebarBaselineTolerance &&
      (itemBand === sidebarBands.rightX || (item.x >= right.x - 8 && item.x <= right.x + right.width + 3))
    );
    if (rightMatch) return "right";
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

  // Detect repeated cell columns before line cells are joined into one text
  // stream. Ordinary prose has one broad run per baseline; tables retain at
  // least three recurring x-start bands across several rows. This keeps
  // physical rows from collapsing into one long paragraph without guessing
  // cell semantics or rewriting the native text.
  // Table cell gutters can be smaller than a body font's full word gap (the
  // HAI guideline PDF uses a ~12pt company-to-guideline gap at 7pt type).
  // For grid evidence, split at clearly visible whitespace while preserving
  // ordinary inter-word spacing in same-line text.
  const gridSegmentGap = Math.max(4, fontBase * 0.65);
  const groupSegments = groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    const starts: number[] = [];
    let right = -Infinity;
    for (const item of ordered) {
      if (item.x - right > gridSegmentGap) starts.push(item.x);
      right = Math.max(right, item.x + item.width);
    }
    return [...new Set(starts.map((x) => Math.round(x / 32) * 32))];
  });
  const baselineRows: Array<{ y: number; rotation: number; groupIndexes: number[]; bands: Set<number> }> = [];
  groupSegments.forEach((bands, groupIndex) => {
    const rotation = representativeTextRotation(groups[groupIndex].map((item) => item.rotation ?? 0));
    let row = baselineRows.find((candidate) =>
      Math.abs(candidate.y - groupY[groupIndex]) <= yThreshold &&
      sameTextOrientation(candidate.rotation, rotation)
    );
    if (!row) {
      row = { y: groupY[groupIndex], rotation, groupIndexes: [], bands: new Set<number>() };
      baselineRows.push(row);
    }
    row.groupIndexes.push(groupIndex);
    for (const band of bands) row.bands.add(band);
    row.y = median(row.groupIndexes.map((index) => groupY[index]));
  });
  const bandRows = new Map<number, number>();
  for (const row of baselineRows) {
    for (const band of row.bands) bandRows.set(band, (bandRows.get(band) ?? 0) + 1);
  }
  const recurringGridBands = new Set(
    [...bandRows].filter(([, rowCount]) => rowCount >= 6).map(([band]) => band),
  );
  const gridRows = new Set<number>();
  const gridCandidateRows = baselineRows
    .filter((row) => [...row.bands].filter((band) => recurringGridBands.has(band)).length >= 3)
    .sort((a, b) => a.y - b.y);
  // Repeated x bands are page-level evidence, but a table is a local region.
  // A justified prose line can accidentally align with table columns farther
  // down the page; splitting that isolated line into cells corrupts paragraph
  // reconstruction.  Keep only dense runs of at least three neighbouring
  // grid-shaped rows.  Real tables repeat their columns on consecutive rows,
  // while coincidental prose alignment is normally isolated.
  const localGap = Math.max(24, fontBase * 2.4);
  let cluster: typeof gridCandidateRows = [];
  const flushGridCluster = () => {
    if (cluster.length >= 3) {
      for (const row of cluster) {
        for (const index of row.groupIndexes) gridRows.add(index);
      }
    }
    cluster = [];
  };
  for (const row of gridCandidateRows) {
    const previous = cluster.at(-1);
    if (previous && row.y - previous.y > localGap) flushGridCluster();
    cluster.push(row);
  }
  flushGridCluster();
  if (!sidebarBands) gridRows.clear();
  if (debugLayout === "1" && gridRows.size > 0) {
    console.info(`[REPEATED_GRID] page=${pageNumber} columns=${recurringGridBands.size} rows=${gridRows.size}`);
  }

  const separatedGroups = groups.flatMap((group, groupIndex) => {
    if (sidebarBands && gridRows.has(groupIndex)) {
      const ordered = [...group].sort((a, b) => a.x - b.x);
      const segments: ExtractedTextItem[][] = [];
      let segment: ExtractedTextItem[] = [];
      let right = -Infinity;
      const cellGap = Math.max(4, fontBase * 0.65);
      for (const item of ordered) {
        if (segment.length > 0 && item.x - right > cellGap) {
          segments.push(segment);
          segment = [];
        }
        segment.push(item);
        right = Math.max(right, item.x + item.width);
      }
      if (segment.length > 0) segments.push(segment);
      if (segments.length >= 3) return segments.map((part) => ({ part, isGridRow: true }));
    }
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
    if (rotated.length >= 4 && (horizontalWords >= 4 || shortHorizontalProse)) {
      return [rotated, horizontal].map((part) => ({ part, isGridRow: gridRows.has(groupIndex) }));
    }
    // A rotated matrix and its explanatory footnote can share a baseline and
    // rotation.  Matrix cells are short native items; the footnote is a
    // sentence-sized item. Split only with several short rotated cells plus a
    // clearly prose-like rotated item, preserving both source texts.
    const rotatedCells = rotated.filter((item) => item.width <= 48 && item.text.trim().split(/\s+/).length <= 3);
    const rotatedProse = rotated.filter((item) => item.width > 80 || item.text.trim().split(/\s+/).length >= 4);
    if (rotatedCells.length >= 3 && rotated.length >= 4 && rotatedProse.length > 0) {
      return [rotatedCells, rotated.filter((item) => !rotatedCells.includes(item))].map((part) => ({ part, isGridRow: gridRows.has(groupIndex) }));
    }
    return [{ part: group, isGridRow: gridRows.has(groupIndex) }];
  });
  const outputLines = separatedGroups
    .map(({ part, isGridRow }) => ({
      ...itemsToLine(part, column, pageNumber, pageHeight, pageWidth),
      isGridRow,
    }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.y - b.y);
  const tracePage = Number.parseInt(
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_TRACE_PAGE ?? "",
    10,
  );
  if (Number.isFinite(tracePage) && tracePage === pageNumber) {
    for (const line of outputLines) {
      const xBands = [...new Set(line.items.map((item) => Math.round(item.x / 32) * 32))];
      if (xBands.length > 1 || line.width > (pageWidth ?? 612) * 0.72) {
        console.info(`[PDF_LAYOUT_TRACE] page=${pageNumber} column=${line.column} y=${line.y.toFixed(2)} x=${line.x.toFixed(2)} width=${line.width.toFixed(2)} bands=${xBands.join(",")} text=${JSON.stringify(line.text)}`);
      }
    }
  }
  return outputLines;
}

/** Split a bold inline subsection label from the body text that follows it.
 * Some journal templates keep `Subjects.` / `Experimental Procedure.` and
 * the first sentence on one baseline.  Treating the whole line as prose
 * loses the structural label; splitting is allowed only for a short bold
 * prefix with a sentence-like non-bold suffix, preserving the native items.
 */
function splitInlineSubheading(line: LayoutLine): LayoutLine[] {
  if (Math.abs(line.rotation ?? 0) >= 45 || line.items.length < 2) return [line];
  const ordered = [...line.items].sort((a, b) => a.x - b.x).flatMap((item) => {
    // A PDF producer may keep a rail prefix and a body label/content in one
    // native item. Preserve round-trip text while exposing the label boundary
    // to the structural splitter using proportional synthetic geometry.
    const match = item.text.match(/^([A-Za-z][A-Za-z -]{1,31}:)\s+(.+)$/);
    if (!match) return [item];
    const labelWidth = item.width * (match[1].length / (match[1].length + match[2].length));
    return [
      { ...item, text: match[1], width: labelWidth },
      { ...item, text: match[2], x: item.x + labelWidth + Math.max(1.5, item.fontSize * 0.2), width: Math.max(0, item.width - labelWidth) },
    ];
  });
  // Keep a short diagram annotation at the end of a prose span from being
  // concatenated into the paragraph. This uses geometry and span shape only;
  // it does not depend on annotation vocabulary.
  if (ordered.length === 2) {
    const [body, annotation] = ordered;
    const gap = annotation.x - (body.x + body.width);
    if (body.width >= (line.pageWidth ?? 612) * 0.45 && annotation.width <= 90 &&
        gap >= Math.max(12, line.fontSize * 1.4) &&
        /^[A-Z][^.!?]{0,32}[.!?]?$/u.test(annotation.text.trim())) {
      return [
        itemsToLine([body], line.column, line.page, line.pageHeight, line.pageWidth),
        { ...itemsToLine([annotation], line.column, line.page, line.pageHeight, line.pageWidth), roleHint: "chrome" },
      ];
    }
  }
  // A sidebar citation/author run can share a baseline with a body metadata
  // label (`... authors, Keywords: ...`). Split at the native label run when
  // the right-hand band is substantial and the left band is rail-sized.
  for (let splitIndex = 1; splitIndex < ordered.length; splitIndex++) {
    const label = ordered[splitIndex].text.trim();
    if (!/^[A-Za-z][A-Za-z -]{1,31}:$/.test(label)) continue;
    const leftItems = ordered.slice(0, splitIndex);
    const rightItems = ordered.slice(splitIndex);
    const leftText = joinItemTexts(leftItems).trim();
    const rightText = joinItemTexts(rightItems).trim();
    const leftRight = leftItems.at(-1)!.x + leftItems.at(-1)!.width;
    const gap = rightItems[0].x - leftRight;
    if (leftText.length < 12 || leftText.length > 180 || rightText.split(/\s+/).length < 4 ||
        leftRight > (line.pageWidth ?? 612) * 0.34 || gap < Math.max(4, line.fontSize * 0.35)) continue;
    const make = (items: ExtractedTextItem[]): LayoutLine => itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth);
    return [make(leftItems), { ...make(rightItems), roleHint: "heading" }];
  }
  // Large display-title spans can share a baseline with a small, all-caps
  // publisher label (for example an open-access badge). Separate this clear
  // native typography/gutter transition before role resolution so the label
  // cannot demote the title continuation to affiliation/body text.
  for (let splitIndex = 1; splitIndex < ordered.length; splitIndex++) {
    const leadingItems = ordered.slice(0, splitIndex);
    const displayItems = ordered.slice(splitIndex);
    const leadingText = joinItemTexts(leadingItems).trim();
    const displayText = joinItemTexts(displayItems).trim();
    const leadingWords = leadingText.split(/\s+/).filter(Boolean);
    const leadingFont = median(leadingItems.map((item) => item.fontSize));
    const displayFont = median(displayItems.map((item) => item.fontSize));
    const gutter = displayItems[0].x - (leadingItems.at(-1)!.x + leadingItems.at(-1)!.width);
    const compactCapsLabel = leadingText.length <= 32 && leadingWords.length <= 4 &&
      /^[A-Z][A-Z\s.'’’-]*$/.test(leadingText);
    const displaySpan = displayText.length <= 180 && displayFont >= leadingFont * 1.7;
    if (!compactCapsLabel || !displaySpan || gutter < Math.max(36, displayFont * 2.5)) continue;
    const makePart = (items: ExtractedTextItem[]): LayoutLine => ({
      ...itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth),
      isGridRow: line.isGridRow,
    });
    return [makePart(leadingItems), makePart(displayItems)];
  }

  // Some publisher templates render an abstract metadata label and its prose
  // on the same baseline, with neither run named "bold" (for example
  // `Background:` / `Methods:` / `Keywords:`).  Preserve the native run
  // boundary when a compact colon-terminated prefix has a distinct font and
  // the suffix is substantial prose or a keyword list.  This is deliberately
  // geometry/style based; it does not depend on a paper or publisher name.
  // Lowercase discourse lead-ins (`follows:`, `triggered:`, `following
  // comment:`) share the same geometry with an italic quote but are body
  // text — require Title Case / ALL CAPS before promoting the prefix.
  for (let splitIndex = 1; splitIndex < ordered.length; splitIndex++) {
    const prefixItems = ordered.slice(0, splitIndex);
    const suffixItems = ordered.slice(splitIndex);
    const prefix = joinItemTexts(prefixItems).trim();
    const suffix = joinItemTexts(suffixItems).trim();
    const labelBody = prefix.replace(/:$/, "").trim();
    const prefixWords = labelBody.split(/\s+/).filter(Boolean);
    const suffixWords = suffix.split(/\s+/).filter(Boolean);
    const prefixFontNames = new Set(prefixItems.map((item) => item.fontName));
    const suffixFontNames = new Set(suffixItems.map((item) => item.fontName));
    const prefixFont = median(prefixItems.map((item) => item.fontSize));
    const suffixFont = median(suffixItems.map((item) => item.fontSize));
    const gap = suffixItems[0].x - (prefixItems.at(-1)!.x + prefixItems.at(-1)!.width);
    const structuralColonLabel =
      /^[A-Z][A-Za-z]*(?:[\s-][A-Z][A-Za-z]*)*$/.test(labelBody) ||
      /^[A-Z]{2,}(?:\s+[A-Z]+)*$/.test(labelBody);
    const compactLabel = prefix.length <= 32 && prefixWords.length <= 4 && /:$/.test(prefix) &&
      /^[A-Za-z][A-Za-z -]*:$/.test(prefix) && structuralColonLabel;
    const distinctStyle = [...prefixFontNames].some((font) => !suffixFontNames.has(font));
    const substantialSuffix = suffixWords.length >= 5 || /,/.test(suffix);
    if (!compactLabel || !distinctStyle || !substantialSuffix ||
        gap < -1 || gap > Math.max(line.fontSize * 2.2, 18) ||
        prefixFont < suffixFont * 0.8 || prefixFont > suffixFont * 1.25) continue;
    const make = (items: ExtractedTextItem[]): LayoutLine => itemsToLine(items, line.column, line.page, line.pageHeight, line.pageWidth);
    return [{ ...make(prefixItems), roleHint: "heading" }, make(suffixItems)];
  }

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
      const prefixFontSize = median(bodyItems.map((item) => item.fontSize));
      const suffixFontSize = median(headingItems.map((item) => item.fontSize));
      // Some two-column PDFs place a larger subsection label on the same
      // baseline as the first body line. There is no horizontal gutter to
      // rely on, but the native font-size transition remains strong evidence
      // when the prefix is short and the suffix is sentence-like. Keep the
      // existing gutter path and require a conservative 12% size increase for
      // the baseline-overlap path so ordinary mixed-font prose is not split.
      const fontTransition = prefixFontSize >= suffixFontSize * 1.12;
      if (shortLabel && (gap >= Math.max(5, line.fontSize * 0.55) || fontTransition) && sentenceLikeSuffix && suffixFonts.size === 1) {
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

/** Vector figures may paint labels on the same baseline as nearby prose.
 * PDF.js then returns one native line containing a body run plus distant
 * label runs (for example `...demonstrations` beside `Linda Cab Hospital`).
 * When a dense graphics page has a nearby figure caption, split only those
 * large geometric gaps before block formation so labels cannot enter prose.
 */
function splitVectorFigureOverlayLines(lines: LayoutLine[], page: ExtractedPage): LayoutLine[] {
  if ((page.graphicsPrimitives?.length ?? 0) < 100) return lines;
  if (process.env.PDF_LAYOUT_DEBUG === "vector-split") console.warn(`[VECTOR_PAGE] page=${page.pageNumber} graphics=${page.graphicsPrimitives?.length ?? 0} lines=${lines.length}`);
  const captions = lines.filter((line) => /^(?:figure|fig\.?|図)\s*\d+[a-z]?\b/i.test(line.text.trim()) && line.y > 0);
  if (process.env.PDF_LAYOUT_DEBUG === "vector-split") console.warn(`[VECTOR_CAPTIONS] page=${page.pageNumber} ${captions.map((c) => `${c.y}:${c.text.slice(0,30)}`).join("|")}`);
  if (captions.length === 0) return lines;
  return lines.flatMap((line) => {
    if (line.items.length < 3 || captions.every((caption) => caption.y <= line.y || caption.y - line.y > 280)) return [line];
    const items = [...line.items].sort((a, b) => a.x - b.x);
    const groups: ExtractedTextItem[][] = [[]];
    for (const item of items) {
      const previous = groups.at(-1)!.at(-1);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap >= Math.max(24, line.fontSize * 2.8)) groups.push([]);
      groups.at(-1)!.push(item);
    }
    if (groups.length < 2) return [line];
    const distant = groups.slice(1).flat();
    const distantText = joinItemTexts(distant).trim();
    const distantWords = distantText.split(/\s+/).filter(Boolean);
    if (process.env.PDF_LAYOUT_DEBUG === "vector-split" && page.pageNumber === 2 && line.y < 300) console.warn(`[VECTOR_CANDIDATE] y=${line.y} groups=${groups.length} text=${JSON.stringify(distantText)}`);
    if (distantText.length > 90 || distantWords.length > 16 || /[.!?]$/.test(distantText)) return [line];
    if (process.env.PDF_LAYOUT_DEBUG === "vector-split") console.warn(`[VECTOR_SPLIT] ${line.page}:${line.y} groups=${groups.length} distant=${JSON.stringify(distantText)}`);
    return groups.map((group) => itemsToLine(group, line.column, line.page, line.pageHeight, line.pageWidth));
  });
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
    line.y < topBand * 1.35 &&
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
  // Include `|` for Frontiers-style `FIGURE 1 | Experimental design…`.
  if (/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*(?:\s*[:.|：–—-]|\s*$)/i.test(caption)) {
    return true;
  }
  // Some older journals omit punctuation after the figure number
  // (`Fig.2 Otto Künzli ...`, `FIGURE 1PRISMA…`). Keep this format structural
  // while excluding ordinary prose that starts with a finite verb
  // (`Fig. 2 shows ...`).
  const unpunctuated = caption.match(/^(?:figure|fig\.?|図)\s*\d+[a-z]?\s*(.+)$/i)?.[1] ?? "";
  if (unpunctuated && /^[A-ZÀ-ÖØ-Þ]/u.test(unpunctuated) &&
      !/^(?:shows?|illustrates?|depicts?|presents?|displays?|demonstrates?|summarizes?|reports?|represents?)\b/i.test(unpunctuated)) {
    return true;
  }
  // Older proceedings often use `Fig. 1, Caption title…` rather than a
  // colon or full stop. Treat only an uppercase title-like continuation as a
  // caption; a normal sentence such as `Figure 2, the body…` stays prose.
  return /^(?:[Ff]igure|[Ff]ig\.?)\s*\d+[a-z]?\s*,\s*(?!(?:the|a|an|this|that|these|those|we|our|it|they|in|on|for)\b)[A-Z]/.test(caption);
}

export function isTableCaption(text: string): boolean {
  const caption = layoutPlain(text);
  // Theses and technical reports commonly number tables hierarchically
  // (`Table 2.5`, `Table A.3.1`). Treat that numeric path as one structural
  // identifier instead of mistaking the first period for caption prose.
  const tableNumber = "(?:[a-z]+\\.)?\\d+(?:\\.\\d+)*[a-z]?";
  if (new RegExp(`^(?:tables?|表)\\s*${tableNumber}\\s*\\(continued\\)\\.?$`, "i").test(caption)) return true;
  // Some journal templates separate the number and title with a vertical bar
  // (`TABLE 2 | Baseline characteristics`). This is a structural delimiter,
  // unlike an inline prose reference such as `Table 2 shows ...`.
  if (new RegExp(`^(?:tables?|表)\\s*(?:${tableNumber}|[ivxlcdm]+)(?:\\s*[:.|：–—-]|\\s*$)`, "i").test(caption)) return true;
  // Journal captions frequently omit punctuation: `Table 5 Factor ...`.
  // Require a title-like continuation so ordinary prose such as `Table 1 is`
  // remains a paragraph.
  const continuation = caption.match(new RegExp(`^(?:tables?|表)\\s*(?:${tableNumber}|[ivxlcdm]+)\\s+(.+)$`, "i"))?.[1] ?? "";
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
  const explicitLicense = /^(?:©\s*\d{4}\b|open[-\s]access\b|license\s*\(\s*https?:\/\/creativecommons\.org|this\s+article\s+is\s+(?:licensed|distributed)\b)/i.test(text.trim());
  if (fontSize > baseFont * 0.92 && !explicitLicense) return false;
  // PDF text streams can interleave adjacent permission lines and break the
  // literal `Permission to make ...` prefix (for example `Ppersonal ...
  // areermission ...`).  Classify the block from several independent legal
  // boilerplate clauses instead of depending on that exact byte order.
  const permissionSignals = [
    /personal or classroom use is granted/i,
    /hard copies of all or part of this work/i,
    /commercial advantage/i,
    /copies bear this notice/i,
    /components of this work owned by others/i,
    /abstracting with credit is permitted/i,
    /prior specific permission/i,
    /permissions?@[\w.-]+/i,
  ].filter((pattern) => pattern.test(text)).length;
  return explicitLicense ||
    permissionSignals >= 2 ||
    /permission to make digital or hard copies/i.test(text) ||
    /\b(?:this\s+work\s+is\s+)?licensed\s+under\s+a\s+creative\s+commons\b/i.test(text) ||
    /\b(?:terms\s+of\s+the\s+)?creative\s+commons\s+(?:attribution\s+)?(?:license|licence)\b/i.test(text) ||
    /\bopen[-\s]access\s+article\s+distributed\s+under\b/i.test(text) ||
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

function splitInlineAuthorCopyNotice(line: LayoutLine): LayoutLine[] {
  const match = line.text.match(/(?:[*∗†‡§]\s*)?this is the unedited author(?:'|’)?s copy\b[\s\S]*?(?:https?:\/\/\S+|doi\.org\/\S+)/i);
  if (!match || match.index === undefined || match.index > 24) return [line];
  const end = match.index + match[0].length;
  const head = line.text.slice(0, end).trim();
  const tail = line.text.slice(end).trim();
  if (head.length < 40 || tail.length < 20) return [line];
  const ratio = Math.max(0.15, Math.min(0.85, head.length / line.text.length));
  return [
    { ...line, text: head, width: line.width * ratio },
    { ...line, text: tail, x: line.x + line.width * ratio, width: line.width * (1 - ratio) },
  ];
}

/**
 * Publisher license boilerplate is sometimes concatenated to a citation or
 * the last abstract line by native PDF text extraction. Split the metadata
 * tail before block formation so it cannot become translation input. The
 * marker set is intentionally structural (license/open-access language), not
 * tied to a publisher or paper.
 */
function splitInlineLicense(line: LayoutLine): LayoutLine[] {
  const match = line.text.match(/(?:©\s*\d{4}\b|\bopen[-\s]access\b|\bthis\s+article\s+is\s+(?:licensed|distributed)\b|\blicense\s*\(\s*https?:\/\/creativecommons\.org)/i);
  if (!match || match.index === undefined || match.index === 0) return [line];
  const head = line.text.slice(0, match.index).trim();
  const tail = line.text.slice(match.index).trim();
  if (head.length < 20 || tail.length < 20) return [line];
  const ratio = Math.max(0.15, Math.min(0.85, head.length / line.text.length));
  return [
    { ...line, text: head, width: line.width * ratio },
    { ...line, text: tail, x: line.x + line.width * ratio, width: line.width * (1 - ratio) },
  ];
}

/**
 * Some journal PDFs concatenate a running bibliographic band (ISSN/volume/
 * issue/date) with the first words of the next body line.  Split only when a
 * complete structural band is followed by sentence-like text; ordinary body
 * mentions of a volume or date remain untouched.
 */
function splitInlineBibliographicBand(line: LayoutLine): LayoutLine[] {
  const match = line.text.match(/\b(?:e[-\s]?issn|issn)\s*:\s*\S+\s+vol(?:ume)?\.?\s*\d+\b[^\n]{0,90}?\b(?:no\.?\s*\d+|issue\s*\d+|\d{4})\b\s+/i);
  if (!match || match.index === undefined || match.index > 24) return [line];
  const end = match.index + match[0].length;
  const head = line.text.slice(0, end).trim();
  const tail = line.text.slice(end).trim();
  if (head.length < 18 || tail.length < 28 || !/[A-Za-z]{3,}/.test(tail)) return [line];
  const ratio = Math.max(0.15, Math.min(0.85, head.length / line.text.length));
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
  // Web references are often split by PDF producers into a marker/URL line
  // followed by a full-size `accessed …` continuation. Treat that continuation
  // as the same footnote even when its font matches body text; otherwise it is
  // projected as an ordinary paragraph and appears in the article body.
  if (/^(?:accessed|lasts+visited|retrieved).*\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/i.test(t)) {
    return true;
  }
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
  const nextStartsSubheading = next.fontSize >= previous.fontSize + Math.max(0.35, baseFont * 0.04);
  // A larger heading immediately followed by a smaller body line is the
  // common baseline-overlap pattern in two-column journal PDFs. The previous
  // line is the candidate label in that direction, so keep the barrier
  // symmetric with the existing body-to-subheading check.
  const previousStartsSubheading = previous.fontSize >= next.fontSize + Math.max(0.35, baseFont * 0.04);
  const previousText = layoutPlain(previous.text);
  const previousTitleCase = /^[A-Z][A-Za-z]*(?:[\s:–—-]+[A-Z][A-Za-z]*)*/.test(previousText) &&
    previousText.length <= 100 && previousText.split(/\s+/).length <= 15 && !/[.!?。．]$/.test(previousText);
  return (titleCase || uppercase) && (boldTransition || nextStartsSubheading) || previousTitleCase && previousStartsSubheading;
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
  // Table captions are often followed immediately by a centered table
  // section header. It can be emitted as one native item and otherwise looks
  // like a short wrapped caption line. A substantial x shift from the
  // caption's left edge is a reliable geometry boundary; keep the header and
  // subsequent rows available for table-region detection.
  if (/^(?:table|tables|表)\s+\d+[a-z]?\s*[:.：]/i.test(currentText.trim()) &&
      next.items.length <= 2 && next.x - (next.pageWidth ? next.pageWidth * 0.18 : 0) > baseFont * 6 &&
      !/[.!?]s*$/.test(nextText)) return false;
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
  if (/^\d+(?:\.\d+)?\s*(?:kHz|MHz|GHz|Hz|mW|W|V|A|Ω|ohm|mm|cm|m)\b/i.test(text.trim())) {
    return false;
  }
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
    // A wrapped scientific range such as "6 GHz are primarily ..." is body
    // prose, even though the leading number can resemble a numbered heading.
    if (/^\d+(?:\.\d+)?\s*(?:kHz|MHz|GHz|Hz|mW|W|V|A|Ω|ohm|mm|cm|m)\b/i.test(text) && text.split(/\s+/).length > 3) {
      return false;
    }
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

/**
 * A flattened masthead sometimes emits affiliation markers and a contact
 * address as one native line (for example `1,2,3 c.c.m.hummels@...`).
 * This is publication metadata, not author prose. Keep the rule structural:
 * the non-email prefix may contain only marker digits and separators, so a
 * genuine author row containing an email remains eligible for projection.
 */
function looksLikeContactMetadata(text: string): boolean {
  if (!looksLikeEmail(text)) return false;
  const withoutEmails = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  return /^[\s\d,*†‡§∗·,;:()[\]{}]+$/u.test(withoutEmails.trim());
}

function looksLikeAffiliation(text: string): boolean {
  return /(university|department|institute|college|faculty|laboratory|\blab\b|(?:research\s+)?(?:center|centre)\s+(?:for|of)\b|school of|architecture|industrial design|centre of excellence|faculty of|department of|\b(?:the )?(netherlands|australia|germany|france|japan|china|canada|sweden|denmark|finland|norway|italy|spain|switzerland|austria|belgium|ireland|scotland|england|wales)\b|\b(?:sydney|london|dundee|eindhoven|cambridge|oxford|toronto|melbourne|macquarie)\b|大学|大学院|研究所|学院|学部|学科|機構|高専)/i.test(
    text
  );
}

/** Numbered multi-institution masthead rows often arrive as one native line. */
function looksLikeNumberedAffiliationBand(text: string): boolean {
  return /^\s*\d+\s+.*\b(?:University|College|Institute|School|Department|Faculty)\b.*\b\d+\s+[A-Z]/i.test(text) &&
    !/[.!?。！？]$/.test(text.trim());
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

function looksLikeAuthorList(text: string): boolean {
  if (looksLikeEmail(text) || looksLikeAffiliation(text) || looksLikeUrl(text)) return false;
  const t = layoutPlain(text).replace(/[*†‡§♠♣♡♢∗]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 10 || t.length > 320 || /[.!?。！？:]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const capitalized = words.filter((word) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{1,}$/.test(word.replace(/[,;]+$/g, "")));
  const separators = (text.match(/[,;·]|\band\b|&|♠|♣|♡|♢/gi) ?? []).length;
  // At least two separators or an explicit marker run is required. This
  // avoids promoting ordinary title/abstract fragments while covering
  // multi-author rows emitted without affiliation markers.
  const hasMixedCaseName = words.some((word) => /[a-zà-öø-ÿ]/u.test(word));
  const hasAuthorMarker = /[♠♣♡♢∗†‡§]/u.test(text);
  return capitalized.length >= 4 && capitalized.length / words.length >= 0.65 && separators >= 1 &&
    (hasMixedCaseName || hasAuthorMarker) &&
    !/^(?:abstract|introduction|background|keywords?)\b/i.test(t);
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
  // A lowercase sentence fragment can share the title font in publisher
  // mastheads (especially when the native stream crosses the abstract/body
  // boundary). It is continuation prose, not a standalone title anchor.
  if (/^[a-z]/.test(text) && text.split(/\s+/).length >= 4) return false;
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
  if (/[-\u00ad\u2010\u2011]$/u.test(prev) && /^[a-z0-9]/i.test(next)) {
    if (/^\d/.test(next)) return `${prev}${next}`;
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
  let effectiveLines = lines;
  // Some publishers embed the same title line sequence twice at identical
  // coordinates (visible text plus an accessibility/text layer). Remove only
  // an exact repeated half with matching geometry; repeated prose/table rows
  // with different positions remain untouched.
  if (lines.length >= 2 && lines.length % 2 === 0) {
    const half = lines.length / 2;
    const repeated = lines.slice(0, half).every((line, index) => {
      const other = lines[half + index];
      return line.text.trim() === other.text.trim() &&
        Math.abs(line.x - other.x) <= 1 && Math.abs(line.y - other.y) <= 1 &&
        Math.abs(line.width - other.width) <= 1;
    });
    if (repeated) effectiveLines = lines.slice(0, half);
  }
  let text = effectiveLines[0].text.trim();
  for (let i = 1; i < effectiveLines.length; i++) {
    const next = effectiveLines[i].text.trim();
    if (!next) continue;
    text = joinHyphenated(text, next);
  }
  return normalizeNativeSpacing(text);
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

function splitSameBaselineNameRuns(lines: LayoutLine[]): LayoutLine[] {
  return lines.flatMap((line) => {
    const significant = line.items.filter((item) => item.fontSize >= line.fontSize * 0.7);
    if (significant.length < 2 || significant.some((item) => !looksLikePersonName(item.text) && !/^[A-Z][\p{Ll}’’-]+(?:\s+(?:van|von|de|den|der|[A-Z][\p{Ll}’’-]+)){1,3}$/u.test(item.text.trim()))) return [line];
    const items = [...significant].sort((a, b) => a.x - b.x);
    const gaps = items.slice(1).map((item, index) => item.x - (items[index].x + items[index].width));
    if (gaps.some((gap) => gap < Math.max(3, line.fontSize * 0.18))) return [line];
    const markers = line.items.filter((item) => item.fontSize < line.fontSize * 0.7);
    return items.map((item, index) => {
      const nextX = items[index + 1]?.x ?? Number.POSITIVE_INFINITY;
      const attached = markers.filter((marker) => marker.x >= item.x + item.width - 2 && marker.x < nextX);
      return itemsToLine([item, ...attached], line.column, line.page, line.pageHeight, line.pageWidth);
    });
  });
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

  const pageLayouts = new Map<number, PageColumnLayout>([[page.pageNumber, layout]]);
  const structurallySplit = splitSameBaselineNameRuns(
    splitSpanningGutterLines(lines, pageLayouts)
  ).flatMap(splitInlineSubheading);
  const figureSeparated = splitVectorFigureOverlayLines(structurallySplit, page);

  // Opt-in line diagnostics for investigating generic caption/table boundaries.
  // Keep this disabled by default; it reports native geometry and style only.
  const lineDebug = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (lineDebug === "all") {
    for (const line of figureSeparated.filter((candidate) => candidate.page === 1)) {
      console.warn(`[PDF_LAYOUT_NATIVE_LINE] page=${line.page} column=${line.column} y=${line.y.toFixed(2)} x=${line.x.toFixed(2)} width=${line.width.toFixed(2)} font=${line.fontSize.toFixed(2)} items=${line.items.map((item) => `${JSON.stringify(item.text)}@${item.x.toFixed(2)}+${item.width.toFixed(2)}/${item.fontSize.toFixed(2)}`).join("|")}`);
    }
  }
  if (lineDebug === "lines") {
    for (const line of figureSeparated) {
      if (/^(?:table|tables?|figure|fig\.?|表|図)\b/i.test(line.text.trim())) {
        console.warn(`[PDF_LAYOUT_LINE] page=${line.page} column=${line.column} y=${line.y.toFixed(2)} x=${line.x.toFixed(2)} width=${line.width.toFixed(2)} font=${line.items[0]?.fontName ?? "unknown"} size=${line.fontSize.toFixed(2)} items=${line.items.length} text=${JSON.stringify(line.text)}`);
      }
    }
  }

  const visible = figureSeparated.filter((line) => !isEdgeChrome(line, layout, patterns));
  const splitCandidates = visible.filter((line) => isBodyStartHeading(line.text));
  const splitAt =
    splitCandidates.length > 0
      ? splitCandidates.reduce((best, line) => (line.y < best.y ? line : best))
      : visible.find((line) => /^(abstract|introduction)$/i.test(line.text.trim()));
  if (layout.isMultiColumn && splitAt && page.pageNumber === 1) {
    const masthead = visible.filter((line) => line.y < splitAt.y);
    const body = visible.filter((line) => line.y >= splitAt.y);
    const mastheadLayout = layout.isAsymmetricRail ? { ...layout, isMultiColumn: false } : layout;
    return [...orderPageLines(masthead, mastheadLayout), ...orderPageLines(body, layout)];
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
  const text = line.text.trim();
  // Repository copies sometimes place an unedited-author-copy notice in the
  // top margin and interleave it with the first body column. It is publication
  // metadata, not translatable prose.
  if (/^(?:[*∗†‡§]\s*)?this is the unedited author(?:'|’)?s copy\b/i.test(text)) return "chrome";
  // Repeated proceedings URLs in the top margin are publisher chrome. Keep
  // URL-only lines out of page-boundary paragraph stitching; inline URLs in
  // ordinary prose remain unchanged.
  if (line.y < (line.pageHeight ?? 792) * 0.18 && /^https?:\/\/\S+$/i.test(text)) {
    return "header";
  }
  if (line.y < (line.pageHeight ?? 792) * 0.18 &&
      /\b(?:e-?issn|p-?issn|published\s+by|journal\s+\w+|vol\.\s*\d+)/i.test(text)) {
    return "header";
  }
  // Native superscript markers and email-only rows are not standalone
  // canonical metadata. Apply this before inherited role hints so a hint from
  // an adjacent masthead line cannot resurrect these fragments.
  if (line.page === 1 && /^[\d,*†‡§∗\u2020\u2021\s]+$/u.test(text)) return "chrome";
  if (line.page === 1 && looksLikeContactMetadata(text)) return "chrome";
  if (line.page === 1 && /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?:\s*[;,]\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})*$/i.test(text)) {
    return "chrome";
  }
  // A large, centered first-page line is a title anchor even when its words
  // happen to look like a multi-person name list (for example titles joined
  // with “and”). Resolve this geometry before masthead name heuristics.
  if (line.page === 1 && line.y < 230 && line.fontSize >= baseFont * 1.22 &&
      line.width >= (line.pageWidth ?? 612) * 0.42 &&
      !looksLikePersonName(text) && !looksLikeAffiliation(text)) {
    return "title";
  }
  // arXiv's identifier/date header is not the article title. Keep it as
  // chrome so it cannot win the title resolver after the real title has been
  // recovered from the masthead region.
  if (/^arXiv:\s*\d{4}\.\d{4,}/i.test(text)) return "chrome";
  // Explicit author-list geometry must override a stale paragraph hint from
  // line grouping. The predicate is conservative and excludes institutions,
  // sentence punctuation, and section labels.
  if (line.page === 1 && looksLikeAuthorList(text)) return "author";
  if (line.page === 1 && mastheadEndY >= 0 && line.y < mastheadEndY &&
      looksLikeAffiliation(text) && text.length <= 220 && !/[.!?。！？]$/.test(text)) {
    return "affiliation";
  }
  // Legal boilerplate is frequently interleaved with a body column in the
  // native text stream. Resolve the active permission run before lowercase
  // sentence-continuation handling; otherwise every alternate small line can
  // leak back into the article as a paragraph.
  if (isCopyright(text, line.fontSize, baseFont) || (inCopyright && line.fontSize <= baseFont * 0.92)) {
    return "copyright";
  }
  // A stale native role hint can label a lowercase body continuation as a
  // heading. Structural sentence evidence must take precedence over that
  // hint so the paragraph remains intact.
  if (/^[a-z]/.test(text) && text.split(/\s+/).length >= 4) return "paragraph";
  // Lowercase colon lead-ins (`follows:`, `triggered:`) are discourse glue in
  // body prose. A style split may attach a heading hint meant for Title-Case
  // metadata labels (`Background:`); do not let that hint win here.
  if (/^[a-z][\w'’ -]{0,40}:$/.test(text.trim())) return "paragraph";
  // Publisher mastheads sometimes emit the associate-editor credit as a
  // paragraph-sized line between the two body columns. It is publication
  // metadata, never article prose, even though it ends in a full stop.
  if (/^(?:the\s+)?(?:associate|handling|guest)\s+editor\b.*\b(?:coordinating|manuscript|review|approving)\b/i.test(text)) {
    return "chrome";
  }
  // A detached access-date continuation can inherit a stale paragraph hint
  // from the native stream. Resolve its semantic footnote role first so it is
  // merged with the preceding URL/marker line.
  if (/^(?:accessed|last\s+visited|retrieved)\b.*\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/i.test(layoutPlain(text))) {
    return "footnote";
  }
  if (line.roleHint) return line.roleHint;
  // Figure labels are frequently emitted on their own native line before the
  // caption body. Keeping the label as a caption lets the following nearby
  // title/caption lines use the same conservative continuation checks.
  if (/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*,\s*[a-z]\b)*$/i.test(layoutPlain(text))) {
    return "figure_caption";
  }
  if (isFigureCaption(text)) return "figure_caption";
  if (isTableCaption(text)) return "table_caption";
  if (isEquationLine(text)) return "equation";
  // Figure panels are sometimes emitted at the top of the next page as a
  // compact uppercase label (`A B`) with body-sized font. Keep this detached
  // graphic label from being stitched onto the preceding paragraph.
  if (line.page > 1 && line.y < (line.pageHeight ?? 792) * 0.12 &&
      /^[A-Z](?:\s+[A-Z]){1,3}$/.test(text) && line.items.length <= 4) {
    return "header";
  }
  // Superscript affiliation markers and email-only rows are metadata
  // fragments, not standalone authors or affiliations. Keep them out of the
  // canonical author/affiliation lists; nearby name/institution rows retain
  // their own evidence and relation resolution.
  if (
    line.page > 1 &&
    line.y < (line.pageHeight ?? 792) * 0.12 &&
    line.fontSize <= baseFont * 0.82 &&
    (looksLikePersonName(text) ||
      /^[A-Z](?:\s+[A-Z]){1,3}$/.test(text) ||
      /^[A-Z][A-Za-z'’-]+\s+et\s+al\.?$/i.test(text) ||
      /[A-Za-z]{3,}.*[•·]\s*\d+\s*:\s*\d+\s*$/.test(text))
  ) {
    return "header";
  }
  if (isFootnoteLine(line, line.pageHeight ?? 792, baseFont)) {
    if (line.page === 1 && looksLikeAffiliation(text)) return "affiliation";
    return "footnote";
  }

  // IEEE-style exports often prefix the abstract body with `Abstract—` and
  // the masthead scorer can otherwise label the long multi-line block as a
  // title. Treat a sentence-like abstract marker as body prose so a lowercase
  // continuation can be reconstructed by the normal paragraph resolver.
  if (/^abstract\s*[—–-]\s*/i.test(text) &&
      text.split(/\s+/).filter(Boolean).length >= 6) {
    return "paragraph";
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
      looksLikeLatinAuthorLine(text) ||
      looksLikeAuthorList(text)
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
  if (baselineGap > baseFont * 1.55) {
    // Some theses and reports use generous leading (roughly 2--2.4 times the
    // body font). Treat it as a wrapped paragraph only when the text itself
    // proves continuity. This avoids globally widening the paragraph-gap
    // threshold and swallowing a real section/paragraph break.
    const previousText = prev.text.trim();
    const nextText = next.text.trim();
    const textContinues = !/[.!?。！？]\s*$/.test(previousText) &&
      (/^[a-z]/.test(nextText) || /[,;:([\u2018\u201c]/.test(previousText.slice(-1)));
    const aligned = Math.abs(prev.x - next.x) <= Math.max(18, baseFont * 1.8);
    const sameStyle = Math.abs(prev.fontSize - next.fontSize) <= Math.max(1.25, baseFont * 0.14);
    if (!(textContinues && aligned && sameStyle && baselineGap <= baseFont * 2.7)) return false;
  }
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
  // A metadata label on the next line starts a new structural band. Do not
  // let a preceding author/affiliation row absorb `Keywords:` or a similar
  // colon-terminated label merely because the preceding row ended in a comma.
  if (/^[A-Za-z][A-Za-z -]{1,31}:\s+/.test(nextText)) return false;
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
    const traceText = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_TRACE_TEXT;
    if (traceText && joinLines(current).includes(traceText)) {
      console.warn(`[PDF_LAYOUT_TRACE_GROUP] role=${currentRole} page=${current[0].page} columns=${[...new Set(current.map((line) => line.column))].join(",")} lines=${current.length} text=${JSON.stringify(joinLines(current).slice(0, 320))}`);
    }
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
    for (const doiLine of splitInlineDoi(sourceLine)) for (const licenseLine of splitInlineLicense(doiLine)) for (const authorCopyLine of splitInlineAuthorCopyNotice(licenseLine)) for (const line of splitInlineBibliographicBand(authorCopyLine)) {
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
    if (currentRole === "chrome" && forcedRole === "paragraph" &&
        current[0]?.page === line.page && current[0]?.column === line.column &&
        line.y - current[current.length - 1].y < baseFont * 2.8 &&
        (/associate editor\b.*\b(?:coordinating|manuscript|review|approving)\b/i.test(joinLines(current)) ||
          /unedited author(?:'|’)?s copy\b/i.test(joinLines(current)))) {
      forcedRole = "chrome";
    }
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
    const authorColumnBoundary = currentRole === "author" && (() => {
      const currentItems = current[current.length - 1].items.filter((item) => item.fontSize >= baseFont * 0.7);
      const nextItems = line.items.filter((item) => item.fontSize >= baseFont * 0.7);
      return currentItems.length === 1 && nextItems.length === 1 &&
        looksLikePersonName(currentItems[0].text) && looksLikePersonName(nextItems[0].text) &&
        Math.abs(line.y - current[current.length - 1].y) <= Math.max(2.5, baseFont * 0.3) &&
        Math.abs(line.x - current[current.length - 1].x) > baseFont * 2;
    })();
    const detachedRailLineBoundary = currentRole === "paragraph" && forcedRole === "paragraph" && (() => {
      const previous = current[current.length - 1];
      const body = previous.fontSize >= baseFont * 0.95 && previous.width >= (previous.pageWidth ?? 612) * 0.45;
      const rail = line.fontSize <= previous.fontSize * 0.84 && line.width <= Math.min(160, (line.pageWidth ?? 612) * 0.3) &&
        line.x + line.width + 12 <= previous.x && Math.abs(line.y - previous.y) <= Math.max(18, previous.fontSize * 1.8);
      return body && rail;
    })();
    // Vector diagrams sometimes emit numeric glyph bands at ~1pt followed by
    // a normal-size caption line. Their shared column and small baseline gap
    // otherwise make them one paragraph, leaking figure labels into caption
    // text. Treat a sharp tiny-font transition as a structural boundary;
    // superscripts/footnotes remain above this conservative threshold.
    const tinyVectorBandBoundary = currentRole === "paragraph" && forcedRole === "paragraph" && (() => {
      const previous = current[current.length - 1];
      const tiny = Math.min(previous.fontSize, line.fontSize) <= baseFont * 0.35;
      const normal = Math.max(previous.fontSize, line.fontSize) >= baseFont * 0.55;
      return tiny && normal;
    })();
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
      !detachedRailLineBoundary &&
      !tinyVectorBandBoundary &&
      !authorColumnBoundary &&
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

    const keywordContinuation =
      currentRole === "paragraph" && current.length === 1 &&
      current[0].page === line.page &&
      line.y - current[0].y < baseFont * 2.4 &&
      // Keyword rails are short comma-delimited fragments, often indented on
      // the first line and reset to the body margin on the wrapped line.
      (joinLines(current).match(/,/g)?.length ?? 0) >= 3 &&
      joinLines(current).length <= 180 &&
      line.text.trim().split(/\s+/).filter(Boolean).length <= 8 &&
      /^[a-z\d]/.test(line.text.trim()) &&
      !/[.!?。！？]$/.test(joinLines(current).trim());

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
      (Math.abs(line.fontSize - current[current.length - 1].fontSize) <= 1.2 ||
        // A colon-terminated title is a strong continuation anchor even when
        // the second line uses a slightly smaller publisher font and would
        // otherwise be mistaken for an author row.
        (/[:：]\s*$/.test(current[current.length - 1].text.trim()) &&
          Math.abs(line.fontSize - current[current.length - 1].fontSize) <= 4)) &&
      // A title subtitle is often one short native line with a smaller font
      // and is therefore initially classified as affiliation/paragraph. Keep
      // it with the title when it is structurally close and cannot be an
      // author or institution line. Longer prose must still form a new block.
      (forcedRole === "title" ||
        /[:：]\s*$/.test(current[current.length - 1].text.trim()) ||
        (line.text.trim().split(/\s+/).filter(Boolean).length <= 6 &&
          line.text.trim().length <= 48 &&
          !looksLikePersonName(line.text) &&
          !looksLikeEmail(line.text))) &&
      // A title can be followed immediately by an author row carrying
      // superscript affiliation markers. Do not absorb that metadata into a
      // title block even when the producer uses the same font and leading.
      !line.items.some((item) => item.fontSize < line.fontSize * 0.75 && /^\d{1,3}$/.test(item.text.trim()));

    const captionContinue =
      (currentRole === "figure_caption" || currentRole === "table_caption") &&
      sameTextOrientation(current[current.length - 1].rotation, line.rotation) &&
      line.page === current[0].page &&
      (line.column === current[0].column ||
        // Full-width captions can be emitted as a spanning line followed by
        // separate left/right fragments. Allow only unfinished caption text
        // with close vertical spacing to continue across those column labels.
        ((currentRole as string) === "figure_caption" &&
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


    const repeatedGridBoundary =
      (currentRole === "paragraph" || (currentRole as string) === "reference") &&
      (forcedRole === "paragraph" || (forcedRole as string) === "reference") &&
      (current[current.length - 1].isGridRow || line.isGridRow) &&
      !(line.y - current[current.length - 1].y > baseFont * 0.55 &&
        Math.abs(line.x - current[current.length - 1].x) <= baseFont * 2.5) &&
      Math.abs(line.x - current[current.length - 1].x) > baseFont * 2.5;
    if (repeatedGridBoundary) {
      flush();
      current = [line];
      currentRole = forcedRole;
      continue;
    }

    if (mergeable || affiliationContinue || captionContinue || grantContinue || keywordContinuation || titleContinue || footnoteContinue || headingContinue) {
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
    rejoinDetachedCaptionTitles(
          splitMixedMastheadBlocks(
        splitCaptionHeaderLines(
          splitEmbeddedTableGridFromCaptions(
          splitTopBibliographicLines(
            splitStyledHeadingPrefixes(
              splitEmbeddedChromeBlocks(rejoinCaptionStatisticFragments(blocks.filter((b) => b.text.length > 0))),
              median(blocks.flatMap((block) => block.lines.map((line) => line.fontSize))) || 9,
            )
          )
          )
        )
      )
    )
  );
  logLayoutBlockBoundaries(nonEmptyBlocks);
  const merged = mergeColumnContinuations(nonEmptyBlocks);
  const split = splitMixedColumnBlocks(merged);
  // The second split can expose a right-column paragraph that was formerly
  // hidden inside a mixed table/body block. Run continuation repair once more
  // so the newly exposed lines can rejoin their actual paragraph across the
  // parallel table band.
  const postSplitMerged = mergeColumnContinuations(split);
  const ordered = repairInterleavedContinuationOrder(repairPageBoundaryContinuations(repairDetachedMarginContinuations(postSplitMerged)));
  return trimInterleavedHyphenFragments(trimOrphanTailBeforeChrome(ordered));
}

/** Separate a table caption from a native line that is actually the first
 * wide table header. Some PDF producers put the caption and the header in one
 * LayoutBlock despite incompatible x geometry; keeping them together causes
 * caption text to absorb column labels and prevents the table region from
 * being identified. This uses only line geometry/font facts, never header
 * vocabulary. */
function splitCaptionHeaderLines(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.flatMap((block) => {
    if (block.role !== "table_caption" || block.lines.length < 2 ||
        !/^(?:table|表)\s*\d+/i.test(block.lines[0]?.text.trim() ?? "")) return [block];
    const title = block.lines[0];
    const rest = block.lines.slice(1);
    const header = rest.find((line) => {
      const items = line.items.filter((item) => item.text.trim().length > 0);
      if (items.length < 2 || /[.!?:;]\s*$/.test(line.text.trim())) return false;
      const span = Math.max(...items.map((item) => item.x + item.width)) - Math.min(...items.map((item) => item.x));
      const pageWidth = line.pageWidth ?? 612;
      return span >= pageWidth * 0.28 &&
        Math.abs(line.fontSize - title.fontSize) <= 1.5 &&
        line.y - (title.y + title.height) <= Math.max(36, title.fontSize * 3.5);
    });
    if (!header) return [block];
    const caption: LayoutBlock = {
      ...block,
      text: title.text.trim(),
      lines: [title],
      bbox: blockBbox([title]),
      pageStart: title.page,
      pageEnd: title.page,
      detachedCaptionTitleRepaired: true,
    };
    const headerLines = rest;
    const table: LayoutBlock = {
      ...block,
      role: "table",
      text: joinLines(headerLines),
      lines: headerLines,
      bbox: blockBbox(headerLines),
      pageStart: headerLines[0].page,
      pageEnd: headerLines.at(-1)!.page,
    };
    return [caption, table];
  });
}

/**
 * PDF producers sometimes leave a short hyphenated tail from the neighbouring
 * column at the beginning of a paragraph block (for example `evi- 5. ...` or
 * a standalone `miss-` line).  These are not normal line-wraps when the next
 * text starts a new heading/sentence.  Remove only that narrow shape; a
 * hyphenated word followed by a lowercase continuation remains untouched.
 */
function trimInterleavedHyphenFragments(blocks: LayoutBlock[]): LayoutBlock[] {
  for (const block of blocks) {
    if (block.role !== "paragraph" || block.lines.length < 2) continue;
    const cleaned = block.lines.filter((line, index, lines) => {
      const text = line.text.trim();
      if (/^\.\s+[a-z]/.test(text)) return false;
      if (/^[A-Za-z]{1,6}-$/.test(text)) {
        const next = lines[index + 1]?.text.trim() ?? "";
        // Keep a legitimate line-wrap (`inter-` followed by `action`).
        if (/^[a-z]/.test(next)) return true;
        return false;
      }
      const inline = text.match(/^([A-Za-z]{1,6}|[.]{1,3})-\s+(.+)$/);
      if (!inline) return true;
      // A punctuation-only prefix cannot be a word wrap; it is a stray glyph
      // from an adjacent text stream even when the following word is lower
      // case (for example `.- tively`).
      if (/^[.]+$/.test(inline[1])) return false;
      // A new sentence/heading after the fragment indicates an interleaved
      // column artifact; lowercase continuation is a legitimate hyphenated
      // word and must be preserved.
      return /^[a-z]/.test(inline[2]);
    });
    if (cleaned.length === block.lines.length || cleaned.length === 0) continue;
    block.lines = cleaned;
    block.text = joinLines(cleaned);
    block.bbox = blockBbox(cleaned);
    block.pageStart = cleaned[0].page;
    block.pageEnd = cleaned.at(-1)?.page ?? block.pageEnd;
  }
  return blocks;
}

/** Rejoin a paragraph across a page boundary when intervening blocks are
 * transparent metadata (author/affiliation/header) and both text blocks have
 * strong continuation geometry. */
function repairPageBoundaryContinuations(blocks: LayoutBlock[]): LayoutBlock[] {
  const result = [...blocks];
  const emptyRepeated = new Set<string>();
  const affiliationLike = (block: LayoutBlock) => block.role === "paragraph" &&
    block.text.length < 300 && block.lines.length <= 6 &&
    /\b(?:university|institute|college|faculty|department|laboratory|school)\b/i.test(block.text);
  const authorMetadataLike = (block: LayoutBlock) => block.role === "paragraph" &&
    block.text.length < 220 && block.lines.length <= 4 && !/[.!?]$/.test(block.text.trim()) &&
    ((block.text.match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) ?? []).length >= 2 &&
      (block.text.includes(",") || block.text.includes("&")) ||
      looksLikeLatinAuthorLine(block.text) || /^[&]/.test(block.text.trim()) ||
      (/^[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,5}(?:,|\s+&)/.test(block.text.trim()) && block.text.includes(",")));
  for (let i = 0; i < result.length; i += 1) {
    const target = result[i];
    if (target.role !== "paragraph" || target.pageStart !== target.pageEnd ||
        affiliationLike(target) || authorMetadataLike(target) ||
        /[.!?:]$/.test(target.text.trim()) || target.text.trim().length < 80) continue;
    let nextIdx = i + 1;
    const skipped: LayoutBlock[] = [];
    while (nextIdx < result.length && (result[nextIdx].role === "author" || result[nextIdx].role === "affiliation" || isTransparentMetadataBlock(result[nextIdx], emptyRepeated) || affiliationLike(result[nextIdx]) || authorMetadataLike(result[nextIdx]))) {
      skipped.push(result[nextIdx]);
      nextIdx += 1;
    }
    const next = result[nextIdx];
    const targetLast = target.lines.at(-1);
    const nextFirst = next?.lines[0];
    const compatibleColumn = Boolean(
      next && nextFirst && (
        target.column === next.column ||
        (target.column === "single" && next.column === "spanning" &&
          Math.abs((target.lines[0]?.x ?? target.bbox.x) - nextFirst.x) <= 24)
      )
    );
    const longAbstractContinuation = Boolean(
      next && skipped.length > 0 && target.text.length >= 500 && next.text.length >= 120 &&
      next.pageStart === target.pageEnd + 1 && /^[a-z(]/.test(next.text.trim()) &&
      skipped.every((item) => item.role === "author" || item.role === "affiliation" || affiliationLike(item) || authorMetadataLike(item) || isTransparentMetadataBlock(item, emptyRepeated))
    );
    if (!next || next.role !== "paragraph" ||
        target.pageEnd + 1 !== next.pageStart || next.pageEnd !== next.pageStart ||
        !compatibleColumn || !/^[a-z(]/.test(next.text.trim()) ||
        (!longAbstractContinuation && Math.abs((targetLast?.fontSize ?? 9) - (nextFirst?.fontSize ?? 9)) > 1.0) ||
        !targetLast || !nextFirst || (!longAbstractContinuation && (
          (targetLast?.y ?? 0) < (targetLast?.pageHeight ?? 792) * 0.45 ||
          (nextFirst?.y ?? Number.MAX_SAFE_INTEGER) > (nextFirst?.pageHeight ?? 792) * 0.42
        ))) continue;
    target.text = joinHyphenated(target.text, next.text).replace(/\s+/g, " ").trim();
    target.lines = [...target.lines, ...next.lines];
    target.pageEnd = next.pageEnd;
    target.bbox = blockBbox(target.lines);
    result.splice(nextIdx, 1);
    i -= 1;
  }
  return result;
}

/** Rejoin an unfinished body sentence when only a proven narrow margin rail
 * lies between its physical lines. This runs after normal continuation merge
 * so it cannot make a detached label part of the translated paragraph. */
function repairDetachedMarginContinuations(blocks: LayoutBlock[]): LayoutBlock[] {
  const result = [...blocks];
  for (let i = 0; i < result.length; i += 1) {
    const target = result[i];
    if (target.role !== "paragraph" || target.pageStart !== target.pageEnd ||
        /[.!?:]$/.test(target.text.trim())) continue;
    let nextIdx = i + 1;
    const skipped: LayoutBlock[] = [];
    while (nextIdx < result.length && isDetachedSingleColumnMarginBlock(result[nextIdx], target.bbox.x)) {
      skipped.push(result[nextIdx]);
      nextIdx += 1;
    }
    const next = result[nextIdx];
    if (!next || skipped.length === 0 || next.role !== "paragraph" ||
        next.pageStart !== target.pageEnd || next.pageEnd !== target.pageEnd ||
        next.column !== target.column || /^[A-Z0-9]/.test(next.text.trim()) ||
        !/^[a-z(]/.test(next.text.trim()) ||
        Math.abs(target.bbox.x - next.bbox.x) > 12 ||
        next.bbox.y <= target.bbox.y ||
        next.bbox.y - (target.bbox.y + target.bbox.height) > Math.max(48, (target.lines.at(-1)?.fontSize ?? 9) * 5) ||
        Math.abs((target.lines.at(-1)?.fontSize ?? 9) - (next.lines[0]?.fontSize ?? 9)) > 1.0) continue;
    target.text = joinHyphenated(target.text, next.text).replace(/\s+/g, " ").trim();
    target.lines = [...target.lines, ...next.lines];
    target.pageEnd = next.pageEnd;
    target.bbox = blockBbox(target.lines);
    result.splice(nextIdx, 1);
    i -= 1;
  }
  return result;
}

function repairInterleavedContinuationOrder(blocks: LayoutBlock[]): LayoutBlock[] {
  const result = [...blocks];
  for (let i = 0; i + 1 < result.length; i += 1) {
    const current = result[i];
    const next = result[i + 1];
    // A spanning paragraph can end in a citation list at the left edge while
    // the PDF emits the closing bracket and continuation in the right column
    // at the same y coordinate. This is a high-confidence physical
    // continuation: require an open numeric citation, a closing bracket at
    // the next block, overlapping vertical bands, and matching body text size.
    if (current.role === "paragraph" && next.role === "paragraph" &&
        current.pageStart === current.pageEnd && next.pageStart === next.pageEnd &&
        current.pageStart === next.pageStart &&
        /\[[^\]]*\d\s*$/.test(current.text.trim()) && /^\]\s*(?:,|and\b|or\b)/i.test(next.text.trim()) &&
        current.bbox.x < next.bbox.x &&
        current.bbox.y <= next.bbox.y + next.bbox.height &&
        next.bbox.y <= current.bbox.y + current.bbox.height &&
        Math.abs((current.lines.at(-1)?.fontSize ?? 9) - (next.lines[0]?.fontSize ?? 9)) <= 1.0) {
      current.text = joinHyphenated(current.text, next.text).replace(/\s+/g, " ").trim();
      current.lines = [...current.lines, ...next.lines];
      current.bbox = blockBbox(current.lines);
      current.preserveColumnContinuation = true;
      current.adjacentBandContinuation = true;
      result.splice(i + 1, 1);
      i -= 1;
      continue;
    }
    // A paragraph may contain a final word from the next physical line when
    // the extractor interleaves two columns. Rejoin only a long paragraph
    // ending in a short title-case word with a same-column lowercase
    // continuation immediately below it. This avoids joining headings,
    // captions, or complete sentences while repairing word-level splits.
    const currentTail = current.text.trim().match(/\b([A-Z][A-Za-z]{1,20})$/)?.[1];
    const nextHead = next.text.trim();
    const currentLastLine = current.lines.at(-1);
    const nextFirstLine = next.lines.at(0);
    const currentBottom = current.bbox.y + current.bbox.height;
    if (current.role === "paragraph" && next.role === "paragraph" &&
        current.text.length >= 180 && current.pageStart === current.pageEnd &&
        next.pageStart === next.pageEnd && current.pageStart === next.pageStart &&
        currentTail && /^[a-z(]/.test(nextHead) &&
        Math.abs(current.bbox.x - next.bbox.x) <= 12 &&
        next.bbox.y >= currentBottom && next.bbox.y - currentBottom <= Math.max(28, (currentLastLine?.fontSize ?? 9) * 2.5) &&
        Math.abs((currentLastLine?.fontSize ?? 9) - (nextFirstLine?.fontSize ?? 9)) <= 1.0) {
      current.text = joinHyphenated(current.text, next.text).replace(/\s+/g, " ").trim();
      current.lines = [...current.lines, ...next.lines];
      current.bbox = blockBbox(current.lines);
      current.preserveColumnContinuation = true;
      current.adjacentBandContinuation = true;
      result.splice(i + 1, 1);
      i -= 1;
      continue;
    }
    if (current.role !== "paragraph" || next.role !== "paragraph" ||
        current.pageStart !== current.pageEnd || next.pageStart !== next.pageEnd ||
        current.pageStart !== next.pageStart || !/^[a-z]/.test(current.text.trim()) ||
        !/^[A-Z]/.test(next.text.trim()) || current.bbox.x <= next.bbox.x ||
        current.bbox.y > next.bbox.y + next.bbox.height ||
        next.bbox.y > current.bbox.y + current.bbox.height ||
        isDetachedSingleColumnMarginBlock(current, next.bbox.x) ||
        isDetachedSingleColumnMarginBlock(next, current.bbox.x)) continue;
    [result[i], result[i + 1]] = [next, current];
    const left = result[i];
    const right = result[i + 1];
    if (left.role === "paragraph" && right.role === "paragraph" &&
        left.pageStart === left.pageEnd && right.pageStart === right.pageEnd &&
        left.pageStart === right.pageStart && !/[.!?:]$/.test(left.text.trim()) &&
        /^[a-z]/.test(right.text.trim()) &&
        left.bbox.x + left.bbox.width + 18 <= right.bbox.x &&
        left.bbox.y <= right.bbox.y + right.bbox.height &&
        right.bbox.y <= left.bbox.y + left.bbox.height) {
      left.text = joinHyphenated(left.text, right.text).replace(/\s+/g, " ").trim();
      left.lines = [...left.lines, ...right.lines];
      left.bbox = blockBbox(left.lines);
      left.preserveColumnContinuation = true;
      left.adjacentBandContinuation = true;
      result.splice(i + 1, 1);
      i -= 1;
    }
  }
  return result;
}

/** Remove a high-confidence orphan native line emitted immediately before a
 * publisher chrome block. Some PDFs leave one short word from the next
 * column in the body paragraph; translating it would make a complete source
 * paragraph look syntactically unfinished. The geometry and neighboring
 * chrome checks keep this conservative and format-agnostic. */
function trimOrphanTailBeforeChrome(blocks: LayoutBlock[]): LayoutBlock[] {
  for (let index = 0; index + 1 < blocks.length; index += 1) {
    const block = blocks[index];
    const next = blocks[index + 1];
    if (block.role !== "paragraph" || block.pageStart !== block.pageEnd ||
        next.pageStart !== next.pageEnd || block.pageEnd !== next.pageStart ||
        !["copyright", "header", "footer"].includes(next.role)) continue;
    if (block.text.length < 200 || block.lines.length < 2) continue;
    const last = block.lines.at(-1);
    const beforeLast = block.lines.at(-2);
    if (!last || !beforeLast) continue;
    const orphan = last.text.trim();
    const pageWidth = last.pageWidth ?? 612;
    const finalItem = last.items.at(-1);
    const itemOrphan = finalItem?.text.trim() ?? "";
    if ((!/^[A-Za-z]{1,12}[.]?$/.test(orphan) &&
         !/(?:[.!?])\s+[A-Za-z]{1,12}[.]?$/.test(orphan)) ||
        !/^[A-Za-z]{1,12}[.]?$/.test(itemOrphan) ||
        (finalItem?.width ?? 0) > 24 || (finalItem?.x ?? 0) < pageWidth * 0.72 ||
        next.lines[0]?.y === undefined || next.lines[0].y < last.y) continue;
    last.items = last.items.slice(0, -1);
    if (last.items.length === 0) {
      block.lines = block.lines.slice(0, -1);
    } else {
      last.text = joinItemTexts(last.items);
      last.x = Math.min(...last.items.map((item) => item.x));
      const right = Math.max(...last.items.map((item) => item.x + item.width));
      last.width = right - last.x;
      last.bbox = { page: last.page, x: last.x, y: last.y, width: last.width, height: last.height };
    }
    block.text = joinLines(block.lines);
    block.bbox = blockBbox(block.lines);
    block.pageEnd = block.lines.at(-1)?.page ?? block.pageEnd;
  }
  return blocks;
}

/**
 * Some PDF producers emit the identifier and title of one visual caption as
 * separate text objects with incompatible vertical coordinates. A normal
 * line-gap merge must not bridge that distance: it would join unrelated body
 * prose. Recover only a bare `Table 2.5:` / `Figure 3:` identifier when a
 * unique, single-line title has the same page, left edge, and native typeface.
 *
 * This is intentionally a repair for malformed native geometry rather than a
 * general caption-title heuristic. Ordinary adjacent captions are already
 * joined by `captionContinue` while forming blocks.
 */
function rejoinDetachedCaptionTitles(blocks: LayoutBlock[]): LayoutBlock[] {
  const removed = new Set<LayoutBlock>();
  const bareCaption = /^(?:(?:table|figure|fig\.?)\s+(?:[a-z]+\.)?\d+(?:\.\d+)*[a-z]?|(?:table|figure|fig\.?)\s+[ivxlcdm]+)\s*[:：]$/i;
  const titleLike = (block: LayoutBlock): boolean => {
    const text = layoutPlain(block.text);
    return block.role === "paragraph" &&
      block.lines.length === 1 &&
      text.length >= 8 && text.length <= 220 &&
      text.trim().split(/\s+/).length >= 2 &&
      /^[A-ZÀ-ÖØ-Þ0-9]/u.test(text) &&
      !/[.!?;:]$/.test(text) &&
      !looksLikeEmail(text) &&
      !isFigureCaption(text) &&
      !isTableCaption(text);
  };
  const nativeFace = (line: LayoutLine): string =>
    [...new Set(line.items.map((item) => item.fontName).filter(Boolean))].sort().join("|");

  for (const caption of blocks) {
    if (caption.role !== "table_caption" && caption.role !== "figure_caption") continue;
    if (!bareCaption.test(layoutPlain(caption.text))) continue;
    const captionLine = caption.lines[0];
    if (!captionLine) continue;
    const candidates = blocks
      .filter((candidate) => candidate !== caption && !removed.has(candidate) &&
        candidate.pageStart === caption.pageStart && candidate.pageEnd === caption.pageEnd &&
        titleLike(candidate))
      .map((candidate) => {
        const line = candidate.lines[0];
        if (!line) return undefined;
        const compatible =
          Math.abs(line.x - captionLine.x) <= Math.max(2.5, captionLine.fontSize * 0.28) &&
          Math.abs(line.fontSize - captionLine.fontSize) <= 0.25 &&
          nativeFace(line) === nativeFace(captionLine) &&
          // This repair is only for a title that the producer placed before
          // its identifier in native coordinates. Close or following lines
          // belong to the ordinary caption-continuation path.
          line.y < captionLine.y - captionLine.fontSize * 3.5 &&
          Math.abs(line.y - captionLine.y) <= Math.max(48, captionLine.fontSize * 8);
        if (!compatible) return undefined;
        return { candidate, line, distance: Math.abs(line.y - captionLine.y) };
      })
      .filter((candidate): candidate is { candidate: LayoutBlock; line: LayoutLine; distance: number } => Boolean(candidate))
      .sort((a, b) => a.distance - b.distance);
    const match = candidates[0];
    // Multiple equally plausible title lines are ambiguous; preserve the
    // source blocks instead of guessing which one belongs to the caption.
    if (!match || (candidates[1] && candidates[1].distance - match.distance < captionLine.fontSize * 1.5)) continue;

    caption.lines = [...caption.lines, match.line];
    caption.text = `${caption.text.trim()} ${match.candidate.text.trim()}`;
    caption.bbox = blockBbox(caption.lines);
    caption.pageStart = Math.min(caption.pageStart, match.candidate.pageStart);
    caption.pageEnd = Math.max(caption.pageEnd, match.candidate.pageEnd);
    caption.detachedCaptionTitleRepaired = true;
    removed.add(match.candidate);
  }
  return blocks.filter((block) => !removed.has(block));
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

/** Split an unambiguous license/copyright tail that a PDF producer embedded
 * in the same native span as a body paragraph. */
function splitEmbeddedChromeBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  const marker = /(?:this(?:nationalwork)?license\.?is\s+licensed|(?:©\s*(?:acm|ieee|springer|elsevier))|copyright\s+\d{4})/i;
  for (const block of blocks) {
    if (block.role !== "paragraph" || block.text.length < 180) {
      result.push(block);
      continue;
    }
    const match = marker.exec(block.text);
    if (!match || match.index < 80) {
      result.push(block);
      continue;
    }
    const prefix = block.text.slice(0, match.index).trim();
    const suffix = block.text.slice(match.index).trim();
    if (prefix.length < 80 || suffix.length < 20) {
      result.push(block);
      continue;
    }
    result.push({ ...block, text: prefix });
    result.push({ ...block, role: "copyright", text: suffix });
  }
  return result;
}

/** Split a page-one author block when its physical lines change from a
 * person-shaped name to institution-shaped metadata. Conference templates
 * often use identical font size and leading for both, so role changes must be
 * recovered from the preserved line geometry rather than the merged string. */
function splitMixedMastheadBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.flatMap((block) => {
    if (block.role !== "author" || block.pageStart !== 1 || block.pageEnd !== 1 || block.lines.length < 2) {
      return [block];
    }
    const affiliationIndex = block.lines.findIndex((line, index) =>
      index > 0 && looksLikeAffiliation(line.text) && !looksLikePersonName(line.text)
    );
    if (affiliationIndex <= 0) return [block];
    const authorLines = block.lines.slice(0, affiliationIndex);
    const affiliationLines = block.lines.slice(affiliationIndex);
    if (!authorLines.every((line) =>
      looksLikePersonName(line.text) || looksLikeLatinAuthorLine(line.text) || looksLikeAuthorList(line.text)
    )) {
      return [block];
    }
    return [
      {
        ...block,
        role: "author" as const,
        text: joinLines(authorLines),
        lines: authorLines,
        bbox: blockBbox(authorLines),
      },
      {
        ...block,
        role: "affiliation" as const,
        text: joinLines(affiliationLines),
        lines: affiliationLines,
        bbox: blockBbox(affiliationLines),
      },
    ];
  });
}

/**
 * A full-width table can begin beside the final wrapped lines of its caption.
 * PDF text order then places caption prose and header cells on the same
 * baseline, and ordinary role grouping absorbs the first table rows into the
 * caption. Recover the boundary from native x gaps and repeated cell origins.
 * Font name/size remain attached to the reconstructed lines so later evidence
 * generators can compare table, caption, and body styles.
 */
function splitEmbeddedTableGridFromCaptions(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.flatMap((block) => {
    if (block.role !== "table_caption" || block.lines.length < 3) return [block];
    const captionX = block.lines[0]?.x ?? block.bbox.x;
    const pageWidth = block.lines[0]?.pageWidth ?? 612;
    const gridOffset = Math.max(72, pageWidth * 0.14);
    const captionLines: LayoutLine[] = [];
    const provisionalGrid: LayoutLine[] = [];
    const unresolvedOffsetLines: LayoutLine[] = [];

    for (const line of block.lines) {
      const items = [...line.items].sort((a, b) => a.x - b.x);
      if (items.length === 0) continue;
      const startsAtCaption = Math.abs(items[0].x - captionX) <= Math.max(10, line.fontSize * 1.4);
      if (!startsAtCaption) {
        unresolvedOffsetLines.push(line);
        continue;
      }
      let splitAt = -1;
      for (let index = 1; index < items.length; index += 1) {
        const previous = items[index - 1];
        const gap = items[index].x - (previous.x + previous.width);
        const farFromCaption = items[index].x - captionX >= gridOffset;
        const fontBoundary = previous.fontName !== items[index].fontName ||
          Math.abs(previous.fontSize - items[index].fontSize) >= 0.35;
        if (farFromCaption && gap >= Math.max(14, line.fontSize * (fontBoundary ? 1.25 : 1.6))) {
          splitAt = index;
          break;
        }
      }
      if (splitAt < 0) {
        captionLines.push(line);
        continue;
      }
      captionLines.push(itemsToLine(items.slice(0, splitAt), line.column, line.page, line.pageHeight, line.pageWidth));
      provisionalGrid.push(itemsToLine(items.slice(splitAt), line.column, line.page, line.pageHeight, line.pageWidth));
    }

    if (provisionalGrid.length === 0) return [block];
    const provisionalOrigins = provisionalGrid.flatMap((line) => line.items.map((item) => item.x));
    for (const line of unresolvedOffsetLines) {
      const items = [...line.items].sort((a, b) => a.x - b.x);
      const alignedWithGrid = items.length >= 2 && items.some((item) =>
        provisionalOrigins.some((origin) => Math.abs(item.x - origin) <= Math.max(6, item.fontSize * 0.8))
      );
      if (alignedWithGrid && items[0].x - captionX >= gridOffset) {
        provisionalGrid.push(line);
      } else {
        captionLines.push(line);
      }
    }

    const gridItems = provisionalGrid.flatMap((line) => line.items);
    const xOrigins = new Map<number, number>();
    for (const item of gridItems) {
      const bucket = Math.round(item.x / 12) * 12;
      xOrigins.set(bucket, (xOrigins.get(bucket) ?? 0) + 1);
    }
    const baselines = new Set(provisionalGrid.map((line) => Math.round(line.y / 3) * 3));
    const repeatedOrigins = [...xOrigins.values()].filter((count) => count >= 2).length;
    if (gridItems.length < 4 || baselines.size < 2 || repeatedOrigins < 1 || captionLines.length === 0) {
      return [block];
    }
    captionLines.sort((a, b) => a.y - b.y || a.x - b.x);
    provisionalGrid.sort((a, b) => a.y - b.y || a.x - b.x);
    return [
      {
        ...block,
        text: joinLines(captionLines),
        lines: captionLines,
        bbox: blockBbox(captionLines),
      },
      {
        ...block,
        role: "table" as const,
        text: joinLines(provisionalGrid),
        lines: provisionalGrid,
        bbox: blockBbox(provisionalGrid),
      },
    ];
  });
}

/** Keep a paragraph from spanning two native columns when the extractor has
 * already assigned its lines to distinct columns. A true spanning block has
 * `column=spanning` on every line; mixed left/right runs are a reading-order
 * boundary and must remain separate for the resolver to reason about. */
/**
 * A table in one physical column can share y positions with ordinary prose in
 * the adjacent column. Some PDF producers then emit alternating small-font
 * numeric table lines and body lines as one paragraph block.  Split that
 * mixed stream before role classification: otherwise a valid table grid can
 * turn all of the neighbouring prose into a table, which removes it from
 * translation.  This is intentionally based on native geometry and style,
 * rather than a publisher or paper-specific vocabulary.
 */
function splitInterleavedSmallGridAndBody(block: LayoutBlock): LayoutBlock[] | null {
  if (block.role !== "paragraph" || block.pageStart !== block.pageEnd || block.lines.length < 5) return null;
  const numericDensity = (text: string) => (text.match(/\d/g) ?? []).length / Math.max(text.length, 1);
  const gridCandidates = block.lines.filter((line) =>
    line.items.length >= 3 && numericDensity(line.text) >= 0.08 &&
    !/[.!?。！？]\s*$/.test(line.text.trim())
  );
  if (gridCandidates.length < 3) return null;
  const gridFontFloor = [...gridCandidates.map((line) => line.fontSize)].sort((a, b) => a - b)[
    Math.floor((gridCandidates.length - 1) * 0.25)
  ];
  const compactGridLines = gridCandidates.filter((line) => line.fontSize <= gridFontFloor + 0.55);
  if (compactGridLines.length < 3) return null;
  const tableRight = median(compactGridLines.map((line) =>
    Math.max(...line.items.map((item) => item.x + item.width))
  ));
  const tableLeft = median(compactGridLines.map((line) => Math.min(...line.items.map((item) => item.x))));
  const rightItems = block.lines.flatMap((line) => line.items)
    .filter((item) => item.x >= tableRight + 16);
  if (rightItems.length < 2) return null;
  // Use the start of each right-side run rather than all of its glyph spans.
  // A normal prose line has many later spans, whose median would move the
  // split through its first words and silently drop them into the table.
  const bodyStarts = block.lines.map((line) => Math.min(...line.items
    .filter((item) => item.x >= tableRight + 16)
    .map((item) => item.x))).filter(Number.isFinite);
  const bodyStart = median(bodyStarts);
  const bodyFont = median(rightItems.map((item) => item.fontSize));
  const bodyWords = rightItems.reduce((count, item) =>
    count + (item.text.match(/[A-Za-z]{3,}/g) ?? []).length, 0);
  // The horizontal gutter, type scale, and prose content are independent
  // evidence. Requiring all three avoids splitting a normal wide table whose
  // cells merely use different weights or decimal precision.
  if (bodyStart - tableRight < 18 || bodyFont - gridFontFloor < 0.8 || bodyWords < 8 || tableRight - tableLeft < 96) {
    return null;
  }
  const splitX = (tableRight + bodyStart) / 2;
  const tableLines: LayoutLine[] = [];
  const bodyLines: LayoutLine[] = [];
  for (const line of block.lines) {
    const left = line.items.filter((item) => item.x + item.width <= splitX);
    const right = line.items.filter((item) => item.x >= splitX);
    if (left.length > 0) tableLines.push(itemsToLine(left, line.column, line.page, line.pageHeight, line.pageWidth));
    if (right.length > 0) bodyLines.push(itemsToLine(right, line.column, line.page, line.pageHeight, line.pageWidth));
  }
  if (tableLines.length < 3 || bodyLines.length < 2) return null;
  const make = (lines: LayoutLine[], role: LayoutRole): LayoutBlock => ({
    ...block,
    role,
    text: joinLines(lines),
    lines,
    pageStart: lines[0].page,
    pageEnd: lines.at(-1)!.page,
    bbox: blockBbox(lines),
  });
  // Emit the body stream before the local table stream. This permits the
  // normal same-column continuation repair to rejoin body lines that the PDF
  // interleaved around the table.
  return [make(bodyLines, "paragraph"), make(tableLines, "table")];
}

/** Split one native baseline that contains a small-font numeric table tail on
 * the left and a normal body sentence on the right. The grid must be proved by
 * matching columns on at least two neighbouring native lines; this prevents a
 * statistical expression inside ordinary prose from being cut apart. */
function splitInlineGridCellsFromProse(block: LayoutBlock, pageBlocks: LayoutBlock[]): LayoutBlock[] | null {
  if ((block.role !== "paragraph" && block.role !== "table") || block.lines.length !== 1) return null;
  const line = block.lines[0];
  const items = [...line.items].sort((a, b) => a.x - b.x);
  if (items.length < 5) return null;
  const smallestFont = Math.min(...items.map((item) => item.fontSize));
  const numericPrefix = items.filter((item) =>
    item.fontSize <= smallestFont + 0.55 &&
    /^[+−-]?\d+(?:\.\d+)?%?$/.test(item.text.trim())
  );
  if (numericPrefix.length < 3) return null;
  const prefixRight = Math.max(...numericPrefix.map((item) => item.x + item.width));
  const bodyItems = items.filter((item) => item.x >= prefixRight + 16);
  const bodyWords = bodyItems.reduce((count, item) =>
    count + (item.text.match(/[A-Za-z]{3,}/g) ?? []).length, 0);
  if (bodyItems.length < 1 || bodyWords < 4 ||
      median(bodyItems.map((item) => item.fontSize)) - smallestFont < 0.8) return null;
  const prefixOrigins = numericPrefix.map((item) => item.x);
  const supportingRows = pageBlocks
    .filter((candidate) => candidate.pageStart === block.pageStart && candidate !== block)
    .flatMap((candidate) => candidate.lines)
    .filter((candidate) => Math.abs(candidate.y - line.y) <= 280)
    .filter((candidate) => candidate.items.filter((item) =>
      item.fontSize <= smallestFont + 0.55 &&
      prefixOrigins.some((origin) => Math.abs(item.x - origin) <= 8)
    ).length >= 2);
  if (supportingRows.length < 2) return null;
  const splitX = (prefixRight + Math.min(...bodyItems.map((item) => item.x))) / 2;
  const tableItems = items.filter((item) => item.x + item.width <= splitX);
  const proseItems = items.filter((item) => item.x >= splitX);
  if (tableItems.length < 3 || proseItems.length === 0) return null;
  const tableLine = itemsToLine(tableItems, line.column, line.page, line.pageHeight, line.pageWidth);
  const proseLine = itemsToLine(proseItems, line.column, line.page, line.pageHeight, line.pageWidth);
  const make = (nextLine: LayoutLine, role: LayoutRole): LayoutBlock => ({
    ...block,
    role,
    text: nextLine.text,
    lines: [nextLine],
    pageStart: nextLine.page,
    pageEnd: nextLine.page,
    bbox: blockBbox([nextLine]),
  });
  return [make(proseLine, "paragraph"), make(tableLine, "table")];
}

function splitMixedColumnBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    const interleavedTableAndBody = splitInterleavedSmallGridAndBody(block);
    if (interleavedTableAndBody) {
      result.push(...interleavedTableAndBody);
      continue;
    }
    const inlineGridAndBody = splitInlineGridCellsFromProse(block, blocks);
    if (inlineGridAndBody) {
      result.push(...inlineGridAndBody);
      continue;
    }
    if (block.role === "paragraph" && block.lines.length >= 4) {
      // Some borderless review tables interleave cells with nearby prose in
      // the native stream. Treat the block as a table only when several
      // lines independently show multi-cell geometry and numeric density;
      // ordinary statistical prose usually has one item per line and does
      // not repeat the cell-like x pattern.
      const wordCount = block.text.trim().split(/\s+/).filter(Boolean).length;
      const sentenceBoundaryCount = (block.text.match(/[.!?]\s+[A-Z]/g) ?? []).length;
      // Long prose with scattered statistics/citations is not a table. The
      // mixed-stream fallback is intentionally limited to compact regions;
      // larger blocks are resolved by the paragraph/region evidence paths.
      const tableLikeLines = wordCount <= 120 && sentenceBoundaryCount <= 1 ? block.lines.filter((line) => {
        const text = line.text.trim();
        const numericDensity = (text.match(/\d/g) ?? []).length / Math.max(text.length, 1);
        return line.items.length >= 2 && numericDensity >= 0.08 && !/[.!?]\s*$/.test(text);
      }) : [];
      const tableXBands = new Set(tableLikeLines.flatMap((line) =>
        line.items.map((item) => Math.round(item.x / 24) * 24)
      ));
      if (tableLikeLines.length >= 3 && tableXBands.size >= 3) {
        result.push({ ...block, role: "table" });
        continue;
      }
    }
    if (block.role === "paragraph" && block.lines.length >= 4) {
      const tail = block.lines.at(-1)!;
      const bodyLines = block.lines.slice(0, -1);
      const bodyFont = median(bodyLines.map((line) => line.fontSize)) || tail.fontSize;
      const previousLine = bodyLines.at(-1);
      const detachedDiagramLabel = previousLine && tail.fontSize <= bodyFont * 0.82 &&
        tail.text.trim().length <= 24 &&
        tail.y - previousLine.y > Math.max(24, bodyFont * 3.5) &&
        !/[.!?:;]$/.test(tail.text.trim());
      // Some ACM figures place a small author label on the same native text
      // block as the preceding paragraph without a large vertical gap (for
      // example ``Kong, et al.`` below a diagram).  Its typography and
      // grammar are stronger evidence than the physical gap; retaining it in
      // prose causes a later continuation to be translated with figure chrome.
      const detachedAuthorLabel = previousLine && tail.fontSize <= bodyFont * 0.82 &&
        tail.text.trim().length <= 32 &&
        /^[A-Z][A-Za-z'’-]{1,24},\s*et\s+al\.\s*$/i.test(tail.text.trim());
      if (detachedDiagramLabel || detachedAuthorLabel) {
        const bodyText = joinLines(bodyLines);
        result.push({ ...block, text: bodyText, lines: bodyLines, bbox: blockBbox(bodyLines), pageEnd: bodyLines.at(-1)!.page });
        result.push({ ...block, role: detachedAuthorLabel ? "chrome" : "paragraph", text: tail.text.trim(), lines: [tail], bbox: blockBbox([tail]), pageStart: tail.page, pageEnd: tail.page });
        continue;
      }
    }
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
      // A detached margin can contribute only one native line to a mixed
      // block (the remaining labels may be on adjacent lines/blocks).  The
      // geometry/style contrast is stronger evidence than requiring a fixed
      // number of sidebar lines.
      return left.length >= 1 && right.length >= 2 && leftMedian > 0 && rightMedian > 0 &&
        leftMedian <= rightMedian * 0.35 && rightMedian >= typicalLineWidth * 0.85;
    })();
    if (process.env.PDF_LAYOUT_DEBUG === "all" && block.pageStart === 1 && block.bbox.y < 500 && xBands.length > 1) {
      console.error(`[PDF_LAYOUT_MIXED_DEBUG] role=${block.role} lines=${block.lines.length} columns=${[...columns].join(",")} xBands=${xBands.join(",")} labelSidebar=${labelSidebar} text=${JSON.stringify(block.text.slice(0, 140))}`);
    }
    if (process.env.PDF_LAYOUT_TRACE_TEXT && block.text.includes(process.env.PDF_LAYOUT_TRACE_TEXT)) {
      console.error(`[PDF_LAYOUT_TRACE_BLOCK] stage=splitMixed role=${block.role} lines=${block.lines.length} columns=${[...columns].join(",")} xBands=${xBands.join(",")} preserve=${Boolean(block.preserveColumnContinuation)} text=${JSON.stringify(block.text.slice(0, 260))}`);
    }
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
        (!labelSidebar && block.bbox.width < typicalLineWidth * 1.65) || block.lines.length < (labelSidebar ? 2 : 3) ||
        (!startsMidPage && !labelSidebar && (columns.size < 2 || clearColumnContinuation)) ||
        crossPageColumnContinuation) {
      result.push(block);
      continue;
    }
    if (inferredTwoColumn || labelSidebar) {
      const splitX = (Math.min(...xBands) + Math.max(...xBands)) / 2;
      const left = block.lines.filter((line) => line.x <= splitX).sort((a, b) => a.y - b.y);
      const right = block.lines.filter((line) => line.x > splitX).sort((a, b) => a.y - b.y);
      if (left.length >= (labelSidebar ? 1 : 2) && right.length >= (labelSidebar ? 1 : 2)) {
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
  // A page/column break can occur inside a capitalized proper-name phrase
  // (for example, a paragraph ending in `... present Thermal` followed by
  // `Earring, ...`).  Treat this as a continuation only when the preceding
  // token is ordinary lowercase prose and the left fragment is substantial;
  // this avoids joining two independent short headings or edge marks.
  if (
    a.length >= 140 &&
    /[a-z]\s+[A-Z][A-Za-z'’-]*$/.test(a) &&
    /^[A-Z][A-Za-z'’(-]/.test(b)
  ) {
    return true;
  }
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
  return /(?:authors?[’']?\s+addresses|contributed equally|correspondence|corresponding author|requests for materials|should be addressed to|e-?mail\s*:|full list of author information|served as (?:a )?(?:special issue )?editor\b)/i.test(block.text);
}

/**
 * Some publisher footers are emitted as ordinary paragraphs rather than a
 * footer role.  Treat only explicit bibliographic footer language at the
 * physical page edge as transparent; ordinary body prose mentioning a venue
 * or date must remain opaque.  This lets an unfinished paragraph continue
 * across a footer without adding a publisher-specific rule.
 */
function isPublicationChromeBlock(block: LayoutBlock): boolean {
  if (block.role !== "paragraph" || block.lines.length === 0) return false;
  const text = block.text.trim();
  if (text.length < 24 || text.length > 240) return false;
  const edgeLine = block.lines[0];
  const pageHeight = edgeLine.pageHeight ?? 792;
  const atEdge = edgeLine.y > pageHeight * 0.82 || edgeLine.y < pageHeight * 0.18;
  if (!atEdge) return false;
  return /\b(?:publication\s+date|article\s+\d+|vol(?:ume)?\.?\s+\d+|issn\b|doi\s*:\s*10\.)/i.test(text);
}

/** Some arXiv exports place the version/date band as a large overlay directly
 * over the final line of an abstract. It is safe to treat this very specific
 * geometry as metadata; ordinary arXiv title lines remain hard boundaries. */
function isArxivOverlayBlock(block: LayoutBlock): boolean {
  if ((block.role !== "title" && block.role !== "paragraph") || block.lines.length !== 1) return false;
  // Some PDF producers classify this metadata band as ordinary paragraph text
  // and use the same body-sized font as the abstract. Match the complete
  // arXiv marker rather than any sentence that merely mentions arXiv.
  const marker = /^arXiv:\s*\d{4}\.\d{4,}(?:v\d+)?(?:\s*\[[^\]]+\])?(?:\s+(?:\d{1,4}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,4}))?$/i;
  return marker.test(block.text.trim());
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

/** ACM/IEEE-style running headers may contain a page/article marker and an
 * author surname while being emitted as an ordinary paragraph. At the top
 * edge of a page these are metadata, not body text. */
function isPageHeaderMarker(block: LayoutBlock): boolean {
  if (block.role !== "paragraph" || block.text.trim().length > 96 || block.lines.length > 2) return false;
  const line = block.lines[0];
  const height = line.pageHeight ?? 792;
  if (line.y >= height * 0.18) return false;
  return /\b\d+\s*:\s*\d+\b/.test(block.text) && /[•·|]/.test(block.text);
}

function isInlineFootnoteBlock(block: LayoutBlock): boolean {
  if (block.role !== "paragraph" || block.text.trim().length > 180 || block.lines.length > 2) return false;
  const line = block.lines[0];
  const height = line.pageHeight ?? 792;
  return line.y > height * 0.62 && /^(?:[*†‡∗]|\d+[.)])\s*/.test(block.text.trim());
}

/** A short, column-displaced row of statistical/table headings is not a prose
 * continuation, even when the preceding paragraph ends in a connector such as
 * "refers to the".  This catches flattened table headers without treating
 * ordinary sentences containing one of these words as a table. */
function isDetachedTableHeaderBlock(block: LayoutBlock, previous: LayoutBlock): boolean {
  if (block.role !== "paragraph" || block.text.length < 12 || block.text.length > 120 || block.lines.length > 2) return false;
  const text = block.text.trim();
  if (/[.!?:;]$/.test(text)) return false;
  // A native stream can put a two-line, multi-cell header at the top of the
  // next physical column. It is not a continuation of the unfinished prose
  // in the previous column even when its words are not conventional
  // statistical headers (for example, questionnaire option labels).
  if (block.lines.some((line) => line.items.length >= 3)) {
    const previousLine = previous.lines.at(-1);
    const nextLine = block.lines[0];
    if (previousLine && nextLine && Math.abs(previousLine.x - nextLine.x) >= 80) return true;
  }
  const words = text.match(/[A-Za-z][A-Za-z.]*/g) ?? [];
  if (words.length < 3) return false;
  const headerWords = new Set(["variable", "factor", "measure", "item", "group", "condition", "n", "mean", "median", "std", "sd", "se", "min", "max", "range", "p", "t", "f"]);
  const headerCount = words.filter((word) => headerWords.has(word.toLowerCase().replace(/\.$/, ""))).length;
  if (headerCount < 2 || headerCount / words.length < 0.45) return false;
  const previousLine = previous.lines.at(-1);
  const nextLine = block.lines[0];
  return Boolean(previousLine && nextLine && Math.abs(previousLine.x - nextLine.x) >= 80);
}

function isTopBibliographicLine(line: LayoutLine): boolean {
  const text = line.text.trim();
  if (line.y >= (line.pageHeight ?? 792) * 0.18) return false;
  return /^https?:\/\/\S+$/i.test(text) ||
    /\b(?:e-?issn|p-?issn|published\s+by|journal\s+\w+|vol\.\s*\d+)/i.test(text);
}

/** Separate top-margin bibliographic lines that a native stream has attached
 * to an otherwise valid paragraph block before page-boundary stitching. */
function splitTopBibliographicLines(blocks: LayoutBlock[]): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    if (block.role !== "paragraph" || !block.lines.some(isTopBibliographicLine)) {
      result.push(block);
      continue;
    }
    const body = block.lines.filter((line) => !isTopBibliographicLine(line));
    const chrome = block.lines.filter(isTopBibliographicLine);
    if (body.length > 0) {
      result.push({ ...block, lines: body, text: joinLines(body), pageStart: body[0].page, pageEnd: body.at(-1)!.page, bbox: blockBbox(body) });
    }
    for (const line of chrome) {
      result.push({ ...block, role: "header", lines: [line], text: line.text.trim(), pageStart: line.page, pageEnd: line.page, bbox: blockBbox([line]) });
    }
  }
  return result;
}

function isTransparentMetadataBlock(block: LayoutBlock, repeatedTexts: Set<string>): boolean {
  return block.role === "header" || block.role === "footer" || block.role === "footnote" || block.role === "chrome" ||
    block.role === "affiliation" || block.role === "copyright" || isUnclassifiedFootnote(block) ||
    isAuthorMetadataBlock(block) ||
    (block.role === "paragraph" && block.text.length < 260 && block.lines.length <= 5 && looksLikeAffiliation(block.text)) ||
    isPublicationChromeBlock(block) || isArxivOverlayBlock(block) || isRepeatedRunningHeader(block, repeatedTexts) ||
    isRepeatedEdgeMarker(block, repeatedTexts) || isPageHeaderMarker(block) || isInlineFootnoteBlock(block);
}

/** A narrow single-column margin item may be interleaved in reading order
 * with body text when the page's sidebar is too sparse to trigger column
 * detection. It is transparent only when native x geometry places the whole
 * item clearly left of a wide body line. */
function isDetachedSingleColumnMarginBlock(block: LayoutBlock, bodyX: number): boolean {
  const gapToBody = bodyX - (block.bbox.x + block.bbox.width);
  const pageWidth = block.lines[0]?.pageWidth ?? 612;
  return (block.column === "single" || block.column === "left") && block.bbox.width <= 160 &&
    gapToBody >= 12 && gapToBody <= pageWidth * 0.3 &&
    block.lines.length > 0 &&
    block.lines.every((line) => line.column === "single" || line.column === "left");
}

function hasRotatedNativeLine(block: LayoutBlock): boolean {
  return block.lines.some((line) => Math.abs(line.rotation ?? 0) >= 45);
}

function mergeColumnContinuations(blocks: LayoutBlock[]): LayoutBlock[] {
  // Split a paragraph block whose native lines contain a compact right-side
  // vector-label run and a left-side body run. This occurs when figure text
  // shares a baseline with prose; keeping the label in the paragraph block
  // makes later continuation merging reintroduce it.
  const expandedBlocks = blocks.flatMap((block) => {
    if (block.role !== "paragraph" || block.lines.length < 2) return [block];
    const pageWidth = block.lines[0]?.pageWidth ?? 612;
    const hasCaptionBelow = blocks.some((candidate) =>
      candidate.role === "figure_caption" && candidate.pageStart === block.pageStart &&
      candidate.bbox.y > block.bbox.y && candidate.bbox.y - block.bbox.y <= 280
    );
    if (!hasCaptionBelow) return [block];
    const bodyFont = median(block.lines.map((line) => line.fontSize));
    const labelLines = block.lines.filter((line) =>
      line.x > pageWidth * 0.45 && line.text.trim().length <= 80 &&
      line.text.trim().split(/\s+/).filter(Boolean).length <= 12 &&
      line.fontSize <= bodyFont * 0.9 &&
      !/[.!?。！？:;]/.test(line.text.trim())
    );
    if (labelLines.length === 0 || labelLines.length === block.lines.length) return [block];
    const bodyLines = block.lines.filter((line) => !labelLines.includes(line));
    const make = (lines: LayoutLine[]): LayoutBlock => ({
      ...block,
      lines,
      text: joinLines(lines),
      pageStart: lines[0].page,
      pageEnd: lines.at(-1)!.page,
      bbox: blockBbox(lines),
    });
    return [make(bodyLines), make(labelLines)];
  });
  blocks = expandedBlocks;
  const textCounts = new Map<string, number>();
  for (const block of blocks) {
    const text = normalizedRunningText(block.text);
    if (text) textCounts.set(text, (textCounts.get(text) ?? 0) + 1);
  }
  const repeatedTexts = new Set([...textCounts].filter(([, count]) => count >= 2).map(([text]) => text));
  const pageFontMedians = new Map<number, number>();
  for (const page of new Set(blocks.flatMap((block) => block.lines.map((line) => line.page)))) {
    const sizes = blocks.flatMap((block) => block.lines.filter((line) => line.page === page).map((line) => line.fontSize));
    const bodyLikeSizes = sizes.filter((size) => size >= 8.5);
    pageFontMedians.set(page, median(bodyLikeSizes.length > 0 ? bodyLikeSizes : sizes) || 9);
  }
  const isFigureBandLabel = (candidate: LayoutBlock, following?: LayoutBlock): boolean => {
    if (candidate.role !== "paragraph" || following?.role !== "figure_caption") return false;
    const pageMedian = pageFontMedians.get(candidate.pageStart) ?? 9;
    const maxFont = Math.max(...candidate.lines.map((line) => line.fontSize), 0);
    return candidate.pageStart === candidate.pageEnd &&
      candidate.text.trim().length <= 80 &&
      maxFont <= pageMedian * 0.84 &&
      !/[!?:;]$/.test(candidate.text.trim());
  };
  const isDetachedAuthorLabelBlock = (candidate: LayoutBlock): boolean => {
    const pageMedian = pageFontMedians.get(candidate.pageStart) ?? 9;
    return candidate.role === "paragraph" && candidate.pageStart === candidate.pageEnd &&
      candidate.text.trim().length <= 32 &&
      /^[A-Z][A-Za-z'’-]{1,24},\s*et\s+al\.\s*$/i.test(candidate.text.trim()) &&
      Math.max(...candidate.lines.map((line) => line.fontSize), 0) <= pageMedian * 0.84;
  };
  const isArticleRunningHeader = (candidate: LayoutBlock): boolean => {
    if (candidate.role !== "paragraph" || candidate.pageStart <= 1 || candidate.lines.length > 2) return false;
    const line = candidate.lines[0];
    const pageHeight = line.pageHeight ?? 792;
    const text = candidate.text.trim();
    return line.y < pageHeight * 0.18 && text.length >= 24 && text.length <= 180 &&
      /\bet\s+al\.\s*:/i.test(text) && !/[.!?]$/.test(text);
  };
  const isAbstractBodyTitleBlock = (candidate: LayoutBlock): boolean =>
    candidate.role === "title" && candidate.pageStart === candidate.pageEnd &&
    candidate.text.length >= 96 &&
      /^abstract\s*[—–-]\s*/i.test(candidate.text.trim()) &&
      candidate.lines.length >= 2;
  // A compact table in the left physical band can be interleaved between two
  // consecutive body fragments from the right band. It is not source text for
  // that paragraph. Keep the table as its own node, but permit the normal
  // continuation logic to look past it only when its complete horizontal
  // extent is outside the body column.
  const isParallelTableBand = (candidate: LayoutBlock, body: LayoutBlock): boolean =>
    candidate.role === "table" && body.role === "paragraph" &&
    candidate.pageStart === body.pageStart && candidate.pageEnd === body.pageEnd &&
    candidate.bbox.x + candidate.bbox.width + 16 <= body.bbox.x;
  const figureBandBlocks = new Set<LayoutBlock>();
  for (const caption of blocks.filter((block) => block.role === "figure_caption" || block.role === "table_caption")) {
    const pageMedian = pageFontMedians.get(caption.pageStart) ?? 9;
    for (const candidate of blocks) {
      if (candidate === caption || candidate.pageStart !== caption.pageStart || candidate.pageEnd !== caption.pageEnd || candidate.role === "title") continue;
      const maxFont = Math.max(...candidate.lines.map((line) => line.fontSize), 0);
      if (candidate.bbox.y >= caption.bbox.y - 260 && candidate.bbox.y < caption.bbox.y &&
          maxFont <= pageMedian * 0.9 && candidate.text.length <= 180 && !/[.!?]$/.test(candidate.text.trim())) {
        figureBandBlocks.add(candidate);
      }
      const graphicLabelBand = caption.role === "figure_caption" && (candidate.lines[0]?.pageWidth ?? 612) > 0 &&
        (candidate.lines[0]?.pageWidth ?? 612) === (caption.lines[0]?.pageWidth ?? 0) &&
        (candidate.bbox.x > (candidate.lines[0]?.pageWidth ?? 612) * 0.45) &&
        (candidate.lines.length <= 3) && candidate.text.length <= 80 &&
        candidate.text.split(/\s+/).filter(Boolean).length <= 12 &&
        !/[.!?。！？:;]/.test(candidate.text.trim()) &&
        (candidate.lines[0]?.items.length ?? 0) >= 1;
      if (graphicLabelBand && (candidate.lines[0]?.pageWidth ?? 0) > 0) figureBandBlocks.add(candidate);
    }
  }
  const isBodyRunInsideFigureBand = (block: LayoutBlock): boolean =>
    block.role === "paragraph" &&
    block.text.trim().split(/\s+/).filter(Boolean).length >= 8 &&
    median(block.lines.map((line) => line.width)) >= (block.lines[0]?.pageWidth ?? 612) * 0.3 &&
    median(block.lines.map((line) => line.fontSize)) >= (pageFontMedians.get(block.pageStart) ?? 9) * 0.85;
  const result: LayoutBlock[] = [];
  for (const block of blocks) {
    if (isAbstractBodyTitleBlock(block)) block.role = "paragraph";
    if (isDetachedAuthorLabelBlock(block)) {
      result.push({ ...block, role: "chrome" });
      continue;
    }
    if (isArticleRunningHeader(block)) {
      result.push({ ...block, role: "header" });
      continue;
    }
    if (figureBandBlocks.has(block) && !isBodyRunInsideFigureBand(block)) {
      result.push(block);
      continue;
    }
    let targetIdx = result.length - 1;
    while (
      targetIdx >= 0 &&
      (result[targetIdx].role === "copyright" ||
        result[targetIdx].role === "chrome" ||
        result[targetIdx].role === "header" ||
        result[targetIdx].role === "footer" ||
        result[targetIdx].role === "footnote" ||
        result[targetIdx].role === "affiliation" ||
        isUnclassifiedFootnote(result[targetIdx]) ||
        isAuthorMetadataBlock(result[targetIdx]) ||
        isPublicationChromeBlock(result[targetIdx]) ||
        isArxivOverlayBlock(result[targetIdx]) ||
        result[targetIdx].role === "figure_caption" ||
        result[targetIdx].role === "table_caption" ||
        (figureBandBlocks.has(result[targetIdx]) && !isBodyRunInsideFigureBand(result[targetIdx])) ||
        isRepeatedRunningHeader(result[targetIdx], repeatedTexts) ||
        isPageHeaderMarker(result[targetIdx]) ||
        isInlineFootnoteBlock(result[targetIdx]) ||
        isRepeatedEdgeMarker(result[targetIdx], repeatedTexts) ||
        isDetachedSingleColumnMarginBlock(result[targetIdx], block.bbox.x) ||
        isFigureBandLabel(result[targetIdx], result[targetIdx + 1]) ||
        isDetachedAuthorLabelBlock(result[targetIdx]) ||
        // A figure/table caption can be physically placed between two lines
        // of one paragraph. It must remain its own canonical block, but must
        // not hide an unambiguously incomplete paragraph from its continuation.
        result[targetIdx].role === "figure_caption" ||
        result[targetIdx].role === "table_caption" ||
        isParallelTableBand(result[targetIdx], block))
    ) {
      targetIdx--;
    }
    const skippedInterveningMetadata = targetIdx < result.length - 1;
    const target = targetIdx >= 0 ? result[targetIdx] : null;
    const targetLine = target?.lines.at(-1);
    const nextLine = block.lines[0];
    const skippedBlocks = targetIdx >= 0 ? result.slice(targetIdx + 1) : [];
    const detachedInlineCitationBand = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "spanning" && block.column === "right" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && targetLine && nextLine &&
      /^\s*\d{1,2}\s*\(/.test(block.text) &&
      !/[.!?:;)]\s*$/.test(targetLine.text.trim()) &&
      Math.abs(nextLine.y - targetLine.y) <= Math.max(targetLine.fontSize, nextLine.fontSize) * 1.8 &&
      target.bbox.y <= block.bbox.y + block.bbox.height &&
      block.bbox.y <= target.bbox.y + target.bbox.height
    );
    if (detachedInlineCitationBand && target) {
      target.text = `${target.text} ${block.text}`.replace(/\s+/g, " ").trim();
      // Keep provenance lines in lockstep with the text. Without this, a
      // citation band can be appended to the canonical string while its
      // native lines remain on the detached block, making the block appear
      // lossy to source-integrity checks and downstream consumers.
      target.lines = [...target.lines, ...block.lines];
      target.bbox = blockBbox(target.lines);
      target.preserveColumnContinuation = true;
      continue;
    }
    const reorderInterleavedListBand = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "spanning" && block.column === "right" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && targetLine && nextLine &&
      Math.abs(nextLine.y - (target.lines.find((line) => /\b(?:for|including|such\s+as)\s*$/i.test(line.text.trim()))?.y ?? nextLine.y)) <=
        Math.max(targetLine.fontSize, nextLine.fontSize) * 2.2 &&
      /^\s*(?:[{“"'(]|\[)/.test(block.text) &&
      target.lines.some((line) => /\b(?:for|including|such\s+as)\s*$/i.test(line.text.trim())) &&
      target.bbox.y <= block.bbox.y + block.bbox.height &&
      block.bbox.y <= target.bbox.y + target.bbox.height
    );
    if (reorderInterleavedListBand && target) {
      target.lines = [...target.lines, ...block.lines].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
      target.text = joinLines(target.lines).replace(/\s+/g, " ").trim();
      target.pageEnd = target.lines.at(-1)?.page ?? target.pageEnd;
      target.bbox = blockBbox(target.lines);
      target.preserveColumnContinuation = true;
      continue;
    }
    // A narrow rail label can be emitted between two same-column body lines
    // at the same baseline. It is neither transparent metadata nor part of
    // the paragraph: keep the label separate, while allowing the following
    // body fragment to rejoin its actual body predecessor.
    const currentIsDetachedMargin = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      targetLine && nextLine && block.pageStart === target.pageEnd &&
      block.column === target.column &&
      isDetachedSingleColumnMarginBlock(block, targetLine.x) &&
      Math.abs(nextLine.y - targetLine.y) <= Math.max(targetLine.fontSize, nextLine.fontSize) * 1.65
    );
    const safeDetachedMarginGap = Boolean(
      skippedBlocks.length > 0 && target && targetLine && nextLine &&
      target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "single" && block.column === "single" &&
      Math.abs(targetLine.x - nextLine.x) <= 18 &&
      skippedBlocks.every((skipped) =>
        isDetachedSingleColumnMarginBlock(skipped, targetLine.x) &&
        skipped.pageStart === targetLine.page && skipped.pageEnd === targetLine.page &&
        Math.abs((skipped.lines[0]?.y ?? 0) - targetLine.y) <=
          Math.max(targetLine.fontSize, nextLine.fontSize) * 1.65
      )
    );
    const safeColumnMetadataGap = Boolean(
      skippedBlocks.length > 0 && target && targetLine &&
      skippedBlocks.every((skipped) => {
        const transparent = skipped.role === "header" || skipped.role === "footer" || skipped.role === "footnote" ||
          skipped.role === "chrome" ||
          skipped.role === "affiliation" || skipped.role === "copyright" ||
          isUnclassifiedFootnote(skipped) || isAuthorMetadataBlock(skipped) ||
          isRepeatedRunningHeader(skipped, repeatedTexts) || isPageHeaderMarker(skipped) || isInlineFootnoteBlock(skipped);
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
      if (safeDetachedMarginGap) return true;
      if (isTransparentMetadataBlock(skipped, repeatedTexts)) return true;
      if (isParallelTableBand(skipped, block)) return true;
      if (skipped.role !== "figure_caption" && skipped.role !== "table_caption") return false;
      const captionBottom = skipped.bbox.y + skipped.bbox.height;
      const captionOnEarlierPage = skipped.pageEnd < (targetLine?.page ?? Number.NEGATIVE_INFINITY);
      const precedesSourceTail = skipped.pageEnd === target?.pageEnd && captionBottom < (targetLine?.y ?? Number.NEGATIVE_INFINITY);
      const precedesContinuation = skipped.pageStart === block.pageStart && captionBottom < (nextLine?.y ?? Number.NEGATIVE_INFINITY);
      return captionOnEarlierPage || precedesSourceTail || precedesContinuation;
    });
    // A two-column page can place a figure in the continuation column while
    // the preceding paragraph ends at the bottom of the other column.  Allow
    // the paragraph to resume only when geometry proves that every intervening
    // item is affiliation metadata or a float above the continuation, and the
    // next text is a lowercase syntactic continuation.  This is deliberately
    // stricter than treating every figure as transparent.
    const wrapsAcrossColumnAfterFloat = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && target.column === "left" && block.column === "right" &&
      target.text.trim().length >= 140 && !/[.!?:]$/.test(target.text.trim()) &&
      /^[a-z(]/.test(block.text.trim()) && targetLine && nextLine &&
      targetLine.y > (targetLine.pageHeight ?? 792) * 0.62 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 1.0 &&
      isSentenceContinuation(target.text, block.text) &&
      skippedBlocks.length > 0 && skippedBlocks.every((skipped) => {
        if (skipped.role === "affiliation" || isAuthorMetadataBlock(skipped)) return true;
        if ((skipped.role as string) !== "figure" && (skipped.role as string) !== "table") return false;
        return skipped.column === "right" &&
          skipped.bbox.y + skipped.bbox.height <= nextLine.y;
      })
    );
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
      target && (target.role === "paragraph" || isAbstractBodyTitleBlock(target)) && block.role === "paragraph" &&
      (!skippedInterveningMetadata || safeContinuationMetadataGap) && targetLine && nextLine &&
      targetLine.page === nextLine.page && targetLine.column === nextLine.column &&
      (targetLine.column === "single" || targetLine.column === "left" || targetLine.column === "right") &&
      // The final native line can start in a different x-band when the PDF
      // wraps words inside a mixed text stream. Compare the paragraph column
      // anchors rather than that line's x position.
      Math.abs(target.bbox.x - block.bbox.x) <= 18 && nextLine.y > targetLine.y &&
      nextLine.y - targetLine.y <= Math.max(targetLine.fontSize, nextLine.fontSize) * 3.2 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      !/[.!?:]$/.test(target.text.trim()) && isSentenceContinuation(target.text, block.text)
    );
    // Abstracts and other full-width masthead paragraphs can be classified as
    // `spanning` because their first line crosses the column band, while the
    // remaining lines are emitted as a normal body column.  Preserve a clear
    // same-column continuation in that case, but require the same geometric
    // baseline, matching font, an unfinished source tail, and a lowercase
    // continuation so a new heading/list is never absorbed.
    const joinsSpanningBodyContinuation = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "spanning" && (block.column === "left" || block.column === "right" || block.column === "single") &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && targetLine && nextLine &&
      Math.abs(targetLine.x - nextLine.x) <= 18 && nextLine.y > targetLine.y &&
      nextLine.y - targetLine.y <= Math.max(targetLine.fontSize, nextLine.fontSize) * 3.2 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      target.text.trim().length >= 80 && !/[.!?:]$/.test(target.text.trim()) &&
      /^[a-z(]/.test(block.text.trim()) && isSentenceContinuation(target.text, block.text)
    );
    if (process.env.PDF_LAYOUT_CONTINUATION_DEBUG === "1" && target && target.pageStart === block.pageStart &&
        target.column === block.column && target.role !== "heading" && block.role !== "heading") {
      console.warn(`[PDF_LAYOUT_CONTINUATION] targetRole=${target.role} blockRole=${block.role} ` +
        `targetEnd=${JSON.stringify(target.text.slice(-90))} blockStart=${JSON.stringify(block.text.slice(0, 90))} ` +
        `sameColumn=${targetLine?.column === nextLine?.column} yGap=${((nextLine?.y ?? 0) - (targetLine?.y ?? 0)).toFixed(2)} ` +
        `fontDelta=${Math.abs((targetLine?.fontSize ?? 0) - (nextLine?.fontSize ?? 0)).toFixed(2)} ` +
        `sentence=${isSentenceContinuation(target.text, block.text)} joins=${joinsSameColumnContinuation}`);
    }
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
    const wrapsAcrossColumnsAtModerateTop = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "left" && block.column === "right" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      target.pageEnd === block.pageStart && target.text.trim().length >= 80 &&
      !/[.!?:]$/.test(target.text.trim()) && /^[a-z(]/.test(block.text.trim()) &&
      targetLine && nextLine && targetLine.page === nextLine.page &&
      targetLine.y > (targetLine.pageHeight ?? 792) * 0.68 &&
      nextLine.y < (nextLine.pageHeight ?? 792) * 0.4 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      isSentenceContinuation(target.text, block.text)
    );
    const joinsHyphenatedContinuation = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.column === block.column && target.pageEnd === block.pageStart &&
      target.text.trim().length >= 24 && /[-\u00ad\u2010\u2011]$/u.test(target.text.trim()) &&
      /^[a-z0-9]/i.test(block.text.trim())
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
    // Bibliography entries are independent records. In two-column reference
    // pages the left column can end at the same vertical band where the right
    // column begins; never treat that as a prose continuation.
    const hardCrossColumnReferenceBoundary = Boolean(
      target && block && target.column !== block.column &&
      /\((?:19|20)\d{2}[a-z]?\)\./i.test(target.text) &&
      /\((?:19|20)\d{2}[a-z]?\)\./i.test(block.text) &&
      (/(?:doi\s*:|https?:\/\/|\bet\s+al\.?\b)/i.test(target.text) ||
        /(?:doi\s*:|https?:\/\/|\bet\s+al\.?\b)/i.test(block.text))
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
    // A sparse margin can occupy several native y-lines between two body
    // lines.  Once every intervening block is proven to be a narrow detached
    // rail, allow the body sentence to rejoin across that vertical band.
    const rejoinAfterDetachedMargin = Boolean(
      skippedInterveningMetadata && target && target.role === "paragraph" &&
      block.role === "paragraph" && target.column === "single" &&
      block.column === "single" && target.pageStart === target.pageEnd &&
      block.pageStart === block.pageEnd && target.pageStart === block.pageStart &&
      targetLine && nextLine && Math.abs(targetLine.x - nextLine.x) <= 12 &&
      target.text.trim().length >= 80 && !/[.!?:]$/.test(target.text.trim()) &&
      /^[a-z(]/.test(block.text.trim()) &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 1.0 &&
      nextLine.y > targetLine.y && nextLine.y - targetLine.y <= Math.max(48, targetLine.fontSize * 5) &&
      skippedBlocks.every((skipped) => isDetachedSingleColumnMarginBlock(skipped, targetLine.x))
    );
    const interleavedBandTarget = targetIdx > 0 ? result[targetIdx - 1] : null;
    const rejoinInterleavedBand = Boolean(
      !currentIsDetachedMargin &&
      interleavedBandTarget && target &&
      target.role === "paragraph" && block.role === "paragraph" &&
      target.column === "single" && block.column === "single" &&
      target.pageStart === target.pageEnd && block.pageStart === block.pageEnd &&
      interleavedBandTarget.pageStart === block.pageStart &&
      Math.abs(interleavedBandTarget.bbox.x - block.bbox.x) <= 24 &&
      target.bbox.x + target.bbox.width + 18 <= block.bbox.x &&
      /^[a-z]/.test(block.text.trim()) &&
      /[,;]$/.test(interleavedBandTarget.text.trim())
    );
    const figureBandGap = skippedBlocks.length > 0 &&
      skippedBlocks.some((skipped) => skipped.role === "figure_caption" || skipped.role === "table_caption") &&
      skippedBlocks.every((skipped) => figureBandBlocks.has(skipped) || skipped.role === "figure_caption" || skipped.role === "table_caption");
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
    // Some publishers leave a substantial bottom margin after the final body
    // line (or float a figure below it), so a genuine paragraph continuation
    // can end above the usual 68% tail threshold.  Permit the same-column,
    // lowercase continuation only when both blocks are long, styles match,
    // the next block is near the page top, and the source tail is syntactically
    // unfinished.  This keeps independent page-start paragraphs separate.
    const crossesPageBoundaryWithModerateTail = Boolean(
      target && (!skippedInterveningMetadata || safeBoundaryMetadataGap || safeContinuationMetadataGap) &&
      target.role === "paragraph" && block.role === "paragraph" &&
      target.pageEnd + 1 === block.pageStart && target.column === block.column &&
      target.text.trim().length >= 140 && block.text.trim().length >= 24 &&
      !/[.!?:]$/.test(target.text.trim()) && /^[a-z(]/.test(block.text.trim()) &&
      targetLine && nextLine &&
      (targetLine.y ?? 0) > (targetLine.pageHeight ?? 792) * 0.52 &&
      (nextLine.y ?? Number.MAX_SAFE_INTEGER) < (nextLine.pageHeight ?? 792) * 0.35 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      isSentenceContinuation(target.text, block.text)
    );
    const crossesPageBoundaryAfterFigureBand = Boolean(
      target && figureBandGap && target.role === "paragraph" && block.role === "paragraph" &&
      target.pageEnd + 1 === block.pageStart && target.column === block.column &&
      target.text.trim().length >= 120 && !/[.!?:]$/.test(target.text.trim()) &&
      /^[a-z(]/.test(block.text.trim()) && targetLine && nextLine &&
      (targetLine.y ?? 0) > (targetLine.pageHeight ?? 792) * 0.18 &&
      (nextLine.y ?? Number.MAX_SAFE_INTEGER) < (nextLine.pageHeight ?? 792) * 0.35 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8 &&
      isSentenceContinuation(target.text, block.text)
    );
    const crossesPageBoundaryProperName = Boolean(
      target && target.role === "paragraph" && block.role === "paragraph" &&
      target.pageEnd + 1 === block.pageStart && target.column === block.column &&
      target.text.trim().length >= 140 && block.text.trim().length >= 24 &&
      !/[.!?:]$/.test(target.text.trim()) &&
      /[a-z]\s+[A-Z][A-Za-z'’-]*$/.test(target.text.trim()) &&
      /^[A-Z][A-Za-z'’(-]/.test(block.text.trim()) &&
      safeContinuationMetadataGap && targetLine && nextLine &&
      (targetLine.y ?? 0) > (targetLine.pageHeight ?? 792) * 0.52 &&
      (nextLine.y ?? Number.MAX_SAFE_INTEGER) < (nextLine.pageHeight ?? 792) * 0.35 &&
      Math.abs(targetLine.fontSize - nextLine.fontSize) <= 0.8
    );
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
        crossesPageBoundary || crossesPageBoundaryWithModerateTail || crossesPageBoundaryAfterFigureBand || crossesPageBoundaryProperName || wrapsAcrossColumnAfterFloat
      )
    );
    if (debugFlag === "1" && target && block.role === "paragraph" && target.role === "paragraph" &&
        target.pageEnd + 1 === block.pageStart && /[A-Z][A-Za-z'’-]*$/.test(target.text.trim()) && /^[A-Z]/.test(block.text.trim())) {
      console.warn(`[PDF_LAYOUT_PAGE_CANDIDATE] target=${target.text.slice(-90)} next=${block.text.slice(0, 90)} skipped=${skippedBlocks.map((item) => `${item.role}:${item.text.slice(0, 32)}`).join("|")} safeColumn=${safeColumnMetadataGap} safeBoundary=${safeBoundaryMetadataGap} safeContinuation=${safeContinuationMetadataGap} cross=${crossesPageBoundary} moderate=${crossesPageBoundaryWithModerateTail} sentence=${isSentenceContinuation(target.text, block.text)} targetLen=${target.text.length} nextLen=${block.text.length} pages=${target.pageEnd}->${block.pageStart} y=${targetLine?.y}/${targetLine?.pageHeight}->${nextLine?.y}/${nextLine?.pageHeight} font=${targetLine?.fontSize}/${nextLine?.fontSize} col=${target.column}/${block.column}`);
    }
    if (debugFlag === "1" && target && target.column === "left" && block.column === "right") {
      console.warn(`[PDF_LAYOUT_CROSS_COLUMN] target=${target.text.slice(-70)} next=${block.text.slice(0, 70)} skipped=${skippedInterveningMetadata} wrap=${wrapsAcrossColumnsAtPageBottom} continuation=${isSentenceContinuation(target.text, block.text)} targetY=${targetLine?.y}/${targetLine?.pageHeight} nextY=${nextLine?.y}/${nextLine?.pageHeight} targetPage=${target.pageStart}-${target.pageEnd} nextPage=${block.pageStart}-${block.pageEnd} rotated=${hasRotatedNativeLine(target)}/${hasRotatedNativeLine(block)}`);
    }
    const traceText = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_TRACE_TEXT;
    if (traceText && target && block && (target.text.includes(traceText) || block.text.includes(traceText))) {
      console.warn(`[PDF_LAYOUT_TRACE_MERGE] targetRole=${target.role} blockRole=${block.role} targetColumn=${target.column} blockColumn=${block.column} targetEnd=${JSON.stringify(target.text.slice(-120))} blockStart=${JSON.stringify(block.text.slice(0, 120))} joinsSame=${joinsSameColumnContinuation} joinsSpan=${joinsSpanningBodyContinuation} joinsHyphen=${joinsHyphenatedContinuation} wrapsPhysical=${wrapsAcrossPhysicalColumns} targetPreserve=${Boolean(target.preserveColumnContinuation)}`);
    }
    // Structural headings/titles are hard boundaries. A continuation repair
    // must never absorb the first body line into a heading (notably an
    // `Abstract` label in ACM two-column PDFs).
    if (target && (target.role === "heading" || target.role === "title")) {
      result.push(block);
      continue;
    }
    if (
      target && (target.role === "paragraph" || isAbstractBodyTitleBlock(target)) && block.role === "paragraph" &&
      !currentIsDetachedMargin &&
        !isDetachedTableHeaderBlock(block, target) &&
        !hardCrossColumnReferenceBoundary &&
        (joinsCompleteLeadingContinuation || joinsSameColumnContinuation || joinsSpanningBodyContinuation || joinsHyphenatedContinuation || geometrySameLineContinuation || rejoinAfterDetachedMargin || wrapsAcrossColumnsAtPageBottom || wrapsAcrossColumnsAtModerateTop || wrapsAcrossPhysicalColumns || wrapsAcrossAdjacentColumnTails ||
        (canContinueAcrossColumns && isSentenceContinuation(target.text, block.text)) ||
        crossesPageBoundaryAfterFigureBand || crossesPageBoundaryProperName ||
        wrapsAcrossColumnAfterFloat) &&
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
        if (isAbstractBodyTitleBlock(target)) target.role = "paragraph";
        target.text = joinHyphenated(target.text, block.text).replace(/\s+/g, " ").trim();
        target.lines = [...target.lines, ...block.lines];
        target.pageEnd = block.pageEnd;
      }
      target.bbox = blockBbox(target.lines);
      if (target.column !== block.column) {
        target.preserveColumnContinuation = true;
        // Same-page cross-column joins are accepted only from the geometry
        // continuation branches above. Record that provenance explicitly so
        // downstream reading-order validation can distinguish them from an
        // accidental mixed-column paragraph.
        if (target.pageStart === block.pageStart && targetLine && nextLine &&
            target.bbox.y <= block.bbox.y + block.bbox.height &&
            block.bbox.y <= target.bbox.y + target.bbox.height) {
          target.adjacentBandContinuation = true;
        }
      }
      continue;
    }
    if (rejoinInterleavedBand && interleavedBandTarget) {
      if (debugFlag === "1") console.warn(`[PDF_LAYOUT_REJOIN] ${interleavedBandTarget.text.slice(-30)} -> ${block.text.slice(0,30)}`);
      interleavedBandTarget.text = joinHyphenated(interleavedBandTarget.text, block.text).replace(/\s+/g, " ").trim();
      interleavedBandTarget.lines = [...interleavedBandTarget.lines, ...block.lines];
      interleavedBandTarget.bbox = blockBbox(interleavedBandTarget.lines);
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
  // Text bboxes stop at the glyph bounds, while ruled tables and embedded
  // table artwork usually extend beyond them. Keep a small geometry-derived
  // margin so the first/last row and its border are not clipped in the Reader.
  const tableCropPadding = 8;

  // A ruled table is text, rather than an embedded raster image. The normal
  // figure crop logic treats the closest preceding text as the boundary of a
  // figure and therefore clips the table itself out of the crop. Detect a
  // compact, multi-line table stream immediately above a table caption and
  // use its top edge as the crop boundary instead. This is geometry based:
  // body paragraphs remain excluded by their wide lines and body-sized text.
  if (caption.role === "table_caption") {
    const compactTableRows = (direction: "above" | "below") => blocks.filter((block) => {
      if (block.pageStart !== caption.pageStart || block === caption) return false;
      if (block.role === "header" || block.role === "footer" || block.role === "copyright") return false;
      if (!overlapsBand(block.bbox, band)) return false;
      if (block.role === "heading" || block.role === "title" || block.role === "figure_caption" || block.role === "table_caption") return false;
      const bottom = block.bbox.y + block.bbox.height;
      const distance = direction === "above" ? captionTop - bottom : block.bbox.y - (captionTop + caption.bbox.height);
      if (distance < -2 || distance > 280) return false;
      const lines = block.lines;
      if (lines.length === 0) return false;
      const maxLineWidth = Math.max(...lines.map((line) => line.bbox.width));
      const shortLines = lines.filter((line) => line.bbox.width <= band.width * 0.78).length;
      const compactText = block.text.trim().split(/\s+/).filter(Boolean).length <= 48;
      const cellLikeLines = lines.filter((line) => line.items.length >= 3).length;
      const numericCells = lines.flatMap((line) => line.items).filter((item) => /\d/.test(item.text)).length;
      // A ruled table can use almost the full column width. Its native row is
      // then wider than the ordinary compact-row threshold even though the
      // repeated cells remain explicit. Permit that shape only with multiple
      // same-row cells and numeric data; a short full-width prose sentence
      // remains outside the crop.
      const compactCellGrid =
        cellLikeLines >= Math.max(1, Math.ceil(lines.length * 0.5)) && numericCells >= 1;
      // A table row can be emitted as one native line or as separate cell
      // lines. Body prose is deliberately excluded by its width; a sequence
      // of these compact blocks is required below before it becomes a crop.
      return compactText && (
        (shortLines / lines.length >= 0.75 && maxLineWidth <= band.width * 0.9) ||
        (compactCellGrid && maxLineWidth <= Math.max(band.width * 1.15, caption.bbox.width * 1.05))
      );
    });
    const selectContiguousRows = (rows: LayoutBlock[], direction: "above" | "below") => {
      const sorted = [...rows].sort((a, b) => direction === "above" ? b.bbox.y - a.bbox.y : a.bbox.y - b.bbox.y);
      const selected: LayoutBlock[] = [];
      let previousEdge = direction === "above" ? captionTop : captionTop + caption.bbox.height;
      for (const row of sorted) {
        const edge = direction === "above" ? row.bbox.y + row.bbox.height : row.bbox.y;
        const gap = Math.abs(previousEdge - edge);
        if (selected.length > 0 && gap > 34) break;
        if (selected.length === 0 && gap > 58) continue;
        selected.push(row);
        previousEdge = direction === "above" ? row.bbox.y : row.bbox.y + row.bbox.height;
      }
      return selected;
    };
    const aboveRows = selectContiguousRows(compactTableRows("above"), "above");
    if (aboveRows.length > 0) {
      const tableTop = Math.min(...aboveRows.map((block) => block.bbox.y));
      const y = Math.max(0, tableTop - tableCropPadding);
      const tableBottom = Math.max(...aboveRows.map((block) => block.bbox.y + block.bbox.height));
      // Keep the caption's glyph box out of the raster crop. PDF text bboxes
      // are often slightly above the visible glyphs, so a two-point boundary
      // still leaks the first caption line into the table image.
      const bottom = Math.max(y, Math.min(captionTop - tableCropPadding, tableBottom + tableCropPadding));
      if (bottom - y >= 18) {
        const x = Math.max(0, Math.min(band.x, ...aboveRows.map((block) => block.bbox.x), caption.bbox.x) - 6);
        const right = Math.min(
          layout.pageWidth,
          Math.max(
            band.x + band.width,
            caption.bbox.x + caption.bbox.width,
            ...aboveRows.map((block) => block.bbox.x + block.bbox.width)
          ) + 6
        );
        return {
          page: caption.pageStart,
          x,
          y,
          width: Math.max(24, right - x),
          height: bottom - y,
        };
      }
    }
    const belowRows = selectContiguousRows(compactTableRows("below"), "below");
    const belowLineCount = belowRows.reduce((sum, block) => sum + block.lines.length, 0);
    // One short label below a caption could be ordinary prose. Three compact
    // rows (or four native lines) are enough to make this a table-only crop.
    if (belowRows.length >= 3 || belowLineCount >= 4) {
      const y = Math.max(0, captionTop + caption.bbox.height + 2);
      const bottom = Math.min(layout.pageHeight, Math.max(...belowRows.map((block) => block.bbox.y + block.bbox.height)) + tableCropPadding);
      if (bottom - y >= 18) {
        const x = Math.max(0, Math.min(band.x, ...belowRows.map((block) => block.bbox.x), caption.bbox.x) - 6);
        const right = Math.min(
          layout.pageWidth,
          Math.max(
            band.x + band.width,
            caption.bbox.x + caption.bbox.width,
            ...belowRows.map((block) => block.bbox.x + block.bbox.width)
          ) + 6
        );
        return {
          page: caption.pageStart,
          x,
          y,
          width: Math.max(24, right - x),
          height: bottom - y,
        };
      }
    }
  }

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
  const mastheadBoundary = blocks.find((block) => block.pageStart === 1 && block.role === "paragraph" && block.text.length >= 240)?.bbox.y ?? 420;
  // Some native streams split a title at a column/font-run boundary. Merge
  // only strongly aligned title fragments, and recover a preceding title
  // prefix that was conservatively labelled as an author when it ends in a
  // separator. Name-shaped author rows do not satisfy these constraints.
  for (const title of blocks.filter((block) => block.role === "title" && block.pageStart === 1)) {
    const titleY = title.bbox.y;
    const horizontal = blocks.find((candidate) =>
      candidate !== title && candidate.role === "title" && candidate.pageStart === 1 &&
      Math.abs(candidate.bbox.y - titleY) <= Math.max(2, title.bbox.height * 0.35) &&
      Math.abs(candidate.bbox.x - (title.bbox.x + title.bbox.width)) <= 18
    );
    if (horizontal) {
      const ordered = [title, horizontal].sort((a, b) => a.bbox.x - b.bbox.x);
      title.lines = ordered.flatMap((block) => block.lines).sort((a, b) => a.x - b.x);
      title.text = ordered.map((block) => block.text.trim()).join(" ").replace(/\s+/g, " ").trim();
      title.bbox = blockBbox(title.lines);
      const index = blocks.indexOf(horizontal);
      if (index >= 0) blocks.splice(index, 1);
    }
    const previous = blocks
      .filter((candidate) => candidate !== title && candidate.pageStart === 1 && candidate.role === "author" && candidate.bbox.y < titleY)
      .sort((a, b) => b.bbox.y - a.bbox.y)[0];
    const previousLooksLikeTitlePrefix = previous &&
      previous.text.trim().length >= 40 && /[,：:]\s*$/.test(previous.text.trim()) &&
      (/['“”"「」『』]/.test(previous.text) ||
       Math.abs((previous.lines[0]?.fontSize ?? bodyFont) - (title.lines[0]?.fontSize ?? bodyFont)) <= 1.2);
    if (previous && previousLooksLikeTitlePrefix &&
        titleY - previous.bbox.y <= Math.max(28, bodyFont * 2.8) &&
        /[a-z\p{Ll}]/u.test(previous.text)) {
      title.lines = [...previous.lines, ...title.lines].sort((a, b) => a.y - b.y || a.x - b.x);
      title.text = `${previous.text.trim()} ${title.text.trim()}`.replace(/\s+/g, " ").trim();
      title.bbox = blockBbox(title.lines);
      title.role = "title";
      const index = blocks.indexOf(previous);
      if (index >= 0) blocks.splice(index, 1);
    }
  }
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
  // A few journal templates attach a stale paragraph hint to a complete
  // author row. Re-evaluate the finished block once, after line grouping, so
  // the user-visible metadata does not depend on that hint.
  for (const block of blocks) {
    if (block.pageStart === 1 && block.role === "paragraph" && block.lines.length <= 2 &&
        block.text.length <= 320 && looksLikeAuthorList(block.text)) {
      block.role = "author";
    }
    if (block.pageStart === 1 && block.role === "paragraph" && block.lines.length <= 3 &&
        block.text.length <= 220 && block.bbox.y < mastheadBoundary + 80 &&
        looksLikeAffiliation(block.text) && !/[.!?。！？]$/.test(block.text.trim()) &&
        !looksLikeAuthorList(block.text)) {
      block.role = "affiliation";
    }
    if (block.pageStart === 1 && block.role === "paragraph" && block.lines.length <= 3 &&
        looksLikeNumberedAffiliationBand(block.text)) {
      block.role = "affiliation";
    }
  }
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG === "1") {
    console.warn(`[PDF_GROUPED_LINES] lines=${lines.length} blocks=${blocks.length} bodyFont=${bodyFont.toFixed(2)}`);
    lines.forEach((line, index) => {
      console.warn(`[PDF_LINE] index=${index} page=${line.page} column=${line.column} x=${line.x.toFixed(1)} y=${line.y.toFixed(1)} font=${line.fontSize.toFixed(1)} items=${line.items.length} text=${line.text.slice(0, 120)}`);
    });
  }
  const resolvedBlocks = blocks.flatMap((block) => {
    if (block.pageStart !== 1 || block.pageEnd !== 1 || block.lines.length < 3) return [block];
    const left = block.lines.filter((line) => line.column === "left");
    const right = block.lines.filter((line) => line.column === "right");
    if (left.length < 2 || right.length === 0) return [block];
    const leftFont = median(left.map((line) => line.fontSize));
    const rightFont = median(right.map((line) => line.fontSize));
    const rightText = joinLines(right);
    const letters = rightText.replace(/[^A-Za-zА-Яа-я]/g, "");
    const uppercaseRatio = letters.length > 0 ? (rightText.match(/[A-ZА-Я]/g)?.length ?? 0) / letters.length : 0;
    if (rightFont < leftFont * 1.12 || (uppercaseRatio < 0.55 && rightFont < leftFont * 1.2)) return [block];
    const make = (run: LayoutLine[], role: LayoutRole): LayoutBlock => ({
      ...block, role, text: joinLines(run), lines: run,
      pageStart: 1, pageEnd: 1, column: run[0].column, bbox: blockBbox(run),
    });
    return [make(left.sort((a, b) => a.y - b.y), "affiliation"), make(right.sort((a, b) => a.y - b.y), "title")];
  });
  return { layouts, lines, blocks: resolvedBlocks, baseFontSize: bodyFont };
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
