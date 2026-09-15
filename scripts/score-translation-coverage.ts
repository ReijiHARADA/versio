/** Audit-only semantic coverage signals for the real-paper translation report. */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd());
const input = process.env.TRANSLATION_AUDIT_INPUT
  ? path.resolve(root, process.env.TRANSLATION_AUDIT_INPUT)
  : path.join(root, "test-data/real-papers/reports/translation-audit.json");
const output = path.join(root, "test-data/real-papers/reports/translation-coverage-v66.json");
const report = JSON.parse(fs.readFileSync(input, "utf8")) as { papers: Array<{ paper: { id: string }; rows: any[] }> };

const sourceSentences = (text: string) => Math.max(1, (text.match(/[.!?](?:["')\]]+)?(?=\s|$)/g) ?? []).length);
const japaneseSentences = (text: string) => (text.match(/[。！？]/g) ?? []).length;
const invariantCount = (row: any) => Array.isArray(row.sourceInvariants) ? row.sourceInvariants.length : 0;
const isOrdinaryBody = (row: any) => row.sourceCategory === "ordinary-body-prose"
  || (row.role === "paragraph" && row.sourceFallback !== true);
const preservedInvariantCount = (row: any) => {
  const source = String(row.source ?? "");
  const translated = String(row.translation ?? "");
  const invariants = Array.isArray(row.sourceInvariants) ? row.sourceInvariants : [];
  return invariants.filter((token: string) => translated.includes(token)).length;
};

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
    };
  }));

const summary = {
  version: "3b-mt-v5-semantic-v66",
  createdAt: new Date().toISOString(),
  rows: rows.length,
  lowSentenceCoverage: rows.filter((row) => row.sourceSentenceCount >= 3 && row.sentenceCoverage < 0.5).length,
  lowLengthRatio: rows.filter((row) => row.sourceChars >= 400 && row.lengthRatio < 0.28).length,
  invariantLoss: rows.filter((row) => row.invariantCount > row.preservedInvariantCount).length,
};
fs.writeFileSync(output, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary));
