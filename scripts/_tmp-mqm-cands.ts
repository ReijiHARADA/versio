import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";
import { resolveTitle } from "../src/services/pdfExtraction/resolver/titleResolver.ts";

const f =
  "test-fixtures/real-papers/pending-pdfs/epmc-the-medicine-quality-monitoring-globe-a-public-health-intelligence-syste.pdf";
const pages = await extractPdfPages(f);
const { blocks } = reconstructDocument(pages);
console.log("--- layout p1 ---");
for (const b of blocks.filter((x) => x.page === 1).slice(0, 22)) {
  console.log(
    JSON.stringify({
      role: b.role,
      font: b.lines?.[0]?.fontSize,
      y: Math.round(b.y ?? 0),
      text: (b.text || "").slice(0, 110),
    }),
  );
}
const generic = generateGenericCandidates(pages);
const cands = generic.candidates;
console.log("--- high title scores ---");
for (const c of cands
  .filter((x) => (x.roleScores?.title ?? 0) >= 0.5 || x.role === "title")
  .slice(0, 20)) {
  console.log(
    JSON.stringify({
      role: c.role,
      ts: Number((c.roleScores?.title ?? 0).toFixed(2)),
      y: Math.round(c.boundingBoxes[0]?.y ?? 0),
      text: c.text.slice(0, 110),
    }),
  );
}
process.env.PDF_TITLE_DEBUG = "1";
const resolved = resolveTitle({ candidates: cands });
console.log("RESOLVED:", resolved.text);
