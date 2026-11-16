/** Diff TypeScript citation vectors/labels against GROBID 0.9.1's own tagger output. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { citationFeatureRows } from "../src/services/pdfExtraction/crf/citationFeatures";
import { loadLexicons } from "../src/services/pdfExtraction/crf/lexicon";
import { loadCrfModel } from "../src/services/pdfExtraction/crf/model";
import { decode } from "../src/services/pdfExtraction/crf/wapiti";
import { isGrobidWhitespace, tokenizeGrobid } from "../src/services/pdfExtraction/crf/tokenize";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/field-gold/manifest.json"), "utf8")) as { documents: Array<{ id: string; language: string }> };
const raws = manifest.documents.filter((d) => d.language === "en").flatMap((d) => {
  const file = path.join(root, "test-data/field-gold", d.id, "gold.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { fields: { references: Array<{ raw: string }> } }).fields.references.slice(0, 3).map((r) => r.raw) : [];
}).slice(0, Number(process.argv[process.argv.indexOf("--limit") + 1] ?? 60));
const java = spawnSync(path.join(root, "tools/grobid-parity/run-citation.sh"), [], { cwd: root, input: raws.join("\n"), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
if (java.status !== 0) throw new Error(java.stderr || "GROBID parity tool failed");
const groups = java.stdout.split("@@@\n").slice(1).map((group) => group.trim().split("\n").filter(Boolean).map((row) => row.trim().split(/\s+/)));
let rows = 0, matchingRows = 0, labels = 0, matchingLabels = 0;
const mismatches: Array<{ raw: string; token: string; columns: number[]; ours: string[]; grobid: string[] }> = [];
for (let i = 0; i < Math.min(raws.length, groups.length); i += 1) {
  const tokens = tokenizeGrobid(raws[i]);
  const ours = citationFeatureRows(tokens, loadLexicons());
  const theirs = groups[i];
  const oursLabels = decode(loadCrfModel("citation"), ours);
  for (let n = 0; n < Math.min(ours.length, theirs.length); n += 1) {
    // Wapiti preserves the `0` training-label placeholder supplied by printVector,
    // then appends its predicted label; neither belongs to our decoder input rows.
    rows++; const theirsFeatures = theirs[n].slice(0, -2); if (ours[n].join(" ") === theirsFeatures.join(" ")) matchingRows++;
    else if (mismatches.length < 5) mismatches.push({ raw: raws[i], token: ours[n][0], columns: ours[n].flatMap((value, col) => value === theirsFeatures[col] ? [] : [col]), ours: ours[n], grobid: theirsFeatures });
    labels++; if (oursLabels[n] === theirs[n].at(-1)) matchingLabels++;
  }
}
console.log(JSON.stringify({ references: groups.length, tokens: rows, featureAgreement: rows ? matchingRows / rows : 0, labelAgreement: labels ? matchingLabels / labels : 0, mismatches }, null, 2));
