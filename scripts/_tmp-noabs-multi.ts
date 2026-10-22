import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs
    .readdirSync(dir)
    .find((f) => f.includes("multimodal-dataset-for-socially-aware"));
  if (!match) throw new Error("missing");
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: "mm",
    filePath: match,
    fileHash: "mm",
    metadata: { pageCount: pages.length },
  });
  console.log("authors", result.paper.authors);
  console.log("title", result.paper.title);
  console.log("abstract?", result.canonical.nodes.some((n) => n.role === "abstract"));
  for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1).slice(0, 35)) {
    console.log(n.role.padEnd(12), JSON.stringify((n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140)));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
