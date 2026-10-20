import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const f =
  "test-fixtures/real-papers/pending-pdfs/epmc-the-medicine-quality-monitoring-globe-a-public-health-intelligence-syste.pdf";
const pages = await extractPdfPages(f);
const r = extractFromPages({
  pages,
  paperId: path.basename(f),
  filePath: f,
  fileHash: "mqm",
  metadata: { pageCount: pages.length },
});

// Dump evidence on title node
const title = r.canonical.nodes.find((n) => n.role === "title");
console.log("title evidence:", JSON.stringify(title?.evidence?.slice(-5), null, 2));
console.log("paper.title:", r.paper.titleOriginal?.slice(0, 120));

// Show all title-ish layout blocks with font if available
const blocks = (r as { layout?: { blocks?: Array<Record<string, unknown>> } }).layout?.blocks;
console.log("has layout", Boolean(blocks));
