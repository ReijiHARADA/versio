/**
 * Synthetic large-library fixture + metrics for sql.js cost signals.
 * Does not trigger native SQLite migration by itself.
 *
 * Usage:
 *   npm run bench:library -- --count 100
 *   npm run bench:library -- --count 500
 */
import { createMemoryFileSystem } from "../src/data/fs/memoryFs";
import { projectionToPackage } from "../src/data/package/fromProjection";
import { persistPaperPackage } from "../src/data/package/persist";
import {
  flushDocumentPersist,
  loadDocument,
  peekDocument,
  resetDocumentCache,
  resetDocumentPersistMetrics,
} from "../src/data/repositories/documentRepository";
import {
  getAllPaperIndexes,
  indexPaperText,
  upsertPaperIndex,
} from "../src/data/repositories/paperRepository";
import { openSqlite } from "../src/data/sqlite/client";
import { searchPapersFts } from "../src/data/sqlite/fts";
import type { Paper, PaperBlock, Section } from "../src/types/paper";

function parseCount(): number {
  const idx = process.argv.indexOf("--count");
  const raw = idx >= 0 ? Number(process.argv[idx + 1]) : 100;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
}

function sample(i: number): { paper: Paper; sections: Section[]; blocks: PaperBlock[] } {
  const id = `bench-${i}`;
  const now = new Date().toISOString();
  const paper: Paper = {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: `hash-${id}`,
    titleOriginal: `Synthetic Paper ${i} KeywordZulu`,
    titleTranslated: `合成論文 ${i}`,
    authors: [`Author${i % 17}`],
    publication: null,
    year: 2020 + (i % 6),
    pageCount: 8 + (i % 20),
    processingStatus: "ready",
    needsTranslationResume: false,
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sectionCount = 3 + (i % 5);
  const sections: Section[] = Array.from({ length: sectionCount }, (_, s) => ({
    id: `${id}-s${s}`,
    paperId: id,
    parentSectionId: null,
    order: s,
    level: 1,
    originalTitle: `Section ${s}`,
    translatedTitle: `節 ${s}`,
    normalizedKind: s === 0 ? "introduction" : "body",
  }));
  const blocks: PaperBlock[] = Array.from({ length: 24 }, (_, j) => ({
    id: `${id}-b${j}`,
    paperId: id,
    sectionId: `${id}-s${j % sectionCount}`,
    type: "paragraph" as const,
    order: j,
    pageStart: 1 + Math.floor(j / 8),
    pageEnd: 1 + Math.floor(j / 8),
    boundingBoxes: [],
    original: `Paragraph ${j} of paper ${i} with shared token SharedOmega.`,
    translated: `論文 ${i} の段落 ${j}。共有語 SharedOmega。`,
    extractionConfidence: 1,
    translationStatus: "completed" as const,
    parentBlockId: null,
    metadata: {},
  }));
  return { paper, sections, blocks };
}

function estimateRendererMemoryBytes(paperIds: string[]): number {
  let bytes = 0;
  for (const paperId of paperIds) {
    const cached = peekDocument(paperId);
    if (!cached) continue;
    for (const block of cached.blocks) {
      bytes += (block.original?.length ?? 0) + (block.translated?.length ?? 0);
    }
    for (const section of cached.sections) {
      bytes += (section.originalTitle?.length ?? 0) + (section.translatedTitle?.length ?? 0);
    }
  }
  return bytes;
}

async function main(): Promise<void> {
  const count = parseCount();
  const fs = createMemoryFileSystem();
  const tBuild = performance.now();
  const db = await openSqlite(fs);
  const papers: Paper[] = [];

  for (let i = 0; i < count; i++) {
    const item = sample(i);
    papers.push(item.paper);
    const pkg = projectionToPackage({
      ...item,
      sourcePdf: new Uint8Array(64 * 1024).fill(i % 256),
    });
    await persistPaperPackage(fs, pkg);
    upsertPaperIndex(db, item.paper);
    indexPaperText(db, item.paper, pkg.originalMarkdown, pkg.translatedMarkdown);
  }
  const buildMs = performance.now() - tBuild;

  const tStartup = performance.now();
  const indexed = getAllPaperIndexes(db);
  const startupMs = performance.now() - tStartup;

  resetDocumentCache();
  resetDocumentPersistMetrics();
  const tLoad = performance.now();
  for (const paper of papers) {
    await loadDocument(fs, paper);
  }
  const openAllPapersMs = performance.now() - tLoad;
  const rendererMemoryBytes = estimateRendererMemoryBytes(papers.map((p) => p.id));

  const tSearch = performance.now();
  const hits = searchPapersFts(db, "KeywordZulu");
  const searchLatencyMs = performance.now() - tSearch;

  const tFlush = performance.now();
  await flushDocumentPersist(fs, db);
  await db.persist();
  const shutdownPersistMs = performance.now() - tFlush;
  const sqliteBytes = db.exportBytes().byteLength;

  const report = {
    count,
    fixture: { papers: count, sectionsPerPaper: "3-7", blocksPerPaper: 24 },
    buildMs: Math.round(buildMs),
    startupMs: Math.round(startupMs),
    startupPaperCount: indexed.length,
    openAllPapersMs: Math.round(openAllPapersMs),
    rendererMemoryBytes,
    searchLatencyMs: Number(searchLatencyMs.toFixed(2)),
    searchHitCount: hits.length,
    sqliteBytes,
    shutdownPersistMs: Math.round(shutdownPersistMs),
    note:
      "In-memory sql.js fixture. Use as a relative signal before considering native SQLite.",
  };
  console.log(JSON.stringify(report, null, 2));
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
