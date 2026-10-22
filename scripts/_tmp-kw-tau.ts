import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function dump(needle: string) {
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
  for (const n of result.canonical.nodes) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim();
    if (/^Keywords/i.test(t) || (n.role === "caption" && /FIGURE\s*3/i.test(t)) || /^\(\s*2\s*\)$/.test(t)) {
      console.log(
        n.role.padEnd(12),
        `p${n.pageStart}`,
        `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`,
        `x=${(n.boundingBoxes[0]?.x ?? 0).toFixed(1)}`,
        JSON.stringify(t.slice(0, 160)),
      );
    }
  }
  if (needle.includes("st-honet")) {
    const p = 4;
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === p)) {
      const t = (n.text ?? "").replace(/\s+/g, " ").trim();
      if (t.length > 120 && n.role === "paragraph") continue;
      console.log(n.role.padEnd(12), `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`, JSON.stringify(t.slice(0, 100)));
    }
  }
  if (needle.includes("tau-induced")) {
    const caps = result.canonical.nodes.filter((n) => /FIGURE\s*3/i.test(n.text ?? ""));
    const page = caps[0]?.pageStart;
    if (page != null) {
      for (const n of result.canonical.nodes.filter((x) => x.pageStart === page)) {
        const t = (n.text ?? "").replace(/\s+/g, " ").trim();
        if (/fig|FIGURE|3\.|legend|panel/i.test(t) && t.length < 200) {
          console.log(n.role.padEnd(12), `y=${(n.boundingBoxes[0]?.y ?? 0).toFixed(1)}`, JSON.stringify(t.slice(0, 140)));
        }
      }
    }
  }
}

async function main() {
  await dump("systematic-detection-of-predictive-gene-sets");
  await dump("tau-induced-increase-in-promoter");
  await dump("st-honet-spatio-temporal");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
