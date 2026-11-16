/**
 * Compare reference-segmenter feature rows with GROBID's own (local only).
 *
 *   java -jar grobid-core-0.9.1-onejar.jar -gH grobid-home -dIn <pdfs> -dOut <dir> -exe createTraining
 *   npx vite-node --script scripts/crf-segmenter-parity.ts -- --grobid <dir> --ids a,b
 *
 * Tokens are aligned by text (LCS); prints per-column mismatch rates and examples.
 */
import fs from "node:fs";
import path from "node:path";
import { loadNodeCrfRuntime } from "../src/services/pdfExtraction/crf/nodeRuntime";
import { referenceLinesFromPages, selectReferenceBlocks } from "../src/services/pdfExtraction/crf/referenceLines";
import { referenceSegmenterFeatureRows } from "../src/services/pdfExtraction/crf/referenceSegmenterFeatures";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (n: string) => args[args.indexOf(`--${n}`) + 1];
const grobidDir = arg("grobid");
const ids = arg("ids").split(",");
const COLS = ["tok", "lower", "p1", "p2", "p3", "p4", "s1", "s2", "s3", "s4", "linepos", "indent", "caps", "digit", "single", "name", "common", "first", "loc", "year", "month", "http", "punct", "relpos", "linelen", "block", "profile"];

function lcs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

await loadNodeCrfRuntime();
const mismatch = new Array(COLS.length).fill(0);
const examples: string[][] = COLS.map(() => []);
let aligned = 0, oursTotal = 0, theirsTotal = 0;
for (const id of ids) {
  const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" "));
  const pdf = fs.readdirSync(path.join(root, "test-data/field-gold", id)).find((f) => f.endsWith(".pdf"))!;
  const pages = await extractPdfPages(path.join(root, "test-data/field-gold", id, pdf));
  const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
  const ours = referenceSegmenterFeatureRows(referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections))).rows;
  const pairs = lcs(ours.map((r) => r[0]), theirs.map((r) => r[0]));
  oursTotal += ours.length; theirsTotal += theirs.length; aligned += pairs.length;
  for (const [i, j] of pairs) for (let c = 0; c < COLS.length; c++) if (ours[i][c] !== theirs[j][c]) {
    mismatch[c]++;
    if (examples[c].length < 4) examples[c].push(`${id}:${ours[i][0]} ours=${ours[i][c]} grobid=${theirs[j][c]}`);
  }
}
console.log(`tokens ours ${oursTotal} grobid ${theirsTotal} aligned ${aligned}`);
COLS.forEach((c, i) => mismatch[i] && console.log(`${c.padEnd(8)} ${(100 * mismatch[i] / aligned).toFixed(1)}%  ${examples[i].join(" | ")}`));
if (args.includes("--show")) {
  // Print one mismatching line per kind for manual inspection: token ours/grobid relpos and line length.
  const id = ids[0];
  const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" "));
  const pdf = fs.readdirSync(path.join(root, "test-data/field-gold", id)).find((f) => f.endsWith(".pdf"))!;
  const pages = await extractPdfPages(path.join(root, "test-data/field-gold", id, pdf));
  const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
  const lines = referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections));
  const f = referenceSegmenterFeatureRows(lines);
  const pairs = lcs(f.rows.map((r) => r[0]), theirs.map((r) => r[0]));
  let shown = 0;
  for (const [i, j] of pairs) {
    if (f.rows[i][23] === theirs[j][23] || shown >= 3) continue;
    shown++;
    const li = f.lineForToken[i];
    console.log(JSON.stringify(lines[li].text));
    console.log(pairs.filter(([a]) => f.lineForToken[a] === li).map(([a, b]) => `${f.rows[a][0]}:${f.rows[a][23]}/${theirs[b][23]}`).join(" "), `len ${f.rows[i][24]}/${theirs[j][24]}`);
  }
}
