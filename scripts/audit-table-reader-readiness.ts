import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { figureImageRect } from "../src/services/pdfLayout";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import type { PaperBlock } from "../src/types/paper";

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
    papers.push({
      file,
      tableCaptions: captions.length,
      cropReadyCaptions: cropReadyCaptionIds.size,
      rawTableFragments: fragments.length,
      cropBackedFragments: cropBackedFragments.length,
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
    orphanFragments: successful.reduce((sum, paper) => sum + ((paper.orphanFragments as unknown[])?.length ?? 0), 0),
    note: "Crop readiness is a geometry diagnostic. It does not claim visual accuracy; crop-backed fragments are suppressed only in the actual import path after image rendering succeeds.",
  },
};

await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, "table-reader-readiness-v1.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
