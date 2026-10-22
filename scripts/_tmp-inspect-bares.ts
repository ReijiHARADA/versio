import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const cases = [
  {
    f: "epmc-a-physiology-based-mathematical-model-of-the-re",
    nums: ["(16)", "(17)"],
  },
  {
    f: "epmc-a-theoretical-framework-for-brain-computer-inte",
    nums: ["(8)"],
  },
  {
    f: "epmc-an-integrated-explainable-ai-framework-with-cou",
    nums: ["(0)"],
  },
  {
    f: "epmc-application-of-artificial-intelligence-in-hepat",
    nums: ["(55)"],
  },
];

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = (await import("fs")).readdirSync(dir).filter((x) => x.endsWith(".pdf"));

for (const c of cases) {
  const f = files.find((x) => x.startsWith(c.f));
  if (!f) {
    console.log("MISSING", c.f);
    continue;
  }
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({
    pages,
    paperId: f,
    filePath: f,
    fileHash: f,
    metadata: { pageCount: pages.length },
  });
  const all = r.canonical.nodes;
  console.log("\n====", f.slice(0, 60));
  for (const num of c.nums) {
    const idx = all.findIndex((b) => (b.text || "").trim() === num);
    console.log("num", num, "idx", idx);
    if (idx < 0) continue;
    for (let j = Math.max(0, idx - 5); j <= Math.min(all.length - 1, idx + 2); j++) {
      const b = all[j]!;
      const bb = b.boundingBoxes?.[0];
      console.log(
        j,
        "p" + b.pageStart,
        b.role,
        bb ? `y=${bb.y.toFixed(1)} x=${bb.x.toFixed(1)} w=${bb.width.toFixed(1)}` : "nobb",
        JSON.stringify((b.text || "").replace(/\s+/g, " ").slice(0, 120)),
      );
    }
  }
}
