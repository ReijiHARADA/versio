/**
 * Audit-only selective-cascade benchmark.
 * Replays post-model fallback rows through the same OllamaTranslationEngine
 * used by import, with a deliberately failing primary. This never changes
 * production defaults or persisted paper blocks.
 *
 * Usage:
 *   npx vite-node --script scripts/benchmark-selective-cascade.ts \
 *     --input test-data/real-papers/reports/fallback-trace-v591-thermal.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaProvider } from "../src/services/llm/ollamaProvider";
import { AlternateTranslationQualityError, OllamaTranslationEngine } from "../src/services/translation/ollamaTranslationEngine";
import { evaluateJaTranslation } from "../src/services/translation/quality";
import type { TranslationEngine } from "../src/services/translation/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const input = path.resolve(root, inputIndex >= 0 ? args[inputIndex + 1] : "test-data/real-papers/reports/fallback-trace-v591-thermal.json");
const outputIndex = args.indexOf("--output");
const output = path.resolve(root, outputIndex >= 0 ? args[outputIndex + 1] : "test-data/real-papers/reports/selective-cascade-audit.json");
const model = process.env.OLLAMA_MODEL ?? "gemma2:9b";
const modelsIndex = args.indexOf("--models");
const models = modelsIndex >= 0
  ? args[modelsIndex + 1].split(",").map((value) => value.trim()).filter(Boolean)
  : [model];
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 0;

const sourceReport: any = JSON.parse(fs.readFileSync(input, "utf8"));
const rows: any[] = sourceReport.papers
  ? sourceReport.papers.flatMap((paper: any) => paper.rows)
  : sourceReport.rows ?? [];
const candidates = rows.filter((row) => row.fallbackStage === "post-model" && typeof row.source === "string" && row.source.trim())
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);

const primary: TranslationEngine = {
  name: "audit-failing-primary",
  translate: async () => { throw new Error("audit primary fallback"); },
  translateBatch: async () => { throw new Error("audit primary fallback"); },
  getStatus: async () => ({ available: false, modelLoaded: false, modelName: "audit", modelVersion: "audit" }),
  loadModel: async () => {},
  unloadModel: async () => {},
};
const providers = [...new Set(models)].map((candidate) => new OllamaProvider(baseUrl, candidate));
const engine = new OllamaTranslationEngine(primary, providers);
const report: any = {
  version: "selective-cascade-audit-v1",
  createdAt: new Date().toISOString(),
  sourceReport: path.relative(root, input),
  model,
  models,
  baseUrl,
  candidateCount: candidates.length,
  results: [],
};

for (const row of candidates) {
  const started = Date.now();
  try {
    const result = await engine.translate(row.source, "en", "ja");
    report.results.push({
      key: row.key ?? `${row.paperId}:${row.blockId}`,
      source: row.source,
      accepted: true,
      translation: result.text,
      quality: evaluateJaTranslation(result.text, row.source),
      modelVersion: result.modelVersion,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    const diagnostic = error instanceof AlternateTranslationQualityError
      ? {
          errorType: error.name,
          alternateTranslation: error.translation,
          alternateQuality: error.quality,
        }
      : {};
    report.results.push({
      key: row.key ?? `${row.paperId}:${row.blockId}`,
      source: row.source,
      accepted: false,
      ...diagnostic,
      error: String(error),
      elapsedMs: Date.now() - started,
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.results.at(-1).key} accepted=${report.results.at(-1).accepted}`);
}
console.log(`wrote ${output} (${report.results.filter((row: any) => row.accepted).length}/${report.results.length} accepted)`);
