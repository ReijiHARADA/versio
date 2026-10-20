import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import fs from "fs";
import path from "path";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-effect-of-simulation"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: "u",
  filePath: f,
  fileHash: "u",
  metadata: { pageCount: pages.length },
});
const p1 = r.canonical.nodes.filter((n) => (n.pageStart ?? 1) === 1);
const scrambled = p1.filter((n) => {
  const t = (n.text || "").replace(/\s+/g, " ");
  return (
    /quasi-\s*of complications|https:\/\/doi\.org\/10\.1136\/\s*study|bmjopen.*study with a pre/i.test(t) ||
    (n.role === "paragraph" && /Protected by copyright/i.test(t))
  );
});
console.log(
  JSON.stringify(
    {
      titleOk: /factors training among emergency/i.test(r.paper.titleOriginal || ""),
      nAuth: r.paper.authors.length,
      scrambled: scrambled.map((n) => ({
        role: n.role,
        t: (n.text || "").replace(/\s+/g, " ").trim().slice(0, 140),
      })),
      paragraphSample: p1
        .filter((n) => n.role === "paragraph")
        .slice(0, 8)
        .map((n) => (n.text || "").replace(/\s+/g, " ").trim().slice(0, 120)),
    },
    null,
    2,
  ),
);
