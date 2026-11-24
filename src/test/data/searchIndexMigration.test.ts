import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { applySqliteSchemaMigrations } from "../../data/sqlite/migrateSchema";

describe("schema v9 → v10", () => {
  it("rewrites existing search rows as normalized index text", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE papers_fts (paper_id TEXT PRIMARY KEY, title TEXT, authors TEXT, original TEXT, translation TEXT, annotation TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '9');
      INSERT INTO papers_fts VALUES ('p1', 'インターフェース Design', 'Ｓｍｉｔｈ', 'UI/UX', NULL, '');
    `);
    expect(applySqliteSchemaMigrations(raw)).toBe(13);
    expect(raw.exec("SELECT title, authors, original, translation, annotation FROM papers_fts")[0].values).toEqual([
      [" インタフェス design ", " smith ", " ui ux ", "", ""],
    ]);
    raw.close();
  });
});

describe("schema v10 → v11", () => {
  it("adds library_terms and asks the package sync to backfill them", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE papers (id TEXT PRIMARY KEY);
      INSERT INTO meta (key, value) VALUES ('schema_version', '10');
    `);
    expect(applySqliteSchemaMigrations(raw)).toBe(13);
    expect(raw.exec("SELECT value FROM meta WHERE key = 'library_terms_backfill'")[0].values).toEqual([["pending"]]);
    expect(raw.exec("SELECT COUNT(*) FROM library_terms")[0].values).toEqual([[0]]);
    raw.close();
  });
});

describe("schema v11 → v12", () => {
  it("fills paper_words from the stored search text", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE papers (id TEXT PRIMARY KEY);
      CREATE TABLE papers_fts (paper_id TEXT PRIMARY KEY, title TEXT, authors TEXT, original TEXT, translation TEXT, annotation TEXT);
      INSERT INTO meta (key, value) VALUES ('schema_version', '11');
      INSERT INTO papers_fts VALUES ('p1', '', '', '', ' 蚊が飛ぶ ', '');
    `);
    expect(applySqliteSchemaMigrations(raw)).toBe(13);
    expect(raw.exec("SELECT words FROM paper_words")[0].values).toEqual([[" 蚊 が "]]);
    raw.close();
  });
});

describe("schema v12 → v13", () => {
  it("adds folder colors and a case-insensitive tag color table", async () => {
    const req = createRequire(import.meta.url);
    const wasm = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer,
    });
    const raw = new SQL.Database();
    raw.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE workspace_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '12');
      INSERT INTO workspace_nodes VALUES ('n1', 'Folder');
    `);
    expect(applySqliteSchemaMigrations(raw)).toBe(13);
    raw.run("UPDATE workspace_nodes SET color = 'red'");
    raw.run("INSERT INTO tag_colors VALUES ('HCI', 'blue')");
    raw.run("INSERT INTO tag_colors VALUES ('hci', 'green') ON CONFLICT(tag) DO UPDATE SET color = excluded.color");
    expect(raw.exec("SELECT color FROM workspace_nodes")[0].values).toEqual([["red"]]);
    expect(raw.exec("SELECT tag, color FROM tag_colors")[0].values).toEqual([["HCI", "green"]]);
    raw.close();
  });
});
