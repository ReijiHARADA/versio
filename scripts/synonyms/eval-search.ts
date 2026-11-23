/**
 * Recall / precision of library search with and without dictionary expansion.
 *
 *   npx tsx scripts/synonyms/eval-search.ts
 *
 * Corpora (local only, gitignored):
 * - `real`: English-only text of `test-data/real-papers/*.pdf` (pdftotext →
 *   `.cache/synonyms-eval/real/`): a Japanese query has to cross languages.
 * - `library`: `<AppData>/papers/*` original.md + ja.md (the user's own library).
 * Queries and relevance: `scripts/synonyms/eval-queries.tsv` (a paper is relevant
 * when it contains any gold term; gold terms are written independently of the
 * dictionary). Search is the production matcher (`scoreFields`) over the
 * production index text.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeIndexText, normalizeSearchText } from "../../src/domain/search/normalizeSearchText";
import { buildSearchQuery, scoreFields, type SearchQuery } from "../../src/domain/search/searchQuery";
import { SynonymDictionary, type SynonymLookup } from "../../src/domain/search/synonymDictionary";
import { composeLookups, libraryTermsLookup } from "../../src/domain/search/lookups";
import { extractAbbreviations } from "../../src/domain/search/abbreviations";

const ROOT = join(import.meta.dirname, "..", "..");
type Paper = { id: string; raw: string; fields: { text: string; weight: number }[] };

function realCorpus(): Paper[] {
  const dir = join(ROOT, ".cache", "synonyms-eval", "real");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".txt"))
    .map((file) => {
      const raw = readFileSync(join(dir, file), "utf8");
      return { id: file, raw, fields: [{ text: normalizeIndexText(raw), weight: 1 }] };
    });
}

function libraryCorpus(): Paper[] {
  const dir = join(homedir(), "Library", "Application Support", "com.harada.versio", "papers");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, "original.md")))
    .map((id) => {
      const original = readFileSync(join(dir, id, "original.md"), "utf8");
      const ja = existsSync(join(dir, id, "ja.md")) ? readFileSync(join(dir, id, "ja.md"), "utf8") : "";
      return {
        id,
        raw: `${original}\n${ja}`,
        fields: [
          { text: normalizeIndexText(original), weight: 1 },
          { text: normalizeIndexText(ja), weight: 1 },
        ],
      };
    });
}

type EvalQuery = { category: string; query: string; gold: string[] };

function readQueries(): EvalQuery[] {
  return readFileSync(join(import.meta.dirname, "eval-queries.tsv"), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [category, query, gold] = line.split("\t");
      return { category, query, gold: gold.split("|") };
    });
}

/** Relevance uses the same matcher, with every gold term as an OR variant. */
function goldQuery(gold: string[]): SearchQuery {
  // As an English dictionary word would match (word start), so relevance does not favour either system.
  const variants = gold.map((term) => ({
    term: normalizeSearchText(term),
    label: term,
    weight: 1,
    relation: "translation" as const,
  }));
  return { groups: [{ term: "gold", variants, suggestions: [] }] };
}

type Score = { recall: number; precision: number; retrieved: number; relevant: number };

function evaluate(corpus: Paper[], query: EvalQuery, lookup: SynonymLookup | null): Score | null {
  const relevant = new Set(corpus.filter((paper) => scoreFields(paper.fields, goldQuery(query.gold)) > 0).map((paper) => paper.id));
  if (relevant.size === 0) return null;
  const parsed = buildSearchQuery(query.query, { dictionary: lookup });
  const retrieved = corpus.filter((paper) => scoreFields(paper.fields, parsed) > 0).map((paper) => paper.id);
  const hits = retrieved.filter((id) => relevant.has(id)).length;
  return {
    recall: hits / relevant.size,
    precision: retrieved.length ? hits / retrieved.length : 1,
    retrieved: retrieved.length,
    relevant: relevant.size,
  };
}

const dictionary = new SynonymDictionary(JSON.parse(readFileSync(join(ROOT, "src", "generated", "synonyms.json"), "utf8")));
const queries = readQueries();
const fmt = (value: number) => value.toFixed(2);

for (const [name, corpus] of [
  ["real (English only)", realCorpus()],
  ["library (original + ja)", libraryCorpus()],
] as const) {
  if (corpus.length === 0) {
    console.log(`${name}: no papers`);
    continue;
  }
  const libraryTerms = libraryTermsLookup(corpus.flatMap((paper) => extractAbbreviations(paper.raw).map(({ abbr, longForm }) => ({ term: abbr, longForm }))));
  const systems: Array<[string, SynonymLookup | null]> = [
    ["normalized only", null],
    ["+ bundled dictionary", dictionary],
    ["+ library terms", composeLookups([dictionary, libraryTerms])],
  ];
  console.log(`\n## ${name}: ${corpus.length} papers`);
  const categories = [...new Set(queries.map((query) => query.category)), "all"];
  console.log(`| system | ${categories.map((category) => `${category} R / P`).join(" | ")} |`);
  console.log(`| --- | ${categories.map(() => "---").join(" | ")} |`);
  const perQuery: string[] = [];
  for (const [system, lookup] of systems) {
    const cells = categories.map((category) => {
      const scores = queries
        .filter((query) => category === "all" || query.category === category)
        .map((query) => {
          const score = evaluate(corpus, query, lookup);
          if (score && system !== "normalized only") perQuery.push(`${system}\t${query.query}\t${fmt(score.recall)}\t${fmt(score.precision)}\t${score.retrieved}/${score.relevant}`);
          return score;
        })
        .filter((score): score is Score => score !== null);
      if (scores.length === 0) return "–";
      const mean = (key: "recall" | "precision") => scores.reduce((sum, score) => sum + score[key], 0) / scores.length;
      return `${fmt(mean("recall"))} / ${fmt(mean("precision"))} (n=${scores.length})`;
    });
    console.log(`| ${system} | ${cells.join(" | ")} |`);
  }
  if (process.argv.includes("--per-query")) console.log(perQuery.filter((line) => line.startsWith("+ library")).join("\n"));
}
