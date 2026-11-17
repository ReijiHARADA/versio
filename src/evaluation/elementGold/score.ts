import { alignParagraphs, tokens } from "../extractionAudit/paragraphGold";
import { similarity } from "../fieldGold/normalize";
import type { ElementGold } from "./types";

export type ScoredBlock = { id: string; type: string; text: string; warning?: string | null; cells?: string[] };
export type ScoredPaper = { title: string | null; authors: string[]; publication: string | null; doi: string | null };

/** found / gold for each element kind; `leaked` counts front/back matter that ended up in body paragraphs. */
export type ElementScores = Record<
  "title" | "authors" | "doi" | "venue" | "headings" | "paragraphs" | "footnotes" | "figures" | "tables" | "tableCells" | "equations" | "references" | "links",
  { gold: number; found: number }
> & { headingPrecision: { predicted: number; correct: number }; leaked: { gold: number; found: number; examples: string[] } };

const trigrams = (s: string): string[] => {
  const t = tokens(s);
  return t.length < 3 ? (t.length ? [t.join(" ")] : []) : t.slice(2).map((x, i) => `${t[i]} ${t[i + 1]} ${x}`);
};
/** Every 1-, 2- and 3-gram, so needles shorter than three words ("Methods") can be found too. */
const ngrams = (s: string): string[] => {
  const t = tokens(s);
  return t.flatMap((x, i) => [x, ...(i >= 1 ? [`${t[i - 1]} ${x}`] : []), ...(i >= 2 ? [`${t[i - 2]} ${t[i - 1]} ${x}`] : [])]);
};
/** Share of `needle`'s word trigrams present in `hay` (a precomputed trigram set). */
export function containment(needle: string, hay: Set<string>): number {
  const g = [...new Set(trigrams(needle))];
  return g.length ? g.filter((x) => hay.has(x)).length / g.length : 0;
}
const setOf = (texts: string[]) => new Set(texts.flatMap(ngrams));
/** Heading text without its section number ("2.1.", "II.", "A") so "2.1. Methods" matches "2.1 Methods". */
const bareHeading = (s: string) => s.replace(/^\s*(?:[0-9]+(?:\.[0-9]+)*\.?|[IVX]+\.|[A-Z]\.?)\s+/, "").trim();
const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[\s/.,;)]+$/, "");

/**
 * Gold items not printed in this PDF (JATS-only notes, another version) are dropped
 * before scoring: `printed` is the PDF's own text layer, independent of the extractor.
 */
export function scoreElements(gold: ElementGold, blocks: ScoredBlock[], paper: ScoredPaper, printedText: string): ElementScores {
  const printed = setOf([printedText]);
  const isPrinted = (s: string) => containment(s, printed) >= 0.8;
  const byType = (...types: string[]) => blocks.filter((b) => types.includes(b.type));
  const ratio = <T>(items: T[], ok: (x: T) => boolean) => ({ gold: items.length, found: items.filter(ok).length });

  const headingBlocks = byType("heading").map((b) => bareHeading(b.text));
  const goldHeadings = gold.headings.map((h) => bareHeading(h.text)).filter((h) => h && isPrinted(h));
  // A run-in heading ("Study setting. Participants were…") is printed inside its paragraph.
  const runIn = byType("paragraph").map((b) => tokens(bareHeading(b.text)).slice(0, 12).join(" "));
  const headingHit = (h: string) => headingBlocks.some((b) => similarity(b, h) >= 0.85) || (tokens(h).length > 0 && runIn.some((p) => p.startsWith(tokens(h).join(" "))));
  const paragraphs = byType("paragraph");
  const paraSet = setOf(paragraphs.map((b) => b.text));
  const footSet = setOf(byType("footnote").map((b) => b.text));
  const inOne = (needle: string, candidates: ScoredBlock[]) => candidates.find((b) => containment(needle, setOf([b.text])) >= 0.8);
  const figureBlocks = byType("figure");
  const tableBlocks = byType("table");
  const allText = blocks.map((b) => b.text).join(" ").replace(/\s+/g, "").toLowerCase();

  const tablesPrinted = gold.tables.filter((t) => t.caption && isPrinted(t.caption));
  let cellsGold = 0;
  let cellsFound = 0;
  for (const t of tablesPrinted) {
    const block = inOne(t.caption.slice(0, 200), tableBlocks);
    const cells = t.cells.filter((c) => tokens(c).length > 0);
    cellsGold += cells.length;
    if (!block) continue;
    const have = new Set(tokens([block.text, ...(block.cells ?? [])].join(" ")));
    cellsFound += cells.filter((c) => tokens(c).every((x) => have.has(x))).length;
  }

  // Front/back matter that must not be read as body text.
  const leakItems = [...gold.affiliations, ...(gold.permissions ? [gold.permissions] : []), ...gold.footnotes].filter((s) => tokens(s).length >= 6 && isPrinted(s));
  const leaked = leakItems.filter((s) => containment(s, paraSet) >= 0.8 && containment(s, footSet) < 0.8);

  const scorable = gold.paragraphs.filter((p) => tokens(p).length >= 25 && isPrinted(p));
  const aligned = alignParagraphs(scorable.map((text, index) => ({ index, part: "body" as const, text, hasDisplayFormula: false })), paragraphs.map((b) => ({ id: b.id, text: b.text, warning: b.warning ?? null })));

  const refBlocks = byType("reference").map((b) => setOf([b.text]));
  return {
    title: ratio([gold.title].filter(Boolean), (t) => similarity(t, paper.title ?? "") >= 0.9),
    authors: ratio(gold.authors, (a) => paper.authors.some((p) => similarity(p, a) >= 0.85)),
    doi: ratio([gold.doi].filter((d): d is string => !!d), (d) => d.toLowerCase() === (paper.doi ?? "").toLowerCase()),
    venue: ratio([gold.venue].filter((v): v is string => !!v && isPrinted(v)), (v) => !!paper.publication && (similarity(v, paper.publication) >= 0.8 || containment(v, setOf([paper.publication])) >= 0.8)),
    headings: ratio(goldHeadings, headingHit),
    headingPrecision: { predicted: headingBlocks.length, correct: headingBlocks.filter((b) => goldHeadings.some((h) => similarity(b, h) >= 0.85)).length },
    paragraphs: { gold: aligned.paragraphs.length, found: aligned.paragraphs.filter((p) => p.verdict === "intact").length },
    footnotes: ratio(gold.footnotes.filter((f) => tokens(f).length >= 4 && isPrinted(f)), (f) => containment(f, footSet) >= 0.8),
    figures: ratio(gold.figures.filter((f) => f.caption && isPrinted(f.caption)), (f) => !!inOne(f.caption.slice(0, 200), figureBlocks)),
    tables: ratio(tablesPrinted, (t) => !!inOne(t.caption.slice(0, 200), tableBlocks)),
    tableCells: { gold: cellsGold, found: cellsFound },
    // Count agreement: an extractor that finds 8 of 10 equations scores 8; one that finds 12 also scores 8.
    equations: { gold: gold.equations, found: Math.max(0, gold.equations - Math.abs(gold.equations - byType("equation").length)) },
    references: ratio(gold.references.filter((r) => tokens(r).length >= 4), (r) => refBlocks.some((s) => containment(r, s) >= 0.6)),
    links: ratio(gold.links.filter((u) => isPrinted(u) || printedText.replace(/\s+/g, "").toLowerCase().includes(urlKey(u))), (u) => allText.includes(urlKey(u))),
    leaked: { gold: leakItems.length, found: leaked.length, examples: leaked.slice(0, 3).map((s) => s.slice(0, 120)) },
  };
}
