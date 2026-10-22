import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-dissecting-neuronal"));
if (!f) throw new Error("missing pdf");
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const caps = r.canonical.nodes.filter(
  (n) => n.role === "caption" && /FIGURE\s*2/i.test(n.text || ""),
);
for (const c of caps) console.log(JSON.stringify((c.text || "").replace(/\s+/g, " ").slice(0, 160)));
const bare = r.canonical.nodes.filter(
  (n) =>
    n.role === "caption" &&
    /^(?:FIGURE|Fig\.?|Table|Figure)\s*\d+\s*$/i.test((n.text || "").trim()),
);
console.log("bareCaps", bare.map((b) => (b.text || "").trim()));
