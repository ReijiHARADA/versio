/**
 * Before/after measurements for translation-time UI jank.
 *
 * Node: batcher registration, quality gate, sqlite/package checkpoint.
 * Browser: click / scroll / route latency and long tasks while block updates
 *          hit the real Reader and Library (Vite at VERSIO_URL).
 * MADLAD: wall time and main-thread lag at concurrency 8, 4, and 2.
 *
 *   npx tsx scripts/bench-translation-ui.ts
 *   npx tsx scripts/bench-translation-ui.ts --skip-browser
 *   npx tsx scripts/bench-translation-ui.ts --skip-madlad
 */
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMemoryFileSystem } from "../src/data/fs/memoryFs";
import { projectionToPackage } from "../src/data/package/fromProjection";
import { persistMetrics, persistPaperPackage, resetPersistMetrics } from "../src/data/package/persist";
import {
  documentPersistMetrics,
  flushDocumentPersist,
  rememberDocument,
  resetDocumentCache,
  resetDocumentPersistMetrics,
  updateDocumentBlock,
} from "../src/data/repositories/documentRepository";
import { openSqlite } from "../src/data/sqlite/client";
import { isPlausibleJaTranslation } from "../src/services/translation/quality";
import type { Paper, PaperBlock, Section } from "../src/types/paper";
import {
  BLOCK_UPDATE_COALESCE_MS,
  createBlockUpdateBatcher,
  setTranslationUiScrollPaused,
} from "../src/utils/batchBlockUpdates";

const SOURCE =
  "We evaluated the proposed method on three public datasets and report mean accuracy of 91.4% (SD = 1.2) compared with the baseline of 84.7%. The difference was significant (p < 0.01) across all folds.";
const TRANSLATED =
  "提案手法を3つの公開データセットで評価し、ベースラインの84.7%に対して平均精度91.4%（SD = 1.2）を報告する。差はすべてのフォールドで有意であった（p < 0.01）。";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function paperFixture(blockCount: number, sectionCount: number): {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
} {
  const now = new Date().toISOString();
  const paper: Paper = {
    id: "bench-paper",
    sourceFilePath: "bench.pdf",
    sourceFileHash: "bench-hash",
    titleOriginal: "Bench",
    titleTranslated: null,
    authors: ["Ada Lovelace"],
    publication: "Bench",
    year: 2024,
    pageCount: 12,
    processingStatus: "translating",
    needsTranslationResume: true,
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sections: Section[] = Array.from({ length: sectionCount }, (_, index) => ({
    id: `s${index}`,
    paperId: paper.id,
    parentSectionId: null,
    order: index,
    level: 1,
    originalTitle: `Section ${index}`,
    translatedTitle: null,
    normalizedKind: "other",
  }));
  const blocks: PaperBlock[] = Array.from({ length: blockCount }, (_, index) => ({
    id: `b${index}`,
    paperId: paper.id,
    sectionId: `s${index % sectionCount}`,
    type: "paragraph",
    order: index,
    pageStart: 1 + Math.floor(index / 40),
    pageEnd: 1 + Math.floor(index / 40),
    boundingBoxes: [{ page: 1, x: 40, y: 80 + (index % 40) * 12, width: 480, height: 10 }],
    original: `${SOURCE} Paragraph ${index}.`,
    translated: index < 8 ? TRANSLATED : null,
    extractionConfidence: 0.9,
    translationStatus: index < 8 ? "completed" : "pending",
    parentBlockId: null,
    metadata: {},
  }));
  return { paper, sections, blocks };
}

function benchBatcherLeak() {
  const apply = () => {};
  const one = createBlockUpdateBatcher(apply);
  const toggleOnce = () => {
    setTranslationUiScrollPaused(true);
    setTranslationUiScrollPaused(false);
  };
  const t0 = performance.now();
  for (let i = 0; i < 200; i += 1) toggleOnce();
  const oneMs = performance.now() - t0;
  one.dispose();

  const leaked = Array.from({ length: 400 }, () => createBlockUpdateBatcher(apply));
  const t1 = performance.now();
  for (let i = 0; i < 200; i += 1) toggleOnce();
  const leakedMs = performance.now() - t1;
  for (const batcher of leaked) batcher.dispose();
  return {
    coalesceMs: BLOCK_UPDATE_COALESCE_MS,
    toggle200With1BatcherMs: Number(oneMs.toFixed(2)),
    toggle200With400BatchersMs: Number(leakedMs.toFixed(2)),
  };
}

function benchQuality(iterations: number) {
  const t0 = performance.now();
  let accepted = 0;
  for (let i = 0; i < iterations; i += 1) {
    if (isPlausibleJaTranslation(TRANSLATED, `${SOURCE} Paragraph ${i}.`)) accepted += 1;
  }
  return {
    iterations,
    accepted,
    totalMs: Number((performance.now() - t0).toFixed(2)),
    perCallMs: Number(((performance.now() - t0) / iterations).toFixed(3)),
  };
}

async function benchPersist() {
  resetDocumentCache();
  resetPersistMetrics();
  resetDocumentPersistMetrics();
  const fs = createMemoryFileSystem();
  const db = await openSqlite(fs);
  const { paper, sections, blocks } = paperFixture(400, 20);
  const pkg = projectionToPackage({ paper, sections, blocks, revision: 0 });
  await persistPaperPackage(fs, pkg);
  rememberDocument(paper, sections, blocks.map((block) => ({ ...block })));

  const updates = 48;
  const tUpdates = performance.now();
  for (let i = 0; i < updates; i += 1) {
    const block = {
      ...blocks[i],
      translated: TRANSLATED,
      translationStatus: "completed" as const,
    };
    await updateDocumentBlock(fs, db, block);
  }
  const updateMs = performance.now() - tUpdates;

  const tFlush = performance.now();
  await flushDocumentPersist(fs, db, paper.id);
  const flushMs = performance.now() - tFlush;

  const loaded = JSON.stringify({
    ja: pkg.translatedMarkdown.length,
    structure: JSON.stringify(pkg.structure).length,
    translation: JSON.stringify(pkg.translation).length,
  });

  const tExport = performance.now();
  const bytes = db.exportBytes();
  const exportMs = performance.now() - tExport;
  await db.close();

  return {
    blockUpdates: updates,
    updateDocumentBlockTotalMs: Number(updateMs.toFixed(2)),
    updateDocumentBlockPerMs: Number((updateMs / updates).toFixed(3)),
    checkpointFlushMs: Number(flushMs.toFixed(2)),
    sqliteExportMs: Number(exportMs.toFixed(2)),
    sqliteExportBytes: bytes.byteLength,
    packageChars: JSON.parse(loaded),
    mutableWrites: documentPersistMetrics.mutableWrites,
    fullPackageWritesDuringUpdates: persistMetrics.fullPackageWrites,
    sourcePdfWrites: persistMetrics.sourcePdfWrites,
    layoutWrites: persistMetrics.layoutWrites,
  };
}

async function eventLoopLag(concurrency: number, tasks: number) {
  const lags: number[] = [];
  let stopped = false;
  const probe = setInterval(() => {
    const start = performance.now();
    setTimeout(() => {
      if (!stopped) lags.push(performance.now() - start);
    }, 0);
  }, 40);

  let active = 0;
  let done = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      while (active < concurrency && done + active < tasks) {
        active += 1;
        setTimeout(() => {
          isPlausibleJaTranslation(TRANSLATED, SOURCE);
          active -= 1;
          done += 1;
          if (done >= tasks) resolve();
          else pump();
        }, 120);
      }
    };
    pump();
  });

  stopped = true;
  clearInterval(probe);
  await new Promise((resolve) => setTimeout(resolve, 30));
  return {
    concurrency,
    tasks,
    samples: lags.length,
    lagP50Ms: Number(percentile(lags, 50).toFixed(2)),
    lagP95Ms: Number(percentile(lags, 95).toFixed(2)),
    lagMaxMs: Number(percentile(lags, 100).toFixed(2)),
  };
}

function readMadladServerToken(): string {
  const fromEnv = process.env.MADLAD_SERVER_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const listing = execFileSync("lsof", ["-nP", "-iTCP:8765", "-sTCP:LISTEN"], { encoding: "utf8" });
    const pid = listing.match(/\s(\d+)\s/)?.[1];
    if (!pid) return "";
    const env = execFileSync("ps", ["eww", "-p", pid], { encoding: "utf8" });
    return env.match(/MADLAD_SERVER_TOKEN=(\S+)/)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function madladConcurrency(concurrency: number) {
  const texts = Array.from({ length: 8 }, (_, index) => `${SOURCE} Run ${index}.`);
  const lags: number[] = [];
  let stopped = false;
  const probe = setInterval(() => {
    const start = performance.now();
    setTimeout(() => {
      if (!stopped) lags.push(performance.now() - start);
    }, 0);
  }, 50);
  const started = performance.now();
  let cursor = 0;
  const outputs: number[] = [];
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= texts.length) return;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = readMadladServerToken();
      if (token) headers["X-Versio-Token"] = token;
      const response = await fetch("http://127.0.0.1:8765/translate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: texts[index],
          source_language: "en",
          target_language: "ja",
        }),
      });
      if (!response.ok) {
        throw new Error(`translate ${response.status} ${await response.text()}`);
      }
      const body = (await response.json()) as { text?: string };
      outputs.push((body.text ?? "").length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wallMs = performance.now() - started;
  stopped = true;
  clearInterval(probe);
  await new Promise((resolve) => setTimeout(resolve, 40));
  return {
    concurrency,
    requests: texts.length,
    wallMs: Number(wallMs.toFixed(0)),
    charsPerSec: Number(((texts.join("").length / wallMs) * 1000).toFixed(1)),
    outputChars: outputs.reduce((sum, value) => sum + value, 0),
    mainThreadLagP50Ms: Number(percentile(lags, 50).toFixed(2)),
    mainThreadLagP95Ms: Number(percentile(lags, 95).toFixed(2)),
  };
}

async function browserBench() {
  const { chromium } = await import("@playwright/test");
  const base = process.env.VERSIO_URL ?? "http://127.0.0.1:5173";
  const browser = await chromium.launch({ headless: true });
  try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const tasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: true });
    (window as unknown as { __longTasks: number[] }).__longTasks = tasks;
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);

  const seed = await page.evaluate(async () => {
    const cacheMod = await import("/src/stores/libraryCache.ts");
    const sampleMod = await import("/src/data/samplePaper.ts");
    const cache = cacheMod.useLibraryCache.getState();
    const sample = sampleMod.samplePaper;
    const sections = sampleMod.sampleSections as Array<{ id: string; paperId: string }>;
    const baseBlocks = sampleMod.sampleBlocks as Array<Record<string, unknown>>;
    const blocks = Array.from({ length: 360 }, (_, index) => {
      const template = baseBlocks[index % baseBlocks.length];
      return {
        ...template,
        id: `flood-${index}`,
        sectionId: sections[index % sections.length].id,
        order: index,
        original: `${String(template.original ?? "Paragraph")} (${index})`,
        translated: index % 5 === 0 ? "訳文" : null,
        translationStatus: index % 5 === 0 ? "completed" : "pending",
      };
    });
    const papers = Array.from({ length: 24 }, (_, index) => ({
      ...sample,
      id: index === 0 ? sample.id : `lib-${index}`,
      titleOriginal: `Library paper ${index}`,
      processingStatus: index === 0 ? "translating" : "ready",
    }));
    cache.setPapers(papers);
    cache.setSections(sample.id, sections as never);
    cache.setBlocks(sample.id, blocks as never);
    return { papers: papers.length, blocks: blocks.length, sections: sections.length };
  });
  const visibleCards = await page.locator("[data-paper-id]").count();
  if (visibleCards === 0) {
    const body = await page.locator("body").innerText();
    throw new Error(`seed produced no paper rows. body=${body.slice(0, 400)}`);
  }

  async function readTasks() {
    return page.evaluate(() => {
      const tasks = (window as unknown as { __longTasks: number[] }).__longTasks;
      const copy = tasks.slice();
      tasks.length = 0;
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return {
        count: copy.length,
        totalMs: Number(copy.reduce((sum, value) => sum + value, 0).toFixed(1)),
        maxMs: Number((copy.reduce((max, value) => Math.max(max, value), 0)).toFixed(1)),
        heapMb: memory ? Number((memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)) : null,
      };
    });
  }

  async function lagWhile(work: () => Promise<void>) {
    await page.evaluate(() => {
      const bucket: number[] = [];
      (window as unknown as { __lags: number[] }).__lags = bucket;
      const timer = window.setInterval(() => {
        const start = performance.now();
        window.setTimeout(() => bucket.push(performance.now() - start), 0);
      }, 50);
      (window as unknown as { __lagTimer: number }).__lagTimer = timer;
    });
    await readTasks();
    await work();
    const lags = await page.evaluate(() => {
      const timer = (window as unknown as { __lagTimer: number }).__lagTimer;
      window.clearInterval(timer);
      return (window as unknown as { __lags: number[] }).__lags;
    });
    const tasks = await readTasks();
    const sorted = [...lags].sort((a, b) => a - b);
    const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
    return {
      samples: lags.length,
      lagP50Ms: Number(pick(50).toFixed(1)),
      lagP95Ms: Number(pick(95).toFixed(1)),
      longTasks: tasks,
    };
  }

  const libraryFlood = page.evaluate(async () => {
    const cacheMod = await import("/src/stores/libraryCache.ts");
    const state = cacheMod.useLibraryCache.getState();
    const paperId = state.papers[0]?.id;
    let blocks = [...(state.blocks[paperId] ?? [])];
    for (let tick = 0; tick < 12; tick += 1) {
      blocks = blocks.map((block: { translated: string | null; translationStatus: string }, index: number) =>
        index >= tick * 8 && index < tick * 8 + 8
          ? { ...block, translated: `訳${tick}`, translationStatus: "completed" }
          : block
      );
      cacheMod.useLibraryCache.getState().setBlocks(paperId, blocks);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  });
  const library = await lagWhile(async () => {
    await page.waitForTimeout(250);
    const clickStart = performance.now();
    await page.getByRole("link", { name: "お気に入り" }).click();
    await page.getByRole("heading", { name: "お気に入り", exact: true }).waitFor({ timeout: 10000 });
    (globalThis as { __libraryClickMs?: number }).__libraryClickMs = performance.now() - clickStart;
    await libraryFlood;
  });
  const libraryClickMs = Number(
    ((globalThis as { __libraryClickMs?: number }).__libraryClickMs ?? 0).toFixed(1)
  );

  await page.getByRole("link", { name: "すべての論文" }).click();
  await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 10000 });
  await page.locator('[data-paper-id="paper-001"], article').first().click();
  await page.getByTestId("reader-screen").waitFor({ timeout: 15000 });
  await page.getByTestId("reader-body").waitFor();

  const readerFlood = page.evaluate(async () => {
    const cacheMod = await import("/src/stores/libraryCache.ts");
    const batchMod = await import("/src/utils/batchBlockUpdates.ts");
    const paperId = "paper-001";
    const state = cacheMod.useLibraryCache.getState();
    let blocks = state.blocks[paperId] ?? [];
    const batcher = batchMod.createBlockUpdateBatcher((id: string, batch: Array<{ id: string }>) => {
      cacheMod.useLibraryCache.getState().setBlocks(id, (prev: Array<{ id: string }>) => {
        const map = new Map(batch.map((block) => [block.id, block]));
        return prev.map((block) => map.get(block.id) ?? block);
      });
    });
    for (let tick = 0; tick < 12; tick += 1) {
      for (let offset = 0; offset < 8; offset += 1) {
        const index = tick * 8 + offset;
        const block = blocks[index];
        if (!block) continue;
        batcher.push({ ...block, translated: `訳${tick}-${offset}`, translationStatus: "completed" });
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      blocks = cacheMod.useLibraryCache.getState().blocks[paperId] ?? blocks;
    }
    batcher.flush();
    batcher.dispose();
  });
  const reader = await lagWhile(async () => {
    await page.waitForTimeout(450);
    const scrollStart = performance.now();
    await page.getByTestId("reader-body").evaluate((element) => {
      element.scrollTop = 1200;
    });
    (globalThis as { __readerScrollMs?: number }).__readerScrollMs = performance.now() - scrollStart;
    await readerFlood;
  });
  const readerScrollMs = Number(
    ((globalThis as { __readerScrollMs?: number }).__readerScrollMs ?? 0).toFixed(1)
  );

  const observerChurn = await page.evaluate(async () => {
    let observes = 0;
    let unobserves = 0;
    let disconnects = 0;
    const proto = window.IntersectionObserver.prototype;
    const origObserve = proto.observe;
    const origUnobserve = proto.unobserve;
    const origDisconnect = proto.disconnect;
    proto.observe = function (target: Element) {
      observes += 1;
      return origObserve.call(this, target);
    };
    proto.unobserve = function (target: Element) {
      unobserves += 1;
      return origUnobserve.call(this, target);
    };
    proto.disconnect = function () {
      disconnects += 1;
      return origDisconnect.call(this);
    };
    const cacheMod = await import("/src/stores/libraryCache.ts");
    const paperId = "paper-001";
    const blocks = cacheMod.useLibraryCache.getState().blocks[paperId] ?? [];
    for (let tick = 0; tick < 6; tick += 1) {
      cacheMod.useLibraryCache.getState().setBlocks(
        paperId,
        blocks.map((block: { id: string }, index: number) =>
          index === tick ? { ...block, translated: `observer-${tick}` } : block
        )
      );
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    proto.observe = origObserve;
    proto.unobserve = origUnobserve;
    proto.disconnect = origDisconnect;
    return { observes, unobserves, disconnects };
  });

  const navStart = performance.now();
  await page.getByRole("button", { name: "ライブラリに戻る" }).click();
  await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 10000 });
  const routeMs = Number((performance.now() - navStart).toFixed(1));

  return {
    seed: { ...seed, visibleCards },
    libraryUpdateLag: library,
    libraryToFavoritesMs: libraryClickMs,
    readerUpdateLag: reader,
    readerScrollMs,
    routeToLibraryMs: routeMs,
    observerChurn,
  };
  } finally {
    await browser.close();
  }
}

async function main() {
  const onlyBrowser = process.argv.includes("--only-browser");
  const onlyMadlad = process.argv.includes("--only-madlad");
  const skipBrowser = onlyBrowser ? false : process.argv.includes("--skip-browser") || onlyMadlad;
  const skipMadlad = onlyMadlad ? false : onlyBrowser || process.argv.includes("--skip-madlad");
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
  };
  if (!onlyBrowser) {
    report.batcher = benchBatcherLeak();
    report.quality = benchQuality(200);
    report.persist = await benchPersist();
    report.eventLoop = [
      await eventLoopLag(8, 24),
      await eventLoopLag(4, 24),
      await eventLoopLag(2, 24),
    ];
  }
  if (!skipMadlad) {
    try {
      const health = await fetch("http://127.0.0.1:8765/health");
      report.madladHealth = health.ok ? await health.json() : { status: health.status };
      report.madladWarmup = await madladConcurrency(1);
      report.madlad = [
        await madladConcurrency(2),
        await madladConcurrency(4),
        await madladConcurrency(8),
      ];
    } catch (error) {
      report.madladError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!skipBrowser) {
    try {
      report.browser = await browserBench();
    } catch (error) {
      report.browserError = error instanceof Error ? error.stack ?? error.message : String(error);
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

await main();
