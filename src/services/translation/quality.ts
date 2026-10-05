/**
 * Guardrails for what to send to MADLAD and what to keep as a translation.
 */

import {
  explainDegenerateTranslation,
  hasAbnormalPhraseRepetition,
  isDegenerateTranslation,
  toHalfwidthAscii,
} from "./quality/degeneration";
import {
  isGarbageTitle,
  looksLikeFrontMatterLabel,
  looksLikeSubjectClassification,
  looksLikeNamedWorkHeading,
  formatNamedWorkHeading,
  isReferencesHeading,
  looksLikeBibliographyEntry,
} from "./quality/documentPolicy";
import {
  shouldTranslateCaption as shouldTranslateCaptionPolicy,
  shouldTranslateTitle as shouldTranslateTitlePolicy,
} from "./quality/sourceIntegrity";

export {
  explainDegenerateTranslation,
  isDegenerateTranslation,
  restoreUtf8ByteEscapes,
  toHalfwidthAscii,
} from "./quality/degeneration";
export {
  isGarbageTitle,
  looksLikeFrontMatterLabel,
  looksLikeSubjectClassification,
  looksLikeNamedWorkHeading,
  formatNamedWorkHeading,
  isReferencesHeading,
  looksLikeBibliographyEntry,
} from "./quality/documentPolicy";

const KANA = /[\u3040-\u30FF]/;
const KANJI = /[\u4E00-\u9FFF]/;
// Characters that are standard simplified-Chinese forms but are not used in
// ordinary Japanese prose. A small script-level signal catches language
// contamination (for example 学习) without blacklisting domain vocabulary.
// High-confidence simplified forms that are not valid Japanese spellings.
// Keep this as a script-contamination signal rather than a vocabulary
// blacklist; it catches mixed Chinese/Japanese decoder output such as
// `エピソデ的记忆` while leaving ordinary Japanese kanji untouched.
const SIMPLIFIED_CJK_CONTAMINATION = /[习这们该过现为发见后还进对个从认说时实开结统处变关记忆态调评]|(?:因素|主题|详细|结果|影响|内在因素|外在因素|其次)/;
// Scripts outside Japanese, Latin identifiers, and ordinary CJK are strong
// decoder-contamination signals in an English→Japanese translation. This is
// deliberately script-level (not a word blacklist), so it catches outputs
// such as a stray Devanagari name without rejecting legitimate technical
// acronyms or citations.
const UNEXPECTED_FOREIGN_SCRIPT = /[\u0900-\u097F\u0400-\u04FF\u0600-\u06FF\u0B80-\u0BFF]/;
const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;
// Tokenizer/decode failures can surface as literal byte escapes (for example
// `<0xE9><0xA0><0x9A>`). They are not meaningful Japanese and a fluent-looking
// surrounding sentence must not make the result acceptable.
// MADLAD can mutate a placeholder internally (`ZZCイT4ZZ`, `ZZCaT3ZZ`).
// Catch the broader token shape after glyph normalization so malformed
// protected spans cannot pass as fluent Japanese.
// Include quantifier negation ("not all/every/..."), which is a semantic
// reversal when translated as an unrestricted universal claim even though it
// has no auxiliary verb.  Keep this lexical and bounded rather than using a
// broad blacklist of English words.
// Include lexical verbs that encode absence/exclusion without an explicit
// "not" (e.g. a document foregoing references). Accept optional hyphenation
// because PDF line wrapping can split compounds such as "fore-going".
const SOURCE_NEGATION = /\b(?:(?:do|does|did|is|are|was|were|has|have|had)\s+not|not\s+(?:all|every|each|necessarily)|cannot|can\s+not|never|without|lack(?:s|ed|ing)?|absence|(?:for|fore)[- ]?go(?:es|ing|ne)?|omit(?:s|ted|ting)?|exclud(?:e|es|ed|ing)|absent|missing)\b/i;
const SOURCE_NEGATED_REPORTED_CONTENT = /\b(?:report(?:ed|s)?|state(?:d|s)?|say|said|indicate(?:d|s)?|claim(?:ed|s)?)\s+not\s+(?:to\b|that\b)/i;
const JA_NEGATED_REPORTING_PREDICATE = /(?:報告|述べ|示し|主張|回答)[^。！？\n]{0,10}(?:しない|しなかっ|しません|なかった)/;
// Epistemic `may/might not have been X` is weaker than a definite negative.
// Check the corresponding translated sentence when source/output boundaries
// align; otherwise leave this cue inconclusive to avoid a paragraph-level
// marker in an unrelated sentence masking or falsely triggering the signal.
const SOURCE_EPISTEMIC_NEGATIVE = /\b(?:may|might)\s+not\s+(?:(?:have|be)\s+)?(?:been\s+)?[a-z][a-z-]*\b/i;
const JA_EPISTEMIC_MARKER = /(?:可能性|かもしれ|とは限ら|おそれ|恐れ|かねない|あり得る|考えられ(?:る|た))/;
// Preserve claim strength for evidence-based academic statements. These are
// structural cues, not vocabulary blacklists: the guard only runs when the
// source explicitly combines evidence with a suggestion/indication or leaves
// a result to be specified later.
const SOURCE_EVIDENCE_SUGGESTION = /\b(?:first|initial|preliminary|early)\s+evidence\s+(?:suggests?|indicates?)\b/i;
const JA_EVIDENCE_SUGGESTION = /(?:示唆|示してい|示す可能性|初期(?:の)?証拠|最初の証拠|可能性がある)/;
const SOURCE_REMAINS_UNSPECIFIED = /\bremain(?:s)?\s+to\s+be\s+(?:further\s+)?(?:specified|determined|clarified|established)\b/i;
const JA_REMAINS_UNSPECIFIED = /(?:今後|引き続き|さらに|未(?:特定|確定)|明確(?:化|にする)必要|特定されていない|明らかにする必要|必要がある)/;
// Assessment predicates introduce a claim whose scope is the following
// whether/if clause. A fluent decoder can accidentally drop that predicate
// and leave only the topic clause. Treat this as structural evidence, not a
// paper-specific vocabulary rule; these verbs cover common Japanese forms.
const SOURCE_ASSESSMENT_SCOPE = /\b(?:assess(?:ed|ing)?|evaluat(?:e|ed|ing)|test(?:ed|ing)|examin(?:e|ed|ing))\s+(?:if|whether)\b/i;
const JA_ASSESSMENT_SCOPE = /(?:(?:評価|検証|調査|調べ|確かめ|確認|判断|判定|検討)[^。！？\n]{0,32}(?:か|かどうか|か否か)|(?:か|かどうか|か否か)[^。！？\n]{0,20}(?:評価|検証|調査|調べ|確かめ|確認|判断|判定|検討))/;
const JA_NEGATION = /(?:ない|なく|なかっ|ません|ず|ぬ|無|非|不|未|欠|否)/;
const SOURCE_DISJUNCTIVE_BOTH = /\bor\s+both\b/i;
const JA_BOTH = /(?:両方|双方|いずれも|ともに|同時に|両者|併せて|あわせて)/;
// A named intervention/technical identifier `X over Y` expresses a spatial
// target relation. Reversing the preserved identifiers around Japanese
// comparative `より` changes that relation into a comparison.
const SOURCE_OVER_IDENTIFIER_RELATION = /\b(?<agent>[A-Za-z][A-Za-z0-9-]*[A-Z][A-Za-z0-9-]*)\s+over\s+(?:the\s+)?(?:(?:right|left|upper|lower|anterior|posterior|dorsal|ventral)\s+)?(?<target>[A-Z][A-Za-z0-9-]*)\b/g;
const SOURCE_DIVERSE_PARTICIPANT_FIELDS = /\b(?:participants?|subjects?|respondents?)\b[^.!?]{0,120}\b(?:from|drawn\s+from|recruited\s+from|across)\s+(?:a\s+range\s+of\s+|various\s+|multiple\s+|different\s+|several\s+)(?:academic\s+)?(?:fields?(?:\s+of\s+study)?|disciplines?|departments?|faculties|majors?)\b/i;
const SOURCE_PARTICIPANT_ROLE = /\b(?:participants?|subjects?|respondents?)\b/i;
const SOURCE_RESEARCHER_ROLE = /\b(?:researchers?|investigators?|scientists?|academics?)\b/i;
const JA_PARTICIPANT_ROLE = /(?:参加者|被験者|回答者|対象者|研究協力者)/;
const JA_RESEARCHER_ROLE = /(?:研究者|研究員|調査者|科学者|学者)/;
const SOURCE_EXPLICIT_PER_FIELD_COUNT = /\b(?:each|every|per)\s+(?:academic\s+)?(?:field|discipline|department|faculty|major)\b/i;
const JA_FIELD_COUNT_DISPLACEMENT = /(?:各|それぞれの?)(?:学科|分野|学部|領域|専攻|部門)\s*(?:から|ごとに|あたり)?[^。！？\n]{0,12}[0-9０-９]+\s*(?:名|人)|[0-9０-９]+\s*名の(?:研究|学問)?(?:学科|分野|学部|領域|専攻|部門)/;
const SOURCE_COLLECTIVE_GROUP_COMPARISON = /\bnone\s+of\s+the\s+(?:study\s+)?groups?\b[^.!?]{0,160}\b(?:differ(?:ed|s)?|different|difference|significant|significantly)\b/i;
const SOURCE_EXPLICIT_TWO_GROUPS = /\b(?:two|2)\s+(?:study\s+)?(?:groups?|conditions?|arms?)\b/i;
const JA_BINARY_GROUP_COMPARISON = /(?:両群|二群|2群)\s*(?:間|間で|間に|の間|の|に|で)/;
// Restrict relation checks to unambiguous discourse markers. Generic `but`
// and `while` are intentionally excluded because Japanese may encode them
// through ordinary clause ordering without a dedicated connective.
const SOURCE_STRONG_CONTRAST = /\b(?:unlike|despite|in spite of)\b/i;
const JA_STRONG_CONTRAST = /(?:異なり|異なる|対照的|にもかかわらず|にも拘らず|ものの|一方で|反面|に対し(?:て)?)/;
const SOURCE_EXCLUSIVITY = /\b(?:only|sole|solely|unique|uniquely|instead\s+of)\b/i;
const SOURCE_REPLACEMENT = /\binstead\s+of\b/i;
// Japanese often renders exclusive/alternative English clauses with an
// explicit replacement construction ("instead of" -> "代わりに" / "ではなく")
// rather than a literal しか/のみ marker. Keep these as relation evidence so
// a faithful translation is not rejected solely for choosing a natural form.
const JA_EXCLUSIVITY = /(?:しか|のみ|だけ|唯一|ただ一つ|単独で|専ら|もっぱら|わずか|代わりに|替わりに|(?:の)?ではなく|異なり|異なる|対照的に|一意(?:に)?|固有|独自|独特|ユニーク|あれば十分|で十分|必要(?:なの)?は[^。！？\n]{0,24}(?:だけ|のみ)|意味が(?:ない|ありません)|意義が(?:ない|ありません)|有意義ではない|価値がない)/;
const JA_INSTEAD_OF = /より(?:も)?/;
const SOURCE_CONDITION = /\b(?:if|unless|provided that|as long as|depending on|whether)\b/i;
const SOURCE_WHETHER = /\bwhether\b/i;
const SOURCE_COMPARATIVE_LIKELIHOOD = /\b(?:more|less)\s+likely\b/i;
// Paired choice constructions encode two distinct decision questions. A
// fluent output can collapse them while preserving every number and citation.
const SOURCE_PAIRED_CHOICE_CONTRAST = /\bwhich-to-[a-z-]+\b[\s\S]{0,180}\bwhether-to-[a-z-]+\b|\bwhether-to-[a-z-]+\b[\s\S]{0,180}\bwhich-to-[a-z-]+\b/i;
const JA_WHETHER_CHOICE = /(?:かどうか|べきか|するか否か)/;
const JA_WHICH_CHOICE = /(?:どれ|どの|いずれの|何を|どちらを|選択する)/;
// Preserve positive equivalence claims such as “performs comparably to”. A
// fluent decoder can keep the equivalence vocabulary while negating the
// predicate (e.g. “the comparable material does not exist”), which changes a
// reported result without dropping any number or identifier.
const SOURCE_POSITIVE_EQUIVALENCE = /\b(?:performs?|performed|is|are|was|were)\s+(?:roughly\s+)?compar(?:ably|able)\s+to\b|\b(?:similar|equivalent)\s+to\b/i;
const JA_NEGATED_EQUIVALENCE = /(?:匹敵|同等|同程度|同じ程度|同様)[^。！？\n]{0,28}(?:ない|なく|なかっ|ません|存在しない|存在しません)/;
const JA_COMPARATIVE_CHOICE = /(?:どちら|いずれ|あるいは|それとも)[^。！？\n]{0,80}(?:かを|かどうか|か尋ね|か問|か調べ)/;
const JA_CONDITION = /(?:場合|ならば?|なければ|ければ|れば|たら|ない限り|である限り|に応じて|かどうか|か否か|条件|依存|により|によって|ためには)/;
// Alternative experimental conditions are easy to collapse into one branch
// while leaving a fluent Japanese sentence. Require an explicit alternative
// marker whenever the source uses the unambiguous "either ... or ..." form.
const SOURCE_ALTERNATIVE = /\beither\b[^.!?]{0,180}\bor\b/i;
const JA_ALTERNATIVE = /(?:または|あるいは|もしくは|いずれか|どちらか|か(?:、|,|\s|$))/;
// Causal-model failures can append the instruction used to elicit the
// translation (and occasionally a fresh example) after an otherwise fluent
// Japanese result. Detect the generic instruction shape only when it appears
// after translated content; do not blacklist domain words or named examples.
const TRANSLATION_INSTRUCTION_MARKER = /(?:次の(?:英語|英文)(?:の学術テキスト)?を日本語に翻訳してください|英語(?:の)?学術テキストを日本語に翻訳|translate the following (?:english )?(?:academic )?text|output only the japanese translation)/i;
// Models sometimes append a translator's note or wording advice after an
// otherwise plausible paragraph. This is output-side meta commentary, not a
// domain term; reject the structure without naming any paper-specific words.
const TRANSLATION_META_COMMENTARY = /(?:^|[。！？\n]\s*|[（(]\s*)(?:注|訳注|補足|備考)\s*[:：]|原文のままにし|文脈上適切な日本語に置き換えるべき|判断が必要/u;

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
    // Technical names are often rendered as a Japanese transliteration plus
    // the source acronym suffix (`CycleGAN` -> `サイクルGAN`). This is a
    // bilingual identifier boundary, not decoder corruption, when the Latin
    // suffix is an uppercase ending of a source token.
    if (/^[A-Z]{2,}$/.test(match[1]) && [...sourceTokens].some((token) => token.endsWith(candidate) && token.length > candidate.length)) return false;
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
 * Reports high-confidence signs that a native PDF block is a physical
 * continuation rather than a complete translation unit. This deliberately
 * reuses the layout safety evidence without changing production routing: the
 * caller can attribute the row to extraction or stitch it upstream instead
 * of counting it as a model-quality failure.
 */
export function diagnoseIncompleteSource(source: string): { incomplete: boolean; reason?: string } {
  const text = source.replace(/\s+/g, " ").trim();
  if (!text) return { incomplete: false };
  // A dash followed immediately by a lowercase word is typically a detached
  // continuation from the preceding PDF line/column, rather than a complete
  // list item. Numbered and capitalized dash items remain eligible.
  if (/^[–—-]\s+[a-z]/.test(text)) {
    return { incomplete: true, reason: "source begins with a continuation dash" };
  }
  const reason = unsafeParagraphStructureReason(text);
  if (reason) return { incomplete: true, reason };
  // Audit-only evidence: long prose blocks normally end at a sentence mark.
  // Keep this out of production routing because some publishers omit the
  // final period; the benchmark can report these rows for manual review.
  const looksLikeClosedQuote = /^(?:["“]).*(?:["”])(?:\s*\[[^\]]+\])?$/s.test(text);
  const looksLikeList = /^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(text);
  if (text.length >= 180 && !/[.!?。！？]$/.test(text) && !looksLikeClosedQuote && !looksLikeList) {
    return { incomplete: true, reason: "long prose block has no terminal sentence mark" };
  }
  // Shorter PDF blocks can still end at a hard page/column boundary. These
  // discourse tails are high-precision continuation cues when no terminal
  // punctuation is present; keep the threshold high enough to avoid rejecting
  // legitimate headings or list labels.
  if (text.length >= 70 && !/[.!?。！？]$/.test(text) && /(?:both\s+(?:studies|experiments|groups)|and|or|to|of|which|while|because|such\s+as)$/i.test(text)) {
    return { incomplete: true, reason: "source ends with a continuation cue" };
  }
  return { incomplete: false };
}

// A decoder can leave a short, fluent-looking English clause inside otherwise
// Japanese output.  Long source-overlap detection intentionally ignores these
// shorter spans, but four or more ordinary lower-case words are strong evidence
// that a clause was never translated.  Capitalized names, citations, URLs and
// identifiers are excluded so normal academic terminology is not penalized.
function hasUntranslatedSourcePhrase(source: string, output: string): boolean {
  // Author/year citations may contain journal titles and ordinary English
  // (`see Biber in ...`). Those spans are intentional retained source facts,
  // so exclude them before looking for untranslated prose.
  const citationSpan = /(?:\([^()\n]{0,240}\b(?:19|20)\d{2}\b[^()\n]{0,240}\)|（[^（）\n]{0,240}\b(?:19|20)\d{2}\b[^（）\n]{0,240}）)/g;
  const namedTechnicalSpan = /\b(?:(?:[A-Z][A-Za-z'-]+|of|in|the|and)\s+){2,}[A-Z][A-Za-z'-]+\s*\([A-Z]{2,}\)/g;
  const maskProtected = (value: string) => value
    .replace(citationSpan, " ")
    .replace(namedTechnicalSpan, " ");
  const normalizedOutput = maskProtected(output).toLowerCase().replace(/\s+/g, " ");
  const words = source.match(/[a-z][a-z'-]{1,}/gi) ?? [];
  for (let i = 0; i <= words.length - 4; i += 1) {
    const phraseWords = words.slice(i, i + 4);
    const phrase = phraseWords.join(" ").toLowerCase();
    if (phrase.length < 24 || looksLikeCitationContext(phrase)) continue;
    // The four-word window can omit the year or leading `see e.g.` marker
    // even though it belongs to an author-year citation in the source. Keep
    // those protected spans from looking like untranslated prose.
    const sourceIndex = source.toLowerCase().indexOf(phrase);
    if (sourceIndex >= 0) {
      const context = source.slice(Math.max(0, sourceIndex - 48), sourceIndex + phrase.length + 48);
      if (looksLikeCitationContext(context)) continue;
      namedTechnicalSpan.lastIndex = 0;
      if (namedTechnicalSpan.test(context)) {
        namedTechnicalSpan.lastIndex = 0;
        continue;
      }
      namedTechnicalSpan.lastIndex = 0;
    }
    // A retained noun phrase can be an intentional technical identifier.
    // Require clause-like evidence (a function word or common predicate) so
    // this guard targets untranslated prose rather than domain terminology.
    if (!phraseWords.some((word) => /^(?:a|an|the|and|or|of|in|on|for|with|to|from|by|is|are|was|were|be|been|has|have|show|shown|seen|used|use|based|including)$/i.test(word))) continue;
    // A bare structural label such as `Figure 2` has fewer than four prose
    // words. A retained explanation around it is a decoder failure.
    if (normalizedOutput.includes(phrase)) return true;
  }
  return false;
}

// Catch decoder fragments such as `光干渉metry`: a lowercase English tail is
// attached to Japanese but is neither a source word nor a deliberate
// capitalized identifier.  Capitalized/mixed-case product and method names
// remain allowed, as do lowercase words that occur verbatim in the source.
function hasUntranslatedMixedScriptLexeme(source: string, output: string): boolean {
  const sourceWords = new Set<string>();
  for (const word of source.match(/\b[a-z][a-z'-]{3,}\b/gi) ?? []) {
    const normalized = word.toLowerCase();
    sourceWords.add(normalized);
    for (const part of normalized.split(/[-‐‑‒–—]/u)) {
      if (part.length >= 4) sourceWords.add(part);
    }
  }
  const mixed = output.match(/(?:[\u3040-\u30ff\u3400-\u9fff](?<![A-Za-z])[a-z]{4,}|(?<![A-Za-z])[a-z]{4,}[\u3040-\u30ff\u3400-\u9fff])/g) ?? [];
  return mixed.some((fragment) => {
    const word = fragment.match(/[a-z]{4,}/)?.[0]?.toLowerCase();
    return Boolean(word && !sourceWords.has(word));
  });
}

function hasOrphanedInvariantSentence(output: string, source: string): boolean {
  if (source.trim().length < 120) return false;
  const sentences = output
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return false;
  const sourceStartsQuoted = /^["“‘]/u.test(source.trim());
  return sentences.some((sentence, sentenceIndex) => {
    const compact = sentence.replace(/\s+/g, "");
    if (compact.length < 4 || compact.length > 80) return false;
    // Dedications and epigraphs often begin with a short quoted sentence
    // followed by ordinary prose and a trailing citation. That first sentence
    // has no scientific invariant by design; do not mistake it for an
    // orphaned fact merely because a later citation is preserved separately.
    if (sourceStartsQuoted && sentenceIndex === 0 && compact.length <= 20) return false;
    // A citation may be emitted after the preceding Japanese sentence as its
    // own punctuation-delimited span (`...探求した。[5,6]。`).  The fact is
    // still preserved; treat this as a layout defect rather than an orphaned
    // translation fragment.  Mixed prose plus a citation remains guarded.
    if (/^(?:\[(?:\d{1,3}(?:\s*[-–—,]\s*\d{1,3})*)\]|\d{1,3})[。.!！？!?]?$/.test(compact)) return false;
    // Author/year references can also be detached after Japanese prose. Keep them when the span contains only a name, year, and optional page marker.
    const citationOnly = sentence.replace(/^[「『"”」\s]+/u, "");
    if (/^[[(]?(?:[A-Z][A-Za-z'’-]{1,40}(?:\s+et\s+al\.)?(?:\s*&\s*[A-Z][A-Za-z'’-]{1,40})?\s+(?:19|20)\d{2})(?:\s*;\s*[A-Z][A-Za-z'’-]{1,40}(?:\s+et\s+al\.)?(?:\s*&\s*[A-Z][A-Za-z'’-]{1,40})?\s+(?:19|20)\d{2})*[\]),;。.!！？!?]*$/.test(citationOnly)) return false;
    // Author names may contain diacritics or non-ASCII letters. If a short
    // detached span contains a year and citation syntax but no Japanese prose,
    // treat it as a preserved citation layout defect rather than an orphaned
    // translation fragment.
    if (/(?:19|20)\d{2}/.test(citationOnly)
      && /(?:\bet\s+al\.|&|,)/i.test(citationOnly)
      && !/[\u3040-\u30ff\u3400-\u9fff]/u.test(citationOnly)
      && /^[\p{L}\p{M}\d\s.,;:&'’()\[\]\-]+[。.!！？!?]*$/u.test(citationOnly)) return false;
    // Figure references can be emitted as a detached punctuation span by
    // models that preserve the reference but move it after the translated
    // sentence (`...である。 (Fig. 2 (b))`).  As with citation-only spans,
    // this is a presentation defect when no prose was lost; keep mixed prose
    // and missing figure references guarded.
    if (/^\(?Fig(?:ure)?\.?\s*\d+[a-z]?(?:\s*\([^)]*\))?\)?[。.!！？!?]?$/.test(sentence)) return false;
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

// A cascade candidate may otherwise pass all numeric/citation checks while
// leaving one ordinary English lexical item embedded in Japanese (for example
// `precedent`).  Keep this stricter check cascade-only: proper nouns and
// technical identifiers are common in accepted academic Japanese and must not
// make the primary translation fail.
const CASCADE_LATIN_STOPWORDS = new Set([
  "about", "after", "also", "among", "because", "before", "between",
  "could", "during", "every", "first", "from", "given", "have", "into",
  "more", "most", "other", "over", "same", "such", "than", "that",
  "their", "these", "they", "this", "through", "under", "using", "were",
  "which", "while", "with", "would",
]);
const CASCADE_LATIN_FUNCTION_WORDS = new Set([
  "although", "however", "moreover", "therefore", "whilst", "whereas", "unlike",
]);

function hasUntranslatedCascadeLexeme(source: string, output: string): boolean {
  if (!KANA.test(output)) return false;
  // Four-letter lowercase function words (such as `such` or `with`) can also
  // reveal an untranslated clause. Restrict the additional short-token check
  // to the explicit stop-word set below; domain acronyms and short technical
  // labels remain outside this guard.
  // Citation author names are source facts, not untranslated prose. Remove
  // year-bearing parenthesized spans before comparing lexical residue; the
  // scientific-invariant checks validate those spans separately.
  const citationSpan = /(?:\([^()\n]{0,240}\b(?:19|20)\d{2}\b[^()\n]{0,240}\)|（[^（）\n]{0,240}\b(?:19|20)\d{2}\b[^（）\n]{0,240}）)/g;
  const sourceForLexeme = source.replace(citationSpan, " ");
  const outputForLexeme = output.replace(citationSpan, " ");
  const sourceWords = sourceForLexeme.match(/\b[a-z][a-z'-]{3,}\b/gi) ?? [];
  // Do not require ASCII word boundaries: Japanese kana/kanji adjacent to a
  // retained English token (`such新しい`) still represents lexical residue.
  // Keep ASCII token boundaries intact while still allowing a retained
  // technical token to touch Japanese (`MouseLabシナリオ`). Without the
  // ASCII guards, fragments such as `ouse` inside `MouseLab` or `ake-` inside
  // `Take-The-Best` are falsely classified as untranslated English.
  const outputWords = outputForLexeme.match(/(?<![A-Za-z])[a-z][a-z'-]{3,}(?![A-Za-z])/gi) ?? [];
  const outputSet = new Set((outputForLexeme.match(/(?<![A-Za-z])[a-z][a-z'-]*(?![A-Za-z])/gi) ?? []).map((word) => word.toLowerCase()));
  const sourceTokens = sourceForLexeme.match(/\b[a-z][a-z'-]*\b/gi) ?? [];
  const sourceRawTokens = sourceForLexeme.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];
  for (let i = 0; i + 1 < sourceTokens.length; i += 1) {
    const first = sourceTokens[i].toLowerCase();
    const second = sourceTokens[i + 1].toLowerCase();
    if (first.length >= 5 && second.length >= 5 && sourceRawTokens[i] === first && sourceRawTokens[i + 1] === second && new RegExp(`\\b${first}\\s+${second}\\b`, "i").test(outputForLexeme)) {
      const previous = sourceTokens[i - 1]?.toLowerCase();
      // A phrase introduced as an ordinary noun (`a cover story`) is likely
      // untranslated content; a bare technical compound (`lumped elements`)
      // can remain as a domain term.
      return previous === "a" || previous === "an" || previous === "the";
    }
  }
  return sourceWords.some((word) => {
    const lower = word.toLowerCase();
    if (!outputSet.has(lower)) return false;
    // A lowercase token can be part of a source-backed product/tool name
    // (`G*Power`, `WebPower`) that the model correctly retains. Count the
    // complete compound as a technical identifier before flagging its tail as
    // untranslated ordinary prose.
    const escapedWord = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const compound = new RegExp(`\\b[A-Z][A-Za-z0-9]*(?:[*_-])[A-Za-z0-9]*${escapedWord}\\b`, "i").exec(source);
    if (compound && new RegExp(compound[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(outputForLexeme)) return false;
    // Capitalized source terms are commonly names, product names, or method
    // labels. Lowercase lexical items are the higher-confidence signal.
    if (word !== lower && !CASCADE_LATIN_FUNCTION_WORDS.has(lower)) return false;
    const occurrences = outputWords.filter((candidate) => candidate.toLowerCase() === lower).length;
    if (occurrences !== 1) return false;
    // A source lowercase word may legitimately be retained with an initial
    // capital as part of a named method (`Weight-Additive Strategy`). Only
    // flag an exact lowercase residue; sentence-initial/function-word cases
    // remain covered by the explicit function-word set above.
    if (!outputWords.some((candidate) => candidate === lower)) {
      const retainedTitleCaseLabel = new RegExp(
        `\\b[A-Z][A-Za-z'-]+\\s+[A-Z][A-Za-z'-]+\\b`,
      ).test(output)
        && new RegExp(`\\b${escapedWord}\\b`, "i").test(outputForLexeme);
      if (retainedTitleCaseLabel) return false;
      // Allow a capitalized tail of a source-backed hyphenated method label,
      // such as `Weight-Additive Strategy`; an arbitrary capitalized rendering
      // of a lowercase noun (`a strategy` -> `Strategy`) remains suspicious.
      const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const methodLabel = new RegExp(`\\b(?:[A-Z][A-Za-z]+-)+[A-Z][A-Za-z]+\\s+${escaped}\\b`, "i").test(sourceForLexeme);
      if (methodLabel) return false;
      return true;
    }
    // Lowercase stopwords are never required technical vocabulary. A single
    // retained token such as `such` or `with` therefore indicates untranslated
    // ordinary prose; proper-name and acronym handling remains unchanged.
    if (CASCADE_LATIN_STOPWORDS.has(lower)) return true;
    // Preserve an explicitly retained multi-word technical phrase, but do
    // not let a single neighboring word hide ordinary residue (for example
    // `Whilst this ...`).
    return true;
  });
}

/**
 * Detect a cascade candidate that duplicates an opaque author/year citation
 * span. A model may copy a citation once per sentence after it has been
 * detached from the source context; that is an addition even when every
 * numeric invariant is present. Compare normalized parenthesized year spans
 * against the source count and keep the rule independent of author names.
 */
export function hasDuplicatedYearCitationSpan(source: string, output: string): boolean {
  const spanPattern = /(?:\([^()\n]{0,180}\b(?:19|20)\d{2}\b[^()\n]{0,180}\)|（[^（）\n]{0,180}\b(?:19|20)\d{2}\b[^（）\n]{0,180}）)/g;
  const normalize = (value: string) => value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[、，]/g, ",")
    .replace(/\s*:\s*/g, ":")
    // Japanese decoders commonly emit fullwidth citation parentheses while
    // the PDF source uses ASCII parentheses. They are the same citation span
    // for invariant comparison and must not create a false duplicate.
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    // `e.g.,` is a discourse cue, not part of the author/year citation
    // identity. Models may naturally omit it while preserving the full
    // citation group; do not treat that formatting change as duplication.
    .replace(/^\(?\s*e\.g\.,?\s*/i, "(")
    .trim()
    .toLowerCase();
  const sourceCounts = new Map<string, number>();
  for (const match of source.matchAll(spanPattern)) {
    const key = normalize(match[0]);
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  if (sourceCounts.size === 0) return false;
  const outputCounts = new Map<string, number>();
  for (const match of output.matchAll(spanPattern)) {
    const key = normalize(match[0]);
    outputCounts.set(key, (outputCounts.get(key) ?? 0) + 1);
  }
  const citationAtomPattern = /\b[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+et\s+al\.)?\s*,?\s*(?:19|20)\d{2}[a-z]?\b/gi;
  const atomCounts = (value: string) => {
    const counts = new Map<string, number>();
    for (const atom of value.match(citationAtomPattern) ?? []) {
      const key = atom.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const sourceAtoms = atomCounts(source);
  return [...outputCounts].some(([key, count]) => {
    if (count <= (sourceCounts.get(key) ?? 0)) return false;
    // Extraction can split one author/year group (for example a malformed
    // trailing bare year) while the model restores the atomic author/year
    // citation. If every atom is present no more often than in the source,
    // this is regrouping rather than an added citation.
    if (!sourceCounts.has(key)) {
      const span = [...output.matchAll(spanPattern)].map((match) => match[0]).find((value) => normalize(value) === key);
      const atoms = span ? atomCounts(span) : new Map<string, number>();
      const regrouped = atoms.size > 0 && [...atoms].every(([atom, atomCount]) => atomCount <= (sourceAtoms.get(atom) ?? 0));
      if (regrouped) return false;
    }
    return true;
  });
}

// A citation year must not be reintroduced as a standalone calendar year in
// unrelated Japanese prose. This catches scope drift such as a source ending
// with `(Parker and Schrift, 2011)` becoming `2011年、研究2で...` earlier in
// the translated claim. Years that are ordinary source prose remain allowed.
function hasCitationYearScopeDrift(source: string, output: string): boolean {
  const citationSpan = /(?:\([^()\n]{0,240}\b(?:19|20)\d{2}\b[^()\n]{0,240}\)|（[^（）\n]{0,240}\b(?:19|20)\d{2}\b[^（）\n]{0,240}）)/g;
  const sourceOutsideCitations = source.replace(citationSpan, " ");
  const outputOutsideCitations = output.replace(citationSpan, " ");
  const citationYears = new Set<string>();
  for (const match of source.matchAll(citationSpan)) {
    for (const year of match[0].match(/\b(?:19|20)\d{2}\b/g) ?? []) citationYears.add(year);
  }
  return [...citationYears].some((year) =>
    !new RegExp(`\\b${year}\\b`).test(sourceOutsideCitations)
    && new RegExp(`(?:^|[^0-9])${year}年`).test(outputOutsideCitations),
  );
}

// Alternate models can leave an ordinary multi-word English phrase untouched
// while surrounding it with fluent Japanese. Keep this cascade-only and
// conservative: two adjacent lowercase words of at least eight letters must
// appear verbatim in the output. Proper names and short acronyms do not match.
function hasUntranslatedCascadePhrase(source: string, output: string): boolean {
  if (!KANA.test(output)) return false;
  const sourceWords = source.match(/\b[a-z][a-z'-]{7,}\b/g) ?? [];
  const outputRawWords = output.match(/\b[a-z][a-z'-]*\b/gi) ?? [];
  const outputWords = outputRawWords.map((word) => word.toLowerCase());
  for (let index = 0; index < sourceWords.length - 1; index += 1) {
    const first = sourceWords[index].toLowerCase();
    const second = sourceWords[index + 1].toLowerCase();
    for (let outputIndex = 0; outputIndex < outputWords.length - 1; outputIndex += 1) {
      if (outputWords[outputIndex] !== first || outputWords[outputIndex + 1] !== second) continue;
      // Title-cased multiword names (often a retained application or method
      // label) are intentional technical identifiers, not untranslated prose.
      // Ordinary English left in a Japanese sentence remains lowercase and is
      // still rejected.
      if (/^[A-Z][A-Za-z'-]*$/.test(outputRawWords[outputIndex])
        && /^[A-Z][A-Za-z'-]*$/.test(outputRawWords[outputIndex + 1])) continue;
      return true;
    }
  }
  return false;
}

// A repeated ordinary source term should be translated consistently. If a
// lowercase term occurs at least three times in the source but only some of
// its occurrences remain in otherwise Japanese output, the model likely
// mixed a translated equivalent with an untranslated lexical residue. This
// is cascade-only and ignores citations, acronyms, and title-case identifiers.
function hasInconsistentRepeatedLexeme(source: string, output: string): boolean {
  if (!KANA.test(output)) return false;
  const citationSpan = /(?:\([^()\n]{0,240}\b(?:19|20)\d{2}\b[^()\n]{0,240}\)|（[^（）\n]{0,240}\b(?:19|20)\d{2}\b[^（）\n]{0,240}）)/g;
  const namedTechnicalSpan = /\b(?:(?:[A-Z][A-Za-z'-]+|of|in|the|and)\s+){2,}[A-Z][A-Za-z'-]+\s*\([A-Z]{2,}\)/g;
  const mask = (value: string) => value.replace(citationSpan, " ").replace(namedTechnicalSpan, " ");
  const sourceBody = mask(source);
  const outputBody = mask(output);
  const sourceWords = sourceBody.match(/\b[a-z][a-z'-]{3,}\b/gi) ?? [];
  const outputWords = outputBody.match(/(?<![A-Za-z])[a-z][a-z'-]{3,}(?![A-Za-z])/gi) ?? [];
  const counts = new Map<string, number>();
  for (const word of sourceWords) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts].some(([word, count]) => {
    if (count < 3 || CASCADE_LATIN_STOPWORDS.has(word)) return false;
    const retained = outputWords.filter((candidate) => candidate.toLowerCase() === word).length;
    return retained > 0 && retained < count;
  });
}

// Structural labels are facts about document navigation. Reject a cascade
// candidate that invents a numbered Figure/Table/Result/Section/Appendix
// label absent from the source; this is a generic inventory check, not a
// paper-specific vocabulary rule.
function hasUnsupportedStructuralLabel(source: string, output: string): boolean {
  const labels = (value: string) => value.match(/\b(?:figure|fig\.?|table|result|section|appendix)\s+\d+(?:\s*[-–]\s*\d+)?/gi) ?? [];
  const sourceLabels = new Set(labels(source).map((label) => label.toLowerCase().replace(/\s+/g, " ")));
  return labels(output).some((label) => !sourceLabels.has(label.toLowerCase().replace(/\s+/g, " ")));
}

function hasCascadeSentenceCompression(source: string, output: string): boolean {
  // Count discourse sentence boundaries rather than every period followed by
  // whitespace. Academic prose contains many dotted labels ("Eqn. 20",
  // "Fig. 2", initials and decimals) that otherwise inflate the source count
  // and make a faithful Japanese rendering look artificially compressed.
  const sourceSentenceCount = source
    .split(/(?<=[!?])\s+|(?<=[.])\s+(?=[A-Z])|(?<=[.!?])\s*$/)
    .map((part) => part.trim())
    .filter(Boolean).length;
  // Japanese prose normally places no whitespace after `。`; count the
  // punctuation itself rather than requiring an English-style separator.
  const outputSentenceCount = (output.match(/[。！？]/g) ?? []).length;
  // Japanese may legitimately join short English sentences, so only apply
  // this to long multi-sentence units and require a substantial loss.
  return sourceSentenceCount >= 8 && outputSentenceCount < sourceSentenceCount * 0.6;
}

function hasUntranslatedSourceLabel(source: string, output: string): boolean {
  // Repeated author names and venue/proper-noun mentions are expected to
  // remain in Latin script. Remove citation groups before looking for a
  // duplicated extraction label, then skip capitalized terms that have the
  // shape of a proper noun rather than a copied UI label.
  const citationSpan = /(?:\([^()\n]{0,240}\b(?:19|20)\d{2}\b[^()\n]{0,240}\)|\[[^\]\n]{0,240}\b(?:19|20)\d{2}\b[^\]\n]{0,240}\])/g;
  const sourceWords = source.replace(citationSpan, " ").match(/\b[A-Za-z]{8,}\b/g) ?? [];
  const properNounWords = new Set(sourceWords.filter((word) => /^[A-Z]/.test(word)).map((word) => word.toLowerCase()));
  const counts = new Map<string, number>();
  for (const word of sourceWords) counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
  for (const [word, count] of counts) {
    if (count < 2) continue;
    // A duplicated capitalized label at the beginning of a block is a common
    // extraction artifact (`Procedures Interventions Interventions ...`).
    // Treat its position as stronger evidence than capitalization; genuine
    // proper nouns are handled by the later frequency/compound safeguards.
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repeatedAtBlockStart = new RegExp(`^(?:\\s*\\S+\\s+){0,3}${escaped}\\s+${escaped}\\b`, "i").test(source);
    if (properNounWords.has(word) && !repeatedAtBlockStart) continue;
    // A retained `SI Appendix` is an intentional document cross-reference,
    // not an untranslated extraction label. Keep the complete label atomic.
    if (word === "appendix" && /\bSI\s+Appendix\b/i.test(source) && /\bSI\s+Appendix\b/i.test(output)) continue;
    // A technical/proper noun repeated throughout a paragraph is often
    // intentionally transliterated (for example “Bluetooth広告”).  The
    // source-label detector targets duplicated extraction labels, which are
    // normally adjacent at the start of a unit; do not reject a high-frequency
    // domain term merely because the model preserved its Latin spelling.
    if (count >= 3) continue;
    const adjacent = new RegExp(`(?:[\\u3040-\\u30ff\\u3400-\\u9fff]${escaped}|${escaped}[\\u3040-\\u30ff\\u3400-\\u9fff])`, "i");
    if (adjacent.test(output)) return true;
    const repeatedWithJapanese = new RegExp(`${escaped}[\\s　]*(?:[\\u3040-\\u30ff\\u3400-\\u9fff]{1,6}[\\s　]*)${escaped}`, "i");
    if (repeatedWithJapanese.test(output)) return true;
  }
  return false;
}

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

// Audit-only diagnostic for named tools, systems, and methods.  This is kept
// separate from scientific invariants because a proper name may legitimately
// be transliterated in Japanese.  Callers can review the candidates before
// deciding whether a particular model/output should be rejected.
const COMMON_CAPITALIZED_PROSE = new Set([
  "After", "Although", "Because", "Before", "Both", "Broadly", "Chapter",
  "Each", "Finally", "First", "However", "Moreover", "Often", "One",
  "Our", "Other", "People", "Second", "Specifically", "Such", "Table",
  "The", "These", "This", "Thus", "While", "When", "Where", "Which",
  "Within",
]);

export function extractTechnicalNameCandidates(source: string): string[] {
  const tokenCounts = new Map<string, number>();
  for (const token of source.match(/\b[A-Z][A-Za-z0-9]{3,}(?:[-'][A-Za-z0-9]+)*\b/g) ?? []) {
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  }
  const candidates = new Set<string>();
  // Supplementary-material references are multi-token document labels. Keep
  // the phrase atomic so an audit does not report only `Appendix` and miss
  // omission of the complete `SI Appendix` cross-reference.
  for (const match of source.matchAll(/\bSI\s+Appendix\b/gi)) {
    candidates.add(match[0]);
  }
  for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9]{3,}(?:[-'][A-Za-z0-9]+)*\b/g)) {
    const token = match[0];
    if (COMMON_CAPITALIZED_PROSE.has(token)) continue;
    const start = match.index ?? 0;
    const before = source.slice(0, start);
    // Sentence-initial words are not reliable names; keep internal capitals,
    // all-caps identifiers, and title-case terms used after ordinary prose.
    const sentenceInitial = /(?:^|[.!?]\s*)$/.test(before);
    if (sentenceInitial && !/[A-Z].*[A-Z]/.test(token)) continue;
    if (/^[A-Z][a-z]+$/.test(token) && token.length < 5) continue;
    const context = source.slice(Math.max(0, start - 36), start + token.length + 48);
    const hasNameCue = /\b(?:project|system|tool|prototype|platform|method|model|dataset|software|package|framework|algorithm|library|interface)\b/i.test(context);
    const repeated = (tokenCounts.get(token) ?? 0) >= 2;
    const mixedCaseOrAcronym = /[A-Z].*[A-Z]/.test(token) || /^[A-Z]{2,}$/.test(token);
    if (!hasNameCue && !repeated && !mixedCaseOrAcronym) continue;
    candidates.add(token);
  }
  return [...candidates];
}

export function missingTechnicalNameCandidates(source: string, output: string): string[] {
  const normalizedOutput = output.normalize("NFKC").toLocaleLowerCase();
  return extractTechnicalNameCandidates(source).filter(
    (candidate) => !normalizedOutput.includes(candidate.normalize("NFKC").toLocaleLowerCase()),
  );
}

/**
 * Quoted coined names are source facts rather than ordinary prose.  A fluent
 * translation that drops one (for example a named prototype) can still pass
 * language and length checks, so keep this narrow structural invariant
 * separate from the broad technical-name audit.
 */
export function missingQuotedTechnicalNames(source: string, output: string): string[] {
  const names = [...source.matchAll(/[“"]([A-Z][A-Za-z0-9][A-Za-z0-9_-]{3,})[”"]/g)]
    .filter((match) => {
      const name = match[1];
      if (COMMON_CAPITALIZED_PROSE.has(name)) return false;
      // A title-cased adjective used as an experimental label (e.g.
      // “Normal”) is ordinary prose. Treat a single-word label as a coined
      // name only when it has identifier-like spelling or is introduced by a
      // naming frame such as “dubbed the …”.
      const identifierLike = /[a-z][A-Z]|\d|[-_]/.test(name);
      const context = source.slice(Math.max(0, (match.index ?? 0) - 48), match.index ?? 0);
      return identifierLike || /(?:dubbed|called|named|prototype|interface|system)\s+(?:the\s+)?$/i.test(context);
    })
    .map((match) => match[1]);
  const normalized = output.normalize("NFKC").toLocaleLowerCase();
  return [...new Set(names)].filter((name) => !normalized.includes(name.normalize("NFKC").toLocaleLowerCase()));
}

/**
 * Audit-only signal for numeric citations that survive as detached numbers.
 * It intentionally does not reject output: experiment counts and years can
 * look identical to citations, so this requires several citation-like source
 * markers and several bare numeric output tokens before flagging.
 */
export function hasDetachedNumericCitationRisk(source: string, output: string): boolean {
  const sourceCitationMarkers = source.match(/(?:[,;]\s*|\()\d{1,3}/g) ?? [];
  if (sourceCitationMarkers.length < 3) return false;
  const outputBareNumbers = output.match(/(?<![A-Za-z])\d{1,3}(?![A-Za-z%])/g) ?? [];
  return outputBareNumbers.length >= sourceCitationMarkers.length;
}

/** Audit-only check for a technical expansion changing while its acronym remains. */
export function hasAcronymExpansionDrift(source: string, output: string): boolean {
  const expansion = /\b((?:[A-Z][a-z]+\s+){1,6}[A-Z][a-z]+)\s*\(([A-Z]{2,8})\)/g;
  for (const match of source.matchAll(expansion)) {
    const phrase = match[1].trim();
    const acronym = match[2];
    const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\b${escaped}\\b`).test(output) || output.includes(phrase)) continue;
    // A retained Latin phrase immediately before the acronym is strong
    // evidence of an altered expansion; Japanese transliteration alone is
    // left inconclusive to avoid false rejects.
    if (new RegExp(`[A-Za-z][A-Za-z -]{2,40}\\(\\s*${escaped}\\s*\\)`, "i").test(output)) return true;
  }
  return false;
}

/**
 * Audit signal for an acronym that gains an unsupported Japanese expansion.
 * Only flags output that adds Japanese text in parentheses immediately after
 * an acronym whose English source has no explicit expansion. It is deliberately
 * separate from the main gate until its false-positive rate is measured.
 */
export function hasUnsupportedJapaneseAcronymExpansion(source: string, output: string): boolean {
  const acronyms = [...new Set(source.match(/\b[A-Z][A-Z0-9-]{2,7}\b/g) ?? [])];
  for (const acronym of acronyms) {
    const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sourceHasExpansion = new RegExp(`(?:[A-Za-z][A-Za-z -]{2,80})\\(\\s*${escaped}\\s*\\)`, "i").test(source);
    if (sourceHasExpansion) continue;
    const outputExpansion = new RegExp(`\\b${escaped}\\s*[（(]([^）)]{2,80})[）)]`, "u");
    const match = outputExpansion.exec(output);
    if (match && /[ぁ-ゖァ-ヺ一-龯々]/u.test(match[1])) return true;
  }
  return false;
}

/**
 * Detect high-risk loss of semantic qualifiers in an explicitly expanded
 * scientific acronym. This is deliberately limited to directional/anatomical
 * qualifiers that have stable Japanese realizations; it is evidence for the
 * alternate-model selector, not a general bilingual dictionary.
 */
export function hasScientificExpansionQualifierDrift(source: string, output: string): boolean {
  const expansion = /\b((?:[A-Za-z][A-Za-z-]+\s+){1,8}[A-Za-z][A-Za-z-]+)\s*\(([A-Za-z][A-Za-z]{1,7})\)/g;
  for (const match of source.matchAll(expansion)) {
    const phrase = match[1].trim().toLowerCase();
    const acronym = match[2];
    if (!new RegExp(`\\b${acronym}\\b`).test(output)) continue;
    const required: RegExp[] = [];
    if (/\bright\b/.test(phrase)) required.push(/右/);
    if (/\bleft\b/.test(phrase)) required.push(/左/);
    if (/\blateral\b/.test(phrase)) required.push(/(?:外側|側)/);
    if (/\bmedial\b/.test(phrase)) required.push(/内側/);
    if (/\bprefrontal\b/.test(phrase)) required.push(/前頭前/);
    if (/\bcortex\b/.test(phrase)) required.push(/皮質/);
    if (required.length > 0) {
      const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const occurrence of output.matchAll(new RegExp(escaped, "g"))) {
        const index = occurrence.index ?? 0;
        const context = output.slice(Math.max(0, index - 80), Math.min(output.length, index + acronym.length + 80));
        if (required.some((marker) => !marker.test(context))) return true;
      }
    }
  }
  return false;
}

/** Audit-only cue for long paragraphs whose accepted output is unusually compressed. */
export function hasExtremeTranslationCompression(source: string, output: string): boolean {
  const sourceLength = source.trim().length;
  if (sourceLength < 600) return false;
  return output.trim().length / sourceLength < 0.36;
}

export const TRANSLATION_QUALITY_VERSION = "quality-v36";

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
  ["measurement", /(?:\b|(?<=[x×]))\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf]|[cf])(?![A-Za-z])/gi],
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
  const invariantSource = source.normalize("NFKC").replace(/[μµ]/g, "u").replace(/◦\s*([CF])/gi, "°$1").replace(/℃/g, "°C").replace(
    /(\d),\s*(?=\d{1,2}\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi,
    "$1.",
  ).replace(
    /(\d)\s*-\s*(?=(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi,
    "$1",
  );
  const found: ScientificInvariant[] = [];
  const covered: Array<[number, number]> = [];
  for (const [kind, pattern] of SCIENTIFIC_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of invariantSource.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      // A thousands-separated value such as `13,000` is one numeric fact;
      // do not emit the separator tail (`000`) as an independent invariant.
      if (kind === "number" && start > 0 && invariantSource[start - 1] === "," &&
          start > 1 && /\d/.test(invariantSource[start - 2])) continue;
      // A superscript footnote marker can be flattened by PDF extraction into
      // `3 (Jones 2019; ...)`. It is document structure, not a numeric claim.
      // Exclude only this unambiguous citation-adjacent shape; participant
      // counts such as `n = 3` and ordinary measurements remain protected.
      if (kind === "number" && /^\s*\(\s*[A-Z][A-Za-z'’-]*(?:\s+(?:and|et\s+al\.?|[A-Z][A-Za-z'’-]*))*\s*,?\s*(?:19|20)\d{2}\b/.test(invariantSource.slice(end, end + 180))) {
        const before = invariantSource.slice(Math.max(0, start - 12), start);
        if (!/\b(?:n|N)\s*=\s*$/u.test(before)) continue;
      }
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
      // PDF text often flattens a footnote marker onto a Roman-numeral name
      // suffix (`Hal Daumé III5`). Treat the trailing digit as a footnote
      // marker when a personal-name-shaped token precedes it; it is document
      // chrome rather than a model/technical identifier that must be copied.
      if (kind === "acronym" && /^[IVXLCDM]{2,}\d{1,2}$/i.test(match[0])) {
        const before = invariantSource.slice(Math.max(0, start - 48), start);
        if (/\b[A-ZÀ-ÖØ-Ý][\p{L}\p{M}'’-]{2,}\s+$/u.test(before)) continue;
      }
      found.push({ kind, value: match[0] });
      if (kind !== "number") covered.push([start, end]);
    }
  }
  return [...new Map(found.map((item) => [`${item.kind}:${normalizeInvariant(item.value)}`, item])).values()];
}

function normalizeInvariant(value: string): string {
  return value
    .normalize("NFKC")
    // Alternate local models occasionally wrap preserved citations or figure
    // labels in harmless HTML (`<sup>26</sup>`). Compare the scientific
    // payload rather than the presentation markup; the structural/citation
    // checks below still require the exact number or label to be present.
    // Strip actual markup tags only. A broad `<[^>]*>` pattern would mistake
    // mathematical comparisons such as `p < .001 ... p > 0.05` for one HTML
    // tag and erase the intervening statistical evidence.
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .toLowerCase()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u00a0]/g, "")
    // Japanese academic output commonly uses fullwidth citation brackets.
    // Normalize punctuation shape for invariant matching while preserving the
    // exact citation payload requirement below.
    .replace(/[［］【】]/g, (bracket) => ({ "［": "[", "］": "]", "【": "[", "】": "]" })[bracket] ?? bracket)
    .replace(/[−–—]/g, "-")
    // Decimal trailing zeros are representational formatting, not a changed
    // scientific value (`0.60` and `0.6` carry the same quantity). Canonicalize
    // only decimal tokens; integers, years, identifiers and ranges remain
    // exact so this cannot hide a changed count or citation label.
    .replace(/\b(\d+\.\d+)\b/g, (token) => {
      const numeric = Number(token);
      return Number.isFinite(numeric) ? String(numeric) : token;
    })
    // Thousands separators are formatting, not a changed scientific value
    // (`6,336` and `6336` must compare equal after translation).
    .replace(/(?<=\d),(?=\d{3}\b)/g, "")
    .replace(/(\d),\s*(?=\d{1,2}\s*(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi, "$1.")
    // PDF extraction often inserts a hyphen between a scalar and its unit
    // (`10-m walk`). Japanese output conventionally joins them (`10m`).
    // Normalize only when the hyphen is immediately followed by a known unit;
    // numeric ranges such as `4-6s` remain unchanged.
    .replace(/(\d)\s*-\s*(?=(?:mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b)/gi, "$1")
    // Some academic Japanese decodes use locale-style decimal commas
    // (`0,7 mm`). Treat a comma between two digits as a decimal separator for
    // invariant comparison; ordinary list punctuation remains unchanged.
    .replace(/\u0338=/g, "!=")
    .replace(/≠/g, "!=")
    .replace(/[μµ]/g, "u")
    .replace(/◦\s*([cf])/gi, "°$1")
    .replace(/℃/g, "°c")
    .replace(/(?<=\d)c\b/gi, "°c");
}

// A translation can preserve every numeric value while still scrambling a
// measurement list (for example width, length, mass, power).  Such output is
// unsafe for a research paper even though the existing presence-only invariant
// check passes.  Restrict this check to three or more unit-bearing values so
// ordinary prose with one or two measurements is not rejected for natural
// Japanese reordering.
function measurementOrderChanged(source: string, output: string): boolean {
  const pattern = /(?<!\d)(\d+(?:\.\d+)?)\s*(mm|cm|m|km|ms|s|hz|khz|mhz|uw|mw|w|kg|mg|pf|nf|uf|μf|mf|mah|db|%|°[cf])\b/gi;
  const sourceValues = [...source.matchAll(pattern)].map((match) => match[1]);
  if (sourceValues.length < 3) return false;
  // Restore may concatenate adjacent values (`11.3 mm31 mm335 mg`).  Compare
  // the numeric payloads after identifying them from the source measurements,
  // rather than requiring a clean unit boundary in the decoded Japanese.
  const sourceSet = new Set(sourceValues);
  const outputValues = [...output.normalize("NFKC").matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => match[0])
    .filter((value) => sourceSet.has(value));
  if (sourceValues.some((value) => !outputValues.includes(value))) return false;
  let cursor = 0;
  for (const value of outputValues) {
    if (value === sourceValues[cursor]) cursor += 1;
    if (cursor === sourceValues.length) return false;
  }
  return true;
}

/** Detect reordered multi-panel figure references. */
function figureReferenceOrderChanged(source: string, output: string): boolean {
  const parse = (value: string): string[] => [...value.matchAll(/(?:\b(?:fig(?:ure)?)\.?|図)\s*(\d+)\s*(?:[（(]([a-z])[）)]|([a-z]))?/gi)]
    .map((match) => `${match[1]}${(match[2] ?? match[3] ?? "").toLowerCase()}`);
  const sourceRefs = parse(source);
  if (sourceRefs.length < 2) return false;
  let outputRefs = parse(output);
  // A decoder can detach the localized label (`図に示す。2 (e)`). If the
  // source has multiple panel references, recover these numeric/panel pairs
  // as a conservative diagnostic rather than treating label loss as harmless.
  if (outputRefs.length < sourceRefs.length) {
    outputRefs = [...output.matchAll(/(\d+)\s*[（(]([a-z])[）)]/gi)]
      .map((match) => `${match[1]}${match[2].toLowerCase()}`);
  }
  if (outputRefs.length < sourceRefs.length) return false;
  let cursor = 0;
  for (const ref of outputRefs) {
    if (ref === sourceRefs[cursor]) cursor += 1;
    if (cursor === sourceRefs.length) return false;
  }
  return true;
}

function hasDetachedFigureReference(source: string, output: string): boolean {
  if (!/(?:\b(?:fig(?:ure)?)\.?|図)\s*\d+/i.test(source)) return false;
  // `図に示す。2 (e)` loses the figure-number attachment and can attach a
  // panel to the wrong claim even when both numeric panels survive.
  return /図[^0-9\n]{4,}\d+\s*[（(][a-z][）)]/i.test(output);
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

/**
 * Citation brackets are formatting, not semantics. A decoder may split a
 * source group such as `[13, 19–23]` into `[13] ... [19–23]`; compare the
 * atomic labels/ranges so this does not become a false scientific invariant
 * addition. The range itself remains atomic and is never expanded.
 */
function citationAtoms(value: string): string[] {
  const body = value.replace(/^\s*\[|\]\s*$/g, "");
  return body
    .split(/\s*,\s*/)
    .map((part) => normalizeInvariant(part).replace(/[\[\]]/g, ""))
    .filter(Boolean);
}

function citationFactKeys(item: ScientificInvariant): string[] {
  if (item.kind !== "citation") return [invariantFactKey(item)];
  return citationAtoms(item.value).map((atom) => `citation:${atom}`);
}

function outputContainsInvariant(output: string, invariant: ScientificInvariant, source: string): boolean {
  if (String(invariant.kind) === "citation") {
    const outputCitationAtoms = extractScientificInvariants(output)
      .filter((item) => item.kind === "citation")
      .flatMap((item) => citationAtoms(item.value));
    const sourceAtoms = citationAtoms(invariant.value);
    if (sourceAtoms.every((atom) => outputCitationAtoms.includes(atom))) return true;
    // Preserve the established handling for inline/superscript references
    // (`...29,30,32`) and harmless markup (`<sup>29</sup>`), which are not
    // always recognized by the citation extractor because they are adjacent
    // to Japanese text or HTML tags.
    const markupFree = output.replace(/<[^>]+>/g, "");
    const normalized = normalizeInvariant(markupFree);
    return normalized.includes(normalizeInvariant(invariant.value))
      || sourceAtoms.every((atom) => normalized.includes(atom));
  }
  const normalizedOutput = normalizeInvariant(output);
  const value = normalizeInvariant(invariant.value);
  // SI-style magnitude prefixes are often localized in academic Japanese
  // (`3 M word tokens` → `300万語トークン`). Accept only the exact decimal
  // conversion for a standalone M prefix; ordinary model identifiers and
  // unrelated capital letters remain strict.
  if (invariant.kind === "measurement") {
    const magnitude = invariant.value.match(/^(\d+(?:\.\d+)?)\s*M$/i);
    if (magnitude) {
      const converted = Number(magnitude[1]) * 1_000_000;
      if (Number.isInteger(converted)) {
        const japaneseMan = String(converted / 10_000).replace(/\.0+$/, "");
        if (new RegExp(`${japaneseMan}万`).test(output.normalize("NFKC"))) return true;
      }
    }
  }
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
      return new RegExp(`(?:^|[^0-9])${escaped}(?:節|章)(?:で説明|に示|において|を参照)?`, "i").test(output)
        || new RegExp(`(?:^|[^0-9])${escaped}(?:で説明|に示|において|を参照)`, "i").test(output);
    });
  }
  if (invariant.kind === "figure") {
    const figure = invariant.value.match(/\b(\d+)(\s*\([a-z]\)|[a-z])?/i);
    if (!figure) return false;
    const number = figure[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const panel = (figure[2] ?? "").replace(/\s+/g, "").replace(/[()]/g, "");
    const panelAlternatives = panel
      ? `(?:${panel}|\\(${panel}\\))`
      : "";
    return new RegExp(`(?:\\bfig(?:ure)?s?\\.?|図)\\s*${number}${panelAlternatives}`, "i").test(output);
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
  if (invariant.kind === "citation") {
    // Citation groups may be rendered as separate superscripts or with
    // localized punctuation (`<sup>26</sup>、<sup>27</sup>`). Preserve every
    // numeric payload while allowing presentation markup/separators to vary.
    const citationNumbers = invariant.value.match(/\d+/g) ?? [];
    if (citationNumbers.length > 1 && citationNumbers.every((number) =>
      new RegExp(`(?:^|\\D)${number}(?:$|\\D)`).test(normalizedOutput)
    )) return true;
  }
  // A small set of standardized scientific abbreviations has an unambiguous
  // Japanese expansion. Accept the translated form only when the acronym is
  // used in the source's corresponding technical context; this avoids
  // treating arbitrary dropped identifiers as harmless.
  if (invariant.kind === "acronym") {
    const commonScientificExpansions: Record<string, RegExp> = {
      ac: /交流|交番電流/u,
      dc: /直流/u,
      rf: /無線周波数|高周波/u,
      emg: /筋電|筋電図/u,
      ir: /赤外線|赤外/u,
      ssr: /無声音声|静音音声|サイレント音声/u,
      bpm: /心拍|拍動|ビート毎分/u,
      // Widely used academic abbreviations are often rendered as their
      // unambiguous Japanese expansion. Keep this limited to terms whose
      // expansion is stable; arbitrary product/model identifiers must still
      // remain exact.
      usa: /米国|アメリカ合衆国|米/u,
      tv: /テレビ|テレビ放送|TV/u,
    };
    const expansion = commonScientificExpansions[invariant.value.toLowerCase()];
    if (expansion && expansion.test(output)) return true;
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
  // Acronym + descriptor pairs are sometimes compacted by Japanese output
  // (`PPG Earring` -> `PPGeerring`). Preserve the exact acronym prefix while
  // allowing the descriptor to be transliterated or lower-cased.
  const acronymDescriptor = new RegExp(`\\b(${escapedAcronym})\\s+[A-Z][a-z]+\\b`).exec(source);
  if (acronymDescriptor) {
    const prefix = acronymDescriptor[1].replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${prefix}[a-z0-9]+`, "i").test(output)) return true;
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

function isContextualCountInvariant(item: ScientificInvariant, source: string): boolean {
  if (item.kind !== "number") return false;
  const index = source.indexOf(item.value);
  if (index < 0) return false;
  const context = source.slice(Math.max(0, index - 48), Math.min(source.length, index + item.value.length + 72));
  return /\b(?:participant|subject|clip|trial|condition|group|item|session|document|experiment|measurement|sample|observation|stud(?:y|ies)|record|article|paper)s?\b/i.test(context);
}

function invariantQuality(source: string, output: string): { score: number; reasons: string[]; criticalMissing: boolean } {
  const invariants = extractScientificInvariants(source);
  const sourceEnumerationCount = (source.match(/(?:^|[\n\s])\d{1,2}[.)](?=\s|[^\d])/g) ?? []).length;
  const outputEnumerationCount = (output.match(/(?:^|[\n\s,、])\d{1,2}[.)](?=\s|[^\d])/g) ?? []).length;
  const unsupportedEnumeration = sourceEnumerationCount < 2 && outputEnumerationCount >= 3;
  const missing = invariants.filter((invariant) => !outputContainsInvariant(output, invariant, source));
  const figureOrderChanged = figureReferenceOrderChanged(source, output);
  const detachedFigureReference = hasDetachedFigureReference(source, output);
  // Measurements, statistical values, references, and links are source facts.
  // A translation may express an ordinary number differently, but it must not
  // introduce a new value with a scientific unit or a new reference-like fact.
  // Checking only these structured kinds avoids rejecting ordinary Japanese
  // wording such as "first" becoming "1つ".
  const sourceFacts = new Set(
    invariants
      .filter((item) => ["citation", "doi", "url", "figure", "statistic", "measurement", "year", "structure"].includes(item.kind))
      .flatMap(citationFactKeys)
  );
  const unexpected = extractScientificInvariants(output).filter((item) =>
    ["citation", "doi", "url", "figure", "statistic", "measurement", "year", "structure"].includes(item.kind)
      && citationFactKeys(item).some((key) => !sourceFacts.has(key))
  );
  if (missing.length === 0 && unexpected.length === 0 && !unsupportedEnumeration && !figureOrderChanged && !detachedFigureReference) return { score: 1, reasons: [], criticalMissing: false };
  // A missing acronym can change the method, metric, or experimental
  // condition under discussion (for example MSE, NPIV, or DeepIV). It is a
  // safety failure, not merely a stylistic difference.
  const critical = missing.filter((item) => {
    if (["citation", "doi", "url", "figure", "table", "statistic", "measurement", "year", "structure"].includes(item.kind)) return true;
    // Mixed-case product/system names (iPhone, MouseLab) and very short
    // venue abbreviations (SI, CHI) are often intentionally translated or
    // omitted by otherwise faithful Japanese prose. Keep method-like
    // identifiers such as DeepIV and H4 hard-protected, but do not turn a
    // harmless proper-name omission into a whole-block fallback.
    if (item.kind === "acronym") {
      const value = item.value;
      const isLeadingLowerBrand = /^[a-z][A-Za-z0-9]*$/.test(value) && /[A-Z]/.test(value);
      const isShortAllCaps = /^[A-Z]{2,3}$/.test(value) && value !== "SD";
      const acronymIndex = source.indexOf(value);
      const acronymContext = acronymIndex >= 0
        ? source.slice(Math.max(0, acronymIndex - 72), Math.min(source.length, acronymIndex + value.length + 96))
        : "";
      const isTechnicalContextualAcronym = isShortAllCaps
        && /\b(?:model|method|metric|measure|learning|algorithm|network|task|condition|experiment|analysis|score|regression|classification|reinforcement|prediction)\b/i.test(acronymContext);
      // Short all-caps tokens are usually harmless venue/proper-name
      // omissions, but treatment-arm compounds such as `RT+CT` carry an
      // experimental condition. Treat those identifiers as critical so a
      // malformed restored token (`RTz+CTz`) cannot be accepted as fluent
      // Japanese.
      const isExperimentalCompound = new RegExp(`\\b${value}\\s*[+/&]\\s*[A-Z]{2,4}\\b|\\b[A-Z]{2,4}\\s*[+/&]\\s*${value}\\b`).test(source);
      if (isExperimentalCompound || isTechnicalContextualAcronym) return true;
      if (isLeadingLowerBrand || isShortAllCaps) return false;
      return true;
    }
    return isContextualCountInvariant(item, source);
  });
  const reasons: string[] = [];
  if (missing.length > 0) reasons.push(`scientific invariants missing: ${missing.slice(0, 4).map((item) => item.value).join(", ")}`);
  if (unexpected.length > 0) reasons.push(`unexpected scientific invariants: ${unexpected.slice(0, 4).map((item) => item.value).join(", ")}`);
  if (unsupportedEnumeration) reasons.push("translation introduces an unsupported numbered enumeration");
  if (figureOrderChanged) reasons.push("figure/panel reference order changed");
  if (detachedFigureReference) reasons.push("detached figure reference");
  return {
    score: Math.max(0, 1 - missing.length / Math.max(invariants.length, 1) - critical.length * 0.18 - unexpected.length * 0.24 - (unsupportedEnumeration ? 0.4 : 0)),
    reasons,
    criticalMissing: critical.length > 0 || unexpected.length > 0 || unsupportedEnumeration || figureOrderChanged || detachedFigureReference,
  };
}

/**
 * Detect two high-impact English-to-Japanese scope shifts where numeric facts
 * can all remain present: a collective participant total made distributive
 * over unspecified fields, and an all-group statement narrowed to two groups
 * unless the source explicitly says that the study has two groups. These are
 * narrow relation checks, not a general semantic correctness classifier.
 */
function semanticScopeRiskReasons(source: string, output: string): string[] {
  const reasons: string[] = [];
  // A common fluent drift changes study participants into researchers. Keep
  // this as a role-preservation invariant, while exempting sources that
  // explicitly describe the participants as researchers themselves.
  const sourceSentences = source.split(/(?<=[.!?])\s+/).filter(Boolean);
  const outputSentences = output.split(/(?<=[。！？])\s*/).filter(Boolean);
  const roleShifted = sourceSentences.some((sourceSentence, index) => {
    if (!SOURCE_PARTICIPANT_ROLE.test(sourceSentence) || SOURCE_RESEARCHER_ROLE.test(sourceSentence)) return false;
    const candidate = outputSentences[index] ?? output;
    if (!JA_RESEARCHER_ROLE.test(candidate) || JA_PARTICIPANT_ROLE.test(candidate)) return false;
    // Translation can split one source sentence into two Japanese sentences.
    // When sentence counts differ, an adjacent sentence containing the
    // participant role is evidence that the index-only comparison is misaligned.
    if (sourceSentences.length !== outputSentences.length) {
      const nearby = [outputSentences[index - 1], outputSentences[index + 1]].filter(Boolean).join(" ");
      if (JA_PARTICIPANT_ROLE.test(nearby)) return false;
    }
    return true;
  });
  if (roleShifted) reasons.push("participant role shifted to researcher");
  if (
    SOURCE_DIVERSE_PARTICIPANT_FIELDS.test(source)
    && !SOURCE_EXPLICIT_PER_FIELD_COUNT.test(source)
    && JA_FIELD_COUNT_DISPLACEMENT.test(output)
  ) {
    reasons.push("participant total may have shifted to field-level count");
  }
  if (
    SOURCE_COLLECTIVE_GROUP_COMPARISON.test(source)
    && !SOURCE_EXPLICIT_TWO_GROUPS.test(source)
    && JA_BINARY_GROUP_COMPARISON.test(output)
  ) {
    reasons.push("collective group comparison narrowed to two groups");
  }
  // Experimental procedures distinguish an utterance from a session. A
  // fluent translation that swaps these units changes the scope of the
  // procedure even when all numbers and citations survive. Flag only the
  // one-way substitution, while allowing Japanese to retain both terms.
  const unitShifted = sourceSentences.some((sourceSentence, index) => {
    const candidate = outputSentences[index] ?? output;
    const sourceUtteranceOnly = /\butterances?\b/i.test(sourceSentence) && !/\bsessions?\b/i.test(sourceSentence);
    if (!sourceUtteranceOnly || !/セッション/u.test(candidate) || /(?:発話|発言)/u.test(candidate)) return false;
    if (sourceSentences.length !== outputSentences.length) {
      const nearby = [outputSentences[index - 1], outputSentences[index + 1]].filter(Boolean).join(" ");
      if (/(?:発話|発言)/u.test(nearby)) return false;
    }
    return true;
  });
  if (unitShifted) {
    if (sourceSentences.some((sentence, index) => /\butterances?\b/i.test(sentence) && !/\bsessions?\b/i.test(sentence) && /セッション/u.test(outputSentences[index] ?? output))) {
      reasons.push("utterance unit shifted to session");
    }
  }
  // Preserve the common paired scope phrase even when sentence boundaries
  // differ between English and Japanese (for example, "current and previous
  // utterances" becoming two sessions). This remains shape-based rather than
  // tied to a paper or a particular device.
  if (
    /\bcurrent\s+and\s+previous\s+utterances?\b/i.test(source)
    && /(?:現在|当該|その)[^。！？\n]{0,18}セッション[^。！？\n]{0,24}(?:以前|直前)[^。！？\n]{0,12}セッション/u.test(output)
  ) {
    reasons.push("utterance unit shifted to session");
  }
  return reasons;
}

function discourseRelationRiskReasons(source: string, output: string): string[] {
  // These signals are intentionally evidence for audit/selector decisions,
  // rather than an unconditional production fallback. Japanese often encodes
  // a relation through clause order or punctuation; requiring a fixed marker
  // here would trade unsafe accepts for an opaque increase in fallback.
  const reasons: string[] = [];
  if (SOURCE_STRONG_CONTRAST.test(source) && !JA_STRONG_CONTRAST.test(output)) {
    reasons.push("strong contrast relation missing");
  }
  if (SOURCE_EXCLUSIVITY.test(source) && !JA_EXCLUSIVITY.test(output)) {
    if (!(SOURCE_REPLACEMENT.test(source) && JA_INSTEAD_OF.test(output))) {
      reasons.push("exclusivity relation missing");
    }
  }
  if (SOURCE_CONDITION.test(source) && !JA_CONDITION.test(output)) {
    // Japanese often renders an embedded `whether` clause with a bare `か`
    // (e.g. `組み込めるかを議論した`) rather than the heavier `かどうか`.
    // Accept that form only for the corresponding English whether cue.
    const hasNaturalWhether = SOURCE_WHETHER.test(source) && /か(?:を|に|の|と|、|,|。|！|？|$)/.test(output);
    // English `if` in a yes/no question is naturally rendered as Japanese
    // `か` before a question mark/quote; this is distinct from dropping a
    // conditional premise such as `If the signal is absent, ...`.
    const hasConditionalQuestion = /か[」』"'！？?]/u.test(output);
    if (!hasNaturalWhether && !hasConditionalQuestion) reasons.push("condition relation missing");
  }
  if (SOURCE_ALTERNATIVE.test(source) && !JA_ALTERNATIVE.test(output)) {
    reasons.push("alternative relation missing");
  }
  if (SOURCE_COMPARATIVE_LIKELIHOOD.test(source) && !/(?:可能性(?:が|の)高|可能性(?:が|の)低|よりも可能性|確率(?:が|の)高|確率(?:が|の)低|尤度|に比べ|と比べ|よりも|感じやす|しやす|しにく|しづら)/.test(output) && !JA_COMPARATIVE_CHOICE.test(output)) {
    reasons.push("comparative likelihood relation missing");
  }
  if (SOURCE_PAIRED_CHOICE_CONTRAST.test(source) && !(JA_WHETHER_CHOICE.test(output) && JA_WHICH_CHOICE.test(output))) {
    reasons.push("paired choice contrast collapsed");
  }
  if (SOURCE_POSITIVE_EQUIVALENCE.test(source) && JA_NEGATED_EQUIVALENCE.test(output)) {
    reasons.push("positive equivalence relation negated");
  }
  return reasons;
}

function claimStrengthRiskReasons(source: string, output: string): string[] {
  const reasons: string[] = [];
  if (SOURCE_ASSESSMENT_SCOPE.test(source) && !JA_ASSESSMENT_SCOPE.test(output)) {
    reasons.push("assessment scope predicate missing");
  }
  if (SOURCE_EVIDENCE_SUGGESTION.test(source) && !JA_EVIDENCE_SUGGESTION.test(output)) {
    reasons.push("evidence suggestion strengthened to assertion");
  }
  if (SOURCE_REMAINS_UNSPECIFIED.test(source) && !JA_REMAINS_UNSPECIFIED.test(output)) {
    reasons.push("future specification requirement omitted");
  }
  // A fluent decoder can turn an academic observation (“studies investigate
  // ...”) into an unsupported method claim (“a simulation was conducted”).
  // Detect the relation mismatch generically: the source must lack explicit
  // method/experiment evidence while the Japanese output asserts a method
  // action. This is deliberately a category-level cue, not a paper- or
  // hallucinated-word blacklist.
  const firstOutputSentence = output.match(/^[\s\S]*?[。！？](?=\s|$)/u)?.[0] ?? output;
  const sourceHasMethodEvidence = /\b(?:experiments?|experimental|simulat(?:e|ed|ion|ions)(?:\d+)?|prototype|implement(?:ed|ation)?|construct(?:ed|ion)?|measure(?:d|ment)?|test(?:ed|ing)?|survey(?:ed)?|randomi[sz]ed|trial|evaluate(?:d|ion)?|annotat(?:e|ed|ion|ing))\b/i.test(source)
    || /\b(?:study|studies|research)\b[^.!?]{0,48}\b(?:conducted|carried\s+out|undertook|performed)\b/i.test(source)
    || /\b(?:user\s+)?stud(?:y|ies)\b[^.!?]{0,64}\b(?:showed|found|demonstrated|revealed)\b/i.test(source)
    || /\b(?:we|this\s+(?:paper|study)|the\s+(?:paper|study|system|model))\b[^.!?]{0,48}\b(?:develop(?:ed|ment)?|train(?:ed|ing)?|captur(?:e|ed|ing)|collect(?:ed|ion)?|recruit(?:ed|ment)?|administer(?:ed|ing)?|annotat(?:e|ed|ion|ing)?)\b/i.test(source);
  const outputAssertsMethod = /(?:シミュレーション|実験|試験|プロトタイプ|実装|測定|計測|ランダム化|試行|評価).{0,12}(?:行(?:った|われた|う)|実施|実験した|測定した|評価した|構築した|作成した)/u.test(firstOutputSentence);
  if (!sourceHasMethodEvidence && outputAssertsMethod) {
    reasons.push("unsupported method predicate introduced");
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

export function evaluateJaTranslation(output: string, source: string): TranslationQuality {
  const out = output.trim();
  const reasons: string[] = [];
  if (!out) return { score: 0, reasons: ["empty output"], languageScore: 0, invariantScore: 0, repetitionScore: 0, lengthScore: 0 };
  const parallelScientificOutput = /\b(?:in contrast|respectively|whereas|compared|while|similarly)\b/i.test(source) &&
    (source.match(/\d+(?:\.\d+)?/g) ?? []).length >= 4 &&
    (out.match(/[。！？]/g) ?? []).length >= 1;
  if (isDegenerateTranslation(out) && !(parallelScientificOutput && hasAbnormalPhraseRepetition(out))) reasons.push("degenerate output");
  if (DATE_STAMP.test(out) && !DATE_STAMP.test(source)) reasons.push("unexpected date");
  if (out === source.trim()) reasons.push("source echo");
  const partialSourceFallback = detectPartialSourceFallback(source, out);
  if (partialSourceFallback.partial) reasons.push(partialSourceFallback.reason ?? "partial source fallback");
  if (hasOrphanedInvariantSentence(out, source)) reasons.push("orphaned source invariant sentence");
  if (hasCitationYearScopeDrift(source, out)) reasons.push("citation year scope drift");
  if (hasTrailingLatinFragment(out, source)) reasons.push("trailing Latin fragment");

  const hasKana = KANA.test(out);
  const hasKanji = KANJI.test(out);
  if (hasKana && hasUntranslatedSourcePhrase(source, out)) reasons.push("untranslated source phrase");
  if (hasKana && hasUntranslatedMixedScriptLexeme(source, out)) reasons.push("untranslated mixed-script lexeme");
  if (!hasKana && !hasKanji) reasons.push("no Japanese script");
  if (source.trim().length >= 40 && hasKanji && !hasKana) reasons.push("Japanese prose lacks kana");
  if (hasKana && SIMPLIFIED_CJK_CONTAMINATION.test(out)) reasons.push("simplified Chinese mixed into Japanese");
  if (hasKana && UNEXPECTED_FOREIGN_SCRIPT.test(out)) reasons.push("foreign script contamination");
  if (hasKana && hasUntranslatedForeignProse(out)) reasons.push("untranslated foreign-language prose");
  if (hasKana && hasUntranslatedSourceLabel(source, out)) reasons.push("untranslated repeated source label");
  const sourceExampleQuotes = (source.match(/\be\.g\.,?\s*[\u201c\"][^\u201d\"]{3,}[\u201d\"]|\be\.g\.,?\s*「[^」]{3,}」/gi) ?? []).length;
  const outputQuoteSpans = (out.match(/[\u201c\"][^\u201d\"]{3,}[\u201d\"]|「[^」]{3,}」/g) ?? []).length;
  if (sourceExampleQuotes > 0 && outputQuoteSpans < sourceExampleQuotes) {
    reasons.push("quoted example content missing");
  }
  if (hasTranslationInstructionContamination(out)) reasons.push("model output contains translation instruction contamination");
  if (hasTranslationMetaCommentary(out)) reasons.push("model output contains translation meta-commentary");
  if (hasMalformedCitationStructure(source, out)) reasons.push("malformed citation structure");
  if (hasMalformedAcronymExpansion(source, out)) reasons.push("malformed acronym expansion");
  if (hasMixedScriptCorruption(source, out)) reasons.push("mixed-script decoder corruption");
  const missingQuotedNames = missingQuotedTechnicalNames(source, out);
  if (missingQuotedNames.length > 0) {
    reasons.push(`quoted technical name missing: ${missingQuotedNames.slice(0, 3).join(", ")}`);
  }

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
  reasons.push(...discourseRelationRiskReasons(source, out));
  reasons.push(...claimStrengthRiskReasons(source, out));

  if (
    /^\d+[.)]\s+\S/.test(source.trim()) &&
    /^\d+\s*(つの|つ。|日目|番目|個の)/.test(out)
  ) {
    reasons.push("numbered source was mistranslated as a list item");
  }
  const invariant = invariantQuality(source, out);
  reasons.push(...invariant.reasons);
  if (measurementOrderChanged(source, out)) reasons.push("scientific measurement order changed");
  const languageScore = reasons.some((reason) => /Japanese|Latin|source echo|date|empty|simplified Chinese|untranslated foreign-language|mixed-script lexeme/.test(reason)) ? 0.15 : 1;
  const repetitionScore = isDegenerateTranslation(out) && !(parallelScientificOutput && hasAbnormalPhraseRepetition(out)) ? 0 : 1;
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
    || reasons.includes("alternative relation missing")
    || reasons.some((reason) => reason.startsWith("participant total may have shifted"))
    || reasons.includes("participant role shifted to researcher")
    || reasons.includes("collective group comparison narrowed to two groups")
    || reasons.includes("positive equivalence relation negated")
    || reasons.includes("paired choice contrast collapsed")
    || reasons.includes("evidence suggestion strengthened to assertion")
    || reasons.includes("assessment scope predicate missing")
    || reasons.includes("future specification requirement omitted")
    || reasons.includes("scientific measurement order changed")
    || reasons.includes("figure/panel reference order changed")
    || reasons.includes("detached figure reference")
    || reasons.some((reason) => reason.startsWith("quoted technical name missing:"))
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

/**
 * Diagnose a server-provided mixed candidate while allowing only explicitly
 * reported failed source units to remain in English. This does not accept the
 * candidate; callers must apply their normal safety policy afterward.
 */
export function evaluatePartialJaTranslation(
  output: string,
  source: string,
  preservedSourceUnits: string[],
): TranslationQuality & { preservedSourceUnitsValidated: boolean } {
  const quality = evaluateJaTranslation(output, source);
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizedOutput = normalize(output);
  const validated = preservedSourceUnits.length > 0
    && preservedSourceUnits.every((unit) => normalizedOutput.includes(normalize(unit)));
  if (!validated) return { ...quality, preservedSourceUnitsValidated: false };
  const reasons = quality.reasons.filter((reason) =>
    !reason.startsWith("translation contains unmodified source span")
    && reason !== "untranslated foreign-language prose"
  );
  return { ...quality, reasons, preservedSourceUnitsValidated: true };
}

export type PartialUnitDiagnostic = {
  index: number;
  source: string;
  output: string;
  preserved: boolean;
  accepted: boolean;
  reasons: string[];
};

/** Diagnose each source/output unit independently; never changes acceptance. */
export function diagnosePartialUnits(
  sourceUnits: string[],
  outputUnits: string[],
  preservedIndexes: number[] = [],
): PartialUnitDiagnostic[] {
  return sourceUnits.map((source, index) => {
    const output = outputUnits[index] ?? "";
    const preserved = preservedIndexes.includes(index) && output.trim() === source.trim();
    if (preserved) {
      return { index, source, output, preserved: true, accepted: false, reasons: ["preserved source unit"] };
    }
    const quality = evaluateJaTranslation(output, source);
    const lengthRatio = output.trim().length / Math.max(source.trim().length, 1);
    const reasons = [...quality.reasons];
    if (reasons.includes("degenerate output")) {
      reasons.push(...explainDegenerateTranslation(output).map((reason) => `degenerate: ${reason}`));
    }
    if (source.trim().length >= 80 && lengthRatio < 0.25) reasons.push("unit output is too short");
    return { index, source, output, preserved: false, accepted: reasons.length === 0, reasons };
  });
}

export function isPlausibleJaTranslation(output: string, source: string): boolean {
  const quality = evaluateJaTranslation(output, source);
  const missingNotice = quality.reasons.find((reason) => reason.startsWith("scientific invariants missing:"));
  const missingValues = missingNotice?.replace("scientific invariants missing:", "").split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const technicalAcronymMissing = missingValues.length > 0
    && missingValues.every((value) => /^[A-Z]{2,3}$/.test(value))
    && /\b(?:model|method|metric|measure|learning|algorithm|network|task|condition|experiment|analysis|score|regression|classification|reinforcement|prediction|attention|credit|LSTM|RNN)\b/i.test(source);
  if (technicalAcronymMissing && quality.reasons.every((reason) => reason.startsWith("scientific invariants missing:"))) {
    return false;
  }
  const nonCriticalAcronymOnly = missingValues.length > 0
    && missingValues.every((value) => /^[A-Z]{2,3}$/.test(value))
    && !missingValues.includes("SD")
    // A short acronym in a technical block is potentially a method/metric
    // identifier even when the immediately adjacent phrase is translated.
    // Keep the bypass conservative: any technical cue in the source makes a
    // missing acronym safety-critical and eligible for retry/fallback.
    && !/\b(?:model|method|metric|measure|learning|algorithm|network|task|condition|experiment|analysis|score|regression|classification|reinforcement|prediction|attention|credit|LSTM|RNN)\b/i.test(source)
    && !missingValues.some((value) => {
      const index = source.indexOf(value);
      const context = index >= 0 ? source.slice(Math.max(0, index - 72), Math.min(source.length, index + value.length + 96)) : "";
      return new RegExp(`\\b${value}\\s*[+/&]\\s*[A-Z]{2,4}\\b|\\b[A-Z]{2,4}\\s*[+/&]\\s*${value}\\b`).test(source)
        || /\b(?:model|method|metric|measure|learning|algorithm|network|task|condition|experiment|analysis|score|regression|classification|reinforcement|prediction|attention|credit|LSTM|RNN)\b/i.test(context);
    });
  if (nonCriticalAcronymOnly && quality.reasons.every((reason) => reason.startsWith("scientific invariants missing:"))) {
    return true;
  }
  const repetitionOnly = quality.reasons.length === 1 && quality.reasons[0] === "degenerate output";
  const parallelScientificRepetition =
    /\b(?:in contrast|respectively|whereas|compared|while|similarly)\b/i.test(source) &&
    (source.match(/\d+(?:\.\d+)?/g) ?? []).length >= 4 &&
    (output.match(/[。！？]/g) ?? []).length >= 1;
  const sentenceCount = output.split(/[。！？!?]+/).map((part) => part.trim()).filter(Boolean).length;
  // A preserved grant name or researcher name may legitimately remain Latin.
  // The weighted score handles ordinary quality differences, while scientific
  // facts have an explicit hard safety check below.
  // Never accept a fluent sentence which dropped a citation, statistic,
  // measurement, DOI/URL, or method acronym. The model may be retried by the
  // caller; otherwise keeping the original is safer than changing a result.
  return (!isDegenerateTranslation(output) || (repetitionOnly && sentenceCount <= 1 && source.trim().length >= 180) || parallelScientificRepetition)
    && (!invariantQuality(source, output).criticalMissing || nonCriticalAcronymOnly)
    && !quality.reasons.includes("long source was implausibly shortened")
    && !quality.reasons.includes("source negation missing")
    && !quality.reasons.includes("negation moved from reported content to reporting predicate")
    && !quality.reasons.includes("epistemic uncertainty lost")
    && !quality.reasons.includes("strong contrast relation missing")
    && !quality.reasons.includes("condition relation missing")
    && !quality.reasons.includes("exclusivity relation missing")
    && !quality.reasons.includes("comparative likelihood relation missing")
    && !quality.reasons.includes("paired choice contrast collapsed")
    && !quality.reasons.includes("spatial target relation rendered as comparison")
    && !quality.reasons.includes("signal-to-noise comparison relation missing")
    && !quality.reasons.includes("source disjunctive-both relation missing")
    && !quality.reasons.some((reason) => reason.startsWith("participant total may have shifted"))
    && !quality.reasons.includes("collective group comparison narrowed to two groups")
    && !quality.reasons.includes("trailing Latin fragment")
    && !quality.reasons.includes("malformed acronym expansion")
    && !quality.reasons.includes("simplified Chinese mixed into Japanese")
    && !quality.reasons.includes("mixed-script decoder corruption")
    && !quality.reasons.includes("untranslated foreign-language prose")
    && !quality.reasons.includes("untranslated repeated source label")
    && !quality.reasons.includes("model output contains translation instruction contamination")
    && !quality.reasons.includes("model output contains translation meta-commentary")
    && !quality.reasons.includes("malformed citation structure")
    && !quality.reasons.includes("untranslated source phrase")
    && !quality.reasons.includes("orphaned source invariant sentence")
    && !quality.reasons.includes("citation year scope drift")
    && !quality.reasons.includes("quoted example content missing")
    && !quality.reasons.includes("unsupported method predicate introduced")
    // Section labels are structural facts. If a block begins with a numbered
    // section and its numeric invariant is missing, keep the source rather
    // than silently dropping the hierarchy marker.
    && !( /^\d+(?:\.\d+)+\b/.test(source.trim()) && quality.reasons.some((reason) => reason.startsWith("scientific invariants missing:")) )
    && !quality.reasons.some((reason) => reason.startsWith("translation contains unmodified source span"))
    && quality.score >= 0.8;
}

/**
 * Cascade selector helper. Alternate models must preserve relations whose
 * loss changes the experimental claim. Japanese may encode ordinary contrast
 * implicitly, but missing conditions, exclusivity, negation, or comparisons
 * are unsafe semantic guesses.
 */
export function isCascadeQualityAcceptable(output: string, source: string): boolean {
  return getCascadeQualityReasons(output, source).length === 0;
}

/** Structured reasons used by audit tooling; acceptance policy remains centralized here. */
export function getCascadeQualityReasons(output: string, source: string): string[] {
  if (!isPlausibleJaTranslation(output, source)) return ["plausibility gate failed"];
  const cascadeReasons: string[] = [];
  if (hasInconsistentRepeatedLexeme(source, output)) cascadeReasons.push("inconsistent repeated lexeme");
  else if (hasUntranslatedCascadeLexeme(source, output)) cascadeReasons.push("untranslated cascade lexeme");
  else if (hasUntranslatedCascadePhrase(source, output)) cascadeReasons.push("untranslated cascade phrase");
  if (hasDuplicatedYearCitationSpan(source, output)) cascadeReasons.push("duplicated year citation span");
  if (hasUnsupportedStructuralLabel(source, output)) cascadeReasons.push("unsupported structural label");
  if (hasScientificExpansionQualifierDrift(source, output)) cascadeReasons.push("scientific expansion qualifier drift");
  if (hasCascadeSentenceCompression(source, output)) cascadeReasons.push("cascade sentence compression");
  const reasons = evaluateJaTranslation(output, source).reasons;
  const invariant = invariantQuality(source, output);
  // Short standalone acronyms may be expanded/localized in Japanese. The
  // invariant diagnostic remains visible for audit, but it must not force a
  // reader fallback when no critical fact is missing. Compound experimental
  // arms (for example RT+CT) are marked critical above and still reject.
  const onlyNonCriticalInvariantNotice =
    !invariant.criticalMissing &&
    reasons.length > 0 &&
    reasons.every((reason) => reason.startsWith("scientific invariants missing:"));
  const unsafeRelation = reasons.some((reason) =>
    reason === "condition relation missing"
    || reason === "exclusivity relation missing"
    || reason === "source negation missing"
    || reason === "negation moved from reported content to reporting predicate"
    || reason === "epistemic uncertainty lost"
    || reason === "spatial target relation rendered as comparison"
    || reason === "signal-to-noise comparison relation missing"
    || reason === "source disjunctive-both relation missing"
    || reason === "alternative relation missing"
    || reason === "positive equivalence relation negated"
    || reason === "unsupported method predicate introduced"
    || reason.startsWith("participant total may have shifted")
    || reason === "collective group comparison narrowed to two groups"
    || reason === "utterance unit shifted to session"
    || reason === "session unit shifted to utterance"
  );
  // Keep the boundary escapes in the source as a regex, rather than literal
  // backspace characters. A previous edit inserted U+0008 here, which made
  // this safety filter silently match nothing and allowed unsafe cascade
  // candidates through whenever the dedicated relation list missed them.
  if (unsafeRelation) {
    cascadeReasons.push("unsafe relation guard");
    cascadeReasons.push(...reasons.filter((reason) => reason.endsWith("relation missing") || reason.includes("negation") || reason.includes("comparison")));
  }
  if (!unsafeRelation && reasons.some((reason) => !((onlyNonCriticalInvariantNotice && reason.startsWith("scientific invariants missing:"))
    || !/\b(?:invariant|source echo|degenerate|missing|malformed|untranslated|implausible|compression)\b/i.test(reason)))) {
    cascadeReasons.push(...reasons.filter((reason) => !((onlyNonCriticalInvariantNotice && reason.startsWith("scientific invariants missing:"))
      || !/\b(?:invariant|source echo|degenerate|missing|malformed|untranslated|implausible|compression)\b/i.test(reason))));
  }
  return cascadeReasons;
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
  // Author affiliation blocks can be extracted as ordinary paragraphs when a
  // PDF has no tagged structure. Credential/member phrases followed by an
  // institution or department are publication metadata, not research prose.
  // Keep this deliberately narrow so body sentences mentioning a member or
  // institution remain eligible for translation.
  if (
    /^(?:associate|graduate|senior|student|postdoctoral)\s+(?:member|student|researcher|fellow)\b/i.test(t)
    && /\b(?:institution|university|department|faculty|school|engineers?|institute)\b/i.test(t)
    && !/[.!?。！？]$/.test(t)
  ) return true;
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
  const isCompleteFormulaDefinition = /^where\s+(?:[A-Za-zΦφαβγδμσΣ][A-Za-z0-9_²³⁻-]*(?:\([^)]{1,24}\))?)\s+is\b/i.test(t) && /[.!?。！？]$/.test(t);
  // A dropped token during native PDF extraction can leave an impossible
  // function-word join such as "the of".  This is a source
  // integrity failure; sending it to MADLAD would make the model guess the
  // missing relation and can turn extraction damage into fluent misinformation.
  if (/\bthe\s+of\b/i.test(t)) {
    return "抽出時に機能語が欠落している可能性があります";
  }
  // U+FFFD is an extraction/decoding failure marker, not an academic symbol.
  // Even a single occurrence can stand in for a missing equation or value;
  // translating around it would invite the model to invent what was lost.
  if (t.includes("\uFFFD")) {
    return "抽出テキストに未復元文字が含まれています";
  }
  // PDF text streams can reorder delimiters around table/set contents while
  // leaving a terminal period, so the usual no-terminal guard is not enough.
  // A closing brace before any open brace is unambiguous structural damage;
  // reject it before translation rather than letting the model invent the
  // missing item (for example `{“a”}, {“b”}, and { fragment`).
  let braceDepth = 0;
  for (const character of t) {
    if (character === "{") braceDepth += 1;
    else if (character === "}") {
      if (braceDepth === 0) return "抽出時に集合記法の区切りが壊れている可能性があります";
      braceDepth -= 1;
    }
  }
  if (braceDepth !== 0) return "抽出時に集合記法の区切りが壊れている可能性があります";
  // Native PDF extraction often places a superscript/numeric citation after
  // the sentence terminator (`... non-unique.25` or `... result. [25]`).
  // Treat that citation suffix as terminal punctuation; otherwise a complete
  // paragraph is incorrectly classified as a page fragment and never sent to
  // translation.
  const terminalCitationSuffix = /[.!?。！？]\s*(?:\[\s*\d+(?:\s*[-–—,]\s*\d+)*\s*\]|\d{1,3})$/.test(t);
  const noTerminal = !/[.!?。！？]$/.test(t) && !terminalCitationSuffix;
  // A paragraph followed by a bare figure/table label is commonly a native
  // block-boundary or caption merge. Keep the structural marker with the
  // layout review instead of sending the mixed unit to a translation model.
  if (
    t.length >= 80
    && /(?:Figure|Fig\.?|Table|Tbl\.?)\s*\d{1,3}(?:\s*\([a-z]\))?$/i.test(t)
  ) {
    return "図表ラベルが段落末尾に混入している可能性があります";
  }
  // A page/column cut can stop immediately after the abbreviated label
  // itself (`... is shown in Fig.` or `... summarized in Table`). Treat this
  // as the same incomplete cross-reference rather than sending the prefix to
  // the model to invent a number.
  if (t.length >= 80 && /\b(?:Fig\.|Figure|Table|Tbl\.)$/i.test(t)) {
    return "図表ラベルが段落末尾に混入している可能性があります";
  }
  // A numbered dash item embedded after a completed sentence indicates a
  // list/body merge (`... delivered 40 dollars. 4 - Machine J ...`). Keep
  // it out of clean prose evaluation so the model does not reinterpret the
  // orphan marker as part of the sentence.
  if (t.length >= 48 && /[.!?。！？]\s+\d{1,3}\s*[-–—]\s+[A-Z]/.test(t)) {
    return "箇条書き番号が本文に混入している可能性があります";
  }
  // A citation list cut at a PDF page/column boundary often leaves an open
  // square bracket at the block end (`... [4, 9, 29`). Preserve the source
  // until the following block can be stitched; translating this fragment
  // encourages the model to invent the missing references.
  if (t.length >= 48 && /\[[^\]]*$/.test(t) && /\[\s*\d/.test(t)) {
    return "引用列が途中で切れている可能性があります";
  }
  // A native block ending in an ellipsis is commonly a truncated page/column
  // continuation. Do not let the model turn the visible prefix into a fluent
  // but invented completion. Short quoted examples may intentionally use an
  // ellipsis, so apply this only to ordinary-length prose without a closing
  // quote or list marker.
  if (t.length >= 80 && /(?:\.\.\.|…)$/.test(t) && !/["”’']$/.test(t) && !/^(?:[-•‣▪∙*]|\d+[.)])\s+/.test(t)) {
    return "抽出テキストが省略記号で終わっている可能性があります";
  }
  // Cross-reference labels at the physical block end are another common
  // page/column cut (`... define notations in Section`). They are not a
  // complete proposition and should be stitched with the following block
  // before translation rather than completed by the model.
  if (t.length >= 48 && /\b(?:in|see|as|from|to|of)\s+(?:Section|Chapter|Appendix)\s*$/i.test(t)) {
    return "抽出テキストが文書内参照の途中で切れている可能性があります";
  }
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
  // Some native PDF extractors preserve line-break hyphens but lose the
  // original line boundary, producing fragments such as `previ- psycho-`
  // or `addi- review` inside an otherwise long block. A single spaced hyphen
  // can be legitimate typography (`well- known`), so require multiple
  // occurrences before treating the block as damaged extraction.
  const internalHyphenBreaks = t.match(/\b[A-Za-z]{3,}-\s+[a-z]{2,}\b/g) ?? [];
  if (internalHyphenBreaks.length >= 2) {
    return "抽出時の改行ハイフンが残っている可能性があります";
  }
  // Column/table extraction can concatenate adjacent words while retaining
  // the second word's capitalisation (`seriousImplementation`).
  // One CamelCase token may be a legitimate method or product name, so require
  // two long suspicious joins before classifying the source as damaged.
  const concatenatedWords = t.match(/\b[a-z]{5,}[A-Z][a-z]{3,}\b/g) ?? [];
  if (concatenatedWords.length >= 2) {
    return "抽出時に隣接語が連結している可能性があります";
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
  if ((!isCompleteFormulaDefinition && /^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t)) || /^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  // Native PDF streams can lose the preceding line while leaving an
  // otherwise ordinary continuation with an arbitrary lowercase first word
  // (`which measures ...`, `segregated ...`, `discussed in ...`). English
  // scholarly sentences conventionally begin with an uppercase token; reject
  // this high-precision fragment signal before translation rather than asking
  // the model to invent the missing subject.
  if (!isCompleteFormulaDefinition && /^[a-z][a-z-]{2,}\b/.test(t)) {
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
  if (!isCompleteFormulaDefinition && /^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) {
    return "段落の先頭が前段から続いている可能性があります";
  }
  if (!isCompleteFormulaDefinition && /^[a-z]/.test(t) && t.length >= 180 && !/^(?:e\.g\.|i\.e\.|et\s+al\.|vs\.|in\s+(?:particular|contrast|addition),)/i.test(t)) {
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
  // A block can absorb the first line of a table/figure label and stop at a
  // title-cased parenthetical (`the Number of Deaths (in Millions)`). Such a
  // suffix is not a complete proposition, so do not send it to a model.
  if (
    t.length >= 48
    && noTerminal
    && /\b(?:the|a|an)\s+[A-Z][A-Za-z\s]{5,}\([^)]{1,48}\)\s*$/i.test(t)
  ) {
    return "図表見出しが段落末尾に混ざっている可能性があります";
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
  const isCompleteFormulaDefinition = /^where\s+(?:[A-Za-zΦφαβγδμσΣ][A-Za-z0-9_²³⁻-]*(?:\([^)]{1,24}\))?)\s+is\b/i.test(t) && /[.!?。！？]$/.test(t);
  const terminalCitationSuffix = /[.!?。！？]\s*(?:\[\s*\d+(?:\s*[-–—,]\s*\d+)*\s*\]|\d{1,3})$/.test(t);
  if (isExpectedNonProseParagraph(t)) return false;
  // A native text stream can flatten chart/table headers into the beginning
  // of a prose block (for example `Horizon 1 Horizon 6 ...`).  Repeated
  // short label-plus-number pairs are structural evidence, not a sentence;
  // preserve the source until layout evidence can recover the grid.  Requiring
  // two pairs avoids rejecting ordinary prose such as `Study 1 examined ...`.
  if (/^(?:[A-Z][A-Za-z]{1,24}\s+\d+[A-Za-z]?\s+){2,}/.test(t)) return false;
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
  if (!isCompleteFormulaDefinition && /^(?:of|and|or|but|to|for|with|where|which|that)\b/.test(t)) return false;
  // A lower-case lexical fragment followed by a coordinating conjunction is
  // strong evidence that extraction started mid-sentence ("data, and ...").
  // Complete English paragraphs do not normally begin this way.
  if (/^[a-z][a-z-]{2,},\s+(?:and|or|but)\b/.test(t)) return false;
  // A lower-case word followed by a period at the physical block start is
  // normally the tail of a sentence from the preceding column/page ("data.
  // This procedure …"), not a complete paragraph start.
  if (!isCompleteFormulaDefinition && /^[a-z][a-z-]{2,}\.\s+[A-Z]/.test(t) && t.length >= 180) return false;
  // Native academic paragraphs virtually always begin with a capital letter,
  // number, quotation mark, or bullet. A long block beginning mid-word in
  // lowercase is usually a column/page continuation ("substantially improves
  // …"), except for the common discourse abbreviations below.
  if (!isCompleteFormulaDefinition &&
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
  if (/\b(?:albeit|although|though|because|while|whereas|with|without|including|concerning|between|than|let)\s*$/i.test(t)) return false;
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
  return shouldTranslateCaptionPolicy(text, toHalfwidthAscii);
}

export function shouldTranslateTitle(text: string): boolean {
  return shouldTranslateTitlePolicy(text, shouldTranslateHeading);
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
