/** Ported from GROBID 0.9.1 Lexicon.java / FastMatcher.java / Utilities.java (Apache-2.0), modified. */
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import fs from "node:fs";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import path from "node:path";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import { gunzipSync } from "node:zlib";
import { GROBID_DELIMITERS, tokenizeGrobid } from "./tokenize";

/**
 * A FastMatcher gazetteer without a nested-map trie: `full` holds complete
 * phrases and `prefixes` every proper or complete token prefix, each as tokens
 * joined by U+0001. Same matches as GROBID's trie, far less memory.
 */
export type PhraseMatcher = { full: Set<string>; prefixes: Set<string> };

export type Lexicons = {
  journals: PhraseMatcher;
  abbrevJournals: PhraseMatcher;
  conferences: PhraseMatcher;
  publishers: PhraseMatcher;
  collaborations: PhraseMatcher;
  locations: PhraseMatcher;
  /** english.wf word forms (first tab column, case as in the file) */
  commonWords: Set<string>;
  firstNames: Set<string>;
  lastNames: Set<string>;
};

const SEP = "\u0001";

/** GROBID UnicodeUtil.normaliseText essentials: NFKC plus dash/quote/space unification. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[  -​  　]/g, " ");
}

const isSkippable = (token: string) => token === " " || token === "\n" || token.length === 0 || GROBID_DELIMITERS.includes(token);

export function buildPhraseMatcher(entries: Iterable<string>): PhraseMatcher {
  const full = new Set<string>();
  const prefixes = new Set<string>();
  for (const raw of entries) {
    const line = normaliseText(raw).replace(/\s+/g, " ").trim().toLowerCase();
    if (!line) continue;
    const parts = tokenizeGrobid(line).filter((t) => !isSkippable(t));
    if (parts.length === 0) continue;
    let key = "";
    for (const part of parts) {
      key = key ? key + SEP + part : part;
      prefixes.add(key);
    }
    full.add(key);
  }
  return { full, prefixes };
}

/** FastMatcher.matchLayoutToken(tokens, ignoreDelimiters=true, caseSensitive=false): inclusive token-index spans. */
export function matchPhrases(tokens: string[], matcher: PhraseMatcher): Array<[number, number]> {
  const results: Array<[number, number]> = [];
  let current: Array<{ key: string; start: number; last: number }> = [];
  for (let pos = 0; pos < tokens.length; pos += 1) {
    const raw = tokens[pos];
    if (raw === " " || raw === "\n" || GROBID_DELIMITERS.includes(raw)) continue;
    const text = normaliseText(raw).toLowerCase();
    const next: typeof current = [];
    for (const m of current) {
      const key = m.key + SEP + text;
      if (matcher.prefixes.has(key)) next.push({ key, start: m.start, last: pos });
      // GROBID reports a completed phrase when the following token is examined.
      if (matcher.full.has(m.key)) results.push([m.start, m.last]);
    }
    if (matcher.prefixes.has(text)) next.push({ key: text, start: pos, last: pos });
    current = next;
  }
  for (const m of current) if (matcher.full.has(m.key)) results.push([m.start, m.last]);
  return results;
}

/** Utilities.convertStringOffsetToTokenOffset: character spans over the joined token text → token spans. */
export function charSpansToTokenSpans(spans: Array<[number, number]>, tokens: string[]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let indexText = 0;
  let indexToken = 0;
  for (const [start, end] of spans) {
    while (indexToken < tokens.length) {
      if (indexText >= start) {
        const span: [number, number] = [indexToken, indexToken];
        let found = false;
        while (indexToken < tokens.length) {
          if (indexText + tokens[indexToken].length >= end) {
            span[1] = indexToken;
            result.push(span);
            found = true;
            break;
          }
          indexText += tokens[indexToken].length;
          indexToken += 1;
        }
        if (found) {
          indexText += tokens[indexToken].length;
          indexToken += 1;
          break;
        }
        span[1] = indexToken - 1;
        result.push(span);
      } else {
        indexText += tokens[indexToken].length;
        indexToken += 1;
      }
    }
  }
  return result;
}

/** Lexicon.inDictionary (EN) as used by FeatureFactory.test_common. */
export function inDictionary(lex: Lexicons, token: string): boolean {
  let s = token.trim().toLowerCase();
  if (!s) return false;
  if (/[.,:;]$/.test(s)) s = s.slice(0, -1);
  const hyphen = s.indexOf("-");
  if (hyphen !== -1) return lex.commonWords.has(s.slice(0, hyphen)) && lex.commonWords.has(s.slice(hyphen + 1));
  const space = s.indexOf(" ");
  if (space !== -1) return lex.commonWords.has(s.slice(0, space)) && lex.commonWords.has(s.slice(space + 1));
  return lex.commonWords.has(s);
}

let loaded: Lexicons | undefined;

function readAsset(file: string): string[] {
  const dir = path.resolve((import.meta as ImportMeta & { dirname: string }).dirname, "assets");
  return JSON.parse(gunzipSync(fs.readFileSync(path.join(dir, `${file}.json.gz`))).toString("utf8")) as string[];
}

export function loadLexicons(): Lexicons {
  if (loaded) return loaded;
  const firstNames = new Set<string>();
  const lastNames = new Set<string>();
  for (const v of readAsset("firstname_5k")) firstNames.add(v.split(/\s+/)[0].toLowerCase());
  for (const v of readAsset("lastname_5k")) lastNames.add(v.split(/\s+/)[0].toLowerCase());
  for (const v of readAsset("names_family")) lastNames.add(v.toLowerCase());
  for (const f of ["names_female", "names_male"]) for (const v of readAsset(f)) firstNames.add(v.split(/[\t\n-]/)[0].toLowerCase());
  loaded = {
    journals: buildPhraseMatcher(readAsset("journals")),
    abbrevJournals: buildPhraseMatcher(readAsset("abbrev_journals")),
    conferences: buildPhraseMatcher(readAsset("proceedings")),
    publishers: buildPhraseMatcher(readAsset("publishers")),
    // Lexicon.java loads only inspire_collaborations.txt for the collaboration matcher.
    collaborations: buildPhraseMatcher(readAsset("inspire_collaborations")),
    locations: buildPhraseMatcher(readAsset("location")),
    commonWords: new Set(readAsset("english_words").map((line) => line.split("\t")[0])),
    firstNames,
    lastNames,
  };
  return loaded;
}
