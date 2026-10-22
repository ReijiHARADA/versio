import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs
    .readdirSync(dir)
    .find((f) => f.includes("design-of-a-soft-robotic-endoscope"));
  if (!match) throw new Error("missing");
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: "endo",
    filePath: match,
    fileHash: "endo",
    metadata: { pageCount: pages.length },
  });
  const page = 11;
  const nodes = result.canonical.nodes.filter((n) => n.pageStart === page);
  for (const n of nodes) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim();
    if (t.length > 180) continue;
    console.log(
      n.role.padEnd(12),
      `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`.padEnd(10),
      `x=${(n.boundingBoxes[0]?.x ?? 0).toFixed(1)}`.padEnd(10),
      JSON.stringify(t),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
