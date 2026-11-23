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
    expect(applySqliteSchemaMigrations(raw)).toBe(10);
    expect(raw.exec("SELECT title, authors, original, translation, annotation FROM papers_fts")[0].values).toEqual([
      [" インタフェス design ", " smith ", " ui ux ", "", ""],
    ]);
    raw.close();
  });
});
