/**
 * Capacity benchmark for the format that Versio actually syncs to a phone.
 *
 * The phone-sync feature writes one EPUB 3 file per paper.  This runner uses a
 * real Chromium DOM because both figure extraction and the mobile EPUB image
 * optimizer deliberately use browser Canvas APIs.  It therefore exercises the
 * same extract -> Paper Package -> EPUB path as the application, rather than a
 * Node-only approximation that would silently omit visual assets.
 *
 * Usage:
 *   npx tsx scripts/benchmark-mobile-epub-storage.ts --all
 *   npx tsx scripts/benchmark-mobile-epub-storage.ts --all --resume
 *   npx tsx scripts/benchmark-mobile-epub-storage.ts --limit 3
 *
 * Results are intentionally written below test-data (gitignored): the local
 * pending OA corpus is not distributable as a repository fixture.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

type Corpus = "generated" | "real" | "quarantine" | "pending-oa";

type Candidate = {
  relativePath: string;
  absolutePath: string;
  corpus: Corpus;
  sourceBytes: number;
  sha256: string;
};

type Row = {
  relativePath: string;
  corpus: Corpus;
  sourceBytes: number;
  sha256: string;
  duplicateOf?: string;
  status: "success" | "failed" | "duplicate";
  error?: string;
  elapsedMs?: number;
  pageCount?: number;
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
  contentProfile?: "text_centered" | "mixed" | "asset_centered";
};

type Output = {
  version: "mobile-epub-storage-v1";
  generatedAt: string;
  benchmark: {
    phoneSyncFormat: "EPUB 3 (.epub ZIP container)";
    mobileImageOptimization: "enabled (current exporter default)";
    translation: "not invoked; extracted original text is used as the translated fallback so this measures the reflow/assets output path, not translation-language byte variance";
    outerSyncArchive: "none for one-paper phone sync";
  };
  inventory: {
    discoveredFiles: number;
    uniqueContentFiles: number;
    duplicateFiles: number;
    sourceRoots: Record<Corpus, number>;
  };
  rows: Row[];
};

function rowSource(candidate: Candidate): Pick<Row, "relativePath" | "corpus" | "sourceBytes" | "sha256"> {
  return {
    relativePath: candidate.relativePath,
    corpus: candidate.corpus,
    sourceBytes: candidate.sourceBytes,
    sha256: candidate.sha256,
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueFor = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const numeric = (flag: string, fallback: number): number => {
  const value = Number(valueFor(flag));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};
const outputPath = path.resolve(root, valueFor("--output") ?? "test-data/real-papers/reports/mobile-epub-storage-latest.json");
const limit = numeric("--limit", Number.POSITIVE_INFINITY);
const timeoutMs = numeric("--timeout-ms", 180_000);
const shardText = valueFor("--shard");
const shardMatch = shardText?.match(/^(\d+)\/(\d+)$/);
const shardIndex = shardMatch ? Number(shardMatch[1]) : 0;
const shardCount = shardMatch ? Number(shardMatch[2]) : 1;
const skipOutputPath = valueFor("--skip-output") ? path.resolve(root, valueFor("--skip-output")!) : undefined;

if (shardIndex < 0 || shardCount < 1 || shardIndex >= shardCount) {
  throw new Error("--shard は 0/4 のように 0 始まりの index/count で指定してください。");
}

if (!has("--all") && !Number.isFinite(limit)) {
  throw new Error("全コーパスを測定するには --all を明示してください。小規模確認は --limit N を指定します。");
}

function filesBelow(relativeRoot: string, corpus: Corpus): Candidate[] {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const rows: Candidate[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        const bytes = fs.readFileSync(absolutePath);
        rows.push({
          absolutePath,
          relativePath: path.relative(root, absolutePath),
          corpus,
          sourceBytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  };
  walk(absoluteRoot);
  return rows;
}

function inventory(): Candidate[] {
  return [
    ...filesBelow("test-fixtures/generated-pdfs", "generated"),
    ...filesBelow("test-data/real-papers", "real").map((row) =>
      row.relativePath.includes("/_quarantine/") ? { ...row, corpus: "quarantine" as const } : row
    ),
    ...filesBelow("test-fixtures/real-papers/pending-pdfs", "pending-oa"),
  ]
    .map((row) => row.relativePath.includes("/_quarantine/") ? { ...row, corpus: "quarantine" as const } : row)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function initialOutput(candidates: Candidate[]): Output {
  const sourceRoots: Record<Corpus, number> = { generated: 0, real: 0, quarantine: 0, "pending-oa": 0 };
  for (const candidate of candidates) sourceRoots[candidate.corpus] += 1;
  return {
    version: "mobile-epub-storage-v1",
    generatedAt: new Date().toISOString(),
    benchmark: {
      phoneSyncFormat: "EPUB 3 (.epub ZIP container)",
      mobileImageOptimization: "enabled (current exporter default)",
      translation: "not invoked; extracted original text is used as the translated fallback so this measures the reflow/assets output path, not translation-language byte variance",
      outerSyncArchive: "none for one-paper phone sync",
    },
    inventory: { discoveredFiles: candidates.length, uniqueContentFiles: 0, duplicateFiles: 0, sourceRoots },
    rows: [],
  };
}

function writeCheckpoint(output: Output): void {
  output.generatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

async function openRuntime(): Promise<{ server: ViteDevServer; browser: Browser; page: Page; baseUrl: string }> {
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 5197, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite benchmark server did not expose a TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { server, browser, page, baseUrl };
}

async function runOne(page: Page, baseUrl: string, candidate: Candidate): Promise<Omit<Row, "relativePath" | "corpus" | "sourceBytes" | "sha256" | "status">> {
  const sourceUrl = new URL(`/@fs/${candidate.absolutePath}`, baseUrl).href;
  return page.evaluate(async ({ sourceUrl, relativePath, sha256 }) => {
    // Keep these imports runtime-dynamic. vite-node compiles this file for the
    // Node controller, while this callback runs inside Chromium; literal
    // imports here would otherwise become vite-node's SSR helper names.
    const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    const [{ extractAcademicPdf }, { projectionToPackage }, { persistPaperPackage }, { createMemoryFileSystem }, { exportPaperEpub }, { unzipSync }] = await Promise.all([
      importModule("/src/services/pdfExtraction/index.ts"),
      importModule("/src/data/package/fromProjection.ts"),
      importModule("/src/data/package/persist.ts"),
      importModule("/src/data/fs/memoryFs.ts"),
      importModule("/src/data/export/epubExport.ts"),
      importModule("/node_modules/.vite/deps/fflate.js"),
    ]);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const name = relativePath.split("/").pop() || "paper.pdf";
    const file = new File([bytes], name, { type: "application/pdf" });
    const started = performance.now();
    const result = await extractAcademicPdf({
      paperId: `capacity-${sha256.slice(0, 16)}`,
      filePath: relativePath,
      fileHash: sha256,
      file,
      extractFigures: true,
    });

    // Capacity is dominated by document reflow and retained visual assets.  A
    // MADLAD run is deliberately outside this benchmark, so make its normal
    // fallback behavior explicit rather than counting an empty ja.md export.
    for (const block of result.blocks) {
      block.translated = block.original;
      block.translationStatus = "completed";
    }
    result.paper.titleTranslated = result.paper.titleOriginal;
    for (const section of result.sections) section.translatedTitle = section.originalTitle;

    const pkg = projectionToPackage({
      paper: result.paper,
      sections: result.sections,
      blocks: result.blocks,
    });
    const memoryFs = createMemoryFileSystem();
    await persistPaperPackage(memoryFs, pkg);
    const exported = await exportPaperEpub(memoryFs, result.paper.id, { optimizeImagesForMobile: true });
    const files = unzipSync(exported.epub) as Record<string, Uint8Array>;
    const imageEntries = Object.entries(files).filter(([name]) => name.startsWith("OEBPS/images/"));
    const expectedImageAssets = pkg.assets.filter((asset) => /^assets\/(?:figure|table)-/.test(asset.path));
    const archiveImageNames = new Set(imageEntries.map(([name]) => name.replace(/^OEBPS\/images\//, "").replace(/\.[^.]+$/, "")));
    const missingImageAssetCount = expectedImageAssets.filter((asset) => !archiveImageNames.has(asset.path.split("/").pop()!.replace(/\.[^.]+$/, ""))).length;
    const count = (type: string) => result.blocks.filter((block) => block.type === type).length;
    const packageAssetBytes = pkg.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    const epubAssetBytes = imageEntries.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0);
    const epubUncompressedBytes = Object.values(files).reduce((sum, file) => sum + file.byteLength, 0);
    const assetShare = epubUncompressedBytes ? epubAssetBytes / epubUncompressedBytes : 0;
    return {
      elapsedMs: Math.round(performance.now() - started),
      pageCount: result.paper.pageCount,
      epubBytes: exported.epub.byteLength,
      epubUncompressedBytes,
      packageAssetBytes,
      epubAssetBytes,
      epubAssetCount: imageEntries.length,
      expectedImageAssetCount: expectedImageAssets.length,
      missingImageAssetCount,
      figureBlocks: count("figure"),
      tableBlocks: count("table"),
      equationBlocks: count("equation"),
      textBlocks: result.blocks.filter((block) => ["paragraph", "heading", "reference", "footnote"].includes(block.type)).length,
      contentProfile: assetShare < 0.1 ? "text_centered" : assetShare < 0.5 ? "mixed" : "asset_centered",
    };
  }, { sourceUrl, relativePath: candidate.relativePath, sha256: candidate.sha256 });
}

async function main(): Promise<void> {
  const candidates = inventory();
  const byPath = new Map<string, Row>();
  const output: Output = has("--resume") && fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf8")) as Output
    : initialOutput(candidates);
  for (const row of output.rows) byPath.set(row.relativePath, row);
  // Corpus labels are inventory metadata, not measurement data. Refresh them
  // on resume so moving a fixture under _quarantine is reflected without
  // forcing an expensive re-run of an otherwise identical PDF.
  const corpusByPath = new Map(candidates.map((candidate) => [candidate.relativePath, candidate.corpus]));
  for (const row of output.rows) {
    const corpus = corpusByPath.get(row.relativePath);
    if (corpus) row.corpus = corpus;
  }

  const firstPathForHash = new Map<string, string>();
  for (const candidate of candidates) {
    const existing = firstPathForHash.get(candidate.sha256);
    if (!existing) firstPathForHash.set(candidate.sha256, candidate.relativePath);
    if (existing && !byPath.has(candidate.relativePath)) {
      const row: Row = { ...rowSource(candidate), status: "duplicate", duplicateOf: existing };
      output.rows.push(row);
      byPath.set(row.relativePath, row);
    }
  }
  output.inventory.uniqueContentFiles = firstPathForHash.size;
  output.inventory.duplicateFiles = candidates.length - firstPathForHash.size;
  writeCheckpoint(output);

  const skipPaths = skipOutputPath && fs.existsSync(skipOutputPath)
    ? new Set((JSON.parse(fs.readFileSync(skipOutputPath, "utf8")) as Output).rows.map((row) => row.relativePath))
    : new Set<string>();
  const uniqueCandidates = candidates
    .filter((candidate) => firstPathForHash.get(candidate.sha256) === candidate.relativePath)
    .filter((_, index) => index % shardCount === shardIndex);
  const pending = uniqueCandidates
    .filter((candidate) => !byPath.has(candidate.relativePath))
    .filter((candidate) => !skipPaths.has(candidate.relativePath))
    .slice(0, limit);
  if (pending.length === 0) {
    console.log(JSON.stringify({ outputPath, pending: 0, message: "No unmeasured unique PDFs." }));
    return;
  }

  const { server, browser, page: initialPage, baseUrl } = await openRuntime();
  let page = initialPage;
  page.setDefaultTimeout(timeoutMs);
  try {
    for (const [index, candidate] of pending.entries()) {
      let row: Row;
      try {
        const result = await runOne(page, baseUrl, candidate);
        row = { ...rowSource(candidate), status: "success", ...result };
      } catch (error) {
        row = {
          ...rowSource(candidate),
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      output.rows.push(row);
      byPath.set(row.relativePath, row);
      writeCheckpoint(output);
      console.log(JSON.stringify({ index: index + 1, total: pending.length, status: row.status, path: candidate.relativePath, elapsedMs: row.elapsedMs, error: row.error }));
      // A pathological PDF can leave Chromium's renderer in a poor state. A
      // fresh page keeps later measurements independent and preserves failures.
      if (row.status === "failed") {
        await page.close();
        page = await browser.newPage();
        page.setDefaultTimeout(timeoutMs);
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(JSON.stringify({ outputPath, shard: `${shardIndex}/${shardCount}`, measuredThisRun: pending.length }));
}

await main();
