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
import { decode } from "../src/services/pdfExtraction/crf/wapiti";
import { crfRuntime } from "../src/services/pdfExtraction/crf/runtime";
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
  const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
  const pages = await extractPdfPages(path.join(root, pdf));
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
  const COL = Number(arg("col") ?? 23);
  const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" "));
  const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
  const pages = await extractPdfPages(path.join(root, pdf));
  const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
  const lines = referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections));
  const f = referenceSegmenterFeatureRows(lines);
  const pairs = lcs(f.rows.map((r) => r[0]), theirs.map((r) => r[0]));
  let shown = 0;
  for (const [i, j] of pairs) {
    if (f.rows[i][COL] === theirs[j][COL] || shown >= 3) continue;
    shown++;
    const li = f.lineForToken[i];
    console.log(JSON.stringify(lines[li].text));
    console.log(pairs.filter(([a]) => f.lineForToken[a] === li).map(([a, b]) => `${f.rows[a][0]}:${f.rows[a][COL]}/${theirs[b][COL]}`).join(" "), `len ${f.rows[i][24]}/${theirs[j][24]}`);
  }
}
if (args.includes("--longest")) {
  // Longest lines on each side (GROBID lines rebuilt from LINESTART tokens, without spaces).
  for (const id of ids) {
    const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" "));
    const gl: string[] = [];
    for (const r of theirs) if (r[10] === "LINESTART" || gl.length === 0) gl.push(r[0]); else gl[gl.length - 1] += r[0];
    const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
    const pages = await extractPdfPages(path.join(root, pdf));
    const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
    const ol = referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections)).map((l) => l.text.replace(/\s/g, ""));
    const top = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).slice(0, 2).map((s) => `${s.length}:${s.slice(0, 70)}`);
    console.log(id, `lines ours ${ol.length} grobid ${gl.length}`, "\n  ours  ", top(ol).join("\n         "), "\n  grobid", top(gl).join("\n         "));
  }
}
if (args.includes("--maxlen")) {
  // Infer GROBID's maxLineLength interval from its linelen bins: bin b = floor(10 * L / max), L = our line length.
  for (const id of ids) {
    const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" "));
    const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
    const pages = await extractPdfPages(path.join(root, pdf));
    const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
    const lines = referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections));
    const f = referenceSegmenterFeatureRows(lines);
    let lo = 1, hi = 1e9;
    for (const [i, j] of lcs(f.rows.map((r) => r[0]), theirs.map((r) => r[0]))) {
      if (theirs[j][10] !== "LINESTART" || f.rows[i][10] !== "LINESTART") continue;
      const L = lines[f.lineForToken[i]].text.length + 2, b = Number(theirs[j][24]);
      if (b >= 10) { hi = Math.min(hi, L); continue; }
      lo = Math.max(lo, Math.floor((10 * L) / (b + 1)) + 1);
      if (b > 0) hi = Math.min(hi, Math.floor((10 * L) / b));
    }
    const oursMax = Math.max(...lines.map((l) => l.text.length + 2));
    console.log(id, `grobid max in [${lo}, ${hi}] ours ${oursMax}`);
  }
}

if (args.includes("--ablate")) {
  // Which column matters: decode our rows with one column taken from GROBID (aligned tokens) and
  // score entry starts (I-<reference>/I-<label>) against GROBID's rows decoded by the same model.
  const isStart = (l: string) => l === "I-<reference>" || l === "I-<label>";
  const docs: Array<{ ours: string[][]; theirs: string[][]; pairs: Array<[number, number]> }> = [];
  for (const id of ids) {
    const theirs = fs.readFileSync(path.join(grobidDir, `${id}.training.references.referenceSegmenter`), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split(" ").slice(0, 27));
    const pdf = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).pdfPath as string;
    const pages = await extractPdfPages(path.join(root, pdf));
    const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
    const ours = referenceSegmenterFeatureRows(referenceLinesFromPages(pages, selectReferenceBlocks(result.blocks, result.sections))).rows;
    docs.push({ ours, theirs, pairs: lcs(ours.map((r) => r[0]), theirs.map((r) => r[0])) });
  }
  const model = crfRuntime().segmenter;
  const ref = docs.map((d) => decode(model, d.theirs));
  const score = (swap: number[]) => {
    let tp = 0, fp = 0, fn = 0;
    docs.forEach((d, k) => {
      const rows = d.ours.map((r) => [...r]);
      for (const [i, j] of d.pairs) for (const c of swap) rows[i][c] = d.theirs[j][c];
      const got = decode(model, rows);
      const gs = new Set(d.pairs.filter(([, j]) => isStart(ref[k][j])).map(([i]) => i));
      got.forEach((l, i) => { if (isStart(l)) (gs.has(i) ? tp++ : fp++); });
      fn += [...gs].filter((i) => !isStart(got[i])).length;
    });
    return (2 * tp / (2 * tp + fp + fn)).toFixed(3);
  };
  console.log("start F1 vs grobid rows: base", score([]), "all layout", score([10, 11, 22, 23, 24, 25, 26]));
  COLS.forEach((c, i) => i >= 10 && console.log(`  swap ${c.padEnd(8)} ${score([i])}`));
}
