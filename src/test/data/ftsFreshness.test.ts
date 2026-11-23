import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite } from "../../data/sqlite/client";
import { searchPapersFts } from "../../data/sqlite/fts";
import {
  indexPaperText,
  refreshPaperAnnotationFts,
  upsertPaperIndex,
} from "../../data/repositories/paperRepository";
import { saveAnnotationRow, deleteAnnotationRow } from "../../data/repositories/annotationRepository";
import type { Paper } from "../../types/paper";
import type { Annotation } from "../../types/annotation";

const now = "2026-09-14T00:00:00.000Z";

function paper(): Paper {
  return {
    id: "fts-1",
    sourceFilePath: "a.pdf",
    sourceFileHash: "hash-fts",
    titleOriginal: "UniqueTitleAlpha",
    titleTranslated: "独自題名アルファ",
    authors: ["AuthorBravo"],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "ready",
    needsTranslationResume: false,
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("FTS incremental freshness", () => {
  it("reflects annotation create/update/delete without full library rebuild", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    const p = paper();
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "OriginalCharlie body text", "翻訳デルタ本文");

    expect(searchPapersFts(db, "UniqueTitleAlpha")).toContain("fts-1");
    expect(searchPapersFts(db, "AuthorBravo")).toContain("fts-1");
    expect(searchPapersFts(db, "OriginalCharlie")).toContain("fts-1");
    expect(searchPapersFts(db, "翻訳デルタ")).toContain("fts-1");
    expect(searchPapersFts(db, "MemoEcho")).toEqual([]);

    const annotation: Annotation = {
      id: "ann-1",
      paperId: "fts-1",
      workspaceNodeId: null,
      blockId: "b1",
      startOffset: 0,
      endOffset: 4,
      selectedText: "body",
      prefixContext: "",
      suffixContext: "",
      translationTextHash: "x",
      note: "MemoEcho note",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    saveAnnotationRow(db, annotation);
    refreshPaperAnnotationFts(db, "fts-1");
    expect(searchPapersFts(db, "MemoEcho")).toContain("fts-1");

    annotation.note = "MemoFoxtrot updated";
    annotation.updatedAt = now;
    saveAnnotationRow(db, annotation);
    refreshPaperAnnotationFts(db, "fts-1");
    expect(searchPapersFts(db, "MemoEcho")).toEqual([]);
    expect(searchPapersFts(db, "MemoFoxtrot")).toContain("fts-1");

    deleteAnnotationRow(db, "ann-1");
    refreshPaperAnnotationFts(db, "fts-1");
    expect(searchPapersFts(db, "MemoFoxtrot")).toEqual([]);
    expect(searchPapersFts(db, "OriginalCharlie")).toContain("fts-1");
    await db.close();
  });

  it("refreshes translation column after checkpoint-style reindex", async () => {
    const fs = createMemoryFileSystem();
    const db = await openSqlite(fs);
    const p = paper();
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "OriginalCharlie", "初訳");
    expect(searchPapersFts(db, "完訳ゴルフ")).toEqual([]);
    indexPaperText(db, p, "OriginalCharlie", "完訳ゴルフ本文");
    expect(searchPapersFts(db, "完訳ゴルフ")).toContain("fts-1");
    await db.close();
  });
});

describe("normalized library search", () => {
  it("absorbs spelling variants, ranks title hits first and checks short words", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const titleHit = { ...paper(), id: "title-hit", sourceFileHash: "h1", titleOriginal: "インターフェース設計" };
    const bodyHit = { ...paper(), id: "body-hit", sourceFileHash: "h2", titleOriginal: "Other" };
    upsertPaperIndex(db, titleHit);
    upsertPaperIndex(db, bodyHit);
    indexPaperText(db, titleHit, "", "");
    indexPaperText(db, bodyHit, "BUILD pipeline", "ユーザ・インタフェースの評価");

    expect(searchPapersFts(db, "インタフェース")).toEqual(["title-hit", "body-hit"]);
    expect(searchPapersFts(db, "ユーザーインターフェース")).toEqual(["body-hit"]);
    expect(searchPapersFts(db, "ui")).toEqual([]);
    expect(searchPapersFts(db, "build パイプライン")).toEqual([]);
    expect(searchPapersFts(db, "build pipeline")).toEqual(["body-hit"]);
  });

  it("keeps working after an annotation refresh re-reads stored text", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const p = paper();
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "Cognitive Load", "コンピューター");
    refreshPaperAnnotationFts(db, p.id);
    expect(searchPapersFts(db, "コンピュータ")).toEqual(["fts-1"]);
    expect(searchPapersFts(db, "cognitive load")).toEqual(["fts-1"]);
  });
});

describe("library search with the bundled synonym dictionary", () => {
  it("finds an English paper from a Japanese synonym and keeps exact hits first", async () => {
    const { readFileSync } = await import("node:fs");
    const { SynonymDictionary } = await import("../../domain/search/synonymDictionary");
    const { buildSearchQuery } = await import("../../domain/search/searchQuery");
    const dictionary = new SynonymDictionary(JSON.parse(readFileSync("src/generated/synonyms.json", "utf8")));
    const db = await openSqlite(createMemoryFileSystem());
    const english = { ...paper(), id: "en", sourceFileHash: "h-en", titleOriginal: "Measuring usability of wearables" };
    const japanese = { ...paper(), id: "ja", sourceFileHash: "h-ja", titleOriginal: "使いやすさの評価" };
    for (const p of [english, japanese]) {
      upsertPaperIndex(db, p);
      indexPaperText(db, p, "", "");
    }
    const query = buildSearchQuery("使いやすさ", { dictionary });
    expect(searchPapersFts(db, query)).toEqual(["ja", "en"]);
    expect(searchPapersFts(db, "使いやすさ")).toEqual(["ja"]);
  });
});

describe("search scoring function", () => {
  it("survives a persist (sql.js export reopens the database)", async () => {
    const db = await openSqlite(createMemoryFileSystem());
    const p = paper();
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "body", "");
    await db.persist();
    db.exportBytes();
    expect(searchPapersFts(db, "UniqueTitleAlpha")).toEqual(["fts-1"]);
  });
});

describe("library terms", () => {
  it("stores pairs a paper defines and drops them with the paper", async () => {
    const { listLibraryTerms, deletePaperIndex } = await import("../../data/repositories/paperRepository");
    const db = await openSqlite(createMemoryFileSystem());
    const p = paper();
    upsertPaperIndex(db, p);
    indexPaperText(db, p, "We use the System Usability Scale (SUS).", "認知負荷（cognitive load）を測る。");
    expect(listLibraryTerms(db)).toEqual(
      expect.arrayContaining([
        { term: "SUS", longForm: "System Usability Scale", papers: 1 },
        { term: "cognitive load", longForm: "認知負荷", papers: 1 },
      ])
    );
    refreshPaperAnnotationFts(db, p.id);
    expect(listLibraryTerms(db)).toHaveLength(2);
    deletePaperIndex(db, p.id);
    expect(listLibraryTerms(db)).toEqual([]);
  });
});
