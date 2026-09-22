/** Audit-only semantic coverage signals for the real-paper translation report. */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd());
const input = process.env.TRANSLATION_AUDIT_INPUT
  ? path.resolve(root, process.env.TRANSLATION_AUDIT_INPUT)
  : path.join(root, "test-data/real-papers/reports/translation-audit.json");
const output = path.join(root, "test-data/real-papers/reports/translation-coverage-v77.json");
const report = JSON.parse(fs.readFileSync(input, "utf8")) as { papers: Array<{ paper: { id: string }; rows: any[] }> };

const sourceSentences = (text: string) => Math.max(1, (text.match(/[.!?](?:["')\]]+)?(?=\s|$)/g) ?? []).length);
const japaneseSentences = (text: string) => (text.match(/[。！？]/g) ?? []).length;
const invariantCount = (row: any) => Array.isArray(row.sourceInvariants) ? row.sourceInvariants.length : 0;
const isOrdinaryBody = (row: any) => row.sourceCategory === "ordinary-body-prose"
  || (row.role === "paragraph" && row.sourceFallback !== true);
const preservedInvariantCount = (row: any) => {
  const translated = String(row.translation ?? "");
  const invariants = Array.isArray(row.sourceInvariants) ? row.sourceInvariants : [];
  const normalize = (value: string) => value
    .normalize("NFKC")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("en-US");
  const normalizedTranslation = normalize(translated);
  return invariants.filter((token: string) => normalizedTranslation.includes(normalize(token))).length;
};
const sourceHasNegation = (text: string) => /\b(?:not|no|never|none|neither|without|cannot|can't|doesn't|don't|isn't|aren't|won't)\b/i.test(text);
const translationHasNegation = (text: string) => /(?:ない|ません|ず|ぬ|無い|なし|未|否定|できない|ありません)/.test(text);
// Keep this audit signal high-precision: weak conjunctions such as `but` and
// `while` are too common to establish a discourse-level contrast reliably.
const sourceHasContrast = (text: string) => /\b(?:however|although|though|unlike|whereas|despite)\b/i.test(text);
const translationHasContrast = (text: string) => /(?:しかし|だが|一方|対照的|異なり|にもかかわらず|反面|だけでなく|ものの)/.test(text);
// Audit-only signal for claims about order or uniqueness (for example,
// `not the first`, `only`, or `the last`). These are easy to omit while
// still producing fluent Japanese, so they need manual review rather than
// an automatic reject rule.
const sourceHasOrdinalClaim = (text: string) => /\b(?:first|second|third|last|only|unique|sole|initial|final)\b/i.test(text);
const translationHasOrdinalClaim = (text: string) => /(?:最初|第一|第\s*[一1二2三3]|二番目|最後|唯一|ただ一つ|初め|初期|最終|のみ|だけ)/.test(text);
// Conditions and causal qualifications are easy to omit while retaining a
// fluent sentence. Keep this audit-only and high precision.
const sourceHasCondition = (text: string) => /\b(?:if|unless|whether|provided that|depending on|because|therefore|thus|so that)\b/i.test(text);
const translationHasCondition = (text: string) => /(?:もし|場合|〜なら|ならば|ない限り|によって|応じて|ため|ので|したがって|そのため|ように|かどうか|かもしれ|可能性|防ぐ|妨げ|意見が分かれ)/.test(text);

const rows = report.papers.flatMap(({ paper, rows }) => rows
  .filter((row) => isOrdinaryBody(row) && row.translation)
  .map((row) => {
    const source = String(row.source);
    const translation = String(row.translation);
    const sourceCount = sourceSentences(source);
    const outputCount = japaneseSentences(translation);
    const ratio = translation.replace(/\s+/g, "").length / Math.max(1, source.replace(/\s+/g, "").length);
    return {
      paperId: paper.id,
      blockId: row.blockId,
      readerVisibleFallback: Boolean(row.readerVisibleFallback),
      sourceChars: source.length,
      translationChars: translation.length,
      lengthRatio: Number(ratio.toFixed(3)),
      sourceSentenceCount: sourceCount,
      japaneseSentenceCount: outputCount,
      sentenceCoverage: Number(Math.min(1, outputCount / sourceCount).toFixed(3)),
      invariantCount: invariantCount(row),
      preservedInvariantCount: preservedInvariantCount(row),
      relations: {
        sourceNegation: sourceHasNegation(source),
        translationNegation: translationHasNegation(translation),
        negationPreserved: !sourceHasNegation(source) || translationHasNegation(translation),
        sourceContrast: sourceHasContrast(source),
        translationContrast: translationHasContrast(translation),
        contrastPreserved: !sourceHasContrast(source) || translationHasContrast(translation),
        sourceOrdinalClaim: sourceHasOrdinalClaim(source),
        translationOrdinalClaim: translationHasOrdinalClaim(translation),
        ordinalClaimPreserved: !sourceHasOrdinalClaim(source) || translationHasOrdinalClaim(translation),
        sourceCondition: sourceHasCondition(source),
        translationCondition: translationHasCondition(translation),
        conditionPreserved: !sourceHasCondition(source) || translationHasCondition(translation),
      },
    };
  }));

const summary = {
  version: "3b-mt-v6-transformers-4.57.6-quality-v77-audit-relations",
  createdAt: new Date().toISOString(),
  rows: rows.length,
  lowSentenceCoverage: rows.filter((row) => row.sourceSentenceCount >= 3 && row.sentenceCoverage < 0.5).length,
  lowLengthRatio: rows.filter((row) => row.sourceChars >= 400 && row.lengthRatio < 0.28).length,
  invariantLoss: rows.filter((row) => row.invariantCount > row.preservedInvariantCount).length,
  negationRelationLoss: rows.filter((row) => !row.relations.negationPreserved).length,
  contrastRelationLoss: rows.filter((row) => !row.relations.contrastPreserved).length,
  ordinalClaimRelationLoss: rows.filter((row) => !row.relations.ordinalClaimPreserved).length,
  conditionRelationLoss: rows.filter((row) => !row.relations.conditionPreserved).length,
};
fs.writeFileSync(output, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary));
