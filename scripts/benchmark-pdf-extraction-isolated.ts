/** Runs each PDF in a separate process so native PDF parser failures cannot abort the corpus. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

type CatalogPaper = { id: string; filename: string; title: string; authors?: string[]; formatFamily?: string };
const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")) as { papers: CatalogPaper[] };
const selected = process.argv.includes("--all") ? catalog.papers : catalog.papers.filter((p) => process.argv.includes(p.id));
if (!selected.length) throw new Error("use --all or pass one or more paper ids");
const reports: unknown[] = [];
const failures: Array<{ id: string; code: number | null; stderr: string }> = [];
for (const paper of selected) {
  await new Promise<void>((resolve) => {
    const child = spawn("npx", ["tsx", "scripts/benchmark-pdf-extraction-worker.ts", paper.id], { cwd: root, env: process.env });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => {
      try {
        if (code === 0) {
          // pdfjs may write diagnostics to either stream; the worker's final
          // line is the only machine-readable payload.
          const payload = `${out}\n${err}`.trim().split(/\n/).reverse().find((line) => line.trim().startsWith("{"));
          if (!payload) throw new Error("worker produced no JSON report");
          reports.push(JSON.parse(payload));
        } else failures.push({ id: paper.id, code, stderr: err.slice(-4000) });
      }
      catch { failures.push({ id: paper.id, code, stderr: `${err}\n${out.slice(-1000)}` }); }
      resolve();
    });
  });
  console.error(`[isolated] ${reports.length + failures.length}/${selected.length} ${paper.id}`);
}
const titleKnown = reports.filter((r) => (r as { titleExact?: boolean }).titleExact !== undefined);
const titleHits = titleKnown.filter((r) => (r as { titleExact?: boolean }).titleExact).length;
const result = { version: "extraction-isolated-v1", generatedAt: new Date().toISOString(), papers: reports.length, failedPapers: failures, titleExact: titleKnown.length ? titleHits / titleKnown.length : null, reports };
const output = path.join(root, "test-data/real-papers/reports/extraction-isolated-latest.json");
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, output }, null, 2));
