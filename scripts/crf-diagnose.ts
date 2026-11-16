import path from "node:path";
import fs from "node:fs";
import { parseCitation } from "../src/services/pdfExtraction/crf/citation";
import { loadNodeCrfRuntime } from "../src/services/pdfExtraction/crf/nodeRuntime";
import { similarity, normalizeText } from "../src/evaluation/fieldGold/normalize";
const root = path.resolve(import.meta.dirname, "..");
await loadNodeCrfRuntime();
const m = JSON.parse(fs.readFileSync(`${root}/test-fixtures/field-gold/manifest.json`, "utf8"));
let n = 0, ok = 0, yOk = 0, yN = 0;
for (const d of m.documents.filter((d: any) => d.language === "en" && d.source === "europepmc")) {
  const g = JSON.parse(fs.readFileSync(`${root}/test-data/field-gold/${d.id}/gold.json`, "utf8"));
  for (const r of g.fields.references.slice(0, 15)) {
    if (!r.title) continue;
    const p = parseCitation(r.raw);
    n++; if (p.title && (similarity(p.title, r.title) >= 0.9 || normalizeText(p.title).includes(normalizeText(r.title)))) ok++;
    if (r.year) { yN++; if (p.year === r.year) yOk++; }
  }
}
console.log(`citation on gold raw: title ${ok}/${n} = ${(ok / n).toFixed(3)}, year ${(yOk / yN).toFixed(3)}`);
const s = JSON.parse(fs.readFileSync(`${root}/test-data/field-gold/runs/compare/scores.json`, "utf8"));
for (const p of ["versio", "grobid", "crfport"]) {
  const r = s.documents.filter((x: any) => x.parser === p && x.language === "en" && x.scores.references).map((x: any) => x.scores.references);
  const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  console.log(p, "countRatio median", med(r.map((x: any) => x.countRatio)).toFixed(2), "P", (r.reduce((a: number, x: any) => a + x.precision, 0) / r.length).toFixed(2), "R", (r.reduce((a: number, x: any) => a + x.recall, 0) / r.length).toFixed(2));
}
const boundary = { predicted: 0, predictedHit: 0, gold: 0, goldHit: 0 };
for (const d of m.documents.filter((d: any) => d.language === "en")) {
  const goldFile = `${root}/test-data/field-gold/${d.id}/gold.json`;
  const predFile = `${root}/test-data/field-gold/runs/crfport/predictions/${d.id}.json`;
  if (!fs.existsSync(goldFile) || !fs.existsSync(predFile)) continue;
  const gold = JSON.parse(fs.readFileSync(goldFile, "utf8")).fields.references.map((r: any) => r.raw) as string[];
  const predicted = JSON.parse(fs.readFileSync(predFile, "utf8")).fields.references.map((r: any) => r.raw) as string[];
  for (const raw of predicted) { boundary.predicted++; if (gold.some((candidate) => similarity(raw, candidate) >= 0.6)) boundary.predictedHit++; }
  for (const raw of gold) { boundary.gold++; if (predicted.some((candidate) => similarity(raw, candidate) >= 0.6)) boundary.goldHit++; }
}
console.log(`crfport boundary >=0.6: predicted ${boundary.predictedHit}/${boundary.predicted} = ${(boundary.predictedHit / boundary.predicted).toFixed(3)}, gold ${boundary.goldHit}/${boundary.gold} = ${(boundary.goldHit / boundary.gold).toFixed(3)}`);
