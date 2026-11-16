/** Ported from GROBID 0.9.1 FeaturesVectorCitation.java and FeatureFactory.java (Apache-2.0), modified. */
import { isGrobidWhitespace } from "./tokenize";
import { charSpansToTokenSpans, inDictionary, matchPhrases, type Lexicons } from "./lexicon";

const MONTHS = new Set("january february march april may june july august september october november december jan feb mar apr may jun jul aug sep oct nov dec".split(" "));
const prefix = (s: string, n: number) => s.slice(0, n);
const suffix = (s: string, n: number) => s.slice(Math.max(0, s.length - n));
const scaling = (pos: number, total: number, bins: number) => pos >= total ? bins : pos <= 0 ? 0 : Math.trunc(pos / total * bins);
const DOI = /(10\.\d{4,5}\/[^\s]+[^;,.\s])/g;
const ARXIV = /(arXiv\s?(\.org)?\s?:\s?\d{4}\s?\.\s?\d{4,5}(v\d+)?)|(arXiv\s?(\.org)?\s?:\s?[ a-zA-Z\-.]*\s?\/\s?\d{7}(v\d+)?)/g;
const URL1 = /(https?|ftp)\s{0,2}:\s{0,2}\/\/\s{0,2}[-A-Z0-9+&@#/%?=~_()|!:.;]*[-A-Z0-9+&@#/%=~_()]|www\s{0,2}\.\s{0,2}[-A-Z0-9+&@#/%?=~_()|!:.;]*[-A-Z0-9+&@#/%=~_()]/gi;
const punctuation = (s: string) => s === "(" || s === "[" ? "OPENBRACKET" : s === ")" || s === "]" ? "ENDBRACKET" : s === "." ? "DOT" : s === "," ? "COMMA" : s === "-" ? "HYPHEN" : /^[\"'`]$/.test(s) ? "QUOTE" : /^[,:;?.]+$/.test(s) ? "PUNCT" : "NOPUNCT";

/** Exact printVector column order (without the trailing training label). */
export function citationFeatureRows(tokens: string[], lex: Lexicons): string[][] {
  const covered = (spans: Array<[number, number]>) => {
    const set = new Set<number>();
    for (const [start, end] of spans) for (let n = start; n <= end; n += 1) set.add(n);
    return set;
  };
  const journals = covered(matchPhrases(tokens, lex.journals));
  const abbrev = covered(matchPhrases(tokens, lex.abbrevJournals));
  const conferences = covered(matchPhrases(tokens, lex.conferences));
  const publishers = covered(matchPhrases(tokens, lex.publishers));
  const locations = covered(matchPhrases(tokens, lex.locations));
  const collaborations = covered(matchPhrases(tokens, lex.collaborations));
  // Lexicon.tokenPositionsIdentifierPattern (DOI + arXiv) and tokenPositionsUrlPattern (urlPattern1) over the joined text.
  const text = tokens.join("");
  const regexSpans = (re: RegExp) => [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
  const ids = covered([...charSpansToTokenSpans(regexSpans(DOI), tokens), ...charSpansToTokenSpans(regexSpans(ARXIV), tokens)]);
  const urls = covered(charSpansToTokenSpans(regexSpans(URL1), tokens));
  const meaningful = tokens.map((token, i) => ({ token, i })).filter(({ token }) => !isGrobidWhitespace(token));
  return meaningful.map(({ token, i }) => {
    const lower = token.toLowerCase(), allDigits = /^\p{N}+$/u.test(token), hasDigits = /\p{N}/u.test(token);
    const caps = allDigits ? "NOCAPS" : token[0] && token[0] === token[0].toUpperCase() ? (token === token.toUpperCase() ? "ALLCAP" : "INITCAP") : "NOCAPS";
    const digit = allDigits ? "ALLDIGIT" : hasDigits ? "CONTAINSDIGITS" : "NODIGIT";
    return [token, lower, prefix(token, 1), prefix(token, 2), prefix(token, 3), prefix(token, 4), suffix(token, 1), suffix(token, 2), suffix(token, 3), suffix(token, 4), i === 0 ? "LINESTART" : tokens.length === i + 1 ? "LINEEND" : "LINEIN", caps, digit, token.length === 1 ? "1" : "0", (lex.firstNames.has(lower) || lex.lastNames.has(lower)) ? "1" : "0", inDictionary(lex, token) ? "1" : "0", lex.firstNames.has(lower) ? "1" : "0", lex.lastNames.has(lower) ? "1" : "0", locations.has(i) ? "1" : "0", /[12]\d{3}/.test(token) ? "1" : "0", MONTHS.has(lower) ? "1" : "0", urls.has(i) ? "1" : "0", collaborations.has(i) ? "1" : "0", (journals.has(i) || abbrev.has(i)) ? "1" : "0", conferences.has(i) ? "1" : "0", publishers.has(i) ? "1" : "0", ids.has(i) ? "1" : "0", punctuation(token), String(scaling(i, tokens.length, 12))];
  });
}
