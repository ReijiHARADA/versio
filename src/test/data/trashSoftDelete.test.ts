import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import {
  addPaperToWorkspace,
  createWorkspaceNode,
  listAllWorkspacePapers,
  listTrashedWorkspaceNodes,
  listWorkspaceNodes,
  restoreWorkspaceTrashRoot,
  trashWorkspaceSubtree,
} from "../../data/repositories/workspaceRepository";
import {
  getAllPaperIndexes,
  getPaperIndex,
  getPaperIndexByHash,
  getTrashedPaperIndexes,
  setPaperTrashedAt,
  upsertPaperIndex,
} from "../../data/repositories/paperRepository";
import { searchPapersFts, rebuildPaperFts } from "../../data/sqlite/fts";
import { openSqlite, type SqliteClient } from "../../data/sqlite/client";
import { applySqliteSchemaMigrations } from "../../data/sqlite/migrateSchema";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TRASH_RETENTION_DAYS,
  normalizeTrashRetentionDays,
  trashExpiryCutoffIso,
} from "../../services/trashRetention";
import type { Paper } from "../../types/paper";

const now = "2026-09-15T12:00:00.000Z";

function makePaper(id: string, hash = `hash-${id}`): Paper {
  return {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: hash,
    titleOriginal: `Title ${id}`,
    titleTranslated: `題名 ${id}`,
    authors: [],
    publication: null,
    year: null,
    pageCount: 1,
    processingStatus: "ready",
    lastReadBlockId: null,
    lastReadOffset: null,
    favorite: true,
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
}

describe("trash / soft-delete", () => {
  let db: SqliteClient;

  beforeEach(async () => {
    db = await openSqlite(createMemoryFileSystem());
  });

  it("moves a paper to trash without removing the index row", () => {
    upsertPaperIndex(db, makePaper("p1"));
    setPaperTrashedAt(db, "p1", now);

    expect(getAllPaperIndexes(db)).toHaveLength(0);
    expect(getTrashedPaperIndexes(db)).toHaveLength(1);
    expect(getPaperIndex(db, "p1")?.trashedAt).toBe(now);
    expect(getPaperIndex(db, "p1")?.favorite).toBe(true);
  });

  it("excludes trashed papers from FTS search while keeping hash uniqueness", () => {
    upsertPaperIndex(db, makePaper("p1"));
    rebuildPaperFts(db, "p1", {
      title: "Attention Is All You Need",
      authors: "Vaswani",
      original: "transformer",
      translation: "変換器",
      annotation: "",
    });
    setPaperTrashedAt(db, "p1", now);

    expect(searchPapersFts(db, "Attention")).toEqual([]);
    expect(getPaperIndexByHash(db, "hash-p1")?.id).toBe("p1");
    expect(() =>
      db.exec(
        "INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at) VALUES (?, ?, 'ready', ?, ?)",
        ["p2", "hash-p1", now, now]
      )
    ).toThrow();
  });

  it("restores paper state including favorite metadata", () => {
    upsertPaperIndex(db, makePaper("p1"));
    setPaperTrashedAt(db, "p1", now);
    setPaperTrashedAt(db, "p1", null);

    const restored = getPaperIndex(db, "p1");
    expect(restored?.trashedAt).toBeNull();
    expect(restored?.favorite).toBe(true);
    expect(getAllPaperIndexes(db)).toHaveLength(1);
  });

  it("trashes workspace folders without trashing papers or memberships", () => {
    createWorkspaceNode(db, { id: "root", name: "Root" });
    createWorkspaceNode(db, { id: "child", name: "Child", parentId: "root" });
    upsertPaperIndex(db, makePaper("paper"));
    addPaperToWorkspace(db, { nodeId: "child", paperId: "paper" });

    trashWorkspaceSubtree(db, "root", now);

    expect(listWorkspaceNodes(db)).toHaveLength(0);
    expect(listTrashedWorkspaceNodes(db).map((n) => n.id).sort()).toEqual(["child", "root"]);
    expect(getPaperIndex(db, "paper")?.trashedAt ?? null).toBeNull();
    expect(listAllWorkspacePapers(db)).toHaveLength(1);
  });

  it("restores folder subtree and memberships", () => {
    createWorkspaceNode(db, { id: "root", name: "Root" });
    createWorkspaceNode(db, { id: "child", name: "Child", parentId: "root" });
    upsertPaperIndex(db, makePaper("paper"));
    addPaperToWorkspace(db, { nodeId: "child", paperId: "paper" });
    trashWorkspaceSubtree(db, "root", now);

    const restored = restoreWorkspaceTrashRoot(db, "root");
    expect(restored.map((n) => n.id).sort()).toEqual(["child", "root"]);
    expect(listWorkspaceNodes(db).map((n) => n.id).sort()).toEqual(["child", "root"]);
    expect(listAllWorkspacePapers(db)[0]?.nodeId).toBe("child");
  });

  it("falls back to workspace root when parent is missing", () => {
    db.exec(
      `INSERT INTO workspace_nodes (id, parent_id, name, sort_order, trashed_at, trash_root_id, created_at, updated_at)
       VALUES ('orphan', 'missing-parent', 'Orphan', 0, ?, 'orphan', ?, ?)`,
      [now, now, now]
    );
    const restored = restoreWorkspaceTrashRoot(db, "orphan");
    expect(restored[0]?.parentId).toBeNull();
    expect(restored[0]?.trashedAt).toBeNull();
  });

  it("defaults retention to 3 days and only purges expired rows", () => {
    expect(DEFAULT_TRASH_RETENTION_DAYS).toBe(3);
    expect(normalizeTrashRetentionDays(99)).toBe(3);
    expect(normalizeTrashRetentionDays(7)).toBe(7);

    upsertPaperIndex(db, makePaper("fresh"));
    upsertPaperIndex(db, makePaper("old"));
    const freshAt = "2026-09-14T12:00:00.000Z";
    const oldAt = "2026-09-10T12:00:00.000Z";
    setPaperTrashedAt(db, "fresh", freshAt);
    setPaperTrashedAt(db, "old", oldAt);

    const cutoff = trashExpiryCutoffIso(3, new Date("2026-09-15T12:00:00.000Z"));
    expect(cutoff).toBe("2026-09-12T12:00:00.000Z");
    const expired = db
      .query("SELECT id FROM papers WHERE trashed_at IS NOT NULL AND trashed_at <= ?", [cutoff])
      .map((row) => String(row.id));
    expect(expired).toEqual(["old"]);
  });

  it("migrates v6 libraries to v7 soft-delete columns", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE papers (
        id TEXT PRIMARY KEY,
        source_file_hash TEXT NOT NULL,
        authors_json TEXT NOT NULL DEFAULT '[]',
        page_count INTEGER NOT NULL DEFAULT 0,
        processing_status TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        package_revision INTEGER NOT NULL DEFAULT 0,
        needs_translation_resume INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workspace_nodes (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '6');
      INSERT INTO papers (id, source_file_hash, processing_status, created_at, updated_at)
      VALUES ('p1', 'h1', 'ready', 't', 't');
      INSERT INTO workspace_nodes (id, parent_id, name, sort_order, created_at, updated_at)
      VALUES ('n1', NULL, 'Folder', 0, 't', 't');
    `);
    const version = applySqliteSchemaMigrations(raw);
    expect(version).toBe(7);
    const paperCols = raw.exec("PRAGMA table_info(papers)")[0].values.map((row) => String(row[1]));
    const nodeCols = raw.exec("PRAGMA table_info(workspace_nodes)")[0].values.map((row) => String(row[1]));
    expect(paperCols).toContain("trashed_at");
    expect(nodeCols).toContain("trashed_at");
    expect(nodeCols).toContain("trash_root_id");
    raw.close();
  });
});

describe("trash retention setting normalization", () => {
  it("rejects invalid values", () => {
    expect(normalizeTrashRetentionDays("nope")).toBe(3);
    expect(normalizeTrashRetentionDays(1.5)).toBe(3);
    expect(normalizeTrashRetentionDays(null)).toBe(3);
  });
});
