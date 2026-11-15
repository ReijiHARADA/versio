/**
 * Characterize the public Paper projection over a deterministic local corpus.
 *
 * Usage:
 *   vite-node --script scripts/characterize-to-paper.ts --baseline /tmp/to-paper-baseline.json
 *   vite-node --script scripts/characterize-to-paper.ts --baseline /tmp/to-paper-baseline.json --verify
 *
 * The two Paper timestamps are normalized because projectCanonicalToPaper creates
 * them with new Date().toISOString(); all other projection fields are hashed.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const baselinePath = path.resolve(option("--baseline") ?? "/tmp/versio-to-paper-characterization.json");
const verify = args.includes("--verify");
const singleFile = option("--single");
const resultPath = option("--result");
const singleIndex = Number(option("--index") ?? "0");
const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
const syntheticDir = path.join(root, "test-fixtures/generated-pdfs");
// The 200 smallest PDFs form a deterministic, broadly varied local sample while
// keeping each independent extractor process within the available heap.
const pending = fs.readdirSync(pendingDir)
  .filter((file) => file.toLowerCase().endsWith(".pdf"))
  .sort((left, right) => {
    const sizeDelta = fs.statSync(path.join(pendingDir, left)).size - fs.statSync(path.join(pendingDir, right)).size;
    return sizeDelta || left.localeCompare(right);
  })
  .slice(0, 200)
  .map((file) => path.join(pendingDir, file));
const synthetic = fs.readdirSync(syntheticDir)
  .filter((file) => file.toLowerCase().endsWith(".pdf"))
  .sort()
  .map((file) => path.join(syntheticDir, file));
const files = [...pending, ...synthetic];

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

async function characterize(file: string, index: number): Promise<string> {
  const pages = await extractPdfPages(file);
  const relativePath = path.relative(root, file);
  const extracted = extractFromPages({
    pages,
    paperId: `characterization-${index + 1}`,
    filePath: relativePath,
    fileHash: sha256(fs.readFileSync(file)),
    metadata: { pageCount: pages.length },
  });
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...paper } = extracted.paper;
  return sha256({ paper, sections: extracted.sections, blocks: extracted.blocks });
}

if (singleFile) {
  if (!resultPath) throw new Error("--single requires --result");
  const file = path.resolve(root, singleFile);
  fs.writeFileSync(resultPath, `${await characterize(file, singleIndex)}\n`);
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "versio-to-paper-"));
const hashes: Record<string, string> = {};
try {
  for (const [index, file] of files.entries()) {
    const relativePath = path.relative(root, file);
    const result = path.join(tempDir, `${index}.sha256`);
    const child = spawnSync(process.execPath, [
      path.join(root, "node_modules/vite-node/vite-node.mjs"),
      "--script",
      path.join(root, "scripts/characterize-to-paper.ts"),
      "--single",
      relativePath,
      "--result",
      result,
      "--index",
      String(index),
    ], { cwd: root, stdio: "inherit" });
    if (child.status !== 0) throw new Error(`Characterization failed for ${relativePath}.`);
    hashes[relativePath] = fs.readFileSync(result, "utf8").trim();
    process.stderr.write(`characterized ${index + 1}/${files.length}: ${relativePath}\n`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (verify) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as { hashes: Record<string, string> };
  const ids = new Set([...Object.keys(baseline.hashes), ...Object.keys(hashes)]);
  const diffs = [...ids].filter((id) => baseline.hashes[id] !== hashes[id]);
  console.log(`characterization: ${files.length} PDFs, ${diffs.length} diffs`);
  if (diffs.length > 0) {
    console.error(diffs.join("\n"));
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(baselinePath, `${JSON.stringify({ files: files.map((file) => path.relative(root, file)), hashes }, null, 2)}\n`);
  console.log(`characterization: ${files.length} PDFs, baseline written to ${baselinePath}`);
}
