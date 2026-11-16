/**
 * Pick dev-split pages for model-assisted paragraph transcription and render them (local only).
 *
 *   npx vite-node --script scripts/extraction-audit-pages.ts -- --run baseline-fieldgold --warned 12 --random 12 --verify 6
 *
 * Writes test-data/extraction-audit/vision/pages.json and one PNG per page
 * (pdftoppm, 110 dpi). Pages come only from dev-split, CC-licensed field-gold
 * documents; "verify" pages are Europe PMC pages whose JATS lets the
 * transcription itself be checked. The seed is fixed so the sample is stable.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const run = arg("run", "baseline-fieldgold");
const outDir = path.join(root, "test-data/extraction-audit/vision");
fs.mkdirSync(outDir, { recursive: true });

let seed = 20261116;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const shuffle = <T,>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

type Dump = { id: string; language: string | null; split: string; pages: number; blocks: Array<{ page: number; warning: string | null; type: string }> };
const docs = fs
  .readdirSync(path.join(root, "test-data/extraction-audit", run, "docs"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, "test-data/extraction-audit", run, "docs", f), "utf8")) as Dump)
  .filter((d) => d.split === "dev" && d.language === "en");

type Pick = { id: string; page: number; kind: "warned" | "random" | "verify"; png: string };
const picks: Pick[] = [];
const taken = new Set<string>();
const add = (id: string, page: number, kind: Pick["kind"]) => {
  const key = `${id}#${page}`;
  if (taken.has(key)) return false;
  taken.add(key);
  picks.push({ id, page, kind, png: `${id}-p${page}.png` });
  return true;
};
// Body pages only: skip the first page (front matter) and the last two (references).
const bodyPages = (d: Dump) => Array.from({ length: Math.max(0, d.pages - 3) }, (_, i) => i + 2);
const arxiv = shuffle(docs.filter((d) => d.id.startsWith("arxiv-")));
const epmc = shuffle(docs.filter((d) => d.id.startsWith("epmc-")));
let w = Number(arg("warned", "12"));
for (const d of arxiv) {
  if (w <= 0) break;
  const pages = shuffle([...new Set(d.blocks.filter((b) => b.warning && b.type === "paragraph").map((b) => b.page))].filter((p) => bodyPages(d).includes(p)));
  if (pages[0] && add(d.id, pages[0], "warned")) w -= 1;
}
let r = Number(arg("random", "12"));
for (const d of shuffle(arxiv)) {
  if (r <= 0) break;
  const page = shuffle(bodyPages(d))[0];
  if (page && add(d.id, page, "random")) r -= 1;
}
let v = Number(arg("verify", "6"));
for (const d of epmc) {
  if (v <= 0) break;
  const page = shuffle(bodyPages(d))[0];
  if (page && add(d.id, page, "verify")) v -= 1;
}
for (const p of picks) {
  const gold = JSON.parse(fs.readFileSync(path.join(root, "test-data/field-gold", p.id, "gold.json"), "utf8")) as { pdfPath: string };
  const prefix = path.join(outDir, p.png.replace(/\.png$/, ""));
  execFileSync("pdftoppm", ["-png", "-r", "110", "-f", String(p.page), "-l", String(p.page), "-singlefile", path.join(root, gold.pdfPath), prefix]);
}
fs.writeFileSync(path.join(outDir, "pages.json"), JSON.stringify(picks, null, 1));
console.log(`${picks.length} pages → ${path.relative(root, outDir)} (${picks.filter((p) => p.kind === "warned").length} warned, ${picks.filter((p) => p.kind === "random").length} random, ${picks.filter((p) => p.kind === "verify").length} verify)`);
