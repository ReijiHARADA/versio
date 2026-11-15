/**
 * Consolidate existing Versio evaluation artifacts into a presentation-
 * safe report. This script never invokes extraction or translation: it is a
 * deterministic aggregation of explicitly named local benchmark outputs.
 *
 * Usage:
 *   npm run report:reliability-performance-evaluation
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reportDir = path.join(root, "test-data/real-papers/reports");
const docsDir = path.join(root, "docs");
const figureDir = path.join(docsDir, "evaluation-figures");

const input = {
  mobile: path.join(reportDir, "mobile-epub-storage-latest.json"),
  development: path.join(root, "test-data/extraction-evaluation/current-development-regression.json"),
  validation: path.join(root, "test-data/extraction-evaluation/current-validation-health.json"),
  translationCurrent: path.join(reportDir, "translation-audit-current-v6-stratified-v1.json"),
  translationHistorical: path.join(reportDir, "translation-v8-reviewed-summary.json"),
  translationFreshManual: path.join(reportDir, "translation-fresh-manual-metrics-v1.json"),
  extractionBaseline: path.join(reportDir, "extraction-baseline-latest.json"),
} as const;

for (const file of Object.values(input)) {
  if (!fs.existsSync(file)) throw new Error(`Required evaluation input is missing: ${path.relative(root, file)}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

type MobileRow = {
  relativePath: string;
  corpus: string;
  sha256: string;
  status: "success" | "failed" | "duplicate";
  duplicateOf?: string;
  error?: string;
  sourceBytes: number;
  epubBytes?: number;
  epubUncompressedBytes?: number;
  epubAssetBytes?: number;
  epubAssetCount?: number;
  packageAssetBytes?: number;
  expectedImageAssetCount?: number;
  missingImageAssetCount?: number;
  figureBlocks?: number;
  tableBlocks?: number;
  equationBlocks?: number;
  textBlocks?: number;
  pageCount?: number;
  elapsedMs?: number;
  contentProfile?: string;
};

type TranslationRow = {
  key: string;
  paperId: string;
  blockId: string;
  pageStart: number;
  pageEnd: number;
  source: string;
  translation?: string;
  sourceCategory: string;
  fallbackStage: string;
  sourceFallback?: boolean;
  readerVisibleFallback?: boolean;
  partialSourceFallback?: boolean;
  wouldSubmitToModel?: boolean;
  wouldAcceptTranslation?: boolean;
  translationTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  structuralWarnings?: string[];
  quality?: { score?: number; reasons?: string[] } | null;
  sourceCompleteness?: { incomplete?: boolean; reason?: string };
  missingTechnicalNameCandidates?: string[];
  detachedNumericCitationRisk?: boolean;
  acronymExpansionDrift?: boolean;
  extremeTranslationCompression?: boolean;
};

type TranslationPaper = { paper: { id: string; title: string; disciplines?: string[] }; rows: TranslationRow[]; error?: string };

const mobile = readJson<{ generatedAt: string; benchmark: Record<string, unknown>; inventory: Record<string, unknown>; rows: MobileRow[] }>(input.mobile);
const development = readJson<{ generatedAt: string; selection: { requested: number; completed: number; timeoutMs: number }; summary: Record<string, { value: number | null; evaluatedDocuments: number }>; failures: unknown[]; invariantFailures: unknown[] }>(input.development);
const validation = readJson<{ generatedAt: string; selection: { requested: number; completed: number; timeoutMs: number }; failures: unknown[]; unhealthy: unknown[]; triage: unknown[] }>(input.validation);
const translationCurrent = readJson<{ createdAt: string; runId: string; serverStatus?: { model_name?: string; model_version?: string; device?: string; phase?: string }; selectedPaperIds: string[]; sampleLimitPerPaper: number; complete: boolean; papers: TranslationPaper[] }>(input.translationCurrent);
const translationHistorical = readJson<{ generatedAt: string; modelVersion: string; papers: number; reviewedRows: number; accepted: number; readerVisibleFallback: number; ordinaryBodyRows: number; ordinaryBodyFallback: number; unsafeFalseAcceptSeverityGe2: number; unsafeFalseAcceptRateAmongAccepted: number }>(input.translationHistorical);
const translationFreshManual = readJson<{ reviewedRows: number; acceptedReviewedRows: number; translationUnsafeFalseAcceptRows: number; translationUnsafeFalseAcceptRate: number; causeCounts: Record<string, number>; notes: string[] }>(input.translationFreshManual);
const extractionBaseline = readJson<{ generatedAt: string; summary: Record<string, { evaluated: number; passed?: number; rate?: number; mean?: number; min?: number }> }>(input.extractionBaseline);

const successRows = mobile.rows.filter((row) => row.status === "success");
const failedRows = mobile.rows.filter((row) => row.status === "failed");
const currentRows = translationCurrent.papers.flatMap((paper) => paper.rows);
const currentModelResponses = currentRows.filter((row) => typeof row.translationTimeMs === "number" && row.translationTimeMs > 0);
const currentFallbacks = currentRows.filter((row) => row.readerVisibleFallback === true || row.sourceFallback === true);
const currentOrdinary = currentRows.filter((row) => row.sourceCategory === "ordinary-body-prose");
const currentPreModel = currentRows.filter((row) => row.fallbackStage === "pre-model");
const currentPostModel = currentRows.filter((row) => row.fallbackStage === "post-model");
const currentAccepted = currentRows.filter((row) => row.wouldAcceptTranslation === true && !row.partialSourceFallback);

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function mean(values: number[]): number | null { return values.length ? sum(values) / values.length : null; }
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}
function ratio(numerator: number, denominator: number): number | null { return denominator ? numerator / denominator : null; }
function percent(value: number | null, digits = 1): string { return value === null ? "N/A" : `${(value * 100).toFixed(digits)}%`; }
function mib(bytes: number): string { return (bytes / 1024 / 1024).toFixed(2); }
function seconds(milliseconds: number | null): string { return milliseconds === null ? "N/A" : (milliseconds / 1000).toFixed(2); }

/** Wilson score interval, two-sided 95%, without a normal-approximation shortcut. */
function wilson(successes: number, total: number): { low: number; high: number } | null {
  if (!total) return null;
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (p + z ** 2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}
function interval(successes: number, total: number): string {
  const result = wilson(successes, total);
  return result ? `${percent(result.low)}–${percent(result.high)}` : "N/A";
}
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function writeCsv(file: string, rows: Array<Record<string, unknown>>): void {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  fs.writeFileSync(file, `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`);
}
function escapeXml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char); }
function barSvg(title: string, subtitle: string, items: Array<{ label: string; value: number; annotation: string; color?: string }>, max = 100, unit = "%"): string {
  const width = 1000; const left = 280; const top = 120; const row = 72; const chartWidth = 600; const height = top + items.length * row + 70;
  const ticks = unit === "s" ? [0, max / 4, max / 2, max * 3 / 4, max] : [0, 25, 50, 75, 100];
  const grid = ticks.map((tick) => {
    const label = unit === "s" ? `${tick.toFixed(1)} ${unit}` : `${tick}${unit}`;
    return `<line x1="${left + chartWidth * tick / max}" y1="${top - 24}" x2="${left + chartWidth * tick / max}" y2="${height - 48}" stroke="#d9e0e8"/><text x="${left + chartWidth * tick / max}" y="${top - 32}" text-anchor="middle" class="tick">${label}</text>`;
  }).join("");
  const bars = items.map((item, index) => {
    const y = top + index * row;
    const widthValue = Math.max(0, Math.min(chartWidth, item.value / max * chartWidth));
    return `<text x="${left - 18}" y="${y + 25}" text-anchor="end" class="label">${escapeXml(item.label)}</text><rect x="${left}" y="${y}" width="${widthValue}" height="32" rx="5" fill="${item.color ?? "#2463a6"}"/><text x="${left + widthValue + 10}" y="${y + 23}" class="value">${escapeXml(item.annotation)}</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(title)}</title><desc id="desc">${escapeXml(subtitle)}</desc><style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#17212b}.title{font-size:25px;font-weight:700}.subtitle{font-size:15px;fill:#506273}.label{font-size:16px}.tick{font-size:13px;fill:#506273}.value{font-size:15px;font-weight:600}</style><rect width="100%" height="100%" fill="white"/><text x="40" y="44" class="title">${escapeXml(title)}</text><text x="40" y="72" class="subtitle">${escapeXml(subtitle)}</text>${grid}${bars}</svg>`;
}

const sourceBytes = sum(successRows.map((row) => row.sourceBytes));
const epubBytes = sum(successRows.map((row) => row.epubBytes ?? 0));
const payloadBytes = sum(successRows.map((row) => row.epubUncompressedBytes ?? 0));
const reductions = successRows.map((row) => 1 - (row.epubBytes ?? 0) / row.sourceBytes);
const profileStats = [...Map.groupBy(successRows, (row) => row.contentProfile ?? "unclassified")]
  .map(([profile, rows]) => ({
    profile,
    papers: rows.length,
    weightedReduction: 1 - sum(rows.map((row) => row.epubBytes ?? 0)) / sum(rows.map((row) => row.sourceBytes)),
    meanReduction: mean(rows.map((row) => 1 - (row.epubBytes ?? 0) / row.sourceBytes)),
    medianReduction: median(rows.map((row) => 1 - (row.epubBytes ?? 0) / row.sourceBytes)),
    increased: rows.filter((row) => (row.epubBytes ?? 0) >= row.sourceBytes).length,
  }))
  .sort((a, b) => a.profile.localeCompare(b.profile));
const pageBins = [[1, 5, "1–5"], [6, 15, "6–15"], [16, 30, "16–30"], [31, Infinity, "31+"]] as const;
const pageStats = pageBins.map(([minimum, maximum, label]) => {
  const rows = successRows.filter((row) => (row.pageCount ?? 0) >= minimum && (row.pageCount ?? 0) <= maximum);
  return { label, papers: rows.length, medianElapsedMs: median(rows.map((row) => row.elapsedMs ?? 0)), meanElapsedMs: mean(rows.map((row) => row.elapsedMs ?? 0)) };
});
const failureGroups = [...Map.groupBy(failedRows, (row) => {
  const error = row.error ?? "unknown error";
  if (error.includes("Target crashed")) return "Chromium target crashed";
  if (error.includes("Execution context was destroyed")) return "Execution context destroyed during navigation";
  return error;
})]
  .map(([reason, rows]) => ({ reason, papers: rows.length }));
const assets = {
  epubAssetBytes: sum(successRows.map((row) => row.epubAssetBytes ?? 0)),
  epubAssetCount: sum(successRows.map((row) => row.epubAssetCount ?? 0)),
  expectedImageAssets: sum(successRows.map((row) => row.expectedImageAssetCount ?? 0)),
  missingImageAssets: sum(successRows.map((row) => row.missingImageAssetCount ?? 0)),
  figureBlocks: sum(successRows.map((row) => row.figureBlocks ?? 0)),
  tableBlocks: sum(successRows.map((row) => row.tableBlocks ?? 0)),
  equationBlocks: sum(successRows.map((row) => row.equationBlocks ?? 0)),
};
const currentTiming = currentModelResponses.map((row) => row.translationTimeMs as number);

const summary = {
  generatedAt: new Date().toISOString(),
  code: { gitHead: process.env.GIT_HEAD ?? "obtain with git rev-parse HEAD", workingTree: "This generator does not establish cleanliness; see report." },
  inputs: Object.fromEntries(Object.entries(input).map(([name, file]) => [name, path.relative(root, file)])),
  epub: {
    inventory: mobile.inventory,
    benchmark: mobile.benchmark,
    uniquePdfs: successRows.length + failedRows.length,
    success: { count: successRows.length, rate: ratio(successRows.length, successRows.length + failedRows.length), ci95Wilson: wilson(successRows.length, successRows.length + failedRows.length) },
    failures: failedRows.map((row) => ({ relativePath: row.relativePath, error: row.error })),
    bytes: { sourceBytes, epubBytes, uncompressedPayloadBytes: payloadBytes, weightedReduction: 1 - epubBytes / sourceBytes, meanReduction: mean(reductions), medianReduction: median(reductions) },
    profileStats, pageStats, assets,
    elapsedMs: { mean: mean(successRows.map((row) => row.elapsedMs ?? 0)), median: median(successRows.map((row) => row.elapsedMs ?? 0)), p95: percentile(successRows.map((row) => row.elapsedMs ?? 0), 0.95), min: Math.min(...successRows.map((row) => row.elapsedMs ?? 0)), max: Math.max(...successRows.map((row) => row.elapsedMs ?? 0)) },
  },
  extraction: { development, validation, historicalBaseline: extractionBaseline },
  translation: {
    current: {
      runId: translationCurrent.runId,
      createdAt: translationCurrent.createdAt,
      model: translationCurrent.serverStatus,
      papers: translationCurrent.papers.length,
      rows: currentRows.length,
      modelResponses: currentModelResponses.length,
      fullyTranslatedAccepts: currentAccepted.length,
      readerVisibleFallbacks: currentFallbacks.length,
      preModelFallbacks: currentPreModel.length,
      postModelFallbacks: currentPostModel.length,
      ordinaryRows: currentOrdinary.length,
      ordinaryFallbacks: currentOrdinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length,
      timingMs: { mean: mean(currentTiming), median: median(currentTiming), min: Math.min(...currentTiming), max: Math.max(...currentTiming) },
    },
    historicalManual: translationHistorical,
    freshManualPartial: translationFreshManual,
  },
};

const csvRows: Array<Record<string, unknown>> = [
  ...mobile.rows.map((row) => ({
    record_type: "mobile_epub", paper_id: row.relativePath.replace(/^.*\//, "").replace(/\.pdf$/i, ""), relative_path: row.relativePath, corpus: row.corpus,
    sha256: row.sha256, status: row.status, error: row.error, duplicate_of: row.duplicateOf, page_count: row.pageCount,
    source_bytes: row.sourceBytes, epub_bytes: row.epubBytes, epub_uncompressed_bytes: row.epubUncompressedBytes,
    reduction_percent: row.status === "success" && row.epubBytes !== undefined ? ((1 - row.epubBytes / row.sourceBytes) * 100).toFixed(4) : undefined,
    elapsed_ms: row.elapsedMs, content_profile: row.contentProfile, epub_asset_count: row.epubAssetCount, epub_asset_bytes: row.epubAssetBytes,
    expected_image_assets: row.expectedImageAssetCount, missing_image_assets: row.missingImageAssetCount, figure_blocks: row.figureBlocks, table_blocks: row.tableBlocks, equation_blocks: row.equationBlocks,
  })),
  ...currentRows.map((row) => ({
    record_type: "translation_current", paper_id: row.paperId, block_id: row.blockId, page_start: row.pageStart, page_end: row.pageEnd,
    source_category: row.sourceCategory, fallback_stage: row.fallbackStage, reader_visible_fallback: row.readerVisibleFallback,
    source_fallback: row.sourceFallback, partial_source_fallback: row.partialSourceFallback, submitted_to_model: row.wouldSubmitToModel,
    accepted_by_quality_gate: row.wouldAcceptTranslation, translation_ms: row.translationTimeMs, input_tokens: row.inputTokens, output_tokens: row.outputTokens,
    quality_score: row.quality?.score, quality_reasons: row.quality?.reasons?.join(" | "), source_incomplete: row.sourceCompleteness?.incomplete,
    source_incomplete_reason: row.sourceCompleteness?.reason, structural_warnings: row.structuralWarnings?.join(" | "), missing_technical_names: row.missingTechnicalNameCandidates?.join(" | "),
    citation_risk: row.detachedNumericCitationRisk, acronym_risk: row.acronymExpansionDrift, compression_risk: row.extremeTranslationCompression,
  })),
];

const conversionChart = barSvg(
  "Mobile EPUB conversion and capacity reduction",
  `All 1,432 de-duplicated local PDFs; raw source PDF compared with actual .epub ZIP output.`,
  [
    { label: "Conversion success", value: ratio(successRows.length, successRows.length + failedRows.length)! * 100, annotation: `${successRows.length}/${successRows.length + failedRows.length} (${percent(ratio(successRows.length, successRows.length + failedRows.length))})` },
    { label: "Total capacity reduction", value: (1 - epubBytes / sourceBytes) * 100, annotation: `${percent(1 - epubBytes / sourceBytes)} (${mib(sourceBytes)} → ${mib(epubBytes)} MiB)` },
    { label: "Median per-paper reduction", value: median(reductions)! * 100, annotation: percent(median(reductions)) },
  ],
);
const processingChart = barSvg(
  "Actual extraction + EPUB export time by PDF length",
  "Successful all-corpus runs. Bars show median wall time per paper; this benchmark did not profile CPU or peak memory.",
  pageStats.map((stat) => ({ label: `${stat.label} pages (n=${stat.papers})`, value: (stat.medianElapsedMs ?? 0) / 1000, annotation: `${seconds(stat.medianElapsedMs)} s median`, color: "#6d4c9b" })),
  Math.max(...pageStats.map((stat) => (stat.medianElapsedMs ?? 0) / 1000)) * 1.25,
  "s",
);
const translationChart = barSvg(
  "Current MADLAD translation audit: automatic outcomes",
  "4 stratified papers × 3 extracted units. These are production quality-gate outcomes, not semantic accuracy.",
  [
    { label: "Fully translated accepted", value: ratio(currentAccepted.length, currentRows.length)! * 100, annotation: `${currentAccepted.length}/${currentRows.length} (${percent(ratio(currentAccepted.length, currentRows.length))})`, color: "#2463a6" },
    { label: "Reader-visible source fallback", value: ratio(currentFallbacks.length, currentRows.length)! * 100, annotation: `${currentFallbacks.length}/${currentRows.length} (${percent(ratio(currentFallbacks.length, currentRows.length))})`, color: "#b24a3b" },
    { label: "Pre-model: extraction/input policy", value: ratio(currentPreModel.length, currentRows.length)! * 100, annotation: `${currentPreModel.length}/${currentRows.length} (${percent(ratio(currentPreModel.length, currentRows.length))})`, color: "#c08a27" },
    { label: "Post-model: quality/fallback", value: ratio(currentPostModel.length, currentRows.length)! * 100, annotation: `${currentPostModel.length}/${currentRows.length} (${percent(ratio(currentPostModel.length, currentRows.length))})`, color: "#8c3d72" },
  ],
);

const report = `# Versio reliability and performance evaluation

## Executive summary

- **Mobile conversion reliability is measured at scale.** The actual phone-sync format is a single **EPUB 3 file (a ZIP container)**, with no outer per-paper ZIP. On ${(successRows.length + failedRows.length).toLocaleString()} de-duplicated PDFs, ${successRows.length.toLocaleString()} succeeded: **${percent(ratio(successRows.length, successRows.length + failedRows.length), 2)}** (95% Wilson CI ${interval(successRows.length, successRows.length + failedRows.length)}). This is directly comparable to the earlier 1,511-path / 1,432-unique / 1,423-success report because it is that same completed corpus run.
- **The measured phone-sync data size fell by ${percent(1 - epubBytes / sourceBytes, 2)} overall** (${mib(sourceBytes)} MiB source PDF → ${mib(epubBytes)} MiB EPUB); the unweighted mean reduction was ${percent(mean(reductions), 2)} and median ${percent(median(reductions), 2)}. This includes EPUB content and retained visual assets. It is appropriate to say “**実測した1,423本では、スマホ同期用データを総容量で61.34%削減**” with the scope note below. Do not say that this measures Japanese-translation byte size: the run deliberately used original-text fallback to isolate the reflow/assets output.
- **Extraction can be shown as stable, but not as a single end-to-end ‘accuracy’ percentage.** The current seven-paper development gate completed 7/7 and retained source text/provenance at 100%, while the four publisher-disjoint validation candidates passed the label-free health gate 4/4. The independent cohort has no complete human gold yet, so content accuracy (CER, Block F1, reading order, TEDS, formula CDM) is **not measured** there.
- **Current translation is not presentation-safe as an accuracy claim yet.** In the current 12-unit, four-discipline audit, only ${currentAccepted.length}/12 (${percent(ratio(currentAccepted.length, currentRows.length))}) units were fully accepted by the automatic quality gate and ${currentFallbacks.length}/12 were reader-visible source fallbacks. A source/output inspection found a material hallucination in an automatically accepted unit; automatic acceptance therefore is not semantic correctness. An independent human reference review and reference translations are still required.

## Scope and reproducibility

| Item | Current evidence | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Full EPUB run | ${mobile.generatedAt}; ${(successRows.length + failedRows.length).toLocaleString()} unique PDFs from 1,511 discovered paths | Actual conversion completion, file size, retained exported assets, wall time | Text/structure semantic accuracy, translation quality, CPU/RSS |
| Development extraction gate | ${development.generatedAt}; 7 existing real-paper fixtures, 240 s/PDF timeout | Regression signal and exact checked fixture dimensions | Independent generalization; complete content accuracy |
| Validation health | ${validation.generatedAt}; 4 publisher-disjoint PDFs, extracted twice | Determinism/integrity/traceability health | Accuracy: it has no complete human gold |
| Current translation audit | ${translationCurrent.createdAt}; 4 papers × 3 sampled units | Production fallback behavior and server-reported translation latency | Corpus-wide rate or semantic correctness |
| Historical translation review | ${translationHistorical.generatedAt}; model ${translationHistorical.modelVersion} | Prior manually reviewed safety evidence | Current-model quality: model and sample differ |

**Code identity.** The run was made from git rev-parse HEAD = ${process.env.GIT_HEAD ?? "4e41827087b0f2a211cf3f58d93cecd993d3e37c"} on main. The worktree was dirty, including extraction-evaluation changes, so every artifact records its input paths and timestamps rather than claiming a clean release build.

## 1. PDF extraction: content, structure, and reliability

### Human-gold metrics versus proxies

The evaluator supports human-authored CER/NED, role-aware Block F1, reading-order edit distance, paragraph-boundary F1, caption-relation F1, table TEDS, and formula NED/CDM. It deliberately emits N/A when the relevant full-page gold is absent. This distinction matters: a parser finishing is not evidence that its text or reading order matches the PDF.

| Evidence | Result | Denominator / qualification |
| --- | --- | --- |
| Development fixture completion | ${development.selection.completed}/${development.selection.requested}; 0 timeout/failure | Existing development corpus only; 95% completion CI ${interval(development.selection.completed, development.selection.requested)} |
| Native source integrity | ${percent(development.summary.sourceIntegrityRate.value)} | 7/7 documents; integrity invariant, not semantic recall |
| Canonical provenance | ${percent(development.summary.canonicalProvenanceRate.value)} | 7/7 documents; every Canonical node remains PDF-anchored |
| Heading recall | ${percent(development.summary.headingRecall.value, 2)} | Macro mean, only 3 annotated development papers |
| Table-caption recall | ${percent(development.summary.tableCaptionRecall.value, 2)} | Macro mean, only 4 annotated development papers |
| Table-region recall | ${percent(development.summary.tableRegionRecall.value, 2)} | Macro mean, only 3 annotated development papers |
| Reading-order pair score | ${percent(development.summary.readingOrderPair.value, 2)} | One annotated development paper only; not generalizable |
| Independent validation health | ${validation.selection.completed}/${validation.selection.requested} healthy; 0 unhealthy | Label-free double-extraction gate; 95% completion CI ${interval(validation.selection.completed, validation.selection.requested)} |

The development result also exposes real limitations: table-caption and table-region recall include failures (not silently omitted), and heading hierarchy scored 0 in its sole eligible fixture. The historical 113-paper baseline reports reader-title exactness ${percent(extractionBaseline.summary.readerTitleExact.rate, 2)} (${extractionBaseline.summary.readerTitleExact.passed}/${extractionBaseline.summary.readerTitleExact.evaluated}), but 39 cases use metadata fallback; native PDF-title exactness is only ${percent(extractionBaseline.summary.nativeTitleExact.rate, 2)}. Neither title metric is a proxy for full-text extraction accuracy.

**Unmeasured extraction dimensions.** The publisher-disjoint validation/held-out candidates still lack complete human gold. Therefore independent CER/NED, role-aware Block F1, full reading-order accuracy, paragraph-boundary F1, caption relation F1, TEDS, and CDM are N/A. The required next work is to finish complete page-level gold in Evaluation Studio, export frozen predictions, and run npm run eval:extraction-benchmark; partial annotations must not be converted into 100% scores.

## 2. Translation reliability and quality

### Current model: measured automatic behavior

Current model: ${translationCurrent.serverStatus?.model_name ?? "unknown"} on ${translationCurrent.serverStatus?.device ?? "unknown"}, version ${translationCurrent.serverStatus?.model_version ?? "unknown"}.

| Outcome | Result | 95% Wilson CI (descriptive only) |
| --- | ---: | --- |
| Model returned a response | ${currentModelResponses.length}/${currentRows.length} | ${interval(currentModelResponses.length, currentRows.length)} |
| Fully translated, automatic gate accepted | ${currentAccepted.length}/${currentRows.length} (${percent(ratio(currentAccepted.length, currentRows.length))}) | ${interval(currentAccepted.length, currentRows.length)} |
| Reader-visible original fallback | ${currentFallbacks.length}/${currentRows.length} (${percent(ratio(currentFallbacks.length, currentRows.length))}) | ${interval(currentFallbacks.length, currentRows.length)} |
| Pre-model fallback attributed to extraction/input policy | ${currentPreModel.length}/${currentRows.length} (${percent(ratio(currentPreModel.length, currentRows.length))}) | ${interval(currentPreModel.length, currentRows.length)} |
| Post-model quality/fallback | ${currentPostModel.length}/${currentRows.length} (${percent(ratio(currentPostModel.length, currentRows.length))}) | ${interval(currentPostModel.length, currentRows.length)} |
| Ordinary-body fallback | ${currentOrdinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length}/${currentOrdinary.length} (${percent(ratio(currentOrdinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length, currentOrdinary.length))}) | ${interval(currentOrdinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length, currentOrdinary.length)} |

The paper-level CSV distinguishes pre-model fallbacks (input was already incomplete/unsafe) from post-model fallbacks. In this run, all three medical-review units were stopped before the model because extraction checks found a dropped function word or line-break hyphen/continuation; one HCI unit hit a degenerate server output; two computational-linguistics units were rejected for partial source text/protected-citation restoration. This is the required separation of extraction-induced and model/gate-induced failures, but it is a small stratified audit, not a prevalence estimate.

### Semantics and human review status

No current-model reference translations are available, so COMET, chrF, and BLEU are **not applicable**: applying them without Japanese reference translations would fabricate a score. Automatic invariant, citation, terminology, language and compression checks are logged in the CSV as triage signals only.

An evaluator spot inspection of the 6 automatically accepted outputs found one unequivocal severe semantic failure: interactive-jewellery:b-9481ee91 changes the source discussion of technology-driven wearables into unrelated website/web-application construction. It passed the automatic gate. This inspection is documented as a failure example, **not** claimed as independent human-review statistics.

The only completed broad manual source-to-output review is historical: ${translationHistorical.reviewedRows} sampled rows across ${translationHistorical.papers} papers on model ${translationHistorical.modelVersion}, with ${translationHistorical.unsafeFalseAcceptSeverityGe2}/${translationHistorical.accepted} accepted outputs judged severity ≥2 unsafe (${percent(translationHistorical.unsafeFalseAcceptRateAmongAccepted, 2)}; descriptive 95% CI ${interval(translationHistorical.unsafeFalseAcceptSeverityGe2, translationHistorical.accepted)}). It also recorded ${translationHistorical.ordinaryBodyFallback}/${translationHistorical.ordinaryBodyRows} (${percent(ratio(translationHistorical.ordinaryBodyFallback, translationHistorical.ordinaryBodyRows), 2)}) ordinary-body fallbacks. This evidence is important negative evidence, but is not comparable to the current model version and must not be used as its accuracy score.

A later partial manual set has ${translationFreshManual.reviewedRows} reviewed rows and attributes ${translationFreshManual.causeCounts.extraction ?? 0} issues to extraction versus ${translationFreshManual.causeCounts.translation ?? 0} to translation. Its own notes say it is not representative; it is retained as a review-calibration artifact only.

**Required to make a quality claim.** Freeze a publisher/layout-stratified current-model sample; commission two independent bilingual reviewers; have them judge meaning, information, negation/comparison/causality/conditions, numbers/units/statistics/citations/terms, hallucination and omission against the rendered PDF; adjudicate disagreements; then report severity ≥2 rate with CI. A parallel run on reviewer-corrected source text is necessary to quantify extraction-caused versus model-caused semantic errors. Until then, no “translation accuracy xx%” claim is supportable.

## 3. Actual conversion performance and mobile size

![Full corpus conversion and size result](./evaluation-figures/reliability-epub-summary.svg)

| Metric | Result |
| --- | ---: |
| Discovered paths / exact duplicates / unique content | 1,511 / 79 / ${(successRows.length + failedRows.length).toLocaleString()} |
| Conversion success / failure | ${successRows.length.toLocaleString()} / ${failedRows.length} |
| Original PDF bytes (successful files) | ${mib(sourceBytes)} MiB |
| EPUB ZIP bytes | ${mib(epubBytes)} MiB |
| EPUB uncompressed payload | ${mib(payloadBytes)} MiB |
| Total weighted reduction | ${percent(1 - epubBytes / sourceBytes, 2)} |
| Mean / median per-paper reduction | ${percent(mean(reductions), 2)} / ${percent(median(reductions), 2)} |
| Files not reduced (equal or larger) | ${successRows.filter((row) => (row.epubBytes ?? 0) >= row.sourceBytes).length} |
| Exported asset bytes / asset files | ${mib(assets.epubAssetBytes)} MiB / ${assets.epubAssetCount.toLocaleString()} |
| Expected image assets missing from export | ${assets.missingImageAssets}/${assets.expectedImageAssets.toLocaleString()} |
| Figure / table / equation blocks observed | ${assets.figureBlocks.toLocaleString()} / ${assets.tableBlocks.toLocaleString()} / ${assets.equationBlocks.toLocaleString()} |

### By document characteristic

| Content profile | Papers | Total-weighted reduction | Mean / median reduction | Equal or larger |
| --- | ---: | ---: | ---: | ---: |
${profileStats.map((item) => `| ${item.profile} | ${item.papers.toLocaleString()} | ${percent(item.weightedReduction, 2)} | ${percent(item.meanReduction, 2)} / ${percent(item.medianReduction, 2)} | ${item.increased} |`).join("\n")}

![Wall time by PDF length](./evaluation-figures/reliability-processing-time.svg)

| Page count | Successful PDFs | Median wall time | Mean wall time |
| --- | ---: | ---: | ---: |
${pageStats.map((item) => `| ${item.label} | ${item.papers.toLocaleString()} | ${seconds(item.medianElapsedMs)} s | ${seconds(item.meanElapsedMs)} s |`).join("\n")}

Across all successful files, mean/median/p95 wall time was ${seconds(summary.epub.elapsedMs.mean)} / ${seconds(summary.epub.elapsedMs.median)} / ${seconds(summary.epub.elapsedMs.p95)} seconds (range ${seconds(summary.epub.elapsedMs.min)}–${seconds(summary.epub.elapsedMs.max)}). Page count has a modest Pearson correlation with elapsed time (r = 0.271); file size, asset complexity, and PDF internals also matter. The benchmark records elapsed wall time only. **CPU utilization, RSS/peak memory and per-stage extraction-vs-export timing were not collected, so they are N/A rather than inferred.**

The ${failedRows.length} failures are retained in the JSON/CSV, not excluded: ${failureGroups.map((item) => `${item.papers} ${item.reason}`).join("; ")}. Their paths and raw errors are in reliability-performance-evaluation-latest.json.

## Presentation-ready wording

Use this sentence, with the note immediately adjacent:

> 実在PDF **1,423本**の全容量測定で、Versioのスマホ同期用EPUBは、原本PDF比で**総容量61.34%削減**（3,075.84 MiB → 1,189.10 MiB、変換成功率99.37%）でした。

Note: “2026-11-04 measurement; 1,511 discovered local paths, 79 content duplicates removed, 1,432 unique PDFs measured. Actual EPUB 3/ZIP output with current image optimization and all exported visual assets; original-text fallback was used, so the figure does not measure Japanese translation text size. Nine conversion failures are included in the success rate.”

Do **not** use “PDF extraction accuracy xx%” or “translation accuracy xx%” in the presentation yet. The defensible adjacent claim is: “Independent human-gold evaluation of full content/structure and current Japanese semantic fidelity is in progress; current tests measure stability and explicitly preserve/reveal fallback.”

## Reproduction

\`\`\`sh
# Code identity and dirty-tree state
git rev-parse HEAD
git status --short

# Existing fixture first: human-gold evaluator logic + extraction regressions
npm test -- --run src/test/evaluation/benchmarkEvaluate.test.ts src/test/evaluation/reviewGold.test.ts src/test/evaluation/standardMetrics.test.ts
npm run bench:pdf-extraction:development -- --timeout-ms 240000 --output test-data/extraction-evaluation/current-development-regression.json
npm run audit:pdf-extraction:unlabeled -- --cohort test-fixtures/extraction-benchmark/validation-cohort-v1.json --all --timeout-ms 240000 --output test-data/extraction-evaluation/current-validation-health.json

# Explicit four-paper current-model sample (the runner checkpoints each paper)
./restart-translation-server.sh
MADLAD_BENCH_CONCURRENCY=2 npm run bench:real-paper-translation -- \\
  --papers interactive-jewellery,medical-deep-learning-meta-review,marketing-consumer-response,computational-linguistics-nlp-translation \\
  --limit 3 --report-name translation-audit-current-v6-stratified-v1

# The all-PDF EPUB run is explicit and resumable; only run it when a new full measurement is needed.
npm run bench:mobile-epub-storage

# Recreate this report, CSV/JSON and SVG figures without rerunning models.
npm run report:reliability-performance-evaluation
\`\`\`

The all-PDF runner records progress and per-paper elapsed time; its existing completed report is reused here instead of silently running a new 1,432-PDF job. The translation runner checkpoints after each paper and has request timeouts. A future all-113 translation run must use its explicit --full-corpus --resume mode and should add a run-level wall-clock/CPU/RSS recorder before it is used for performance claims.

## Deliverables

- [Machine-readable summary and full row results](../test-data/real-papers/reports/reliability-performance-evaluation-latest.json)
- [Paper/block-level CSV](../test-data/real-papers/reports/reliability-performance-evaluation-latest.csv)
- [EPUB capacity graph](./evaluation-figures/reliability-epub-summary.svg)
- [Processing-time graph](./evaluation-figures/reliability-processing-time.svg)
- [Current translation outcome graph](./evaluation-figures/reliability-translation-outcomes.svg)
`;

fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(figureDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "reliability-performance-evaluation-latest.json"), `${JSON.stringify({ summary, rows: { mobileEpub: mobile.rows, currentTranslation: currentRows } }, null, 2)}\n`);
writeCsv(path.join(reportDir, "reliability-performance-evaluation-latest.csv"), csvRows);
fs.writeFileSync(path.join(docsDir, "RELIABILITY_PERFORMANCE_EVALUATION.md"), report);
fs.writeFileSync(path.join(figureDir, "reliability-epub-summary.svg"), conversionChart);
fs.writeFileSync(path.join(figureDir, "reliability-processing-time.svg"), processingChart);
fs.writeFileSync(path.join(figureDir, "reliability-translation-outcomes.svg"), translationChart);

console.log(JSON.stringify({
  report: path.relative(root, path.join(docsDir, "RELIABILITY_PERFORMANCE_EVALUATION.md")),
  json: path.relative(root, path.join(reportDir, "reliability-performance-evaluation-latest.json")),
  csv: path.relative(root, path.join(reportDir, "reliability-performance-evaluation-latest.csv")),
  figures: path.relative(root, figureDir),
  mobileRows: mobile.rows.length,
  translationRows: currentRows.length,
}, null, 2));
