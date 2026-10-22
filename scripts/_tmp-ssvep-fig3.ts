import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function dump(needle: string, pageFocus?: number) {
  const dir = "test-fixtures/real-papers/pending-pdfs";
  const match = fs.readdirSync(dir).find((f) => f.includes(needle));
  if (!match) {
    console.log("MISSING", needle);
    return;
  }
  const pages = await extractPdfPages(path.join(dir, match));
  const result = extractFromPages({
    pages,
    paperId: needle,
    filePath: match,
    fileHash: needle,
    metadata: { pageCount: pages.length },
  });
  console.log("\n===", match.slice(0, 70));
  console.log("authors", result.paper.authors?.slice(0, 6));
  console.log("abs?", result.canonical.nodes.some((n) => n.role === "abstract"));
  const pagesToShow = pageFocus
    ? [pageFocus]
    : [...new Set(result.canonical.nodes.filter((n) => n.role === "caption" && /FIGURE\s*3/i.test(n.text ?? "")).map((n) => n.pageStart))];
  for (const p of pagesToShow) {
    console.log("--- page", p);
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === p)) {
      const t = (n.text ?? "").replace(/\s+/g, " ").trim();
      if (t.length > 160 && n.role === "paragraph") continue;
      if (/fig|FIGURE|table|TABLE|^\(\s*\d/i.test(t) || n.role === "caption" || n.role === "equation" || n.role === "abstract" || n.role === "heading") {
        console.log(n.role.padEnd(12), `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`, JSON.stringify(t.slice(0, 140)));
      }
    }
  }
  if (!pageFocus) {
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1).slice(0, 25)) {
      console.log("p1", n.role.padEnd(12), JSON.stringify((n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120)));
    }
  }
}

async function main() {
  await dump("comparative-study-of-ssvep-characteristics");
  await dump("atrial-fibrillation-and-retinal");
  await dump("brain-inspired-cognitive-state-modeling", 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
