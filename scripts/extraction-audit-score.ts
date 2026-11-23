/**
 * Score an extraction audit against publisher JATS paragraphs (local only).
 *
 *   npx vite-node --script scripts/extraction-audit-score.ts -- --run baseline-fieldgold [--split dev|test|all] [--examples N]
 *
 * Europe PMC documents only (their JATS is cached by fetch-field-gold). Prints
 * paragraph integrity, the precision of the Reader's translation-input warning
 * (does a warned block really hold a broken paragraph?) and its recall (are
 * broken paragraphs warned?). With --examples, prints dev-split cases for
 * diagnosis; never use it on the test split.
 */
import fs from "node:fs";
import path from "node:path";
import { alignParagraphs, goldOwnerOf, jatsParagraphs, paragraphCause, type BlockOutcome, type Cause, type DocBlock, type ParagraphOutcome } from "../src/evaluation/extractionAudit/paragraphGold";
import type { AuditSplit } from "../src/evaluation/extractionAudit/split";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const run = arg("run") ?? "baseline-fieldgold";
const split = (arg("split") ?? "all") as AuditSplit | "all";
const examples = Number(arg("examples") ?? 0);
const runDir = path.join(root, "test-data/extraction-audit", run, "docs");
const cacheDir = path.join(root, "test-data/field-gold/_cache/epmc");
// Per gold paragraph, the share of its bigrams printed in the PDF (scripts/paragraph-gold-coverage.ts).
const coverageDir = path.join(root, "test-data/field-gold/_cache/coverage-v2");
const PRINTED = 0.9;

type Dump = { id: string; language: string | null; split: AuditSplit; blocks: Array<{ id: string; type: string; order: number; text: string; warning: string | null; section: string; page: number }> };

const docs: Dump[] = fs
  .readdirSync(runDir)
  .map((f) => JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8")) as Dump)
  .filter((d) => d.id.startsWith("epmc-") && d.language === "en" && (split === "all" || d.split === split))
  .filter((d) => fs.existsSync(path.join(cacheDir, `${d.id.slice(5)}.xml`)));

const para: Record<ParagraphOutcome["verdict"], number> = { intact: 0, split: 0, partial: 0, missing: 0 };
const blockV: Record<BlockOutcome["verdict"], { all: number; warned: number }> = { complete: { all: 0, warned: 0 }, fragment: { all: 0, warned: 0 }, merged: { all: 0, warned: 0 }, outside: { all: 0, warned: 0 } };
const byReason = new Map<string, Record<BlockOutcome["verdict"], number>>();
const causes = new Map<Cause, { n: number; warned: number; docs: Set<string> }>();
const mismatched: string[] = [];
let brokenParas = 0;
const printed = { unprinted: 0 };
let causeShown = 0;
let brokenWarned = 0;
const shown: string[] = [];
for (const doc of docs) {
  const gold = jatsParagraphs(fs.readFileSync(path.join(cacheDir, `${doc.id.slice(5)}.xml`), "utf8"));
  const paragraphs = doc.blocks.filter((b) => b.type === "paragraph");
  const result = alignParagraphs(gold, paragraphs);
  // The PDF is another version than the JATS (most paragraphs not found): the gold does not apply.
  const founds = result.paragraphs.map((p) => p.found).sort((a, b) => a - b);
  // A preprint PDF (bioRxiv / medRxiv / Research Square) against the published JATS: a fifth or more of the
  // paragraphs were rewritten between the versions.
  const preprint = doc.blocks.slice(0, 40).some((b) => /\b(?:bioRxiv|medRxiv|Research Square)\b|this version posted/i.test(b.text));
  const missingShare = result.paragraphs.filter((p) => p.found < 0.3).length / Math.max(1, result.paragraphs.length);
  if ((founds[founds.length >> 1] ?? 0) < 0.5 || (preprint && missingShare >= 0.2)) {
    mismatched.push(doc.id);
    continue;
  }
  const owner = goldOwnerOf(gold);
  const coverageFile = path.join(coverageDir, `${doc.id.slice(5)}.json`);
  const coverage = fs.existsSync(coverageFile) ? (JSON.parse(fs.readFileSync(coverageFile, "utf8")) as number[]) : undefined;
  for (const p of result.paragraphs) {
    // Not printed in this PDF (another version, JATS-only text): no extractor can make it intact,
    // so it is left out of the score.
    if (coverage && p.verdict !== "intact" && (coverage[p.index] ?? 1) < PRINTED) {
      printed.unprinted += 1;
      continue;
    }
    para[p.verdict] += 1;
    if (p.verdict !== "intact") {
      brokenParas += 1;
      if (p.warned) brokenWarned += 1;
      const cause = paragraphCause(gold[p.index].text, p, doc.blocks as DocBlock[], owner);
      const c = causes.get(cause) ?? { n: 0, warned: 0, docs: new Set<string>() };
      c.n += 1;
      if (p.warned) c.warned += 1;
      c.docs.add(doc.id);
      causes.set(cause, c);
      if (arg("cause") === cause && doc.split === "dev" && causeShown < Number(arg("n") ?? 4)) {
        causeShown += 1;
        const main = doc.blocks.find((x) => x.id === p.blocks[0]?.id);
        console.log(`\n[${cause} found ${p.found.toFixed(2)}] ${doc.id} p${main?.page}\n  gold:  ${gold[p.index].text.slice(0, 300)}\n  block: ${(main?.text ?? "-").slice(0, 300)}`);
        if (cause.startsWith("split")) {
          const parts = p.blocks.map((x) => doc.blocks.find((y) => y.id === x.id)!).sort((a, b) => a.order - b.order);
          const lo = parts[0].order, hi = parts[parts.length - 1].order;
          for (const x of doc.blocks.filter((y) => y.order >= lo && y.order <= hi)) {
            const part = parts.includes(x);
            console.log(`    ${part ? "PART" : "    "} #${x.order} ${x.type} p${x.page}${x.warning ? " W" : ""} ${part ? `…${x.text.slice(-70)}` : x.text.slice(0, 90)}`);
          }
        }
      }
    }
  }
  for (const b of result.blocks) {
    blockV[b.verdict].all += 1;
    if (!b.warning) continue;
    blockV[b.verdict].warned += 1;
    const r = byReason.get(b.warning) ?? { complete: 0, fragment: 0, merged: 0, outside: 0 };
    r[b.verdict] += 1;
    byReason.set(b.warning, r);
    if (examples && doc.split === "dev" && shown.length < examples && (!arg("verdict") || arg("verdict") === b.verdict)) {
      const text = paragraphs.find((x) => x.id === b.id)!.text;
      const goldText = b.paragraphs[0] ? gold[b.paragraphs[0].index].text : "";
      shown.push(`[${b.verdict}] ${doc.id} p${paragraphs.find((x) => x.id === b.id)!.page} ${b.warning}\n  block: ${text.slice(0, 160)} … ${text.slice(-80)}\n  gold:  ${goldText.slice(0, 100)} … ${goldText.slice(-80)}`);
    }
  }
}
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
const totalPara = Object.values(para).reduce((a, b) => a + b, 0);
const warned = Object.values(blockV).reduce((a, b) => a + b.warned, 0);
const allBlocks = Object.values(blockV).reduce((a, b) => a + b.all, 0);
if (mismatched.length) console.log(`skipped (PDF and JATS differ): ${mismatched.join(", ")}`);
console.log(`run ${run} split ${split}: ${docs.length - mismatched.length} docs, gold paragraphs ${totalPara}, paragraph blocks ${allBlocks}`);
console.log(`gold paragraphs: intact ${pct(para.intact, totalPara)} split ${pct(para.split, totalPara)} partial ${pct(para.partial, totalPara)} missing ${pct(para.missing, totalPara)} (not printed in the PDF, left out: ${printed.unprinted})`);
console.log(`warned blocks ${warned} (${pct(warned, allBlocks)}): fragment ${blockV.fragment.warned} / complete ${blockV.complete.warned} / merged ${blockV.merged.warned} / outside ${blockV.outside.warned}`);
console.log(`warning precision (fragment or outside) ${pct(blockV.fragment.warned + blockV.outside.warned, warned)}; broken prose paragraphs warned ${pct(brokenWarned, brokenParas)} of ${brokenParas}`);
console.log(`fragment blocks without warning: ${blockV.fragment.all - blockV.fragment.warned} of ${blockV.fragment.all}`);
console.log("causes of broken prose paragraphs (count, warned, documents):");
for (const [cause, c] of [...causes].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(c.n).padStart(4)}  warned ${String(c.warned).padStart(3)}  docs ${String(c.docs.size).padStart(2)}  ${cause}`);
console.log("warnings by reason (block verdicts):");
for (const [reason, r] of [...byReason].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y))) {
  console.log(`  ${String(Object.values(r).reduce((x, y) => x + y)).padStart(4)}  fragment ${r.fragment} complete ${r.complete} merged ${r.merged} outside ${r.outside}  ${reason}`);
}
if (shown.length) console.log(`\n${shown.join("\n")}`);

// --para N: dev-split examples of non-intact gold paragraphs with the blocks they landed in (metric validation).
const paraExamples = Number(arg("para") ?? 0);
if (paraExamples) {
  const verdict = arg("verdict") ?? "partial";
  let n = 0;
  for (const doc of docs.filter((d) => d.split === "dev")) {
    const gold = jatsParagraphs(fs.readFileSync(path.join(cacheDir, `${doc.id.slice(5)}.xml`), "utf8"));
    const paragraphs = doc.blocks.filter((b) => b.type === "paragraph");
    for (const p of alignParagraphs(gold, paragraphs).paragraphs) {
      if (p.verdict !== verdict || n >= paraExamples) continue;
      n += 1;
      const g = gold[p.index].text;
      console.log(`\n[${p.verdict} found ${p.found.toFixed(2)}] ${doc.id}\n  gold:  …${g.slice(-260)}`);
      for (const b of p.blocks) {
        const t = paragraphs.find((x) => x.id === b.id)!;
        console.log(`  block(${b.share.toFixed(2)}${t.warning ? " W" : ""}): …${t.text.slice(-260)}`);
      }
    }
  }
}
