/** Ported from GROBID 0.9.1 FeaturesVectorReferenceSegmenter.java and ReferenceSegmenterParser.java (Apache-2.0), modified. */
import { tokenizeGrobid, isGrobidWhitespace } from "./tokenize";
import type { RefLine } from "./segmentReferences";

const scale = (pos: number, total: number, bins: number) => pos >= total ? bins : pos <= 0 ? 0 : Math.trunc(pos / total * bins);
const punc = (s: string) => s === "(" || s === "[" ? "OPENBRACKET" : s === ")" || s === "]" ? "ENDBRACKET" : s === "." ? "DOT" : s === "," ? "COMMA" : s === "-" ? "HYPHEN" : /^[\"'`]$/.test(s) ? "QUOTE" : /^[,:;?.]+$/.test(s) ? "PUNCT" : "NOPUNCT";
const months = new Set("january february march april may june july august september october november december jan feb mar apr may jun jul aug sep oct nov dec".split(" "));

export type SegmenterFeatures = { rows: string[][]; tokens: string[]; lineForToken: number[] };

export function referenceSegmenterFeatureRows(lines: RefLine[]): SegmenterFeatures {
  const maxLength = Math.max(1, ...lines.map((line) => line.text.length));
  const rows: string[][] = [], tokens: string[] = [], lineForToken: number[] = [];
  let priorX: number | undefined;
  lines.forEach((line, lineIndex) => {
    const source = tokenizeGrobid(line.text); const meaningful = source.filter((token) => !isGrobidWhitespace(token));
    const indent = priorX !== undefined && line.x - priorX > Math.max(1, line.fontSize * 0.25); priorX = line.x;
    let position = 0;
    meaningful.forEach((token, n) => {
      const lower = token.toLowerCase(), allDigits = /^\p{N}+$/u.test(token), containsDigits = /\p{N}/u.test(token);
      const caps = allDigits ? "NOCAPS" : token === token.toUpperCase() ? "ALLCAP" : token[0] === token[0]?.toUpperCase() ? "INITCAP" : "NOCAPS";
      const digit = allDigits ? "ALLDIGIT" : containsDigits ? "CONTAINSDIGITS" : "NODIGIT";
      const lineStatus = n === 0 ? "LINESTART" : n === meaningful.length - 1 ? "LINEEND" : "LINEIN";
      const block = line.blockStart ? "BLOCKSTART" : lineIndex === lines.length - 1 && n === meaningful.length - 1 ? "BLOCKEND" : "BLOCKIN";
      rows.push([token, lower, token.slice(0, 1), token.slice(0, 2), token.slice(0, 3), token.slice(0, 4), token.slice(-1), token.slice(-2), token.slice(-3), token.slice(-4), lineStatus, indent ? "LINEINDENT" : "ALIGNEDLEFT", caps, digit, token.length === 1 ? "1" : "0", "0", "0", "0", "0", /[12]\d{3}/.test(token) ? "1" : "0", months.has(lower) ? "1" : "0", /^https?$/i.test(token) ? "1" : "0", punc(token), String(scale(position, Math.max(1, line.text.length), 10)), String(scale(line.text.length, maxLength, 10)), block, String(Math.min(10, (line.text.match(/[^\p{L}\p{N}\s]/gu) ?? []).length))]);
      tokens.push(token); lineForToken.push(lineIndex); position += token.length;
    });
  });
  return { rows, tokens, lineForToken };
}
