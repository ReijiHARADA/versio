import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateJaTranslation, isPlausibleJaTranslation } from "../src/services/translation/quality.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(root, process.env.ALT_INPUT_REPORT ?? "test-data/real-papers/reports/live-v246-cognitive-v13.json");
const outputPath = path.resolve(root, process.env.ALT_OUTPUT_REPORT ?? "test-data/real-papers/reports/alternate-model-diagnostic-v1.json");
const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const models = (process.env.ALT_MODELS ?? "qwen2.5:14b,qwen2.5:7b,gemma2:9b").split(",").map((x) => x.trim()).filter(Boolean);
const report: any = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const maxRows = Number.parseInt(process.env.ALT_MAX_ROWS ?? "0", 10);
const rows = report.papers.flatMap((p: any) => p.rows).filter((r: any) => r.sourceCategory === "ordinary-body-prose" && r.readerVisibleFallback).slice(0, Number.isFinite(maxRows) && maxRows > 0 ? maxRows : undefined);
const python = path.join(root, "translation-server/.venv/bin/python");
const protectCode = `import json,sys\nfrom engines.segmenter import segment_for_translation\nfrom engines.citation_protect import protect_citations\nx=json.load(sys.stdin)\nout=[]\nfor u in segment_for_translation(x):\n p,c,n=protect_citations(u.model_input)\n out.append({'source':u.text,'input':p,'citations':c,'nonce':n})\nprint(json.dumps(out,ensure_ascii=False))`;
const restoreCode = `import json,sys\nfrom engines.citation_protect import restore_citations\nx=json.load(sys.stdin)\ntry: print(json.dumps({'ok':True,'text':restore_citations(x['text'],x['citations'],x['nonce'],reject_missing=True)},ensure_ascii=False))\nexcept Exception as e: print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))`;
function py(code: string, value: unknown): any { return JSON.parse(execFileSync(python, ["-c", code], { cwd: path.join(root, "translation-server"), input: JSON.stringify(value), encoding: "utf8" })); }
const prompt = "You are a professional academic translator. Translate English academic text into faithful Japanese. Preserve every number, citation, negation, comparison, condition, and technical term. Output only the translation.";
const out: any = { version: "alternate-model-diagnostic-v2", createdAt: new Date().toISOString(), sourceReport: path.basename(inputPath), models, baseUrl, selection: "ordinary-body rows that fell back in the supplied MADLAD report; audit-only, no production routing", results: [] };
for (const row of rows) {
  const units = py(protectCode, row.source);
  for (const model of models) {
    const pieces: string[] = []; const rawPieces: string[] = []; const errors: string[] = [];
    for (const unit of units) {
      const response = await fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, { role: "user", content: `Translate this text to Japanese:\n\n${unit.input}` }], stream: false, options: { temperature: 0.1, num_predict: 2000 } }) });
      if (!response.ok) throw new Error(`${model} ${response.status}: ${await response.text()}`);
      const data: any = await response.json(); const raw = String(data.message?.content ?? "").trim(); rawPieces.push(raw);
      const restored = py(restoreCode, { text: raw, citations: unit.citations, nonce: unit.nonce });
      if (restored.ok) pieces.push(restored.text); else { pieces.push(unit.source); errors.push(restored.error); }
    }
    const translation = pieces.join(" ").trim(); const quality = evaluateJaTranslation(translation, row.source);
    out.results.push({ key: row.key, model, source: row.source, units: units.length, rawPieces, translation, restoreErrors: errors, quality, gateAccept: isPlausibleJaTranslation(translation, row.source), madladFallbackReason: row.fallbackReason ?? null });
    fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
    console.log(`${model} ${row.key} accept=${isPlausibleJaTranslation(translation, row.source)} restoreErrors=${errors.length}`);
  }
}
console.log(`wrote ${outputPath}`);
