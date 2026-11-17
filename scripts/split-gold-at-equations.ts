/**
 * Split reviewed element gold at display equations after changing the LaTeX draft rule.
 *
 * Run locally with: npx vite-node --script scripts/split-gold-at-equations.ts
 * The script keeps reviewer wording by slicing existing gold paragraphs, never copying draft text.
 */
import fs from "node:fs";
import path from "node:path";
import { latexElementDraft } from "../src/evaluation/elementGold/latex";
import { printedWords, snapToPrinted } from "../src/evaluation/elementGold/snap";
import { tokens } from "../src/evaluation/extractionAudit/paragraphGold";
import type { ElementGold } from "../src/evaluation/elementGold/types";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { unpackSource } from "./lib/arxivSource";

const root = path.resolve(import.meta.dirname, "..");
const goldDir = path.join(root, "test-data/element-gold");
const note = "2026-11-17: split at display equations (scripts/split-gold-at-equations.ts)";
type Entry = { id: string; arxivId: string; source: ElementGold["source"]; license: string; sourceUrl: string };
type Word = { key: string; start: number; end: number };

const words = (text: string): Word[] => [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ key: m[0].normalize("NFKC").toLowerCase(), start: m.index!, end: m.index! + m[0].length }));

function overlap(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const token of a) counts.set(token, (counts.get(token) ?? 0) + 1);
  let common = 0;
  for (const token of b) {
    const count = counts.get(token) ?? 0;
    if (count) { common += 1; counts.set(token, count - 1); }
  }
  return common;
}

function matchingPieces(gold: string, drafts: string[]): string[] | null {
  const goldTokens = tokens(gold);
  let best: { pieces: string[]; score: number } | null = null;
  for (let start = 0; start < drafts.length; start += 1) {
    const candidate: string[] = [];
    for (let end = start; end < drafts.length && candidate.length <= goldTokens.length * 1.2 + 20; end += 1) {
      candidate.push(...tokens(drafts[end]));
      if (end === start) continue;
      const common = overlap(goldTokens, candidate);
      const score = Math.min(common / goldTokens.length, common / candidate.length);
      if (score >= 0.95 && (!best || score > best.score)) best = { pieces: drafts.slice(start, end + 1), score };
    }
  }
  return best?.pieces ?? null;
}

/** Split the original string at LCS-aligned boundaries, retaining the reviewer's exact words. */
function sliceGold(gold: string, pieces: string[]): string[] | null {
  const source = words(gold);
  const drafted = pieces.flatMap((piece, pieceIndex) => tokens(piece).map((key) => ({ key, pieceIndex })));
  const dp = Array.from({ length: drafted.length + 1 }, () => new Uint16Array(source.length + 1));
  for (let i = drafted.length - 1; i >= 0; i -= 1) for (let j = source.length - 1; j >= 0; j -= 1) dp[i][j] = drafted[i].key === source[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const first = Array<number>(pieces.length).fill(-1);
  const last = Array<number>(pieces.length).fill(-1);
  for (let i = 0, j = 0; i < drafted.length && j < source.length;) {
    if (drafted[i].key === source[j].key) {
      const part = drafted[i].pieceIndex;
      if (first[part] < 0) first[part] = j;
      last[part] = j;
      i += 1; j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  if (first.some((x) => x < 0)) return null;
  const boundaries = [0];
  for (let i = 0; i + 1 < pieces.length; i += 1) {
    const boundary = Math.floor((last[i] + first[i + 1]) / 2) + 1;
    if (boundary <= boundaries.at(-1)! || boundary >= source.length) return null;
    boundaries.push(boundary);
  }
  boundaries.push(source.length);
  const slices = boundaries.slice(0, -1).map((from, i) => gold.slice(from === 0 ? 0 : source[from].start, i + 1 === pieces.length ? gold.length : source[boundaries[i + 1]].start).trim());
  return slices.every((slice) => tokens(slice).length >= 8) ? slices : null;
}

const index = JSON.parse(fs.readFileSync(path.join(goldDir, "index.json"), "utf8")) as Entry[];
let papers = 0;
let splits = 0;
for (const entry of index) {
  const file = path.join(goldDir, entry.id, "gold.json");
  if (!fs.existsSync(file)) continue;
  const safe = entry.arxivId.replace(/\//g, "_");
  const archive = fs.readFileSync(path.join(goldDir, "_cache/arxiv", `${safe}.eprint`));
  const source = unpackSource(archive, path.join(goldDir, "_cache/arxiv-src", safe));
  if (!source) throw new Error(`${entry.id}: cannot unpack LaTeX source`);
  const raw = (await extractPdfPages(path.join(goldDir, entry.id, "source.pdf"))).map((page) => page.textItems.map((item) => item.text).join(" ")).join("\n");
  const draft = latexElementDraft(source, entry);
  const draftParagraphs = draft.paragraphs.map((paragraph) => snapToPrinted(paragraph, printedWords(raw))).filter((result) => result.matched >= 0.6).map((result) => result.text);
  const gold = JSON.parse(fs.readFileSync(file, "utf8")) as ElementGold;
  let fileSplits = 0;
  gold.paragraphs = gold.paragraphs.flatMap((paragraph) => {
    const pieces = matchingPieces(paragraph, draftParagraphs);
    const slices = pieces && sliceGold(paragraph, pieces);
    if (!slices) return [paragraph];
    fileSplits += 1;
    return slices;
  });
  if (fileSplits) {
    gold.review = { ...gold.review!, notes: gold.review!.notes.includes(note) ? gold.review!.notes : `${gold.review!.notes}\n${note}` };
    fs.writeFileSync(file, `${JSON.stringify(gold, null, 2)}\n`);
    papers += 1;
    splits += fileSplits;
  }
  console.log(`${entry.id}: ${fileSplits} paragraph(s) split`);
}
console.log(`\n${papers} paper(s), ${splits} paragraph(s) split`);
