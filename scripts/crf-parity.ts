/** Development-only CRF smoke/parity harness. Local GROBID is never imported by production code. */
import fs from "node:fs";
import path from "node:path";
import { loadCrfModel } from "../src/services/pdfExtraction/crf/model";
import { decode } from "../src/services/pdfExtraction/crf/wapiti";
import { citationFeatureRows } from "../src/services/pdfExtraction/crf/citationFeatures";
import { loadLexicons } from "../src/services/pdfExtraction/crf/lexicon";
import { tokenizeGrobid } from "../src/services/pdfExtraction/crf/tokenize";

const model = (process.argv[process.argv.indexOf("--model") + 1] ?? "citation") as "citation" | "reference-segmenter";
if (!["citation", "reference-segmenter"].includes(model)) throw new Error("--model citation|reference-segmenter");
const manifest = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../test-fixtures/field-gold/manifest.json"), "utf8")) as { documents: Array<{ id: string }> };
if (model === "citation") {
  const examples = manifest.documents.flatMap(({ id }) => {
    const file = path.resolve(import.meta.dirname, `../test-data/field-gold/${id}/gold.json`);
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { fields: { references: Array<{ raw: string }> } }).fields.references.slice(0, 1) : [];
  });
  let tokens = 0;
  for (const { raw } of examples) tokens += decode(loadCrfModel("citation"), citationFeatureRows(tokenizeGrobid(raw), loadLexicons())).length;
  console.log(`citation port decoded ${tokens} tokens across ${examples.length} gold references; token-label agreement requires GROBID's internal label stream (REST exposes TEI only).`);
} else {
  console.log(`reference-segmenter model loaded with ${loadCrfModel(model).labels.length} labels; layout-label parity requires PDFALTO token coordinates unavailable in field-gold JSON.`);
}
