import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";
import { extractAcademicPdf } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import type { PaperBlock } from "../src/types/paper.ts";

type AuditReport = { papers: Array<{ paper: { id: string; filename: string; title: string }; rows: Array<{ key: string; source: string; pageStart: number; sourceCategory: string; fallbackStage: string; fallbackReason?: string }> }> };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = process.argv[2] ?? "test-data/real-papers/reports/translation-audit-v59-heldout-9papers.json";
const audit = JSON.parse(fs.readFileSync(path.resolve(root, auditPath), "utf8")) as AuditReport;
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { pdfDir: string; papers: Array<{ id: string; filename: string }> };
const targets = audit.papers.flatMap((paper) => paper.rows
  .filter((row) => row.sourceCategory === "table-contamination" && row.fallbackStage === "pre-model")
  .map((row) => ({ paper, row })));
const grouped = new Map<string, typeof targets>();
for (const target of targets) grouped.set(target.paper.paper.id, [...(grouped.get(target.paper.paper.id) ?? []), target]);

const results = [];
for (const [paperId, items] of grouped) {
  const paper = items[0].paper.paper;
  const catalogPaper = catalog.papers.find((entry) => entry.id === paperId);
  if (!catalogPaper) continue;
  const pdfPath = path.join(root, catalog.pdfDir, catalogPaper.filename);
  const pages = await extractPdfPages(pdfPath);
  const generic = generateGenericCandidates(pages);
  const full = await extractAcademicPdf({
    paperId,
    filePath: pdfPath,
    fileHash: "heldout-table-diagnostic",
    pages,
    metadata: { title: paper.title, pageCount: pages.length },
    extractFigures: false,
  });
  for (const { row } of items) {
    const normalized = row.source.replace(/\s+/g, " ").trim();
    const candidate = generic.candidates
      .filter((entry) => entry.text.replace(/\s+/g, " ").trim() === normalized)
      .sort((a, b) => Math.abs(a.pageStart - row.pageStart) - Math.abs(b.pageStart - row.pageStart))[0];
    const projected = full.blocks
      .filter((block): block is PaperBlock => block.type === "paragraph")
      .filter((block) => block.original.replace(/\s+/g, " ").trim() === normalized)
      .sort((a, b) => Math.abs(a.pageStart - row.pageStart) - Math.abs(b.pageStart - row.pageStart))[0];
    const node = projected ? full.canonical.nodes.find((entry) => entry.id === projected.id) : undefined;
    results.push({
      key: row.key,
      paperId,
      requestedPage: row.pageStart,
      exactSourceMatch: Boolean(candidate && projected),
      candidate: candidate ? {
        pageStart: candidate.pageStart,
        role: candidate.role,
        roleScores: candidate.roleScores,
        bbox: candidate.layoutBlock.bbox,
        lines: candidate.layoutBlock.lines.map((line) => ({ text: line.text, x: line.x, y: line.y, width: line.width, itemCount: line.items.length })),
        evidence: candidate.evidence.map((entry) => ({ label: entry.label, confidence: entry.confidence, reason: entry.reason })),
      } : null,
      projected: projected ? {
        id: projected.id,
        pageStart: projected.pageStart,
        pageEnd: projected.pageEnd,
        status: projected.translationStatus,
        metadata: projected.metadata,
        canonicalRole: node?.role,
        confidence: node?.confidence,
        relations: full.canonical.relations.filter((relation) => relation.from === node?.id || relation.to === node?.id),
      } : null,
    });
  }
}
const outPath = path.resolve(root, "test-data/real-papers/reports/translation-audit-v59-table-source-diagnostic.json");
fs.writeFileSync(outPath, `${JSON.stringify({ version: "heldout-table-source-diagnostic-v1", auditPath, generatedAt: new Date().toISOString(), targets: results }, null, 2)}\n`);
console.log(JSON.stringify({ outPath, targets: results.length, exactMatches: results.filter((entry: any) => entry.exactSourceMatch).length }, null, 2));
