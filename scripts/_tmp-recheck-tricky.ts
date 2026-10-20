import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const needles = [
  "advanced-security-framework-for-5g",
  "epmc-effect-of-simulation",
  "quasi-experimental-evaluation",
  "correction-evaluating-the-real-world",
];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));

for (const needle of needles) {
  const f = files.find((x) => x.includes(needle));
  if (!f) {
    console.log("MISSING", needle);
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
  const paras = r.canonical.nodes.filter((n) => n.role === "paragraph");
  const scramble = paras.filter((n) =>
    /quasi-\s*of complications|Protected by copyright|doi\.org\/10\.\d+\/\s+\w/i.test(n.text || ""),
  ).length;
  console.log(
    JSON.stringify({
      f: f.slice(0, 70),
      title: (r.paper.titleOriginal || "").slice(0, 90),
      nAuth: r.paper.authors?.length ?? 0,
      hasAbs: Boolean((r.paper.abstract || "").trim()),
      scramble,
    }),
  );
}
