/**
 * Translation-stage audit on the app's acceptance path (local only).
 *
 *   npx vite-node --script scripts/translation-audit.ts -- --run fix4-fieldgold [--split dev|test] [--n 120]
 *
 * Samples translatable, unwarned paragraph blocks from an extraction audit
 * run (English Europe PMC papers, so each block also has a JATS verdict),
 * translates them with the local MADLAD server exactly like the import does
 * (projectSafeUnitTranslation, then isPlausibleJaTranslation) and reports the
 * outcome per block verdict. This separates translation failures on clean
 * input from failures caused by broken extraction. Outputs stay in the
 * gitignored run directory; they are evaluation data only, never training data.
 */
import fs from "node:fs";
import path from "node:path";
import { alignParagraphs, jatsParagraphs } from "../src/evaluation/extractionAudit/paragraphGold";
import { MADLADEngine } from "../src/services/translation/madladEngine";
import { projectSafeUnitTranslation } from "../src/services/translation/partialProjection";
import { isPlausibleJaTranslation } from "../src/services/translation/quality";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const run = arg("run", "fix4-fieldgold");
const split = arg("split", "dev");
const n = Number(arg("n", "120"));
const runDir = path.join(root, "test-data/extraction-audit", run);
const cacheDir = path.join(root, "test-data/field-gold/_cache/epmc");

type Dump = { id: string; language: string | null; split: string; blocks: Array<{ id: string; type: string; text: string; warning: string | null; translatable: boolean }> };
let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

const sample: Array<{ doc: string; id: string; text: string; verdict: string }> = [];
const docs = fs
  .readdirSync(path.join(runDir, "docs"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(runDir, "docs", f), "utf8")) as Dump)
  .filter((d) => d.id.startsWith("epmc-") && d.language === "en" && d.split === split && fs.existsSync(path.join(cacheDir, `${d.id.slice(5)}.xml`)));
const perDoc = Math.ceil(n / Math.max(1, docs.length));
for (const doc of docs) {
  const paragraphs = doc.blocks.filter((b) => b.type === "paragraph");
  const verdicts = new Map(alignParagraphs(jatsParagraphs(fs.readFileSync(path.join(cacheDir, `${doc.id.slice(5)}.xml`), "utf8")), paragraphs).blocks.map((b) => [b.id, b.verdict]));
  const pool = paragraphs.filter((b) => b.translatable && !b.warning && b.text.split(/\s+/).length >= 8);
  for (const b of pool.map((x) => [rand(), x] as const).sort((a, c) => a[0] - c[0]).slice(0, perDoc).map(([, x]) => x)) {
    sample.push({ doc: doc.id, id: b.id, text: b.text, verdict: verdicts.get(b.id) ?? "?" });
  }
}
const engine = new MADLADEngine("http://127.0.0.1:8765");
const outcomes: Array<{ doc: string; id: string; verdict: string; outcome: string; source: string; output: string }> = [];
// One request per block, like the Reader's queue (the server batches sentences itself).
for (const [i, b] of sample.entries()) {
  try {
    const result = await engine.translate(b.text, "en", "ja");
    const unit = projectSafeUnitTranslation(result);
    const text = unit && !unit.complete ? unit.text : result.text;
    const outcome = unit && !unit.complete ? "partial_unit_fallback" : isPlausibleJaTranslation(text, b.text) ? "translated" : "rejected_source_fallback";
    outcomes.push({ doc: b.doc, id: b.id, verdict: b.verdict, outcome, source: b.text, output: text });
  } catch (error) {
    outcomes.push({ ...b, outcome: "request_failed", source: b.text, output: String(error).slice(0, 120) });
  }
  // Saved after every block: a long run that is stopped keeps what it measured.
  fs.writeFileSync(path.join(runDir, `translation-${split}.json`), JSON.stringify(outcomes, null, 1));
  process.stdout.write(`\r${i + 1}/${sample.length}`);
}
fs.writeFileSync(path.join(runDir, `translation-${split}.json`), JSON.stringify(outcomes, null, 1));
const table = new Map<string, Map<string, number>>();
for (const o of outcomes) {
  if (!table.has(o.verdict)) table.set(o.verdict, new Map());
  table.get(o.verdict)!.set(o.outcome, (table.get(o.verdict)!.get(o.outcome) ?? 0) + 1);
}
const count = (outcome: string) => outcomes.filter((o) => o.outcome === outcome).length;
console.log(`\n${outcomes.length} blocks from ${docs.length} ${split} docs: translated ${count("translated")}, partial ${count("partial_unit_fallback")}, rejected ${count("rejected_source_fallback")}, request failed ${count("request_failed")}`);
for (const [verdict, m] of table) console.log(`  ${verdict.padEnd(9)} ${[...m].map(([k, v]) => `${k} ${v}`).join(", ")}`);
