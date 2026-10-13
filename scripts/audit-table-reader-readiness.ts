import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { figureImageRect } from "../src/services/pdfLayout";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import type { PaperBlock } from "../src/types/paper";
import { attachLinesToBlocks } from "../src/data/package/layoutFromExtraction";
import { suppressImageBackedTableFragments } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const root = "test-data/real-papers";
const reportDir = path.join(root, "reports");
const files = (await readdir(root)).filter((file) => file.toLowerCase().endsWith(".pdf"));

type Bounds = { page: number; left: number; right: number; top: number; bottom: number };

function bounds(block: PaperBlock): Bounds | null {
  const first = block.boundingBoxes[0];
  if (!first) return null;
  const boxes = block.boundingBoxes.filter((box) => box.page === first.page);
  return {
    page: first.page,
    left: Math.min(...boxes.map((box) => box.x)),
    right: Math.max(...boxes.map((box) => box.x + box.width)),
    top: Math.min(...boxes.map((box) => box.y)),
    bottom: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

function isNumberedTableCaption(block: PaperBlock): boolean {
  const caption = String(block.metadata.captionOriginal ?? block.original ?? "");
  return block.type === "table" && /^\s*(?:table|表)\s*\d+/i.test(caption);
}

function isRawTableFragment(block: PaperBlock): boolean {
  if (block.type !== "table" || isNumberedTableCaption(block)) return false;
  const metadata = block.metadata as {
    figureKey?: string;
    tableSourceFallback?: boolean;
    evidence?: Array<{ label?: string }>;
  };
  return metadata.figureKey?.startsWith("table-region-") ||
    metadata.tableSourceFallback === true ||
    metadata.evidence?.some((entry) => entry.label === "table-region-member") === true;
}

function ownedByCaption(fragment: PaperBlock, caption: PaperBlock): boolean {
  const fragmentBox = bounds(fragment);
  const captionBox = bounds(caption);
  if (!fragmentBox || !captionBox || fragmentBox.page !== captionBox.page) return false;
  const fragmentColumn = String(fragment.metadata.column ?? "");
  const captionColumn = String(caption.metadata.column ?? "");
  if (fragmentColumn && captionColumn && fragmentColumn !== captionColumn) return false;
  const overlaps = fragmentBox.left < captionBox.right && captionBox.left < fragmentBox.right;
  const closeAbove = fragmentBox.bottom <= captionBox.top + 6 && captionBox.top - fragmentBox.bottom <= 300;
  const closeBelow = fragmentBox.top >= captionBox.bottom - 6 && fragmentBox.top - captionBox.bottom <= 300;
  return overlaps && (closeAbove || closeBelow);
}

/**
 * Audit-only reader triage. These labels intentionally do not change the
 * resolver: their purpose is to distinguish genuine unreadable table streams
 * from prose/chart/equation false positives before changing production rules.
 */
function readerFragmentKind(block: PaperBlock): "structured-grid" | "numeric-grid" | "prose-like" | "short-label" | "ambiguous" {
  const rows = (block.metadata as { tableRows?: unknown }).tableRows;
  if (Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length >= 2)) {
    return "structured-grid";
  }
  const text = (block.original ?? "").trim();
  const tokens = text.match(/\S+/g) ?? [];
  const numericTokens = tokens.filter((token) => /\d/.test(token)).length;
  const wordTokens = tokens.filter((token) => /[A-Za-z]{3,}/.test(token)).length;
  const sentenceEnd = /[.!?](?:\s|$)/.test(text);
  if (tokens.length >= 6 && numericTokens >= 3 && numericTokens / tokens.length >= 0.28) {
    return "numeric-grid";
  }
  if (tokens.length >= 10 && wordTokens / tokens.length >= 0.55 && sentenceEnd) {
    return "prose-like";
  }
  if (tokens.length <= 5) return "short-label";
  return "ambiguous";
}

const papers: Array<Record<string, unknown>> = [];
for (const file of files) {
  const filePath = path.join(root, file);
  const oldLog = console.log;
  console.log = () => {};
  try {
    const pages = await extractPdfPages(filePath);
    const extracted = extractFromPages({
      pages,
      paperId: `table-reader-readiness-${file}`,
      filePath,
      fileHash: file,
      metadata: { pageCount: pages.length },
    });
    const captions = extracted.blocks.filter(isNumberedTableCaption);
    const cropReadyCaptionIds = new Set(
      captions
        .filter((caption) => {
          const layout = extracted.layouts.find((item) => item.page === caption.pageStart);
          const layoutBlock = extracted.layoutBlocks.find((item) =>
            item.pageStart === caption.pageStart &&
            item.text === (caption.metadata.captionOriginal ?? caption.original));
          return Boolean(layout && layoutBlock && figureImageRect(layoutBlock, extracted.layoutBlocks, layout));
        })
        .map((caption) => caption.id)
    );
    const fragments = extracted.blocks.filter(isRawTableFragment);
    const orphanFragments = fragments.filter((fragment) => !captions.some((caption) => ownedByCaption(fragment, caption)));
    const cropBackedFragments = fragments.filter((fragment) => captions.some((caption) =>
      cropReadyCaptionIds.has(caption.id) && ownedByCaption(fragment, caption)
    ));
    // Model the exact reader boundary after a successful image render: only
    // crop-ready captions receive an image URL, then suppression runs. This
    // keeps the audit honest about what readers can see without claiming that
    // every detected table is a complete grid.
    const withCropArtifacts = extracted.blocks.map((block) =>
      cropReadyCaptionIds.has(block.id)
        ? { ...block, metadata: { ...block.metadata, imageUrl: "assets/audit-crop.png" } }
        : block
    );
    const readerBlocks = attachLinesToBlocks(
      suppressImageBackedTableFragments(withCropArtifacts),
      extracted.layoutBlocks
    );
    const readerRawFragments = readerBlocks.filter(isRawTableFragment);
    const readerCellFallbacks = readerRawFragments.filter((block) => {
      const rows = (block.metadata as { tableRows?: unknown }).tableRows;
      return Array.isArray(rows) && rows.some((row) => Array.isArray(row) && row.length >= 2);
    });
    const readerFragmentKinds = readerRawFragments.reduce<Record<string, number>>((counts, block) => {
      const kind = readerFragmentKind(block);
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {});
    papers.push({
      file,
      tableCaptions: captions.length,
      cropReadyCaptions: cropReadyCaptionIds.size,
      rawTableFragments: fragments.length,
      cropBackedFragments: cropBackedFragments.length,
      readerRawFragments: readerRawFragments.length,
      readerCellFallbacks: readerCellFallbacks.length,
      readerFragmentKinds,
      orphanFragments: orphanFragments.map((block) => ({ page: block.pageStart, text: block.original?.slice(0, 180) })),
    });
  } catch (error) {
    papers.push({ file, error: error instanceof Error ? error.message : String(error) });
  } finally {
    console.log = oldLog;
  }
}

const successful = papers.filter((paper) => !("error" in paper));
const number = (key: string) => successful.reduce((sum, paper) => sum + Number(paper[key] ?? 0), 0);
const readerFragmentKinds = successful.reduce<Record<string, number>>((counts, paper) => {
  const kinds = paper.readerFragmentKinds as Record<string, number> | undefined;
  for (const [kind, count] of Object.entries(kinds ?? {})) counts[kind] = (counts[kind] ?? 0) + count;
  return counts;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  paperCount: files.length,
  papers,
  summary: {
    extractionErrors: papers.length - successful.length,
    papersWithTableCaptions: successful.filter((paper) => Number(paper.tableCaptions ?? 0) > 0).length,
    tableCaptions: number("tableCaptions"),
    cropReadyCaptions: number("cropReadyCaptions"),
    rawTableFragments: number("rawTableFragments"),
    cropBackedFragments: number("cropBackedFragments"),
    readerRawFragments: number("readerRawFragments"),
    readerCellFallbacks: number("readerCellFallbacks"),
    readerFragmentKinds,
    orphanFragments: successful.reduce((sum, paper) => sum + ((paper.orphanFragments as unknown[])?.length ?? 0), 0),
    note: "Crop readiness is a geometry diagnostic. readerRawFragments simulates suppression only after a successful caption crop; readerCellFallbacks are native same-baseline rows retained for a readable source-only grid, not a claim of fully reconstructed table semantics. readerFragmentKinds is audit-only triage and does not change resolver behavior.",
  },
};

await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, "table-reader-readiness-v1.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
