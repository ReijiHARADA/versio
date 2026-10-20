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

const paras = r.canonical.nodes.filter((n) => n.role === "paragraph");
const bad = paras.filter((n) => {
  const t = (n.text || "").replace(/\s+/g, " ");
  return (
    /quasi-\s*of complications|https:\/\/doi\.org\/10\.1136\/\s*study|Protected by copyright/i.test(t) ||
    /bmjopen-\d+.*providers working/i.test(t) ||
    /Prepublication history providers/i.test(t)
  );
});
const titleFrags = paras.filter((n) => {
  const t = (n.text || "").trim();
  return /^(?:experimental pre-|protocol for a quasi-|simulation-based human|factors training among)$/i.test(t);
});
const intro = paras.find((n) => /Up to 40% of major complications/i.test(n.text || ""));
const methods = paras.find((n) => /quasi-\s*experimental study with a pre/i.test(n.text || ""));

console.log(
  JSON.stringify(
    {
      title: r.paper.titleOriginal,
      nAuth: r.paper.authors.length,
      badScrambles: bad.map((n) => (n.text || "").replace(/\s+/g, " ").slice(0, 120)),
      titleFragParas: titleFrags.map((n) => n.text),
      introOk: Boolean(intro && !/To cite|bmjopen|Protected/i.test(intro.text || "")),
      introHead: (intro?.text || "").replace(/\s+/g, " ").slice(0, 160),
      methodsOk: Boolean(methods && !/doi\.org\/10\.1136\/\s*study/i.test(methods.text || "")),
      methodsHead: (methods?.text || "").replace(/\s+/g, " ").slice(0, 160),
      copyrightParas: paras.filter((n) => /Protected by copyright/i.test(n.text || "")).length,
    },
    null,
    2,
  ),
);
