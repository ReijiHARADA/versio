/** One isolated document run for the label-free validation/held-out health gate. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { hasSourceTextIntegrity, isEquationLine, isTableCaption, reconstructDocument } from "../src/services/pdfLayout.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

type CohortDocument = { id: string; pdfPath: string; fileHash: string };
type Cohort = { documents: CohortDocument[] };
const root = path.resolve(import.meta.dirname, "..");
const [id, cohortArg] = process.argv.slice(2);
if (!id || !cohortArg) throw new Error("Usage: audit-unlabeled-extraction-health-worker <id> <cohort-path>");
const cohortPath = path.resolve(root, cohortArg);
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8")) as Cohort;
const item = cohort.documents.find((document) => document.id === id);
if (!item) throw new Error(`Unknown cohort document: ${id}`);
const pdfPath = path.resolve(root, item.pdfPath);
if (!fs.existsSync(pdfPath)) throw new Error("Local PDF is unavailable.");
const fileHash = crypto.createHash("sha256").update(fs.readFileSync(pdfPath)).digest("hex");
if (fileHash !== item.fileHash) throw new Error("Local PDF hash does not match the frozen cohort manifest.");

const pages = await extractPdfPages(pdfPath);
const extract = () => extractFromPages({
  pages,
  paperId: `unlabeled-health-${id}`,
  filePath: pdfPath,
  fileHash,
  metadata: { pageCount: pages.length },
});
const first = extract();
const second = extract();

function fingerprint(result: typeof first): string {
  // Keep this to observable extraction output. Timestamps, file paths and
  // diagnostics that intentionally vary outside extraction semantics do not
  // participate in the determinism check.
  const visible = {
    canonical: result.canonical.nodes.map((node) => ({
      id: node.id, role: node.role, text: node.text, pageStart: node.pageStart,
      pageEnd: node.pageEnd, boxes: node.boundingBoxes, anchor: node.sourceAnchor,
    })),
    relations: result.canonical.relations,
    projection: result.blocks.map((block) => ({
      id: block.id, type: block.type, original: block.original, order: block.order,
      pageStart: block.pageStart, pageEnd: block.pageEnd, boxes: block.boundingBoxes,
      canonicalNodeId: block.metadata.canonicalNodeId,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(visible)).digest("hex");
}

const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
const nodeIds = new Set(first.canonical.nodes.map((node) => node.id));
const duplicateNodeIds = first.canonical.nodes.length - nodeIds.size;
const invalidBoxes = first.canonical.nodes.flatMap((node) => node.boundingBoxes.filter((box) => {
  const page = pageByNumber.get(box.page);
  return !page || !Number.isFinite(box.x) || !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) || !Number.isFinite(box.height) ||
    box.width <= 0 || box.height <= 0 || box.x < -1 || box.y < -1 ||
    box.x + box.width > page.width + 1 || box.y + box.height > page.height + 1;
}).map(() => node.id));
const provenanceFailures = first.canonical.nodes.filter((node) =>
  !Number.isFinite(node.sourceAnchor.page) || node.sourceAnchor.boundingBoxes.length === 0 ||
  node.boundingBoxes.length === 0 || node.pageStart > node.pageEnd ||
  !node.boundingBoxes.every((box) => box.page >= node.pageStart && box.page <= node.pageEnd),
).map((node) => node.id);
const relationFailures = first.canonical.relations.filter((relation) =>
  relation.from === relation.to || !nodeIds.has(relation.from) || !nodeIds.has(relation.to) ||
  !Number.isFinite(relation.score) || relation.score < 0 || relation.score > 1,
).map((relation) => `${relation.kind}:${relation.from}->${relation.to}`);
const projectionFailures = first.blocks.filter((block) => {
  const canonicalNodeId = block.metadata.canonicalNodeId;
  return typeof canonicalNodeId !== "string" || !nodeIds.has(canonicalNodeId);
}).map((block) => block.id);
const sourceIntegrityFailures = first.layoutBlocks.filter((block) => !hasSourceTextIntegrity(block)).map((block) => block.text.slice(0, 120));
// These are triage signals, not gold labels: native PDF text can contain
// decorative or incomplete fragments. They let autonomous work prioritize a
// strong raw formula/table anchor which did not make it to the corresponding
// Canonical role, without ever scoring it as an error or using it as gold.
const nativeLines = reconstructDocument(pages).lines;
const verticallyOverlaps = (line: { page: number; y: number; height: number }, box: { page: number; y: number; height: number }) =>
  line.page === box.page && Math.min(line.y + line.height, box.y + box.height) - Math.max(line.y, box.y) >= -Math.max(8, line.height * 1.5);
const strongEquationAnchor = (text: string): boolean => {
  if (!isEquationLine(text)) return false;
  // `±` is common in ordinary statistical prose and table rows. A label-free
  // triage signal must prefer precision: use an equation number, or a compact
  // relation expression, rather than treating every mean ± SD as a formula.
  const normalized = text.trim();
  if (/\(\s*\d{1,3}[a-z]?\s*\)\s*[.,;]?$/.test(normalized)) return true;
  const words = normalized.match(/[A-Za-z]{3,}/g) ?? [];
  // Table rules and decorative leaders can be extracted as `== ==`. Require
  // at least one semantic operand, never treating operator-only paint as a
  // missing formula candidate.
  const hasOperand = /[\p{L}\p{N}]/u.test(normalized);
  return hasOperand && /[=≡≈≤≥∈∉]/u.test(normalized) && words.length <= 5 && normalized.length <= 180;
};
const equationAnchors = nativeLines.filter((line) => strongEquationAnchor(line.text));
const tableCaptionAnchors = nativeLines.filter((line) => isTableCaption(line.text));
const suspectedMissingEquationAnchors = equationAnchors.filter((line) => !first.canonical.nodes.some((node) =>
  node.role === "equation" && node.boundingBoxes.some((box) => verticallyOverlaps(line, box)),
)).map((line) => ({ page: line.page, text: line.text.slice(0, 180) }));
const suspectedMissingTableCaptionAnchors = tableCaptionAnchors.filter((line) => !first.canonical.nodes.some((node) =>
  node.role === "caption" && node.boundingBoxes.some((box) => verticallyOverlaps(line, box)),
)).map((line) => ({ page: line.page, text: line.text.slice(0, 180) }));
const firstFingerprint = fingerprint(first);
const secondFingerprint = fingerprint(second);
const failures = {
  duplicateNodeIds, invalidBoxes, provenanceFailures, relationFailures,
  projectionFailures, sourceIntegrityFailures,
  nondeterministic: firstFingerprint !== secondFingerprint,
};
const healthy = duplicateNodeIds === 0 && invalidBoxes.length === 0 &&
  provenanceFailures.length === 0 && relationFailures.length === 0 &&
  projectionFailures.length === 0 && sourceIntegrityFailures.length === 0 &&
  !failures.nondeterministic;
console.log(JSON.stringify({
  id, fileHash, pageCount: pages.length, canonicalNodes: first.canonical.nodes.length,
  projectedBlocks: first.blocks.length, fingerprints: { first: firstFingerprint, second: secondFingerprint },
  triage: {
    nativeEquationAnchors: equationAnchors.length,
    suspectedMissingEquationAnchors,
    nativeTableCaptionAnchors: tableCaptionAnchors.length,
    suspectedMissingTableCaptionAnchors,
  },
  healthy, failures,
}));
