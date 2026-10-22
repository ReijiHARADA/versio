import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs.readdirSync(dir).find((f) => f.includes("a-novel-ivn-entropy-based"));
  if (!match) throw new Error("missing");
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: "ivn",
    filePath: match,
    fileHash: "ivn",
    metadata: { pageCount: pages.length },
  });
  for (const p of [14, 15]) {
    console.log("\n=== page", p);
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === p)) {
      const t = (n.text ?? "").replace(/\s+/g, " ").trim();
      if (t.length > 100 && n.role === "paragraph") continue;
      if (
        n.role === "equation" ||
        n.role === "caption" ||
        /^\(\s*\d/.test(t) ||
        /[=∑∫∈]/.test(t) ||
        t.length < 60
      ) {
        console.log(
          n.role.padEnd(12),
          `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`,
          `x=${(n.boundingBoxes[0]?.x ?? 0).toFixed(1)}`,
          JSON.stringify(t.slice(0, 100)),
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
