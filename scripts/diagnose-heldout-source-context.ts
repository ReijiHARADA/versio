import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = process.argv[2] ?? "test-data/real-papers/reports/translation-audit-v59-heldout-9papers.json";
const keyFilter = process.argv[3];
const audit = JSON.parse(fs.readFileSync(path.resolve(root, auditPath), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const entries = audit.papers.flatMap((paper: any) => paper.rows
  .filter((row: any) => !keyFilter || row.key === keyFilter)
  .map((row: any) => ({ paper: paper.paper, row })));
const diagnostics: any[] = [];

for (const { paper, row } of entries) {
  const catalogPaper = catalog.papers.find((candidate: any) => candidate.id === paper.id);
  if (!catalogPaper) continue;
  const pages = await extractPdfPages(path.join(root, catalog.pdfDir, catalogPaper.filename));
  const { candidates } = generateGenericCandidates(pages);
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const normalizedSource = normalize(row.source);
  const exactIndex = candidates.findIndex((candidate) => normalize(candidate.text) === normalizedSource);
  const containingIndex = candidates.findIndex((candidate) => normalize(candidate.text).includes(normalizedSource));
  const continuationIndex = candidates.findIndex((candidate) =>
    normalize(candidate.text).includes("story complexity") && normalize(candidate.text).includes("sound complexity")
  );
  const index = exactIndex >= 0 ? exactIndex : containingIndex >= 0 ? containingIndex : continuationIndex;
  if (index < 0) {
    diagnostics.push({ key: row.key, exactCandidateMatch: false, containingCandidateMatch: false });
    continue;
  }
  diagnostics.push({
    key: row.key,
    exactCandidateMatch: exactIndex >= 0,
    containingCandidateMatch: containingIndex >= 0,
    continuationCandidateMatch: continuationIndex >= 0,
    sourceCategory: row.sourceCategory,
    translationAccepted: !row.readerVisibleFallback,
    fallbackReason: row.fallbackReason,
    neighbors: candidates.slice(Math.max(0, index - 3), index + 4).map((candidate, neighborIndex) => ({
      relativeIndex: Math.max(0, index - 3) + neighborIndex - index,
      candidateRole: candidate.role,
      pageStart: candidate.pageStart,
      pageEnd: candidate.pageEnd,
      text: candidate.text,
      bbox: candidate.layoutBlock.bbox,
      lineGeometry: candidate.layoutBlock.lines.map((line) => ({
        text: line.text, x: line.x, y: line.y, width: line.width, height: line.height,
        nativeItemCount: line.items.length,
      })),
      scores: candidate.roleScores,
      evidence: candidate.evidence.map((item) => ({ label: item.label, confidence: item.confidence, reason: item.reason })),
    })),
  });
}
const outPath = path.resolve(root, "test-data/real-papers/reports/translation-audit-v59-source-context-diagnostic.json");
fs.writeFileSync(outPath, `${JSON.stringify({ version: "heldout-source-context-diagnostic-v1", auditPath, keyFilter: keyFilter ?? null, generatedAt: new Date().toISOString(), diagnostics }, null, 2)}\n`);
console.log(JSON.stringify({ outPath, targets: diagnostics.length, matches: diagnostics.filter((item) => item.exactCandidateMatch).length }, null, 2));
