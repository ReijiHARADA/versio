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
const requestTimeoutMs = Number.parseInt(process.env.ALT_REQUEST_TIMEOUT_MS ?? "90000", 10);
const report: any = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const maxRows = Number.parseInt(process.env.ALT_MAX_ROWS ?? "0", 10);
const includeAccepted = process.env.ALT_INCLUDE_ACCEPTED === "1";
const semanticRiskSource = (source: string): boolean => {
  const text = String(source ?? "");
  return text.length >= 280
    || /\b(?:although|while|however|whereas|unlike|because|therefore|thus|hence|if|unless)\b/i.test(text)
    || /\b(?:p\s*[<=>]|F\s*\(|t\s*\(|χ2?|participants?|sample|odds|confidence interval)\b/i.test(text);
};
const sourceRiskProfile = (source: string) => {
  const text = String(source ?? "");
  const flags = {
    long: text.length >= 280,
    numeric: /\b\d+(?:\.\d+)?\b|%|\b(?:mm|cm|kg|mg|Hz|kHz|GHz|mA|W\/kg)\b/i.test(text),
    citation: /\[[0-9][0-9,\-–— ]*\]|\b[A-Z][A-Za-z'’-]+(?:\s+et al\.?)?,?\s+\d{4}\b/.test(text),
    negation: /\b(?:not|no|never|neither|without|cannot|did not|does not|excluded?|exclusion|non[- ]\w+)\b/i.test(text),
    condition: /\b(?:if|unless|when|whereas|although|while|provided that)\b/i.test(text),
    comparison: /\b(?:higher|lower|greater|less|more|fewer|compared|comparative|non[- ]comparative|than|versus|vs\.)\b/i.test(text),
    causality: /\b(?:because|therefore|thus|hence|caused|leads? to|result(?:ed|s)? in)\b/i.test(text),
    structural: /\b(?:figure|fig\.?|table|section|appendix|equation)\b/i.test(text),
  };
  return { ...flags, riskCount: Object.values(flags).filter(Boolean).length, lowRisk: Object.values(flags).every((value) => !value) };
};
const rows = report.papers.flatMap((p: any) => p.rows).filter((r: any) =>
  r.sourceCategory === "ordinary-body-prose"
  && (r.readerVisibleFallback || (includeAccepted && semanticRiskSource(r.source))),
).slice(0, Number.isFinite(maxRows) && maxRows > 0 ? maxRows : undefined);
const python = path.join(root, "translation-server/.venv/bin/python");
const protectCode = `import json,sys\nfrom engines.segmenter import segment_for_translation\nfrom engines.citation_protect import protect_citations\nx=json.load(sys.stdin)\nout=[]\nfor u in segment_for_translation(x):\n p,c,n=protect_citations(u.model_input)\n out.append({'source':u.text,'input':p,'citations':c,'nonce':n})\nprint(json.dumps(out,ensure_ascii=False))`;
const restoreCode = `import json,sys\nfrom engines.citation_protect import restore_citations\nx=json.load(sys.stdin)\ntry: print(json.dumps({'ok':True,'text':restore_citations(x['text'],x['citations'],x['nonce'],reject_missing=True)},ensure_ascii=False))\nexcept Exception as e: print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))`;
function py(code: string, value: unknown): any { return JSON.parse(execFileSync(python, ["-c", code], { cwd: path.join(root, "translation-server"), input: JSON.stringify(value), encoding: "utf8" })); }
const prompt = "You are a professional academic translator. Translate English academic text into faithful Japanese. Preserve every number, citation, negation, comparison, condition, and technical term. Output only the translation.";
const out: any = { version: "alternate-model-diagnostic-v3", createdAt: new Date().toISOString(), sourceReport: path.basename(inputPath), models, baseUrl, selection: includeAccepted ? "ordinary-body fallback rows plus semantic-risk accepted rows; audit-only, no production routing" : "ordinary-body rows that fell back in the supplied MADLAD report; audit-only, no production routing", results: [] };
for (const row of rows) {
  const units = py(protectCode, row.source);
  for (const model of models) {
    const pieces: string[] = []; const rawPieces: string[] = []; const errors: string[] = [];
    for (const unit of units) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(requestTimeoutMs), body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, { role: "user", content: `Translate this text to Japanese:\n\n${unit.input}` }], stream: false, options: { temperature: 0.1, num_predict: 2000 } }) });
      } catch (error) {
        errors.push(`${model} request failed: ${error instanceof Error ? error.message : String(error)}`);
        pieces.push(unit.source);
        rawPieces.push("");
        continue;
      }
      if (!response.ok) {
        errors.push(`${model} ${response.status}: ${await response.text()}`);
        pieces.push(unit.source);
        rawPieces.push("");
        continue;
      }
      const data: any = await response.json(); const raw = String(data.message?.content ?? "").trim(); rawPieces.push(raw);
      const restored = py(restoreCode, { text: raw, citations: unit.citations, nonce: unit.nonce });
      if (restored.ok) pieces.push(restored.text); else { pieces.push(unit.source); errors.push(restored.error); }
    }
    const translation = pieces.join(" ").trim(); const quality = evaluateJaTranslation(translation, row.source);
    out.results.push({ key: row.key, model, source: row.source, sourceRiskProfile: sourceRiskProfile(row.source), units: units.length, rawPieces, translation, restoreErrors: errors, quality, gateAccept: isPlausibleJaTranslation(translation, row.source), madladFallbackReason: row.fallbackReason ?? null });
    fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
    console.log(`${model} ${row.key} accept=${isPlausibleJaTranslation(translation, row.source)} restoreErrors=${errors.length}`);
  }
}
console.log(`wrote ${outputPath}`);
