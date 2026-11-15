/**
 * Label-free health gate for frozen validation / held-out PDFs.
 *
 * This intentionally makes no semantic-accuracy claim. It verifies that an
 * unknown PDF is hash-pinned, deterministically extracted, source-complete at
 * the layout layer, structurally well-formed, and traceable into Reader.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Cohort = { split?: string; documents?: Array<{ id?: string }> };
const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const cohortPath = path.resolve(root, option("--cohort") ?? "test-fixtures/extraction-benchmark/validation-cohort-v1.json");
const timeoutMs = Number(option("--timeout-ms") ?? 300_000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number.");
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8")) as Cohort;
if ((cohort.split !== "validation" && cohort.split !== "heldout") || !cohort.documents?.length || cohort.documents.length > 12) {
  throw new Error("Health cohort must be a frozen validation/heldout cohort containing 1–12 documents.");
}
const requestedIds = option("--ids")?.split(",").map((id) => id.trim()).filter(Boolean);
if (!requestedIds && !args.includes("--all")) throw new Error("Use --ids id1,id2 for a bounded run, or --all for the frozen cohort.");
const ids = requestedIds ?? cohort.documents.map((document) => document.id).filter((id): id is string => Boolean(id));
if (!ids.length || ids.some((id) => !cohort.documents?.some((document) => document.id === id))) throw new Error("--ids must name documents from the selected cohort.");
const output = path.resolve(root, option("--output") ?? "test-data/extraction-evaluation/unlabeled-health-latest.json");

function worker(id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const viteNode = path.join(root, "node_modules/.bin/vite-node");
    if (!fs.existsSync(viteNode)) return reject(new Error("Local vite-node is unavailable; install locked project dependencies first."));
    const child = spawn(viteNode, ["--script", "scripts/audit-unlabeled-extraction-health-worker.ts", id, path.relative(root, cohortPath)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`timed out after ${timeoutMs}ms`));
      if (code !== 0) return reject(new Error(stderr.trim() || `worker exited ${code ?? signal ?? "unknown"}`));
      const start = stdout.lastIndexOf("\n{");
      try { resolve(JSON.parse((start >= 0 ? stdout.slice(start + 1) : stdout).trim()) as Record<string, unknown>); }
      catch { reject(new Error(`worker returned invalid JSON: ${stdout.slice(0, 200)}`)); }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

const reports: Record<string, unknown>[] = [];
const failures: Array<{ id: string; error: string }> = [];
for (const [index, id] of ids.entries()) {
  process.stderr.write(`auditing ${index + 1}/${ids.length}: ${id}\n`);
  try { reports.push(await worker(id)); }
  catch (error) { failures.push({ id, error: error instanceof Error ? error.message : String(error) }); }
}
const unhealthy = reports.filter((report) => report.healthy !== true).map((report) => report.id);
const triage = reports.map((report) => ({
  id: report.id,
  suspectedMissingEquationAnchors: ((report.triage as { suspectedMissingEquationAnchors?: unknown[] } | undefined)?.suspectedMissingEquationAnchors ?? []).length,
  suspectedMissingTableCaptionAnchors: ((report.triage as { suspectedMissingTableCaptionAnchors?: unknown[] } | undefined)?.suspectedMissingTableCaptionAnchors ?? []).length,
}));
const result = { schemaVersion: 1, kind: "paper-reader-extraction-unlabeled-health", generatedAt: new Date().toISOString(), cohort: path.relative(root, cohortPath), selection: { requested: ids.length, completed: reports.length, timeoutMs }, reports, failures, unhealthy, triage, note: "This is a label-free health gate, not an extraction-accuracy metric. CER/NED, Block F1, Reading Order, TEDS, and CDM remain N/A without reviewed gold. Triage anchors are raw-PDF review signals, never gold labels or failures." };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, selection: result.selection, failures, unhealthy, note: result.note }, null, 2));
if (failures.length || unhealthy.length) process.exitCode = 1;
