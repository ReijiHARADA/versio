import fs from "node:fs";
import path from "node:path";
import { evaluateJaTranslation, isPlausibleJaTranslation } from "../src/services/translation/quality";
import { normalizeSourceGroundedTerminology } from "../src/services/llm/glossaryService";

const root = process.cwd();
const input = path.resolve(root, process.env.SOURCE_ECHO_REPLAY_INPUT ?? "test-data/real-papers/reports/translation-source-echo-replay-fresh-20260920-v16-v17.json");
const output = path.resolve(root, process.env.SOURCE_ECHO_REPLAY_EVALUATION ?? "test-data/real-papers/reports/translation-source-echo-replay-fresh-20260920-v16-v17-evaluation.json");
const report = JSON.parse(fs.readFileSync(input, "utf8")) as { results: Array<Record<string, unknown>> };
const rows = report.results.map((row) => {
  const source = String(row.source ?? "");
  const candidate = typeof row.text === "string" && row.text !== source ? row.text : undefined;
  if (!candidate) return { ...row, candidateAccepted: false, candidateReview: "no candidate returned" };
  const normalized = normalizeSourceGroundedTerminology(source, candidate);
  const quality = evaluateJaTranslation(normalized, source);
  return {
    ...row,
    candidate: normalized,
    quality,
    candidateAccepted: isPlausibleJaTranslation(normalized, source),
    candidateReview: "manual semantic review required",
  };
});
const summary = {
  total: rows.length,
  returnedCandidates: rows.filter((row) => row.candidate !== undefined).length,
  wouldPassAppQualityGate: rows.filter((row) => row.candidateAccepted).length,
  gateRejectedCandidates: rows.filter((row) => row.candidate !== undefined && row.candidateAccepted === false).length,
};
const result = { input: path.relative(root, input), generatedAt: new Date().toISOString(), summary, rows };
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), ...summary }));
