/**
 * Candidate-only Qwen 2.5 7B replay over source-hash-new v91 ordinary prose.
 * Keeps source segmentation, scientific protection, restoration, and the v5
 * application quality gate fixed. This is diagnostic; it does not route traffic.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  evaluateJaTranslation,
  extractScientificInvariants,
  isPlausibleJaTranslation,
} from "../src/services/translation/quality.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(root, "test-data/real-papers/reports");
const inputRelative = process.env.CANDIDATE_SOURCE_REPORT
  ?? "test-data/real-papers/reports/translation-audit-v91-quality-v5-heldout-five-field.json";
const inputPath = path.join(root, inputRelative);
const outputRelative = process.env.CANDIDATE_OUTPUT_REPORT
  ?? "test-data/real-papers/reports/model-compare-v92-qwen7-v5-unique-ordinary.json";
const outputPath = path.join(root, outputRelative);
const runVersion = process.env.CANDIDATE_RUN_VERSION ?? "qwen7-v92-v5-heldout-sourcehash-new";
const model = "qwen2.5:7b";
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const prompt = `You are a professional academic translator specializing in English-to-Japanese academic translation.
Translate faithfully. Preserve negation, comparison, causality, participant counts and scope, experimental conditions, technical terms, citations, statistics, numbers, and every placeholder exactly. Do not add conclusions or omit qualifications. Output only the Japanese translation.`;
const report = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const hash = (source: string) => crypto.createHash("sha256").update(source.trim()).digest("hex");
const historicalHashes = new Map<string, string[]>();
const historicalKeys = new Map<string, string[]>();
const qwen7Hashes = new Set<string>();
for (const name of fs.readdirSync(reportsDir).filter((name) => name.endsWith(".json"))) {
  const previousPath = path.join(reportsDir, name);
  if (previousPath === inputPath || previousPath === outputPath) continue;
  try {
    const data = JSON.parse(fs.readFileSync(previousPath, "utf8"));
    const isQwen7Model = (value: any) => typeof value === "string"
      ? /qwen2\.5:7b|qwen2\.5-7b|qwen 2\.5 7b/i.test(value)
      : Boolean(value && typeof value === "object" && isQwen7Model(value.name));
    const rootCandidate = isQwen7Model(data?.model);
    const visit = (value: any, inheritedQwen7 = rootCandidate) => {
      if (Array.isArray(value)) return value.forEach((child) => visit(child, inheritedQwen7));
      if (!value || typeof value !== "object") return;
      const rowIsQwen7 = inheritedQwen7 || isQwen7Model(value.model);
      if (typeof value.source === "string" && value.source.trim()) {
        const key = hash(value.source);
        historicalHashes.set(key, [...(historicalHashes.get(key) ?? []), name]);
        if (rowIsQwen7) qwen7Hashes.add(key);
      }
      if (typeof value.key === "string") {
        historicalKeys.set(value.key, [...(historicalKeys.get(value.key) ?? []), name]);
      }
      Object.values(value).forEach((child) => visit(child, rowIsQwen7));
    };
    visit(data);
  } catch {
    // Ignore unrelated partial reports; only complete, parseable candidate
    // artifacts participate in this conservative leakage guard.
  }
}

const selected: any[] = [];
const excludedPriorQwen7: string[] = [];
const seenKeys = new Set<string>();
const seenHashes = new Set<string>();
for (const paper of report.papers) {
  for (const row of paper.rows) {
    if (row.sourceCategory !== "ordinary-body-prose") continue;
    const sourceHash = hash(row.source);
    if (seenKeys.has(row.key) || seenHashes.has(sourceHash)) continue;
    seenKeys.add(row.key);
    seenHashes.add(sourceHash);
    if (qwen7Hashes.has(sourceHash)) {
      excludedPriorQwen7.push(row.key);
      continue;
    }
    // Keep this as an independently sampled continuation cohort: sources or
    // stable keys present in any older report are not counted as new evidence.
    if (historicalHashes.has(sourceHash) || historicalKeys.has(row.key)) continue;
    selected.push({ ...row, sourceHash });
  }
}
if (selected.length === 0) {
  throw new Error("No exact-source-hash-new ordinary-body rows remain after historical and Qwen 7B deduplication");
}

const protectionScript = `import json,sys
from engines.segmenter import segment_for_translation
from engines.citation_protect import protect_citations,restore_citations
result=[]
for unit in segment_for_translation(json.load(sys.stdin)):
    protected,citations,nonce=protect_citations(unit.model_input)
    result.append({"source":unit.text,"input":protected,"citations":citations,"nonce":nonce})
print(json.dumps(result,ensure_ascii=False))`;
const restoreScript = `import json,sys
from engines.citation_protect import restore_citations
x=json.load(sys.stdin)
try: print(json.dumps({"ok":True,"text":restore_citations(x["text"],x["citations"],x["nonce"],reject_missing=True)},ensure_ascii=False))
except Exception as e: print(json.dumps({"ok":False,"error":str(e)},ensure_ascii=False))`;
function pythonJson(script: string, value: unknown): any {
  const raw = execFileSync(path.join(root, "translation-server/.venv/bin/python"), ["-c", script], {
    cwd: path.join(root, "translation-server"), input: JSON.stringify(value), encoding: "utf8",
  });
  return JSON.parse(raw);
}

const output: any = {
  createdAt: new Date().toISOString(),
  version: runVersion,
  sourceBenchmark: inputRelative,
  sourceBenchmarkVersion: report.metadata?.modelVersion ?? report.modelVersion ?? "see source rows",
  model: { name: model, baseUrl, digest: "845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e", quantization: "Q4_K_M" },
  generation: { temperature: 0.3, num_predict: 2000, stream: false },
  prompt,
  pipeline: "v5 baseline sources -> production segment_for_translation -> protect_citations -> Qwen per semantic unit -> strict restore -> current TypeScript quality-v5 gate",
  selection: "Ordinary-body rows whose stable keys and exact source SHA-256 are absent from every older report and every prior Qwen 2.5 7B replay. Mixed-model reports are screened per output row.",
  internalRowsBeforeHistoricalDeduplication: 18,
  selectedUniqueRows: selected.length,
  excludedBecausePriorQwen7: excludedPriorQwen7,
  results: [],
};
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

for (const [index, row] of selected.entries()) {
  const units = pythonJson(protectionScript, row.source);
  const generated: any[] = [];
  let failedRestore: string | null = null;
  for (const [unitIndex, unit] of units.entries()) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Translate the following paragraph to Japanese:\n\n${unit.input}` },
      ], stream: false, options: { temperature: 0.3, num_predict: 2000 } }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data: any = await response.json();
    const rawOutput = String(data.message?.content ?? "").trim();
    const restored = pythonJson(restoreScript, { text: rawOutput, citations: unit.citations, nonce: unit.nonce });
    generated.push({
      index: unitIndex, source: unit.source, modelInput: unit.input, rawOutput,
      restoredOutput: restored.ok ? restored.text : null,
      restoreError: restored.ok ? null : restored.error,
      inputTokens: data.prompt_eval_count ?? null, outputTokens: data.eval_count ?? null,
      latencyMs: performance.now() - started, doneReason: data.done_reason ?? null,
    });
    if (!restored.ok) failedRestore = restored.error;
  }
  const translation = generated.every((unit) => unit.restoredOutput !== null)
    ? generated.map((unit) => unit.restoredOutput).join(" ").trim() : null;
  const item = {
    key: row.key, paperId: row.paperId, sourceHash: row.sourceHash,
    sourceCategory: row.sourceCategory, source: row.source, sourceChars: row.source.length,
    madladModelVersion: row.modelVersion ?? null,
    madladTranslation: row.translation ?? null,
    madladFallback: Boolean(row.readerVisibleFallback), madladFallbackStage: row.fallbackStage ?? null,
    units: generated, translation, failedRestore,
    quality: translation === null ? null : evaluateJaTranslation(translation, row.source),
    gateAccept: translation === null ? false : isPlausibleJaTranslation(translation, row.source),
    sourceInvariants: extractScientificInvariants(row.source),
    outputInvariants: translation === null ? [] : extractScientificInvariants(translation),
  };
  output.results.push(item);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[${runVersion}] ${index + 1}/${selected.length} ${row.key} gate=${item.gateAccept} units=${generated.length} latency=${generated.reduce((sum, unit) => sum + unit.latencyMs, 0).toFixed(0)}ms`);
}

console.log(`Saved ${outputPath}`);
