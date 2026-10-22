import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("endometriosi"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
const eqs = r.canonical.nodes.filter((n) => n.role === "equation" || /^[≥≤=]/.test((n.text||"").trim()));
console.log("eq-like", eqs.length);
for (const b of eqs.slice(0, 12)) {
  console.log(b.role, JSON.stringify((b.text||"").replace(/\s+/g," ").slice(0,80)));
}
const orphan = r.canonical.nodes.filter((n) => n.role === "equation" && /^[≥≤∫∑]/.test((n.text||"").trim()) && (n.text||"").trim().length < 8);
console.log("orphanEq", orphan.map((n) => n.text));
