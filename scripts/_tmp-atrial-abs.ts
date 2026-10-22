import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs.readdirSync(dir).find((f) => f.includes("atrial-fibrillation-and-retinal"));
  if (!match) throw new Error("missing");
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: "atrial",
    filePath: match,
    fileHash: "atrial",
    metadata: { pageCount: pages.length },
  });
  console.log("authors count", result.paper.authors?.length, result.paper.authors);
  console.log("abs nodes", result.canonical.nodes.filter((n) => n.role === "abstract").map((n) => (n.text ?? "").slice(0, 100)));
  for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1)) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim();
    if (/abstract|We investigate|investigate the association/i.test(t)) {
      console.log(n.role.padEnd(12), `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`, JSON.stringify(t.slice(0, 180)));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
