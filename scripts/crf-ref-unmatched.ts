/** Gold / predicted references left unmatched for one document (local diagnostics only; excerpts stay in the terminal). */
import fs from "node:fs";
import path from "node:path";
import { normalizeText, similarity } from "../src/evaluation/fieldGold/normalize";

const root = path.resolve(import.meta.dirname, "..");
const id = process.argv[process.argv.indexOf("--id") + 1];
const parser = process.argv.includes("--parser") ? process.argv[process.argv.indexOf("--parser") + 1] : "versio";
type Ref = { raw: string; title?: string };
const gold = (JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", id, "gold.json"), "utf8")).fields.references ?? []) as Ref[];
const pred = (JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold/runs", parser, "predictions", `${id}.json`), "utf8")).fields.references ?? []) as Ref[];
const score = (x: Ref, y: Ref) => Math.max(similarity(x.raw, y.raw), x.title && y.title ? similarity(x.title, y.title) : 0, x.title && x.title.length >= 15 && normalizeText(y.raw).includes(normalizeText(x.title)) ? 1 : 0);
const cands: Array<[number, number, number]> = [];
gold.forEach((g, i) => pred.forEach((p, j) => cands.push([i, j, score(g, p)])));
cands.sort((a, b) => b[2] - a[2]);
const gi = new Set<number>(), pj = new Set<number>();
for (const [i, j, s] of cands) if (s >= 0.6 && !gi.has(i) && !pj.has(j)) { gi.add(i); pj.add(j); }
const best = (r: Ref, others: Ref[], f: (a: Ref, b: Ref) => number) => Math.max(0, ...others.map((o) => f(r, o)));
console.log(`gold ${gold.length} pred ${pred.length} matched ${gi.size}`);
gold.forEach((g, i) => !gi.has(i) && console.log("G-", best(g, pred, score).toFixed(2), g.raw.slice(0, 110)));
pred.forEach((p, j) => !pj.has(j) && console.log("P-", best(p, gold, (a, b) => score(b, a)).toFixed(2), p.raw.slice(0, 110)));
