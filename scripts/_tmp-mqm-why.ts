import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";

const f =
  "test-fixtures/real-papers/pending-pdfs/epmc-the-medicine-quality-monitoring-globe-a-public-health-intelligence-syste.pdf";
const pages = await extractPdfPages(f);
const { candidates } = generateGenericCandidates(pages);
const t = candidates.find((c) => (c.roleScores?.title ?? 0) >= 0.85);
console.log("FULL TEXT:", JSON.stringify(t?.text));
console.log("role", t?.role, "ts", t?.roleScores?.title);
console.log("len", t?.text.length, "words", t?.text.split(/\s+/).length);

for (const c of candidates.filter((c) =>
  /Medicine Quality|collecting and curating|substandard Abstract|^Abstract$/i.test(c.text),
)) {
  console.log(
    JSON.stringify({
      role: c.role,
      ts: Number((c.roleScores?.title ?? 0).toFixed(2)),
      y: Math.round(c.boundingBoxes[0]?.y ?? 0),
      text: c.text.slice(0, 160),
    }),
  );
}
