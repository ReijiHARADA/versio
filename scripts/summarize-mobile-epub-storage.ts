/** Merge shard checkpoints and calculate the presentation-safe EPUB capacity metrics. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Status = "success" | "failed" | "duplicate";
type Row = {
  relativePath: string;
  corpus: string;
  sourceBytes: number;
  sha256: string;
  status: Status;
  error?: string;
  epubBytes?: number;
  epubUncompressedBytes?: number;
  packageAssetBytes?: number;
  epubAssetBytes?: number;
  epubAssetCount?: number;
  expectedImageAssetCount?: number;
  missingImageAssetCount?: number;
  figureBlocks?: number;
  tableBlocks?: number;
  equationBlocks?: number;
  textBlocks?: number;
  contentProfile?: string;
};
type Report = { version: string; inventory: { discoveredFiles: number; uniqueContentFiles: number; duplicateFiles: number; sourceRoots: Record<string, number> }; rows: Row[]; benchmark: Record<string, string> };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueFor = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const inputList = valueFor("--inputs");
if (!inputList) throw new Error("--inputs report-a.json,report-b.json を指定してください。");
const inputs = inputList.split(",").map((file) => path.resolve(root, file.trim()));
const output = path.resolve(root, valueFor("--output") ?? "test-data/real-papers/reports/mobile-epub-storage-merged.json");
const markdown = path.resolve(root, valueFor("--markdown") ?? "docs/MOBILE_EPUB_STORAGE_BENCHMARK.md");
const reports = inputs.map((file) => JSON.parse(fs.readFileSync(file, "utf8")) as Report);
const base = reports[0];

const rank: Record<Status, number> = { duplicate: 0, failed: 1, success: 2 };
const byPath = new Map<string, Row>();
for (const report of reports) {
  for (const row of report.rows) {
    const current = byPath.get(row.relativePath);
    if (!current || rank[row.status] >= rank[current.status]) byPath.set(row.relativePath, row);
  }
}
const rows = [...byPath.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
const unique = rows.filter((row) => row.status !== "duplicate");
const successes = unique.filter((row) => row.status === "success" && typeof row.epubBytes === "number");
const failures = unique.filter((row) => row.status === "failed");
const unmeasured = base.inventory.uniqueContentFiles - unique.length;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const stat = (items: Row[]) => {
  const usable = items.filter((row) => typeof row.epubBytes === "number");
  const original = sum(usable.map((row) => row.sourceBytes));
  const epub = sum(usable.map((row) => row.epubBytes!));
  const reductions = usable.map((row) => 1 - row.epubBytes! / row.sourceBytes);
  const uncompressed = sum(usable.map((row) => row.epubUncompressedBytes ?? 0));
  const assetBytes = sum(usable.map((row) => row.epubAssetBytes ?? 0));
  const visualBlocks = sum(usable.map((row) => (row.figureBlocks ?? 0) + (row.tableBlocks ?? 0)));
  const sourceAssets = sum(usable.map((row) => row.expectedImageAssetCount ?? 0));
  return {
    papers: usable.length,
    originalBytes: original,
    epubBytes: epub,
    epubUncompressedBytes: uncompressed,
    epubAssetBytes: assetBytes,
    meanReduction: reductions.length ? sum(reductions) / reductions.length : null,
    medianReduction: median(reductions),
    totalReduction: original ? 1 - epub / original : null,
    reductionPositivePapers: reductions.filter((value) => value > 0).length,
    increaseOrEqualPapers: reductions.filter((value) => value <= 0).length,
    visualBlocks,
    sourceAssets,
    visualBlocksWithoutRasterAsset: Math.max(0, visualBlocks - sourceAssets),
    exporterMissingAssets: sum(usable.map((row) => row.missingImageAssetCount ?? 0)),
  };
};
const profiles = Object.fromEntries([...new Set(successes.map((row) => row.contentProfile ?? "unknown"))].sort().map((profile) => [profile, stat(successes.filter((row) => (row.contentProfile ?? "unknown") === profile))]));
const summary = {
  generatedAt: new Date().toISOString(),
  benchmark: base.benchmark,
  inventory: base.inventory,
  measuredUniquePdfs: unique.length,
  unmeasuredUniquePdfs: unmeasured,
  successfulPdfs: successes.length,
  failedPdfs: failures.length,
  successRate: unique.length ? successes.length / unique.length : null,
  failures: failures.map((row) => ({ relativePath: row.relativePath, corpus: row.corpus, error: row.error })),
  overall: stat(successes),
  profiles,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ ...base, rows, summary }, null, 2)}\n`);

const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const mib = (value: number) => `${(value / 1024 / 1024).toFixed(2)} MiB`;
const overall = summary.overall;
const profileLines = Object.entries(profiles).map(([profile, values]) => {
  const entry = values as ReturnType<typeof stat>;
  return `| ${profile} | ${entry.papers} | ${percent(entry.meanReduction)} | ${percent(entry.medianReduction)} | ${percent(entry.totalReduction)} | ${entry.increaseOrEqualPapers} |`;
});
const failureLines = summary.failures.length
  ? summary.failures.map((failure) => `| \`${failure.relativePath}\` | ${failure.error || "unknown error"} |`).join("\n")
  : "| None | — |";
const currentExporterNote = "The benchmark does not change image quality, dimensions, or encoder settings to improve the result. It uses the current phone-sync exporter default: ordinary PNG figures may be converted to JPEG at quality 0.92 and capped at 1600 px only when the result is smaller; tables retain their PNG assets.";
const failureSection = `\n\n## Failures\n\n| Source PDF | Error |\n| --- | --- |\n${failureLines}`;
const markdownText = `# Mobile EPUB storage benchmark\n\nGenerated: ${summary.generatedAt}\n\nThis measures the exact one-paper phone-sync output: EPUB 3 with the current mobile image optimization enabled. It runs the browser extraction path, creates a Paper Package in memory, and calls the production EPUB exporter. The EPUB is itself a ZIP container; there is no outer ZIP for one-paper phone sync.\n\nTranslation is deliberately not run. Extracted original text is used as the ordinary untranslated fallback, so these numbers measure reflow and retained visual assets, not the small language-dependent difference between English and Japanese text encodings.\n\n## Coverage\n\n- Discovered PDF paths: ${base.inventory.discoveredFiles}\n- Exact-content duplicates excluded from independent statistics: ${base.inventory.duplicateFiles}\n- Unique PDF contents: ${base.inventory.uniqueContentFiles}\n- Measured: ${summary.measuredUniquePdfs}; successful: ${summary.successfulPdfs}; failed: ${summary.failedPdfs}; unmeasured: ${summary.unmeasuredUniquePdfs}\n- Success rate: ${percent(summary.successRate)}\n\n## Results (successful PDFs only)\n\n- Original PDFs: ${mib(overall.originalBytes)}\n- Synced EPUB files (actual compressed container): ${mib(overall.epubBytes)}\n- EPUB payload before ZIP compression: ${mib(overall.epubUncompressedBytes)}\n- Mean per-paper reduction: ${percent(overall.meanReduction)}\n- Median per-paper reduction: ${percent(overall.medianReduction)}\n- Total-capacity reduction (sum of bytes): ${percent(overall.totalReduction)}\n- Papers whose EPUB was not smaller: ${overall.increaseOrEqualPapers} / ${overall.papers}\n\nImages/tables in the exported EPUB account for ${mib(overall.epubAssetBytes)} before EPUB ZIP compression. The exporter retained ${overall.sourceAssets} extracted figure/table assets; it dropped ${overall.exporterMissingAssets}. ${overall.visualBlocksWithoutRasterAsset} visual blocks had no raster asset in the extraction package and therefore use their text/equation fallback rather than being silently counted as retained images.\n\n## Content profile\n\nProfiles use the share of uncompressed EPUB payload occupied by retained image/table assets: text_centered <10%, mixed 10–<50%, asset_centered ≥50%.\n\n| Profile | PDFs | Mean reduction | Median reduction | Total reduction | EPUB ≥ PDF |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${profileLines.join("\n")}\n\n## Presentation claim\n\nUse the **total-capacity reduction** only if this final run has no unmeasured PDFs, with this scope note: “In a local corpus of ${summary.successfulPdfs} successfully converted unique academic PDFs, Versio’s phone-sync EPUBs used ${percent(overall.totalReduction)} less total storage than the source PDFs; image-heavy papers can be larger.” Do not call it an unconditional product-wide average, and retain the success/failure count in speaker notes.\n\n## Reproduction\n\n\`npm run bench:mobile-epub-storage -- --all --output test-data/real-papers/reports/mobile-epub-storage-latest.json\`\n\nThe raw per-paper results are at \`${path.relative(root, output)}\`; no original PDFs or EPUBs are committed.\n`;
fs.mkdirSync(path.dirname(markdown), { recursive: true });
fs.writeFileSync(
  markdown,
  markdownText
    .replace("\n## Coverage", `\n\n${currentExporterNote}\n\n## Coverage`)
    .replace("\n## Results", `${failureSection}\n\n## Results`)
);
console.log(JSON.stringify({ output, markdown, summary }, null, 2));
