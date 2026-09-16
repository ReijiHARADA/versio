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

const overlapRatio = (box: { x: number; y: number; width: number; height: number }, image: { x: number; y: number; width: number; height: number }) => {
  const overlap = Math.max(0, Math.min(box.x + box.width, image.x + image.width) - Math.max(box.x, image.x)) *
    Math.max(0, Math.min(box.y + box.height, image.y + image.height) - Math.max(box.y, image.y));
  return overlap / Math.max(1, box.width * box.height);
};
const verticalGap = (box: { x: number; y: number; width: number; height: number }, image: { x: number; y: number; width: number; height: number }) => {
  const horizontal = box.x < image.x + image.width && image.x < box.x + box.width;
  if (!horizontal) return Number.POSITIVE_INFINITY;
  if (box.y + box.height < image.y) return image.y - (box.y + box.height);
  if (image.y + image.height < box.y) return box.y - (image.y + image.height);
  return 0;
};

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
  const pageImages = new Map(pages.map((page) => [page.pageNumber, page.imagePlacements ?? []]));
  const affiliation = canonical.nodes
    .filter((node) => node.role === "affiliation" && ((node.text?.length ?? 0) > 180 || /[.!?]\s+[A-Z]/.test(node.text ?? "")))
    .map((node) => ({ role: node.role, text: node.text?.slice(0, 180), page: node.pageStart, bbox: node.boundingBoxes[0], confidence: node.confidence }));
  const caption = canonical.nodes
    .filter((node) => node.role === "figure_caption" && (node.text?.length ?? 0) > 300)
    .map((node) => ({ text: node.text?.slice(0, 180), page: node.pageStart }));
  const embeddedStructuralMarker = canonical.nodes
    .filter((node) => node.role === "paragraph" && /(?:^|\s)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(node.text ?? "") && /\S+\s+(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions|(?:Fig(?:ure)?|Table)\.?\s*\d{1,3})\b/i.test(node.text ?? ""))
    .map((node) => ({ text: node.text?.slice(0, 220), page: node.pageStart, bbox: node.boundingBoxes[0], imageOverlap: Math.max(0, ...(pageImages.get(node.pageStart) ?? []).map((image) => overlapRatio(node.boundingBoxes[0], image))), nearestImageGap: Math.min(...(pageImages.get(node.pageStart) ?? []).map((image) => verticalGap(node.boundingBoxes[0], image)), Number.POSITIVE_INFINITY), confidence: node.confidence, evidence: node.evidence.map((entry) => entry.label) }));
  const figureInParagraph = canonical.nodes
    .filter((node) => node.role === "paragraph" && /(?:^|\s)(?:Fig(?:ure)?\.?\s*\d{1,3})\s*[:.]/i.test(node.text ?? ""))
    .map((node) => ({ text: node.text?.slice(0, 220), page: node.pageStart, bbox: node.boundingBoxes[0], imageOverlap: Math.max(0, ...(pageImages.get(node.pageStart) ?? []).map((image) => overlapRatio(node.boundingBoxes[0], image))), nearestImageGap: Math.min(...(pageImages.get(node.pageStart) ?? []).map((image) => verticalGap(node.boundingBoxes[0], image)), Number.POSITIVE_INFINITY), confidence: node.confidence, evidence: node.evidence.map((entry) => entry.label) }));
  if (affiliation.length || caption.length || figureInParagraph.length || embeddedStructuralMarker.length) {
    findings.push({ id: file, affiliation, caption, figureInParagraph, embeddedStructuralMarker });
  }
}

console.log = stdoutLog;
const payload = `${JSON.stringify(findings, null, 2)}\n`;
const outputArg = process.argv.find((arg) => arg.startsWith("--json-out="));
if (outputArg) {
  fs.writeFileSync(outputArg.slice("--json-out=".length), payload, "utf8");
} else {
  process.stdout.write(payload);
}
