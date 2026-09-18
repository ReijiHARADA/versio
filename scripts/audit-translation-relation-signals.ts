import fs from "node:fs";
import path from "node:path";
import { evaluateJaTranslation } from "../src/services/translation/quality";

type Review = {
  key: string;
  source: string;
  translation: string;
  productionDecision?: string;
  severity?: number;
  labels?: string[];
};

type Signal = "negation" | "comparison" | "causal" | "condition" | "temporal";

const SOURCE_PATTERNS: Record<Signal, RegExp> = {
  negation: /\b(?:not|never|without|lack(?:s|ed|ing)?|absence|cannot|no\b|neither|nor)\b/i,
  comparison: /\b(?:more|less|higher|lower|greater|smaller|fewer|greater than|less than|compared with|compared to|than|versus|vs\.)\b/i,
  causal: /\b(?:because|therefore|thus|hence|due to|result(?:s|ed)? in|leads? to|caus(?:e|ed|es|ing))\b/i,
  condition: /\b(?:if|unless|only if|provided that|when|whenever|whether)\b/i,
  temporal: /\b(?:before|after|during|while|since|until|then|subsequently|previously|later|first|next|finally)\b/i,
};

const JA_PATTERNS: Record<Signal, RegExp> = {
  negation: /(?:ない|なく|なかっ|ません|ず|ぬ|無|非|不|未|欠|否)/,
  comparison: /(?:より|ほど|以上|以下|高い|低い|多い|少ない|大きい|小さい|比較|対して|対照)/,
  causal: /(?:ため|ので|から|したがって|従って|結果として|起因|もたら|つなが|影響)/,
  condition: /(?:場合|ならば|なら|とき|時|条件|限り|もし|提供される場合)/,
  temporal: /(?:前に|後に|間に|その後|続いて|以前|後続|まず|次に|最後に|まで|以来)/,
};

function signals(text: string, patterns: Record<Signal, RegExp>): Signal[] {
  return (Object.keys(patterns) as Signal[]).filter((kind) => patterns[kind].test(text));
}

function main(): void {
  const root = path.resolve(__dirname, "..");
  const input = path.join(root, "test-data/real-papers/audit-manual-review.json");
  const output = path.join(root, "test-data/real-papers/reports/semantic-relation-gate-audit-v1.json");
  const corpus = JSON.parse(fs.readFileSync(input, "utf8")) as { reviews: Review[] };
  const rows = corpus.reviews
    .filter((row) => row.productionDecision === "accept" && (row.severity ?? 0) >= 2 && row.translation?.trim())
    .map((row) => {
      const sourceSignals = signals(row.source, SOURCE_PATTERNS);
      const outputSignals = signals(row.translation, JA_PATTERNS);
      const missing = sourceSignals.filter((kind) => !outputSignals.includes(kind));
      const quality = evaluateJaTranslation(row.translation, row.source);
      return {
        key: row.key,
        labels: row.labels ?? [],
        severity: row.severity ?? 0,
        sourceSignals,
        outputSignals,
        missingSignals: missing,
        gateScore: quality.score,
        gateReasons: quality.reasons,
      };
    });
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: "accepted manual-review rows with severity >= 2 and non-empty translation",
    count: rows.length,
    rowsWithRelationSignal: rows.filter((row) => row.sourceSignals.length > 0).length,
    rowsWithMissingRelationSignal: rows.filter((row) => row.missingSignals.length > 0).length,
    rowsMissingSignalAndAcceptedByCurrentGate: rows.filter((row) => row.missingSignals.length > 0 && row.gateScore >= 0.8 && row.gateReasons.length === 0).length,
    rows,
  };
  fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ output, ...summary }, null, 2));
}

main();
