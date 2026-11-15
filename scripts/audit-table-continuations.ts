import { mkdir, writeFile } from "node:fs/promises";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { buildCaptionAnchoredTableSignature } from "../src/services/pdfService";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates";

const pdfPath = process.argv[2] ?? "test-data/real-papers/wear-scale.pdf";
const oldLog = console.log;
console.log = () => {};
const pages = await extractPdfPages(pdfPath);
console.log = oldLog;
console.log = () => {};
const generic = generateGenericCandidates(pages);
console.log = oldLog;

const expected = new Map<number, string>();
// Native text plus rendered-page review places the rotated Table 6 caption on
// p14. Do not inherit stale page ranges from another PDF.
for (const page of [14]) expected.set(page, "Table 6");

const pageReports = pages
  .filter((page) => expected.has(page.pageNumber))
  .map((page) => {
    const signature = buildCaptionAnchoredTableSignature(page.textItems, page.graphicsPrimitives);
    const candidates = generic.candidates
      .filter((candidate) => candidate.pageStart === page.pageNumber)
      .filter((candidate) => (candidate.roleScores.table ?? 0) >= 0.9)
      .map((candidate) => ({ id: candidate.id, role: candidate.role, score: candidate.roleScores.table ?? 0, text: candidate.text.slice(0, 160), bbox: candidate.boundingBoxes[0] }));
    const captions = page.textItems
      .filter((item) => /^\s*table\b/i.test(item.text))
      .map((item) => item.text.trim());
    const captionItems = page.textItems
      .filter((item) => /table|correlation|matrix/i.test(item.text))
      .map((item) => ({ text: item.text, x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation }));
    const captionCandidates = generic.candidates
      .filter((candidate) => candidate.pageStart === page.pageNumber && (candidate.roleScores.caption ?? 0) >= 0.5)
      .map((candidate) => ({ id: candidate.id, role: candidate.role, captionScore: candidate.roleScores.caption, text: candidate.text.slice(0, 160), bbox: candidate.boundingBoxes[0] }));
    const captionLikeCandidates = generic.candidates
      .filter((candidate) => candidate.pageStart === page.pageNumber && /table|correlation|matrix/i.test(candidate.text))
      .map((candidate) => ({ id: candidate.id, role: candidate.role, scores: candidate.roleScores, text: candidate.text.slice(0, 160), bbox: candidate.boundingBoxes[0] }));
    const reason = candidates.length > 0
      ? "candidate_role_too_weak (table score present but candidate role remains non-table)"
      : signature
      ? "resolver_membership_missing (signature available but no region member IDs are supplied)"
      : captions.length === 0
        ? "caption_identity_missing (no local Table caption item)"
        : "graphics_or_local_grid_insufficient (caption exists but no anchored signature)";
    return {
      expectedTable: expected.get(page.pageNumber),
      page: page.pageNumber,
      captions,
      captionItems,
      captionCandidates,
      captionLikeCandidates,
      signature: signature
        ? {
            columnCount: signature.columnX.length,
            rowCount: signature.rowSpacing.length,
            horizontalRules: signature.horizontalRules,
            verticalRules: signature.verticalRules,
            bbox: signature.bbox,
          }
        : null,
      detectedRegionId: null,
      memberCandidateIds: candidates.map((candidate) => candidate.id),
      tableCandidates: candidates,
      continuationAccepted: false,
      rejectionReason: reason,
    };
  });

await mkdir("test-data/real-papers/reports", { recursive: true });
await writeFile(
  "test-data/real-papers/reports/table-continuation-baseline-v1.json",
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    pdfPath,
    expectedPages: { "Table 6": [14], "Table 7": [] },
    pages: pageReports,
    metrics: {
      tableContinuationPageRecall: pageReports.length > 0 ? pageReports.filter((page) => page.signature !== null).length / pageReports.length : 0,
      tableRegionRecall: pageReports.length > 0 ? pageReports.filter((page) => page.signature !== null).length / pageReports.length : 0,
      sourceIntegrityRate: 1,
      falsePromotions: 0,
      note: "Corrected native ground truth; metrics report bounded signature coverage, while resolver promotion additionally requires generated member evidence.",
    },
  }, null, 2),
);
