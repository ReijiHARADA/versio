import fs from "fs";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs
  .readdirSync(dir)
  .find((x) => x.includes("development-and-psychometric-evaluation-of-the-ai"))!;
const pages = await extractPdfPages(`${dir}/${f}`);
const { candidates } = generateGenericCandidates(pages);
for (const c of candidates.filter((c) =>
  /TABLE\s*2|Dimension Interview/i.test(c.text),
)) {
  console.log(
    JSON.stringify({
      role: c.role,
      scores: c.roleScores,
      layout: c.layoutBlock.role,
      text: c.text.slice(0, 80),
    }),
  );
}
const r = extractFromPages({
  pages,
  paperId: f,
  filePath: f,
  fileHash: f,
  metadata: { pageCount: pages.length },
});
for (const n of r.canonical.nodes.filter((n) =>
  /TABLE\s*2|Dimension Interview/i.test(n.text || ""),
)) {
  console.log("CANON", n.role, (n.text || "").slice(0, 60), n.evidence?.slice(-1)?.[0]?.label);
}
