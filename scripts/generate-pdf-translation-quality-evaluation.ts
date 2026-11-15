/**
 * Generates a quality-only report from actual extraction/translation runs.
 * It intentionally excludes EPUB conversion, size, and sync measurements.
 *
 * It never calls agent-reviewed labels "human gold". A blank human-review
 * queue is produced separately so bilingual reviewers can complete A/B work.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reports = path.join(root, "test-data/real-papers/reports");
const evaluation = path.join(root, "test-data/extraction-evaluation");
const inputs = {
  development: path.join(evaluation, "current-development-regression.json"),
  validation: path.join(evaluation, "current-validation-health.json"),
  currentTranslation: path.join(reports, "translation-audit-current-v6-stratified-v1.json"),
  agentReview: path.join(reports, "translation-fresh-manual-review-v1.json"),
};
for (const file of Object.values(inputs)) if (!fs.existsSync(file)) throw new Error(`Missing input: ${path.relative(root, file)}`);
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

type Metric = { value: number | null; evaluatedDocuments: number };
type Extraction = { generatedAt: string; selection: { requested: number; completed: number; timeoutMs: number }; summary: Record<string, Metric>; reports: Array<Record<string, unknown>>; failures: unknown[]; invariantFailures: unknown[] };
type TranslationRow = { paperId: string; blockId: string; pageStart: number; pageEnd: number; source: string; translation?: string; sourceCategory: string; fallbackStage: string; sourceFallback?: boolean; readerVisibleFallback?: boolean; partialSourceFallback?: boolean; wouldSubmitToModel?: boolean; wouldAcceptTranslation?: boolean; translationTimeMs?: number | null; inputTokens?: number | null; outputTokens?: number | null; quality?: { score?: number; reasons?: string[] } | null; sourceCompleteness?: { incomplete?: boolean; reason?: string }; structuralWarnings?: string[]; missingTechnicalNameCandidates?: string[]; detachedNumericCitationRisk?: boolean; acronymExpansionDrift?: boolean; extremeTranslationCompression?: boolean };
type TranslationRun = { createdAt: string; runId: string; serverStatus?: { model_name?: string; model_version?: string; device?: string }; papers: Array<{ paper: { id: string; title: string }; rows: TranslationRow[]; error?: string }> };
type AgentReview = { reviewer?: string; reviewedAt?: string; total?: number; notes?: string[]; items?: Array<{ label?: string; severity?: number; primaryCause?: string }> };

const extraction = read<Extraction>(inputs.development);
const validation = read<{ generatedAt: string; selection: { requested: number; completed: number; timeoutMs: number }; failures: unknown[]; unhealthy: unknown[] }>(inputs.validation);
const translation = read<TranslationRun>(inputs.currentTranslation);
const agentReview = read<AgentReview>(inputs.agentReview);
const rows = translation.papers.flatMap((paper) => paper.rows);
const accepted = rows.filter((row) => row.wouldAcceptTranslation && !row.partialSourceFallback);
const visibleFallback = rows.filter((row) => row.readerVisibleFallback || row.sourceFallback);
const preModel = rows.filter((row) => row.fallbackStage === "pre-model");
const postModel = rows.filter((row) => row.fallbackStage === "post-model");
const ordinary = rows.filter((row) => row.sourceCategory === "ordinary-body-prose");
const modelResponses = rows.filter((row) => typeof row.translationTimeMs === "number" && row.translationTimeMs > 0);

function pct(n: number, d: number, digits = 1): string { return d ? `${(n / d * 100).toFixed(digits)}%` : "N/A"; }
function wilson(k: number, n: number): string {
  if (!n) return "N/A";
  const z = 1.959963984540054; const p = k / n; const den = 1 + z ** 2 / n;
  const center = (p + z ** 2 / (2 * n)) / den;
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * n)) / n) / den;
  return `${(Math.max(0, center - margin) * 100).toFixed(1)}–${(Math.min(1, center + margin) * 100).toFixed(1)}%`;
}
function csv(value: unknown): string { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function writeCsv(file: string, data: Array<Record<string, unknown>>): void {
  const columns = [...new Set(data.flatMap((row) => Object.keys(row)))];
  fs.writeFileSync(file, `${columns.join(",")}\n${data.map((row) => columns.map((column) => csv(row[column])).join(",")).join("\n")}\n`);
}

const reviewQueue = {
  schemaVersion: 1,
  kind: "paper-reader-human-bilingual-a-b-review-queue",
  status: "pending_human_review",
  createdAt: new Date().toISOString(),
  instructions: [
    "Two independent bilingual reviewers must transcribe/verify condition B from the rendered source PDF before looking at either Japanese output.",
    "For each condition, judge meaning, information loss/addition/hallucination, numerals/units/statistics, negation/conditions/comparisons/causality, terminology and citations.",
    "Severity 2 or higher is unsafe. Record the error cause as extraction, translation, both, or neither. Do not use automatic quality-gate acceptance as a label.",
    "Add an independently authored Japanese reference translation only if BLEU/chrF/COMET is to be calculated; never reuse model output as a reference.",
  ],
  rows: rows.map((row) => ({
    id: `${row.paperId}:${row.blockId}`,
    paperId: row.paperId,
    blockId: row.blockId,
    sourcePdfPages: [row.pageStart, row.pageEnd],
    conditionA: { extractedEnglish: row.source, japaneseOutput: row.translation ?? null, readerVisibleFallback: Boolean(row.readerVisibleFallback || row.sourceFallback) },
    conditionB: { verifiedEnglish: null, japaneseOutput: null, status: "requires_human_transcription_then_same_model_run" },
    reviewer1: null,
    reviewer2: null,
    adjudication: null,
  })),
};

const metricRows = [
  ["Heading recall", extraction.summary.headingRecall.value, extraction.summary.headingRecall.evaluatedDocuments, "Existing manually checked development labels; macro-document mean; development only."],
  ["Table-caption recall", extraction.summary.tableCaptionRecall.value, extraction.summary.tableCaptionRecall.evaluatedDocuments, "Existing manually checked development labels; macro-document mean; development only."],
  ["Table-region recall", extraction.summary.tableRegionRecall.value, extraction.summary.tableRegionRecall.evaluatedDocuments, "Existing manually checked development labels; macro-document mean; development only."],
  ["Figure-caption recall", extraction.summary.figureCaptionRecall.value, extraction.summary.figureCaptionRecall.evaluatedDocuments, "Existing manually checked development labels; macro-document mean; development only."],
  ["Reading-order pair score", extraction.summary.readingOrderPair.value, extraction.summary.readingOrderPair.evaluatedDocuments, "One development paper only; not independent generalization."],
  ["Text CER / WER", null, 0, "No complete human text gold; N/A."],
  ["Text omission / duplication", null, 0, "No complete human text gold; N/A."],
  ["Paragraph-boundary F1", null, 0, "No complete human boundary gold; N/A."],
  ["Caption relation F1", null, 0, "No complete independent human relation gold; N/A."],
  ["Table TEDS / formula NED/CDM", null, 0, "No complete independent human table/formula gold; N/A."],
] as const;

const report = `# PDF抽出・翻訳品質の定量評価

## 結論

このレポートは**EPUB変換・容量・同期を一切評価対象に含めない**。実在PDFの既存手動構造ラベルと、現行のPDF→抽出→翻訳実行結果だけを集計する。

現時点で発表資料に載せられる抽出品質の数値は、開発用実PDFでの限定的な構造指標だけである。本文CER/WER、欠落率、重複率、独立PDFでの読み順・段落・表TEDS・数式CDMは、完全な**人手goldが無いためN/A**である。テスト成功率・抽出成功率・ラベルなし健全性検査は精度に代用していない。

翻訳についても、現行モデルの意味精度、数値/引用保持率、品質ゲートの誤受理率を人手精度としては報告できない。既存の手動翻訳レビューは明示的に agent-manual-comparison であり、人間の正解ラベルではないためである。自動品質ゲートを通った出力に重大な意味改変があることは現行実行で確認しており、受理率を精度と扱わない。

## 指標と採否

PDF抽出の指標語彙は [OmniDocBench](https://github.com/opendatalab/OmniDocBench) と既存の [PDF extraction benchmark](PDF_EXTRACTION_BENCHMARK.md) に合わせた。CERは人手正解文字列を分母とする文字Levenshtein距離、role-aware Block F1はIoU対応と役割一致、読み順は正解block列の編集距離、表はTEDS、数式はNED/CDMである。Paragraph-boundary F1とcaption-relation F1はPaper Reader固有の構造保持指標である。これらは完全な同一ページのhuman goldがあるときだけ算出する。

WERは英語の分かち書き規則に依存し、既存evaluatorに実装されていないため、今回CERの代替数値を作らずN/Aとする。翻訳は、二重blind人手判定で「意味」「情報欠落」「追加/幻覚」「数値・単位・統計」「否定・条件・比較・因果」「専門用語・引用」を別々に判定し、severity 2以上を重大エラーと定義する。品質ゲートの誤受理率は、人手判定済みの自動受理件数を分母に重大エラー件数を置くが、その分母が未整備なのでN/Aである。

BLEU・chrF・COMETは独立の日本語参照訳を必要とする。モデル出力を参照訳にせず、有料APIも使わない方針のため、参照訳が完成するまでは未適用である。

## 1. PDF抽出: 実測済みの構造指標

実行: ${extraction.generatedAt}、7本の実在開発PDF、隔離worker、各240秒上限。すべての数値は論文ごとのmacro meanで、括弧内は採点可能な論文数である。

| 指標 | 実測値 | 分母 | 解釈 |
| --- | ---: | ---: | --- |
${metricRows.map(([name, value, n, note]) => `| ${name} | ${value === null ? "N/A" : `${(value * 100).toFixed(2)}%`} | ${n} | ${note} |`).join("\n")}

読解上の注意: Heading recall 86.46%は3論文だけ、reading-order 100%は1論文だけであり、全論文の抽出正確率には一般化できない。table-caption 75.00%・table-region 66.67%は失敗を含む実測で、表中心の文書で低下する兆候であるが、分母が小さい。

独立性: publisher/template familyを開発コーパスと分離した4論文は、二重抽出のlabel-free health gateを4/4通過した。しかしこれはdeterminism・座標・provenanceの健全性確認にすぎず、CERやBlock F1ではない。独立精度はhuman gold完了までN/Aとする。

## 2. 翻訳: 現行モデルの実測運用結果（精度ではない）

実行: ${translation.createdAt}、${translation.papers.length}論文（HCI、医学レビュー、数理マーケティング、計算言語学）×3抽出本文、MADLAD ${translation.serverStatus?.model_name ?? "unknown"} / ${translation.serverStatus?.device ?? "unknown"}。標本は層化した診断用であり、母集団率の推定には使わない。

| 自動経路の結果 | 件数 / 分母 | 値 | 95% Wilson CI（記述的） |
| --- | ---: | ---: | ---: |
| モデル応答あり | ${modelResponses.length}/${rows.length} | ${pct(modelResponses.length, rows.length)} | ${wilson(modelResponses.length, rows.length)} |
| 完全翻訳として自動受理 | ${accepted.length}/${rows.length} | ${pct(accepted.length, rows.length)} | ${wilson(accepted.length, rows.length)} |
| reader-visible原文fallback | ${visibleFallback.length}/${rows.length} | ${pct(visibleFallback.length, rows.length)} | ${wilson(visibleFallback.length, rows.length)} |
| 抽出/入力ポリシー起因のpre-model fallback | ${preModel.length}/${rows.length} | ${pct(preModel.length, rows.length)} | ${wilson(preModel.length, rows.length)} |
| モデル/品質ゲート後のpost-model fallback | ${postModel.length}/${rows.length} | ${pct(postModel.length, rows.length)} | ${wilson(postModel.length, rows.length)} |
| ordinary-bodyのfallback | ${ordinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length}/${ordinary.length} | ${pct(ordinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length, ordinary.length)} | ${wilson(ordinary.filter((row) => row.readerVisibleFallback || row.sourceFallback).length, ordinary.length)} |

これは訳文の正しさではない。自動受理6件のうち interactive-jewellery:b-9481ee91 は、原文のwearables/jewelleryに関する主張を、無関係なwebsite/web application構築へ置換しているにもかかわらず受理された。従って、**品質ゲート受理率50.0%は翻訳精度50.0%を意味しない**。

COMET、chrF、BLEUは、日本語の独立参照訳が無いため未適用である。モデル出力を参照訳にしたり、agent reviewをhuman goldと呼んだりして数値を作ることはしない。

## 3. 抽出由来と翻訳由来の切り分け

同じ12抽出本文で、抽出起因と判定できるものは ${preModel.length}件: 医学レビューの3件が、改行ハイフン・機能語欠落・継続断片の検出によりモデル投入前に原文fallbackとなった。post-model ${postModel.length}件は、degenerate出力またはcitation placeholder/未翻訳英文検出によるfallbackである。

これは「原因別fallback件数」の実測であり、原因別の意味誤り率ではない。A/B比較に必要なB（レンダリングPDFから人手で転記・検証した英語）と、その同一モデル出力はまだ無い。以下のreview queueにAを固定し、Bを独立転記後に同じモデルで翻訳して、同一の人手判定票で比較する。

## 4. 人手goldを完成させるための実行済み準備

${path.relative(root, path.join(evaluation, "human-review-queue-current-v6.json"))} に、今回実行した12行のA条件、PDFページ、B条件の空欄、2名のバイリンガル査読者と調停の欄を出力した。人が次を記録すれば、初めて以下の実測が可能になる。

1. PDFレンダリングに対する完全な英語転記（B）
2. A/B双方の日本語出力に対する、意味・欠落・追加/幻覚・数値/単位/統計・否定/条件/比較/因果・専門用語・引用のblind判定
3. 独立日本語参照訳（BLEU/chrF/COMETを使う場合のみ）

人手入力前に出せる発表用数値は、上記の**限定された構造recall**だけである。本文を何%正しく抽出・翻訳できるかという総合値は、現状では答えを捏造しないためN/Aとする。

## 再現手順

~~~sh
npm run bench:pdf-extraction:development -- --timeout-ms 240000 --output test-data/extraction-evaluation/current-development-regression.json
npm run audit:pdf-extraction:unlabeled -- --cohort test-fixtures/extraction-benchmark/validation-cohort-v1.json --all --timeout-ms 240000 --output test-data/extraction-evaluation/current-validation-health.json
npm run report:pdf-translation-quality
~~~

翻訳のA条件は既存の実行結果 translation-audit-current-v6-stratified-v1.json を入力として再集計する。B条件とreference Japaneseは、人間の独立転記・翻訳を追加してから同一MADLAD versionで再実行する。
`;

const json = {
  generatedAt: new Date().toISOString(),
  scope: "PDF extraction and Japanese translation quality only; excludes EPUB/sync/size.",
  inputs: Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, path.relative(root, file)])),
  extraction: { developmentRun: extraction, independentValidationHealth: validation, metricRows },
  translation: {
    currentRun: { createdAt: translation.createdAt, runId: translation.runId, model: translation.serverStatus, rows: rows.length, accepted: accepted.length, readerVisibleFallback: visibleFallback.length, preModelFallback: preModel.length, postModelFallback: postModel.length },
    caveat: "Automatic outcomes are not semantic accuracy. No current human reference translations or human semantic gold are available.",
    existingAgentReview: { reviewer: agentReview.reviewer, reviewedAt: agentReview.reviewedAt, rows: agentReview.total, notes: agentReview.notes },
  },
  rows,
  humanReviewQueue: path.relative(root, path.join(evaluation, "human-review-queue-current-v6.json")),
};
const csvRows = rows.map((row) => ({
  paper_id: row.paperId, block_id: row.blockId, page_start: row.pageStart, page_end: row.pageEnd, source_category: row.sourceCategory,
  fallback_stage: row.fallbackStage, reader_visible_fallback: row.readerVisibleFallback, source_fallback: row.sourceFallback, partial_source_fallback: row.partialSourceFallback,
  submitted_to_model: row.wouldSubmitToModel, automatic_quality_accept: row.wouldAcceptTranslation, translation_ms: row.translationTimeMs, input_tokens: row.inputTokens, output_tokens: row.outputTokens,
  quality_score: row.quality?.score, quality_reasons: row.quality?.reasons?.join(" | "), source_incomplete: row.sourceCompleteness?.incomplete, source_incomplete_reason: row.sourceCompleteness?.reason,
  structural_warnings: row.structuralWarnings?.join(" | "), missing_technical_names: row.missingTechnicalNameCandidates?.join(" | "), citation_risk: row.detachedNumericCitationRisk, acronym_risk: row.acronymExpansionDrift, compression_risk: row.extremeTranslationCompression,
}));

fs.mkdirSync(reports, { recursive: true }); fs.mkdirSync(evaluation, { recursive: true });
fs.writeFileSync(path.join(root, "docs/PDF_EXTRACTION_TRANSLATION_QUALITY_EVALUATION.md"), report);
fs.writeFileSync(path.join(reports, "pdf-translation-quality-evaluation-latest.json"), `${JSON.stringify(json, null, 2)}\n`);
writeCsv(path.join(reports, "pdf-translation-quality-evaluation-latest.csv"), csvRows);
fs.writeFileSync(path.join(evaluation, "human-review-queue-current-v6.json"), `${JSON.stringify(reviewQueue, null, 2)}\n`);
console.log(JSON.stringify({ report: "docs/PDF_EXTRACTION_TRANSLATION_QUALITY_EVALUATION.md", json: "test-data/real-papers/reports/pdf-translation-quality-evaluation-latest.json", csv: "test-data/real-papers/reports/pdf-translation-quality-evaluation-latest.csv", humanReviewQueue: "test-data/extraction-evaluation/human-review-queue-current-v6.json" }, null, 2));
