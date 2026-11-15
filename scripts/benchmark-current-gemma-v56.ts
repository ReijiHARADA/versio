import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJaTranslation, extractScientificInvariants, isPlausibleJaTranslation } from "../src/services/translation/quality.ts";

type AuditRow = {
  key: string;
  paperId: string;
  source: string;
  translation?: string;
  fallbackStage?: string;
  sourceCategory?: string;
  readerVisibleFallback?: boolean;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "test-data/real-papers/reports/translation-audit-v56-transformers-4.57.6.json");
const previousPath = "/tmp/versio-v54-fresh-gemma.json";
const outputPath = path.join(root, "test-data/real-papers/reports/gemma-v56-current-runtime-replay.json");
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const model = process.env.OLLAMA_MODEL ?? "gemma2:9b";
const sourceReportRelative = "test-data/real-papers/reports/translation-audit-v56-transformers-4.57.6.json";

const systemPrompt = `You are a professional academic translator specializing in translating English academic papers into Japanese. Follow these rules:

1. Translate the given paragraph from English to Japanese
2. Maintain academic tone and precision
3. Keep technical terms consistent with the provided glossary if given
4. Preserve citation markers like [1], [2], (Author, Year) exactly as they appear
5. Keep mathematical notation and variable names unchanged
6. Translate naturally while preserving the original meaning
7. Output ONLY the Japanese translation, nothing else`;

function rowsFromReport(report: any): AuditRow[] {
  return report.papers.flatMap((paper: any) => paper.rows as AuditRow[]);
}

async function main() {
  const current = rowsFromReport(JSON.parse(fs.readFileSync(reportPath, "utf8")));
  const selected = current.filter((row) => row.sourceCategory === "ordinary-body-prose");
  const previous = JSON.parse(fs.readFileSync(previousPath, "utf8"));
  const previousByKey = new Map<string, any>(previous.items.map((item: any) => [item.key, item]));
  const previousResultByKey = new Map<string, any>(previous.results.map((item: any) => [item.key, item]));
  if (selected.length !== 18) throw new Error(`Expected 18 ordinary-body source rows, found ${selected.length}`);
  for (const row of selected) {
    const old = previousByKey.get(row.key);
    if (!old || old.source !== row.source) throw new Error(`Source mismatch from v54 baseline: ${row.key}`);
  }

  const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
  const results: any[] = existing?.model === model &&
    (existing?.sourceReport === reportPath || existing?.sourceReport === sourceReportRelative)
    ? existing.results : [];
  const completed = new Map<string, any>(results.map((result: any) => [result.key, result]));
  const manifest = {
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    sourceReport: "test-data/real-papers/reports/translation-audit-v56-transformers-4.57.6.json",
    baselineComparison: "/tmp/versio-v54-fresh-gemma.json",
    model,
    baseUrl,
    prompt: { system: systemPrompt, userTemplate: "Translate the following paragraph to Japanese:\n\n{source}" },
    options: { temperature: 0.3, num_predict: 2000 },
    selection: "All rows source-labeled ordinary-body-prose from v56; exact key and source match against v54 replay required before generation.",
    results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  for (const [index, row] of selected.entries()) {
    if (completed.has(row.key)) continue;
    const userPrompt = `Translate the following paragraph to Japanese:\n\n${row.source}`;
    const start = performance.now();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 2000 },
      }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data: any = await response.json();
    const translation = String(data.message?.content ?? "").trim();
    const quality = evaluateJaTranslation(translation, row.source);
    const result = {
      key: row.key,
      paperId: row.paperId,
      source: row.source,
      sourceChars: row.source.length,
      madladTranslation: row.translation ?? null,
      madladFallback: Boolean(row.readerVisibleFallback),
      madladFallbackStage: row.fallbackStage,
      modelInput: `${systemPrompt}\n\n${userPrompt}`,
      translation,
      inputTokens: data.prompt_eval_count ?? null,
      outputTokens: data.eval_count ?? null,
      latencyMs: performance.now() - start,
      doneReason: data.done_reason ?? null,
      quality,
      gateAccept: isPlausibleJaTranslation(translation, row.source),
      sourceInvariants: extractScientificInvariants(row.source),
      outputInvariants: extractScientificInvariants(translation),
    };
    completed.set(row.key, result);
    manifest.results = [...completed.values()];
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
    console.log(`[gemma-v56] ${index + 1}/${selected.length} ${row.key} ${Math.round(result.latencyMs)}ms accept=${result.gateAccept}`);
  }

  manifest.results = selected.map((row) => completed.get(row.key)).filter(Boolean);
  for (const result of manifest.results) {
    const previousResult = previousResultByKey.get(result.key);
    result.sourceInvariants = extractScientificInvariants(result.source);
    result.outputInvariants = extractScientificInvariants(result.translation);
    if (!previousResult) continue;
    const previousQuality = evaluateJaTranslation(previousResult.translation, result.source);
    result.previousGemma = {
      translation: previousResult.translation,
      quality: previousQuality,
      gateAccept: isPlausibleJaTranslation(previousResult.translation, result.source),
      latencyMs: previousResult.latencyMs,
      inputTokens: previousResult.inputTokens,
      outputTokens: previousResult.outputTokens,
    };
  }
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  const finished = manifest.results;
  for (const result of finished) {
    result.quality = evaluateJaTranslation(result.translation, result.source);
    result.gateAccept = isPlausibleJaTranslation(result.translation, result.source);
  }
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`[gemma-v56] complete=${finished.length}/${selected.length} gateAccepted=${finished.filter((r: any) => r.gateAccept).length} report=${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
