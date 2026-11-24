import type { BoundingBox } from "../../../types/paper";
import type { LayoutBlock, LayoutRole, PageColumnLayout } from "../../pdfLayout";
import { reconstructDocument } from "../../pdfLayout";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type { ExtractedPage } from "../../pdfService";
import type { CanonicalRole } from "../canonical/types";
import type { ExtractionEvidence, EvidenceSource } from "../types";
import { isJournalRunningHeader } from "../formats/publisherChrome";

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
  // Publisher running rails (`Protected by copyright`, HighWire download
  // stamps) must stay hidden in Reader / translation — same as copyright.
  if (role === "chrome") return "copyright";
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

/** Text-only axis labels often sit beside several numeric tick blocks. The
 * repeated numeric geometry is stronger evidence than the label vocabulary;
 * keep the label as non-prose content without hard-coding chart terms. */
function axisLabelEvidence(block: LayoutBlock, blocks: LayoutBlock[]): number {
  // Byline rows sit between rows of affiliation superscripts (`1 2`, `3 4`), which look like ticks.
  if (block.role === "author") return 0;
  const previous = blocks[blocks.indexOf(block) - 1];
  if (previous?.role === "author" && previous.column === block.column && /(?:\band|&|,)\s*\*?$/.test(previous.text.trim())) return 0;
  const text = block.text.trim();
  if (!text || text.length > 80 || /[.!?:;。！？]$/.test(text)) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 8 || (text.match(/[A-Za-z]/g) ?? []).length < 3) return 0;
  const nearbyNumeric = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.column !== block.column) return false;
    const candidateText = candidate.text.trim();
    const density = (candidateText.match(/\d/g) ?? []).length / Math.max(candidateText.length, 1);
    return density >= 0.45 && candidateText.length <= 40 &&
      Math.abs(candidate.bbox.x - block.bbox.x) <= 180 &&
      Math.abs(candidate.bbox.y - block.bbox.y) <= 140;
  });
  if (nearbyNumeric.length < 3) return 0;
  return 0.86;
}

function imageOverlapLabelEvidence(block: LayoutBlock, page?: ExtractedPage): number {
  if (!page || block.role !== "paragraph" || /[.!?。！？]$/.test(block.text.trim())) return 0;
  const items = block.lines.flatMap((line) => line.items);
  const shortRatio = items.filter((item) => item.text.trim().length <= 14).length / Math.max(1, items.length);
  // Figure labels are commonly emitted as one baseline containing several
  // short native spans (for example a chart legend).  The old multi-line-only
  // condition missed those spans, allowing numeric grid heuristics to promote
  // them to a table.  Require multiple separated items so a normal one-line
  // paragraph or a table caption cannot take this path.
  const oneLineLabel = block.lines.length === 1 && items.length >= 4 &&
    block.text.trim().split(/\s+/).filter(Boolean).length <= 18;
  if (block.lines.length < 3 && !oneLineLabel) return 0;
  if (shortRatio < 0.65) return 0;
  const overlap = Math.max(...(page.imagePlacements ?? []).map((image) => {
    // Native PDF labels are often positioned immediately above the raster
    // image (their bbox does not literally intersect the image).  Include a
    // small vertical halo only for the already constrained short-label shape.
    const halo = oneLineLabel ? Math.max(10, block.bbox.height * 2) : 0;
    const imageTop = image.y - halo;
    const imageBottom = image.y + image.height + halo;
    const x = Math.max(0, Math.min(block.bbox.x + block.bbox.width, image.x + image.width) - Math.max(block.bbox.x, image.x));
    const y = Math.max(0, Math.min(block.bbox.y + block.bbox.height, imageBottom) - Math.max(block.bbox.y, imageTop));
    return (x * y) / Math.max(1, block.bbox.width * block.bbox.height);
  }).concat(0));
  return overlap >= 0.2 ? clamp(0.78 + Math.min(0.14, overlap * 0.14)) : 0;
}

/** Native vector figures have no image placement metadata. Dense short text
 * items arranged across several x-bands are still strong evidence of a
 * diagram label cluster, provided the stream does not read like sentences. */
function vectorFigureLabelEvidence(block: LayoutBlock, blocks?: LayoutBlock[], page?: ExtractedPage): number {
  if (block.lines.length === 0) return 0;
  const items = block.lines.flatMap((line) => line.items);
  const words = block.text.trim().split(/\s+/).filter(Boolean);
  const proseTerms = block.text.match(/[A-Za-z]{3,}/g) ?? [];
  // CJK comparison matrices with √/✓ cells are real tables, not vector legends.
  if (/[√✓☑☒]/.test(block.text) && /[\u3040-\u30ff\u3400-\u9fff]/.test(block.text)) return 0;
  // Inline mathematics and citations can fragment an otherwise ordinary
  // sentence into many native spans. Vector-label evidence must not hide that
  // prose merely because its text matrix resembles a diagram.
  if (paragraphLike(block.text) && words.length >= 12 && proseTerms.length >= 5 && /[.;:]/.test(block.text)) return 0;
  const sentenceLikeProse = paragraphLike(block.text) && words.length >= 40 &&
    block.text.trim().split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim().length >= 24).length >= 2;
  if (sentenceLikeProse) return 0;
  // Vector diagrams often expose a large graphics stream but no image
  // placement. A nearby Figure caption gives a document-level anchor for
  // short, punctuation-free labels above it. This path is intentionally
  // conservative: it never classifies sentence-shaped text or blocks below
  // the caption as figure content.
  const figureCaption = blocks?.find((candidate) =>
    candidate.pageStart === block.pageStart && candidate.role === "figure_caption" &&
    candidate.bbox.y > block.bbox.y && candidate.bbox.y - block.bbox.y <= 280
  );
  if (figureCaption && (page?.graphicsPrimitives?.length ?? 0) >= 100 &&
      block.bbox.y < figureCaption.bbox.y && words.length >= 2 && words.length <= 10 &&
      block.text.trim().length <= 90 && !/[.!?。！？,:;]/.test(block.text.trim()) &&
      // Body crumbs that wrap beside a figure (`by only reading`, `In Result 4`)
      // must stay eligible for translation; keep this path for label-like tokens.
      !/^(?:in|by|the|we|this|for|as|to|and|or|with|from)\b/i.test(block.text.trim())) {
    return 0.86;
  }
  const multiItemContinuation = block.lines.length === 1 &&
    ((items.length >= 4 && block.text.trim().startsWith("'")) ||
      (items.length === 1 && block.text.trim().startsWith("'") && block.text.trim().length <= 100)) &&
    !/[.!?。！？]$/.test(block.text.trim());
  // Compact 2-line legend grids (`Linda Cab Hospital` / `Toma Test Wason`) are
  // common vector labels; require ≥2 lines rather than ≥3 when item/x-band
  // density already looks like a diagram cluster. Reject short prose crumbs
  // (`by only reading`, `In Result 4, we used the`) that share 2-line geometry.
  if ((!multiItemContinuation && (block.role !== "paragraph" || block.lines.length < 2)) ||
      items.length < 6 && !multiItemContinuation ||
      items.filter((item) => item.text.trim().length <= 80).length / items.length < 0.85) return 0;
  if (
    block.lines.length === 2 &&
    !multiItemContinuation &&
    (words.length <= 4 ||
      /^(?:in|by|the|we|this|for|as|to|and|or)\b/i.test(block.text.trim()) ||
      /[,:;]/.test(block.text))
  ) {
    return 0;
  }
  // A single native span beginning with an apostrophe is a common chart-title
  // continuation (the preceding labels were emitted as separate spans), and
  // has no meaningful x-band information left after PDF text grouping.
  if (multiItemContinuation && items.length === 1) return 0.82;
  const xBands = new Set(block.lines.flatMap((line) => line.items.map((item) => Math.round(item.x / 24))));
  if (xBands.size < 3) return 0;
  return 0.82;
}

/**
 * Some vector charts emit each glyph as its own paragraph-sized native block.
 * A short cluster with drifting baselines is strong evidence of a graphic
 * label, while ordinary prose and numbered lists have stable baselines or
 * substantially longer text. Keep this as `other` evidence so the resolver
 * can suppress translation without inventing a figure/table role.
 */
/** Dense mathematical glyphs directly above an overlapping Figure caption
 * belong to a vector diagram, not a captionless data grid. The geometry and
 * graphics requirements keep ordinary uncaptained tables eligible. */
/**
 * A dense vector figure can contain many tiny label rows that form a genuine
 * geometric grid, but are panels of a plot rather than a reader-visible data
 * table. Keep this deliberately narrow: no nearby table caption, a graphics
 * rich page, tiny typography, and either repeated peer panels or a tiny
 * image-rich micro-grid are required.
 */
/**
 * Figure panel labels are frequently set on a rotated baseline, running down
 * the side of their plot. The box of such a line is tall and thin, so the
 * horizontal-text assumption that "line thickness == bbox.height" rejects
 * every vertical label. Measure across the text direction instead.
 */
function crossTextThickness(block: LayoutBlock): number {
  // Measure per line: a block holding two side-by-side rotated labels is wide
  // and short, while each of its lines is tall and thin.
  const thicknesses = block.lines.map((line) =>
    Math.abs(line.rotation ?? 0) >= 45 ? line.bbox.width : line.bbox.height
  );
  return thicknesses.length > 0 ? Math.max(...thicknesses) : block.bbox.height;
}

function denseVectorPanelEvidence(block: LayoutBlock, blocks: LayoutBlock[], page?: ExtractedPage): number {
  if ((block.role !== "table" && block.role !== "paragraph") ||
      (page?.graphicsPrimitives?.length ?? 0) < 300 || block.lines.length === 0) return 0;
  if (blocks.some((candidate) => candidate.pageStart === block.pageStart && candidate.role === "table_caption" &&
    Math.abs(candidate.bbox.y - block.bbox.y) <= 320)) return 0;
  const fontSize = median(block.lines.map((line) => line.fontSize).filter((size) => size > 0));
  if (fontSize <= 0 || fontSize > 6.5) return 0;
  const peerPanels = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart ||
        (candidate.role !== "table" && candidate.role !== "paragraph")) return false;
    if (candidate.lines.length < 3 || Math.abs(candidate.bbox.x - block.bbox.x) > 42 ||
        Math.abs(candidate.bbox.y - block.bbox.y) > 360) return false;
    const candidateFont = median(candidate.lines.map((line) => line.fontSize).filter((size) => size > 0));
    return candidateFont > 0 && candidateFont <= 6.5 &&
      Math.abs(candidate.bbox.width - block.bbox.width) <= Math.max(45, block.bbox.width * 0.32);
  });
  const nearbyTicks = blocks.filter((candidate) => {
    if (candidate.pageStart !== block.pageStart || candidate === block) return false;
    const candidateFont = median(candidate.lines.map((line) => line.fontSize).filter((size) => size > 0));
    const digits = (candidate.text.match(/\d/g) ?? []).length;
    return candidateFont > 0 && candidateFont <= 6.5 && digits >= 2 &&
      candidate.text.trim().length <= 360 && Math.abs(candidate.bbox.y - block.bbox.y) <= 120;
  });
  const graphicsCount = page?.graphicsPrimitives?.length ?? 0;
  const denseGraphics = graphicsCount >= 900;
  const imageCount = page?.imagePlacements?.length ?? 0;
  // PDF renderers often flatten a multi-panel vector figure into a handful
  // of four-line "tables": each glyph row is only a few points high, while
  // the page also carries the figure's many image/vector placements.  A real
  // data table at that scale is both inaccessible to the reader and normally
  // has its caption nearby, so keep this deliberately narrow micro-grid case
  // as non-document graphic content even when no same-x peer survived line
  // grouping.
  const microGridOnGraphicPage =
    denseGraphics && imageCount >= 6 && fontSize <= 3 &&
    block.bbox.height <= Math.max(14, fontSize * 5) &&
    block.bbox.width <= (page?.width ?? Infinity) * 0.55;
  if (microGridOnGraphicPage) return 0.94;

  // A multi-panel vector figure can also emit one short annotation per panel
  // (for example, the same panel subtitle on its left and right plots). It is
  // only one physical line, so the grid rule below intentionally cannot see
  // it. Requiring an exact, same-baseline peer on an exceptionally graphics-
  // dense page distinguishes this from an ordinary small data-table cell.
  const normalizedText = block.text.replace(/\s+/g, " ").trim().toLowerCase();
  // Line grouping can merge the per-panel repetitions into one block (rotated
  // labels across panels share a baseline), so compare the repeated unit
  // rather than the whole string. A data table does not consist solely of one
  // cell text repeated.
  const annotationUnit = (text: string) => text.match(/^(.{8,140}?)(?: \1)+$/)?.[1] ?? text;
  const blockUnit = annotationUnit(normalizedText);
  const repeatedHorizontalPanelLabel =
    denseGraphics && imageCount >= 20 && fontSize <= 4.2 &&
    block.lines.length <= 2 &&
    (crossTextThickness(block) <= Math.max(16, fontSize * 4) || blockUnit !== normalizedText) &&
    blockUnit.length >= 8 && blockUnit.length <= 140 &&
    !/[.!?。！？:;]$/.test(blockUnit) &&
    blocks.some((candidate) => {
      if (candidate === block || candidate.pageStart !== block.pageStart ||
          (candidate.role !== "table" && candidate.role !== "paragraph") ||
          candidate.lines.length > 2) return false;
      const candidateText = candidate.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (annotationUnit(candidateText) !== blockUnit) return false;
      const candidateFont = median(candidate.lines.map((line) => line.fontSize).filter((size) => size > 0));
      return candidateFont > 0 && candidateFont <= 4.2 &&
        Math.abs(candidate.bbox.y - block.bbox.y) <= Math.max(8, fontSize * 2) &&
        Math.abs(candidate.bbox.x - block.bbox.x) >= (page?.width ?? 0) * 0.18;
    });
  if (repeatedHorizontalPanelLabel) return 0.94;
  if (block.lines.length < 3) return 0;
  const requiredPeers = 2;
  // A page with an exceptionally dense vector stream and two repeated tiny
  // panels already has strong plot evidence. On less dense pages retain the
  // independent tick-label requirement before suppressing a captionless grid.
  return peerPanels.length >= requiredPeers && (denseGraphics || nearbyTicks.length >= 2) ? 0.94 : 0;
}

/**
 * A figure caption bounds an otherwise ambiguous field of tiny labels much
 * more reliably than page-wide grid geometry.  Vector plots frequently emit
 * their axes/cell labels as regular x-aligned text, which must not become
 * Reader table cards.  Keep this independent from caption wording: it uses
 * only native type scale, figure-caption proximity, and drawing density.
 */
function figurePanelLabelEvidence(block: LayoutBlock, blocks: LayoutBlock[], page?: ExtractedPage): number {
  if ((block.role !== "table" && block.role !== "paragraph") || block.lines.length === 0) return 0;
  const graphics = page?.graphicsPrimitives?.length ?? 0;
  if (graphics < 250) return 0;
  if (blocks.some((candidate) => candidate.pageStart === block.pageStart && candidate.role === "table_caption" &&
    Math.abs(candidate.bbox.y - block.bbox.y) <= 360)) return 0;
  const fontSize = median(block.lines.map((line) => line.fontSize).filter((size) => size > 0));
  // One short label repeated across side-by-side panels (`lay1 lay1`) is wide but still a panel label.
  const tokens = block.text.trim().split(/\s+/);
  const repeatedLabel = tokens.length >= 2 && new Set(tokens).size === 1 && tokens[0].length <= 8;
  if (fontSize <= 0 || fontSize > 4 || (!repeatedLabel && crossTextThickness(block) > Math.max(22, fontSize * 7))) return 0;
  const figureCaption = blocks.find((candidate) => {
    if (candidate.pageStart !== block.pageStart || candidate.role !== "figure_caption") return false;
    const candidateBottom = candidate.bbox.y + candidate.bbox.height;
    const blockBottom = block.bbox.y + block.bbox.height;
    return (candidate.bbox.y >= blockBottom - 4 && candidate.bbox.y - blockBottom <= 500) ||
      (block.bbox.y >= candidateBottom - 4 && block.bbox.y - candidateBottom <= 120);
  });
  return figureCaption ? 0.93 : 0;
}

function figureCaptionDiagramEvidence(block: LayoutBlock, blocks: LayoutBlock[], page?: ExtractedPage): number {
  if ((page?.graphicsPrimitives?.length ?? 0) < 40 || block.lines.length < 2) return 0;
  const caption = blocks.find((candidate) =>
    candidate.pageStart === block.pageStart && candidate.role === "figure_caption" &&
    candidate.bbox.y >= block.bbox.y + block.bbox.height - 2 &&
    candidate.bbox.y - (block.bbox.y + block.bbox.height) <= 72
  );
  if (!caption) return 0;
  const overlap = Math.max(0, Math.min(block.bbox.x + block.bbox.width, caption.bbox.x + caption.bbox.width) - Math.max(block.bbox.x, caption.bbox.x));
  if (overlap < Math.min(block.bbox.width, caption.bbox.width) * 0.45) return 0;
  if (blocks.some((candidate) => candidate.pageStart === block.pageStart && candidate.role === "table_caption" && Math.abs(candidate.bbox.y - block.bbox.y) <= 300)) return 0;
  const items = block.lines.flatMap((line) => line.items);
  const tokens = block.text.trim().split(/\s+/).filter(Boolean);
  const mathVariantGlyphs = (block.text.match(/[\u{1D400}-\u{1D7FF}]/gu) ?? []).length;
  const mathOperators = (block.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length;
  if (items.length < 24 || tokens.length > 32 || /[.!?。！？;:]\s*$/.test(block.text.trim()) || mathVariantGlyphs + mathOperators < 5) return 0;
  return 0.93;
}

function fragmentedGraphicLabelEvidence(block: LayoutBlock, blocks: LayoutBlock[]): number {
  const text = block.text.trim();
  if (!text || text.length > 8 || /[.!?:;。！？]$/.test(text)) return 0;
  const fontSize = block.lines[0]?.fontSize ?? 0;
  if (!fontSize || block.lines[0]?.items.length > 3) return 0;
  const nearby = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.column !== block.column) return false;
    const candidateText = candidate.text.trim();
    if (!candidateText || candidateText.length > 8 || /[.!?:;。！？]$/.test(candidateText)) return false;
    const candidateFont = candidate.lines[0]?.fontSize ?? 0;
    if (!candidateFont || Math.abs(candidateFont - fontSize) > 0.8) return false;
    const dx = Math.abs(candidate.bbox.x - block.bbox.x);
    const dy = Math.abs(candidate.bbox.y - block.bbox.y);
    return dx <= 90 && dy <= 90;
  });
  const cluster = [block, ...nearby];
  const shortGlyphBlocks = cluster.filter((candidate) =>
    candidate.text.trim().replace(/\s+/g, "").length <= 3 &&
    candidate.lines.length === 1 && candidate.lines[0].items.length <= 3
  );
  if (shortGlyphBlocks.length < 5) return 0;
  const baselineRange = Math.max(...shortGlyphBlocks.map((candidate) => candidate.bbox.y)) -
    Math.min(...shortGlyphBlocks.map((candidate) => candidate.bbox.y));
  const xRange = Math.max(...shortGlyphBlocks.map((candidate) => candidate.bbox.x)) -
    Math.min(...shortGlyphBlocks.map((candidate) => candidate.bbox.x));
  // A stable horizontal text run has little baseline drift. Require visible
  // drift or a compact diagonal x trajectory before treating it as graphic.
  if (baselineRange < Math.max(2.5, fontSize * 0.35) && xRange < fontSize * 1.5) return 0;
  return 0.9;
}

/** Preserve evidence for a paragraph whose native lines contain a body run
 * plus a second, narrow x-band on several baselines. This is intentionally
 * diagnostic-only: the evidence must not discard text or relabel the block by
 * itself, because legitimate tables and side annotations can share the shape.
 */
function mixedNativeBandEvidence(block: LayoutBlock): number {
  if (block.role !== "paragraph" || block.lines.length < 3) return 0;
  const multiBandLines = block.lines.filter((line) => {
    const starts = new Set(line.items.map((item) => Math.round(item.x / 24)));
    return starts.size >= 2;
  });
  if (multiBandLines.length < 2) return 0;
  const itemWidths = multiBandLines.flatMap((line) => line.items.map((item) => item.width));
  const wide = itemWidths.filter((width) => width >= 80);
  const narrow = itemWidths.filter((width) => width > 0 && width <= 100);
  if (wide.length < 2 || narrow.length < 2 || narrow.length / itemWidths.length > 0.7) return 0;
  const bands = new Set(multiBandLines.flatMap((line) => line.items.map((item) => Math.round(item.x / 24))));
  if (bands.size < 2) return 0;
  return Math.min(0.86, 0.62 + multiBandLines.length / Math.max(block.lines.length, 1) * 0.2);
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
  // Count any script (Latin, Cyrillic, Greek, …). Latin-only ratios made
  // Serbian/Russian ALL-CAPS section labels look uncapitalized.
  const letters = (block.text.match(/\p{L}/gu) ?? []).length;
  const upper = (block.text.match(/\p{Lu}/gu) ?? []).length;
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
  const letters = (compact.match(/\p{L}/gu) ?? []).length;
  const upper = (compact.match(/\p{Lu}/gu) ?? []).length;
  const words = compact.split(/\s+/).filter(Boolean);
  const uppercase = letters >= 4 && upper / Math.max(letters, 1) > 0.72;
  // Require a real word (≥3 letters). Panel crumbs like "A B" match a naive
  // Title-Case pattern but are figure furniture, not section structure.
  const titleCase =
    letters >= 6 &&
    words.some((word) => (word.match(/\p{L}/gu) ?? []).length >= 3) &&
    /^\p{Lu}[\p{L}]*(?:[\s:–—-]+[\p{L}]+)*$/u.test(compact);
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
  const flatLines = lines.filter((line) => line.items.length === 1);
  const flatXs = new Map<number, number>();
  const flatYRows = new Map<number, Set<number>>();
  for (const line of flatLines) {
    const x = Math.round(line.items[0].x / 12) * 12;
    flatXs.set(x, (flatXs.get(x) ?? 0) + 1);
    const y = Math.round(line.y / 4) * 4;
    const xs = flatYRows.get(y) ?? new Set<number>();
    xs.add(x);
    flatYRows.set(y, xs);
  }
  const flattenedGrid = flatLines.length >= 6 && flatLines.length === lines.length &&
    [...flatXs.values()].filter((count) => count >= 2).length >= 2 &&
    [...flatYRows.values()].filter((xs) => xs.size >= 2).length >= 3 &&
    lines.every((line) => line.bbox.width <= 260) &&
    !/[.!?]\s*$/.test(block.text.trim()) &&
    block.text.trim().split(/\s+/).filter(Boolean).length <= 40;
  const cellLines = lines.filter((line) => line.items.length >= 2);
  if (cellLines.length === 0) return flattenedGrid;
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
  const distinctLineOrigins = new Set(xPositions.map((x) => Math.round(x / 12))).size;
  const indentedRows = lines.filter((line) => line.bbox.x - left >= 36).length;
  const proseGrid =
    cellLines.length >= 4 &&
    cellLines.length / lines.length >= 0.45 &&
    indentedRows >= 2 && distinctLineOrigins >= 2;
  return itemGrid || proseGrid || flattenedGrid;
}

/**
 * A table of contents has table-like leader geometry, but it is navigation
 * chrome rather than a data table. Require several peer entries on the same
 * page so a dotted sentence, DOI, or ordinary numeric table cannot match.
 */
function tableOfContentsEntry(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  const hasLeaderAndPage = (text: string) =>
    /(?:\.{4,}|…{2,}|·{4,}|_{4,})\s*(?:\d{1,4}|[ivxlcdm]{1,8})\s*$/i.test(text.trim());
  const peers = blocks.filter((candidate) =>
    candidate.pageStart === block.pageStart && hasLeaderAndPage(candidate.text)
  );
  if (peers.length < 3) return false;
  if (hasLeaderAndPage(block.text)) return true;
  // Long chapter titles commonly wrap just before their dotted leader and
  // page number. The first physical line has no leader itself and can look
  // like a compact table row, so inherit the page-local TOC evidence only
  // when its immediately following, indented line supplies that leader.
  const nextLine = blocks.find((candidate) => {
    if (candidate.pageStart !== block.pageStart || candidate === block || !hasLeaderAndPage(candidate.text)) return false;
    const gap = candidate.bbox.y - (block.bbox.y + block.bbox.height);
    return gap >= -2 && gap <= 34 && candidate.bbox.x >= block.bbox.x + 8;
  });
  return Boolean(nextLine) &&
    /^\s*(?:\d+(?:\.\d+){0,3}|[A-Z])(?:[.)])?\s+\p{L}/u.test(block.text.trim()) &&
    !/[.!?;:]\s*$/.test(block.text.trim());
}

/** Find a caption that bounds a compact table region in either reading
 * direction. Most publishers put a table caption above its cells, but ACM
 * and several proceedings templates place it below. The relationship is
 * geometric: same page and no distant intervening region. A wide table's
 * caption may begin in its left column while long cells occupy the right, so
 * horizontal overlap is not a safe requirement. It deliberately does not
 * depend on caption wording. */
function nearbyTableCaptionForRegion(
  block: LayoutBlock,
  blocks: LayoutBlock[],
  maxGap: number,
): LayoutBlock | undefined {
  return blocks
    .filter((candidate) => {
      if (candidate === block || candidate.pageStart !== block.pageStart || candidate.role !== "table_caption") return false;
      const gap = candidate.bbox.y >= block.bbox.y
        ? candidate.bbox.y - (block.bbox.y + block.bbox.height)
        : block.bbox.y - (candidate.bbox.y + candidate.bbox.height);
      return gap >= -8 && gap <= maxGap;
    })
    .sort((a, b) => {
      const gap = (candidate: LayoutBlock) => candidate.bbox.y >= block.bbox.y
        ? candidate.bbox.y - (block.bbox.y + block.bbox.height)
        : block.bbox.y - (candidate.bbox.y + candidate.bbox.height);
      return gap(a) - gap(b);
    })[0];
}

function captionedMultiColumnTableBand(
  block: LayoutBlock,
  blocks: LayoutBlock[],
  pageWidth: number
): boolean {
  if (block.role === "table_caption" || block.lines.length < 5 || block.bbox.width < pageWidth * 0.3) return false;
  const caption = nearbyTableCaptionForRegion(block, blocks, 520);
  if (!caption) return false;

  const originCounts = new Map<number, number>();
  for (const line of block.lines) {
    const origin = Math.round(line.x / 12);
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  }
  const repeatedOrigins = [...originCounts.values()].filter((count) => count >= 3).length;
  const captionedGrid = block.lines.length >= 10 && block.bbox.width >= pageWidth * 0.55 && repeatedOrigins >= 3;
  if (captionedGrid) return true;

  // Some publishers keep long, sentence-shaped table-cell content as a
  // separate one-column block. When that block is bracketed by two dense,
  // multi-column table-like blocks with only a small vertical gap, use the
  // surrounding native geometry to retain it as part of the captioned grid.
  const peers = blocks.filter((candidate) =>
    candidate !== block && candidate.pageStart === block.pageStart &&
    candidate.role === "paragraph" && candidate.lines.length >= 6 &&
    candidate.bbox.width >= pageWidth * 0.55 && tableLike(candidate)
  );
  const overlaps = (peer: LayoutBlock) =>
    Math.min(block.bbox.x + block.bbox.width, peer.bbox.x + peer.bbox.width) -
      Math.max(block.bbox.x, peer.bbox.x) >= Math.min(block.bbox.width, peer.bbox.width) * 0.8;
  const above = peers.some((peer) => {
    const gap = block.bbox.y - (peer.bbox.y + peer.bbox.height);
    return gap >= -4 && gap <= 40 && overlaps(peer);
  });
  const below = peers.some((peer) => {
    const gap = peer.bbox.y - (block.bbox.y + block.bbox.height);
    return gap >= -4 && gap <= 40 && overlaps(peer);
  });
  return above && below;
}

/** Some two-column review PDFs flatten a wide table into many short blocks
 * whose x origins alternate between cells. A caption plus a dense local band
 * is strong region evidence even when no individual block has a complete row.
 * Exclude tall, page-spanning blocks so surrounding prose is not swallowed. */
function captionedDenseTableBand(block: LayoutBlock, blocks: LayoutBlock[], pageWidth: number): boolean {
  if (block.role === "table_caption" || block.pageStart !== block.pageEnd || block.bbox.height > 115) return false;
  const caption = nearbyTableCaptionForRegion(block, blocks, 80);
  if (!caption) return false;
  const band = blocks.filter((candidate) => candidate !== caption && candidate.pageStart === block.pageStart &&
    candidate.bbox.y >= caption.bbox.y && candidate.bbox.y <= caption.bbox.y + 330 &&
    candidate.bbox.height <= 115 && candidate.bbox.width <= pageWidth * 0.72);
  if (band.length < 12) return false;
  const origins = new Map<number, number>();
  for (const candidate of band) {
    const x = Math.round(candidate.bbox.x / 12) * 12;
    origins.set(x, (origins.get(x) ?? 0) + 1);
  }
  const repeatedOrigins = [...origins.values()].filter((count) => count >= 3).length;
  const spread = Math.max(...band.map((candidate) => candidate.bbox.x)) - Math.min(...band.map((candidate) => candidate.bbox.x));
  return repeatedOrigins >= 3 && spread >= pageWidth * 0.35 && band.includes(block);
}

/** Long prose in a table's rightmost column can look like ordinary paragraph
 * text after line formation. Repeated same-baseline cells to its left, plus a
 * nearby native table caption, are strong region evidence even when this
 * column alone has no short numeric cells. */
function captionedNeighborCellRows(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.lines.length < 4 || block.bbox.width > 280) return false;
  // A column-wide run of sentences is body text beside a table, however few lines layout gave it.
  const pageWidth = block.lines[0]?.pageWidth ?? 612;
  const words = block.text.split(/\s+/).filter(Boolean);
  if (block.bbox.width >= pageWidth * 0.38 && words.length >= 12 && /[a-z]{3,}[.!?](?:\s|$)/.test(block.text) &&
    words.filter((w) => /^(?:the|of|and|in|to|is|are|was|were|that|with|for|by|this|as)$/i.test(w)).length >= 3) return false;
  const caption = nearbyTableCaptionForRegion(block, blocks, 420);
  if (!caption) return false;
  const repeatedCellOrigins = new Map<number, number>();
  const alignedRows = block.lines.filter((line) => {
    const origins: number[] = [];
    const alignedItems = blocks.flatMap((peer) => {
      if (peer === block || peer.pageStart !== block.pageStart) return [];
      // The other reading column's prose shares baselines with this one; its words are no table cells.
      const otherColumn = (peer.column === "left" && block.column === "right") || (peer.column === "right" && block.column === "left");
      const prose = (b: LayoutBlock) => b.role === "paragraph" && b.lines.length >= 3 && b.text.split(/\s+/).length >= 25 && /[a-z]{3,}[.!?]\s+[A-Z]/.test(b.text);
      if ((otherColumn && prose(peer)) || prose(block)) return [];
      return peer.lines
        .filter((peerLine) => Math.abs(peerLine.y - line.y) <= Math.max(2, line.fontSize * 0.4))
        .flatMap((peerLine) => peerLine.items)
        .filter((item) => item.x < line.x - 24 && /[\p{L}\p{N}]/u.test(item.text));
    }).sort((a, b) => a.x - b.x);
    let previousCellEnd: number | undefined;
    for (const item of alignedItems) {
      const wordGap = previousCellEnd === undefined ? Number.POSITIVE_INFINITY : item.x - previousCellEnd;
      if (previousCellEnd === undefined || wordGap > Math.max(2, item.fontSize * 0.6)) {
        origins.push(item.x);
      }
      previousCellEnd = Math.max(previousCellEnd ?? Number.NEGATIVE_INFINITY, item.x + item.width);
    }
    // Neighboring paragraph fragments may have slightly different left
    // indents (e.g. a wrapped column starts at x=51 and its opening line at
    // x=62). Treat those as one text column; genuine table columns are farther
    // apart. Requiring distinct x-buckets here promoted ordinary two-column
    // prose as a table when a table caption happened to sit above it.
    origins.sort((a, b) => a - b);
    let distinctOrigins = 0;
    let previousOrigin = Number.NEGATIVE_INFINITY;
    for (const origin of origins) {
      if (origin - previousOrigin >= 24) {
        distinctOrigins += 1;
        previousOrigin = origin;
      }
    }
    if (distinctOrigins < 2) return false;
    // Independent prose columns can align on a few baselines and expose
    // short x fragments at line wraps. Table cells repeat the same separated
    // column origins across rows, so require at least two stable origins
    // instead of treating one coincidental alignment as a grid.
    for (const origin of origins) {
      const bucket = Math.round(origin / 24);
      repeatedCellOrigins.set(bucket, (repeatedCellOrigins.get(bucket) ?? 0) + 1);
    }
    return true;
  }).length;
  return alignedRows >= 2 && [...repeatedCellOrigins.values()].filter((count) => count >= 2).length >= 2;
}

/** Native PDF spans on one baseline often preserve the separate cells of a
 * table row even when block formation concatenates those cells into one
 * sentence-shaped string. A nearby caption plus four well-separated native
 * text runs is strong row evidence; ordinary prose spans are adjacent or
 * separated only by word-sized gaps. */
function captionedNativeMultiCellRow(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption") return false;
  const text = block.text.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  // This evidence generator is for a visual row, not a paragraph that
  // happens to share a page with a caption. Long/multi-sentence blocks are
  // safer as prose even when their native spans have wide x gaps (formulae,
  // citations, and a neighbouring table can create those gaps).
  if (wordCount > 24 || block.lines.length > 4) return false;
  const caption = nearbyTableCaptionForRegion(block, blocks, 520);
  if (!caption) return false;

  return block.lines.some((line) => {
    // Layout may split the final wide cell into a neighboring block while
    // retaining the first three cell spans together. Reassemble native spans
    // from same-column, same-baseline peers before checking the row geometry.
    // Items from the opposite reading column can share a y-coordinate with
    // ordinary prose and falsely manufacture four separated "cells".
    const targetFonts = new Set(line.items.map((item) => item.fontName).filter(Boolean));
    const aligned = blocks
      .filter((peer) => peer.pageStart === block.pageStart && peer.column === block.column)
      .flatMap((peer, peerIndex) => peer.lines
        .filter((peerLine) => {
          if (Math.abs(peerLine.y - line.y) > Math.max(2, line.fontSize * 0.4)) return false;
          if (Math.abs(peerLine.fontSize - line.fontSize) > 0.7) return false;
          const peerFonts = peerLine.items.map((item) => item.fontName).filter(Boolean);
          // Matching native font facts make a same-baseline neighbor much
          // more likely to be another cell in the same visual row. Permit
          // missing font names, but do not join a known, unrelated display
          // face merely because it happens to share the y coordinate.
          return targetFonts.size === 0 || peerFonts.length === 0 || peerFonts.some((font) => targetFonts.has(font));
        })
        .flatMap((peerLine) => peerLine.items.map((item) => ({ item, peerIndex }))));
    const items = aligned
      .filter(({ item }) => /[\p{L}\p{N}]/u.test(item.text))
      .sort((a, b) => a.item.x - b.item.x);
    if (items.length < 4) return false;
    let separatedRuns = 1;
    let largeCellGaps = 0;
    let previousEnd = items[0].item.x + items[0].item.width;
    for (const { item } of items.slice(1)) {
      const gap = item.x - previousEnd;
      if (gap >= Math.max(10, item.fontSize * 0.9)) separatedRuns += 1;
      if (gap >= Math.max(18, item.fontSize * 1.8)) largeCellGaps += 1;
      previousEnd = Math.max(previousEnd, item.x + item.width);
    }
    const contributingBlocks = new Set(items.map(({ peerIndex }) => peerIndex)).size;
    return separatedRuns >= 4 && (contributingBlocks >= 2 || largeCellGaps >= 3);
  });
}

/**
 * Some producers split each visual table row into several LayoutBlocks, so no
 * single block contains enough cells for `tableLike`.  An explicit table
 * caption plus three nearby baselines that independently repeat wide cell
 * bands is sufficient document-level evidence.  The candidate must itself
 * intersect one of those compact row clusters; prose merely near the caption
 * remains paragraph evidence.
 */
function captionedRepeatedNativeGridMember(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || paragraphLike(block.text) && /[.!?]\s*$/.test(block.text.trim())) {
    return false;
  }
  const caption = nearbyTableCaptionForRegion(block, blocks, 420);
  if (!caption) return false;
  const captionBottom = caption.bbox.y + caption.bbox.height;
  const rows = new Map<number, Array<{ x: number; width: number; fontSize: number }>>();
  for (const candidate of blocks) {
    if (candidate.pageStart !== block.pageStart || candidate.column !== block.column || candidate.role === "table_caption") continue;
    for (const line of candidate.lines) {
      if (line.y < captionBottom - 8 || line.y > captionBottom + 360) continue;
      const bucket = Math.round(line.y / 4) * 4;
      const items = rows.get(bucket) ?? [];
      items.push(...line.items
        .filter((item) => /[\p{L}\p{N}]/u.test(item.text))
        .map((item) => ({ x: item.x, width: item.width, fontSize: item.fontSize })));
      rows.set(bucket, items);
    }
  }
  const structuredRows = [...rows.entries()]
    .map(([y, items]) => {
      const sorted = items.sort((a, b) => a.x - b.x);
      const separated = sorted.reduce((count, item, index) => {
        if (index === 0) return 1;
        const previous = sorted[index - 1];
        return count + (item.x - (previous.x + previous.width) >= Math.max(12, item.fontSize) ? 1 : 0);
      }, 0);
      // Retain enough x precision to distinguish the neighbouring prose
      // column from a tight numeric table grid.  The earlier 18pt buckets
      // collapsed a 35pt table rhythm and the next column's 40pt gutter into
      // one apparent band.
      return { y, xs: sorted.map((item) => Math.round(item.x / 4) * 4), separated };
    })
    .filter((row) => row.separated >= 3);
  if (structuredRows.length < 3) return false;
  const clusters: typeof structuredRows[] = [];
  for (const row of structuredRows.sort((a, b) => a.y - b.y)) {
    const cluster = clusters.at(-1);
    if (cluster && row.y - cluster.at(-1)!.y <= 40) cluster.push(row);
    else clusters.push([row]);
  }
  return clusters.some((cluster) => {
    if (cluster.length < 3) return false;
    const origins = new Map<number, number>();
    for (const row of cluster) for (const x of new Set(row.xs)) origins.set(x, (origins.get(x) ?? 0) + 1);
    // A two-column page can have a table on the left and ordinary body prose
    // on the right at the same y coordinates.  Repeated y positions alone do
    // not establish ownership: derive a compact band of *three or more*
    // repeated table columns, then require this candidate to expose an item
    // in that band.  This preserves a row label at the far left when the row
    // also contains numeric cells in the band, while excluding a right-column
    // prose line that happens to sit beside the table.
    const repeatedOrigins = [...origins.entries()]
      .filter(([, count]) => count >= 2)
      .map(([x]) => x)
      .sort((a, b) => a - b);
    const originBands: number[][] = [];
    for (const x of repeatedOrigins) {
      const band = originBands.at(-1);
      if (band && x - band.at(-1)! <= 38) band.push(x);
      else originBands.push([x]);
    }
    const columnBand = originBands
      .filter((band) => band.length >= 3)
      .sort((a, b) => b.length - a.length || a[0] - b[0])[0];
    if (!columnBand) return false;
    const firstY = cluster[0].y;
    const lastY = cluster.at(-1)!.y;
    if (!(block.bbox.y + block.bbox.height >= firstY - 6 && block.bbox.y <= lastY + 8)) return false;
    return block.lines.flatMap((line) => line.items)
      .some((item) => columnBand.some((origin) => Math.abs(item.x - origin) <= 16));
  });
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
  const numberedCellRow = /^\d{1,2}[.)]\s+/.test(text) && words.length <= 14 && !/[.!?]\s*$/.test(text);
  const sentenceLike = words.length >= 10 || /[.!?]\s*$/.test(text) ||
    (letters >= 24 && digits / Math.max(letters + digits, 1) < 0.12);
  if (sentenceLike && !numberedCellRow) return false;
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
  if (block.lines[0].items.length >= 4 && bandRows.length >= 2) return true;

  // A PDF producer may emit a header/numeric grid as one block and the next
  // label-only row as another.  Reuse the preceding block's native geometry
  // only when it is independently table-like, directly above this row, and
  // the horizontal spans overlap.  This avoids promoting an unrelated prose
  // line merely because a caption is nearby.
  const precedingGrid = blocks
    .filter((candidate) => candidate !== block && candidate.pageStart === block.pageStart &&
      candidate.bbox.y < block.bbox.y && tableLike(candidate))
    .sort((a, b) => b.bbox.y - a.bbox.y)[0];
  if (!precedingGrid) return false;
  const gap = block.bbox.y - (precedingGrid.bbox.y + precedingGrid.bbox.height);
  const overlap = Math.min(block.bbox.x + block.bbox.width, precedingGrid.bbox.x + precedingGrid.bbox.width) -
    Math.max(block.bbox.x, precedingGrid.bbox.x);
  return gap >= -4 && gap <= 36 && overlap >= Math.min(block.bbox.width, precedingGrid.bbox.width) * 0.5;
}

/** Captionless tables sometimes expose only a two-cell header. Require
 * explicit column-heading vocabulary before using repeated x-origins, so
 * diagram labels and author rows cannot become tables. */
function headeredTableRow(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.pageStart !== block.pageEnd || block.text.trim().length > 460) return false;
  // A nearby header can be a figure axis or a preceding table rather than
  // ownership evidence for every later block. A completed prose sentence is
  // therefore never promoted by this header-only path. Real table rows may
  // contain punctuation in a cell, but their final cell very rarely forms a
  // sentence; preserving body text is the safer failure mode when the
  // stronger caption/grid evidence is absent.
  if (/[.!?。！？]\s*$/.test(block.text.trim())) return false;
  // This is deliberately a rescue for a compact, physical table row. A
  // wrapped title or paragraph can share a page with a header-shaped label,
  // but does not become table-owned merely because its final line is
  // unpunctuated. Multi-line descriptive table cells still have the stronger
  // caption/grid paths above.
  if (block.lines.length !== 1) return false;
  if (lowerCaseProseContinuation(block.text)) return false;
  if (blocks.some((candidate) => candidate.pageStart === block.pageStart && candidate.role === "figure_caption")) return false;
  const header = blocks.find((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.pageEnd !== block.pageEnd) return false;
    if (candidate.bbox.y >= block.bbox.y || block.bbox.y - candidate.bbox.y > 430) return false;
    if (candidate.lines.length !== 1 || candidate.lines[0].items.length < 2) return false;
    const text = candidate.text.trim();
    if (text.length > 64 || /[.!?。！？]$/.test(text)) return false;
    if (!/[/|]/.test(text) && !/\b(?:method|goal|description|category|value|measure|variable|result)\b/i.test(text)) return false;
    const xs = candidate.lines[0].items.map((item) => item.x).sort((a, b) => a - b);
    return xs.length >= 2 && xs.at(-1)! - xs[0] >= 48;
  });
  if (!header) return false;
  const headerXs = header.lines[0].items.map((item) => item.x);
  const rows = blocks.filter((candidate) => {
    if (candidate === header || candidate.pageStart !== block.pageStart || candidate.pageEnd !== block.pageEnd) return false;
    if (candidate.bbox.y <= header.bbox.y || candidate.bbox.y - header.bbox.y > 430) return false;
    if (candidate.text.trim().length > 460 || candidate.lines.length > 6) return false;
    return headerXs.some((headerX) => Math.abs(candidate.bbox.x - headerX) <= 18);
  });
  return rows.length >= 3 && rows.includes(block);
}

/** Comparison tables in CJK papers often have no usable caption signal and
 * use checkmarks instead of numeric cells. Require a local repeated row band,
 * short non-sentence text, and a structural marker on the candidate itself;
 * this keeps ordinary CJK prose fragments out of the table role. */
function cjkComparisonTableRow(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.pageStart !== block.pageEnd) return false;
  const text = block.text.trim();
  if (!/[\u3400-\u9fff]/u.test(text) || !/[√✓☑☒]/u.test(text) || /[。！？.!?]$/.test(text)) return false;
  if (text.length > 180 || block.lines.length > 3) return false;
  const peers = blocks.filter((candidate) => {
    if (candidate === block || candidate.pageStart !== block.pageStart || candidate.pageEnd !== block.pageEnd) return false;
    if (Math.abs(candidate.bbox.y - block.bbox.y) > 150 || candidate.lines.length > 3) return false;
    const peerText = candidate.text.trim();
    return /[\u3400-\u9fff]/u.test(peerText) && !/[。！？.!?]$/.test(peerText) &&
      peerText.length <= 180 && candidate.lines.some((line) => line.items.length >= 2);
  });
  if (peers.length < 2) return false;
  const rows = [block, ...peers];
  const xCounts = new Map<number, number>();
  for (const row of rows) {
    const origins = new Set(row.lines.flatMap((line) => line.items).map((item) => Math.round(item.x / 12) * 12));
    for (const x of origins) xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
  }
  return [...xCounts.values()].filter((count) => count >= 3).length >= 2;
}

function cjkComparisonTableCaption(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role !== "paragraph" || !/^表\s*\d+[a-z]?\s+/iu.test(block.text.trim())) return false;
  const rows = blocks.filter((candidate) => candidate !== block && candidate.pageStart === block.pageStart &&
    candidate.bbox.y > block.bbox.y && candidate.bbox.y - block.bbox.y <= 300 &&
    /[\u3400-\u9fff]/u.test(candidate.text) && /[√✓☑☒]/u.test(candidate.text) &&
    candidate.lines.length <= 3 && !/[。！？.!?]$/.test(candidate.text.trim()));
  if (rows.length < 3) return false;
  const origins = new Map<number, number>();
  for (const row of rows) for (const x of new Set(row.lines.flatMap((line) => line.items).map((item) => Math.round(item.x / 12) * 12))) {
    origins.set(x, (origins.get(x) ?? 0) + 1);
  }
  return [...origins.values()].filter((count) => count >= 3).length >= 2;
}

/** A broken reading-order stream can leave two wrapped lines of ordinary
 * prose beside an unrelated table caption. They have several native spans,
 * but the lexical shape is a continuation rather than cells. Do not use this
 * as a universal paragraph detector: it only excludes a lower-case,
 * non-numeric continuation from caption-specific table fallbacks. */
function lowerCaseProseContinuation(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lowerWords = words.filter((word) => /^[a-z]/.test(word)).length;
  const digits = (trimmed.match(/\d/g) ?? []).length;
  return words.length >= 7 && lowerWords >= 5 && digits <= 1 && /^[a-z]/.test(trimmed);
}

/**
 * A captioned table can be split by the PDF producer at column boundaries,
 * leaving a compact run of one-span cell rows outside the caption block. Use
 * the nearby caption and repeated row geometry as table evidence for that
 * remainder. Sentence-shaped prose and irregularly spaced lines are excluded.
 */
function captionedCompactRowCluster(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.lines.length < 2 || block.lines.length > 8) return false;
  if (lowerCaseProseContinuation(block.text)) return false;
  if (block.lines.length === 2) {
    const [first, second] = block.lines;
    if (first.items.length < 2 || second.items.length < 2 || Math.abs(first.x - second.x) > 8) return false;
  }
  const words = block.text.trim().split(/\s+/).filter(Boolean);
  if (words.length > 55 || /[.!?。！？]\s*$/.test(block.text.trim())) return false;
  const lineTexts = block.lines.map((line) => line.text.trim());
  if (lineTexts.some((text) => text.length > 100 || text.split(/\s+/).length > 14 || /[.!?。！？]\s*$/.test(text))) {
    return false;
  }
  const caption = nearbyTableCaptionForRegion(block, blocks, 120);
  if (!caption) return false;

  const sorted = [...block.lines].sort((a, b) => a.y - b.y);
  const gaps = sorted.slice(1).map((line, index) => line.y - (sorted[index].y + sorted[index].bbox.height));
  const typicalHeight = sorted.reduce((sum, line) => sum + line.bbox.height, 0) / sorted.length;
  if (gaps.some((gap) => gap < -2 || gap > typicalHeight * 1.25)) return false;
  const xCounts = new Map<number, number>();
  for (const line of sorted) {
    const x = Math.round(line.x / 10) * 10;
    xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
  }
  return [...xCounts.values()].some((count) => count >= 2);
}

/** A table's descriptive right-hand column may contain only two to four
 * long cell rows. Unlike prose, each row still has multiple well-separated
 * native runs and sits in the immediate band of a table caption. */
function captionedMultiCellTextBand(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.lines.length < 2 || block.lines.length > 8) return false;
  const text = block.text.trim();
  if (lowerCaseProseContinuation(text)) return false;
  if (text.split(/\s+/).filter(Boolean).length > 55 || /[.!?。！？]\s*$/.test(text)) return false;
  // This band can extend across the visual width of a table even when the
  // caption itself starts in another reading column, so use page-local
  // distance rather than block-column ownership here.
  if (!blocks.some((candidate) =>
    candidate.pageStart === block.pageStart && candidate.role === "table_caption" &&
    Math.abs(candidate.bbox.y - block.bbox.y) <= 160
  )) return false;
  const multiCellLines = block.lines.filter((line) => {
    if (line.items.length < 2 || /[.!?。！？]\s*$/.test(line.text.trim())) return false;
    const ordered = [...line.items].sort((a, b) => a.x - b.x);
    return ordered.slice(1).some((item, index) =>
      item.x - (ordered[index].x + ordered[index].width) >= Math.max(16, line.fontSize * 1.4)
    );
  });
  return multiCellLines.length >= 2;
}

/**
 * Table rows are sometimes emitted as one text span per physical line. When a
 * captioned region contains repeated short rows with the same two x-columns,
 * use same-baseline neighboring cells to recover the table role for each row.
 */
function captionedRepeatedCellRow(block: LayoutBlock, blocks: LayoutBlock[]): boolean {
  if (block.role === "table_caption" || block.lines.length !== 1) return false;
  const text = block.text.trim();
  if (text.split(/\s+/).length > 14 || /[.!?。！？]\s*$/.test(text)) return false;
  const caption = nearbyTableCaptionForRegion(block, blocks, 120);
  if (!caption) return false;

  const top = caption.bbox.y - 8;
  const bottom = Math.max(caption.bbox.y + caption.bbox.height, block.bbox.y) + 120;
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const candidate of blocks) {
    if (candidate.pageStart !== block.pageStart) continue;
    for (const line of candidate.lines) {
      if (line.y < top || line.y > bottom) continue;
      // A caption inside one column labels a table in that column; the other column is prose.
      if ((caption.column === "left" || caption.column === "right") && line.column !== caption.column) continue;
      const cells = line.items
        .map((item) => ({ x: Math.round(item.x / 10) * 10, text: item.text.trim() }))
        .filter((item) => item.text && item.text.split(/\s+/).length <= 14 && !/[.!?。！？]\s*$/.test(item.text));
      const key = Math.round(line.y / 4) * 4;
      rows.set(key, [...(rows.get(key) ?? []), ...cells]);
    }
  }
  const gridRows = [...rows.entries()].filter(([, cells]) => {
    const uniqueXs = [...new Set(cells.map((cell) => cell.x))];
    return cells.reduce((sum, cell) => sum + cell.text.split(/\s+/).length, 0) <= 20 &&
      uniqueXs.some((x, index) => uniqueXs.slice(index + 1).some((other) => Math.abs(x - other) >= 32));
  });
  if (gridRows.length < 3) return false;
  const xCounts = new Map<number, number>();
  for (const [, cells] of gridRows) {
    for (const x of new Set(cells.map((cell) => cell.x))) xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
  }
  const repeatedColumns = new Set([...xCounts.entries()].filter(([, count]) => count >= 2).map(([x]) => x));
  if (repeatedColumns.size < 2) return false;
  const candidateX = Math.round(block.lines[0].x / 10) * 10;
  const currentRow = gridRows.find(([y]) => Math.abs(y - Math.round(block.lines[0].y / 4) * 4) <= 2);
  return Boolean(currentRow && repeatedColumns.has(candidateX) &&
    currentRow[1].some((cell) => Math.abs(cell.x - candidateX) >= 32));
}

/** Detect a page-local grid when PDF extraction split each visual row into a
 * separate block and no caption is available on the same page.  Repeated
 * native x positions across several neighbouring blocks are required, along
 * with numeric cell density; ordinary prose and bibliography lines do not
 * satisfy this geometry pattern. */
/**
 * A borderless qualitative table may use prose in every cell, so its numeric
 * density never reaches `pageGridEvidence`.  Treat it as a table only when a
 * compact page-local band establishes three or more independently repeated
 * native left edges.  This is deliberately stricter than a two-column reading
 * layout: each anchor must recur in at least three separate logical blocks,
 * and the candidate itself must be one of those compact cells.
 */
function proseCellGridEvidence(block: LayoutBlock, blocks: LayoutBlock[], pageWidth: number): number {
  if ((block.role !== "paragraph" && block.role !== "heading") || block.pageStart !== block.pageEnd) return 0;
  if (block.lines.length > 7) return 0;
  // Repeated native x origins also occur when a one-column math paper breaks
  // prose around inline formula glyphs. A caption is the strongest anchor,
  // but borderless qualitative tables often have no caption at all. Keep
  // those eligible until the geometry pass below can require a compact,
  // header-led grid; ordinary prose is still rejected when that proof is
  // absent.
  const nearbyTableCaption = blocks.some((candidate) => {
    if (candidate.pageStart !== block.pageStart || candidate.role !== "table_caption") return false;
    const verticalDistance = Math.max(
      candidate.bbox.y - (block.bbox.y + block.bbox.height),
      block.bbox.y - (candidate.bbox.y + candidate.bbox.height),
      0,
    );
    const horizontalOverlap = Math.max(
      0,
      Math.min(candidate.bbox.x + candidate.bbox.width, block.bbox.x + block.bbox.width) -
        Math.max(candidate.bbox.x, block.bbox.x),
    );
    // A journal table can continue for most of a page after a compact
    // caption, especially when its rightmost cell wraps into several lines.
    // The repeated x-band and contiguous-row checks below remain mandatory;
    // this wider window only lets those checks inherit the page-local caption.
    return verticalDistance <= 720 && horizontalOverlap >= Math.min(candidate.bbox.width, block.bbox.width) * 0.2;
  });
  const pageBlocks = blocks.filter((candidate) =>
    candidate.pageStart === block.pageStart &&
    candidate.pageEnd === block.pageEnd &&
    (candidate.role === "paragraph" || candidate.role === "heading") &&
    candidate.lines.length >= 1 &&
    candidate.lines.length <= 7 &&
    (candidate === block || candidate.bbox.width <= pageWidth * 0.52)
  );
  if (pageBlocks.length < 9) return 0;

  const blockAnchors = new Map<LayoutBlock, Set<number>>();
  const anchorBlocks = new Map<number, Set<LayoutBlock>>();
  const lineAnchors: Array<{ y: number; anchors: number[] }> = [];
  for (const candidate of pageBlocks) {
    const anchors = new Set<number>();
    for (const line of candidate.lines) {
      const words = line.text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0 || words.length > 30) continue;
      const origins: number[] = [];
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const item of [...line.items].sort((a, b) => a.x - b.x)) {
        if (!item.text.trim()) continue;
        if (item.x - previousEnd >= Math.max(18, line.fontSize * 1.5)) {
          origins.push(Math.round(item.x / 12) * 12);
        }
        previousEnd = Math.max(previousEnd, item.x + item.width);
      }
      // A producer may flatten the entire line into one text span; retain its
      // line origin so this does not discard an otherwise valid table cell.
      if (origins.length === 0) origins.push(Math.round(line.x / 12) * 12);
      for (const x of origins) {
        anchors.add(x);
        const owners = anchorBlocks.get(x) ?? new Set<LayoutBlock>();
        owners.add(candidate);
        anchorBlocks.set(x, owners);
      }
      lineAnchors.push({ y: line.y, anchors: origins });
    }
    if (anchors.size > 0) blockAnchors.set(candidate, anchors);
  }
  const repeated = [...anchorBlocks.entries()]
    .filter(([, owners]) => owners.size >= 3)
    .map(([x]) => x)
    .sort((a, b) => a - b);
  if (repeated.length < 3) return 0;

  // Coalesce near-duplicate x origins, then prove a genuine visual row has
  // three such bands at the same baseline. This keeps a table's local region
  // separate from surrounding prose that merely shares one of its indents.
  const bands: number[] = [];
  for (const x of repeated) {
    if (!bands.some((band) => Math.abs(band - x) < 42)) bands.push(x);
  }
  if (bands.length < 3 || bands.at(-1)! - bands[0] < 120) return 0;
  const rows = new Map<number, Set<number>>();
  for (const { y, anchors } of lineAnchors) {
    const row = Math.round(y / 12) * 12;
    const present = rows.get(row) ?? new Set<number>();
    for (const x of anchors) {
      const band = bands.find((candidate) => Math.abs(candidate - x) < 18);
      if (band !== undefined) present.add(band);
    }
    rows.set(row, present);
  }
  const denseRows = [...rows.entries()]
    .filter(([, present]) => present.size >= 3)
    .map(([y]) => y)
    .sort((a, b) => a - b);
  if (denseRows.length < 3) return 0;
  const coreTop = denseRows[0];
  const coreBottom = denseRows.at(-1)!;
  const captionlessHeader = !nearbyTableCaption && pageBlocks.some((candidate) => {
    const text = candidate.text.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const candidateY = candidate.bbox.y;
    const candidateAnchors = blockAnchors.get(candidate) ?? new Set<number>();
    const aligned = [...candidateAnchors].some((x) => bands.some((band) => Math.abs(x - band) < 18));
    const headerFonts = new Set(candidate.lines.flatMap((line) => line.items.map((item) => item.fontName)).filter(Boolean));
    return candidateY >= coreTop - 22 && candidateY <= coreTop + 26 &&
      words.length >= 1 && words.length <= 8 && text.length <= 80 &&
      /[A-Za-z]{3}/.test(text) &&
      !/^(?:\d+\.){1,3}\d*\s/.test(text) &&
      !/[.!?;:]\s*$/.test(text) && aligned && headerFonts.size <= 1;
  });
  // Without a caption, require a visible header at the top of the repeated
  // grid. This prevents two-column body prose, which can share three x bands
  // by coincidence, from being converted into source-only table cards.
  const contiguousGrid = denseRows.every((y, index) => index === 0 || y - denseRows[index - 1] <= 96);
  if (block.bbox.width > pageWidth * 0.52 && !nearbyTableCaption) return 0;
  if (!nearbyTableCaption && (!captionlessHeader || !contiguousGrid)) return 0;
  const candidateAnchors = blockAnchors.get(block) ?? new Set<number>();
  const usesGridColumn = bands.some((band) => [...candidateAnchors].some((x) => Math.abs(x - band) < 18));
  const touchesCore = block.lines.some((line) =>
    line.y + line.height >= coreTop - 20 && line.y <= coreBottom + 28
  );
  // Column-wide narrative prose beside a table shares its bands by position only; table cells are narrower.
  const sentences = block.text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.split(/\s+/).length >= 8).length;
  if (block.lines.length >= 3 && block.bbox.width >= pageWidth * 0.38 && block.text.split(/\s+/).length >= 30 && sentences >= 2) return 0;
  return usesGridColumn && touchesCore ? 0.96 : 0;
}

function pageGridEvidence(block: LayoutBlock, blocks: LayoutBlock[]): number {
  if (block.role === "author" || block.role === "affiliation" || block.role === "title") return 0;
  const mathGlyphs = (block.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length;
  const proseWords = (block.text.match(/[A-Za-z]{3,}/g) ?? []).length;
  // Equations can contain many separately positioned terms on one baseline;
  // that is not a captionless data grid. Keep this guard local to the
  // captionless fallback so caption-anchored statistical tables still retain
  // their ordinary table evidence.
  if (mathGlyphs >= 4 && proseWords <= 6) return 0;
  // A numeric label matrix near a figure caption is usually chart/diagram
  // content, not a captionless table. Captionless-table recovery is a
  // precision fallback, so it must yield to this closer document-level
  // figure anchor. Require horizontal overlap to avoid suppressing a genuine
  // table in the other column.
  const nearFigureCaption = blocks.some((candidate) => {
    if (candidate.pageStart !== block.pageStart || candidate.role !== "figure_caption") return false;
    const verticalDistance = Math.max(
      candidate.bbox.y - (block.bbox.y + block.bbox.height),
      block.bbox.y - (candidate.bbox.y + candidate.bbox.height),
      0
    );
    const horizontalOverlap = Math.max(0, Math.min(candidate.bbox.x + candidate.bbox.width, block.bbox.x + block.bbox.width) - Math.max(candidate.bbox.x, block.bbox.x));
    return verticalDistance <= 360 && horizontalOverlap >= Math.min(candidate.bbox.width, block.bbox.width) * 0.25;
  });
  if (nearFigureCaption) return 0;
  // A fully rotated statistical matrix is often emitted as one native item
  // per visual row, so the ordinary same-baseline grid test cannot see it.
  // Use page-level geometry only when the page has a substantial rotated,
  // numeric population and the candidate itself is a short cell/row rather
  // than prose. This keeps explanatory footnotes and rotated annotations out
  // of the table role while preventing numeric rows from reaching translation.
  const rotatedPage = blocks.filter((candidate) => candidate.pageStart === block.pageStart);
  const rotatedItems = rotatedPage.flatMap((candidate) => candidate.lines.flatMap((line) => line.items))
    .filter((item) => Math.abs(item.rotation ?? 0) >= 45);
  if (rotatedItems.length >= 24 &&
      rotatedItems.filter((item) => /\d/.test(item.text)).length / rotatedItems.length >= 0.35 &&
      block.role === "paragraph" &&
      block.lines.some((line) => line.items.some((item) => Math.abs(item.rotation ?? 0) >= 45)) &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 24 &&
      !/[.!?;:]/.test(block.text.trim())) {
    return 0.97;
  }
  // Some proceedings PDFs emit every borderless matrix cell as its own one-
  // span block. There is then no multi-item row for the ordinary grid test to
  // see. Recover only a compact local matrix with repeated x columns and
  // several numeric rows; chart labels have already yielded to the nearby
  // figure-caption guard above.
  const cellBlocks = blocks.filter((candidate) =>
    candidate.pageStart === block.pageStart &&
    candidate.column === block.column &&
    candidate.role === "paragraph" &&
    candidate.lines.length === 1 &&
    candidate.lines[0]?.items.length === 1 &&
    candidate.text.trim().split(/\s+/).filter(Boolean).length <= 5 &&
    candidate.text.trim().length <= 48 &&
    !/[.!?;:]\s*$/.test(candidate.text.trim()) &&
    Math.abs(candidate.bbox.y - block.bbox.y) <= 132
  );
  if (cellBlocks.includes(block) && cellBlocks.length >= 12) {
    const rows = new Map<number, LayoutBlock[]>();
    for (const cell of cellBlocks) {
      const y = Math.round(cell.bbox.y / 6) * 6;
      rows.set(y, [...(rows.get(y) ?? []), cell]);
    }
    const denseRows = [...rows.values()].filter((row) => {
      const xs = new Set(row.map((cell) => Math.round(cell.bbox.x / 12) * 12));
      return xs.size >= 3;
    });
    const xRows = new Map<number, Set<number>>();
    for (const [y, row] of rows) {
      for (const cell of row) {
        const x = Math.round(cell.bbox.x / 12) * 12;
        xRows.set(x, new Set([...(xRows.get(x) ?? []), y]));
      }
    }
    const repeatedColumns = [...xRows.values()].filter((ys) => ys.size >= 3).length;
    const numericCells = cellBlocks.filter((cell) => /\d/.test(cell.text)).length;
    if (denseRows.length >= 3 && repeatedColumns >= 3 && numericCells / cellBlocks.length >= 0.35) {
      return 0.96;
    }
  }
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
  const math = (text.match(/[=+×÷∑∫√∞≈≠≤≥±∂∇∈∉∪∩→←↦{}|α-ωΑ-Ω]/gu) ?? []).length;
  const prose = words.filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  const statistics = /(?:\b[ntz]\s*=|[χΧxX²]\s*\(|\b[FPt]\s*\(|\bp\s*[<=>])/.test(text);
  const sentence = /[,.;:]/.test(text) || /[.!?]$/.test(text);
  const columnWidth = layout ? (block.column === "right" ? layout.pageWidth - layout.rightX : layout.pageWidth / (layout.isMultiColumn ? 2 : 1)) : 0;
  const compact = columnWidth > 0 && block.bbox.width < columnWidth * 0.72;
  const centered = layout && Math.abs((block.bbox.x + block.bbox.width / 2) - layout.pageWidth / 2) < layout.pageWidth * 0.12;
  let score = block.role === "equation" ? 0.58 : 0.08;
  score += Math.min(0.26, math * 0.06);
  const symbolicFormula = math >= 4 && prose <= 6 && words.length <= 40;
  if (symbolicFormula) score += 0.34;
  if (compact) score += 0.12;
  if (centered) score += 0.08;
  if (/\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(text)) score += 0.14;
  if (prose >= 4) score -= 0.36;
  if (sentence) score -= 0.2;
  if (statistics && (prose >= 2 || sentence)) score -= 0.42;
  // Commas and periods inside an index sequence (for example `x1, …, xi−1`)
  // are not prose sentence boundaries. A strongly symbolic, low-prose block
  // remains a display equation even when those separators are present.
  if (symbolicFormula) score = Math.max(score, 0.9);
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
      candidate.pageStart === block.pageStart &&
      candidate.column === block.column &&
      Math.abs(candidate.bbox.y - block.bbox.y) < 300);
    const captionedCompactRows = captionedCompactRowCluster(block, blocks);
    const captionedMultiCellText = captionedMultiCellTextBand(block, blocks);
    const captionedRepeatedRow = captionedRepeatedCellRow(block, blocks);
    const captionedColumnarGrid = captionedMultiColumnTableBand(block, blocks, layout?.pageWidth ?? 612);
    const captionedNeighborRows = captionedNeighborCellRows(block, blocks);
    const captionedNativeCellRow = captionedNativeMultiCellRow(block, blocks);
    const captionedRepeatedNativeGrid = captionedRepeatedNativeGridMember(block, blocks);
    const captionedDenseBand = captionedDenseTableBand(block, blocks, layout?.pageWidth ?? 612);
    // Keep the individual high-confidence table predicates available as
    // evidence.  Besides making resolver decisions explainable, this lets us
    // diagnose whether a physical table signal is leaking into prose in a
    // neighbouring column without changing the scoring policy itself.
    const nearbyTableRow = nearbyTableRowEvidence(block, blocks);
    const headeredTable = headeredTableRow(block, blocks);
    const contentsEntry = tableOfContentsEntry(block, blocks);
    // Cell geometry can overlap a nearby prose column in a two-column page.
    // Do not let a generic caption/table signal override an unmistakably
    // narrative block: this is the higher-cost error because it makes body
    // text disappear from translation.  A genuinely table-like descriptive
    // cell without sentence structure remains eligible for table recovery.
    const narrativeTableConflict = paragraphLike(block.text) &&
      block.text.trim().split(/(?<=[.!?])\s+/).filter((sentence) =>
        sentence.trim().split(/\s+/).filter(Boolean).length >= 8
      ).length >= 2 &&
      block.text.trim().split(/\s+/).filter(Boolean).length >= 32;
    const pageGrid = pageGridEvidence(block, blocks);
    const proseCellGrid = proseCellGridEvidence(block, blocks, layout?.pageWidth ?? 612);
    const cjkComparisonRow = cjkComparisonTableRow(block, blocks);
    const chartLabels = chartLabelEvidence(block, blocks);
    const axisLabels = axisLabelEvidence(block, blocks);
    const imageLabels = imageOverlapLabelEvidence(block, pages.find((page) => page.pageNumber === block.pageStart));
    const vectorLabels = vectorFigureLabelEvidence(block, blocks, pages.find((page) => page.pageNumber === block.pageStart));
    const fragmentedLabels = fragmentedGraphicLabelEvidence(block, blocks);
    const figureCaptionDiagram = figureCaptionDiagramEvidence(block, blocks, pages.find((page) => page.pageNumber === block.pageStart));
    const denseVectorPanel = denseVectorPanelEvidence(block, blocks, pages.find((page) => page.pageNumber === block.pageStart));
    const figurePanelLabels = figurePanelLabelEvidence(block, blocks, pages.find((page) => page.pageNumber === block.pageStart));
    const mixedNativeBand = mixedNativeBandEvidence(block);
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
    // Lowercase colon lead-ins are body discourse (`follows:`, `triggered:`),
    // not section labels. Title-Case metadata labels remain eligible headings.
    const lowercaseColonLeadIn = layoutRole === "heading" &&
      /^[a-z][\w'’ -]{0,40}:$/.test(block.text.trim());
    // Diagram / formula crumbs (Q, VM, ASPP, PA:, Task) often use a rare figure
    // font. Layout may call them paragraphs, but headingTextShape + nonBodyFont
    // later promotes them unless the heading score is clamped.
    const trimmedHeading = block.text.trim();
    const headingHasWeight = block.lines.flatMap((line) => line.items).some((item) =>
      /(?:bold|black|heavy|semi[- ]?bold|demi)/i.test(item.fontName)
    );
    const diagramMicroLabel = !/^\d+(?:\.\d+)*\.?\s+\S/.test(trimmedHeading) && (
      /^[A-Za-z]{1,3}$/.test(trimmedHeading) ||
      /^[A-Z]{1,6}\s*:$/.test(trimmedHeading) ||
      (/^[A-Z][a-z]{0,3}$/.test(trimmedHeading) && trimmedHeading.length <= 4) ||
      (/^[A-Z][A-Za-z0-9/+-]{0,5}$/.test(trimmedHeading) && trimmedHeading.length <= 6 && !headingHasWeight) ||
      // Axis / summation crumbs ("X∞", "Σi") from figures or equations.
      /^[A-Za-zΑ-Ωα-ω]\s*[∞∑∫√±≤≥≠≈∂∇]$/u.test(trimmedHeading) ||
      /^[∞∑∫√±≤≥≠≈∂∇]$/u.test(trimmedHeading) ||
      // Multi-panel figure tags ("A B", "A B C") and camelCase legend mash.
      /^[A-Z](?:\s+[A-Z]){1,4}$/.test(trimmedHeading) ||
      (/^[A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]*)+$/.test(trimmedHeading) && trimmedHeading.length <= 24 && !headingHasWeight)
    );
    const diagramMicroHeading = layoutRole === "heading" && diagramMicroLabel;
    const numericDensity = (block.text.match(/\d/g) ?? []).length / Math.max(block.text.length, 1);
    const rotatedItems = block.lines.flatMap((line) => line.items)
      .filter((item) => Math.abs(item.rotation ?? 0) >= 45);
    const rotatedNumericGrid = rotatedItems.length >= 8 &&
      rotatedItems.filter((item) => /\d/.test(item.text)).length / rotatedItems.length >= 0.12 &&
      !/[.!?]\s*$/.test(block.text.trim());
    const numericMultiItemRow = block.lines.length === 1 &&
      block.lines[0].items.length >= 2 && numericDensity >= 0.18 &&
      !/[.!?]$/.test(block.text.trim()) &&
      !/^(?:\d+\.){1,3}\d+\s+\S/.test(block.text.trim());
    const tableAdjacentNumericRow = layoutRole === "heading" && block.lines.length === 1 &&
      block.lines[0].items.length >= 1 && numericDensity >= 0.12 &&
      /[A-Za-z]/.test(block.text) &&
      nearbyTableCaption;
    const compactTableDataRow = nearbyTableCaption && block.lines.length === 1 &&
      block.lines[0].items.length >= 3 && block.text.trim().split(/\s+/).filter(Boolean).length <= 10 &&
      !/[.!?;:]/.test(block.text);
    // Numbered subsection labels are structural evidence even when the
    // publisher uses the same font size as body text. Require a hierarchical
    // number (4.3, 2.1.1), a short non-sentence label, and a following block;
    // this excludes ordinary numbered list items such as "1. We measured…".
    const numberedSubheading = /^(?:\d+\.){1,3}\d+\s+[^\d\s]/.test(block.text.trim()) &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 12 &&
      !/[.!?]\s*$/.test(block.text.trim()) &&
      Boolean(blocks[index + 1]) && blocks[index + 1].role === "paragraph";
    // Some IEEE/arXiv layouts put an inline label and the first sentence on
    // the same native line (for example `Abstract—Since ...`). The label's
    // display typography can look like a heading, but the text after the
    // dash is prose and must stay with the following paragraph. Native
    // punctuation/spacing is a publisher-independent boundary signal; the
    // rule deliberately requires an unspaced dash and a multi-word suffix so
    // ordinary titled sections such as `Study I – Design` remain headings.
    // Only em/en dashes mark inline labels (`Abstract—Since…`). An ASCII
    // hyphen inside a compound title word (`root-associated`) must not demote
    // the whole title block to paragraph.
    const inlineLabelProse = (layoutRole === "heading" || layoutRole === "title") &&
      /^[A-Za-z][A-Za-z ]{1,24}[—–]\s*[A-Za-z]/.test(block.text.trim()) &&
      block.text.trim().split(/\s+/).filter(Boolean).length >= 6;
    // Some native PDF producers flatten a complete table into one LayoutBlock:
    // header rows may have a few items while data rows retain 4–6 cells.  The
    // regular `tableLike` score is intentionally conservative for this shape,
    // so use caption proximity plus repeated multi-cell rows as an additional
    // geometry evidence signal.  Sentence punctuation and long prose are
    // excluded to avoid promoting ordinary paragraphs.
    const captionedNativeGrid = nearbyTableCaption && block.lines.length >= 6 &&
      block.lines.filter((line) => line.items.length >= 4).length >= Math.ceil(block.lines.length * 0.55) &&
      block.lines.filter((line) => line.items.length >= 2).length >= 4 &&
      !/[.!?]\s*$/.test(block.text.trim()) &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 140 &&
      block.lines.flatMap((line) => line.items).filter((item) => /\d/.test(item.text)).length >= 2;
    // Diagram answer callouts (`A: Option 2.`) often sit in a figure band and
    // inherit layout `chrome`, but they are vignette content — not publisher
    // chrome — and must remain visible / separable from adjacent prose.
    const diagramAnswerCallout =
      block.role === "chrome" &&
      /^(?:[A-D]:\s*)?Option\s+\d+[.)]?$/i.test(block.text.trim());
    const role = block.role === "header" || block.role === "footer" || block.role === "copyright" || block.role === "chrome"
      // `chrome` is layout-only; keep it out of Reader via copyright.
      ? (block.role === "chrome"
          ? (diagramAnswerCallout ? "other" : "copyright")
          : layoutRole)
      : denseCjkBody || numericRow || mathRow || alignedTableRow || numericMultiItemRow || tableAdjacentNumericRow || tableHeaderRow || singleWordAbbreviation || lowercaseColonLeadIn || diagramMicroHeading || rotatedNumericGrid || inlineLabelProse ? "paragraph" :
      numberedSubheading ? "heading" : layoutRole;
    const style = styleSignature(block, layouts, baseFontSize, blocks[index - 1], blocks[index + 1]);
    const scoreByRole: Partial<Record<CanonicalRole, number>> = {
      paragraph: role === "paragraph" ? confidence : 0.22,
      [role]: confidence,
    };
    if (cjkComparisonTableCaption(block, blocks)) scoreByRole.caption = 0.96;
    // Table/figure DOI stamps (doi:10.…t002) are publisher chrome, not body.
    if (/^doi:\s*10\.\d+/i.test(block.text.trim())) {
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, 0.96);
      scoreByRole.paragraph = Math.min(scoreByRole.paragraph ?? 0, 0.2);
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
      scoreByRole.title = Math.min(scoreByRole.title ?? 0, 0.2);
    }
    if (pageGrid > 0 && block.role !== "table_caption" && !narrativeTableConflict) {
      scoreByRole.table = pageGrid;
    }
    // Norm/power superscripts (`[ 2]`, `[ ∗ 2]`) are not table cells.
    if (/^\[\s*[*∗]?\s*\d{1,2}\s*\]$/.test(block.text.trim())) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.15);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, 0.7);
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
    }
    if (proseCellGrid > 0) {
      scoreByRole.table = Math.max(scoreByRole.table ?? 0, proseCellGrid);
    }
    if (contentsEntry) {
      // Dotted leaders and page numbers resemble repeated table columns. The
      // entry must stay out of the Reader body and never be rendered as a
      // source-only table card.
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.2);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, 0.98);
    }
    if (chartLabels > 0) scoreByRole.other = chartLabels;
    if (axisLabels > 0) scoreByRole.other = Math.max(scoreByRole.other ?? 0, axisLabels);
    if (imageLabels > 0) scoreByRole.other = Math.max(scoreByRole.other ?? 0, imageLabels);
    if (vectorLabels > 0) scoreByRole.other = Math.max(scoreByRole.other ?? 0, vectorLabels);
    if (fragmentedLabels > 0) {
      // A two-character uppercase fragment can otherwise win the generic
      // heading shape heuristic. Graphic-cluster evidence is stronger here:
      // keep the node as non-translatable `other` instead of a heading.
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, fragmentedLabels);
    }
    // A short native label that is geometrically attached to an image is
    // figure content, even when the page-wide numeric grid detector also sees
    // repeated columns.  Keep it out of the table role; real image-backed
    // tables are already represented by a `table` layout block and do not
    // enter this paragraph-only evidence path.
    if (imageLabels > 0 || vectorLabels > 0 || fragmentedLabels > 0 || figureCaptionDiagram > 0 || denseVectorPanel > 0 || figurePanelLabels > 0) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.2);
    }
    if (figureCaptionDiagram > 0 || denseVectorPanel > 0 || figurePanelLabels > 0) scoreByRole.other = Math.max(scoreByRole.other ?? 0, figureCaptionDiagram, denseVectorPanel, figurePanelLabels);
    if (axisLabels > 0) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, axisLabels);
    }
    if (axisLabels > 0) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
    }
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
      role !== "caption" &&
      block.role !== "table_caption" &&
      block.role !== "figure_caption" &&
      !tableAdjacentNumericRow &&
      !numericMultiItemRow &&
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
    // Some publishers emit all-caps section headings as ordinary paragraph
    // blocks, especially when the first glyph is split from the rest of the
    // line. A clear size/spacing/capitalization cluster is document-level
    // heading evidence; require a short, punctuation-free line so table
    // headers and statistical prose do not take this path. Same-size ALL-CAPS
    // Cyrillic/Latin labels still count when spacing separates them from body.
    const styleHeadingAnchor = role !== "title" && role !== "author" &&
      role !== "caption" &&
      block.role !== "table_caption" &&
      block.role !== "figure_caption" &&
      block.lines.length === 1 &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 12 &&
      style.uppercaseRatio >= 0.72 &&
      style.spacingBefore >= baseFontSize * 0.9 &&
      (style.fontSizeRatio >= 1.05 || style.spacingBefore >= baseFontSize * 1.2) &&
      !/[.!?:;=]/.test(block.text.trim()) &&
      !/\d/.test(block.text.trim());
    if (styleHeadingAnchor) {
      scoreByRole.heading = Math.max(scoreByRole.heading ?? 0, 0.96);
    }
    // Same-size ALL-CAPS labels (common in Cyrillic journals) may sit close to
    // the preceding paragraph, or wrap across two short lines. Prefer them as
    // headings when a long body block follows and the label itself is short
    // and punctuation-free.
    const allCapsSectionLabel = role !== "title" && role !== "author" &&
      role !== "caption" &&
      block.role !== "table_caption" &&
      block.role !== "figure_caption" &&
      block.lines.length <= 2 &&
      style.uppercaseRatio >= 0.85 &&
      (block.text.match(/\p{L}/gu) ?? []).length >= 8 &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 12 &&
      !/[.!?:;=]/.test(block.text.trim()) &&
      !/\d/.test(block.text.trim()) &&
      Boolean(blocks[index + 1]) &&
      blocks[index + 1].text.trim().length >= 40;
    if (allCapsSectionLabel) {
      // Must clear documentResolver's heading demotion: score < paragraph + 0.08.
      scoreByRole.heading = Math.max(scoreByRole.heading ?? 0, 0.96);
    }
    // Native table/figure captions must stay captions even when ALL-CAPS / bold
    // typography otherwise wins a heading race (`TABLE 2`).
    if (block.role === "table_caption" || block.role === "figure_caption" || role === "caption") {
      scoreByRole.caption = Math.max(scoreByRole.caption ?? 0, confidence, 0.92);
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.35);
    }
    // Journal running headers (`Frontiers in Psychology`, `IEEE XPLORE`) often
    // pick up the ALL-CAPS heading boost; keep layout header/copyright roles.
    const journalRunningHeader = isJournalRunningHeader(block.text);
    if (
      journalRunningHeader ||
      block.role === "header" ||
      block.role === "footer" ||
      (block.role === "copyright" && journalRunningHeader)
    ) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.35);
      if (block.role === "header" || block.role === "footer") {
        scoreByRole[block.role] = Math.max(scoreByRole[block.role] ?? 0, confidence, 0.9);
      } else {
        scoreByRole.copyright = Math.max(scoreByRole.copyright ?? 0, confidence, 0.9);
      }
    }
    // Chart axis / legend crumbs near a figure caption share body size and
    // Title Case with real section heads; keep them out of outline structure.
    const nearFigureCaption = blocks.some((candidate) => {
      if (candidate.pageStart !== block.pageStart || candidate.role !== "figure_caption") return false;
      // Axis/legend text sits in the figure band above the caption, not in
      // earlier section headings that merely share the page.
      const gap = candidate.bbox.y - (block.bbox.y + block.bbox.height);
      return gap >= -8 && gap <= 360;
    });
    const figureAxisOrLegend =
      nearFigureCaption &&
      block.lines.length <= 2 &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 8 &&
      block.text.trim().length <= 64 &&
      style.fontSizeRatio <= 1.06 &&
      style.boldScore < 0.35 &&
      !/^\d+(?:\.\d+)*\.?\s+\S/.test(block.text.trim()) &&
      !/^(?:abstract|introduction|methods?|results?|discussion|conclusion|references|related work|acknowledgements?)\b/i.test(
        block.text.trim()
      );
    if (figureAxisOrLegend) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.18);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, 0.72);
      scoreByRole.paragraph = Math.max(scoreByRole.paragraph ?? 0, 0.55);
    }
    const mashedChartLegend =
      ((block.text.match(/\beffects?\b/gi) ?? []).length >= 2 && !/^\d+(?:\.\d+)*\.?\s+/.test(block.text.trim())) ||
      (/^[A-Za-z][A-Za-z ]{0,20}:$/.test(block.text.trim()) &&
        style.fontSizeRatio <= 1.08 &&
        style.boldScore < 0.4 &&
        !/^(?:abstract|introduction|methods?|results?|discussion|conclusion|references|background|keywords?)\s*:$/i.test(
          block.text.trim()
        ));
    if (mashedChartLegend) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.18);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, 0.7);
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
    if (tableLike(block) || block.role === "table") {
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
      // Mathematical prose is often fragmented into many PDF text items
      // (`T : L2(X) → L2(Z)`, citations, inline formulae). That creates the
      // same multi-item geometry as a grid, but it still reads as an ordinary
      // sentence. Do not let this *generic* geometry alone turn a paragraph
      // into a table; caption-anchored table evidence remains available below.
      const proseTerms = block.text.match(/[A-Za-z]{3,}/g) ?? [];
      const structuralProse = paragraphLike(block.text) &&
        block.text.trim().split(/\s+/).filter(Boolean).length >= 12 &&
        proseTerms.length >= 5 &&
        /[.;:]/.test(block.text);
      const flatLines = block.lines.filter((line) => line.items.length === 1);
      const flatXs = new Map<number, number>();
      const flatYRows = new Map<number, Set<number>>();
      for (const line of flatLines) {
        const x = Math.round(line.items[0].x / 12) * 12;
        flatXs.set(x, (flatXs.get(x) ?? 0) + 1);
        const y = Math.round(line.y / 4) * 4;
        const xs = flatYRows.get(y) ?? new Set<number>();
        xs.add(x);
        flatYRows.set(y, xs);
      }
      const flattenedGrid = flatLines.length >= 6 && flatLines.length === block.lines.length &&
        [...flatXs.values()].filter((count) => count >= 2).length >= 2 &&
        [...flatYRows.values()].filter((xs) => xs.size >= 2).length >= 3 &&
        block.lines.every((line) => line.bbox.width <= 260) &&
        !/[.!?]\s*$/.test(block.text.trim()) &&
        block.text.trim().split(/\s+/).filter(Boolean).length <= 40;
      const cjkSentenceLikeProse = /[\u3400-\u9fff]/u.test(block.text) &&
        block.text.length >= 80 &&
        (block.text.match(/[，。；：！？]/gu) ?? []).length >= 2;
      const proseBlock = (paragraphLike(block.text) && /[.!?]\s*$/.test(block.text.trim())) || cjkSentenceLikeProse;
      // A long results paragraph may contain indented continuation lines or
      // separately emitted figure references, which creates several native
      // x origins despite reading as continuous prose. Treat multiple
      // sentence boundaries plus substantial prose as stronger negative
      // table evidence even when the final line is clipped at a page edge.
      const sentenceLikeProse = (paragraphLike(block.text) &&
        block.text.trim().split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim().length >= 24).length >= 2 &&
        block.text.trim().split(/\s+/).filter(Boolean).length >= 40) || cjkSentenceLikeProse;
      const sameOriginLongProse = block.lines.length > 8 &&
        new Set(block.lines.map((line) => Math.round(line.bbox.x / 12))).size === 1 &&
        block.text.trim().split(/\s+/).filter(Boolean).length > 20;
      const listLikeBlock = block.lines.length >= 4 && /[•‣▪∙]/.test(block.text);
      const longCaption = block.role === "table_caption" && paragraphLike(block.text);
      const captionBlock = block.role === "table_caption";
      const nativeGridScore = rotatedItems.length >= 30 && rotatedNumeric / Math.max(rotatedItems.length, 1) >= 0.3
        ? 0.97
        : (structuralGrid || flattenedGrid) && !structuralProse && !proseBlock && !sentenceLikeProse && !sameOriginLongProse && !listLikeBlock && !longCaption && !captionBlock
          ? 0.95
          // `tableLike` also catches ordinary multi-line prose with aligned
          // native items. Keep that signal for region membership, but below
          // the resolver's role-promotion threshold unless stronger grid
          // evidence is present.
          : 0.68;
      // This broad native-grid pass is weaker than an earlier document-level
      // region proof (for example a repeated prose-cell grid), so it must not
      // overwrite that high-confidence evidence with its conservative score.
      scoreByRole.table = Math.max(scoreByRole.table ?? 0, nativeGridScore);
      // reconstructDocument has already identified a native grid. Preserve
      // that geometry for compact captionless tables unless a later, more
      // specific formula or figure-label guard overrides it.
      if (block.role === "table" && !cjkSentenceLikeProse && !sentenceLikeProse) {
        scoreByRole.table = Math.max(scoreByRole.table, 0.9);
      }
      // Multi-column Japanese/Chinese memorial prose is often emitted as many
      // short native items per line and wrongly labeled table by layout.
      if (cjkSentenceLikeProse) {
        scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.4);
        scoreByRole.paragraph = Math.max(scoreByRole.paragraph ?? 0, 0.9);
      }
    }
    const highConfidenceTableEvidence = [
      nearbyTableRow && "nearby-caption-row",
      headeredTable && "headered-row",
      cjkComparisonRow && "cjk-comparison-row",
      compactTableDataRow && "compact-caption-row",
      captionedNativeGrid && "captioned-native-grid",
      captionedColumnarGrid && "captioned-columnar-grid",
      captionedCompactRows && "captioned-compact-rows",
      captionedMultiCellText && "captioned-multi-cell-text",
      captionedRepeatedRow && "captioned-repeated-row",
      captionedNeighborRows && "captioned-neighbour-rows",
      captionedNativeCellRow && "captioned-native-cell-row",
      captionedRepeatedNativeGrid && "captioned-repeated-native-grid",
      captionedDenseBand && "captioned-dense-band",
      // Small-font text on a table-only page (pdfLayout markTablePageText), even when its cells hold sentences.
      block.tablePageText && "table-page-text",
    ].filter((reason): reason is string => Boolean(reason));
    if (block.role !== "table_caption" && !narrativeTableConflict && highConfidenceTableEvidence.length > 0) scoreByRole.table = 0.96;
    const captionAnchoredTable = nearbyTableCaption || captionedCompactRows || captionedMultiCellText || captionedRepeatedRow ||
      captionedColumnarGrid || captionedNeighborRows || captionedNativeCellRow || captionedRepeatedNativeGrid || captionedDenseBand;
    const symbolicFormulaText = (block.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length >= 4 &&
      (block.text.match(/[A-Za-z]{3,}/g) ?? []).length <= 6;
    // Some mathematical displays look like a dense numeric matrix to native
    // PDF extraction: each equation row has many independently positioned
    // glyphs, but repeated assignment operators and very little prose make it
    // a formula rather than a reader-visible table. Captioned data tables are
    // deliberately excluded, as are ordinary statistical sentences.
    const assignmentCount = (block.text.match(/[=∈∉≈≠≤≥→←↦]/gu) ?? []).length;
    const digitCount = (block.text.match(/\d/g) ?? []).length;
    const proseWordCount = (block.text.match(/[A-Za-z]{3,}/g) ?? []).length;
    const mathematicalMatrixDisplay = !captionAnchoredTable &&
      block.lines.length >= 3 &&
      assignmentCount >= 3 &&
      digitCount >= 8 &&
      proseWordCount <= 4;
    // A display equation is frequently emitted as several tiny, independent
    // glyph runs.  The resulting x/y grid resembles a table even when it is
    // only a broken mathematical expression.  Unlike actual table cells,
    // these fragments contain Greek/symbolic notation with almost no prose
    // and lack a table-caption relationship.  Keep ordinary statistical
    // sentences out of this path: they have prose, sentence punctuation, or
    // explicit table ownership above.
    const mathFragmentGlyphs = (block.text.match(/[=+×÷∑∫√∞≈≠≤≥±∂∇∈∉∪∩→←↦{}|α-ωΑ-Ω‖]/gu) ?? []).length;
    const mathOnlyToken = /[α-ωΑ-Ω∑∫√∞≈≠≤≥±∂∇∈∉∪∩→←↦{}|]/u.test(block.text) &&
      !/[A-Za-z]{3,}/.test(block.text) &&
      block.text.trim().split(/\s+/).filter(Boolean).length <= 12;
    const fragmentedMathDisplay = !captionAnchoredTable && !cjkComparisonRow &&
      (mathFragmentGlyphs >= 2 || mathOnlyToken) &&
      proseWordCount <= 3 &&
      !/[.!?]\s*$/.test(block.text.trim());
    // The lead-in to a displayed formula is sometimes split into a narrow
    // right-hand native run (`, with probability ... exp(...)`). Its compact
    // x-position can resemble a table row, but leading clause punctuation,
    // an unfinished ending, and mathematical notation identify it as prose
    // that belongs beside the formula. This intentionally does not classify
    // a complete statistical sentence as math-only content.
    const mathematicalClauseContinuation = !captionAnchoredTable &&
      /^[,;:]\s*/.test(block.text.trim()) &&
      /[=+×÷−∑∫√∞≈≠≤≥±∂∇∈∉∪∩→←↦{}|α-ωΑ-Ω]|\b(?:exp|log|min|max)\s*\(/u.test(block.text) &&
      !/[.!?]\s*$/.test(block.text.trim());
    // A symbolic display formula is more specific than an inferred
    // captionless grid. Apply this after every table-evidence generator so
    // PDF tokenization cannot turn the formula into a Reader table card.
    if (symbolicFormulaText && equation >= 0.62 && !captionAnchoredTable) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.68);
      scoreByRole.equation = Math.max(scoreByRole.equation ?? 0, 0.9);
    }
    if (mathematicalMatrixDisplay) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.68);
      scoreByRole.equation = Math.max(scoreByRole.equation ?? 0, 0.9);
    }
    if (fragmentedMathDisplay) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.2);
      scoreByRole.equation = Math.max(scoreByRole.equation ?? 0, 0.78);
    }
    // Layout chrome with a contact address (`{a, b}@lab.edu`) has braces, not math.
    if (block.role === "chrome" && /@[\w.-]+\.[A-Za-z]{2,}/.test(block.text)) scoreByRole.equation = 0;
    if (mathematicalClauseContinuation) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.2);
      scoreByRole.paragraph = Math.max(scoreByRole.paragraph ?? 0, 0.9);
    }
    // A captionless table fallback must yield to strong vector-label evidence.
    // Actual captioned tables retain their dedicated geometry evidence above;
    // without that anchor, a chart/diagram label matrix is safer as `other`
    // than as a reader-visible, source-only table card.
    if ((vectorLabels >= 0.82 || figureCaptionDiagram > 0 || denseVectorPanel > 0 || figurePanelLabels > 0) && !captionedRepeatedNativeGrid) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.2);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, vectorLabels, figureCaptionDiagram, denseVectorPanel, figurePanelLabels);
    }
    // Apply the narrative conflict guard after every table generator. Some
    // captionless row heuristics run later than page-grid evidence and could
    // otherwise restore a high table score for a paragraph that merely shares
    // a numeric/plot band with it.
    if (narrativeTableConflict && proseCellGrid === 0) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.3);
    }
    // Heading-like typography is a stronger structural signal than a
    // caption-adjacent multi-cell heuristic. Wide spacing before a bold/all
    // caps line should remain a heading even when native glyphs are emitted
    // as several separated spans.
    const headingGeometryConflict = style.fontSizeRatio >= 1.05 &&
      style.spacingBefore >= 16 && style.uppercaseRatio >= 0.7 &&
      (scoreByRole.heading ?? 0) >= 0.7;
    if (headingGeometryConflict && proseCellGrid === 0) {
      scoreByRole.table = Math.min(scoreByRole.table ?? 0, 0.3);
    }
    // Apply this after typography scoring. A bold axis/table label must not
    // be revived as a heading after its numeric neighbourhood identified it
    // as part of a matrix.
    if (axisLabels > 0) {
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
    }
    if (fragmentedLabels > 0) {
      // Apply after all style/heading boosts so graphic fragments cannot be
      // promoted back to headings by a later generic style rule.
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, fragmentedLabels);
    }
    if (diagramMicroLabel) {
      // Clamp heading only — raising `other` here can outrank captionless
      // table evidence on short neighboring labels.
      scoreByRole.heading = Math.min(scoreByRole.heading ?? 0, 0.2);
    }
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
    if (proseCellGrid > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "repeated-prose-cell-grid",
        confidence: proseCellGrid,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "three or more repeated native column anchors across compact prose cells",
      });
    }
    if (pageGrid > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "page-native-grid",
        confidence: pageGrid,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "repeated native column anchors across a page-level numeric grid",
      });
    }
    if (highConfidenceTableEvidence.length > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "table-row-geometry",
        confidence: 0.96,
        page: block.pageStart,
        bbox: block.bbox,
        reason: highConfidenceTableEvidence.join(", "),
      });
    }
    if (block.tablePageText) {
      evidence.push({ source: "geometry" as EvidenceSource, label: "table-page-text", confidence: 0.96, page: block.pageStart, bbox: block.bbox, reason: "small-font text on a table-only page" });
    }
    if (cjkComparisonRow) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "cjk-checkmark-comparison-grid",
        confidence: 0.96,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "repeated CJK comparison rows and checkmark columns",
      });
    }
    if (mixedNativeBand > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "mixed-native-x-band",
        confidence: mixedNativeBand,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "multiple baselines contain a wide body run and a narrow secondary native x-band; preserve for resolver review",
      });
    }
    if (contentsEntry) {
      evidence.push({
        source: "generic-heuristic",
        label: "table-of-contents-entry",
        confidence: 0.98,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "repeated dotted leaders with terminal page numbers on the same page",
      });
    }
    if (mathematicalMatrixDisplay) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "mathematical-assignment-display",
        confidence: 0.9,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "multiple assignment operators and dense numeric rows with little prose",
      });
    }
    if (fragmentedMathDisplay) {
      evidence.push({
        source: "generic-heuristic",
        label: "fragmented-mathematical-display",
        confidence: 0.78,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "symbolic or Greek native glyph fragment has little prose and no table-caption relationship",
      });
    }
    if (mathematicalClauseContinuation) {
      evidence.push({
        source: "generic-heuristic",
        label: "mathematical-clause-continuation",
        confidence: 0.9,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "punctuation-led incomplete clause contains mathematical notation and has no table-caption relationship",
      });
    }
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
    if (axisLabels > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "axis-label-numeric-neighborhood",
        confidence: axisLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "short text block is adjacent to repeated numeric tick-like blocks",
      });
    }
    if (denseVectorPanel > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "dense-vector-panel",
        confidence: denseVectorPanel,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "tiny repeated grid panels on a graphics-rich page without a table caption",
      });
    }
    if (figurePanelLabels > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "figure-panel-label",
        confidence: figurePanelLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "tiny native label lies in a graphics-rich region bounded by a figure caption, without a nearby table caption",
      });
    }
    if (imageLabels > 0) {
      evidence.push({
        source: "generic-heuristic",
        label: "image-overlap-label-cluster",
        confidence: imageLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "short multi-line native labels substantially overlap an image placement",
      });
    }
    if (figureCaptionDiagram > 0) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "figure-caption-vector-diagram",
        confidence: figureCaptionDiagram,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "dense mathematical native glyphs immediately precede an overlapping figure caption",
      });
    }
    if (vectorLabels > 0) {
      evidence.push({
        source: "generic-heuristic",
        label: "vector-figure-label-cluster",
        confidence: vectorLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "dense short native text items span multiple x-bands without sentence punctuation",
      });
    }
    if (fragmentedLabels > 0) {
      scoreByRole.other = Math.max(scoreByRole.other ?? 0, fragmentedLabels);
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "fragmented-graphic-label-cluster",
        confidence: fragmentedLabels,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "short native blocks with matching font and drifting baselines form a compact graphic-label cluster",
      });
    }
    if (captionedNeighborRows) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "captioned-neighbor-cell-rows",
        confidence: 0.96,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "repeated same-baseline cell origins to the left of a prose column under a native table caption",
      });
    }
    if (captionedNativeCellRow) {
      evidence.push({
        source: "geometry" as EvidenceSource,
        label: "captioned-native-multicell-row",
        confidence: 0.96,
        page: block.pageStart,
        bbox: block.bbox,
        reason: "nearby native table caption and four well-separated text spans on one baseline indicate distinct cells",
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

  // A borderless matrix can split its row label and numeric cells into
  // independent native blocks. Once one cell on that baseline has strong
  // grid evidence, its adjacent axis label belongs to the same table region.
  // This does not promote chart text: chart/figure labels are capped below
  // the strong-table threshold before this propagation runs.
  const matrixCandidates = candidates.map((candidate) => {
    const box = candidate.boundingBoxes[0];
    const isAxisLabel = candidate.evidence.some((entry) => entry.label === "axis-label-numeric-neighborhood");
    if (!box || !isAxisLabel) return candidate;
    // Do not let the same-baseline table propagation revive a chart/diagram
    // label which already has stronger non-document evidence. This is a
    // resolver input, not a vocabulary rule: image/vector/fragment geometry
    // must win over a nearby numeric grid unless a caption later anchors it.
    if ((candidate.roleScores.other ?? 0) >= 0.82) return candidate;
    const peer = candidates.find((other) => {
      if (other === candidate || other.pageStart !== candidate.pageStart || other.column !== candidate.column) return false;
      if ((other.roleScores.table ?? 0) < 0.94) return false;
      const otherBox = other.boundingBoxes[0];
      if (!otherBox || Math.abs(otherBox.y - box.y) > Math.max(3, box.height * 0.5)) return false;
      const gap = Math.max(otherBox.x - (box.x + box.width), box.x - (otherBox.x + otherBox.width), 0);
      return gap <= 240;
    });
    if (!peer) return candidate;
    return {
      ...candidate,
      roleScores: { ...candidate.roleScores, table: 0.96, heading: Math.min(candidate.roleScores.heading ?? 0, 0.2) },
      evidence: [...candidate.evidence, {
        source: "geometry" as EvidenceSource,
        label: "matrix-axis-label-neighbor",
        confidence: 0.96,
        page: candidate.pageStart,
        bbox: box,
        reason: "short axis label shares a baseline with a strongly evidenced table cell",
      }],
    };
  });

  const looksLikePublicationRail = (text: string): boolean => {
    const normalized = text.trim();
    return /\b(?:e[- ]?issn|p[- ]?issn|issn|doi|impact\s+factor)\b/i.test(normalized) ||
      /^(?:[A-Z]{2,12}\s+)?\d{4}\s*[;,:]\s*\d+\s*\(\s*\d+\s*\)/.test(normalized) ||
      /\b\d{4}\s*;\s*\d+\s*\(\s*\d+\s*\)\s*:\s*\d/.test(normalized);
  };

  // Native PDF producers may split the first words of an article title into a
  // short metadata/affiliation block on the same baseline. Reattach only a
  // compact, institution-free prefix immediately to the left of a title
  // candidate; full affiliation rows and body text remain untouched.
  const fusedCandidates = matrixCandidates.map((candidate) => {
    if (candidate.role !== "title" || candidate.pageStart !== 1) return candidate;
    const box = candidate.boundingBoxes[0];
    if (!box) return candidate;
    const prefix = matrixCandidates
      .filter((other) => {
        if (other === candidate || other.pageStart !== 1 || other.role !== "affiliation") return false;
        const otherBox = other.boundingBoxes[0];
        const text = other.text.trim();
        return Boolean(otherBox) && Math.abs((otherBox?.y ?? 0) - box.y) <= 12 &&
          (otherBox?.x ?? 0) < box.x && text.length >= 2 && text.length <= 80 &&
          /^[a-z\u00e0-\u024f]/.test(candidate.text.trim()) &&
          !/[.!?]$/.test(text) &&
          !looksLikePublicationRail(text) &&
          !/\b(?:university|department|institute|laboratory|college|school|hospital|faculty)\b/i.test(text);
      })
      .sort((a, b) => (b.boundingBoxes[0]?.x ?? 0) - (a.boundingBoxes[0]?.x ?? 0))[0];
    if (!prefix) {
      // A title continuation can be misclassified as a paragraph when the
      // first line sits in a different horizontal band. Recover it only when
      // typography and sentence shape agree: same page/font, tight spacing,
      // lowercase continuation, and an unfinished first line.
      const titleFont = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
      const continuation = matrixCandidates
        .filter((other) => {
          if (other === candidate || other.pageStart !== 1 || other.role !== "paragraph") return false;
          const otherBox = other.boundingBoxes[0];
          const candidateBox = candidate.boundingBoxes[0];
          if (!otherBox || !candidateBox) return false;
          const otherFont = other.layoutBlock.lines[0]?.fontSize ?? 0;
          const gap = candidateBox.y - (otherBox.y + otherBox.height);
          const words = other.text.trim().split(/\s+/).filter(Boolean);
          const unfinishedTitleWord = /\b(?:of|and|the|in|for|to|a|an|on|with|from|by|as|at|via)$/i.test(other.text.trim());
          return /^[a-z\u00e0-\u024f]/.test(candidate.text.trim()) &&
            !/[.!?;:]$/.test(other.text.trim()) && words.length >= 3 && words.length <= 16 &&
            other.text.trim().length <= 140 && gap >= -2 && gap <= Math.max(24, titleFont * 2.2) &&
            Math.abs(otherFont - titleFont) <= 1.2 &&
            unfinishedTitleWord &&
            !looksLikePublicationRail(other.text) &&
            !/^(?:abstract|keywords?|introduction|received|accepted)\b/i.test(other.text.trim());
        })
        .sort((a, b) => (b.boundingBoxes[0]?.y ?? 0) - (a.boundingBoxes[0]?.y ?? 0))[0];
      if (!continuation) return candidate;
      const previousBox = continuation.boundingBoxes[0];
      const minX = Math.min(previousBox.x, box.x);
      const minY = Math.min(previousBox.y, box.y);
      return {
        ...candidate,
        text: `${continuation.text.trim()} ${candidate.text.trim()}`.replace(/\s+/g, " "),
        boundingBoxes: [{
          ...box,
          x: minX,
          y: minY,
          width: Math.max(previousBox.x + previousBox.width, box.x + box.width) - minX,
          height: Math.max(previousBox.y + previousBox.height, box.y + box.height) - minY,
        }],
        layoutBlock: {
          ...candidate.layoutBlock,
          text: `${continuation.text.trim()} ${candidate.text.trim()}`.replace(/\s+/g, " "),
        },
        evidence: [...candidate.evidence, {
          source: "geometry" as EvidenceSource,
          label: "cross-band-title-continuation",
          confidence: 0.9,
          page: candidate.pageStart,
          bbox: box,
          reason: "same-font lowercase continuation follows an unfinished title line",
        }],
      };
    }
    const prefixBox = prefix.boundingBoxes[0];
    return {
      ...candidate,
      text: `${prefix.text.trim()} ${candidate.text.trim()}`.replace(/\s+/g, " "),
      boundingBoxes: [{
        ...box,
        x: prefixBox.x,
        width: Math.max(box.x + box.width, prefixBox.x + prefixBox.width) - prefixBox.x,
      }],
      layoutBlock: {
        ...candidate.layoutBlock,
        text: `${prefix.text.trim()} ${candidate.text.trim()}`.replace(/\s+/g, " "),
      },
      evidence: [...candidate.evidence, {
        source: "geometry" as EvidenceSource,
        label: "same-baseline-title-prefix",
        confidence: 0.88,
        page: candidate.pageStart,
        bbox: box,
        reason: "short affiliation-role prefix is aligned immediately left of title candidate",
      }],
    };
  });

  return { layouts, blocks, baseFontSize, candidates: fusedCandidates };
}
