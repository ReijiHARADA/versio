/**
 * Score one parser against the field gold corpus (local only).
 *
 *   npm run eval:fields -- --parser versio [--ids a,b] [--out test-data/field-gold/runs/versio]
 *
 * Writes predictions/<id>.json, scores.json and report.md (with ≤120-char
 * worst-case excerpts) under the gitignored run directory.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { predictionFromApple, type ProbeOutput } from "../src/evaluation/fieldGold/adapters/apple";
import { predictionFromGrobid } from "../src/evaluation/fieldGold/adapters/grobid";
import { predictionFromVersio } from "../src/evaluation/fieldGold/adapters/versio";
import { buildReport } from "../src/evaluation/fieldGold/report";
import type { FieldGold, FieldPrediction, ParserId } from "../src/evaluation/fieldGold/types";
import { processFulltextDocument } from "../src/services/pdfExtraction/grobid/client";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
};
const parser = (arg("parser") ?? "versio") as ParserId;
const ids = arg("ids")?.split(",");
const outDir = path.resolve(root, arg("out") ?? `test-data/field-gold/runs/${parser}`);
const dataDir = path.join(root, "test-data/field-gold");

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist");

async function pdfInfo(pdfPath: string): Promise<{ title?: string; author?: string }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), disableWorker: true, verbosity: 0 } as never).promise;
  const info = (await doc.getMetadata()).info as { Title?: unknown; Author?: unknown };
  await doc.destroy();
  return { title: typeof info?.Title === "string" ? info.Title : undefined, author: typeof info?.Author === "string" ? info.Author : undefined };
}

async function runVersio(gold: FieldGold): Promise<FieldPrediction> {
  const pdfPath = path.resolve(root, gold.pdfPath);
  const started = performance.now();
  const pages = await extractPdfPages(pdfPath);
  const info = await pdfInfo(pdfPath);
  const result = extractFromPages({ pages, paperId: gold.id, filePath: pdfPath, fileHash: gold.pdfSha256, metadata: { ...info, pageCount: pages.length } });
  return predictionFromVersio(result, Math.round(performance.now() - started), gold.id);
}

const GROBID_VERSION = "0.9.1";
async function runGrobid(gold: FieldGold): Promise<FieldPrediction> {
  const started = performance.now();
  let tei: string | null = null;
  try {
    tei = await processFulltextDocument(new Uint8Array(fs.readFileSync(path.resolve(root, gold.pdfPath))), { signal: AbortSignal.timeout(180_000) });
  } catch (error) {
    // Unreachable or failed GROBID: every field is "unavailable", never scored as 0.
    console.error(`\n${gold.id}: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
  }
  return predictionFromGrobid(gold.id, tei, Math.round(performance.now() - started), GROBID_VERSION);
}

const PROBE = path.join(root, "tools/doc-structure-probe/.build/release/doc-structure-probe");
async function runApple(gold: FieldGold): Promise<FieldPrediction> {
  if (!fs.existsSync(PROBE)) throw new Error("build the probe first: (cd tools/doc-structure-probe && swift build -c release)");
  const started = performance.now();
  const stdout = await new Promise<string>((resolve, reject) =>
    execFile(PROBE, [path.resolve(root, gold.pdfPath)], { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 }, (error, out) => (error ? reject(error) : resolve(out))),
  );
  return predictionFromApple(gold.id, JSON.parse(stdout) as ProbeOutput, Math.round(performance.now() - started));
}

const RUNNERS: Partial<Record<ParserId, (gold: FieldGold) => Promise<FieldPrediction>>> = { versio: runVersio, grobid: runGrobid, apple: runApple };

const runner = RUNNERS[parser];
if (!runner) throw new Error(`unknown parser: ${parser}`);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/field-gold/manifest.json"), "utf8")) as { documents: Array<{ id: string }> };
const golds: FieldGold[] = manifest.documents
  .filter((d) => !ids || ids.includes(d.id))
  .map((d) => path.join(dataDir, d.id, "gold.json"))
  .filter((p) => fs.existsSync(p))
  .map((p) => JSON.parse(fs.readFileSync(p, "utf8")));

fs.mkdirSync(path.join(outDir, "predictions"), { recursive: true });
const predictions: FieldPrediction[] = [];
const failures: Array<{ id: string; error: string }> = [];
for (const [i, gold] of golds.entries()) {
  try {
    const pred = await runner(gold);
    predictions.push(pred);
    fs.writeFileSync(path.join(outDir, "predictions", `${gold.id}.json`), JSON.stringify(pred, null, 2));
    process.stdout.write(`\r${i + 1}/${golds.length}`);
  } catch (error) {
    failures.push({ id: gold.id, error: String((error as Error)?.message ?? error).slice(0, 200) });
  }
}
const { markdown, json } = buildReport({ golds, predictions });
fs.writeFileSync(path.join(outDir, "scores.json"), JSON.stringify({ ...json, failures }, null, 2));
fs.writeFileSync(path.join(outDir, "report.md"), `${markdown}\n\n失敗: ${failures.length} 件 ${failures.map((f) => f.id).join(", ")}\n`);
console.log(`\nscored ${predictions.length}/${golds.length}, failures ${failures.length} → ${path.relative(root, outDir)}/report.md`);
