import { afterEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import {
  packageLoadMetrics,
  persistPaperPackage,
  resetPackageLoadMetrics,
} from "../../data/package/persist";
import {
  documentPersistMetrics,
  flushDocumentPersist,
  loadDocument,
  openDocumentsReadOnly,
  resetDocumentCache,
  resetDocumentPersistMetrics,
} from "../../data/repositories/documentRepository";
import { openSqlite } from "../../data/sqlite/client";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-14T00:00:00.000Z";

function makePaper(id: string): {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
} {
  const paper: Paper = {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: `hash-${id}`,
    titleOriginal: `Title ${id}`,
    titleTranslated: `題名 ${id}`,
    authors: ["Ada"],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "ready",
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
      originalTitle: "Abstract",
      translatedTitle: "概要",
      normalizedKind: "abstract",
    },
  ];
  const blocks: PaperBlock[] = [
    {
      id: `${id}-b1`,
      paperId: id,
      sectionId: `${id}-s1`,
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: `Body for ${id}`,
      translated: `本文 ${id}`,
      extractionConfidence: 1,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {},
    },
  ];
  return { paper, sections, blocks };
}

afterEach(() => {
  resetDocumentCache();
  resetDocumentPersistMetrics();
  resetPackageLoadMetrics();
});

describe("document cache dirty tracking", () => {
  it("does not rewrite packages after 100 read-only opens and close flush", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    const papers: Paper[] = [];
    for (let i = 0; i < 100; i++) {
      const sample = makePaper(`ro-${i}`);
      papers.push(sample.paper);
      await persistPaperPackage(
        fs,
        projectionToPackage({
          ...sample,
          sourcePdf: new Uint8Array([1, 2, 3, i % 256]),
        })
      );
    }

    resetPackageLoadMetrics();
    resetDocumentPersistMetrics();
    await openDocumentsReadOnly(fs, papers);
    expect(packageLoadMetrics.documentReads).toBe(100);
    expect(packageLoadMetrics.sourcePdfReads).toBe(0);
    expect(packageLoadMetrics.assetReads).toBe(0);

    await flushDocumentPersist(fs, db);
    expect(documentPersistMetrics.fullPackageWrites).toBe(0);
    expect(documentPersistMetrics.mutableWrites).toBe(0);
    expect(documentPersistMetrics.skippedCleanFlushes).toBeGreaterThanOrEqual(100);
    await db.close();
  });

  it("loads document without pulling source.pdf bytes into cache", async () => {
    const fs = createMemoryFileSystem();
    const sample = makePaper("lazy-1");
    const pdf = new Uint8Array([9, 9, 9, 9]);
    await persistPaperPackage(
      fs,
      projectionToPackage({ ...sample, sourcePdf: pdf })
    );
    resetPackageLoadMetrics();
    const loaded = await loadDocument(fs, sample.paper);
    expect(loaded.blocks).toHaveLength(1);
    expect(loaded.sourcePdf).toBeUndefined();
    expect(loaded.dirty).toBe(false);
    expect(packageLoadMetrics.sourcePdfReads).toBe(0);
  });
});
