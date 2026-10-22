import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function dump(needle: string, fig: string) {
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
  console.log("\n===", match.slice(0, 64));
  const caps = result.canonical.nodes.filter(
    (n) => n.role === "caption" && new RegExp(fig, "i").test(n.text ?? ""),
  );
  for (const c of caps) {
    console.log("CAP", `p${c.pageStart}`, JSON.stringify(c.text), c.boundingBoxes[0]);
    const page = c.pageStart;
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === page)) {
      const t = (n.text ?? "").replace(/\s+/g, " ").trim();
      const y = n.boundingBoxes[0]?.y ?? 0;
      if (Math.abs(y - (c.boundingBoxes[0]?.y ?? 0)) > 80) continue;
      console.log(
        " ",
        n.role.padEnd(10),
        `y=${y.toFixed(1)}`,
        JSON.stringify(t.slice(0, 120)),
      );
    }
  }
  if (needle.includes("dual-pathway")) {
    console.log("abs?", result.canonical.nodes.some((n) => n.role === "abstract"));
    for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1).slice(0, 30)) {
      console.log(n.role.padEnd(12), JSON.stringify((n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120)));
    }
  }
}

async function main() {
  await dump("diffusion-tensor-image-analysis-along-the-periv", "FIGURE\\s*2");
  await dump("dissecting-neuronal-circuit-function", "FIGURE\\s*3");
  await dump("toward-a-dual-pathway-model-of-neuroplastic", "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
