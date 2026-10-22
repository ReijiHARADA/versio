/** Verify development/validation/held-out source and publisher-family separation. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
type Row = { id: string; pdfPath: string; fileHash: string; leakageGroup: string; attributes: { publisher?: string } };
const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as { documents: Row[] };
const validation = read("test-fixtures/extraction-benchmark/validation-cohort-v1.json").documents;
const heldout = read("test-fixtures/extraction-benchmark/independent-cohort-v1.json").documents;
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { pdfDir: string; papers: Array<{ id: string; filename: string; publisher?: string }> };
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const devHashes = new Set(catalog.papers.map((paper) => path.join(root, catalog.pdfDir, paper.filename)).filter(fs.existsSync).map(digest));
const devPublishers = new Set(catalog.papers.map((paper) => paper.publisher?.toLocaleLowerCase()).filter(Boolean));
const all = [{ split: "validation", rows: validation }, { split: "heldout", rows: heldout }];
const ids = new Set<string>(); const hashes = new Set<string>(); const groups = new Set<string>(); const publishers = new Set<string>(); const issues: string[] = [];
for (const { split, rows } of all) for (const row of rows) {
  const actual = path.join(root, row.pdfPath); const publisher = row.attributes.publisher?.toLocaleLowerCase();
  if (ids.has(row.id)) issues.push(`${split}:${row.id}: duplicate id`); if (hashes.has(row.fileHash) || devHashes.has(row.fileHash)) issues.push(`${split}:${row.id}: hash overlap`); if (groups.has(row.leakageGroup)) issues.push(`${split}:${row.id}: leakage group overlap`); if (publisher && (publishers.has(publisher) || devPublishers.has(publisher))) issues.push(`${split}:${row.id}: publisher overlap`); if (!fs.existsSync(actual) || digest(actual) !== row.fileHash) issues.push(`${split}:${row.id}: source missing or changed`);
  ids.add(row.id); hashes.add(row.fileHash); groups.add(row.leakageGroup); if (publisher) publishers.add(publisher);
}
const result = { validation: validation.length, heldout: heldout.length, developmentHashes: devHashes.size, valid: !issues.length, issues };
console.log(JSON.stringify(result, null, 2)); if (issues.length) process.exitCode = 1;
