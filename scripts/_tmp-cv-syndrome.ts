import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs.readdirSync(dir).find((f) => f.includes("computer-vision-syndrome-and-ergonomic"));
  if (!match) throw new Error("missing pdf");
  const pdf = path.join(dir, match);
  const pages = await extractPdfPages(pdf);
  const result = extractFromPages({
    pages,
    paperId: "cvs",
    filePath: pdf,
    fileHash: "cvs",
    metadata: { pageCount: pages.length },
  });
  console.log("authors", result.paper.authors);
  console.log("affils", result.paper.affiliations?.slice(0, 8));
  for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1).slice(0, 50)) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    console.log(n.role.padEnd(12), JSON.stringify(t));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
