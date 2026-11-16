/** Ported from GROBID 0.9.1 Lexicon.java/FastMatcher.java (Apache-2.0), modified. */
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import fs from "node:fs";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import path from "node:path";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import { gunzipSync } from "node:zlib";
import { tokenizeGrobid, isGrobidWhitespace } from "./tokenize";

export type Lexicons = Record<"journals" | "abbrevJournals" | "proceedings" | "publishers" | "location" | "collaborations" | "inspireCollaborations" | "firstNames" | "lastNames", Set<string>>;
const names = { journals: "journals", abbrevJournals: "abbrev_journals", proceedings: "proceedings", publishers: "publishers", location: "location", collaborations: "collaborations", inspireCollaborations: "inspire_collaborations", firstNames: "firstname_5k", lastNames: "lastname_5k" } as const;
let loaded: Lexicons | undefined;

export function loadLexicons(): Lexicons {
  if (loaded) return loaded;
  const result = {} as Lexicons;
  for (const [key, file] of Object.entries(names) as Array<[keyof typeof names, string]>) {
    // The 620k-place gazetteer is retained as a generated asset for measured
    // ablation, but loading it as a JS Set costs >1 GiB for a marginal feature.
    if (key === "location") { result.location = new Set(); continue; }
    const bytes = fs.readFileSync(path.resolve((import.meta as ImportMeta & { dirname: string }).dirname, "assets", `${file}.json.gz`));
    result[key] = new Set((JSON.parse(gunzipSync(bytes).toString("utf8")) as string[]).map((x) => x.toLowerCase()));
  }
  loaded = result; return result;
}

/** Token positions occupied by a GROBID-style case-insensitive gazetteer phrase. */
type Trie = Map<string, Trie> & { hit?: boolean };
const tries = new WeakMap<Set<string>, Trie>();
function trieFor(entries: Set<string>): Trie {
  const cached = tries.get(entries); if (cached) return cached;
  const root = new Map() as Trie;
  for (const entry of entries) {
    const phrase = tokenizeGrobid(entry).filter((x) => !isGrobidWhitespace(x)).map((x) => x.toLowerCase());
    if (!phrase.length) continue;
    let node = root;
    for (const part of phrase) { let next = node.get(part) as Trie | undefined; if (!next) { next = new Map() as Trie; node.set(part, next); } node = next; }
    node.hit = true;
  }
  tries.set(entries, root); return root;
}

export function lexiconPositions(tokens: string[], entries: Set<string>): Set<number> {
  const positions = new Set<number>();
  const indexed = tokens.map((token, index) => ({ token, index })).filter(({ token }) => !isGrobidWhitespace(token));
  // location.txt has 620k entries. A JS trie expands it to >1 GiB, exceeding the
  // CRF's runtime budget; preserve the overwhelmingly common one-token lookup.
  if (entries.size > 100_000) {
    for (const { token, index } of indexed) if (entries.has(token.toLowerCase())) positions.add(index);
    return positions;
  }
  const trie = trieFor(entries);
  for (let start = 0; start < indexed.length; start += 1) {
    let node: Trie | undefined = trie;
    for (let end = start; node && end < indexed.length; end += 1) {
      node = node.get(indexed[end].token.toLowerCase()) as Trie | undefined;
      if (node?.hit) for (let n = start; n <= end; n += 1) positions.add(indexed[n].index);
    }
  }
  return positions;
}
