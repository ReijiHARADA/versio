/**
 * Run the production extraction and translation path on locally cached,
 * openly available real papers. PDFs and generated reports stay in
 * test-data/real-papers (gitignored); only the catalog and this evaluator are
 * committed.
 *
 * Usage:
 *   npx tsx scripts/benchmark-real-paper-translation.ts
 *   npx tsx scripts/benchmark-real-paper-translation.ts --paper ozchi-finger-specific-touch
 *   npx tsx scripts/benchmark-real-paper-translation.ts --papers thermal-earring,wear-scale --limit 12 --report-name translation-audit-v19-pilot
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
  extractTechnicalNameCandidates,
  hasAcronymExpansionDrift,
  hasExtremeTranslationCompression,
  hasDetachedNumericCitationRisk,
  missingTechnicalNameCandidates,
  isExpectedNonProseParagraph,
  isPlausibleJaTranslation,
  looksLikeBibliographyEntry,
  shouldTranslateParagraph,
  unsafeParagraphStructureReason,
  diagnoseIncompleteSource,
} from "../src/services/translation/quality.ts";
import { normalizeSourceGroundedTerminology } from "../src/services/llm/glossaryService.ts";
import { referenceSectionIds, shouldTranslateBlock } from "../src/services/import/policy.ts";
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
  | "section-heading"
  | "statistical-prose"
  | "reference-chrome"
  | "table-contamination"
  | "damaged-extraction";

type FallbackStage = "none" | "pre-model" | "post-model";

type ServerTranslation = {
  text: string;
  model_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  translation_time_ms: number;
  fallback_reason?: string | null;
  fallback_stage?: string | null;
  unit_fallback_indices?: number[] | null;
  partial_text?: string | null;
  partial_source_units?: string[] | null;
  partial_unit_texts?: string[] | null;
  translation_units?: string[] | null;
  error?: string;
};

type AuditRow = {
  /** Stable join key for audit-only candidate reports. */
  key: string;
  /** Identifies the benchmark invocation that actually produced this row. */
  benchmarkRunId?: string;
  paperId: string;
  blockId: string;
  role: PaperBlock["type"];
  translationStatus: PaperBlock["translationStatus"];
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
  technicalNameCandidates: string[];
  missingTechnicalNameCandidates: string[];
  detachedNumericCitationRisk: boolean;
  acronymExpansionDrift: boolean;
  extremeTranslationCompression: boolean;
  quality?: ReturnType<typeof evaluateJaTranslation>;
  structuralWarnings: string[];
  sourceCategory: SourceCategory;
  fallbackStage: FallbackStage;
  fallbackReason?: string;
  serverFallbackReason?: string | null;
  serverFallbackStage?: string | null;
  unitFallbackIndices?: number[] | null;
  partialText?: string | null;
  partialSourceUnits?: string[] | null;
  partialUnitTexts?: string[] | null;
  translationUnits?: string[] | null;
  serverError?: string;
  wouldSubmitToModel: boolean;
  wouldAcceptTranslation?: boolean;
  sourceIntegrity: "clean" | "mixed-chrome" | "structural-warning";
  sourceCompleteness: { incomplete: boolean; reason?: string };
  extractionProvenance: { pageStart: number; pageEnd: number; bboxCount: number; extractionConfidence: number | null };
};

type BenchmarkServerStatus = {
  available?: boolean;
  model_loaded?: boolean;
  model_name?: string;
  model_version?: string;
  device?: string;
  phase?: string;
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };
const args = process.argv.slice(2);
const paperArg = args.indexOf("--paper");
const onlyPaper = paperArg >= 0 ? args[paperArg + 1] : undefined;
const papersArg = args.indexOf("--papers");
const requestedPaperIds = papersArg >= 0
  ? (args[papersArg + 1] ?? "").split(",").map((id) => id.trim()).filter(Boolean)
  : [];
const limitArg = args.indexOf("--limit");
const perPaperLimit = limitArg >= 0 ? Number(args[limitArg + 1]) : 8;
const blockQueryArg = args.indexOf("--block-query");
const blockQuery = blockQueryArg >= 0 ? args[blockQueryArg + 1]?.trim() : undefined;
const serialArg = args.includes("--serial");
const resumeArg = args.includes("--resume");
const cachedOnlyArg = args.includes("--cached-only");
const reportNameArg = args.indexOf("--report-name");
const requestedReportName = reportNameArg >= 0 ? args[reportNameArg + 1] : undefined;
const endpoint = process.env.MADLAD_BENCH_URL ?? "http://127.0.0.1:8765";
const tokenFileArg = args.indexOf("--token-file");
const tokenFile = tokenFileArg >= 0 ? args[tokenFileArg + 1] : undefined;
const serverToken = (process.env.MADLAD_SERVER_TOKEN?.trim() ||
  (tokenFile ? fs.readFileSync(tokenFile, "utf8").trim() : "")) || undefined;
const requestTimeoutMs = Number(process.env.MADLAD_BENCH_REQUEST_TIMEOUT_MS ?? 180_000);
const maxRequestAttempts = Number(process.env.MADLAD_BENCH_MAX_ATTEMPTS ?? 3);
// MPS generation is single-device work; unbounded Promise.all fan-out can
// leave several requests waiting behind one generate() call indefinitely.
// Keep benchmark execution bounded and reproducible without changing the
// production server's micro-batch behavior. Set MADLAD_BENCH_CONCURRENCY=1
// for fully serial diagnostics.
const requestConcurrency = Math.max(1, Number(process.env.MADLAD_BENCH_CONCURRENCY ?? 2));
const dryRun = process.argv.includes("--dry-run");

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function structuralWarnings(block: PaperBlock): string[] {
  const text = compact(block.original ?? "");
  const warnings: string[] = [];
  if (block.metadata.translationInputWarning) warnings.push(String(block.metadata.translationInputWarning));
  if (block.metadata.tableSourceFallback === true || block.metadata.role === "table") {
    warnings.push("table-like text retained source-only by production policy");
  }
  if (block.pageStart !== block.pageEnd) warnings.push("cross-page logical block");
  if (/^(?:fig(?:ure)?\.?|table)\s+\d+/i.test(text)) warnings.push("caption-shaped text");
  // A short label followed by a dash and a sentence is often a section/card
  // label that was merged into the body block by PDF extraction (for example
  // `Context - ...`). Keep this as diagnostic evidence rather than silently
  // treating the whole block as clean prose.
  if (/^[A-Za-z][A-Za-z ]{1,24}\s*[-–—:]\s+[A-Z]/.test(text) && !/\b(?:Figure|Table)\s+\d+/i.test(text.slice(0, 40))) {
    warnings.push("label-prefix");
  }
  // Short numbered or title-like section labels are structural units, even
  // when a PDF resolver exposes them as paragraphs. Keep them out of the
  // ordinary-body model denominator; this is audit attribution only.
  if (
    text.length <= 96 &&
    (/^\d+(?:\.\d+)+\s+\S/.test(text) ||
      /^[A-Z][A-Za-z0-9'’:-]*(?:\s+[A-Z][A-Za-z0-9'’:-]*){0,5}\.?$/.test(text)) &&
    !/[!?;,]/.test(text)
  ) warnings.push("section-heading-shaped text");
  if (
    /^\d+(?:\.\d+)+\s+[^.]{1,80}\.\s+[A-Z]/.test(text) ||
    /^(?:[A-Z][A-Za-z0-9'’:-]*\s*){1,4}\.\s+[A-Z]/.test(text)
  ) warnings.push("section-label-prefix");
  if (/^(?:[A-Z][A-Za-z]{1,24}\s+\d+[A-Za-z]?\s+){2,}/.test(text)) {
    warnings.push("repeated numbered chart/table labels");
  }
  if (/\b(?:n\s*=|p\s*[<=>]|[FTZχ²]\s*\()/i.test(text)) warnings.push("scientific/statistical prose");
  // PDF list bullets are often emitted as en/em dashes or parenthesized
  // letters. Treat these as structural boundaries so extracted list fragments
  // do not inflate the ordinary-prose translation denominator.
  if (/^(?:[-–—•‣∙]|\([a-z]\)|\d+[.)])\s+/i.test(text)) warnings.push("list-item boundary");
  if (/\b(?:and|or|but|to|of|for|where|which|that)\s*$/i.test(text)) warnings.push("ends like continuation");
  if (/^(?:and|or|but|to|of|for|where|which|that|one|exception)\b/i.test(text)) warnings.push("starts like continuation");
  return warnings;
}

function sourceCategory(block: PaperBlock): SourceCategory {
  const text = compact(block.original ?? "");
  const warnings = structuralWarnings(block);
  if (block.metadata.tableSourceFallback === true || block.metadata.role === "table") return "table-contamination";
  if (warnings.includes("repeated numbered chart/table labels")) return "table-contamination";
  const chromeSignals = [
    /creativecommons|copyright\s+\d{4}|all rights reserved/i,
    /doi\s*:\s*10\.\d{4,9}\//i,
    /isbn\s*\d|acm\s+\d{4}/i,
    /licensed under a creative commons/i,
  ].filter((pattern) => pattern.test(text)).length;
  // Affiliation lines can be emitted as paragraphs when a PDF loses its
  // author/affiliation role boundary. Keep them out of the ordinary-body
  // denominator; their correct fix belongs to extraction/resolver.
  if (/^\d+\s+[^.!?]{0,180}\b(?:University|Institute|College|Department|School)\b/i.test(text)) {
    return "reference-chrome";
  }
  if (chromeSignals > 0 && /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(text)) return "damaged-extraction";
  if (warnings.includes("caption-shaped text")) return "caption";
  if (warnings.includes("label-prefix")) return "damaged-extraction";
  if (warnings.includes("section-heading-shaped text") || warnings.includes("section-label-prefix")) return "section-heading";
  // A participant-count token such as `N = 142` can appear in an otherwise
  // ordinary abstract. Do not remove the whole unit from the ordinary-prose
  // denominator unless it contains results evidence (test statistic, p-value,
  // confidence interval, or estimate), not just a sample size.
  const statisticalResultEvidence = /\bp\s*[<=>≤≥]\s*\.?\d|\b[FTZχΧ]\s*\(|\b(?:CI|confidence interval|odds ratio|OR|eta|η)\s*(?:=|:)/i.test(text);
  if (warnings.includes("scientific/statistical prose") && statisticalResultEvidence) return "statistical-prose";
  if (warnings.includes("list-item boundary")) return "list";
  // A wrapped acknowledgements section can arrive as a paragraph whose first
  // line contains the section label. Keep it out of the ordinary-body
  // denominator so protection failures in grant/author names do not distort
  // model-quality measurements.
  if (/^acknowledg(?:e)?ments?\b/i.test(text)) return "reference-chrome";
  // A lowercase-leading unit is normally a continuation fragment in the
  // extracted paper stream. Do not let it inflate the ordinary-body quality
  // denominator when an older report omitted the structural warning.
  if (/^[a-z]/.test(text)) return "damaged-extraction";
  if (looksLikeBibliographyEntry(text) || isExpectedNonProseParagraph(text)) return "reference-chrome";
  if (
    warnings.includes("starts like continuation")
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
  if (result?.error) return `server request failed: ${result.error}`;
  if (result?.text === source) {
    return result.fallback_reason
      ? `server returned source fallback: ${result.fallback_reason}`
      : "server returned source fallback (reason unavailable)";
  }
  if (quality?.reasons.length) return quality.reasons.join("; ");
  return undefined;
}

function sampleBlocks(blocks: PaperBlock[], max: number): PaperBlock[] {
  const eligible = blocks.filter((block) => {
    const text = compact(block.original ?? "");
    // Untagged PDFs often expose the references section as ordinary paragraphs.
    // Those citation lists are not ordinary-body translation units and can be
    // several thousand characters long, which both distorts the audit and can
    // monopolize a single-device generation request. Keep them out even when
    // section resolution failed to identify the references heading.
    const referenceLike =
      /^\s*\[\d{1,3}\]/.test(text) &&
      ((text.match(/\b(?:19|20)\d{2}\b/g)?.length ?? 0) >= 2 ||
        (text.match(/\b(?:doi|https?:\/\/|et al\.)\b/gi)?.length ?? 0) >= 2);
    return block.type === "paragraph" && !referenceLike && text.length >= 90 && text.length <= 3_200;
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
    for (let attempt = 0; attempt < maxRequestAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${endpoint}/translate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(serverToken ? { "X-Paper-Reader-Token": serverToken } : {}),
          },
          body: JSON.stringify({ text, source_language: "en", target_language: "ja" }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = await response.text();
          throw Object.assign(new Error(`translation server ${response.status}: ${detail}`), {
            status: response.status,
          });
        }
        return (await response.json()) as ServerTranslation;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number }).status;
        if (attempt + 1 < maxRequestAttempts) {
          // A ready health response can race the final warmup transition;
          // retry transient 503s long enough for the model lifecycle to settle.
          await new Promise((resolve) => setTimeout(resolve, status === 503 ? 3_000 : 1_000));
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    return {
      text,
      model_version: "",
      input_tokens: null,
      output_tokens: null,
      translation_time_ms: 0,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    };
  };
  if (serialArg) {
    const results: ServerTranslation[] = [];
    for (const text of texts) results.push(await one(text));
    return results;
  }
  const results: ServerTranslation[] = new Array(texts.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= texts.length) return;
      results[index] = await one(texts[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(requestConcurrency, texts.length) }, worker));
  return results;
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
  serverStatus?: BenchmarkServerStatus | null;
  papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }>;
}): string {
  const completed = report.papers.flatMap((entry) => entry.rows).filter((row) => row.translation);
  const fallbacks = report.papers.flatMap((entry) => entry.rows).filter((row) => row.readerVisibleFallback ?? row.sourceFallback);
  // Pending/failed rows are excluded from the reader-visible denominator. They
  // are reported separately so an interrupted run cannot look artificially
  // safe or unsafe by changing the denominator.
  const evaluable = report.papers.flatMap((entry) => entry.rows).filter((row) =>
    Boolean(row.translation || row.readerVisibleFallback || row.sourceFallback),
  );
  const partialSourceFallbacks = completed.filter((row) => row.partialSourceFallback);
  const fullyTranslatedAccepts = completed.filter((row) => row.wouldAcceptTranslation && !row.partialSourceFallback);
  const failed = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.translation && !(row.readerVisibleFallback ?? row.sourceFallback));
  const lowQuality = completed.filter((row) => (row.quality?.score ?? 1) < 0.8);
  const rejected = completed.filter((row) => row.wouldAcceptTranslation === false);
  const blockedBeforeModel = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.wouldSubmitToModel);
  const warnings = completed.filter((row) => row.structuralWarnings.length > 0);
  const rows = report.papers.flatMap((entry) => entry.rows);
  const nonEvaluable = rows.filter((row) => !row.translation && !(row.readerVisibleFallback ?? row.sourceFallback));
  const ordinaryBody = evaluable.filter((row) => row.sourceCategory === "ordinary-body-prose");
  const ordinaryBodyFallbacks = ordinaryBody.filter((row) => row.readerVisibleFallback ?? row.sourceFallback);
  const categories = [...new Set(rows.map((row) => row.sourceCategory))].sort();
  const categoryLines = categories.flatMap((category) => {
    const scoped = rows.filter((row) => row.sourceCategory === category);
    const scopedEvaluable = scoped.filter((row) => row.translation || row.readerVisibleFallback || row.sourceFallback);
    const visibleFallbacks = scoped.filter((row) => row.readerVisibleFallback ?? row.sourceFallback).length;
    const partials = scoped.filter((row) => row.partialSourceFallback).length;
    const fullyTranslated = scoped.filter((row) => row.fallbackStage === "none" && !row.partialSourceFallback).length;
    return [
      `- ${category}: ${scoped.length} rows (${scopedEvaluable.length} evaluable); accepts ${scoped.filter((row) => row.fallbackStage === "none").length}; fully translated accepts ${fullyTranslated}; partial source fallbacks ${partials}; fallbacks ${visibleFallbacks} (${(visibleFallbacks / Math.max(1, scopedEvaluable.length) * 100).toFixed(1)}% of evaluable)`,
    ];
  });
  const lines = [
    "# Real-paper translation audit (local, uncommitted)",
    "",
    `- Generated: ${report.createdAt}`,
    `- Endpoint: ${report.endpoint}`,
    `- Server status at start: ${report.serverStatus?.model_version ?? "unknown"} (${report.serverStatus?.device ?? "unknown"}; phase=${report.serverStatus?.phase ?? "unknown"})`,
    `- Papers evaluated: ${report.papers.filter((entry) => !entry.error).length}/${report.papers.length}`,
    `- Evaluable units: ${evaluable.length}; model responses: ${completed.length}; original fallbacks: ${fallbacks.length} (${(fallbacks.length / Math.max(1, evaluable.length) * 100).toFixed(1)}% of evaluable); partial source fallbacks inside accepted output: ${partialSourceFallbacks.length}; fully translated accepts: ${fullyTranslatedAccepts.length}; failed/pending requests: ${nonEvaluable.length}`,
    `- Ordinary-body fallback: ${ordinaryBodyFallbacks.length}/${ordinaryBody.length} (${(ordinaryBodyFallbacks.length / Math.max(1, ordinaryBody.length) * 100).toFixed(1)}% of evaluable ordinary-body units)`,
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
        `- Role: ${row.role}; quality: ${row.quality?.score ?? "request failed"}; production decision: ${row.wouldSubmitToModel ? (row.wouldAcceptTranslation ? "accept" : "original fallback after quality gate") : "original fallback before model"}; warnings: ${(row.structuralWarnings ?? []).join(", ") || "none"}`,
        `- Source category: ${row.sourceCategory}; fallback stage: ${row.fallbackStage}; fallback reason: ${row.fallbackReason ?? "none"}; server fallback: ${row.serverFallbackStage ? `${row.serverFallbackStage} (${row.serverFallbackReason ?? "reason unavailable"})` : "none"}`,
        `- Invariants: ${(row.sourceInvariants ?? []).join(", ") || "none"}`,
        `- Technical-name audit: ${(row.technicalNameCandidates ?? []).join(", ") || "none"}; missing from output: ${(row.missingTechnicalNameCandidates ?? []).join(", ") || "none"}`,
        `- Citation-placement audit: ${row.detachedNumericCitationRisk ? "risk" : "none"}`,
        `- Acronym-expansion audit: ${row.acronymExpansionDrift ? "risk" : "none"}`,
        `- Compression audit: ${row.extremeTranslationCompression ? "risk" : "none"}`,
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
  if (onlyPaper && requestedPaperIds.length > 0) throw new Error("Use either --paper or --papers, not both");
  if (papersArg >= 0 && requestedPaperIds.length === 0) throw new Error("--papers requires a comma-separated paper id list");
  if (requestedReportName && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(requestedReportName)) {
    throw new Error("--report-name must be a simple filename stem (letters, digits, dot, underscore, hyphen)");
  }
  if (reportNameArg >= 0 && !requestedReportName) throw new Error("--report-name requires a filename stem");
  const benchmarkRunId = new Date().toISOString().replace(/[:.]/g, "-");
  const readyDeadline = Date.now() + Number(process.env.MADLAD_READY_TIMEOUT_MS ?? 900_000);
  let health: Response | undefined;
  while (!dryRun && Date.now() < readyDeadline) {
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
  if (!dryRun) {
    if (!health?.ok) throw new Error(`MADLAD health check failed at ${endpoint}`);
    const finalHealth = await (await fetch(`${endpoint}/health`)).json() as { model_loaded?: boolean; phase?: string };
    if (finalHealth.model_loaded !== true && finalHealth.phase !== "ready") {
      throw new Error(`MADLAD model did not become ready before timeout (phase=${finalHealth.phase ?? "unknown"})`);
    }
  }
  let serverStatus: BenchmarkServerStatus | null = null;
  try {
    if (dryRun) throw new Error("dry-run: server metadata skipped");
    const response = await fetch(`${endpoint}/status`);
    if (response.ok) serverStatus = await response.json() as BenchmarkServerStatus;
  } catch {
    // Health is authoritative for readiness; status is audit metadata only.
  }
  const requested = catalog.papers.filter((paper) =>
    onlyPaper ? paper.id === onlyPaper : requestedPaperIds.length === 0 || requestedPaperIds.includes(paper.id)
  );
  const unknownPaperIds = requestedPaperIds.filter((id) => !catalog.papers.some((paper) => paper.id === id));
  if (unknownPaperIds.length > 0) throw new Error(`Unknown catalog paper(s): ${unknownPaperIds.join(", ")}`);
  const excludedMissingPdf = cachedOnlyArg
    ? requested.filter((paper) => !fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)))
    : [];
  const selected = cachedOnlyArg
    ? requested.filter((paper) => fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)))
    : requested;
  console.log(`[audit] selected=${selected.length}${cachedOnlyArg ? ` cached of ${requested.length}` : ""}`);
  if (onlyPaper && selected.length === 0) throw new Error(`Unknown catalog paper: ${onlyPaper}`);
  if (cachedOnlyArg && selected.length === 0) throw new Error("No cached PDFs are eligible for this benchmark selection");
  const reportName = requestedReportName ?? (onlyPaper ? `translation-audit-${onlyPaper}` : "translation-audit");
  const reportDir = path.join(root, catalog.pdfDir, "reports");
  const checkpointPath = path.join(reportDir, `${reportName}.json`);
  const prior = resumeArg && fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as { runId?: string; papers?: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }> }
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
    const selectedIds = new Set(selected.map((paper) => paper.id));
    const entriesById = new Map(papers.map((entry) => [entry.paper.id, entry]));
    const complete = selected.every((paper) => {
      const entry = entriesById.get(paper.id);
      return Boolean(entry && !entry.error && selectedIds.has(entry.paper.id));
    });
    const report = {
      createdAt: new Date().toISOString(),
      runId: benchmarkRunId,
      resumedFromRunId: prior?.runId,
      endpoint,
      serverStatus,
      sampleLimitPerPaper: perPaperLimit,
      blockQuery,
      catalogPaperCount: catalog.papers.length,
      cachedOnly: cachedOnlyArg,
      excludedMissingPdf: excludedMissingPdf.map((paper) => ({ id: paper.id, filename: paper.filename })),
      selectedPaperIds: selected.map((paper) => paper.id),
      papers,
      complete,
    };
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
      const sampled = blockQuery
        ? extracted.blocks.filter((block) =>
            block.type === "paragraph" && compact(block.original ?? "").includes(blockQuery)
          ).slice(0, perPaperLimit)
        : sampleBlocks(extracted.blocks, perPaperLimit);
      if (blockQuery && sampled.length === 0) {
        throw new Error(`No paragraph matched --block-query ${JSON.stringify(blockQuery)}`);
      }
      const refSectionIds = referenceSectionIds(extracted.sections);
      // Mirror the import path: unsafe physical fragments are retained as
      // source before MADLAD is contacted. Translating every sampled block
      // made the audit itself manufacture outputs that production can never
      // show, and incorrectly attributed those fragment translations to the
      // model quality gate.
      const modelInputs = sampled
        .map((block, index) => ({
          index,
          source: compact(block.original ?? ""),
          block,
        }))
        .filter(({ block, source }) => shouldTranslateBlock(block, refSectionIds) && shouldTranslateParagraph(source) && !block.metadata.translationInputWarning);
      const translated = dryRun ? [] : await translate(modelInputs.map((entry) => entry.source));
      const resultBySampleIndex = new Map(
        modelInputs.map((entry, index) => [entry.index, translated[index]])
      );
      const rows = sampled.map((block, index): AuditRow => {
        const source = compact(block.original ?? "");
        const wouldSubmitToModel = shouldTranslateBlock(block, refSectionIds) && shouldTranslateParagraph(source) && !block.metadata.translationInputWarning;
        const result = resultBySampleIndex.get(index);
        const structurallySkipped = block.translationStatus === "skipped";
        // Match the production path's deterministic, source-grounded
        // terminology pass. Per-paper LLM glossaries remain intentionally
        // excluded here because this audit must be reproducible offline.
        // A server fallback may still carry an assembled partial text for
        // audit diagnostics. It is never a completed reader translation:
        // classify it as visible fallback before running the client gate so
        // the benchmark cannot overstate quality by accepting partial units.
        const serverFallback = Boolean(result?.fallback_stage && result.fallback_stage !== "none");
        const sourceFallback = structurallySkipped || !wouldSubmitToModel || result?.text === source || serverFallback;
        const normalizedTranslation = result && !sourceFallback
          ? normalizeSourceGroundedTerminology(source, result.text)
          : undefined;
        const quality = normalizedTranslation ? evaluateJaTranslation(normalizedTranslation, source) : undefined;
        const wouldAcceptTranslation = sourceFallback ? false : normalizedTranslation ? isPlausibleJaTranslation(normalizedTranslation, source) : undefined;
        const readerVisibleFallback = !wouldAcceptTranslation;
        const partialSourceFallback = detectPartialSourceFallback(source, normalizedTranslation);
        const category = sourceCategory(block);
        const sourceCompleteness = diagnoseIncompleteSource(source);
        return {
          key: `${paper.id}:${block.id}`,
          benchmarkRunId,
          paperId: paper.id,
          blockId: block.id,
          role: block.type,
          translationStatus: block.translationStatus,
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
          technicalNameCandidates: extractTechnicalNameCandidates(source),
          missingTechnicalNameCandidates: normalizedTranslation
            ? missingTechnicalNameCandidates(source, normalizedTranslation)
            : [],
          detachedNumericCitationRisk: normalizedTranslation
            ? hasDetachedNumericCitationRisk(source, normalizedTranslation)
            : false,
          acronymExpansionDrift: normalizedTranslation
            ? hasAcronymExpansionDrift(source, normalizedTranslation)
            : false,
          extremeTranslationCompression: normalizedTranslation
            ? hasExtremeTranslationCompression(source, normalizedTranslation)
            : false,
          quality,
          structuralWarnings: structuralWarnings(block),
          sourceCategory: category,
          sourceIntegrity: category === "damaged-extraction" ? "mixed-chrome" : structuralWarnings(block).length ? "structural-warning" : "clean",
          sourceCompleteness,
          extractionProvenance: { pageStart: block.pageStart, pageEnd: block.pageEnd, bboxCount: block.boundingBoxes.length, extractionConfidence: block.extractionConfidence },
          fallbackStage: fallbackStage(wouldSubmitToModel, readerVisibleFallback),
          fallbackReason: structurallySkipped
            ? String(block.metadata.translationInputWarning ?? "structural skip; preserved in source")
            : fallbackReason(source, result, quality),
          serverFallbackReason: result?.fallback_reason,
          serverFallbackStage: result?.fallback_stage,
          unitFallbackIndices: result?.unit_fallback_indices,
          partialText: result?.partial_text,
          partialSourceUnits: result?.partial_source_units,
          partialUnitTexts: result?.partial_unit_texts,
          translationUnits: result?.translation_units,
          serverError: result?.error,
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
