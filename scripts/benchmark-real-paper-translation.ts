/**
 * Run the production extraction and translation path on locally cached,
 * openly available real papers. PDFs and generated reports stay in
 * test-data/real-papers (gitignored); only the catalog and this evaluator are
 * committed.
 *
 * Usage:
 *   npx tsx scripts/benchmark-real-paper-translation.ts
 *   npx tsx scripts/benchmark-real-paper-translation.ts --paper ozchi-finger-specific-touch
 *   npx tsx scripts/benchmark-real-paper-translation.ts --limit 4
 *   npx tsx scripts/benchmark-real-paper-translation.ts --resume
 *   npx tsx scripts/benchmark-real-paper-translation.ts --token-file /private/tmp/paper-reader-token
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import {
  detectPartialSourceFallback,
  evaluateJaTranslation,
  extractScientificInvariants,
  isExpectedNonProseParagraph,
  isPlausibleJaTranslation,
  looksLikeBibliographyEntry,
  shouldTranslateParagraph,
  unsafeParagraphStructureReason,
} from "../src/services/translation/quality.ts";
import { normalizeSourceGroundedTerminology } from "../src/services/llm/glossaryService.ts";
import type { PaperBlock } from "../src/types/paper.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  disciplines?: string[];
  kinds?: string[];
  formatFamily?: string;
};

type SourceCategory =
  | "ordinary-body-prose"
  | "list"
  | "caption"
  | "statistical-prose"
  | "reference-chrome"
  | "damaged-extraction";

type FallbackStage = "none" | "pre-model" | "post-model";

type ServerTranslation = {
  text: string;
  model_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  translation_time_ms: number;
};

type AuditRow = {
  paperId: string;
  blockId: string;
  role: PaperBlock["type"];
  pageStart: number;
  pageEnd: number;
  source: string;
  translation?: string;
  sourceFallback?: boolean;
  readerVisibleFallback?: boolean;
  partialSourceFallback?: boolean;
  partialSourceFallbackReason?: string;
  modelVersion?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  translationTimeMs?: number;
  sourceInvariants: string[];
  quality?: ReturnType<typeof evaluateJaTranslation>;
  structuralWarnings: string[];
  sourceCategory: SourceCategory;
  fallbackStage: FallbackStage;
  fallbackReason?: string;
  wouldSubmitToModel: boolean;
  wouldAcceptTranslation?: boolean;
  sourceIntegrity: "clean" | "mixed-chrome" | "structural-warning";
  extractionProvenance: { pageStart: number; pageEnd: number; bboxCount: number; extractionConfidence: number | null };
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };
const args = process.argv.slice(2);
const paperArg = args.indexOf("--paper");
const onlyPaper = paperArg >= 0 ? args[paperArg + 1] : undefined;
const limitArg = args.indexOf("--limit");
const perPaperLimit = limitArg >= 0 ? Number(args[limitArg + 1]) : 8;
const serialArg = args.includes("--serial");
const resumeArg = args.includes("--resume");
const endpoint = process.env.MADLAD_BENCH_URL ?? "http://127.0.0.1:8765";
const tokenFileArg = args.indexOf("--token-file");
const tokenFile = tokenFileArg >= 0 ? args[tokenFileArg + 1] : undefined;
const serverToken = (process.env.MADLAD_SERVER_TOKEN?.trim() ||
  (tokenFile ? fs.readFileSync(tokenFile, "utf8").trim() : "")) || undefined;
const requestTimeoutMs = Number(process.env.MADLAD_BENCH_REQUEST_TIMEOUT_MS ?? 180_000);

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function structuralWarnings(block: PaperBlock): string[] {
  const text = compact(block.original ?? "");
  const warnings: string[] = [];
  if (block.pageStart !== block.pageEnd) warnings.push("cross-page logical block");
  if (/^(?:fig(?:ure)?\.?|table)\s+\d+/i.test(text)) warnings.push("caption-shaped text");
  if (/\b(?:n\s*=|p\s*[<=>]|[FTZχ²]\s*\()/i.test(text)) warnings.push("scientific/statistical prose");
  if (/^(?:[-•‣∙]|\d+[.)])\s+/.test(text)) warnings.push("list-item boundary");
  if (/\b(?:and|or|but|to|of|for|where|which|that)\s*$/i.test(text)) warnings.push("ends like continuation");
  if (/^(?:and|or|but|to|of|for|where|which|that|one|exception)\b/i.test(text)) warnings.push("starts like continuation");
  return warnings;
}

function sourceCategory(block: PaperBlock): SourceCategory {
  const text = compact(block.original ?? "");
  const warnings = structuralWarnings(block);
  const chromeSignals = [
    /creativecommons|copyright\s+\d{4}|all rights reserved/i,
    /doi\s*:\s*10\.\d{4,9}\//i,
    /isbn\s*\d|acm\s+\d{4}/i,
    /licensed under a creative commons/i,
  ].filter((pattern) => pattern.test(text)).length;
  if (chromeSignals > 0 && /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(text)) return "damaged-extraction";
  if (warnings.includes("caption-shaped text")) return "caption";
  if (warnings.includes("scientific/statistical prose")) return "statistical-prose";
  if (warnings.includes("list-item boundary")) return "list";
  if (looksLikeBibliographyEntry(text) || isExpectedNonProseParagraph(text)) return "reference-chrome";
  if (
    warnings.includes("cross-page logical block")
    || warnings.includes("starts like continuation")
    || warnings.includes("ends like continuation")
    || unsafeParagraphStructureReason(text)
  ) {
    return "damaged-extraction";
  }
  return "ordinary-body-prose";
}

function fallbackStage(wouldSubmitToModel: boolean, readerVisibleFallback: boolean): FallbackStage {
  if (!readerVisibleFallback) return "none";
  return wouldSubmitToModel ? "post-model" : "pre-model";
}


function fallbackReason(source: string, result: ServerTranslation | undefined, quality: ReturnType<typeof evaluateJaTranslation> | undefined): string | undefined {
  const structural = unsafeParagraphStructureReason(source);
  if (!shouldTranslateParagraph(source)) {
    if (structural) return structural;
    if (looksLikeBibliographyEntry(source) || isExpectedNonProseParagraph(source)) return "expected non-prose paragraph";
    return "input policy rejected paragraph";
  }
  if (result?.text === source) return "server returned source fallback";
  if (quality?.reasons.length) return quality.reasons.join("; ");
  return undefined;
}

function sampleBlocks(blocks: PaperBlock[], max: number): PaperBlock[] {
  const eligible = blocks.filter((block) => {
    const text = compact(block.original ?? "");
    return block.type === "paragraph" && text.length >= 90 && text.length <= 1_800;
  });
  if (eligible.length <= max) return eligible;
  const result: PaperBlock[] = [];
  const add = (block: PaperBlock | undefined) => {
    if (block && !result.includes(block)) result.push(block);
  };
  // Section-like lexical anchors make the sample cover ordinary prose as well
  // as high-risk layouts even when a PDF lacks clean Canonical sections.
  const strata: Array<RegExp> = [
    /^(?:abstract|summary)\b/i, /\b(?:introduction|background)\b/i,
    /\b(?:related work|literature review)\b/i, /\b(?:method|methodology|participants|procedure)\b/i,
    /\b(?:result|analysis|significant|p\s*[<=>]|confidence interval)\b/i,
    /\b(?:discussion|limitation|conclusion|future work)\b/i,
  ];
  for (const pattern of strata) add(eligible.find((block) => pattern.test(compact(block.original ?? ""))));
  for (const block of eligible) {
    if (structuralWarnings(block).length > 0) add(block);
    if (result.length >= Math.ceil(max * 0.65)) break;
  }
  for (let index = 0; result.length < max; index += 1) {
    add(eligible[Math.min(eligible.length - 1, Math.floor(index * (eligible.length - 1) / Math.max(max - 1, 1)))]);
  }
  return result.slice(0, max);
}

async function translate(texts: string[]): Promise<ServerTranslation[]> {
  // The application submits independent requests to the scheduler; it is the
  // scheduler, rather than this benchmark, which coalesces safe microbatches.
  // Calling /translate/batch here bypassed the client-equivalent source echo
  // fallback path and made audit rows disagree with the actual reader.
  const one = async (text: string) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`${endpoint}/translate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(serverToken ? { "X-Paper-Reader-Token": serverToken } : {}),
          },
          body: JSON.stringify({ text, source_language: "en", target_language: "ja" }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (!response.ok) throw new Error(`translation server ${response.status}: ${await response.text()}`);
        return (await response.json()) as ServerTranslation;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw lastError;
  };
  if (serialArg) {
    const results: ServerTranslation[] = [];
    for (const text of texts) results.push(await one(text));
    return results;
  }
  return Promise.all(texts.map(one));
}

function extractQuietly(paper: CatalogPaper, pages: Awaited<ReturnType<typeof extractPdfPages>>) {
  // The legacy layout diagnostic is useful during parser work, but emits every
  // block to stdout. A corpus run must leave a readable progress log instead.
  const log = console.log;
  const info = console.info;
  const warn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    return extractFromPages({
      pages,
      paperId: `translation-audit-${paper.id}`,
      filePath: paper.filename,
      fileHash: paper.id,
      metadata: { title: paper.title, pageCount: pages.length },
    });
  } finally {
    console.log = log;
    console.info = info;
    console.warn = warn;
  }
}

function markdownReport(report: {
  createdAt: string;
  endpoint: string;
  papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }>;
}): string {
  const completed = report.papers.flatMap((entry) => entry.rows).filter((row) => row.translation);
  const fallbacks = report.papers.flatMap((entry) => entry.rows).filter((row) => row.readerVisibleFallback ?? row.sourceFallback);
  const partialSourceFallbacks = completed.filter((row) => row.partialSourceFallback);
  const fullyTranslatedAccepts = completed.filter((row) => row.wouldAcceptTranslation && !row.partialSourceFallback);
  const failed = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.translation && !(row.readerVisibleFallback ?? row.sourceFallback));
  const lowQuality = completed.filter((row) => (row.quality?.score ?? 1) < 0.8);
  const rejected = completed.filter((row) => row.wouldAcceptTranslation === false);
  const blockedBeforeModel = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.wouldSubmitToModel);
  const warnings = completed.filter((row) => row.structuralWarnings.length > 0);
  const rows = report.papers.flatMap((entry) => entry.rows);
  const categories = [...new Set(rows.map((row) => row.sourceCategory))].sort();
  const categoryLines = categories.flatMap((category) => {
    const scoped = rows.filter((row) => row.sourceCategory === category);
    const visibleFallbacks = scoped.filter((row) => row.readerVisibleFallback ?? row.sourceFallback).length;
    const partials = scoped.filter((row) => row.partialSourceFallback).length;
    const fullyTranslated = scoped.filter((row) => row.fallbackStage === "none" && !row.partialSourceFallback).length;
    return [
      `- ${category}: ${scoped.length} rows; accepts ${scoped.filter((row) => row.fallbackStage === "none").length}; fully translated accepts ${fullyTranslated}; partial source fallbacks ${partials}; fallbacks ${visibleFallbacks} (${(visibleFallbacks / Math.max(1, scoped.length) * 100).toFixed(1)}%)`,
    ];
  });
  const lines = [
    "# Real-paper translation audit (local, uncommitted)",
    "",
    `- Generated: ${report.createdAt}`,
    `- Endpoint: ${report.endpoint}`,
    `- Papers evaluated: ${report.papers.filter((entry) => !entry.error).length}/${report.papers.length}`,
    `- Model responses: ${completed.length}; original fallbacks: ${fallbacks.length}; partial source fallbacks inside accepted output: ${partialSourceFallbacks.length}; fully translated accepts: ${fullyTranslatedAccepts.length}; failed requests: ${failed.length}`,
    `- Score below 0.80: ${lowQuality.length}; rejected by the production quality gate: ${rejected.length}`,
    `- Blocked by the production input policy before model submission: ${blockedBeforeModel.length}`,
    `- Units needing structural review: ${warnings.length}`,
    "- Source categories:",
    ...categoryLines,
    "",
    "Automatic checks catch malformed output and preservation failures. They do **not** establish semantic equivalence; every row below is a source/translation review queue.",
    "",
  ];
  for (const entry of report.papers) {
    lines.push(`## ${entry.paper.id} — ${entry.paper.title}`, "");
    if (entry.error) {
      lines.push(`Evaluation error: ${entry.error}`, "");
      continue;
    }
    lines.push(`Disciplines: ${(entry.paper.disciplines ?? ["unclassified"]).join(", ")}`, "");
    for (const row of entry.rows) {
      lines.push(
        `### ${row.blockId} · pages ${row.pageStart}${row.pageEnd !== row.pageStart ? `–${row.pageEnd}` : ""}`,
        "",
        `- Role: ${row.role}; quality: ${row.quality?.score ?? "request failed"}; production decision: ${row.wouldSubmitToModel ? (row.wouldAcceptTranslation ? "accept" : "original fallback after quality gate") : "original fallback before model"}; warnings: ${row.structuralWarnings.join(", ") || "none"}`,
        `- Source category: ${row.sourceCategory}; fallback stage: ${row.fallbackStage}; fallback reason: ${row.fallbackReason ?? "none"}`,
        `- Invariants: ${row.sourceInvariants.join(", ") || "none"}`,
        "",
        "**Source**",
        "",
        row.source,
        "",
        "**Japanese**",
        "",
        row.translation ?? ((row.readerVisibleFallback ?? row.sourceFallback) ? "[original fallback]" : "[translation request failed]"),
        ""
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  console.log(`[audit] start endpoint=${endpoint} paper=${onlyPaper ?? "all"} limit=${perPaperLimit}`);
  const readyDeadline = Date.now() + Number(process.env.MADLAD_READY_TIMEOUT_MS ?? 900_000);
  let health: Response | undefined;
  while (Date.now() < readyDeadline) {
    try {
      const response = await fetch(`${endpoint}/health`);
      health = response;
      if (response.ok) {
        const status = await response.json() as { model_loaded?: boolean; phase?: string };
        if (status.model_loaded === true || status.phase === "ready") break;
        console.log(`[audit] waiting for model (${status.phase ?? "unknown"})`);
      }
    } catch {
      console.log("[audit] waiting for translation server");
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  if (!health?.ok) throw new Error(`MADLAD health check failed at ${endpoint}`);
  const finalHealth = await (await fetch(`${endpoint}/health`)).json() as { model_loaded?: boolean; phase?: string };
  if (finalHealth.model_loaded !== true && finalHealth.phase !== "ready") {
    throw new Error(`MADLAD model did not become ready before timeout (phase=${finalHealth.phase ?? "unknown"})`);
  }
  const selected = catalog.papers.filter((paper) => !onlyPaper || paper.id === onlyPaper);
  console.log(`[audit] selected=${selected.length}`);
  if (onlyPaper && selected.length === 0) throw new Error(`Unknown catalog paper: ${onlyPaper}`);
  const reportName = onlyPaper ? `translation-audit-${onlyPaper}` : "translation-audit";
  const reportDir = path.join(root, catalog.pdfDir, "reports");
  const checkpointPath = path.join(reportDir, `${reportName}.json`);
  const prior = resumeArg && fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as { papers?: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }> }
    : undefined;
  const papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }> = resumeArg
    ? (prior?.papers ?? []).filter((entry) => !entry.error)
    : [];
  // Only checkpoints that satisfy the current requested sample size are
  // complete. Partial rows must be retried rather than silently skipped;
  // transient server/model errors are retried after the endpoint is ready.
  const completedIds = new Set(papers
    .filter((entry) => !entry.error && entry.rows.length >= perPaperLimit)
    .map((entry) => entry.paper.id));
  if (resumeArg && completedIds.size > 0) console.log(`[audit] resuming; skipping ${completedIds.size} checkpointed paper(s)`);
  const saveCheckpoint = () => {
    const report = { createdAt: new Date().toISOString(), endpoint, papers, complete: papers.length === selected.length };
    fs.mkdirSync(reportDir, { recursive: true });
    const jsonPath = path.join(reportDir, `${reportName}.json`);
    fs.writeFileSync(`${jsonPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
    fs.renameSync(`${jsonPath}.tmp`, jsonPath);
    fs.writeFileSync(path.join(reportDir, `${reportName}.md`), markdownReport(report));
  };

  for (const paper of selected) {
    if (completedIds.has(paper.id)) continue;
    const previous = papers.find((entry) => entry.paper.id === paper.id);
    if (previous) papers.splice(papers.indexOf(previous), 1);
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (!fs.existsSync(pdfPath)) {
      papers.push({ paper, rows: previous?.rows ?? [], error: `PDF not cached: ${pdfPath}` });
      saveCheckpoint();
      continue;
    }
    try {
      const pages = await extractPdfPages(pdfPath);
      const extracted = extractQuietly(paper, pages);
      const sampled = sampleBlocks(extracted.blocks, perPaperLimit);
      // Mirror the import path: unsafe physical fragments are retained as
      // source before MADLAD is contacted. Translating every sampled block
      // made the audit itself manufacture outputs that production can never
      // show, and incorrectly attributed those fragment translations to the
      // model quality gate.
      const modelInputs = sampled
        .map((block, index) => ({
          index,
          source: compact(block.original ?? ""),
        }))
        .filter(({ source }) => shouldTranslateParagraph(source));
      const translated = await translate(modelInputs.map((entry) => entry.source));
      const resultBySampleIndex = new Map(
        modelInputs.map((entry, index) => [entry.index, translated[index]])
      );
      const rows = sampled.map((block, index): AuditRow => {
        const source = compact(block.original ?? "");
        const wouldSubmitToModel = shouldTranslateParagraph(source);
        const result = resultBySampleIndex.get(index);
        // Match the production path's deterministic, source-grounded
        // terminology pass. Per-paper LLM glossaries remain intentionally
        // excluded here because this audit must be reproducible offline.
        const sourceFallback = !wouldSubmitToModel || result?.text === source;
        const normalizedTranslation = result && !sourceFallback
          ? normalizeSourceGroundedTerminology(source, result.text)
          : undefined;
        const quality = normalizedTranslation ? evaluateJaTranslation(normalizedTranslation, source) : undefined;
        const wouldAcceptTranslation = sourceFallback ? false : normalizedTranslation ? isPlausibleJaTranslation(normalizedTranslation, source) : undefined;
        const readerVisibleFallback = !wouldAcceptTranslation;
        const partialSourceFallback = detectPartialSourceFallback(source, normalizedTranslation);
        const category = sourceCategory(block);
        return {
          paperId: paper.id,
          blockId: block.id,
          role: block.type,
          pageStart: block.pageStart,
          pageEnd: block.pageEnd,
          source,
          translation: normalizedTranslation,
          sourceFallback,
          readerVisibleFallback,
          partialSourceFallback: partialSourceFallback.partial,
          partialSourceFallbackReason: partialSourceFallback.reason,
          modelVersion: result?.model_version,
          inputTokens: result?.input_tokens,
          outputTokens: result?.output_tokens,
          translationTimeMs: result?.translation_time_ms,
          sourceInvariants: extractScientificInvariants(source).map((item) => item.value),
          quality,
          structuralWarnings: structuralWarnings(block),
          sourceCategory: category,
          sourceIntegrity: category === "damaged-extraction" ? "mixed-chrome" : structuralWarnings(block).length ? "structural-warning" : "clean",
          extractionProvenance: { pageStart: block.pageStart, pageEnd: block.pageEnd, bboxCount: block.boundingBoxes.length, extractionConfidence: block.extractionConfidence },
          fallbackStage: fallbackStage(wouldSubmitToModel, readerVisibleFallback),
          fallbackReason: fallbackReason(source, result, quality),
          wouldSubmitToModel,
          wouldAcceptTranslation,
        };
      });
      papers.push({ paper, rows });
      saveCheckpoint();
      console.log(`${paper.id}: ${rows.length} translation units (checkpoint saved)`);
    } catch (error) {
      papers.push({ paper, rows: previous?.rows ?? [], error: error instanceof Error ? error.message : String(error) });
      saveCheckpoint();
      console.error(`${paper.id}:`, error);
    }
  }
  saveCheckpoint();
  console.log(`wrote ${path.join(reportDir, `${reportName}.{json,md}`)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
