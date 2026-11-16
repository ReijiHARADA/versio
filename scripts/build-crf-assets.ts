/** Builds generated CRF assets from the local, read-only GROBID 0.9.1 checkout. */
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { parseWapitiModel } from "../src/services/pdfExtraction/crf/wapiti";

const root = path.resolve(import.meta.dirname, "..");
const grobidHome = path.join(process.env.HOME ?? "", ".cache/versio-grobid/grobid-0.9.1/grobid-home");
const out = path.join(root, "src/services/pdfExtraction/crf/assets");
fs.mkdirSync(out, { recursive: true });

function write(name: string, value: unknown) {
  const bytes = gzipSync(JSON.stringify(value));
  fs.writeFileSync(path.join(out, `${name}.json.gz`), bytes);
  console.log(`${name}.json.gz ${(bytes.length / 1024).toFixed(1)} KiB`);
  return bytes.length;
}

let total = 0;
for (const name of ["citation", "reference-segmenter"] as const) {
  const model = parseWapitiModel(fs.readFileSync(path.join(grobidHome, "models", name, "model.wapiti"), "utf8"));
  total += write(`${name}-model`, {
    labels: model.labels,
    patterns: model.patterns,
    unigram: Object.fromEntries([...model.unigram].map(([key, weights]) => [key, [...weights]])),
    bigram: Object.fromEntries([...model.bigram].map(([key, weights]) => [key, [...weights]])),
  });
}
const lexicons: Record<string, string> = {
  journals: "journals/journals.txt", abbrev_journals: "journals/abbrev_journals.txt", proceedings: "journals/proceedings.txt",
  publishers: "publishers/publishers.txt", location: "places/location.txt", collaborations: "organisations/collaborations.txt",
  inspire_collaborations: "organisations/inspire_collaborations.txt", firstname_5k: "names/firstname.5k", lastname_5k: "names/lastname.5k",
};
for (const [name, relative] of Object.entries(lexicons)) {
  const values = fs.readFileSync(path.join(grobidHome, "lexicon", relative), "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  total += write(name, values);
}
console.log(`total gzip ${(total / 1024 / 1024).toFixed(2)} MiB`);
if (total > 5 * 1024 * 1024) throw new Error("CRF assets exceed 5 MiB gzip budget");
