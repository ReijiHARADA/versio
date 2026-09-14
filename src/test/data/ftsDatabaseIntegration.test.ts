import { beforeEach, describe, expect, it } from "vitest";
import { resetStorageForTests } from "../../data/runtime";
import { projectionToPackage } from "../../data/package/fromProjection";
import { persistPaperPackage } from "../../data/package/persist";
import { indexPaperText } from "../../data/repositories/paperRepository";
import {
  deleteAnnotation,
  saveAnnotation,
  savePaper,
  searchLibraryPaperIds,
} from "../../services/database";
import type { Annotation } from "../../types/annotation";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-09-14T00:00:00.000Z";

function fixture(): { paper: Paper; sections: Section[]; blocks: PaperBlock[] } {
  const paper: Paper = {
    id: "fts-db-1",
    sourceFilePath: "a.pdf",
    sourceFileHash: "hash-fts-db",
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
  const sections: Section[] = [
    {
      id: "s1",
      paperId: paper.id,
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Intro",
      translatedTitle: "はじめに",
      normalizedKind: "introduction",
    },
  ];
  const blocks: PaperBlock[] = [
    {
      id: "b1",
      paperId: paper.id,
      sectionId: "s1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "OriginalCharlie body",
      translated: "翻訳デルタ本文",
      extractionConfidence: 1,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {},
    },
  ];
  return { paper, sections, blocks };
}

describe("FTS via database service", () => {
  beforeEach(async () => {
    await resetStorageForTests();
  });

  it("updates library search immediately on annotation CRUD", async () => {
    const { paper, sections, blocks } = fixture();
    const { getStorage } = await import("../../data/runtime");
    const { fs, db } = await getStorage();
    const pkg = projectionToPackage({ paper, sections, blocks });
    await persistPaperPackage(fs, pkg);
    await savePaper(paper);
    indexPaperText(db, paper, pkg.originalMarkdown, pkg.translatedMarkdown);

    expect(await searchLibraryPaperIds("UniqueTitleAlpha")).toContain("fts-db-1");
    expect(await searchLibraryPaperIds("AuthorBravo")).toContain("fts-db-1");
    expect(await searchLibraryPaperIds("OriginalCharlie")).toContain("fts-db-1");
    expect(await searchLibraryPaperIds("翻訳デルタ")).toContain("fts-db-1");
    expect(await searchLibraryPaperIds("MemoEcho")).toEqual([]);

    const annotation: Annotation = {
      id: "ann-db-1",
      paperId: paper.id,
      workspaceNodeId: null,
      blockId: "b1",
      startOffset: 0,
      endOffset: 4,
      selectedText: "body",
      prefixContext: "",
      suffixContext: "",
      translationTextHash: "x",
      note: "MemoEcho saved via database",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await saveAnnotation(annotation);
    expect(await searchLibraryPaperIds("MemoEcho")).toContain("fts-db-1");

    await saveAnnotation({ ...annotation, note: "MemoFoxtrot updated", updatedAt: now });
    expect(await searchLibraryPaperIds("MemoEcho")).toEqual([]);
    expect(await searchLibraryPaperIds("MemoFoxtrot")).toContain("fts-db-1");

    await deleteAnnotation(annotation.id);
    expect(await searchLibraryPaperIds("MemoFoxtrot")).toEqual([]);
    expect(await searchLibraryPaperIds("OriginalCharlie")).toContain("fts-db-1");
  });
});
