/**
 * Join the production audit rows back to canonical extraction geometry.
 * This intentionally does not call the translation server: attribution must
 * separate source integrity from model quality.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { pdfDir: string; papers: Array<{ id: string; title: string; filename: string }> };
const reportName = process.env.TRANSLATION_AUDIT_REPORT ?? "translation-audit.json";
const report = JSON.parse(fs.readFileSync(path.join(root, "test-data/real-papers/reports", reportName), "utf8")) as { papers: Array<{ paper: { id: string; title: string; filename: string }; rows: any[] }> };

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
function inferAttribution(row: any, matchCount: number, sourceIntegrity: any): { primary: string; secondary?: string; basis: string } {
  const reason = String(row.fallbackReason ?? "").toLowerCase();
  if (/(?:invariant|protected|citation|scientific|placeholder|identifier|measurement)/.test(reason)) {
    return { primary: "E", basis: "fallback reason identifies scientific/citation preservation or invariant failure" };
  }
  if (sourceIntegrity.status === "review" || matchCount !== 1) {
    return { primary: "D", basis: "source geometry or structure requires review before model attribution" };
  }
  if (matchCount === 1 && sourceIntegrity.status === "provisional-pass") {
    return { primary: "A", basis: "canonical source matches one coherent layout block; remaining fallback is model/quality candidate" };
  }
  return { primary: "G", basis: "insufficient evidence for layer attribution" };
}
const output: any[] = [];
const hypothesisByBlock: Record<string, { primary: string; secondary?: string; basis: string }> = {
  "significant-other/b-bb2064ca": { primary: "A", basis: "complete single-column ordinary prose; degenerate decode despite clean source" },
  "cognitive-psychology-gpt3/b-9c57b65a": { primary: "A", basis: "complete single-column ordinary prose; source fallback with no structural warning" },
  "interactive-jewellery/b-4d8fd90a": { primary: "A", basis: "complete ordinary prose; negation loss is decode/adequacy evidence" },
  "power-over-skin/b-eed74380": { primary: "E", basis: "scientific identifiers and unit invariant loss" },
  "thermal-earring/b-01a329cd": { primary: "A", basis: "ordinary single-page prose with no structural warning; server source fallback" },
  "dont-mind-me/b-fb4b663f": { primary: "E", basis: "unexpected year invariant in a scientific/reporting block" },
  "dont-mind-me/b-f55efe09": { primary: "A", basis: "ordinary prose; named identifier omission without structural warning" },
  "dont-mind-me/b-ea91ca56": { primary: "D", basis: "degenerate output on a mixed/list-like block; structure mixing requires geometry review" },
  "step-to-charge/b-f11f1c54": { primary: "E", basis: "technical identifiers missing from translation invariants" },
  "step-to-charge/b-e36ddef0": { primary: "A", basis: "complete ordinary prose; negation loss" },
  "cognitive-psychology-gpt3/b-8f2a6a49": { primary: "D", basis: "long prose block likely combines structural units; verify line geometry" },
  "cognitive-psychology-gpt3/b-5096fc7a": { primary: "A", basis: "complete single-column prose; no source-structure warning" },
  "cognitive-psychology-gpt3/b-b4ed26af": { primary: "D", basis: "numeric/list-like block produced degenerate output" },
  "linguistics-language-model-physics/b-30cd3318": { primary: "A", basis: "long ordinary prose with no structural warning; source fallback" },
  "linguistics-language-model-physics/b-ebe5dcc2": { primary: "A", basis: "matched block has one consistent reading-order column; source fallback remains model candidate" },
  "neuroscience-rule-following/b-9ba3fd27": { primary: "A", basis: "matched block has one consistent reading-order column; source fallback remains model candidate" },
  "neuroscience-rule-following/b-026d207e": { primary: "A", basis: "ordinary prose with no structural warning; source fallback" },
};

for (const entry of report.papers) {
  const failures = entry.rows.filter((row) => row.readerVisibleFallback && row.sourceCategory === "ordinary-body-prose");
  if (!failures.length) continue;
  const catalogPaper = catalog.papers.find((paper) => paper.id === entry.paper.id);
  const pdfPath = path.join(root, catalog.pdfDir, catalogPaper?.filename ?? entry.paper.filename);
  if (!fs.existsSync(pdfPath)) {
    output.push(...failures.map((row) => ({ paperId: entry.paper.id, ...row, attributionStatus: "pdf_missing" })));
    continue;
  }
  const pages = await extractPdfPages(pdfPath);
  const log = console.log;
  const info = console.info;
  const warn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  let extracted: Awaited<ReturnType<typeof extractFromPages>>;
  try {
    extracted = extractFromPages({ pages, paperId: `attribution-${entry.paper.id}`, filePath: pdfPath, fileHash: entry.paper.id, metadata: { title: entry.paper.title, pageCount: pages.length } });
  } finally {
    console.log = log;
    console.info = info;
    console.warn = warn;
  }
  for (const row of failures) {
    const matches = extracted.blocks.filter((block) => compact(block.original ?? "") === compact(row.source));
    const layoutMatches = extracted.layoutBlocks.filter((block) => compact(block.text ?? "") === compact(row.source));
    const matchedLines = layoutMatches[0]?.lines ?? [];
    const matchedColumns = [...new Set(matchedLines.map((line: any) => line.column))];
    const matchedListLines = matchedLines.filter((line: any) => /^(?:[-•‣∙]|\d+[.)])\s+/.test(line.text)).length;
    const startsContinuation = /^(?:and|or|but|to|of|for|where|which|that|one|exception)\b/i.test(row.source);
    const endsContinuation = /\b(?:and|or|but|to|of|for|where|which|that|one)\s*$/i.test(row.source);
    const sourceIntegrity = {
      status: matchedColumns.length > 1 || matchedListLines > 0 || startsContinuation || endsContinuation ? "review" : "provisional-pass",
      columnCount: matchedColumns.length,
      listLines: matchedListLines,
      startsContinuation,
      endsContinuation,
      pageSwitches: new Set(matchedLines.map((line: any) => line.page)).size - 1,
    };
    output.push({
      paperId: entry.paper.id,
      blockId: row.blockId,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      role: row.role,
      source: row.source,
      translation: row.translation,
      fallbackReason: row.fallbackReason,
      diagnostics: row.structuralWarnings,
      attribution: hypothesisByBlock[`${entry.paper.id}/${row.blockId}`] ?? inferAttribution(row, matches.length, sourceIntegrity),
      matchCount: matches.length,
      layoutMatchCount: layoutMatches.length,
      attributionStatus: matches.length === 1 ? "matched" : matches.length === 0 ? "unmatched" : "ambiguous",
      matches: matches.map((block) => ({
        pageStart: block.pageStart,
        pageEnd: block.pageEnd,
        bbox: layoutMatches[0]?.bbox,
        lineCount: layoutMatches[0]?.lines.length ?? 0,
        lines: (layoutMatches[0]?.lines ?? []).map((line) => ({
          text: compact(line.text),
          page: line.page,
          column: line.column,
          x: line.x,
          y: line.y,
          width: line.width,
          height: line.height,
        })),
      })),
    });
    const geometry = output[output.length - 1];
    geometry.sourceIntegrity = sourceIntegrity;
  }
}

const outPath = path.join(root, "test-data/real-papers/reports/translation-fallback-attribution.json");
fs.writeFileSync(outPath, `${JSON.stringify({ createdAt: new Date().toISOString(), sourceReport: reportName, failures: output }, null, 2)}\n`);
console.log(`wrote ${output.length} attribution rows to ${outPath}`);
