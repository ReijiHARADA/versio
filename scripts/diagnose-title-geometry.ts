import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";
import { generateGenericCandidates } from "../src/services/pdfExtraction/generic/candidates";

const args = process.argv.slice(2);
const paperIndex = args.indexOf("--paper");
const paperId = paperIndex >= 0 ? args[paperIndex + 1] : undefined;
if (!paperId) throw new Error("usage: diagnose-title-geometry --paper <catalog-id> [--output <path>]");
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const root = path.resolve(".");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { pdfDir: string; papers: Array<{ id: string; filename: string; title: string }> };
const paper = catalog.papers.find((entry) => entry.id === paperId);
if (!paper) throw new Error(`paper not found: ${paperId}`);
const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
const pages = await extractPdfPages(pdfPath);
const layout = reconstructDocument(pages);
const generic = generateGenericCandidates(pages);
const page = pages[0];
const pageBlocks = layout.blocks.filter((block) => block.pageStart === 1);
const pageCandidates = generic.candidates.filter((candidate) => candidate.pageStart === 1);
const result = {
  version: "title-geometry-diagnostic-v1",
  paper: { id: paper.id, expectedTitle: paper.title, pdf: paper.filename },
  page: { number: page?.pageNumber, width: page?.width, height: page?.height },
  nativeLines: (page?.textItems ?? []).map((item) => ({
    text: item.text,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    fontSize: item.fontSize,
    fontName: item.fontName,
  })).sort((a, b) => a.y - b.y || a.x - b.x),
  blocks: pageBlocks.map((block) => ({
    role: block.role,
    text: block.text,
    x: block.bbox.x,
    y: block.bbox.y,
    width: block.bbox.width,
    height: block.bbox.height,
    column: block.column,
    lines: block.lines.length,
  })),
  candidates: pageCandidates.map((candidate) => ({
    role: candidate.role,
    text: candidate.text,
    x: candidate.layoutBlock.bbox.x,
    y: candidate.layoutBlock.bbox.y,
    width: candidate.layoutBlock.bbox.width,
    height: candidate.layoutBlock.bbox.height,
    column: candidate.column,
    confidence: candidate.confidence,
    roleScores: candidate.roleScores,
    evidence: candidate.evidence,
    style: candidate.style,
  })),
};
const serialized = JSON.stringify(result, null, 2) + "\n";
if (outputPath) fs.writeFileSync(path.resolve(outputPath), serialized);
else console.log(serialized);
