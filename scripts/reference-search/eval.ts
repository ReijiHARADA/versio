/**
 * Measure "find the DOI from a reference string" against field-gold references.
 *   npx tsx scripts/reference-search/eval.ts [--limit=150] [--source=crossref|openalex|both]
 * Responses are cached in .cache/reference-search/ (gitignored).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import {
  parseCrossrefSearch,
  parseOpenAlexSearch,
  guessReferenceTitle,
  pickReferenceMatch,
  referenceQuery,
  type ReferenceCandidate,
} from "../../src/services/bibliography/referenceMatch";
import { parseBibliographicIdentifier } from "../../src/services/bibliography/identifiers";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const LIMIT = Number(args.limit ?? 150);
const SOURCE = args.source ?? "both";
const CACHE = ".cache/reference-search";
mkdirSync(CACHE, { recursive: true });
const UA = "Versio/1.0 (reference-search evaluation)";

async function cachedGet(url: string): Promise<string> {
  const file = `${CACHE}/${createHash("sha1").update(url).digest("hex")}.json`;
  if (existsSync(file)) return readFileSync(file, "utf8");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const body = await res.text();
      writeFileSync(file, body);
      await new Promise((r) => setTimeout(r, 250));
      return body;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return "{}";
}

export async function search(raw: string, source: string): Promise<ReferenceCandidate[]> {
  const q = encodeURIComponent(referenceQuery(raw));
  const out: ReferenceCandidate[] = [];
  if (source !== "openalex") {
    out.push(
      ...parseCrossrefSearch(
        await cachedGet(
          `https://api.crossref.org/works?query.bibliographic=${q}&rows=5&select=DOI,title,issued,published,author,container-title`
        )
      )
    );
  }
  if (source !== "crossref") {
    const title = guessReferenceTitle(raw);
    if (title) {
      const t = encodeURIComponent(title.replace(/[,:|]/g, " "));
      out.push(...parseOpenAlexSearch(await cachedGet(`https://api.openalex.org/works?filter=title.search:${t}&per-page=5`)));
    }
  }
  return out;
}

type Ref = { raw: string; doi?: string; title?: string; set: string };
// Seeded shuffle so runs are comparable.
function shuffle<T>(xs: T[], seed = 7): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const refs: Ref[] = [];
for (const dir of readdirSync("test-data/field-gold").sort()) {
  const file = `test-data/field-gold/${dir}/gold.json`;
  if (!existsSync(file)) continue;
  const set = dir.split("-")[0];
  const gold = JSON.parse(readFileSync(file, "utf8"));
  for (const r of gold.fields?.references ?? []) if (r.raw) refs.push({ ...r, set });
}
const stripIds = (raw: string) =>
  raw
    .replace(/(https?:\/\/(dx\.)?doi\.org\/|doi:?\s*)?10\.\d{4,9}\/\S+/gi, " ")
    .replace(/arxiv(\s*preprint)?\s*(arxiv)?\s*:?\s*\d{4}\.\d{4,5}(v\d+)?/gi, " ")
    .replace(/abs\/\d{4}\.\d{4,5}/gi, " ");

// A: EPMC with gold DOI. B: arXiv refs that name an arXiv id (id stripped). C: arXiv refs with no id.
const A = shuffle(refs.filter((r) => r.set === "epmc" && r.doi)).slice(0, LIMIT);
const arxivIdOf = (raw: string) => raw.match(/(\d{4}\.\d{4,5})/)?.[1];
const B = shuffle(refs.filter((r) => r.set === "arxiv" && /arxiv[^0-9]{0,20}\d{4}\.\d{4,5}/i.test(r.raw))).slice(0, Math.round(LIMIT / 2));
const C = shuffle(refs.filter((r) => r.set === "arxiv" && !/arxiv|doi|10\.\d{4}/i.test(r.raw))).slice(0, Math.round(LIMIT / 2));

const samples: string[] = [];
async function run(name: string, list: Ref[], judge: (r: Ref, c: ReferenceCandidate) => "ok" | "wrong" | "?") {
  const n = { ok: 0, wrong: 0, unknown: 0, none: 0 };
  for (const r of list) {
    const raw = stripIds(r.raw);
    let m = pickReferenceMatch(raw, await search(raw, SOURCE === "both" ? "crossref" : SOURCE));
    if (!m && SOURCE === "both") m = pickReferenceMatch(raw, await search(raw, "openalex"));
    if (!m) {
      n.none++;
      continue;
    }
    const v = judge(r, m.candidate);
    if (v === "ok") n.ok++;
    else if (v === "wrong") {
      n.wrong++;
      samples.push(`WRONG ${name}: ${raw.slice(0, 140)}\n   -> ${m.candidate.title} (${m.candidate.year}) ${m.candidate.doi} gold=${r.doi ?? ""}`);
    } else {
      n.unknown++;
      if (samples.length < 60) samples.push(`?? ${name}: ${raw.slice(0, 120)}\n   -> ${m.candidate.title} (${m.candidate.year}) ${m.candidate.doi}`);
    }
  }
  const t = list.length;
  console.log(`${name}: n=${t} accepted=${t - n.none} (${((100 * (t - n.none)) / t).toFixed(1)}%) ok=${n.ok} wrong=${n.wrong} unverified=${n.unknown}`);
}

await run("A epmc(gold DOI)", A, (r, c) => (c.doi.toLowerCase() === r.doi!.toLowerCase() ? "ok" : "wrong"));
await run("B arxiv(id stripped)", B, (r, c) => {
  const id = parseBibliographicIdentifier(c.doi);
  if (id?.kind === "arxiv" && id.id.replace(/v\d+$/, "") === arxivIdOf(r.raw)) return "ok";
  return "?";
});
await run("C arxiv(no id)", C, () => "?");
writeFileSync(`${CACHE}/samples-${SOURCE}.txt`, samples.join("\n"));
console.log(`samples: ${CACHE}/samples-${SOURCE}.txt`);
