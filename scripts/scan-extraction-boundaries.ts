import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

/**
 * Triage-only scan for likely boundary contamination in cached real papers.
 * It deliberately reports candidates rather than relabeling anything; every
 * result needs native geometry/manual confirmation before a parser change.
 */
const pdfDir = path.resolve("test-data/real-papers");
const files = fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf"));
const findings: Array<{ id: string; affiliation: unknown[]; caption: unknown[]; figureInParagraph: unknown[]; embeddedStructuralMarker: unknown[] }> = [];

// Layout extraction has an opt-in human-readable trace that uses console.log.
// Keep the scanner's stdout machine-readable so callers can pipe it to JSON
// tools; preserve the trace on stderr for interactive diagnosis.
const stdoutLog = console.log;
console.log = (...args: unknown[]) => console.error(...args);

for (const file of files) {
  const pages = await extractPdfPages(path.join(pdfDir, file));
  const canonical = extractFromPages({
    pages,
    paperId: file,
    filePath: file,
    fileHash: file,
    metadata: { pageCount: pages.length },
  }).canonical;
  const affiliation = canonical.nodes
    .filter((node) => node.role === "affiliation" && ((node.text?.length ?? 0) > 180 || /[.!?]\s+[A-Z]/.test(node.text ?? "")))
    .map((node) => ({ role: node.role, text: node.text?.slice(0, 180), page: node.pageStart }));
  const caption = canonical.nodes
    .filter((node) => node.role === "figure_caption" && (node.text?.length ?? 0) > 300)
    .map((node) => ({ text: node.text?.slice(0, 180), page: node.pageStart }));
  const embeddedStructuralMarker = canonical.nodes
    .filter((node) => node.role === "paragraph" && /(?:^|\s)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(node.text ?? "") && /\S+\s+(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(node.text ?? ""))
    .map((node) => ({ text: node.text?.slice(0, 220), page: node.pageStart }));
  const figureInParagraph = canonical.nodes
    .filter((node) => node.role === "paragraph" && /(?:^|\s)(?:Fig(?:ure)?\.?\s*\d{1,3})\s*[:.]/i.test(node.text ?? ""))
    .map((node) => ({ text: node.text?.slice(0, 220), page: node.pageStart }));
  if (affiliation.length || caption.length || figureInParagraph.length || embeddedStructuralMarker.length) {
    findings.push({ id: file, affiliation, caption, figureInParagraph, embeddedStructuralMarker });
  }
}

console.log = stdoutLog;
process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
