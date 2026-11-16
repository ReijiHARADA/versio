/** Ported from GROBID 0.9.1 FeaturesVectorCitation.java and FeatureFactory.java (Apache-2.0), modified. */
import { isGrobidWhitespace } from "./tokenize";
import type { Lexicons } from "./lexicon";

const MONTHS = new Set("january february march april may june july august september october november december jan feb mar apr may jun jul aug sep oct nov dec".split(" "));
const prefix = (s: string, n: number) => s.slice(0, n);
const suffix = (s: string, n: number) => s.slice(Math.max(0, s.length - n));
const scaling = (pos: number, total: number, bins: number) => pos >= total ? bins : pos <= 0 ? 0 : Math.trunc(pos / total * bins);
const punctuation = (s: string) => s === "(" || s === "[" ? "OPENBRACKET" : s === ")" || s === "]" ? "ENDBRACKET" : s === "." ? "DOT" : s === "," ? "COMMA" : s === "-" ? "HYPHEN" : /^[\"'`]$/.test(s) ? "QUOTE" : /^[,:;?.]+$/.test(s) ? "PUNCT" : "NOPUNCT";

/** Exact printVector column order (without the trailing training label). */
export function citationFeatureRows(tokens: string[], lex: Lexicons): string[][] {
  // FastMatcher applies boundary and punctuation rules beyond a simple token trie.
  // Conservative zeros avoid the broad false positives from abbreviated lexicons;
  // exact matcher parity is handled separately before a later production stage.
  const journals = new Set<number>(), abbrev = new Set<number>(), conferences = new Set<number>();
  const publishers = new Set<number>(), locations = new Set<number>(), collaborations = new Set<number>();
  const ids = new Set<number>(), urls = new Set<number>();
  tokens.forEach((token, i) => { if (/^(?:10\.|doi)/i.test(token)) ids.add(i); if (/^https?$/i.test(token) || /^www$/i.test(token)) urls.add(i); });
  const meaningful = tokens.map((token, i) => ({ token, i })).filter(({ token }) => !isGrobidWhitespace(token));
  return meaningful.map(({ token, i }) => {
    const lower = token.toLowerCase(), allDigits = /^\p{N}+$/u.test(token), hasDigits = /\p{N}/u.test(token);
    const caps = allDigits ? "NOCAPS" : token[0] && token[0] === token[0].toUpperCase() ? (token === token.toUpperCase() ? "ALLCAP" : "INITCAP") : "NOCAPS";
    const digit = allDigits ? "ALLDIGIT" : hasDigits ? "CONTAINSDIGITS" : "NODIGIT";
    return [token, lower, prefix(token, 1), prefix(token, 2), prefix(token, 3), prefix(token, 4), suffix(token, 1), suffix(token, 2), suffix(token, 3), suffix(token, 4), i === 0 ? "LINESTART" : tokens.length === i + 1 ? "LINEEND" : "LINEIN", caps, digit, token.length === 1 ? "1" : "0", (lex.firstNames.has(lower) || lex.lastNames.has(lower)) ? "1" : "0", lex.commonWords.has(lower) ? "1" : "0", lex.firstNames.has(lower) ? "1" : "0", lex.lastNames.has(lower) ? "1" : "0", locations.has(i) ? "1" : "0", /[12]\d{3}/.test(token) ? "1" : "0", MONTHS.has(lower) ? "1" : "0", urls.has(i) ? "1" : "0", collaborations.has(i) ? "1" : "0", (journals.has(i) || abbrev.has(i)) ? "1" : "0", conferences.has(i) ? "1" : "0", publishers.has(i) ? "1" : "0", ids.has(i) ? "1" : "0", punctuation(token), String(scaling(i, tokens.length, 12))];
  });
}
