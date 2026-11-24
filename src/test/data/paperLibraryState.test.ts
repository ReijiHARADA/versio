import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";
import { applySqliteSchemaMigrations } from "../../data/sqlite/migrateSchema";
import { getPaperIndex, upsertPaperIndex } from "../../data/repositories/paperRepository";
import { normalizeTags } from "../../services/paperLibraryState";
import { filterPapers } from "../../components/library/LibrarySortMenu";
import type { Paper } from "../../types/paper";

const now = "2026-11-22T00:00:00.000Z";
const makePaper = (id: string, extra: Partial<Paper> = {}): Paper => ({
  id,
  sourceFilePath: `${id}.pdf`,
  sourceFileHash: `hash-${id}`,
  titleOriginal: id,
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

describe("paper library state in SQLite", () => {
  let db: SqliteClient;
  beforeEach(async () => {
    db = await openSqlite(createMemoryFileSystem());
  });

  it("defaults to unread with no tags", () => {
    upsertPaperIndex(db, makePaper("p1"));
    expect(getPaperIndex(db, "p1")).toMatchObject({ readStatus: "unread", tags: [] });
  });

  it("stores status and tags, and keeps them when a paper without them is upserted", () => {
    upsertPaperIndex(db, makePaper("p1", { readStatus: "read", tags: ["HCI", "survey"] }));
    // e.g. a Paper rebuilt from paper.json, which never carries library state
    upsertPaperIndex(db, makePaper("p1", { titleOriginal: "renamed" }));
    expect(getPaperIndex(db, "p1")).toMatchObject({
      titleOriginal: "renamed",
      readStatus: "read",
      tags: ["HCI", "survey"],
    });
  });

  it("clears tags when an empty list is written", () => {
    upsertPaperIndex(db, makePaper("p1", { tags: ["x"] }));
    upsertPaperIndex(db, makePaper("p1", { tags: [] }));
    expect(getPaperIndex(db, "p1")?.tags).toEqual([]);
  });

  it("migrates v7 libraries: opened papers become reading", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE papers (id TEXT PRIMARY KEY, last_opened_at TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '7');
      INSERT INTO papers (id, last_opened_at) VALUES ('opened', 't'), ('fresh', NULL);
    `);
    expect(applySqliteSchemaMigrations(raw)).toBe(12);
    const rows = raw.exec("SELECT id, read_status, tags_json FROM papers ORDER BY id")[0].values;
    expect(rows).toEqual([
      ["fresh", "unread", "[]"],
      ["opened", "reading", "[]"],
    ]);
    raw.close();
  });
});

describe("normalizeTags", () => {
  it("trims, collapses spaces, and drops empty / case-insensitive duplicates", () => {
    expect(normalizeTags([" HCI ", "hci", "", "deep   learning", "読書会"])).toEqual([
      "HCI",
      "deep learning",
      "読書会",
    ]);
  });
});

describe("filterPapers", () => {
  const papers = [
    makePaper("a", { readStatus: "read", tags: ["HCI"] }),
    makePaper("b", { readStatus: "reading", tags: ["HCI", "ML"] }),
    makePaper("c"),
  ];
  it("filters by tag and ignores the retired read-status filter", () => {
    expect(filterPapers(papers, { status: null, tag: null, duplicates: false })).toBe(papers);
    expect(filterPapers(papers, { status: "unread", tag: null, duplicates: false })).toBe(papers);
    expect(filterPapers(papers, { status: null, tag: "HCI", duplicates: false }).map((p) => p.id)).toEqual(["a", "b"]);
  });
});
