import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates";
import { buildTableRegionEvidence } from "../src/services/pdfExtraction/generic/tableRegions";

const root = "test-data/real-papers";
const files = (await readdir(root)).filter((file) => file.toLowerCase().endsWith(".pdf"));
const papers: Array<Record<string, unknown>> = [];
for (const file of files) {
  const oldLog = console.log;
  console.log = () => {};
  try {
    const pages = await extractPdfPages(path.join(root, file));
    const generic = generateGenericCandidates(pages);
    const regions = buildTableRegionEvidence(pages, generic.candidates);
    papers.push({ file, pages: pages.length, regions: regions.length, regionPages: regions.map((region) => region.pageStart), regionDetails: regions });
  } catch (error) {
    papers.push({ file, error: String(error) });
  } finally {
    console.log = oldLog;
  }
}
await mkdir(path.join(root, "reports"), { recursive: true });
await writeFile(path.join(root, "reports", "table-region-cohort-v1.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  paperCount: papers.length,
  papers,
  summary: {
    extractionErrors: papers.filter((paper) => "error" in paper).length,
    papersWithRegions: papers.filter((paper) => Number(paper.regions ?? 0) > 0).length,
    totalRegions: papers.reduce((sum, paper) => sum + Number(paper.regions ?? 0), 0),
    manualPrecisionStatus: "pending visual review",
  },
}, null, 2));
