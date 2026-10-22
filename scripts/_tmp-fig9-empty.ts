import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs
    .readdirSync(dir)
    .find((f) => f.includes("panoramic-view-of-personalization"));
  if (!match) throw new Error("missing");
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: "pan",
    filePath: match,
    fileHash: "pan",
    metadata: { pageCount: pages.length },
  });
  const caps = result.canonical.nodes.filter(
    (n) => n.role === "caption" && /FIGURE\s*9|Fig(?:ure)?\s*9/i.test(n.text ?? ""),
  );
  for (const c of caps) {
    console.log("cap", `p${c.pageStart}`, JSON.stringify(c.text), c.boundingBoxes[0]);
  }
  const near = result.canonical.nodes.filter((n) => n.pageStart === (caps[0]?.pageStart ?? -1));
  for (const n of near) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim();
    if (/fig|FIGURE|9/i.test(t) && t.length < 200) {
      console.log(n.role.padEnd(12), JSON.stringify(t.slice(0, 160)));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
