import type { BoundingBox } from "../../../types/paper";
import type { LayoutBlock, LayoutRole, PageColumnLayout } from "../../pdfLayout";
import { reconstructDocument } from "../../pdfLayout";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type { ExtractedPage } from "../../pdfService";
import type { CanonicalRole } from "../canonical/types";
import type { ExtractionEvidence, EvidenceSource } from "../types";

export type RoleCandidate = {
  id: string;
  role: CanonicalRole;
  text: string;
  confidence: number;
  source: EvidenceSource;
  reason: string;
  pageStart: number;
  pageEnd: number;
  boundingBoxes: BoundingBox[];
  column: string;
  layoutBlock: LayoutBlock;
  evidence: ExtractionEvidence[];
  /** Competing generic evidence. The resolver, not this layer, chooses role. */
  roleScores: Partial<Record<CanonicalRole, number>>;
  style: StyleSignature;
};

export type StyleSignature = {
  fontSizeRatio: number;
  fontNames: string[];
  boldScore: number;
  italicScore: number;
  indent: number;
  spacingBefore: number;
  spacingAfter: number;
  uppercaseRatio: number;
  /** Median native text-matrix rotation, retained as structural evidence. */
  rotation: number;
};

const ROLE_CONFIDENCE: Partial<Record<LayoutRole, number>> = {
  title: 0.82,
  author: 0.72,
  affiliation: 0.7,
  heading: 0.8,
  paragraph: 0.75,
  figure_caption: 0.85,
  table_caption: 0.85,
  equation: 0.7,
  footnote: 0.68,
  copyright: 0.9,
  header: 0.78,
  footer: 0.78,
};

function layoutRoleToCanonical(role: LayoutRole): CanonicalRole {
  if (role === "figure_caption" || role === "table_caption") return "caption";
  return role;
}

export type GenericExtraction = {
  layouts: PageColumnLayout[];
  blocks: LayoutBlock[];
  baseFontSize: number;
  candidates: RoleCandidate[];
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Axis/plot labels are often emitted as independent native text blocks. They
 * should not compete with table evidence merely because they contain many
 * numbers. Repetition on one page/column is a useful, format-independent
 * signal; the resolver may keep the node as `other`, and projection can then
 * preserve it without treating it as translatable prose.
 */
function chartLabelEvidence(block: LayoutBlock, blocks: LayoutBlock[]): number {
  const text = block.text.trim();
  if (!text || text.length > 180 || /[.!?。！？]$/.test(text)) return 0;
  const digits = (text.match(/\d/g) ?? []).length;
  const numericDensity = digits / Math.max(text.length, 1);
  if (numericDensity < 0.35) return 0;
  const samePageColumn = blocks.filter((candidate) =>
    candidate !== block && candidate.pageStart === block.pageStart &&
    candidate.column === block.column && candidate.text.trim().length <= 180 &&
    (candidate.text.match(/\d/g) ?? []).length / Math.max(candidate.text.length, 1) >= 0.35 &&
    (
      Math.abs(candidate.bbox.x - block.bbox.x) <= Math.max(block.bbox.height * 2, 14) ||
      Math.abs(candidate.bbox.y - block.bbox.y) <= Math.max(block.bbox.height * 1.5, 10)
    ) &&
    // A row containing multiple native items is a cell grid candidate, not a
    // set of independent chart labels.
    candidate.lines.length === 1 && candidate.lines[0].items.length <= 1 &&
    block.lines.length === 1 && block.lines[0].items.length <= 1
  );
  // A caption-adjacent numeric row is more likely a real table row. Leave it
  // to the table evidence generator instead of relabelling it as chart text.
  const nearTableCaption = blocks.some((candidate) =>
    candidate.pageStart === block.pageStart && candidate.role === "table_caption" &&
    Math.abs(candidate.bbox.y - block.bbox.y) < 300
  );
  if (nearTableCaption || samePageColumn.length < 3) return 0;
  return clamp(0.76 + Math.min(0.16, (samePageColumn.length - 3) * 0.03));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function styleSignature(
  block: LayoutBlock,
  layouts: PageColumnLayout[],
  baseFontSize: number,
  before?: LayoutBlock,
  after?: LayoutBlock
): StyleSignature {
  const lines = block.lines;
  const items = lines.flatMap((line) => line.items);
  const names = [...new Set(items.map((item) => item.fontName).filter(Boolean))];
  const bold = items.filter((item) => /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(item.fontName));
  const italic = items.filter((item) => /(?:italic|oblique)/i.test(item.fontName));
  const letters = (block.text.match(/[A-Za-z]/g) ?? []).length;
  const upper = (block.text.match(/[A-Z]/g) ?? []).length;
  const layout = layouts.find((candidate) => candidate.page === block.pageStart);
  const columnLeft = block.column === "right" ? layout?.rightX ?? 0 : layout?.leftX ?? 0;
  const previousBottom = before?.pageEnd === block.pageStart
    ? before.bbox.y + before.bbox.height
    : block.bbox.y;
  const nextTop = after?.pageStart === block.pageEnd ? after.bbox.y : block.bbox.y + block.bbox.height;
  return {
    fontSizeRatio: median(lines.map((line) => line.fontSize)) / Math.max(baseFontSize, 1),
    fontNames: names,
    boldScore: bold.length / Math.max(items.length, 1),
    italicScore: italic.length / Math.max(items.length, 1),
    indent: Math.max(0, block.bbox.x - columnLeft),
    spacingBefore: Math.max(0, block.bbox.y - previousBottom),
    spacingAfter: Math.max(0, nextTop - (block.bbox.y + block.bbox.height)),
    uppercaseRatio: upper / Math.max(letters, 1),
    rotation: median(items.map((item) => item.rotation ?? 0)),
  };
}

function headingTextShape(text: string): boolean {
  const compact = text.trim();
  if (!compact || compact.length > 110 || compact.split(/\s+/).length > 16) return false;
  // Dense CJK prose and numeric/table rows are frequently emitted without
  // whitespace. They need stronger structural evidence than the generic
  // capitalization test; otherwise body/table text becomes a heading.
  if (/[\u3400-\u9fff]/u.test(compact) && (compact.length > 18 || /[，。；：]/u.test(compact))) return false;
  if (/^[\d\s.,+\-–—=()]+$/.test(compact)) return false;
  if (/[∥∑∫√∞≈≠≤≥±∂∇×÷]/u.test(compact)) return false;
  if (/[.!?。．]$/.test(compact) || /^\d+[.)]\s+[A-Z][a-z]+,?\s+[A-Z]/.test(compact)) return false;
  const letters = (compact.match(/[A-Za-z]/g) ?? []).length;
  const upper = (compact.match(/[A-Z]/g) ?? []).length;
  const uppercase = letters >= 4 && upper / Math.max(letters, 1) > 0.72;
  const titleCase = /^[A-Z][A-Za-z]*(?:[\s:–—-]+[A-Za-z]+)*$/.test(compact);
  return uppercase || titleCase || /^\d+(?:\.\d+)*\s+/.test(compact);
}

function paragraphLike(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lower = words.filter((word) => /^[a-z]/.test(word)).length;
  return words.length > 16 || lower >= 5 || /[.!?]\s*$/.test(text.trim());
}

function mastheadAuthorEvidence(block: LayoutBlock, previous?: LayoutBlock): number {
  if (block.pageStart !== 1 || block.lines.length !== 1) return 0;
  const text = block.text.trim();
  const items = block.lines[0]?.items.length ?? 0;
  if (items < 2 || /[.!?]$/.test(text)) return 0;
  // Name-shaped tokens plus affiliation markers are a format-neutral signal;
  // unlike a name dictionary it works across international author names.
  const names = text.match(/\b[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{1,}\b/g) ?? [];
  const markers = text.match(/(?:\d{1,2}|[*†‡])\s*(?:,|&|$)/g) ?? [];
  const followsTitle = previous?.role === "title";
  if (names.length < 2 || markers.length === 0) return 0;
  return followsTitle ? 0.88 : 0.78;
}

function authorContinuationEvidence(block: LayoutBlock, previous?: LayoutBlock): number {
  if (block.pageStart !== 1 || block.lines.length !== 1 || !previous) return 0;
  const text = block.text.trim();
  // A wrapped author masthead can be emitted as a separate one-line block.
  // Detect the format-neutral `SURNAME, Initial.` shape only when it follows
  // another short masthead row; this avoids treating ordinary all-caps prose
  // as an author.
  const nameShape = /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’-]{2,},\s*[A-ZÀ-ÖØ-Ý](?:\.|\b)/u.test(text);
  const nearby = block.bbox.y - (previous.bbox.y + previous.bbox.height);
  const previousMasthead = previous.pageStart === 1 && previous.text.trim().length <= 180 &&
    (/,\s*[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{1,}/u.test(previous.text) || /\b(?:and|&)\b/i.test(previous.text));
  return nameShape && previousMasthead && nearby >= 0 && nearby < 28 ? 0.94 : 0;
}

function tableLike(block: LayoutBlock): boolean {
  // Masthead metadata often has multiple aligned text items (author names,
  // affiliations, e-mail columns) but is never a table region. Keep this
  // evidence generator scoped to body geometry; the resolver still decides
  // the final role from all evidence.
  if (block.role === "author" || block.role === "affiliation" || block.role === "title") {
    return false;
  }
  const lines = block.lines;
  if (lines.length === 0) return false;
  const nativeItems = lines.flatMap((line) => line.items);
  const rotatedItems = nativeItems.filter((item) => Math.abs(item.rotation ?? 0) >= 45);
  // Rotated statistical tables are emitted as many short, independently
  // positioned native items rather than horizontal rows. Keep this evidence
  // deliberately high precision: a sizeable rotated cluster with numeric
  // content is treated as table-like, while isolated rotated annotations stay
  // paragraph fallback.
  const rotatedNumeric = rotatedItems.filter((item) => /\d/.test(item.text)).length;
  if (rotatedItems.length >= 30 && rotatedNumeric / rotatedItems.length >= 0.3) return true;
  const cellLines = lines.filter((line) => line.items.length >= 2);
  if (cellLines.length === 0) return false;
  const shortItems = cellLines.flatMap((line) => line.items).filter((item) => item.text.trim().length <= 24).length;
  const itemCount = cellLines.flatMap((line) => line.items).length;
  const numeric = cellLines.flatMap((line) => line.items).filter((item) => /\d/.test(item.text)).length;
  const xStartClusters = new Map<number, Set<number>>();
  for (const [lineIndex, line] of cellLines.entries()) {
    for (const item of line.items) {
      const x = Math.round(item.x / 12) * 12;
      const rows = xStartClusters.get(x) ?? new Set<number>();
      rows.add(lineIndex);
      xStartClusters.set(x, rows);
    }
  }
  const minRepeatedRows = Math.max(2, Math.ceil(cellLines.length * 0.5));
  const repeatedColumns = [...xStartClusters.values()].filter((rows) => rows.size >= minRepeatedRows).length;
  const itemGrid = cellLines.length >= 2 && itemCount >= 4 && shortItems / itemCount >= 0.7 && repeatedColumns >= 2 && (numeric >= 2 || cellLines.length >= 2);
  // Some tables have a long prose description in their right-hand cells.  A
  // short-cell ratio alone then mislabels them as paragraphs, even though the
  // native geometry clearly shows repeated cells and an indented description
  // column.  Require several multi-item rows and a stable second x-position;
  // ordinary wrapped prose neither has that repeated cell structure nor a
  // distinct cell-column indent.
  const xPositions = lines.map((line) => line.bbox.x);
  const left = Math.min(...xPositions);
  const indentedRows = lines.filter((line) => line.bbox.x - left >= 36).length;
  const proseGrid =
    cellLines.length >= 4 &&
    cellLines.length / lines.length >= 0.45 &&
    indentedRows >= 2;
  return itemGrid || proseGrid;
}

function nearbyTableRowEvidence(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.lines.length !== 1 || block.lines[0].items.length < 2) return false;
  // A caption can be close to the prose that introduces a table.  That prose
  // often contains several native spans on one line, so proximity plus x
  // alignment alone is insufficient evidence for a table row.  Keep this
  // fallback limited to compact cell-like text and reject sentence-shaped
  // blocks before they can cross the resolver's table threshold.
  const text = block.text.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  const sentenceLike = words.length >= 10 || /[.!?]\s*$/.test(text) ||
    (letters >= 24 && digits / Math.max(letters + digits, 1) < 0.12);
  if (sentenceLike) return false;
  const caption = blocks.find((candidate) =>
    candidate.pageStart === block.pageStart &&
    candidate.role === "table_caption" &&
    Math.abs(candidate.bbox.y - block.bbox.y) < 300
  );
  if (!caption) return false;
  const captionDistance = Math.abs(caption.bbox.y - block.bbox.y);
  if (captionDistance > 280) return false;
  const x = Math.round(block.lines[0].items[0].x / 12) * 12;
  const alignedRows = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.lines.length !== 1) return false;
    if (Math.abs(candidate.bbox.y - block.bbox.y) > 220 || candidate.lines[0].items.length < 2) return false;
    const otherX = Math.round(candidate.lines[0].items[0].x / 12) * 12;
    return otherX === x;
  }).length;
  if (alignedRows >= 1) return true;
  // When the PDF groups each visual row into a different x pattern, the
  // first-cell alignment can be lost. Multiple compact rows in the caption's
  // immediate band still provide strong region evidence, while prose guards
  // above prevent a sentence that merely mentions the table from qualifying.
  const compact = text.split(/\s+/).filter(Boolean).length <= 10 &&
    !/[.!?]\s*$/.test(text);
  if (!compact) return false;
  const bandRows = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.lines.length !== 1) return false;
    if (candidate.bbox.y < Math.min(caption.bbox.y, block.bbox.y) - 12 ||
      candidate.bbox.y > Math.max(caption.bbox.y, block.bbox.y) + 220) return false;
    return candidate.lines[0].items.length >= 3;
  });
  return block.lines[0].items.length >= 4 && bandRows.length >= 2;
}

/** Detect a page-local grid when PDF extraction split each visual row into a
 * separate block and no caption is available on the same page.  Repeated
 * native x positions across several neighbouring blocks are required, along
 * with numeric cell density; ordinary prose and bibliography lines do not
 * satisfy this geometry pattern. */
function pageGridEvidence(block: LayoutBlock, blocks: LayoutBlock[]): number {
  if (block.role === "author" || block.role === "affiliation" || block.role === "title") return 0;
  const peers = blocks.filter((candidate) =>
    candidate.pageStart === block.pageStart &&
    candidate.column === block.column &&
    candidate.role === "paragraph" &&
    candidate.lines.length <= 2 &&
    candidate.lines[0]?.items.length >= 3
  );
  if (peers.length < 6) return 0;
  const peerYs = peers.map((candidate) => candidate.bbox.y);
  const inGridBand = block.pageStart === peers[0].pageStart &&
    block.column === peers[0].column &&
    block.bbox.y >= Math.min(...peerYs) - 14 &&
    block.bbox.y <= Math.max(...peerYs) + 14 &&
    block.lines.length <= 2 &&
    (block.lines[0]?.items.length ?? 0) >= 2;
  if (!inGridBand) return 0;
  const numericCells = peers.flatMap((candidate) => candidate.lines[0].items)
    .filter((item) => /\d/.test(item.text)).length;
  const allCells = peers.reduce((sum, candidate) => sum + candidate.lines[0].items.length, 0);
  if (numericCells / Math.max(allCells, 1) < 0.45) return 0;
  const xCounts = new Map<number, number>();
  for (const candidate of peers) {
    for (const item of candidate.lines[0].items) {
      const x = Math.round(item.x / 8) * 8;
      xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
    }
  }
  const repeatedColumns = [...xCounts.values()].filter((count) => count >= Math.ceil(peers.length * 0.5)).length;
  return repeatedColumns >= 3 ? 0.96 : 0;
}


function equationScore(block: LayoutBlock, layout: PageColumnLayout | undefined): number {
  const text = block.text.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const math = (text.match(/[=+×÷∑∫√∞≈≠≤≥±∂∇α-ωΑ-Ω]/g) ?? []).length;
  const prose = words.filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  const statistics = /(?:\b[ntz]\s*=|[χΧxX²]\s*\(|\b[FPt]\s*\(|\bp\s*[<=>])/.test(text);
  const sentence = /[,.;:]/.test(text) || /[.!?]$/.test(text);
  const columnWidth = layout ? (block.column === "right" ? layout.pageWidth - layout.rightX : layout.pageWidth / (layout.isMultiColumn ? 2 : 1)) : 0;
  const compact = columnWidth > 0 && block.bbox.width < columnWidth * 0.72;
  const centered = layout && Math.abs((block.bbox.x + block.bbox.width / 2) - layout.pageWidth / 2) < layout.pageWidth * 0.12;
  let score = block.role === "equation" ? 0.58 : 0.08;
  score += Math.min(0.26, math * 0.06);
  if (compact) score += 0.12;
  if (centered) score += 0.08;
  if (/\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(text)) score += 0.14;
  if (prose >= 4) score -= 0.36;
  if (sentence) score -= 0.2;
  if (statistics && (prose >= 2 || sentence)) score -= 0.42;
  return clamp(score);
}

/**
 * Generic heuristics as an evidence generator. Reconstructs lines/columns
 * via pdfLayout; does not finalize Canonical roles.
 */
export function generateGenericCandidates(pages: ExtractedPage[]): GenericExtraction {
  const { layouts, blocks, baseFontSize } = reconstructDocument(pages);
  const fontUse = new Map<string, number>();
  let itemCount = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      for (const item of line.items) {
        itemCount++;
        fontUse.set(item.fontName, (fontUse.get(item.fontName) ?? 0) + 1);
      }
    }
  }
  const candidates: RoleCandidate[] = blocks.map((block, index) => {
    const layout = layouts.find((l) => l.page === block.pageStart);
    const scored = scoreLayoutBlock(block, layout);
    const base = ROLE_CONFIDENCE[block.role] ?? 0.65;
    const confidence = Math.min(0.95, (base + scored.score) / 2);
    const boxes = block.lines.map((line) => line.bbox);
    const layoutRole = layoutRoleToCanonical(block.role);
    const denseCjkBody = layoutRole === "heading" && /[\u3400-\u9fff]/u.test(block.text) &&
      (block.text.trim().length > 18 || /[，。；：]/u.test(block.text));
    const numericRow = layoutRole === "heading" && /^[\d\s.,+\-–—=()]+$/.test(block.text.trim());
    const mathRow = layoutRole === "heading" && /[∥∑∫√∞≈≠≤≥±∂∇×÷]/u.test(block.text);
    const nearbyTableCaption = blocks.some((candidate) => candidate.role === "table_caption" &&
      candidate.pageStart === block.pageStart && Math.abs(candidate.bbox.y - block.bbox.y) < 300);
    const pageGrid = pageGridEvidence(block, blocks);
    const chartLabels = chartLabelEvidence(block, blocks);
    const alignedTableRow = block.lines.length === 1 &&
      block.lines[0].items.length >= 2 && tableLike(block) && nearbyTableCaption;
    const tableHeaderRow = block.lines.length === 1 &&
      block.lines[0].items.length >= 3 && nearbyTableCaption &&
      !/[.!?;:]/.test(block.text) &&
      (block.text.match(/[A-Za-z]+/g) ?? []).every((word) => /^[A-Z][a-z]+$/.test(word));
    // A lone abbreviated word ending in a period is usually a clipped
    // affiliation/header fragment (for example a wrapped "Technol."). Keep
    // genuine numbered or multi-word subheadings eligible, but require a
    // visible bold/weight signal before allowing this shape to become a
    // heading. This uses native font facts rather than a vocabulary list.
    const singleWordAbbreviation = layoutRole === "heading" &&
      /^\p{L}{2,14}\.$/u.test(block.text.trim()) &&
      !block.lines.flatMap((line) => line.items).some((item) =>
        /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(item.fontName)
      );
    const numericDensity = (block.text.match(/\d/g) ?? []).length / Math.max(block.text.length, 1);
    const rotatedItems = block.lines.flatMap((line) => line.items)
      .filter((item) => Math.abs(item.rotation ?? 0) >= 45);
    const rotatedNumericGrid = rotatedItems.length >= 8 &&
      rotatedItems.filter((item) => /\d/.test(item.text)).length / rotatedItems.length >= 0.12 &&
      !/[.!?]\s*$/.test(block.text.trim());
    const tableAdjacentNumericRow = layoutRole === "heading" && block.lines.length === 1 &&
      block.lines[0].items.length >= 1 && numericDensity >= 0.12 &&
      /[A-Za-z]/.test(block.text) &&
      nearbyTableCaption;
    const compactTableDataRow = nearbyTableCaption && block.lines.length === 1 &&
      block.lines[0].items.length >= 3 && block.text.trim().split(/\s+/).filter(Boolean).length <= 10 &&
      !/[.!?;:]/.test(block.text);
    const role = denseCjkBody || numericRow || mathRow || alignedTableRow || tableAdjacentNumericRow || tableHeaderRow || singleWordAbbreviation || rotatedNumericGrid ? "paragraph" : layoutRole;
    const style = styleSignature(block, layouts, baseFontSize, blocks[index - 1], blocks[index + 1]);
    const scoreByRole: Partial<Record<CanonicalRole, number>> = {
      paragraph: role === "paragraph" ? confidence : 0.22,
      [role]: confidence,
    };
    if (pageGrid > 0 && block.role !== "table_caption") scoreByRole.table = pageGrid;
    if (chartLabels > 0) scoreByRole.other = chartLabels;
    // Some journal/preprint mastheads use a large centered title whose line
    // is title-cased, so the layout pass can mistake it for an author line.
    // Native size/length/position evidence is sufficient to compete for the
    // title role without a vocabulary list.
    if (
      block.pageStart === 1 &&
      block.role === "author" &&
      block.text.trim().length >= 24 &&
      style.fontSizeRatio >= 1.35 &&
      !/@/.test(block.text) &&
      !/(university|department|institute|college|faculty|laboratory|\blab\b|research center|centre)/i.test(block.text)
    ) {
      scoreByRole.title = Math.max(scoreByRole.title ?? 0, 0.9);
    }
    const authorEvidence = mastheadAuthorEvidence(block, blocks[index - 1]);
    if (authorEvidence > 0) scoreByRole.author = authorEvidence;
    const continuationAuthorEvidence = authorContinuationEvidence(block, blocks[index - 1]);
    if (continuationAuthorEvidence > 0) scoreByRole.author = Math.max(scoreByRole.author ?? 0, continuationAuthorEvidence);
    const anchoredHeading = blocks.some((other, otherIndex) =>
      otherIndex !== index && other.role === "heading" &&
      Math.abs(styleSignature(other, layouts, baseFontSize, blocks[otherIndex - 1], blocks[otherIndex + 1]).boldScore - style.boldScore) < 0.25 &&
      Math.abs(styleSignature(other, layouts, baseFontSize, blocks[otherIndex - 1], blocks[otherIndex + 1]).fontSizeRatio - style.fontSizeRatio) < 0.18
    );
    const nonBodyFont = style.fontNames.length > 0 && style.fontNames.every(
      (fontName) => (fontUse.get(fontName) ?? itemCount) / Math.max(itemCount, 1) < 0.18
    );
    if (
      role !== "title" &&
      role !== "author" &&
      role !== "affiliation" &&
      !tableAdjacentNumericRow &&
      !alignedTableRow &&
      !tableHeaderRow &&
      !rotatedNumericGrid &&
      headingTextShape(block.text) &&
      (!paragraphLike(block.text) || nonBodyFont)
    ) {
      const styleEvidence = (style.boldScore >= 0.35 ? 0.32 : 0) +
        (style.fontSizeRatio >= 1.04 ? 0.14 : 0) +
        (style.spacingBefore >= baseFontSize * 0.55 ? 0.1 : 0) +
        (anchoredHeading ? 0.16 : 0) +
        (nonBodyFont ? 0.32 : 0);
      scoreByRole.heading = Math.max(
        role === "heading" ? confidence : 0,
        clamp((nonBodyFont ? 0.54 : 0.38) + styleEvidence)
      );
    }
    const equation = equationScore(block, layout);
    // A numeric/statistical line can be emitted as its own native block when
    // the preceding prose line wraps at a column boundary.  If it is directly
    // adjacent to an unfinished paragraph in the same page/column, preserve
    // the paragraph continuation instead of promoting the line to a display
    // equation.  This is geometry + neighboring evidence, not a vocabulary
    // exception, and leaves genuinely isolated equations eligible.
    const previousBlock = blocks[index - 1];
    const adjacentParagraphContinuation = previousBlock?.role === "paragraph" &&
      previousBlock.pageEnd === block.pageStart &&
      previousBlock.column === block.column &&
      !/[.!?:;]$/.test(previousBlock.text.trim()) &&
      block.lines.length === 1 &&
      block.lines[0].items.length <= 8 &&
      /\d/.test(block.text) &&
      block.bbox.y - (previousBlock.bbox.y + previousBlock.bbox.height) < baseFontSize * 1.8;
    const hyphenContinuation = previousBlock?.role === "paragraph" &&
      previousBlock.pageEnd === block.pageStart &&
      previousBlock.column === block.column &&
      !/[.!?:;]$/.test(previousBlock.text.trim()) &&
      /^[-–—]$/.test(block.text.trim()) &&
      block.lines.length === 1 &&
      block.bbox.y - (previousBlock.bbox.y + previousBlock.bbox.height) < baseFontSize * 1.8;
    if (equation > 0.12) {
      scoreByRole.equation = adjacentParagraphContinuation || hyphenContinuation
        ? Math.min(equation, 0.38)
        : equation;
    }
    // A true geometry grid is stronger evidence than paragraph text shape.
    // The resolver still requires this high score before it can override the
    // conservative paragraph fallback.
    // Keep table evidence available for caption-region membership, but below
    // the resolver's role override threshold so body prose stays paragraph.
    if (tableLike(block)) {
      // A large, numeric-rich rotated grid is materially stronger than the
      // ordinary aligned-row signal: it is the native representation of a
      // table whose cells are written on the orthogonal axis. Allow the
      // resolver to select table while retaining the conservative threshold
      // for all other geometry.
      const rotatedItems = block.lines.flatMap((line) => line.items)
        .filter((item) => Math.abs(item.rotation ?? 0) >= 45);
      const rotatedNumeric = rotatedItems.filter((item) => /\d/.test(item.text)).length;
      const structuralGrid = block.lines.length >= 3 &&
        block.lines.filter((line) => line.items.length >= 2).length >= 3 &&
        block.lines.flatMap((line) => line.items).filter((item) => /\d/.test(item.text)).length >= 2;
      const proseBlock = paragraphLike(block.text) && /[.!?]\s*$/.test(block.text.trim());
      const longCaption = block.role === "table_caption" && paragraphLike(block.text);
      const captionBlock = block.role === "table_caption";
      scoreByRole.table = rotatedItems.length >= 30 && rotatedNumeric / Math.max(rotatedItems.length, 1) >= 0.3
        ? 0.97
        : structuralGrid && !proseBlock && !longCaption && !captionBlock
          ? 0.95
          // `tableLike` also catches ordinary multi-line prose with aligned
          // native items. Keep that signal for region membership, but below
          // the resolver's role-promotion threshold unless stronger grid
          // evidence is present.
          : 0.68;
    }
    if (block.role !== "table_caption" && (nearbyTableRowEvidence(block, blocks) || compactTableDataRow)) scoreByRole.table = 0.96;
    const reason =
      block.role === "title"
        ? "largest font in first-page masthead"
        : `generic-heuristic role ${block.role}`;
    const evidence: ExtractionEvidence[] = [
      {
        source: "generic-heuristic",
        label: role,
        confidence,
        page: block.pageStart,
        bbox: block.bbox,
        reason,
      },
    ];
    if (chartLabels > 0) {
      evidence.push({
        source: "generic-heuristic",
        label: "repeated-numeric-chart-label",
        confidence: chartLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "repeated numeric native labels share a page/column x-band",
      });
    }
    return {
      id: `g-${index}`,
      role,
      text: block.text,
      confidence,
      source: "generic-heuristic",
      reason,
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      boundingBoxes: boxes.length > 0 ? boxes : [block.bbox],
      column: block.column,
      layoutBlock: block,
      evidence,
      roleScores: scoreByRole,
      style,
    };
  });

  return { layouts, blocks, baseFontSize, candidates };
}
