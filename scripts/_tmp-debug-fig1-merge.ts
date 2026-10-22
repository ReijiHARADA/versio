import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { mergeFigureCaptionContinuations } from "../src/services/pdfExtraction/resolver/documentResolver";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("epmc-structural-and-functional"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
const all = r.canonical.nodes;
const idx = all.findIndex(
  (b) => b.role === "caption" && /^FIGURE\s*1\s*$/i.test((b.text || "").trim()),
);
const cap = all[idx]!;
const next = all[idx + 1]!;
console.log("cap", JSON.stringify(cap.text), cap.boundingBoxes[0]);
console.log("next", next.role, next.text?.length, JSON.stringify(next.text?.slice(0, 200)));
console.log("next words", (next.text || "").split(/\s+/).filter(Boolean).length);
console.log("next bb", next.boundingBoxes[0]);
const gap =
  next.boundingBoxes[0]!.y -
  (cap.boundingBoxes[0]!.y + cap.boundingBoxes[0]!.height);
console.log("gap", gap);

const rem = mergeFigureCaptionContinuations([cap, next]);
console.log("remege len", rem.length, rem[0]?.text?.slice(0, 100));
