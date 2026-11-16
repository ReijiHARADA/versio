/** Ported from GROBID 0.9.1 FeaturesVectorReferenceSegmenter.java and ReferenceSegmenterParser.java (Apache-2.0), modified. */
import { inDictionary, loadLexicons, type Lexicons } from "./lexicon";
import type { RefLine } from "./segmentReferences";
import { isGrobidWhitespace, tokenizeGrobid } from "./tokenize";

const LINESCALE = 10;
/** FeatureFactory.linearScaling */
const scale = (pos: number, total: number, bins: number) => (pos >= total ? bins : pos <= 0 ? 0 : Math.trunc((pos / total) * bins));
const MONTHS = new Set("january february march april may june july august september october november december jan feb mar apr may jun jul aug sep oct nov dec".split(" "));
/** TextUtilities.fullPunctuations */
const FULL_PUNCTUATIONS = "(（[ •*,:;?.!/)）-−–‐«»„\"“”‘’'`$#@]*♦♥♣♠ 。、，・";

/** ReferenceSegmenterParser punctuation classes (isPunct first, then the specific ones). */
export function punctType(s: string): string {
  if (s === "(" || s === "[") return "OPENBRACKET";
  if (s === ")" || s === "]") return "ENDBRACKET";
  if (s === ".") return "DOT";
  if (s === ",") return "COMMA";
  if (s === "-") return "HYPHEN";
  if (s === '"' || s === "'" || s === "`") return "QUOTE";
  return /^[,:;?.]+$/.test(s) ? "PUNCT" : "NOPUNCT";
}

/** INITCAP when the first char is upper case, ALLCAP when additionally no char is lower case. */
export function capitalisation(s: string): string {
  if (!/^\p{Lu}/u.test(s)) return "NOCAPS";
  return /\p{Ll}/u.test(s) ? "INITCAP" : "ALLCAP";
}

/** TextUtilities.punctuationProfile length bucket: "no" or min(10, count). */
function profileColumn(line: string): string {
  let count = 0;
  for (const c of line) if (c !== " " && FULL_PUNCTUATIONS.includes(c)) count += 1;
  return count === 0 ? "no" : String(Math.min(10, count));
}

export type SegmenterFeatures = { rows: string[][]; tokens: string[]; lineForToken: number[] };

export function referenceSegmenterFeatureRows(lines: RefLine[], lex: Lexicons = loadLexicons()): SegmenterFeatures {
  const rows: string[][] = [];
  const tokens: string[] = [];
  const lineForToken: number[] = [];
  // Java counts every token text of the line plus the newline token.
  const lineLengths = lines.map((line) => line.text.length + 1);
  const maxLineLength = Math.max(1, ...lineLengths);
  let indented = false;
  let previousStartX: number | null = null;
  // Last meaningful token of each block, for BLOCKEND.
  const blockEndLine = new Set<number>();
  lines.forEach((_line, i) => {
    if (i === lines.length - 1 || lines[i + 1].blockStart) blockEndLine.add(i);
  });

  lines.forEach((line, lineIndex) => {
    const source = tokenizeGrobid(line.text);
    const meaningful = source.filter((t) => !isGrobidWhitespace(t));
    if (meaningful.length === 0) return;
    // Indentation is a state: it flips only when the start moves by more than one character width.
    const charWidth = line.text.length ? line.width / line.text.length : line.fontSize * 0.5;
    if (previousStartX !== null) {
      if (line.x - previousStartX > charWidth) indented = true;
      else if (previousStartX - line.x > charWidth) indented = false;
    }
    previousStartX = line.x;
    const currentLineLength = lineLengths[lineIndex];
    const profile = profileColumn(line.text);
    let nn = 0;
    let k = 0;
    for (const text of source) {
      const isSpace = text === " " || text === "\t";
      // nn advances by the token length, spaces count twice (Java adds one more for them).
      if (isSpace) {
        nn += 2;
        continue;
      }
      if (isGrobidWhitespace(text)) continue;
      nn += text.length;
      const first = k === 0;
      const last = k === meaningful.length - 1;
      if (first) nn = 0;
      const lower = text.toLowerCase();
      const allDigits = /^\d+$/.test(text);
      const blockStatus = line.blockStart && first ? "BLOCKSTART" : blockEndLine.has(lineIndex) && last ? "BLOCKEND" : "BLOCKIN";
      rows.push([
        text,
        lower,
        text.slice(0, 1),
        text.slice(0, 2),
        text.slice(0, 3),
        text.slice(0, 4),
        text.slice(-1),
        text.slice(-2),
        text.slice(-3),
        text.slice(-4),
        first ? "LINESTART" : last ? "LINEEND" : "LINEIN",
        indented ? "LINEINDENT" : "ALIGNEDLEFT",
        allDigits ? "NOCAPS" : capitalisation(text),
        allDigits ? "ALLDIGIT" : /\d/.test(text) ? "CONTAINSDIGITS" : "NODIGIT",
        text.length === 1 ? "1" : "0",
        lex.firstNames.has(lower) || lex.lastNames.has(lower) ? "1" : "0",
        inDictionary(lex, text) ? "1" : "0",
        "0", // firstName: not set by ReferenceSegmenterParser
        "0", // locationName: not set by ReferenceSegmenterParser
        /[1,2][0-9]{3}/.test(text) ? "1" : "0",
        MONTHS.has(lower) ? "1" : "0",
        /https?/.test(text) ? "1" : "0",
        punctType(text),
        String(scale(nn, currentLineLength, LINESCALE)),
        String(scale(currentLineLength, maxLineLength, LINESCALE)),
        blockStatus,
        profile,
      ]);
      tokens.push(text);
      lineForToken.push(lineIndex);
      k += 1;
    }
  });
  return { rows, tokens, lineForToken };
}
