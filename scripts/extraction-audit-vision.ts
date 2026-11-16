/**
 * Check model-made page transcriptions, then score an extraction run against them (local only).
 *
 *   npx vite-node --script scripts/extraction-audit-vision.ts -- --run baseline-fieldgold
 *
 * 1. Faithfulness: every transcribed body unit must be found in the page's own
 *    PDF text layer (5-token shingles, line-break hyphens joined). Units below
 *    90% are reported and excluded from scoring.
 * 2. Boundaries (Europe PMC pages): each complete body unit should match one
 *    JATS paragraph; reported as agreement.
 * 3. Scoring: complete body/list units on a page are gold paragraphs for the
 *    run's blocks on that page (same alignment as the JATS scorer).
 */
import fs from "node:fs";
import path from "node:path";
import { alignParagraphs, jatsParagraphs, tokens, type GoldParagraph } from "../src/evaluation/extractionAudit/paragraphGold";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const run = args[args.indexOf("--run") + 1] ?? "baseline-fieldgold";
const visionDir = path.join(root, "test-data/extraction-audit/vision");

type Unit = { kind: string; startsOnThisPage: boolean; endsOnThisPage: boolean; text: string };
type Labels = { page: string; columns: number; units: Unit[] };
type Pick = { id: string; page: number; kind: string; png: string };
const picks = JSON.parse(fs.readFileSync(path.join(visionDir, "pages.json"), "utf8")) as Pick[];
const shingleSet = (s: string) => {
  const t = tokens(s);
  return new Set(Array.from({ length: Math.max(0, t.length - 4) }, (_, i) => t.slice(i, i + 5).join(" ")));
};
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / Math.max(1, a.size);

let units = 0, faithful = 0, epmcUnits = 0, epmcAgree = 0;
const lowFaith: string[] = [];
const verdicts: Record<string, number> = { intact: 0, split: 0, partial: 0, missing: 0 };
const blockVerdicts: Record<string, { all: number; warned: number }> = {};
for (const pick of picks) {
  const file = path.join(visionDir, pick.png.replace(/\.png$/, ".labels.json"));
  if (!fs.existsSync(file)) continue;
  const labels = JSON.parse(fs.readFileSync(file, "utf8")) as Labels;
  const gold = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", pick.id, "gold.json"), "utf8")) as { pdfPath: string };
  const page = (await extractPdfPages(path.join(root, gold.pdfPath))).find((p) => p.pageNumber === pick.page)!;
  const layer = shingleSet(page.textItems.map((i) => i.text).join(" ").replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2"));
  const layerHyphen = shingleSet(page.textItems.map((i) => i.text).join(" "));
  const prose = labels.units.filter((u) => (u.kind === "body" || u.kind === "list-item") && tokens(u.text).length >= 25);
  const trusted: Unit[] = [];
  for (const u of prose) {
    units += 1;
    const sh = shingleSet(u.text);
    const f = Math.max(overlap(sh, layer), overlap(sh, layerHyphen));
    if (f >= 0.9) {
      faithful += 1;
      trusted.push(u);
    } else lowFaith.push(`${pick.png} ${f.toFixed(2)} ${u.text.slice(0, 70)}`);
  }
  if (pick.id.startsWith("epmc-")) {
    const jats = jatsParagraphs(fs.readFileSync(path.join(root, "test-data/field-gold/_cache/epmc", `${pick.id.slice(5)}.xml`), "utf8")).map((p) => shingleSet(p.text));
    for (const u of trusted.filter((x) => x.startsOnThisPage && x.endsOnThisPage)) {
      epmcUnits += 1;
      const sh = shingleSet(u.text);
      // One JATS paragraph holds ≥ 90% of the unit and the unit covers ≥ 90% of it.
      if (jats.some((j) => overlap(sh, j) >= 0.9 && overlap(j, sh) >= 0.9)) epmcAgree += 1;
    }
  }
  // Score the run's blocks on this page against the trusted, complete units.
  const dumpFile = path.join(root, "test-data/extraction-audit", run, "docs", `${pick.id}.json`);
  if (!fs.existsSync(dumpFile)) continue;
  const dump = JSON.parse(fs.readFileSync(dumpFile, "utf8")) as { blocks: Array<{ id: string; type: string; page: number; text: string; warning: string | null }> };
  const blocks = dump.blocks.filter((b) => b.type === "paragraph" && (b.page === pick.page || b.page === pick.page - 1));
  const goldParas: GoldParagraph[] = trusted.filter((u) => u.startsOnThisPage && u.endsOnThisPage).map((u, index) => ({ index, part: "body", text: u.text, hasDisplayFormula: false }));
  const result = alignParagraphs(goldParas, blocks);
  for (const p of result.paragraphs) verdicts[p.verdict] += 1;
  for (const b of result.blocks.filter((x) => blocks.find((y) => y.id === x.id)!.page === pick.page)) {
    blockVerdicts[b.verdict] ??= { all: 0, warned: 0 };
    blockVerdicts[b.verdict].all += 1;
    if (b.warning) blockVerdicts[b.verdict].warned += 1;
  }
}
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
console.log(`transcription faithfulness: ${faithful}/${units} prose units ≥ 90% in the PDF text layer (${pct(faithful, units)})`);
for (const l of lowFaith.slice(0, 8)) console.log(`  low: ${l}`);
console.log(`paragraph boundaries vs JATS (Europe PMC pages): ${epmcAgree}/${epmcUnits} (${pct(epmcAgree, epmcUnits)})`);
const total = Object.values(verdicts).reduce((a, b) => a + b, 0);
console.log(`run ${run}: gold paragraphs ${total}: intact ${pct(verdicts.intact, total)} split ${pct(verdicts.split, total)} partial ${pct(verdicts.partial, total)} missing ${pct(verdicts.missing, total)}`);
console.log(`blocks on these pages: ${Object.entries(blockVerdicts).map(([k, v]) => `${k} ${v.all} (warned ${v.warned})`).join(", ")}`);
