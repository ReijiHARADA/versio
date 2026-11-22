import { extractPDFContent, extractFigureImages, graphicsToExtractionEvidence, type ExtractedPage } from "../../pdfService";
import { findDoi, findVenue } from "../projection/venue";
import { figureLookupKey, formatReadingOrderLog } from "../../pdfLayout";
import { repairLineBreakHyphens } from "../projection/repairHyphens";
import { dropDuplicateBylineRows } from "../projection/bylineRows";
import { collapseTableCellRuns } from "../projection/tableCellRuns";
import { reconcileTranslationWarnings, stitchParagraphContinuations } from "../projection/stitchParagraphs";
import type { Paper, Section, PaperBlock } from "../../../types/paper";
import type { LayoutBlock, PageColumnLayout } from "../../pdfLayout";
import { nativeDocumentFromExtracted } from "../native/fromExtracted";
import type { NativeDocument } from "../native/types";
import { classifyDocument } from "../pageClass";
import { generateGenericCandidates } from "../generic/candidates";
import { buildTableRegionEvidence } from "../generic/tableRegions";
import { evidenceFromPages } from "../evidence";
import { detectFormat } from "../formats";
import { applyFormatHardRules } from "../formats/applyHardRules";
import { resolveCanonicalDocument } from "../resolver/documentResolver";
import { projectCanonicalToPaper } from "../projection/toPaper";
import { applyVisionOcr, visionOcrEnricher } from "../enrichers/ocr";
import { grobidEnricher } from "../enrichers/grobid";
import { doclingEnricher } from "../enrichers/docling";
import { enhanceReferencesWithCrf } from "../crf/applyReferences";
import { loadBundledCrfRuntime } from "../crf/browserRuntime";
import type { CanonicalDocument } from "../canonical/types";
import type { ExtractionEvidence, PageTextKind } from "../types";
import type { StructuralRegionEvidence } from "../types";
import type { ExtractionContext, ExtractionEnricher } from "../enrichers/types";

export type ExtractProgress = {
  stage: "extracting" | "ocr" | "structuring" | "figures";
  done: number;
  total: number;
  message: string;
};

export type ExtractAcademicPdfInput = {
  paperId: string;
  filePath: string;
  fileHash: string;
  file?: File;
  pages?: ExtractedPage[];
  metadata?: { title?: string; author?: string; pageCount: number };
  extractFigures?: boolean;
  previousBlocks?: PaperBlock[];
  regionEvidence?: StructuralRegionEvidence[];
  onProgress?: (progress: ExtractProgress) => void;
};

export type ExtractAcademicPdfResult = {
  native: NativeDocument;
  canonical: CanonicalDocument;
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  pageKind: PageTextKind;
};

const ENRICHERS: ExtractionEnricher[] = [
  visionOcrEnricher,
  grobidEnricher,
  doclingEnricher,
];

function boxBounds(block: PaperBlock): { page: number; left: number; right: number; top: number; bottom: number } | null {
  const boxes = block.boundingBoxes;
  if (!boxes.length) return null;
  const page = boxes[0].page;
  const samePage = boxes.filter((box) => box.page === page);
  return {
    page,
    left: Math.min(...samePage.map((box) => box.x)),
    right: Math.max(...samePage.map((box) => box.x + box.width)),
    top: Math.min(...samePage.map((box) => box.y)),
    bottom: Math.max(...samePage.map((box) => box.y + box.height)),
  };
}

/**
 * A numbered table caption with a rendered crop is the reader-visible
 * representation of a ruled table. Its individual native-text columns are
 * useful extraction evidence, but displaying them again as separate fallback
 * tables produces unreadable duplicate strings. Only remove fragments after
 * a caption crop was actually created; source-only table fallback remains
 * available whenever image extraction cannot produce a reliable crop.
 */
export function suppressImageBackedTableFragments(blocks: PaperBlock[]): PaperBlock[] {
  const imageBackedCaptions = blocks.filter((block) => {
    if (block.type !== "table") return false;
    const metadata = block.metadata as { imageUrl?: string; captionOriginal?: string };
    return Boolean(metadata.imageUrl) && /^\s*(?:table|表)\s*\d+/i.test(metadata.captionOriginal ?? "");
  });
  const imageBackedFigures = blocks.filter((block) => {
    if (block.type !== "figure") return false;
    const metadata = block.metadata as { imageUrl?: string; regionBoundingBoxes?: PaperBlock["boundingBoxes"] };
    return Boolean(metadata.imageUrl) && Boolean(metadata.regionBoundingBoxes?.length);
  });
  if (imageBackedCaptions.length === 0 && imageBackedFigures.length === 0) return blocks;

  // A full-width table may put its caption in the left PDF column while its
  // native cells are classified in the right column. Establish a dense
  // cross-column ownership signal before applying the normal same-column
  // geometry rule, so a successful table crop hides all of its source cells
  // instead of leaving duplicate table cards beside the image.
  const crossColumnCaptionIds = new Set(
    imageBackedCaptions
      .filter((caption) => {
        const captionBox = boxBounds(caption);
        if (!captionBox) return false;
        const candidates = blocks.filter((block) => {
          if (block.type !== "table") return false;
          const metadata = block.metadata as { captionOriginal?: string; figureKey?: string; tableSourceFallback?: boolean; column?: string };
          if (metadata.captionOriginal || (!metadata.tableSourceFallback && !metadata.figureKey?.startsWith("table-region-"))) return false;
          const box = boxBounds(block);
          if (!box || box.page !== captionBox.page) return false;
          if (metadata.column === caption.metadata.column) return false;
          const distance = box.top - captionBox.bottom;
          return distance >= -6 && distance <= 520;
        });
        const xBands = new Set(candidates.flatMap((block) => {
          const metadata = block.metadata as { tableRows?: Array<Array<{ x?: number }>>; lines?: Array<{ bbox?: { x: number } }> };
          const cellXs = (metadata.tableRows ?? []).flatMap((row) => row.map((cell) => cell.x).filter((x): x is number => typeof x === "number"));
          const lineXs = (metadata.lines ?? []).map((line) => line.bbox?.x).filter((x): x is number => typeof x === "number");
          const xs = [...cellXs, ...lineXs];
          return (xs.length > 0 ? xs : [boxBounds(block)?.left ?? 0]).map((x) => Math.round(x / 12));
        }));
        return candidates.length >= 4 && xBands.size >= 2;
      })
      .map((caption) => caption.id)
  );

  return blocks.filter((block) => {
    if (block.type !== "table") return true;
    const metadata = block.metadata as {
      imageUrl?: string;
      captionOriginal?: string;
      figureKey?: string;
      canonicalNodeId?: string;
      column?: string;
      tableSourceFallback?: boolean;
      evidence?: Array<{ label?: string }>;
    };
    const isTableRegionFragment =
      metadata.figureKey?.startsWith("table-region-") ||
      metadata.tableSourceFallback === true ||
      metadata.evidence?.some((entry) => entry.label === "table-region-member") === true;
    if (metadata.imageUrl || metadata.captionOriginal || !isTableRegionFragment) {
      return true;
    }
    const fragment = boxBounds(block);
    if (!fragment) return true;
    const insideFigure = imageBackedFigures.some((figure) => {
      const region = (figure.metadata as { regionBoundingBoxes?: PaperBlock["boundingBoxes"] }).regionBoundingBoxes ?? [];
      const regionBoxes = region.filter((box) => box.page === fragment.page);
      if (regionBoxes.length === 0) return false;
      const regionLeft = Math.min(...regionBoxes.map((box) => box.x));
      const regionRight = Math.max(...regionBoxes.map((box) => box.x + box.width));
      const regionTop = Math.min(...regionBoxes.map((box) => box.y));
      const regionBottom = Math.max(...regionBoxes.map((box) => box.y + box.height));
      const fragmentArea = Math.max(1, (fragment.right - fragment.left) * (fragment.bottom - fragment.top));
      const overlapArea = Math.max(0, Math.min(fragment.right, regionRight) - Math.max(fragment.left, regionLeft)) *
        Math.max(0, Math.min(fragment.bottom, regionBottom) - Math.max(fragment.top, regionTop));
      return overlapArea / fragmentArea >= 0.8;
    });
    if (insideFigure) return false;
    return !imageBackedCaptions.some((caption) => {
      const captionMetadata = caption.metadata as { column?: string; captionOf?: string };
      const captionBox = boxBounds(caption);
      if (!captionBox || captionBox.page !== fragment.page) return false;
      // Canonical caption relations are stronger than the physical column
      // label. A table can span both columns while its caption is placed in
      // the first column, so a right-column native fragment must still be
      // suppressed when it belongs to the caption's canonical target.
      if (captionMetadata.captionOf && metadata.canonicalNodeId === captionMetadata.captionOf) return true;
      if (metadata.column && captionMetadata.column && metadata.column !== captionMetadata.column &&
          !crossColumnCaptionIds.has(caption.id)) return false;
      const crossColumnOwner = crossColumnCaptionIds.has(caption.id);
      const horizontallyOverlaps = fragment.left < captionBox.right && captionBox.left < fragment.right;
      // Publishers place table captions above *or* below their grids. Both
      // layouts are safe here because this is restricted to native blocks
      // already classified as table-region fragments, on the same page and
      // column as an image-backed numbered caption.
      const maxDistance = crossColumnOwner ? 520 : 300;
      const closeAbove = fragment.bottom <= captionBox.top + 6 && captionBox.top - fragment.bottom <= maxDistance;
      const closeBelow = fragment.top >= captionBox.bottom - 6 && fragment.top - captionBox.bottom <= maxDistance;
      return (horizontallyOverlaps || crossColumnOwner) && (closeAbove || closeBelow);
    });
  });
}

function overallConfidence(canonical: CanonicalDocument): number {
  const d = canonical.diagnostics;
  return (
    (d.layoutConfidence +
      d.readingOrderConfidence +
      d.textIntegrityConfidence +
      d.semanticConfidence) /
    4
  );
}

/**
 * Formal PDF extraction entry point. Callers receive CanonicalDocument
 * plus a Versio projection. Internal parsers are not exposed.
 */
export async function extractAcademicPdf(
  input: ExtractAcademicPdfInput
): Promise<ExtractAcademicPdfResult> {
  let pages = input.pages;
  let metadata = input.metadata;
  const ocrPages = new Set<number>();

  if (!pages) {
    if (!input.file) {
      throw new Error("extractAcademicPdf requires file or pages");
    }
    input.onProgress?.({
      stage: "extracting",
      done: 0,
      total: 1,
      message: "テキストを抽出しています...",
    });
    const pdfResult = await extractPDFContent(input.file, (page, total) => {
      input.onProgress?.({
        stage: "extracting",
        done: page,
        total,
        message: `テキストを抽出しています... (${page}/${total}ページ)`,
      });
    });
    pages = pdfResult.pages;
    metadata = pdfResult.metadata;
  }

  metadata = metadata ?? { pageCount: pages.length };
  const pageKind = classifyDocument(pages);

  if (input.file && visionOcrEnricher.shouldRun({ native: nativeDocumentFromExtracted(pages, metadata), pages })) {
    try {
      const { openPdfDocument } = await import("../../pdfjsRuntime");
      const arrayBuffer = await input.file.arrayBuffer();
      const pdfDoc = await openPdfDocument(arrayBuffer).promise;
      const applied = await applyVisionOcr(pages, pdfDoc, (page, total) => {
        input.onProgress?.({
          stage: "ocr",
          done: page,
          total,
          message: `OCR処理中... (${page}/${total}ページ)`,
        });
      });
      pages = applied.pages;
      for (const page of applied.ocrPages) ocrPages.add(page);
    } catch (ocrErr) {
      console.warn("OCR failed, proceeding with native text:", ocrErr);
    }
  }

  const native = nativeDocumentFromExtracted(pages, metadata, ocrPages);
  const result = extractFromPages({
    pages,
    paperId: input.paperId,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadata,
    native,
    pageKind,
    previousBlocks: input.previousBlocks,
  });

  // Reference entries: ported GROBID CRF (English/Latin script only, heuristics as fallback).
  const references = await enhanceReferencesWithCrf(result, pages, loadBundledCrfRuntime);
  if (references.applied) console.info(`[references] CRF rebuilt ${references.references} references`);

  if (input.file && input.extractFigures !== false) {
    input.onProgress?.({
      stage: "figures",
      done: 0,
      total: 1,
      message: "図を抽出しています...",
    });
    try {
      const figureImages = await extractFigureImages(
        input.file,
        result.layoutBlocks,
        result.layouts,
        (done, total) => {
          input.onProgress?.({
            stage: "figures",
            done,
            total,
            message: `図を抽出しています... (${done}/${total})`,
          });
        }
      );
      for (const block of result.blocks) {
        if (block.type !== "figure" && block.type !== "table") continue;
        const caption = String(block.metadata.captionOriginal ?? "");
        const key =
          String(block.metadata.figureKey ?? "") ||
          figureLookupKey(caption, block.pageStart);
        const imageUrl = figureImages.get(key);
        if (imageUrl) {
          block.metadata = { ...block.metadata, imageUrl };
        }
      }
      const visibleBlocks = suppressImageBackedTableFragments(result.blocks);
      if (visibleBlocks.length !== result.blocks.length) {
        result.blocks.splice(0, result.blocks.length, ...visibleBlocks);
      }
      console.info(`[figures] extracted ${figureImages.size} images`);
    } catch (error) {
      console.warn("[figures] extraction failed", error);
    }
  }

  if (overallConfidence(result.canonical) < 0.7) {
    const extra = await runOptionalEnrichers({
      native: result.native,
      pages,
      pdfBytes: input.file ? new Uint8Array(await input.file.arrayBuffer()) : undefined,
      canonical: result.canonical,
    });
    if (extra.length > 0) {
      result.canonical.nodes[0]?.evidence.push(...extra);
    }
  }

  return result;
}

export function extractFromPages(input: {
  pages: ExtractedPage[];
  paperId: string;
  filePath: string;
  fileHash: string;
  metadata: { title?: string; author?: string; pageCount: number };
  native?: NativeDocument;
  pageKind?: PageTextKind;
  previousBlocks?: PaperBlock[];
  regionEvidence?: StructuralRegionEvidence[];
}): ExtractAcademicPdfResult {
  const pageKind = input.pageKind ?? classifyDocument(input.pages);
  const native =
    input.native ??
    nativeDocumentFromExtracted(input.pages, input.metadata);
  const generic = generateGenericCandidates(input.pages);
  const detectorEvidence = evidenceFromPages(input.pages, {
    metadataTitle: input.metadata.title,
    metadataAuthor: input.metadata.author,
  });
  const detection = detectFormat(detectorEvidence);
  const applied = applyFormatHardRules(generic.candidates, detection);
  const generatedRegions = buildTableRegionEvidence(input.pages, applied.candidates);

  const canonical = resolveCanonicalDocument({
    candidates: applied.candidates,
    layouts: generic.layouts,
    blocks: generic.blocks,
    baseFontSize: generic.baseFontSize,
    detection,
    pageKind,
    pageCount: input.pages.length,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadataTitle: input.metadata.title,
    extraEvidence: [
      ...applied.evidence,
      ...input.pages.flatMap((page) => graphicsToExtractionEvidence(page.pageNumber, page.graphicsPrimitives ?? [])),
    ],
    regionEvidence: [...generatedRegions, ...(input.regionEvidence ?? [])],
  });

  const debugLayout = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_LAYOUT_DEBUG;
  if (debugLayout === "1") {
    console.info(
      "[reading-order] reconstructed paragraphs\n" +
        formatReadingOrderLog(generic.blocks)
    );
  }

  const projected = projectCanonicalToPaper({
    canonical,
    paperId: input.paperId,
    filePath: input.filePath,
    fileHash: input.fileHash,
    metadata: input.metadata,
    layoutBlocks: generic.blocks,
    layouts: generic.layouts,
    baseFontSize: generic.baseFontSize,
    previousBlocks: input.previousBlocks,
  });

  return {
    native,
    canonical,
    paper: { ...projected.paper, publication: projected.paper.publication ?? findVenue(input.pages), doi: projected.paper.doi ?? findDoi(input.pages) },
    sections: projected.sections,
    // Paragraphs interrupted by figures, tables, footnotes or page breaks are rejoined.
    blocks: reconcileTranslationWarnings(repairLineBreakHyphens(stitchParagraphContinuations(collapseTableCellRuns(dropDuplicateBylineRows(projected.blocks, projected.paper.authors ?? []), projected.sections), projected.sections))),
    layoutBlocks: generic.blocks,
    layouts: generic.layouts,
    pageKind,
  };
}

async function runOptionalEnrichers(
  context: ExtractionContext
): Promise<ExtractionEvidence[]> {
  const collected: ExtractionEvidence[] = [];
  for (const enricher of ENRICHERS) {
    if (enricher.id === "vision-ocr") continue;
    if (!enricher.shouldRun(context)) continue;
    collected.push(...(await enricher.extract(context)));
  }
  return collected;
}
