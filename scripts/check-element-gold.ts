/**
 * Check reviewed element gold against the PDF's own text layer (local only).
 *
 *   npx vite-node --script scripts/check-element-gold.ts -- [--ids a,b]
 *
 * Claude's review can misread or invent text. Every gold string must be printed in the
 * PDF: each item is looked up in the text layer (word trigrams, so reading order barely
 * matters). Items below 80% are listed; a reviewed gold with any of them is not accepted
 * until they are fixed or explained in review.notes. Exit code 1 when anything fails.
 */
import fs from "node:fs";
import path from "node:path";
import { containment } from "../src/evaluation/elementGold/score";
import type { ElementGold } from "../src/evaluation/elementGold/types";
import { tokens } from "../src/evaluation/extractionAudit/paragraphGold";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "test-data/element-gold");
const args = process.argv.slice(2);
const ids = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : null;
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")) as Array<{ id: string }>;

let failed = 0;
let reviewed = 0;
for (const { id } of index) {
  if (ids && !ids.includes(id)) continue;
  const file = path.join(dir, id, "gold.json");
  if (!fs.existsSync(file)) continue;
  reviewed += 1;
  const g = JSON.parse(fs.readFileSync(file, "utf8")) as ElementGold;
  const raw = (await extractPdfPages(path.join(dir, id, "source.pdf"))).map((p) => p.textItems.map((t) => t.text).join(" ")).join("\n");
  const t = tokens(raw.replace(/(\p{L})[-­]\s+(\p{Ll})/gu, "$1$2"));
  const printed = new Set(t.flatMap((x, i) => [x, ...(i >= 1 ? [`${t[i - 1]} ${x}`] : []), ...(i >= 2 ? [`${t[i - 2]} ${t[i - 1]} ${x}`] : [])]));
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  // Small caps ("I NTRODUCTION") and decomposed accents split words in the text layer: compare letters only.
  const letters = (x: string) => x.normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const printedLetters = letters(raw);
  const items: Array<[string, string]> = [
    ["title", g.title],
    ...g.authors.map((a): [string, string] => ["author", a]),
    ...g.affiliations.map((a): [string, string] => ["affiliation", a]),
    ...(g.venue ? [["venue", g.venue] as [string, string]] : []),
    ...(g.permissions ? [["permissions", g.permissions] as [string, string]] : []),
    ...g.headings.map((h): [string, string] => ["heading", h.text]),
    ...g.footnotes.map((f): [string, string] => ["footnote", f]),
    ...g.figures.map((f): [string, string] => ["figure", `${f.label ?? ""} ${f.caption}`]),
    ...g.tables.map((x): [string, string] => ["table", `${x.label ?? ""} ${x.caption}`]),
    ...g.paragraphs.map((p): [string, string] => ["paragraph", p]),
  ];
  const bad = items.filter(([, s]) => tokens(s).length > 0 && containment(s, printed) < 0.8 && !(s.length <= 400 && printedLetters.includes(letters(s))));
  // Emails, DOIs and URLs are compared without spaces (the text layer splits them at line ends).
  // "{ann, bob}@lab.org" prints one address per name: an email counts when its user and domain are both printed.
  const emailPrinted = (e: string) => compact.includes(e.toLowerCase()) || e.toLowerCase().split("@").every((part) => compact.includes(part));
  const strict = [
    ...g.emails.filter((e) => !emailPrinted(e)),
    ...[...(g.doi ? [g.doi] : []), ...g.links].filter((s) => !compact.includes(s.replace(/\s+/g, "").toLowerCase().replace(/^https?:\/\//, ""))),
  ];
  if (bad.length || strict.length) {
    failed += 1;
    console.log(`\n${id}: ${bad.length + strict.length} item(s) not found in the printed text${g.review?.notes ? ` (notes: ${g.review.notes.slice(0, 160)})` : ""}`);
    for (const [kind, s] of bad.slice(0, 12)) console.log(`  ${kind}: ${s.slice(0, 140)}`);
    for (const s of strict.slice(0, 6)) console.log(`  exact: ${s}`);
  }
}
console.log(`\n${reviewed} reviewed gold file(s), ${failed} with unprinted items`);
process.exitCode = failed ? 1 : 0;
