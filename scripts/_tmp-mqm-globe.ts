import fs from "fs";
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
const nodes = r.canonical.nodes;
console.log(
  "TITLE:",
  nodes.find((n) => n.role === "title")?.text,
);
console.log(
  "authors:",
  nodes
    .filter((n) => n.role === "author")
    .map((n) => n.text)
    .slice(0, 5),
);
console.log("--- page1 roles ---");
for (const n of nodes.filter((n) => n.pageStart === 1).slice(0, 40)) {
  console.log(
    JSON.stringify({
      role: n.role,
      y: n.boundingBoxes[0]?.y?.toFixed?.(0),
      text: (n.text || "").slice(0, 100),
    }),
  );
}
console.log("--- layout titles/authors ---");
const layout = r.layoutBlocks ?? [];
for (const b of layout.filter((x: { page?: number; role?: string }) => (x.page ?? 1) === 1).slice(0, 35)) {
  console.log(
    JSON.stringify({
      role: (b as { role?: string }).role,
      text: ((b as { text?: string }).text || "").slice(0, 90),
    }),
  );
}
