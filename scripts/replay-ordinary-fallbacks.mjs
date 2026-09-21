import fs from "node:fs/promises";

const input = process.argv[2] ?? "test-data/real-papers/reports/ordinary-fallback-replay-v199.json";
const output = process.argv[3] ?? "test-data/real-papers/reports/ordinary-fallback-replay-v199-results.json";
const endpoint = process.env.MADLAD_BENCH_URL ?? "http://127.0.0.1:8765";
const timeoutMs = Number(process.env.MADLAD_REPLAY_TIMEOUT_MS ?? 180_000);
const maxAttempts = Number(process.env.MADLAD_REPLAY_MAX_ATTEMPTS ?? 3);

const fixture = JSON.parse(await fs.readFile(input, "utf8"));
const results = [];

for (const row of fixture.rows ?? []) {
  let response = null;
  let error = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${endpoint}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: row.source, target_language: "ja" }),
        signal: controller.signal,
      });
      const body = await res.text();
      response = { status: res.status, body };
      if (res.ok) break;
      error = `HTTP ${res.status}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      clearTimeout(timer);
    }
  }
  results.push({
    key: row.key,
    paperId: row.paperId,
    blockId: row.blockId,
    source: row.source,
    priorFallbackReason: row.fallbackReason ?? null,
    attempts: maxAttempts,
    response,
    error,
  });
  await fs.writeFile(output, JSON.stringify({
    version: "ordinary-fallback-replay-v199-results",
    input,
    endpoint,
    timeoutMs,
    maxAttempts,
    results,
  }, null, 2));
  console.log(`[replay] ${results.length}/${fixture.rows.length} ${row.key}`);
}

