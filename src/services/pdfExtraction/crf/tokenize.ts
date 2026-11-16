/** Ported from GROBID 0.9.1 GrobidDefaultAnalyzer.java and TextUtilities.java (Apache-2.0), modified. */

// TextUtilities.delimiters. Java StringTokenizer returns delimiter runs one codepoint at a time.
const DELIMITERS = new Set(Array.from("\n\r\t\f\u00a0\u200c(（[ •*,:;?.!/)）-−–‐«»„\"“”‘’'`$#@]*♦♥♣♠。、，・"));

/** GROBID default-tokenizer tokens, retaining whitespace delimiters for the caller's offsets. */
export function tokenizeGrobid(text: string): string[] {
  // GROBID UnicodeUtil normalises compatibility glyphs before tokenization.
  const normalized = text.normalize("NFKC");
  const out: string[] = [];
  let word = "";
  const push = () => { if (word) out.push(word); word = ""; };
  for (const char of normalized) {
    if (DELIMITERS.has(char)) { push(); out.push(char); } else word += char;
  }
  push();
  // CitationParser retokenizeSubdigitsFromLayoutToken separates letter ↔ digit sequences.
  return out.flatMap((token) => /^\s$/u.test(token) || DELIMITERS.has(token) ? [token] : token.split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\P{N})/u));
}

/** TextUtilities.delimiters as one string (FastMatcher tests `delimiters.indexOf(token)`). */
export const GROBID_DELIMITERS = [...DELIMITERS].join("");

export const isGrobidWhitespace = (token: string) => /^\s+$/u.test(token);
