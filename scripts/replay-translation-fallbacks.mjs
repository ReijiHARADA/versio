#!/usr/bin/env node

/**
 * Replay selected manually reviewed fallback sources against the running
 * translation server. This is diagnostic only: it never writes application
 * caches or changes production routing.
 *
 * Usage:
 *   node scripts/replay-translation-fallbacks.mjs \
 *     --ids ordinary-003,ordinary-006,ordinary-017 \
 *     --output test-data/real-papers/reports/madlad-fallback-replay.json
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ids = value("--ids", "ordinary-003,ordinary-006,ordinary-017")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const output = path.resolve(root, value(
  "--output",
  "test-data/real-papers/reports/madlad-fallback-replay.json",
));
const sourcePath = path.resolve(root, value(
  "--source",
  "test-data/real-papers/reports/ordinary-fallback-manual-review-v1.json",
));
const endpoint = value("--endpoint", "http://127.0.0.1:8765").replace(/\/$/, "");
const timeoutMs = Number(value("--timeout-ms", "240000"));
// The packaged sidecar enables the same token used by the Tauri client. Keep
// the diagnostic tool compatible with both tokenless dev servers and the
// authenticated .app server without ever persisting or printing the token.
const serverToken = (process.env.MADLAD_SERVER_TOKEN ?? "").trim();

const review = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const items = review.source?.items ?? [];
const selected = ids.map((id) => items.find((item) => item.reviewId === id));
const missing = ids.filter((id, index) => !selected[index]);
if (missing.length > 0) throw new Error(`Unknown review id(s): ${missing.join(", ")}`);

async function translate(item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${endpoint}/translate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(serverToken ? { "X-Versio-Token": serverToken } : {}),
      },
      body: JSON.stringify({
        text: item.source,
        source_language: "en",
        target_language: "ja",
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    return {
      id: item.reviewId,
      source: item.source,
      baseline: item.translation,
      output: data.text || data.translated_text || "",
      fallbackStage: data.fallback_stage,
      fallbackReason: data.fallback_reason,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      elapsedMs: Date.now() - started,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      id: item.reviewId,
      source: item.source,
      baseline: item.translation,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const item of selected) results.push(await translate(item));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  endpoint,
  sourcePath,
  ids,
  results,
  note: "Diagnostic replay only; evaluate output with the production quality gate and manual review.",
}, null, 2)}\n`);
console.log(`wrote ${output}`);
for (const result of results) {
  console.log(`${result.id}: ${result.fallbackStage ?? "none"} ${result.elapsedMs}ms`);
}
