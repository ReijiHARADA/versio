import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const [file, ...needles] = process.argv.slice(2);
if (!file || needles.length === 0) {
  throw new Error("Usage: vite-node --script scripts/diagnose-role-candidates.ts <pdf> <text-prefix> [...]");
}

const pages = await extractPdfPages(path.resolve(file));
const generic = generateGenericCandidates(pages);
const projected = extractFromPages({
  pages,
  paperId: "diagnostic",
  filePath: file,
  fileHash: "diagnostic",
  metadata: { pageCount: pages.length },
});
for (const needle of needles) {
  const candidate = generic.candidates.find((item) => item.text?.includes(needle));
  const nativePage = candidate && pages.find((page) => page.pageNumber === candidate.pageStart);
  const nativeRows = (() => {
    if (!nativePage) return [];
    const rows: Array<typeof nativePage.textItems> = [];
    for (const item of [...nativePage.textItems].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.find((entry) => Math.abs(entry[0].y - item.y) <= Math.max(2.5, item.fontSize * 0.3));
      if (row) row.push(item);
      else rows.push([item]);
    }
    return rows.map((row) => {
      const left = Math.min(...row.map((item) => item.x));
      const right = Math.max(...row.map((item) => item.x + item.width));
      const leftItems = row.filter((item) => item.x + item.width <= nativePage.width * 0.5);
      const rightItems = row.filter((item) => item.x >= nativePage.width * 0.5);
      const gap = leftItems.length && rightItems.length
        ? Math.min(...rightItems.map((item) => item.x)) - Math.max(...leftItems.map((item) => item.x + item.width))
        : null;
      return {
        y: row[0].y,
        left,
        right,
        width: right - left,
        itemCount: row.length,
        gap,
        crossesMidpoint: row.some((item) => item.x < nativePage.width * 0.5 && item.x + item.width > nativePage.width * 0.5),
        text: row.map((item) => item.text).join(" "),
      };
    }).filter((row) => row.width > nativePage.width * 0.55);
  })();
  console.log(JSON.stringify({
    needle,
    candidate: candidate && {
      page: candidate.pageStart,
      role: candidate.role,
      confidence: candidate.confidence,
      text: candidate.text,
      bbox: candidate.boundingBoxes[0],
      layout: {
        role: candidate.layoutBlock.role,
        lineCount: candidate.layoutBlock.lines.length,
        lineItems: candidate.layoutBlock.lines.map((line) => line.items.length),
        spans: candidate.layoutBlock.lines.map((line) => line.items.map((item) => ({ text: item.text, x: item.x, width: item.width }))),
        rotations: candidate.layoutBlock.lines.flatMap((line) => line.items).map((item) => item.rotation),
      },
      scores: candidate.roleScores,
      evidence: candidate.evidence,
      nearby: generic.candidates
        .filter((other) => other.pageStart === candidate?.pageStart && other !== candidate)
        .filter((other) => Math.abs((other.boundingBoxes[0]?.y ?? 0) - (candidate.boundingBoxes[0]?.y ?? 0)) <= 120)
        .map((other) => ({ role: other.role, layoutRole: other.layoutBlock.role, text: other.text.slice(0, 120), bbox: other.boundingBoxes[0], scores: other.roleScores })),
    },
    pageLayout: candidate && generic.layouts.find((layout) => layout.page === candidate.pageStart),
    nativeBaseline: candidate && nativePage
      ?.textItems
      .filter((item) => Math.abs(item.y - (candidate.boundingBoxes[0]?.y ?? item.y)) <= Math.max(2, item.fontSize * 0.35))
      .sort((a, b) => a.x - b.x)
      .map((item) => ({ text: item.text, x: item.x, y: item.y, width: item.width, fontSize: item.fontSize, fontName: item.fontName })),
    nativeRowGeometry: nativeRows,
    canonical: projected.canonical.nodes.filter((node) => node.text?.includes(needle)).map((node) => ({ role: node.role, text: node.text, confidence: node.confidence, evidence: node.evidence })),
    blocks: projected.blocks.filter((block) => block.original?.includes(needle)).map((block) => ({ type: block.type, text: block.original, status: block.translationStatus, metadata: block.metadata })),
    tableRelations: projected.canonical.relations.filter((relation) => relation.kind === "CAPTION_OF").map((relation) => ({
      from: projected.canonical.nodes.find((node) => node.id === relation.from),
      to: projected.canonical.nodes.find((node) => node.id === relation.to),
    })),
  }, null, 2));
}
