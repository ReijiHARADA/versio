import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { SQLITE_SCHEMA_VERSION } from "../schemaVersion";

export type SqliteIntegrityResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  schemaVersion: number | null;
};

let SQL: SqlJsStatic | null = null;

async function loadSqlEngine(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  if (typeof window === "undefined") {
    const moduleSpec = "node:" + "module";
    const fsSpec = "node:" + "fs";
    const { createRequire } = (await import(/* @vite-ignore */ moduleSpec)) as {
      createRequire: (url: string) => { resolve: (id: string) => string };
    };
    const { readFileSync } = (await import(/* @vite-ignore */ fsSpec)) as {
      readFileSync: (path: string) => Uint8Array;
    };
    const req = createRequire(import.meta.url);
    const wasmBinary = readFileSync(req.resolve("sql.js/dist/sql-wasm.wasm"));
    SQL = await initSqlJs({
      wasmBinary: wasmBinary.buffer.slice(
        wasmBinary.byteOffset,
        wasmBinary.byteOffset + wasmBinary.byteLength
      ) as ArrayBuffer,
    });
    return SQL;
  }
  SQL = await initSqlJs({
    locateFile: (file) => new URL(`../../../node_modules/sql.js/dist/${file}`, import.meta.url).href,
  });
  return SQL;
}

function pragmaResults(db: Database, sql: string): string[] {
  const rows: string[] = [];
  const result = db.exec(sql);
  for (const table of result) {
    for (const values of table.values) {
      rows.push(String(values[0] ?? ""));
    }
  }
  return rows;
}

function tableNames(db: Database): Set<string> {
  const names = new Set<string>();
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  for (const table of result) {
    for (const values of table.values) {
      names.add(String(values[0]));
    }
  }
  return names;
}

/**
 * Open SQLite bytes read-only for validation. Does not run migrations or write back.
 */
export async function validateSqliteBackupBytes(
  bytes: Uint8Array
): Promise<SqliteIntegrityResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let schemaVersion: number | null = null;

  if (bytes.byteLength < 100) {
    return {
      ok: false,
      errors: ["library.sqlite が空または短すぎます"],
      warnings,
      schemaVersion,
    };
  }
  const header = new TextDecoder().decode(bytes.slice(0, 16));
  if (!header.startsWith("SQLite format 3")) {
    return {
      ok: false,
      errors: ["library.sqlite が SQLite 形式ではありません"],
      warnings,
      schemaVersion,
    };
  }

  const engine = await loadSqlEngine();
  let db: Database;
  try {
    db = new engine.Database(bytes);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `library.sqlite を開けません: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings,
      schemaVersion,
    };
  }

  try {
    let quick: string[] = [];
    try {
      quick = pragmaResults(db, "PRAGMA quick_check");
    } catch (error) {
      errors.push(
        `PRAGMA quick_check 失敗: ${error instanceof Error ? error.message : String(error)}`
      );
      return { ok: false, errors, warnings, schemaVersion };
    }
    if (quick.length === 0 || quick.some((row) => row.toLowerCase() !== "ok")) {
      errors.push(`PRAGMA quick_check 失敗: ${quick.join("; ") || "(empty)"}`);
    }

    if (errors.length === 0) {
      try {
        const integrity = pragmaResults(db, "PRAGMA integrity_check(10)");
        if (integrity.length === 0 || integrity.some((row) => row.toLowerCase() !== "ok")) {
          errors.push(`PRAGMA integrity_check 失敗: ${integrity.join("; ") || "(empty)"}`);
        }
      } catch (error) {
        errors.push(
          `PRAGMA integrity_check 失敗: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors, warnings, schemaVersion };
    }

    const tables = tableNames(db);
    for (const required of ["meta", "papers"]) {
      if (!tables.has(required)) {
        errors.push(`必須テーブルがありません: ${required}`);
      }
    }

    if (tables.has("meta")) {
      try {
        const versionRows = db.exec("SELECT value FROM meta WHERE key = 'schema_version' LIMIT 1");
        const raw = versionRows[0]?.values[0]?.[0];
        if (raw == null) {
          errors.push("meta.schema_version がありません");
        } else {
          schemaVersion = Number(raw);
          if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
            errors.push(`不正な schema_version: ${raw}`);
          } else if (schemaVersion > SQLITE_SCHEMA_VERSION) {
            errors.push(
              `SQLite schema ${schemaVersion} はこのアプリ（${SQLITE_SCHEMA_VERSION}）より新しいため復元できません`
            );
          } else if (schemaVersion < SQLITE_SCHEMA_VERSION) {
            warnings.push(
              `SQLite schema ${schemaVersion} は古いですが、起動時 migration で昇格できます`
            );
          }
        }
      } catch (error) {
        errors.push(
          `meta.schema_version を読めません: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (tables.has("papers")) {
      try {
        const info = db.exec("PRAGMA table_info(papers)");
        const cols = new Set((info[0]?.values ?? []).map((row) => String(row[1])));
        for (const col of ["id", "source_file_hash", "processing_status", "created_at", "updated_at"]) {
          if (!cols.has(col)) errors.push(`papers.${col} がありません`);
        }
      } catch (error) {
        errors.push(
          `papers 列検証に失敗: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    try {
      db.run("PRAGMA foreign_keys = ON");
      const fkResult = db.exec("PRAGMA foreign_key_check");
      const violations = fkResult.reduce((n, t) => n + t.values.length, 0);
      if (violations > 0) {
        errors.push(`PRAGMA foreign_key_check: ${violations} 件の不整合`);
      }
    } catch (error) {
      warnings.push(
        `foreign_key_check を実行できませんでした: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  } catch (error) {
    errors.push(
      `SQLite integrity validation 例外: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    db.close();
  }

  return { ok: errors.length === 0, errors, warnings, schemaVersion };
}
