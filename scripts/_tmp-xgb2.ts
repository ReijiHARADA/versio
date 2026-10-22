import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("xgboost-based-predictive"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
const abs = r.canonical.nodes.filter((n) => n.role === "abstract");
for (const n of abs) {
  const t = (n.text||"").replace(/\s+/g," ").trim();
  const y = n.boundingBoxes[0]?.y;
  console.log({ y, len: t.length, t: t.slice(0, 200), commas: (t.match(/,/g)||[]).length });
  const numberedLead = /^[A-Z][\p{L}.''’-]+(?:\s+[A-Z][\p{L}.''’-]*){1,5}\s*\d/u.test(t);
  console.log("numberedLead", numberedLead);
}
console.log("all authors role", r.canonical.nodes.filter(n=>n.role==="author").map(n=>n.text?.slice(0,80)));
