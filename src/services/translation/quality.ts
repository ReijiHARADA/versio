/**
 * Guardrails for what to send to MADLAD and what to keep as a translation.
 */

const THAI = /[\u0E00-\u0E7F]/;
const KANA = /[\u3040-\u30FF]/;
const KANJI = /[\u4E00-\u9FFF]/;
// Characters that are standard simplified-Chinese forms but are not used in
// ordinary Japanese prose. A small script-level signal catches language
// contamination (for example 学习) without blacklisting domain vocabulary.
const SIMPLIFIED_CJK_CONTAMINATION = /[习这们该过现为发见后还进对个从认说时实开结统处变关]/;
const HANGUL = /[\uAC00-\uD7AF]/;
const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;
// Tokenizer/decode failures can surface as literal byte escapes (for example
// `<0xE9><0xA0><0x9A>`). They are not meaningful Japanese and a fluent-looking
// surrounding sentence must not make the result acceptable.
const BYTE_ESCAPE = /<0x[0-9a-f]{2}>/i;
// MADLAD can mutate a placeholder internally (`ZZCイT4ZZ`, `ZZCaT3ZZ`).
// Catch the broader token shape after glyph normalization so malformed
// protected spans cannot pass as fluent Japanese.
const LEFTOVER_PLACEHOLDER = /[zζΖ][zζЗ][cсϲц][^\s]{0,8}(?=[^\s]{0,8}\d)(?=[^\s]{0,8}[itτтц])[^\s]{1,8}[zζΖ][zζЗ]/i;
// Include quantifier negation ("not all/every/..."), which is a semantic
// reversal when translated as an unrestricted universal claim even though it
// has no auxiliary verb.  Keep this lexical and bounded rather than using a
// broad blacklist of English words.
// Include lexical verbs that encode absence/exclusion without an explicit
// "not" (e.g. a document foregoing references). Accept optional hyphenation
// because PDF line wrapping can split compounds such as "fore-going".
const SOURCE_NEGATION = /\b(?:(?:do|does|did|is|are|was|were|has|have|had)\s+not|not\s+(?:all|every|each|necessarily)|cannot|can\s+not|never|without|lack(?:s|ed|ing)?|absence|(?:for|fore)[- ]?go(?:es|ing|ne|tten)?|omit(?:s|ted|ting)?|exclud(?:e|es|ed|ing)|absent|missing)\b/i;
const SOURCE_NEGATED_REPORTED_CONTENT = /\b(?:report(?:ed|s)?|state(?:d|s)?|say|said|indicate(?:d|s)?|claim(?:ed|s)?)\s+not\s+(?:to\b|that\b)/i;
const JA_NEGATED_REPORTING_PREDICATE = /(?:報告|述べ|示し|主張|回答)[^。！？\n]{0,10}(?:しない|しなかっ|しません|なかった)/;
// Epistemic `may/might not have been X` is weaker than a definite negative.
// Check the corresponding translated sentence when source/output boundaries
// align; otherwise leave this cue inconclusive to avoid a paragraph-level
// marker in an unrelated sentence masking or falsely triggering the signal.
const SOURCE_EPISTEMIC_NEGATIVE = /\b(?:may|might)\s+not\s+(?:(?:have|be)\s+)?(?:been\s+)?[a-z][a-z-]*\b/i;
const JA_EPISTEMIC_MARKER = /(?:可能性|かもしれ|とは限ら|おそれ|恐れ|かねない|あり得る|考えられ(?:る|た))/;
const JA_NEGATION = /(?:ない|なく|なかっ|ません|ず|ぬ|無|非|不|未|欠|否)/;
const SOURCE_DISJUNCTIVE_BOTH = /\bor\s+both\b/i;
const JA_BOTH = /(?:両方|双方|いずれも|ともに|同時に|両者|併せて|あわせて)/;
// A named intervention/technical identifier `X over Y` expresses a spatial
// target relation. Reversing the preserved identifiers around Japanese
// comparative `より` changes that relation into a comparison.
const SOURCE_OVER_IDENTIFIER_RELATION = /\b(?<agent>[A-Za-z][A-Za-z0-9-]*[A-Z][A-Za-z0-9-]*)\s+over\s+(?:the\s+)?(?:(?:right|left|upper|lower|anterior|posterior|dorsal|ventral)\s+)?(?<target>[A-Z][A-Za-z0-9-]*)\b/g;
const SOURCE_DIVERSE_PARTICIPANT_FIELDS = /\b(?:participants?|subjects?|respondents?)\b[^.!?]{0,120}\b(?:from|drawn\s+from|recruited\s+from|across)\s+(?:a\s+range\s+of\s+|various\s+|multiple\s+|different\s+|several\s+)(?:academic\s+)?(?:fields?(?:\s+of\s+study)?|disciplines?|departments?|faculties|majors?)\b/i;
const SOURCE_EXPLICIT_PER_FIELD_COUNT = /\b(?:each|every|per)\s+(?:academic\s+)?(?:field|discipline|department|faculty|major)\b/i;
const JA_FIELD_COUNT_DISPLACEMENT = /(?:各|それぞれの?)(?:学科|分野|学部|領域|専攻|部門)\s*(?:から|ごとに|あたり)?[^。！？\n]{0,12}[0-9０-９]+\s*(?:名|人)|[0-9０-９]+\s*名の(?:研究|学問)?(?:学科|分野|学部|領域|専攻|部門)/;
const SOURCE_COLLECTIVE_GROUP_COMPARISON = /\bnone\s+of\s+the\s+(?:study\s+)?groups?\b[^.!?]{0,160}\b(?:differ(?:ed|s)?|different|difference|significant|significantly)\b/i;
const SOURCE_THREE_OR_MORE_GROUPS = /\b(?:3|three|four|4|five|5|six|6|seven|7|eight|8|nine|9|ten|10)\s+(?:study\s+)?(?:groups?|conditions?|arms?)\b/i;
const JA_BINARY_GROUP_COMPARISON = /(?:両群|二群|2群)\s*(?:間|間で|間に|の間)/;
// Causal-model failures can append the instruction used to elicit the
// translation (and occasionally a fresh example) after an otherwise fluent
// Japanese result. Detect the generic instruction shape only when it appears
// after translated content; do not blacklist domain words or named examples.
const TRANSLATION_INSTRUCTION_MARKER = /(?:次の(?:英語|英文)(?:の学術テキスト)?を日本語に翻訳してください|英語(?:の)?学術テキストを日本語に翻訳|translate the following (?:english )?(?:academic )?text|output only the japanese translation)/i;
// Models sometimes append a translator's note or wording advice after an
// otherwise plausible paragraph. This is output-side meta commentary, not a
// domain term; reject the structure without naming any paper-specific words.
const TRANSLATION_META_COMMENTARY = /(?:^|[。！？\n]\s*)(?:注|訳注|補足|備考)\s*[:：]/u;

// A common decoder failure preserves an acronym while corrupting its expanded
// term into a mixed-script Latin fragment (for example `...アンダNCY（CRC）`).
// Only inspect acronym expansions that are explicit in the source and only
// flag an uppercase fragment immediately before the same acronym; ordinary
// product names such as `Bluetooth（CRC）` are unaffected.
function hasMalformedAcronymExpansion(source: string, output: string): boolean {
  const expansion = /\b(?:[A-Z][a-z]+\s+){1,7}[A-Z][a-z]+\s*\(([A-Z]{2,8})\)/g;
  for (const match of source.matchAll(expansion)) {
    const acronym = match[1];
    const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const malformed = new RegExp(`[\\u3040-\\u30ff\\u4e00-\\u9fff][A-Za-z]{2,8}[（(]\\s*${escaped}\\s*[)）]`, "i");
    if (malformed.test(output)) return true;
  }
  return false;
}

// Decoder corruption can splice a Latin suffix/prefix directly into Japanese
// text (for example `ニUDGE`, `ローティORY`, or `スーパーvised`). These are
// not ordinary bilingual terms: academic identifiers normally place Latin
// text before Japanese or separate it with punctuation/whitespace. Keep this
// structural check independent of any vocabulary blacklist.
function hasMixedScriptCorruption(source: string, output: string): boolean {
  const sourceTokens = new Set((source.match(/[A-Za-z]{2,}/g) ?? []).map((token) => token.toLowerCase()));
  const candidates = [
    ...output.matchAll(/[\u3040-\u30ff]([A-Z]{2,})/g),
    ...output.matchAll(/[\u3040-\u30ff]([a-z]{3,})/g),
    ...output.matchAll(/[\u3040-\u30ff]\s+([a-z]{4,})\b/g),
  ];
  return candidates.some((match) => {
    const candidate = match[1].toLowerCase();
    // PDF/model tokenization can expose the uppercase prefix of a mixed-case
    // identifier (e.g. `SAL` from source token `SALbp`). Treat that as the
    // same source token; genuinely new Latin prose still fails closed.
    if (sourceTokens.has(candidate)) return false;
    if (/^[A-Z]{2,}$/.test(match[1]) && [...sourceTokens].some((token) => token.startsWith(candidate) && token.length > candidate.length)) return false;
    return true;
  });
}

function hasTranslationInstructionContamination(output: string): boolean {
  const match = TRANSLATION_INSTRUCTION_MARKER.exec(output);
  return match !== null && match.index > 0;
}

function hasTranslationMetaCommentary(output: string): boolean {
  return TRANSLATION_META_COMMENTARY.test(output);
}

function hasMalformedCitationStructure(source: string, output: string): boolean {
  if (/\[\s*\]/.test(output)) return true;
  const sourceHasNumericCitation = /\[\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*\]/.test(source);
  if (!sourceHasNumericCitation) return false;
  return /\[\[\s*\d|\[\s*\]/.test(output);
}

/** Restore valid UTF-8 byte tokens if an older bundled server emitted them. */
export function restoreUtf8ByteEscapes(text: string): string {
  return text.replace(/(?:<0x[0-9a-f]{2}>)+/gi, (run) => {
    const bytes = [...run.matchAll(/<0x([0-9a-f]{2})>/gi)].map((m) => Number.parseInt(m[1], 16));
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return run;
    }
  });
}


export type PartialSourceFallbackDetection = { partial: boolean; reason?: string };

function normalizeForSourceOverlap(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceSentencesForOverlap(source: string): string[] {
  const normalized = source.replace(/\s+/g, " ").trim();
  const spans = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [normalized];
  const candidates: string[] = [];
  for (const span of spans) {
    const text = span.trim();
    if (!text) continue;
    candidates.push(text);
    // A failed semantic unit can leave a long source clause inside an otherwise
    // Japanese paragraph. Track substantial top-level-looking slices as well;
    // the length/word thresholds below keep citations, acronyms, and short
    // source facts from being mistaken for untranslated prose.
    for (const part of text.split(/[,;:]\s+/)) {
      const clause = part.trim();
      if (clause && clause !== text) candidates.push(clause);
    }
  }
  return candidates;
}

function looksLikeCitationContext(text: string): boolean {
  const hasCitationMarker = /(?:\bsee\s+(?:e\.g\.\s*)?|\bet\s+al\.?\b|\bcf\.\s*)/i.test(text);
  const yearCount = (text.match(/\b(?:19|20)\d{2}\b/g) ?? []).length;
  if (hasCitationMarker && yearCount >= 1) return true;
  // Clause splitting can remove the leading “see e.g.” marker. A remaining
  // author/year slice is still citation context when it contains multiple
  // capitalized name tokens around a publication year.
  const authorYearSlice = yearCount >= 1 && (text.match(/\b[A-Z][A-Za-z'’-]+\b/g) ?? []).length >= 2;
  return authorYearSlice;
}

export function detectPartialSourceFallback(source: string, translation: string | undefined): PartialSourceFallbackDetection {
  if (!translation) return { partial: false };
  const normalizedTranslation = normalizeForSourceOverlap(translation);
  if (!normalizedTranslation) return { partial: false };
  for (const candidate of sourceSentencesForOverlap(source)) {
    const normalizedCandidate = normalizeForSourceOverlap(candidate);
    const wordCount = (normalizedCandidate.match(/[a-z][a-z'-]*/g) ?? []).length;
    const letterCount = (normalizedCandidate.match(/[a-z]/g) ?? []).length;
    if (normalizedCandidate.length < 48 || wordCount < 7 || letterCount < 35) continue;
    if (/^(?:fig(?:ure)?|table)\s+\d+/i.test(candidate)) continue;
    if (looksLikeBibliographyEntry(candidate) || isExpectedNonProseParagraph(candidate)) continue;
    // Author/year references and “see e.g.” clauses are often intentionally
    // retained verbatim. They are protected scientific context, not evidence
    // that the surrounding paragraph was left untranslated.
    if (looksLikeCitationContext(candidate)) continue;
    if (normalizedTranslation.includes(normalizedCandidate)) {
      return {
        partial: true,
        reason: `translation contains unmodified source span (${wordCount} words, ${normalizedCandidate.length} chars)`,
      };
    }
  }
  return { partial: false };
}

/**
 * Greedy decoding occasionally repeats a fluent Japanese phrase many times.
 * Character repetition misses this failure because every character is valid.
 * Only reject a repeated phrase when it occupies a material part of the
 * output, so ordinary repeated terminology remains valid.
 */
function hasAbnormalPhraseRepetition(text: string): boolean {
  const compact = text.replace(/[^\p{L}\p{N}]/gu, "");
  if (compact.length < 36) return false;
  const counts = new Map<string, number>();
  // Five Japanese characters are enough to distinguish a repeated proposition
  // such as 「実験の結果」, while the density threshold avoids rejecting one
  // recurring technical noun in an otherwise independent translation.
  for (let index = 0; index <= compact.length - 5; index += 1) {
    const phrase = compact.slice(index, index + 5);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()].some(([phrase, count]) =>
    count >= 3
    && phrase.length * count / compact.length >= 0.16
    // Repeated katakana modifiers in comma-separated inventories are list
    // structure, not decoder looping.
    && !(/^[\u30a0-\u30ff]+$/.test(phrase) && (text.match(/[,、]/g) ?? []).length >= 2)
  );
}

function hasFragmentedJapaneseSpacing(text: string): boolean {
  const spacedJapaneseTokens = text.match(/(?:^|\s)[\u3040-\u30ff\u4e00-\u9fff]{1,2}(?=\s|$)/g) ?? [];
  if (spacedJapaneseTokens.length < 14) return false;
  const japaneseChars = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  if (japaneseChars < 40) return false;
  const compactLength = text.replace(/\s+/g, "").length;
  const whitespaceCount = (text.match(/\s/g) ?? []).length;
  // Normal Japanese prose may include spaces around citations or Latin terms,
  // but it should not look like a stream of one-character SentencePiece
  // fragments. This catches alternate-model decoder failures without naming
  // any hallucinated word.
  return spacedJapaneseTokens.length / Math.max(japaneseChars, 1) > 0.18
    && whitespaceCount / Math.max(compactLength, 1) > 0.12;
}

function hasOrphanedInvariantSentence(output: string, source: string): boolean {
  if (source.trim().length < 120) return false;
  const sentences = output
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return false;
  return sentences.some((sentence) => {
    const compact = sentence.replace(/\s+/g, "");
    if (compact.length < 4 || compact.length > 80) return false;
    const hasSourceFact = extractScientificInvariants(sentence).some((item) =>
      ["citation", "figure", "statistic", "measurement", "year", "acronym"].includes(item.kind)
    );
    if (!hasSourceFact) return false;
    const withoutAsciiFacts = compact
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[A-Za-z][A-Za-z0-9_.:/-]*/g, "")
      .replace(/\d+(?:\.\d+)?/g, "")
      .replace(/[、,;:：.。！？!?・（）()[\]\-–—+=<>≤≥≠\s]/g, "");
    return !KANA.test(withoutAsciiFacts) && !KANJI.test(withoutAsciiFacts);
  });
}

function hasTrailingLatinFragment(output: string, source: string): boolean {
  if (source.trim().length < 300) return false;
  const match = output.trim().match(/([A-Za-z]{4,})\s*$/);
  if (!match) return false;
  const tail = match[1].toLowerCase();
  const sourceWords = source.match(/[A-Za-z]{4,}/g)?.map((word) => word.toLowerCase()) ?? [];
  // A decoder can stop in the middle of a proper noun (e.g. `Baudi` from
  // `Baudisch`). Exact source tokens and common retained acronyms are safe;
  // a strict prefix of a longer source token indicates truncation.
  return sourceWords.some((word) => word.startsWith(tail) && word.length > tail.length);
}

// A translation can be mostly Japanese yet contain an entire model-generated
// explanation in English or a Chinese sentence with no Japanese morphology.
// Measure the foreign-language span itself so a long Japanese paragraph cannot
// dilute it into the aggregate Latin/CJK ratio.
function hasUntranslatedForeignProse(output: string): boolean {
  // Japanese prose uses kana frequently; a long contiguous Han-only run is a
  // high-confidence signal of a Chinese sentence even when the model has
  // attached it directly to adjacent Japanese text without punctuation.
  if (/[\u3400-\u9fff]{20,}/.test(output)) return true;

  const sentences = output
    .split(/(?<=[.!?])\s+|[。！？\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.some((sentence) => {
    if (KANA.test(sentence)) return false;
    const words = sentence.match(/[A-Za-z]{2,}/g) ?? [];
    const letters = words.reduce((total, word) => total + word.length, 0);
    if (words.length < 8 || letters < 40) return false;
    const functionWords = words.filter((word) => /^(?:a|an|and|as|at|be|been|but|by|for|from|has|have|if|in|into|is|it|of|on|or|that|the|their|there|these|this|to|was|were|which|while|with|would)$/i.test(word));
    return functionWords.length >= 3;
  });
}

function hasUntranslatedSourceLabel(source: string, output: string): boolean {
  const sourceWords = source.match(/\b[A-Za-z]{8,}\b/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of sourceWords) counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
  for (const [word, count] of counts) {
    if (count < 2) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const adjacent = new RegExp(`(?:[\\u3040-\\u30ff\\u3400-\\u9fff]${escaped}|${escaped}[\\u3040-\\u30ff\\u3400-\\u9fff])`, "i");
    if (adjacent.test(output)) return true;
    const repeatedWithJapanese = new RegExp(`${escaped}[\\s　]*(?:[\\u3040-\\u30ff\\u3400-\\u9fff]{1,6}[\\s　]*)${escaped}`, "i");
    if (repeatedWithJapanese.test(output)) return true;
  }
  return false;
}

/** ACM CCS 1998-style classifier: H.5.2, H.5.m, I.2.10 */
const CCS_CODE = /[A-K]\.\d+(?:\.\d+)*(?:\.[a-z])?/i;

export type ScientificInvariant = { kind: "citation" | "doi" | "url" | "figure" | "table" | "statistic" | "measurement" | "year" | "number" | "acronym" | "structure"; value: string };

const NON_TECHNICAL_UPPERCASE_WORDS = new Set([
  "A",
  "AN",
  "AND",
  "ARE",
  "AS",
  "AT",
  "BE",
  "BY",
  "FOR",
  "FROM",
  "IN",
  "IS",
  "NO",
  "NOT",
  "OF",
  "ON",
  "OR",
  "THE",
  "TO",
  "WITH",
]);

export const TRANSLATION_QUALITY_VERSION = "quality-v14";

export type TranslationQuality = {
  score: number;
  reasons: string[];
  languageScore: number;
  invariantScore: number;
  repetitionScore: number;
  lengthScore: number;
};

const SCIENTIFIC_PATTERNS: Array<[ScientificInvariant["kind"], RegExp]> = [
  ["url", /https?:\/\/[^\s)\]}>,。、「」]+/gi],
  ["doi", /\b10\.\d{4,9}\/[\w.()/:;-]+/gi],
  ["citation", /\[\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*\]/g],
  // Clustered numeric citations may be extracted as superscript digits
  // attached to a word instead of bracketed references (e.g. term29,30,32 or
  // decisions3,6,9,12–14). Keep a terminal citation range atomic so its final
  // reference cannot be misclassified as an ordinary number.
  ["citation", /(?<=[A-Za-z])\d{1,3}(?:\s*[-–—]\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*/g],
  // Figure/panel labels are source references. Keeping their original form is
  // safer than allowing a decoder to omit, renumber, or detach them.
  ["figure", /\bfig(?:ure)?s?\.?\s*\d+(?:[a-z]|\([a-z]\))?/gi],
  // A table reference is a navigational link to evidence in the paper. Treat
  // it as a structured invariant so an unrelated repeated digit cannot hide
  // a dropped `Table 5` / `表5` reference.
  ["table", /\b(?:table|tbl)\.?\s*\d+(?:[a-z]|\([a-z]\))?/gi],
  // Numbered document references are structural facts. Preserve the number
  // even when the surface label is localized (for example Section 3 → 第3節).
  ["structure", /\b(?:section|chapter|appendix)\s+\d+(?:\.\d+)*/gi],
  // Superscript-style references are often emitted by native PDF extraction
  // as a number adjacent to a quoted term or identifier: `problem”16 (`.
  // Treat the number as a citation only in that parenthesized-reference
  // context, never as a general integer.
  ["citation", /(?<=[”’"])[0-9]{1,3}(?=\s*\()/g],
  ["citation", /(?<=[A-Z])[0-9]{1,3}(?=\s*\()/g],
  // Calendar years are source facts in historical and longitudinal claims.
  // Keep them distinct from ordinary numbers so a fluent output cannot turn
  // “before World War I” into an invented year such as 1914.
  ["year", /\b(?:1[5-9]\d{2}|20\d{2})\b/g],
  ["statistic", /(?:[χΧxX](?:²|2)?|[FfTtZz])\s*\([^)]{1,16}\)\s*(?:=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?|\b[UWHV]\s*=\s*[-+]?\d+(?:\.\d+)?|\bp\s*(?:=|<|>|≤|≥)\s*\.?\d+(?:\.\d+)?|\b[A-Za-z]\s*(?:\u0338\s*=|!=|≠|=|<|>|≤|≥)\s*[-+]?\d+(?:\.\d+)?/g],
  // Electrical/biomedical units are frequently attached to the value in
  // Japanese output (for example `1 pF` -> `1pF`). Treat the complete value
  // as one invariant so the unit is not double-counted as a missing acronym.
  ["measurement", /(?:\b|(?<=[x×]))\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf]|[cf])\b/gi],
  // Native PDF text can split an SI prefix from its unit (`1M Hz`). Keep it
  // equivalent to the compact form (`1MHz`) during invariant comparison.
  ["measurement", /\b\d+(?:\.\d+)?\s*[kKmMgG]\s+Hz\b/gi],
  // Preserve all-caps acronyms and mixed-case technical identifiers. The
  // latter covers model/system names such as DeepIV without treating normal
  // prose as an invariant.
  ["acronym", /\b(?:[A-Z][A-Z0-9]{1,9}|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)\b/g],
  // Preserve branded hyphenated identifiers (for example Power-over-Skin),
  // while avoiding ordinary descriptive compounds such as Signal-to-Noise.
  ["acronym", /\b[A-Z][a-z]+-(?!(?:to|of|and|or|in|on|for)\b)[a-z]+-[A-Z][a-z]+\b/g],
  ["number", /\b\d+(?:\.\d+)?\b/g],
];

export function extractScientificInvariants(source: string): ScientificInvariant[] {
  // Normalize locale decimal commas before applying measurement/number
  // patterns so `0,7 mm` is treated as the same fact as `0.7 mm`.
  const invariantSource = source.normalize("NFKC").replace(/[μµ]/g, "u").replace(/℃/g, "°C").replace(
    /(\d),\s*(?=\d{1,2}\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi,
    "$1.",
  );
  const found: ScientificInvariant[] = [];
  const covered: Array<[number, number]> = [];
  for (const [kind, pattern] of SCIENTIFIC_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of invariantSource.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      // Digits attached to a mixed-case identifier are usually a model
      // suffix (AirPodsPro2, ATTiny85), not a superscript citation.  Treating
      // them as citations makes a faithful localized identifier look like an
      // invented reference in the output.  Lowercase prose forms such as
      // `decisions3,6` remain citation candidates.
      if (kind === "citation" && start > 0 && /[A-Za-z]/.test(source[start - 1]) && /^\d/.test(match[0])) {
        const prefix = invariantSource.slice(0, start).match(/[A-Za-z]+$/)?.[0] ?? "";
        if (/[A-Z]/.test(prefix) && /[a-z]/.test(prefix)) continue;
        // Dimension chains such as `x0.7 mm` are measurements, not a
        // superscript citation beginning with zero.
        if (/[x×]$/.test(prefix)) continue;
      }
      // Do not also record each component number inside a protected statistic.
      if ((kind === "number" || kind === "year" || kind === "acronym") && covered.some(([left, right]) => start >= left && end <= right)) continue;
      if (kind === "acronym" && NON_TECHNICAL_UPPERCASE_WORDS.has(match[0].toUpperCase())) continue;
      found.push({ kind, value: match[0] });
      if (kind !== "number") covered.push([start, end]);
    }
  }
  return [...new Map(found.map((item) => [`${item.kind}:${normalizeInvariant(item.value)}`, item])).values()];
}

function normalizeInvariant(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u00a0]/g, "")
    // Japanese academic output commonly uses fullwidth citation brackets.
    // Normalize punctuation shape for invariant matching while preserving the
    // exact citation payload requirement below.
    .replace(/[［］【】]/g, (bracket) => ({ "［": "[", "］": "]", "【": "[", "】": "]" })[bracket] ?? bracket)
    .replace(/[−–—]/g, "-")
    .replace(/(\d),\s*(?=\d{1,2}\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi, "$1.")
    // Some academic Japanese decodes use locale-style decimal commas
    // (`0,7 mm`). Treat a comma between two digits as a decimal separator for
    // invariant comparison; ordinary list punctuation remains unchanged.
    .replace(/\u0338=/g, "!=")
    .replace(/≠/g, "!=")
    .replace(/[μµ]/g, "u")
    .replace(/℃/g, "°c")
    .replace(/(?<=\d)c\b/gi, "°c");
}

function invariantFactKey(item: ScientificInvariant): string {
  let value = normalizeInvariant(item.value);
  // Figure/table labels may be localized or abbreviated (`Figure 2(c)` ↔
  // `Fig. 2(c)`, `Table 5` ↔ `Tbl. 5`). Canonicalize only the structural
  // label; the numeric/panel payload remains exact.
  if (item.kind === "figure") value = value.replace(/^fig(?:ure)?s?\.?/, "fig");
  if (item.kind === "table") value = value.replace(/^tbl(?:table)?\.?/, "tbl");
  // PDF extraction may leave a citation as superscript `problem”15`, while a
  // translation renders the same reference as `[15]`. Match its exact payload.
  if (item.kind === "citation") value = value.replaceAll("[", "").replaceAll("]", "");
  return `${item.kind}:${value}`;
}

function outputContainsInvariant(output: string, invariant: ScientificInvariant, source: string): boolean {
  const normalizedOutput = normalizeInvariant(output);
  const value = normalizeInvariant(invariant.value);
  if (invariant.kind === "structure") {
    const sourceNumbers = invariant.value.match(/\d+(?:\.\d+)*/g) ?? [];
    if (sourceNumbers.length === 0) return false;
    return sourceNumbers.every((number) => {
      const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Require a structural label near the number; an unrelated count such
      // as `3つ` must not satisfy `Section 3`.
      if (new RegExp(`(?:第\\s*${escaped}\\s*[節章]|(?:セクション|section|chapter|appendix)\\s*${escaped})`, "i").test(output)) return true;
      // Japanese academic prose often elides the repeated label when a
      // sentence begins `5.2で説明した...` or `5.2に示す...`. Accept that
      // compact form only with an explicit reference verb, never a bare
      // number, so ordinary measurements/counts cannot satisfy a section ref.
      return new RegExp(`(?:^|[^0-9])${escaped}(?:で説明|に示|において|を参照)`, "i").test(output);
    });
  }
  if (invariant.kind === "figure") {
    const figure = invariant.value.match(/\b(\d+)(\s*\([a-z]\)|[a-z])?/i);
    if (!figure) return false;
    const number = figure[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const panel = (figure[2] ?? "").replace(/\s+/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:\\bfig(?:ure)?s?\\.?|図)\\s*${number}${panel}`, "i").test(output);
  }
  if (invariant.kind === "table") {
    const table = invariant.value.match(/\b(?:table|tbl)\.?\s*(\d+)([a-z]|\([a-z]\))?/i);
    if (!table) return false;
    const number = table[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const panel = (table[2] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:\\b(?:table|tbl)\\.?\\s*${number}${panel}|表\\s*${number}${panel}|第\\s*${number}${panel}\\s*表)`,
      "i",
    ).test(normalizedOutput);
  }
  // `SD` is often expanded instead of copied in a Japanese academic
  // translation. Accept the expansion only when each source SD=value has the
  // same value adjacent to the Japanese term for standard deviation; this
  // avoids treating an unrelated mention of variance as preservation.
  if (invariant.kind === "acronym" && value === "sd") {
    const sourceValues = [...source.matchAll(/\bSD\s*=\s*([-+]?\d+(?:\.\d+)?)/gi)].map((match) => match[1]);
    if (sourceValues.length > 0) {
      return sourceValues.every((number) => {
        const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?:\\bSD\\s*=\\s*${escaped}(?!\\d)|標準偏差[^\\d]{0,6}${escaped}|${escaped}[^\\d]{0,6}標準偏差)`, "i").test(output);
      });
    }
  }
  // Currency codes are often localized in Japanese (`$1 USD` -> `約1ドル`).
  // Require the source amount to remain adjacent to a matching currency
  // expression; accepting an unrelated `ドル` would hide a numeric drift.
  if (invariant.kind === "acronym" && /^(?:usd|eur|gbp|jpy|cny)$/i.test(invariant.value)) {
    const amount = source.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*${invariant.value}\\b`, "i"))?.[1];
    if (amount) {
      const escapedAmount = amount.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      const currency = invariant.value.toLowerCase() === "usd" ? "(?:usd|米ドル|ドル)"
        : invariant.value.toLowerCase() === "eur" ? "(?:eur|ユーロ)"
          : invariant.value.toLowerCase() === "gbp" ? "(?:gbp|ポンド)"
            : invariant.value.toLowerCase() === "jpy" ? "(?:jpy|円)"
              : "(?:cny|元|人民元)";
      return new RegExp(`${escapedAmount}[^\\d]{0,8}${currency}`, "i").test(output);
    }
  }
  if (invariant.kind !== "acronym") return normalizedOutput.includes(value);
  // Some method names are written with a space in running text and without it
  // in their canonical identifier form ("Deep IV" / "DeepIV"). Treat the
  // acronym as preserved only when the complete source identifier is present
  // in the output; a coincidental substring in an unrelated model name must
  // not satisfy the invariant.
  const escapedAcronym = invariant.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A brand/model phrase may be compacted during Japanese typography
  // (`AirPods Pro 2` -> `AirPodsPro2`).  When the source acronym is followed
  // by a model descriptor and numeric suffix, accept the compact identifier
  // only when it still begins with the exact source acronym.
  if (new RegExp(`\\b${escapedAcronym}\\s+[A-Za-z]+\\s+\\d+\\b`, "i").test(source)) {
    if (new RegExp(`(?:^|[^a-z0-9])${escapedAcronym}[A-Za-z0-9]+(?:$|[^a-z0-9])`, "i").test(output)) return true;
  }
  const splitIdentifier = new RegExp(`\\b([A-Z][a-z][A-Za-z0-9]*)\\s+(${escapedAcronym})\\b`, "g");
  for (const match of source.matchAll(splitIdentifier)) {
    const identifier = `${match[1]}${match[2]}`;
    const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${escapedIdentifier}(?:$|[^a-z0-9])`, "i").test(output)) return true;
  }
  // `BERT` must not be treated as preserved merely because `DeBERTa` occurs.
  // Method/model identifiers are ASCII tokens even when adjacent to Japanese.
  // Japanese text is commonly adjacent to an unchanged ASCII acronym
  // (`I2C線`, `BERTについて`).  Treat only ASCII letters/digits as identifier
  // characters at the boundary; a Unicode script boundary must not make a
  // correctly preserved technical token look missing.
  // `normalizeInvariant` removes whitespace for numeric matching. Preserve
  // whitespace here so separate acronyms such as `STW VIDI` do not become one
  // synthetic identifier and incorrectly hide both tokens.
  const lowerOutput = output.normalize("NFKC").toLowerCase();
  const lowerValue = invariant.value.normalize("NFKC").toLowerCase();
  let offset = lowerOutput.indexOf(lowerValue);
  while (offset >= 0) {
    const before = offset > 0 ? lowerOutput[offset - 1] : "";
    const after = lowerOutput[offset + lowerValue.length] ?? "";
    if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) return true;
    offset = lowerOutput.indexOf(lowerValue, offset + 1);
  }
  return false;
}

function invariantQuality(source: string, output: string): { score: number; reasons: string[]; criticalMissing: boolean } {
  const invariants = extractScientificInvariants(source);
  const sourceEnumerationCount = (source.match(/(?:^|[\n\s])\d{1,2}[.)](?=\s|[^\d])/g) ?? []).length;
  const outputEnumerationCount = (output.match(/(?:^|[\n\s,、])\d{1,2}[.)](?=\s|[^\d])/g) ?? []).length;
  const unsupportedEnumeration = sourceEnumerationCount < 2 && outputEnumerationCount >= 3;
  const missing = invariants.filter((invariant) => !outputContainsInvariant(output, invariant, source));
  // Measurements, statistical values, references, and links are source facts.
  // A translation may express an ordinary number differently, but it must not
  // introduce a new value with a scientific unit or a new reference-like fact.
  // Checking only these structured kinds avoids rejecting ordinary Japanese
  // wording such as "first" becoming "1つ".
  const sourceFacts = new Set(
    invariants
      .filter((item) => ["citation", "doi", "url", "figure", "statistic", "measurement", "year", "structure"].includes(item.kind))
      .map(invariantFactKey)
  );
  const unexpected = extractScientificInvariants(output).filter((item) =>
    ["citation", "doi", "url", "figure", "statistic", "measurement", "year", "structure"].includes(item.kind)
      && !sourceFacts.has(invariantFactKey(item))
  );
  if (missing.length === 0 && unexpected.length === 0 && !unsupportedEnumeration) return { score: 1, reasons: [], criticalMissing: false };
  // A missing acronym can change the method, metric, or experimental
  // condition under discussion (for example MSE, NPIV, or DeepIV). It is a
  // safety failure, not merely a stylistic difference.
  const critical = missing.filter((item) => ["citation", "doi", "url", "figure", "table", "statistic", "measurement", "year", "acronym", "structure"].includes(item.kind));
  const reasons: string[] = [];
  if (missing.length > 0) reasons.push(`scientific invariants missing: ${missing.slice(0, 4).map((item) => item.value).join(", ")}`);
  if (unexpected.length > 0) reasons.push(`unexpected scientific invariants: ${unexpected.slice(0, 4).map((item) => item.value).join(", ")}`);
  if (unsupportedEnumeration) reasons.push("translation introduces an unsupported numbered enumeration");
  return {
    score: Math.max(0, 1 - missing.length / Math.max(invariants.length, 1) - critical.length * 0.18 - unexpected.length * 0.24 - (unsupportedEnumeration ? 0.4 : 0)),
    reasons,
    criticalMissing: critical.length > 0 || unexpected.length > 0 || unsupportedEnumeration,
  };
}

/**
 * Detect two high-impact English-to-Japanese scope shifts where numeric facts
 * can all remain present: a collective participant total made distributive
 * over unspecified fields, and an all-group statement narrowed to two groups
 * despite an explicit study cardinality of at least three. These are narrow
 * relation checks, not a general semantic correctness classifier.
 */
function semanticScopeRiskReasons(source: string, output: string): string[] {
  const reasons: string[] = [];
  if (
    SOURCE_DIVERSE_PARTICIPANT_FIELDS.test(source)
    && !SOURCE_EXPLICIT_PER_FIELD_COUNT.test(source)
    && JA_FIELD_COUNT_DISPLACEMENT.test(output)
  ) {
    reasons.push("participant total may have shifted to field-level count");
  }
  if (
    SOURCE_COLLECTIVE_GROUP_COMPARISON.test(source)
    && SOURCE_THREE_OR_MORE_GROUPS.test(source)
    && JA_BINARY_GROUP_COMPARISON.test(output)
  ) {
    reasons.push("collective group comparison narrowed to two groups");
  }
  return reasons;
}

function spatialRelationRiskReasons(source: string, output: string): string[] {
  SOURCE_OVER_IDENTIFIER_RELATION.lastIndex = 0;
  for (const match of source.matchAll(SOURCE_OVER_IDENTIFIER_RELATION)) {
    const agent = match.groups?.agent;
    const target = match.groups?.target;
    if (!agent || !target) continue;
    const escapedAgent = agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${escapedTarget}[^。！？\\n]{0,32}より[^。！？\\n]{0,32}${escapedAgent}`, "i").test(output)) {
      return ["spatial target relation rendered as comparison"];
    }
  }
  return [];
}

function signalNoiseRelationRiskReasons(source: string, output: string): string[] {
  // A signal-to-noise definition is a relation, not merely an acronym. A
  // fluent sentence can preserve `SNR` while changing the operation into a
  // frequency measurement. Require both sides of the explicit source
  // comparison in Japanese; this is a language-pair relation check, not a
  // vocabulary blacklist for a particular paper.
  if (!/signal(?:\s+level)?[\s\S]{0,100}\bcompared\s+to\b[\s\S]{0,100}noise/i.test(source)) return [];
  if (!/信号/.test(output) || !/(?:雑音|ノイズ|noise)/i.test(output)) {
    return ["signal-to-noise comparison relation missing"];
  }
  return [];
}

export function looksLikeFrontMatterLabel(text: string): boolean {
  return /^(?:(?:\d+[.)]\s*)?(?:author\s+keywords?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?|index\s+terms?|categories?(?:\s+and\s+subject\s+descriptors?)?))\s*$/i.test(
    text.trim()
  );
}

/**
 * Subject-classification / CCS catalog lines, not body prose.
 * Matches ACM CCS 1998 codes (including the miscellaneous letter suffix),
 * CCS 2012 concept trees, and IEEE-style index-term labels.
 */
export function looksLikeSubjectClassification(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 320) return false;
  if (/[→⟶]/.test(t) && /(?:^|[•·‣∙*])/.test(t)) return true;
  if (
    /^(?:index\s+terms?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?)\s*[—–:-]\s*\S/i.test(
      t
    )
  ) {
    return true;
  }

  const start = t.match(new RegExp(`^(${CCS_CODE.source})\\b`, "i"));
  if (!start) return false;

  const codes = t.match(new RegExp(CCS_CODE.source, "gi")) ?? [];
  if (codes.length >= 2) return true;

  const after = t.slice(start[0].length).replace(/^[.\s]+/, "");
  if (!after) return true;
  if (!/^[A-Z(]/.test(after)) return false;
  if (after.split(/\s+/).length > 24) return false;
  return true;
}

export function toHalfwidthAscii(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, " ")
    .replace(/([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])/g, "$1 ");
}

export function isDegenerateTranslation(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  if (BYTE_ESCAPE.test(text)) return true;
  if (LEFTOVER_PLACEHOLDER.test(toHalfwidthAscii(text))) return true;
  if (/(.)\1{7,}/u.test(compact)) return true;
  if (THAI.test(text) || HANGUL.test(text)) return true;

  const counts = new Map<string, number>();
  for (const ch of compact) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  const max = Math.max(...counts.values());
  if (compact.length >= 16 && max / compact.length > 0.4) return true;

  const uniqueRatio = counts.size / compact.length;
  if (compact.length >= 40 && uniqueRatio < 0.08) return true;
  if (hasAbnormalPhraseRepetition(text)) return true;
  if (hasFragmentedJapaneseSpacing(text)) return true;

  return false;
}

export function isGarbageTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (DATE_STAMP.test(t) && t.length < 80) return true;
  if (/proceedings of/i.test(t)) return true;
  if (/^(acm|ieee|tei|chi)\s+\d{4}/i.test(t)) return true;
  if (/没留下|请联系/.test(t)) return true;
  if (isDegenerateTranslation(t)) return true;
  return false;
}

export function evaluateJaTranslation(output: string, source: string): TranslationQuality {
  const out = output.trim();
  const reasons: string[] = [];
  if (!out) return { score: 0, reasons: ["empty output"], languageScore: 0, invariantScore: 0, repetitionScore: 0, lengthScore: 0 };
  if (isDegenerateTranslation(out)) reasons.push("degenerate output");
  if (DATE_STAMP.test(out) && !DATE_STAMP.test(source)) reasons.push("unexpected date");
  if (out === source.trim()) reasons.push("source echo");
  const partialSourceFallback = detectPartialSourceFallback(source, out);
  if (partialSourceFallback.partial) reasons.push(partialSourceFallback.reason ?? "partial source fallback");
  if (hasOrphanedInvariantSentence(out, source)) reasons.push("orphaned source invariant sentence");
  if (hasTrailingLatinFragment(out, source)) reasons.push("trailing Latin fragment");

  const hasKana = KANA.test(out);
  const hasKanji = KANJI.test(out);
  if (!hasKana && !hasKanji) reasons.push("no Japanese script");
  if (source.trim().length >= 40 && hasKanji && !hasKana) reasons.push("Japanese prose lacks kana");
  if (hasKana && SIMPLIFIED_CJK_CONTAMINATION.test(out)) reasons.push("simplified Chinese mixed into Japanese");
  if (hasKana && hasUntranslatedForeignProse(out)) reasons.push("untranslated foreign-language prose");
  if (hasKana && hasUntranslatedSourceLabel(source, out)) reasons.push("untranslated repeated source label");
  if (hasTranslationInstructionContamination(out)) reasons.push("model output contains translation instruction contamination");
  if (hasTranslationMetaCommentary(out)) reasons.push("model output contains translation meta-commentary");
  if (hasMalformedCitationStructure(source, out)) reasons.push("malformed citation structure");
  if (hasMalformedAcronymExpansion(source, out)) reasons.push("malformed acronym expansion");
  if (hasMixedScriptCorruption(source, out)) reasons.push("mixed-script decoder corruption");

  if (latinRatioBeyondSource(out, source) > 0.45) reasons.push("excessive new Latin text");
  // Negation changes the direction of a claim. This deliberately excludes
  // "not only" constructions and only checks explicit source negation; a
  // missing Japanese negative marker is unsafe for research results.
  if (SOURCE_NEGATION.test(source) && !JA_NEGATION.test(out)) reasons.push("source negation missing");
  if (SOURCE_NEGATED_REPORTED_CONTENT.test(source) && JA_NEGATED_REPORTING_PREDICATE.test(out)) {
    reasons.push("negation moved from reported content to reporting predicate");
  }
  reasons.push(...spatialRelationRiskReasons(source, out));
  reasons.push(...signalNoiseRelationRiskReasons(source, out));
  const sourceSentences = source.trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
  const outputSentences = out.trim().split(/(?<=[。！？])\s*/).filter(Boolean);
  if (sourceSentences.length === outputSentences.length) {
    const lostEpistemicNegation = sourceSentences.some((sentence, index) =>
      SOURCE_EPISTEMIC_NEGATIVE.test(sentence) && !JA_EPISTEMIC_MARKER.test(outputSentences[index] ?? "")
    );
    if (lostEpistemicNegation) reasons.push("epistemic uncertainty lost");
  }
  // Preserve the explicit scope of `X or both Y and Z`. An output that keeps
  // only X or only one of Y/Z reverses an experimental condition while often
  // remaining fluent. This narrow relation cue requires an explicit Japanese
  // both-side marker; it does not generalize to every `or` coordination.
  if (SOURCE_DISJUNCTIVE_BOTH.test(source) && !JA_BOTH.test(out)) {
    reasons.push("source disjunctive-both relation missing");
  }
  reasons.push(...semanticScopeRiskReasons(source, out));

  if (
    /^\d+[.)]\s+\S/.test(source.trim()) &&
    /^\d+\s*(つの|つ。|日目|番目|個の)/.test(out)
  ) {
    reasons.push("numbered source was mistranslated as a list item");
  }
  const invariant = invariantQuality(source, out);
  reasons.push(...invariant.reasons);
  const languageScore = reasons.some((reason) => /Japanese|Latin|source echo|date|empty|simplified Chinese|untranslated foreign-language/.test(reason)) ? 0.15 : 1;
  const repetitionScore = isDegenerateTranslation(out) ? 0 : 1;
  const lengthRatio = out.length / Math.max(source.trim().length, 1);
  // Extreme compression is strong evidence of omitted content, especially in
  // short result/list units where sentence-count checks have little leverage.
  // In the 194 manually reviewed accepted v16 translations, the <0.20 band
  // for sources >=80 chars contained two rows and both were severity >=3;
  // no reviewed safe translation fell in this band. Keep the threshold
  // conservative to avoid rejecting normal English-to-Japanese compression.
  const severeLongOmission = source.trim().length >= 80 && lengthRatio < 0.2;
  const lengthScore = lengthRatio < 0.12 || lengthRatio > 4 || severeLongOmission ? 0.3 : 1;
  if (lengthScore < 1) reasons.push(severeLongOmission ? "long source was implausibly shortened" : "implausible length ratio");
  const semanticSafetyScore = reasons.includes("source negation missing")
    || reasons.includes("negation moved from reported content to reporting predicate")
    || reasons.includes("epistemic uncertainty lost")
    || reasons.includes("spatial target relation rendered as comparison")
    || reasons.includes("signal-to-noise comparison relation missing")
    || reasons.includes("source disjunctive-both relation missing")
    || reasons.some((reason) => reason.startsWith("participant total may have shifted"))
    || reasons.includes("collective group comparison narrowed to two groups")
    || reasons.includes("trailing Latin fragment") ? 0.35 : 1;
  return {
    score: Math.max(0, Math.min(1, (languageScore * 0.35 + invariant.score * 0.4 + repetitionScore * 0.15 + lengthScore * 0.1) * semanticSafetyScore)),
    reasons,
    languageScore,
    invariantScore: invariant.score,
    repetitionScore,
    lengthScore,
  };
}

export function isPlausibleJaTranslation(output: string, source: string): boolean {
  const quality = evaluateJaTranslation(output, source);
  const repetitionOnly = quality.reasons.length === 1 && quality.reasons[0] === "degenerate output";
  const sentenceCount = output.split(/[。！？!?]+/).map((part) => part.trim()).filter(Boolean).length;
  // A preserved grant name or researcher name may legitimately remain Latin.
  // The weighted score handles ordinary quality differences, while scientific
  // facts have an explicit hard safety check below.
  // Never accept a fluent sentence which dropped a citation, statistic,
  // measurement, DOI/URL, or method acronym. The model may be retried by the
  // caller; otherwise keeping the original is safer than changing a result.
  return (!isDegenerateTranslation(output) || (repetitionOnly && sentenceCount <= 1 && source.trim().length >= 180))
    && !invariantQuality(source, output).criticalMissing
    && !quality.reasons.includes("long source was implausibly shortened")
    && !quality.reasons.includes("source negation missing")
    && !quality.reasons.includes("negation moved from reported content to reporting predicate")
    && !quality.reasons.includes("epistemic uncertainty lost")
    && !quality.reasons.includes("spatial target relation rendered as comparison")
    && !quality.reasons.includes("signal-to-noise comparison relation missing")
    && !quality.reasons.includes("source disjunctive-both relation missing")
    && !quality.reasons.some((reason) => reason.startsWith("participant total may have shifted"))
    && !quality.reasons.includes("collective group comparison narrowed to two groups")
    && !quality.reasons.includes("trailing Latin fragment")
    && !quality.reasons.includes("malformed acronym expansion")
    && !quality.reasons.includes("simplified Chinese mixed into Japanese")
    && !quality.reasons.includes("untranslated foreign-language prose")
    && !quality.reasons.includes("untranslated repeated source label")
    && !quality.reasons.includes("model output contains translation instruction contamination")
    && !quality.reasons.includes("model output contains translation meta-commentary")
    && !quality.reasons.includes("malformed citation structure")
    && !quality.reasons.some((reason) => reason.startsWith("translation contains unmodified source span"))
    && quality.score >= 0.8;
}

/**
 * Figure captions that only name an artwork and its creator often should keep
 * those proper nouns verbatim. MADLAD does that correctly, but the result has
 * no Japanese script and would otherwise be recorded as a failed translation.
 */
export function localizeNamedFigureCaption(source: string): string | null {
  const match = source
    .trim()
    .match(/^(?:figure|fig\.?)[\s]+(\d+)\.\s*(.+?)\s+by\s+(.+?)[.]?$/i);
  if (!match) return null;
  const [, number, title, creator] = match;
  if (!title.trim() || !creator.trim()) return null;
  return `図${number}. ${title.trim()}（${creator.trim()}）`;
}

function latinRatioBeyondSource(output: string, source: string): number {
  const tokens = source.match(/[A-Za-z]{2,}/g) ?? [];
  let stripped = output;
  for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
    stripped = stripped.replace(
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      ""
    );
  }
  stripped = stripped.replace(/\d+(?:\.\d+)*/g, "");
  const compact = stripped.replace(/\s+/g, "");
  if (compact.length < 8) return 0;
  const latin = (compact.match(/[A-Za-z]/g) || []).length;
  return latin / compact.length;
}

export function looksLikeNamedWorkHeading(text: string): boolean {
  return /^(?:\d+(?:\.\d+)*[.)]\s+)?.{1,80}?\s+by\s+[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,5}\s*$/.test(
    text.trim()
  );
}

export function formatNamedWorkHeading(text: string): string {
  const match = text
    .trim()
    .match(
      /^(?:(\d+(?:\.\d+)*)[.)]\s+)?(.+?)\s+by\s+(.+)$/i
    );
  if (!match) return text.trim();
  const num = match[1];
  const title = match[2].trim();
  const author = match[3].trim().replace(/[.:;]+$/, "");
  const body = `${title} (${author})`;
  return num ? `${num}. ${body}` : body;
}

export function isReferencesHeading(text: string): boolean {
  return /^(?:\d+[.)]\s*)?(references|bibliography|works cited|literature cited|参考文献|引用文献)\s*$/i.test(
    toHalfwidthAscii(text).trim()
  );
}

export function looksLikeBibliographyEntry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\[\d+\]/.test(t)) return true;
  // Author–year styles can omit a numeric reference label. Require the
  // distinctive all-caps surname/byline pattern, a second author connector,
  // and a parenthesized year so ordinary prose about people is not hidden.
  if (
    /^[A-Z][A-Z'’-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+).*?\b(?:and|&)\s+[A-Z][A-Z'’-]+,.*?\((?:19|20)\d{2}\)\./.test(t)
  ) return true;
  if (/^\d+\.\s+[A-Z]/.test(t)) {
    if (/\b(19|20)\d{2}\b/.test(t)) return true;
    if (/\b[A-Z]\.\s+[A-Z]/.test(t)) return true;
    if (/\band\b/.test(t) && /[A-Z][a-z]+\s+[A-Z]/.test(t)) return true;
  }
  if (
    /\b(in proceedings|proc\.|extended abstracts|journal of|transactions on|doi:\s*10\.|https?:\/\/doi|retrieved .{0,24} from|acm conference|ieee )/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(19|20)\d{2}\.\s+\S/.test(t) &&
    /\b(in proceedings|proc\.|journal|conference|acm|ieee|doi|isbn|pp\.|vol\.)/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(arnoldsche|springer|elsevier|wiley|lark jewelry|black dog publishing|010 publishers)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\bIn [A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,6},/.test(t) &&
    (/\(eds?\.\)/.test(t) || /,\s+[A-Z]\.\s/.test(t))
  ) {
    return true;
  }
  return false;
}

export function shouldTranslateHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 140) return false;
  if (isGarbageTitle(t)) return false;
  if (isReferencesHeading(t)) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  if (looksLikeNamedWorkHeading(t)) return false;
  if (looksLikeFrontMatterLabel(t)) return false;
  if (looksLikeSubjectClassification(t)) return false;
  if (/^[\d.\s]+$/.test(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

/**
 * Returns a reader-facing reason only when native PDF structure makes a
 * paragraph unsafe to translate. Non-prose filters such as references and
 * publisher metadata intentionally return null: they are expected skips, not
 * extraction uncertainty.
 */
export function isExpectedNonProseParagraph(text: string): boolean {
  const t = text.trim();
  if (t.length < 28) return true;
  if (looksLikeBibliographyEntry(t) || looksLikeSubjectClassification(t)) return true;
  if (/@/.test(t) || /https?:\/\//i.test(t) || /permission to make digital/i.test(t)) return true;
  if (/\b(?:accepted|received|revised|published|available\s+online)\s*:\s*(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i.test(t)) return true;
  if (/personal\s+or\s+classroom\s+use\b.{0,140}\b(?:copies|copyright|fee)\b/i.test(t)) return true;
  if (/\barXiv:\d{4}\.\d{4,5}v?\d*/i.test(t)) return true;
  if (/\b(?:CHI|UIST|DIS|CSCW|TEI|UbiComp|MobileHCI|IEEE|ACM)\b.{0,120}\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}/i.test(t) && /\b[A-Z]\.\s*[A-Z][a-z]+\b/.test(t)) return true;
  // Running headers commonly combine a paper title with a publisher page
  // marker such as `• 195:3`. They carry no sentence boundary and native PDF
  // order can otherwise present them as a paragraph on a later page.
  if (/(?:[•·]|\|)\s*\d{1,4}:\d{1,3}\s*$/.test(t)) return true;
  // Multilingual author affiliations are metadata, not source prose.  Native
  // extraction often keeps a local-language author name beside an English
  // department/university line; translating the mixed line invites invented
  // institutions.  Require a common affiliation cue and no terminal mark so
  // ordinary multilingual research prose remains eligible.
  if (/[\uac00-\ud7af]/.test(t) && /\b(?:department|school|university|institute|faculty)\b/i.test(t) && !/[.!?。！？]$/.test(t)) return true;
  if (/(?:\b[A-Z][a-z]{1,}\b\s+){4,}[A-Z][a-z]{1,}\b\s+[a-z]/.test(t)) return true;
  if (DATE_STAMP.test(t) && t.length < 80) return true;
  const words = t.split(/\s+/).filter((word) => /[A-Za-z]{3,}/.test(word));
  return words.length < 6;
}

export function unsafeParagraphStructureReason(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  // U+FFFD is an extraction/decoding failure marker, not an academic symbol.
  // Even a single occurrence can stand in for a missing equation or value;
  // translating around it would invite the model to invent what was lost.
  if (t.includes("\uFFFD")) {
    return "抽出テキストに未復元文字が含まれています";
  }
  // Native PDF extraction often places a superscript/numeric citation after
  // the sentence terminator (`... non-unique.25` or `... result. [25]`).
  // Treat that citation suffix as terminal punctuation; otherwise a complete
  // paragraph is incorrectly classified as a page fragment and never sent to
  // translation.
  const terminalCitationSuffix = /[.!?。！？]\s*(?:\[\s*\d+(?:\s*[-–—,]\s*\d+)*\s*\]|\d{1,3})$/.test(t);
  const noTerminal = !/[.!?。！？]$/.test(t) && !terminalCitationSuffix;
  // A physical block with an unclosed quote or an unmatched parenthesis is
  // incomplete.  Do this only without terminal punctuation: PDF text can
  // contain decorative punctuation in an otherwise complete sentence.
  if (noTerminal) {
    const openingParens = (t.match(/\(/g) ?? []).length;
    const closingParens = (t.match(/\)/g) ?? []).length;
    const doubleQuotes = (t.match(/(?<!\\)"/g) ?? []).length;
    const curlyQuotes = (t.match(/[“”]/g) ?? []).length;
    if (openingParens !== closingParens || doubleQuotes % 2 !== 0 || curlyQuotes % 2 !== 0) {
      return "段落の括弧または引用符が閉じていない可能性があります";
    }
  }
  // A trailing hyphen is a physical word break, never a complete English
  // proposition. The missing suffix is unknown, so do not ask a translation
  // model to guess it (for example, `previous Theo-`).
  if (/\b[A-Za-z]{2,}-$/.test(t)) {
    return "語が途中で切れている可能性があります";
  }
  if (t.length >= 48 && noTerminal && /^(?:starting\s+from|based\s+on|using|through|by|with|from)\b/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  const closedQuote = /^(?:["“]).*(?:["”])(?:\s*\[[^\]]+\])?$/s.test(t);
  if (t.length >= 400 && noTerminal && !closedQuote && !/^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // A colon is an introducing delimiter, not a terminal sentence mark. The
  // missing equation, list, or definition must not be inferred by the model.
  if (noTerminal && /:\s*$/.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // Physical blocks can stop after an English coordinator, subordinator, or
  // determiner. These are unambiguously open syntactic units even when the
  // text is long enough to look like ordinary prose (for example, a PDF block
  // ending `The first dimension describes the`). Do not let the model invent
  // the missing clause or noun. A sentence-final mark excludes legitimate
  // ellipses and quoted fragments from this check.
  if (
    noTerminal
    && /(?:[,;]\s*|\b(?:and|or|but|that|which|who|whom|whose|where|when|although|because|while|whereas|if|unless|the|a|an|this|these|those|its|their|our|his|her)\s*)$/i.test(t)
  ) {
    return "段落の末尾が欠けている可能性があります";
  }
  // A terminal bare infinitive marks an open predicate complement (for
  // example, a physical block ending `were used to perform`). The model may
  // supply an object that was absent from the PDF text and turn an extraction
  // fragment into a fluent but invented claim. A terminal mark can close an
  // elliptical heading/quotation, so keep this limited to unpunctuated prose.
  if (t.length >= 48 && noTerminal && /\bto\s+[a-z]{3,}$/i.test(t)) {
    return "段落の末尾で不定詞の補語が欠けている可能性があります";
  }
  // Figure/table sub-panels extracted as `(a) noun phrase` are captions or
  // legends. A sentence terminator does not make the panel label prose: the
  // translation segmenter can append one to a short panel fragment before
  // this gate runs. Keep the rule bounded to a short panel-shaped unit so a
  // genuinely enumerated paragraph is not discarded.
  if (/^\([a-z]\)\s+/i.test(t) && t.length <= 240) {
    return "図表のサブパネル説明が本文に混ざっている可能性があります";
  }
  // A PDF block ending immediately after an introducing verb and the first
  // capitalized token of a name (for example "We present Thermal") is a
  // physical split before the rest of the system/paper name.  It is not a
  // complete proposition, so translation would invite the model to infer the
  // missing noun phrase.  This is deliberately restricted to no-terminal
  // prose and common academic introduction verbs.
  if (noTerminal && /\b(?:we|this\s+(?:paper|work|article)|i)\s+(?:present|propose|introduce|develop|describe|evaluate|demonstrate|call)\s+[A-Z][A-Za-z0-9-]*$/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // Lower-case connective starts are physical continuations. Upper-case
  // `To`, `For`, `But`, and `With` can begin complete scholarly sentences.
  if (/^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t) || /^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  // A bare lower-case phrase that also lacks sentence-ending punctuation is
  // almost always the continuation of a line/column. Lists retain their
  // marker and are excluded from this rule; common discourse abbreviations
  // remain valid starts.
  if (
    t.length >= 48 &&
    noTerminal &&
    /^[a-z]/.test(t) &&
    !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)
  ) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/^[a-z]/.test(t) && t.length >= 180 && !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (/\b(?:the|an?)\s+(?:entire|following|same|former|latter)\s*$/i.test(t) || /\b(?:albeit|although|though|because|while|whereas|with|without|including|concerning|between|than|to|of|for|at|in|on|from|by|as)\s*$/i.test(t) || /\b(?:about|above|across|after|against|among|around|at|before|behind|below|beneath|beside|between|beyond|by|during|for|from|in|inside|into|near|of|on|onto|over|through|to|toward|under|with|within|without)\s+(?:the|a|an|this|that|these|those|its|their|our|his|her)\s*$/i.test(t) || /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|should|may|might)\s*$/i.test(t) || /\b(?:and|or)\s+(?:standard|mean|median|confidence|statistical)\s*$/i.test(t)) {
    return "段落の末尾が欠けている可能性があります";
  }
  // Native PDF extraction can cut a cross-reference immediately after its
  // label (for example `... in Section`). Translating this fragment makes
  // the model invent a section number or lose the document relation. Keep the
  // source until the layout layer can stitch the following block.
  if (t.length >= 48 && /\b(?:section|figure|table|appendix|chapter)\s*$/i.test(t)) {
    return "文書内参照が途中で切れている可能性があります";
  }
  if (/\b[a-z]{2,}-\s+\d+(?:\.\d+)?\s+[a-z]{2,}\b/i.test(t)) {
    return "表または図の数値セルが本文に混ざっている可能性があります";
  }
  if (/\b\d+(?:\.\d+)?\s*[×x]\s*10\s+(?!\^?\d|[-–—])[a-z]/i.test(t)) {
    return "数式の指数情報が欠けている可能性があります";
  }
  return null;
}

export function shouldTranslateParagraph(text: string): boolean {
  const t = text.trim();
  const terminalCitationSuffix = /[.!?。！？]\s*(?:\[\s*\d+(?:\s*[-–—,]\s*\d+)*\s*\]|\d{1,3})$/.test(t);
  if (isExpectedNonProseParagraph(t)) return false;
  // Journal mastheads often place an author byline and editorial state on one
  // native-text line.  It is publication metadata, not research prose; a
  // translation model otherwise invents a Japanese biographical event from
  // names followed by e.g. "Accepted: 27 December 2017".
  if (/\b(?:accepted|received|revised|published|available\s+online)\s*:\s*(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i.test(t)) return false;
  // Broken first-page permission text can lose its initial "Permission" when
  // columns are interleaved. The remaining wording is still distinctive and
  // is chrome rather than research prose.
  if (/personal\s+or\s+classroom\s+use\b.{0,140}\b(?:copies|copyright|fee)\b/i.test(t)) return false;
  // A running arXiv header inside a sentence is extraction contamination, not
  // evidence the model should infer around. Preserve the original until the
  // layout repair can separate the header from the paragraph.
  if (/\barXiv:\d{4}\.\d{4,5}v?\d*/i.test(t)) return false;
  // A run of short title-cased labels embedded in otherwise ordinary prose is
  // usually a flattened figure/table legend (for example a set of task names
  // printed beside a diagram).  It has no reliable sentence boundary for a
  // translation model to infer.  Require five labels to avoid rejecting
  // normal named entities such as institutions or person names.
  if (/(?:\b[A-Z][a-z]{1,}\b\s+){4,}[A-Z][a-z]{1,}\b\s+[a-z]/.test(t)) return false;
  if (unsafeParagraphStructureReason(t)) return false;
  // Do not turn an incomplete physical block into a confident Japanese
  // sentence. Page/column stitching may repair it upstream; otherwise the
  // reader safely shows the original.
  // A leading participial setup without a terminal mark is a high-confidence
  // physical fragment (for example "Starting from the design philosophy …
  // characteristics"). Keep it as source until its continuation is stitched.
  // Do not reject every unpunctuated block: bullet lists and quotations often
  // legitimately omit a final full stop.
  if (
    t.length >= 48
    && !/[.!?。！？]$/.test(t)
    && !terminalCitationSuffix
    && /^(?:starting\s+from|based\s+on|using|through|by|with|from)\b/i.test(t)
  ) return false;
  // Long native-text prose without a terminal mark is almost always a
  // page/column fragment. Lists and quotations legitimately omit a final
  // period, so keep those structural forms eligible; otherwise preserve the
  // source instead of asking the model to complete a missing clause.
  const isClosedQuote = /^(?:["“]).*(?:["”])(?:\s*\[[^\]]+\])?$/s.test(t);
  if (t.length >= 400 && !/[.!?。！？]$/.test(t) && !terminalCitationSuffix && !isClosedQuote && !/^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(t)) return false;
  if (/^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t)) return false;
  // A lower-case lexical fragment followed by a coordinating conjunction is
  // strong evidence that extraction started mid-sentence ("data, and ...").
  // Complete English paragraphs do not normally begin this way.
  if (/^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) return false;
  // A lower-case word followed by a period at the physical block start is
  // normally the tail of a sentence from the preceding column/page ("data.
  // This procedure …"), not a complete paragraph start.
  if (/^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) return false;
  // Native academic paragraphs virtually always begin with a capital letter,
  // number, quotation mark, or bullet. A long block beginning mid-word in
  // lowercase is usually a column/page continuation ("substantially improves
  // …"), except for the common discourse abbreviations below.
  if (
    /^[a-z]/.test(t)
    && t.length >= 180
    && !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)
  ) return false;
  // Likewise, these determiners/adjectives cannot end an English sentence on
  // their own. They identify a physical block cut before its final noun.
  if (/\b(?:the|an?)\s+(?:entire|following|same|former|latter)\s*$/i.test(t)) return false;
  // A preposition followed only by a determiner is also an incomplete noun
  // phrase (for example, a page break after `as previously studied in the`).
  // Complete prose needs the missing head noun before it is safe to translate.
  if (/\b(?:about|above|across|after|against|among|around|at|before|behind|below|beneath|beside|between|beyond|by|during|for|from|in|inside|into|near|of|on|onto|over|through|to|toward|under|with|within|without)\s+(?:the|a|an|this|that|these|those|its|their|our|his|her)\s*$/i.test(t)) return false;
  // Coordinators and prepositions at the physical block end require material
  // from the next column/page. Translating them independently asks the model
  // to invent that missing complement.
  if (/\b(?:albeit|although|though|because|while|whereas|with|without|including|concerning|between|than)\s*$/i.test(t)) return false;
  if (/\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|should|may|might)\s*$/i.test(t)) return false;
  // A word split around a standalone numeric cell ("dol- 2 lars") is not a
  // legitimate hyphenation. It indicates a chart/table value was interleaved
  // into prose, so preserve source rather than inventing a quantitative claim.
  // Require actual whitespace after the hyphen. Without it, ordinary model
  // identifiers such as `GPT-3, just like people` were falsely classified as
  // a broken `dol- 2 lars` table-cell splice and entire research paragraphs
  // were never submitted for translation.
  if (/\b[a-z]{2,}-\s+\d+(?:\.\d+)?\s+[a-z]{2,}\b/i.test(t)) return false;
  // Native PDF extraction can lose a superscript exponent while preserving a
  // multiplication sign ("4 × 10 distinct forms"). That is neither a valid
  // scientific-power notation nor a hyphenated dimension such as "10-minute".
  // Sending it to the model silently turns an unknown magnitude into a false
  // quantitative claim, so retain the source until extraction can recover it.
  if (/\b\d+(?:\.\d+)?\s*[×x]\s*10\s+(?!\^?\d|[-–—])[a-z]/i.test(t)) return false;
  if (DATE_STAMP.test(t) && t.length < 80) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  return words.length >= 6;
}

export function shouldTranslateCaption(text: string): boolean {
  const t = toHalfwidthAscii(text)
    .trim()
    .replace(/^(?:figure|fig\.?|tables?|図|表)\s+\S+\s*[:.：–—-]?\s*/i, "");
  if (t.length < 8) return false;
  if (looksLikeBibliographyEntry(t)) return false;
  return /[A-Za-z]{3,}/.test(t);
}

export function shouldTranslateTitle(text: string): boolean {
  const t = text.trim();
  if (!shouldTranslateHeading(t) && t.length < 8) return false;
  if (isGarbageTitle(t)) return false;
  if (/@/.test(t)) return false;
  if (/^[\d.\s]+$/.test(t)) return false;
  if (/^\d{2,}(?:\.\d+){2,}/.test(t)) return false;
  return t.length >= 8 && t.length <= 220;
}

export function pickPaperTitle(
  metadataTitle: string | undefined,
  extractedTitle: string | undefined
): string | null {
  const extracted = extractedTitle?.trim() || "";
  const meta = metadataTitle?.trim() || "";
  if (extracted && !isGarbageTitle(extracted)) return extracted;
  if (meta && !isGarbageTitle(meta)) return meta;
  return extracted || null;
}

export function pickPublication(metadataTitle: string | undefined): string | null {
  const meta = metadataTitle?.trim() || "";
  if (/proceedings of/i.test(meta)) return meta;
  return null;
}

export function titleTranslationComplete(
  original: string,
  translated: string | null | undefined
): boolean {
  if (!translated || !isPlausibleJaTranslation(translated, original)) return false;
  const rest = original.split(":").slice(1).join(":").trim();
  if (rest.length >= 4 && !/[:：]/.test(translated)) return false;
  return true;
}

export function usableTranslatedText(
  translated: string | null | undefined,
  original: string | null | undefined
): string | null {
  if (!translated) return null;
  if (!isPlausibleJaTranslation(translated, original || translated)) return null;
  return toHalfwidthAscii(translated);
}

export function sectionDisplayTitle(section: {
  originalTitle: string;
  translatedTitle: string | null;
  normalizedKind?: string;
}): string {
  if (
    section.normalizedKind === "references" ||
    isReferencesHeading(section.originalTitle) ||
    looksLikeBibliographyEntry(section.originalTitle)
  ) {
    return section.originalTitle;
  }
  if (looksLikeFrontMatterLabel(section.originalTitle) || looksLikeSubjectClassification(section.originalTitle)) {
    return section.originalTitle;
  }
  if (looksLikeNamedWorkHeading(section.originalTitle)) {
    return formatNamedWorkHeading(section.originalTitle);
  }
  return (
    usableTranslatedText(section.translatedTitle, section.originalTitle) ||
    section.originalTitle
  );
}

export function displayPaperTitle(paper: {
  titleTranslated: string | null;
  titleOriginal: string | null;
}): string {
  const ja = usableTranslatedText(paper.titleTranslated, paper.titleOriginal || "");
  if (ja) return ja;
  const original = paper.titleOriginal?.trim() || "";
  if (original && !isGarbageTitle(original)) return original;
  return "無題";
}
