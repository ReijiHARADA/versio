/**
 * Element-level score of an extraction-audit run (local only).
 *
 *   npx vite-node --script scripts/element-gold-score.ts -- --run <name> [--split dev|test|all] [--json out.json]
 *
 * Gold per document: Europe PMC → publisher JATS (test-data/field-gold/_cache/epmc);
 * arXiv / ACL → test-data/element-gold/<id>/gold.json (LaTeX draft reviewed by Claude,
 * scripts/fetch-element-gold.ts). Prints found / gold per element kind and source.
 * Gold items not printed in the PDF's own text layer are not scored.
 */
import fs from "node:fs";
import path from "node:path";
import { jatsElementGold } from "../src/evaluation/elementGold/jats";
import { scoreElements, type ElementScores, type ScoredBlock, type ScoredPaper } from "../src/evaluation/elementGold/score";
import type { ElementGold } from "../src/evaluation/elementGold/types";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string) => (args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : undefined);
const runDir = path.join(root, "test-data/extraction-audit", arg("run") ?? "elementgold", "docs");
const split = arg("split") ?? "all";
const epmcDir = path.join(root, "test-data/field-gold/_cache/epmc");
const elementDir = path.join(root, "test-data/element-gold");
const textDir = path.join(root, "test-data/field-gold/_cache/pdftext");
fs.mkdirSync(textDir, { recursive: true });

const paraIndex = fs.existsSync(path.join(root, "test-data/paragraph-gold/index.json"))
  ? new Map((JSON.parse(fs.readFileSync(path.join(root, "test-data/paragraph-gold/index.json"), "utf8")) as Array<{ id: string; pdf: string }>).map((d) => [d.id, d.pdf]))
  : new Map<string, string>();

function goldFor(id: string): ElementGold | null {
  if (id.startsWith("epmc-")) {
    const xml = path.join(epmcDir, `${id.slice(5)}.xml`);
    return fs.existsSync(xml) ? jatsElementGold(fs.readFileSync(xml, "utf8"), { id, license: "cc by", sourceUrl: `https://europepmc.org/article/PMC/${id.slice(5)}` }) : null;
  }
  // Only reviewed gold is scored; an unreviewed LaTeX draft is not ground truth.
  const file = path.join(elementDir, id, "gold.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as ElementGold) : null;
}

async function printedText(id: string): Promise<string> {
  const cache = path.join(textDir, `${id}.txt`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
  const pdf = id.startsWith("epmc-") ? path.join(root, paraIndex.get(id) ?? "") : path.join(elementDir, id, "source.pdf");
  const text = (await extractPdfPages(pdf)).map((p) => p.textItems.map((t) => t.text).join(" ")).join("\n");
  fs.writeFileSync(cache, text);
  return text;
}

type Dump = { id: string; split: string; paper?: ScoredPaper; blocks: ScoredBlock[] };
const totals = new Map<string, Map<string, { gold: number; found: number }>>();
const perDoc: Array<{ id: string; scores: ElementScores }> = [];
for (const file of fs.readdirSync(runDir).sort()) {
  const dump = JSON.parse(fs.readFileSync(path.join(runDir, file), "utf8")) as Dump;
  if (split !== "all" && dump.split !== split) continue;
  const gold = goldFor(dump.id);
  if (!gold || !dump.paper) continue;
  const scores = scoreElements(gold, dump.blocks, dump.paper, await printedText(dump.id));
  perDoc.push({ id: dump.id, scores });
  const bucket = totals.get(gold.source) ?? new Map();
  totals.set(gold.source, bucket);
  for (const [k, v] of Object.entries(scores)) {
    const pair = k === "headingPrecision" ? { gold: (v as { predicted: number }).predicted, found: (v as { correct: number }).correct } : (v as { gold: number; found: number });
    const t = bucket.get(k) ?? { gold: 0, found: 0 };
    bucket.set(k, { gold: t.gold + pair.gold, found: t.found + pair.found });
  }
}

const pct = (v: { gold: number; found: number }) => (v.gold ? `${((100 * v.found) / v.gold).toFixed(1)}% (${v.found}/${v.gold})` : "-");
for (const [source, bucket] of totals) {
  console.log(`\n${source}: ${perDoc.filter((d) => d.id.startsWith(source === "europepmc" ? "epmc-" : `${source}-`)).length} docs`);
  for (const [k, v] of bucket) console.log(`  ${k.padEnd(17)} ${k === "leaked" ? "leaked into body " : ""}${pct(v)}`);
}
const out = arg("json");
if (out) fs.writeFileSync(out, JSON.stringify({ totals: Object.fromEntries([...totals].map(([s, b]) => [s, Object.fromEntries(b)])), perDoc }, null, 1));
