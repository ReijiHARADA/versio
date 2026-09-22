/**
 * Audit-only paired candidate run for the v64 paper-held-out ordinary-prose rows.
 * Reuses production semantic segmentation and scientific placeholder protection,
 * then applies the same app-side quality gate. This does not alter routing.
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
const inputRelative = process.env.CANDIDATE_SOURCE_REPORT ?? "test-data/real-papers/reports/translation-audit-v64-heldout-four-disciplines.json";
const outputRelative = process.env.CANDIDATE_OUTPUT_REPORT ?? "test-data/real-papers/reports/model-compare-v70-heldout-gemma9-production-controls.json";
const inputPath = path.join(root, inputRelative);
const outputPath = path.join(root, outputRelative);
const version = process.env.CANDIDATE_RUN_VERSION ?? "heldout-gemma9-production-controls-v1";
const report = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const allRows = report.papers.flatMap((paper: any) => paper.rows)
  .filter((row: any) => row.sourceCategory === "ordinary-body-prose");
const excludedKeys = new Set((process.env.CANDIDATE_EXCLUDE_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean));
const rows = allRows.filter((row: any) => !excludedKeys.has(row.key));
const usedSourceHashes = new Map<string, string[]>();
function visitSources(value: any): void {
  if (Array.isArray(value)) {
    value.forEach(visitSources);
  } else if (value && typeof value === "object") {
    if (typeof value.source === "string") {
      const hash = crypto.createHash("sha256").update(value.source).digest("hex");
      const files = usedSourceHashes.get(hash) ?? [];
      files.push("current report traversal");
      usedSourceHashes.set(hash, files);
    }
    Object.values(value).forEach(visitSources);
  }
}
for (const name of fs.readdirSync(reportsDir).filter((name) => name.endsWith(".json"))) {
  const previousPath = path.join(reportsDir, name);
  if (previousPath === outputPath) continue;
  try {
    const text = fs.readFileSync(previousPath, "utf8");
    if (!/gemma2:9b|gemma[-_ ]?9b/i.test(text)) continue;
    const before = new Set(usedSourceHashes.keys());
    visitSources(JSON.parse(text));
    for (const hash of usedSourceHashes.keys()) {
      if (!before.has(hash)) usedSourceHashes.set(hash, [name]);
      else if (!usedSourceHashes.get(hash)?.includes(name)) usedSourceHashes.get(hash)?.push(name);
    }
  } catch {
    // Ignore unrelated partial reports; the duplicate guard is conservative
    // over every complete previous Qwen artifact it can parse.
  }
}
const duplicateRows = rows.filter((row: any) => usedSourceHashes.has(
  crypto.createHash("sha256").update(row.source).digest("hex")
));
const allowPairedModelOverlap = process.env.CANDIDATE_ALLOW_PAIRED_MODEL_OVERLAP === "1";
if (duplicateRows.length && !allowPairedModelOverlap) {
  throw new Error(`candidate model paper/source leakage guard: ${duplicateRows.map((row: any) => `${row.key} (${(usedSourceHashes.get(crypto.createHash("sha256").update(row.source).digest("hex")) ?? []).join("; ")})`).join(", ")}`);
}
const model = process.env.CANDIDATE_MODEL ?? "gemma2:9b";
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const systemPrompt = `You are a professional academic translator specializing in English-to-Japanese academic translation.
Translate faithfully. Preserve negation, comparison, causality, participant counts and scope, experimental conditions, technical terms, citations, statistics, numbers, and every placeholder exactly. Do not add conclusions or omit qualifications. Output only the Japanese translation.`;
const protectCode = `import json,sys
from engines.segmenter import segment_for_translation
from engines.citation_protect import protect_citations,restore_citations
source=json.load(sys.stdin)
result=[]
for unit in segment_for_translation(source):
    protected,citations,nonce=protect_citations(unit.model_input)
    result.append({"source":unit.text,"input":protected,"citations":citations,"nonce":nonce})
print(json.dumps(result,ensure_ascii=False))`;
const restoreCode = `import json,sys
from engines.citation_protect import restore_citations
x=json.load(sys.stdin)
try:
 print(json.dumps({"ok":True,"text":restore_citations(x["text"],x["citations"],x["nonce"],reject_missing=True)},ensure_ascii=False))
except Exception as e:
 print(json.dumps({"ok":False,"error":str(e)},ensure_ascii=False))`;

function pythonJson(code: string, value: unknown): any {
  const raw = execFileSync(path.join(root, "translation-server/.venv/bin/python"), ["-c", code], {
    cwd: path.join(root, "translation-server"),
    input: JSON.stringify(value), encoding: "utf8",
  });
  return JSON.parse(raw);
}

const output: any = {
  createdAt: new Date().toISOString(),
  version,
  sourceBenchmark: inputRelative,
  model: { name: model, baseUrl, digest: "7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6", quantization: "Q4_K_M" },
  generation: { temperature: 0.3, num_predict: 2000, stream: false },
  prompt: { system: systemPrompt, userTemplate: "Translate the following paragraph to Japanese:\n\n{protected production segment}" },
  pipeline: "production segment_for_translation -> protect_citations -> Qwen per unit -> strict placeholder restore -> join -> current TypeScript quality gate",
  selection: `all ordinary-body rows; exact-source hash guarded against every parseable prior Gemma2 9B report found under ${reportsDir}`,
  excludedKeys: [...excludedKeys],
  pairedModelOverlapAllowed: allowPairedModelOverlap,
  candidateRowCount: rows.length,
  results: [],
};
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

for (const [index, row] of rows.entries()) {
  const units = pythonJson(protectCode, row.source);
  const generated: any[] = [];
  let failed: string | undefined;
  for (const [unitIndex, unit] of units.entries()) {
    const started = performance.now();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Translate the following paragraph to Japanese:\n\n${unit.input}` },
      ], stream: false, options: { temperature: 0.3, num_predict: 2000 } }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data: any = await response.json();
    const rawText = String(data.message?.content ?? "").trim();
    const restored = pythonJson(restoreCode, { text: rawText, citations: unit.citations, nonce: unit.nonce });
    generated.push({
      index: unitIndex, source: unit.source, modelInput: unit.input, rawOutput: rawText,
      restoredOutput: restored.ok ? restored.text : null, restoreError: restored.ok ? null : restored.error,
      inputTokens: data.prompt_eval_count ?? null, outputTokens: data.eval_count ?? null,
      latencyMs: performance.now() - started, doneReason: data.done_reason ?? null,
    });
    if (!restored.ok) failed = restored.error;
  }
  const translation = generated.every((unit) => unit.restoredOutput !== null)
    ? generated.map((unit) => unit.restoredOutput).join(" ").trim()
    : null;
  const item = {
    key: row.key, paperId: row.paperId, source: row.source, sourceChars: row.source.length,
    v64MadladTranslation: row.translation ?? null,
    v64MadladFallback: Boolean(row.readerVisibleFallback),
    units: generated, translation, failedRestore: failed ?? null,
    quality: translation === null ? null : evaluateJaTranslation(translation, row.source),
    gateAccept: translation === null ? false : isPlausibleJaTranslation(translation, row.source),
    sourceInvariants: extractScientificInvariants(row.source),
    outputInvariants: translation === null ? [] : extractScientificInvariants(translation),
  };
  output.results.push(item);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[${index + 1}/${rows.length}] ${row.key}: ${translation === null ? "restore-fallback" : item.gateAccept ? "gate-accept" : "gate-reject"}; ${generated.length} unit(s); ${generated.reduce((n, u) => n + (u.latencyMs ?? 0), 0).toFixed(0)}ms`);
}
console.log(`Saved ${outputPath}`);
