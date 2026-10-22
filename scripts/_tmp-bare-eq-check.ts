import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const needles = [
  "compositional-neurosymbolic",
  "decentralized-rare-disease",
  "design-of-a-soft-robotic-endoscope",
  "development-and-external-validation-of-the-hch",
];

async function main() {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
  for (const needle of needles) {
    const match = files.find((f) => f.includes(needle));
    if (!match) {
      console.log("MISSING", needle);
      continue;
    }
    const pages = await extractPdfPages(path.join(dir, match));
    const result = extractFromPages({
      pages,
      paperId: match,
      filePath: match,
      fileHash: match,
      metadata: { pageCount: pages.length },
    });
    const bare = result.canonical.nodes.filter((n) => {
      if (n.role !== "paragraph") return false;
      const t = (n.text ?? "").trim();
      return /^\(\s*\d{1,2}[a-z]?\s*\)$/.test(t) || /^\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(t);
    });
    const eqs = result.canonical.nodes.filter((n) => n.role === "equation").slice(0, 6);
    console.log("\n===", match.slice(0, 60));
    console.log("bareEqPara", bare.map((b) => `p${b.pageStart} ${JSON.stringify(b.text)}`));
    console.log(
      "eq sample",
      eqs.map((e) => `p${e.pageStart} ${JSON.stringify((e.text ?? "").slice(0, 80))}`),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
