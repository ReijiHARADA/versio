/**
 * Synthetic large-library fixture + lightweight metrics for deciding whether
 * sql.js → native SQLite migration is warranted. Does not rewrite persistence.
 *
 * Usage:
 *   npx tsx scripts/bench-library-scale.ts --count 100
 *   npx tsx scripts/bench-library-scale.ts --count 500
 */
import { createMemoryFileSystem } from "../src/data/fs/memoryFs";
import { projectionToPackage } from "../src/data/package/fromProjection";
import { persistPaperPackage } from "../src/data/package/persist";
import {
  flushDocumentPersist,
  loadDocument,
  resetDocumentCache,
  resetDocumentPersistMetrics,
} from "../src/data/repositories/documentRepository";
import {
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
  const sections: Section[] = [
    {
      id: `${id}-s1`,
      paperId: id,
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Introduction",
      translatedTitle: "はじめに",
      normalizedKind: "introduction",
    },
  ];
  const blocks: PaperBlock[] = Array.from({ length: 12 }, (_, j) => ({
    id: `${id}-b${j}`,
    paperId: id,
    sectionId: `${id}-s1`,
    type: "paragraph" as const,
    order: j,
    pageStart: 1,
    pageEnd: 1,
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

async function main(): Promise<void> {
  const count = parseCount();
  const fs = createMemoryFileSystem();
  const t0 = performance.now();
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
  const buildMs = performance.now() - t0;

  resetDocumentCache();
  resetDocumentPersistMetrics();
  const tLoad = performance.now();
  for (const paper of papers) {
    await loadDocument(fs, paper);
  }
  const loadMs = performance.now() - tLoad;

  const tSearch = performance.now();
  const hits = searchPapersFts(db, "KeywordZulu");
  const searchMs = performance.now() - tSearch;

  const tFlush = performance.now();
  await flushDocumentPersist(fs, db);
  await db.persist();
  const flushMs = performance.now() - tFlush;
  const sqliteBytes = db.exportBytes().byteLength;

  const report = {
    count,
    buildMs: Math.round(buildMs),
    openAllPapersMs: Math.round(loadMs),
    searchLatencyMs: Number(searchMs.toFixed(2)),
    searchHitCount: hits.length,
    sqliteBytes,
    shutdownPersistMs: Math.round(flushMs),
    note:
      "In-memory fixture. Use as a relative signal for sql.js cost before considering native SQLite.",
  };
  console.log(JSON.stringify(report, null, 2));
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
