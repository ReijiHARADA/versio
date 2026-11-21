import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";
import { getPaperIndex, upsertPaperIndex } from "../../data/repositories/paperRepository";
import { findDuplicatePaperIds, findSimilarPaper, normalizeDoi, titleKey } from "../../domain/duplicatePapers";
import type { Paper } from "../../types/paper";

const now = "2026-11-22T00:00:00.000Z";
const makePaper = (id: string, extra: Partial<Paper> = {}): Paper => ({
  id,
  sourceFilePath: `${id}.pdf`,
  sourceFileHash: `hash-${id}`,
  titleOriginal: null,
  titleTranslated: null,
  authors: [],
  publication: null,
  year: null,
  pageCount: 1,
  processingStatus: "ready",
  lastReadBlockId: null,
  lastReadOffset: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

describe("duplicate keys", () => {
  it("normalizes DOIs and titles", () => {
    expect(normalizeDoi(" https://doi.org/10.1038/NATURE14539 ")).toBe("10.1038/nature14539");
    expect(normalizeDoi("doi:10.1/x")).toBe("10.1/x");
    expect(normalizeDoi("")).toBeNull();
    expect(titleKey("Attention Is All You Need!")).toBe(titleKey("attention is all  you need"));
    expect(titleKey("Introduction")).toBeNull();
    expect(titleKey("言語を越えて論文を読むための仕組み")).not.toBeNull();
  });

  it("groups papers sharing a DOI or a title and skips trashed ones", () => {
    const papers = [
      makePaper("a", { doi: "10.1/x", titleOriginal: "Preprint title of the work" }),
      makePaper("b", { doi: "https://doi.org/10.1/X", titleOriginal: "Published title, renamed later" }),
      makePaper("c", { titleOriginal: "Published title — renamed later" }),
      makePaper("d", { titleOriginal: "Something else entirely here" }),
      makePaper("e", { doi: "10.1/x", trashedAt: now }),
    ];
    const groups = findDuplicatePaperIds(papers);
    expect([...groups.keys()].sort()).toEqual(["a", "b", "c"]);
    // b joins a via DOI and c via title: all three end up in one group.
    expect(new Set(groups.values()).size).toBe(1);
    expect(findSimilarPaper(makePaper("new", { doi: "10.1/x" }), papers)?.id).toBe("a");
    expect(findSimilarPaper(makePaper("new", { titleOriginal: "Something Else Entirely Here" }), papers)?.id).toBe("d");
    expect(findSimilarPaper(papers[3], papers)).toBeUndefined();
  });
});

describe("papers.doi index column", () => {
  let db: SqliteClient;
  beforeEach(async () => {
    db = await openSqlite(createMemoryFileSystem());
  });

  it("stores a lowercased DOI, keeps it for index-only papers, clears it on null", () => {
    upsertPaperIndex(db, makePaper("p", { doi: "10.1/ABC" }));
    expect(getPaperIndex(db, "p")?.doi).toBe("10.1/abc");
    upsertPaperIndex(db, makePaper("p", { titleOriginal: "renamed" }));
    expect(getPaperIndex(db, "p")?.doi).toBe("10.1/abc");
    upsertPaperIndex(db, makePaper("p", { doi: null }));
    expect(getPaperIndex(db, "p")?.doi).toBeNull();
  });
});
