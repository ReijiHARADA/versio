/** Ported from GROBID 0.9.1 Lexicon.java / FastMatcher.java / Utilities.java (Apache-2.0), modified. */
import { GROBID_DELIMITERS, tokenizeGrobid } from "./tokenize";

/**
 * A FastMatcher gazetteer without a nested-map trie. Every token prefix of every
 * phrase is kept as a 53-bit hash (tokens joined by U+0001, plus a mark:
 * U+0002 = complete phrase, U+0003 = prefix) in a sorted Float64Array. Same
 * matches as GROBID's trie (collision chance ~1e-10 per lookup) in a few MB.
 */
export type PhraseMatcher = Float64Array;
const FULL = "\u0002";
const PART = "\u0003";

/** Two independent 32-bit FNV-1a variants folded into an exact 53-bit integer. */
function hash53(s: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1 * 0x200000 + (h2 & 0x1fffff);
}

function contains(sorted: Float64Array, value: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = sorted[mid];
    if (v === value) return true;
    if (v < value) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

const isPrefix = (m: PhraseMatcher, key: string) => contains(m, hash53(key + FULL)) || contains(m, hash53(key + PART));
const isFull = (m: PhraseMatcher, key: string) => contains(m, hash53(key + FULL));

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
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ");
}

const isSkippable = (token: string) => token === " " || token === "\n" || token.length === 0 || GROBID_DELIMITERS.includes(token);

export function buildPhraseMatcher(entries: Iterable<string>): PhraseMatcher {
  let out = new Float64Array(1024);
  let n = 0;
  const push = (v: number) => {
    if (n === out.length) {
      const grown = new Float64Array(out.length * 2);
      grown.set(out);
      out = grown;
    }
    out[n++] = v;
  };
  for (const raw of entries) {
    const line = normaliseText(raw).replace(/\s+/g, " ").trim().toLowerCase();
    if (!line) continue;
    const parts = tokenizeGrobid(line).filter((t) => !isSkippable(t));
    let key = "";
    parts.forEach((part, i) => {
      key = key ? key + SEP + part : part;
      // A key may be both a complete phrase and a prefix of a longer one: keep both marks.
      push(hash53(key + (i === parts.length - 1 ? FULL : PART)));
    });
  }
  const sorted = out.subarray(0, n).sort();
  let w = 0;
  for (let r = 0; r < sorted.length; r += 1) if (r === 0 || sorted[r] !== sorted[r - 1]) sorted[w++] = sorted[r];
  return sorted.slice(0, w);
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
      if (isPrefix(matcher, key)) next.push({ key, start: m.start, last: pos });
      // GROBID reports a completed phrase when the following token is examined.
      if (isFull(matcher, m.key)) results.push([m.start, m.last]);
    }
    if (isPrefix(matcher, text)) next.push({ key: text, start: pos, last: pos });
    current = next;
  }
  for (const m of current) if (isFull(matcher, m.key)) results.push([m.start, m.last]);
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

/** Build matchers from the asset lists (`read(name)` returns the JSON array of one asset). */
export function buildLexicons(read: (name: string) => string[]): Lexicons {
  const firstNames = new Set<string>();
  const lastNames = new Set<string>();
  for (const v of read("firstname_5k")) firstNames.add(v.split(/\s+/)[0].toLowerCase());
  for (const v of read("lastname_5k")) lastNames.add(v.split(/\s+/)[0].toLowerCase());
  for (const v of read("names_family")) lastNames.add(v.toLowerCase());
  for (const f of ["names_female", "names_male"]) for (const v of read(f)) firstNames.add(v.split(/[\t\n-]/)[0].toLowerCase());
  return {
    journals: buildPhraseMatcher(read("journals")),
    abbrevJournals: buildPhraseMatcher(read("abbrev_journals")),
    conferences: buildPhraseMatcher(read("proceedings")),
    publishers: buildPhraseMatcher(read("publishers")),
    // Lexicon.java loads only inspire_collaborations.txt for the collaboration matcher.
    collaborations: buildPhraseMatcher(read("inspire_collaborations")),
    locations: buildPhraseMatcher(read("location")),
    commonWords: new Set(read("english_words").map((line) => line.split("\t")[0])),
    firstNames,
    lastNames,
  };
}
