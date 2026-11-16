/**
 * How much of each JATS gold paragraph is printed in the PDF at all (local only).
 *
 *   npx vite-node --script scripts/paragraph-gold-coverage.ts -- [--shard k/n]
 *
 * The PDF can be another version than the JATS, or omit text the JATS carries. Such
 * paragraphs cannot be intact whatever the extractor does, so the scorer reports
 * integrity over printed paragraphs next to the raw figure. Coverage is the share of the
 * paragraph's word bigrams present anywhere in the PDF text (bigrams barely depend on
 * reading order). Writes field-gold/_cache/coverage/<pmcid>.json: one value per gold
 * paragraph index.
 */
import fs from "node:fs";
import path from "node:path";
import { jatsParagraphs, tokens } from "../src/evaluation/extractionAudit/paragraphGold";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const shardArg = args.indexOf("--shard") >= 0 ? args[args.indexOf("--shard") + 1] : "0/1";
const [k, n] = shardArg.split("/").map(Number);
const cacheDir = path.join(root, "test-data/field-gold/_cache/epmc");
const outDir = path.join(root, "test-data/field-gold/_cache/coverage");
fs.mkdirSync(outDir, { recursive: true });

const bigrams = (t: string[]) => t.slice(1).map((x, i) => `${t[i]} ${x}`);
const index = JSON.parse(fs.readFileSync(path.join(root, "test-data/paragraph-gold/index.json"), "utf8")) as Array<{ id: string; pdf: string }>;
let done = 0;
for (const doc of index.filter((_, i) => i % n === k)) {
  const xml = path.join(cacheDir, `${doc.id.slice(5)}.xml`);
  const out = path.join(outDir, `${doc.id.slice(5)}.json`);
  if (!fs.existsSync(xml) || fs.existsSync(out)) continue;
  let raw: string;
  try {
    raw = (await extractPdfPages(path.join(root, doc.pdf))).map((p) => p.textItems.map((t) => t.text).join(" ")).join(" ");
  } catch {
    continue;
  }
  // Both with and without line-end hyphens joined: either spelling may be the printed one.
  const pdf = new Set([...bigrams(tokens(raw)), ...bigrams(tokens(raw.replace(/(\p{L})[-­]\s+(\p{Ll})/gu, "$1$2")))]);
  const coverage = jatsParagraphs(fs.readFileSync(xml, "utf8")).map((p) => {
    const g = [...new Set(bigrams(tokens(p.text)))];
    return Number((g.filter((x) => pdf.has(x)).length / Math.max(1, g.length)).toFixed(3));
  });
  fs.writeFileSync(out, JSON.stringify(coverage));
  done += 1;
}
console.log(`shard ${k}/${n}: ${done} documents`);
