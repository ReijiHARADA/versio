import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
// A fixed ?url import: a templated path made Vite bundle every sql.js build (~25 MB).
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import type { FileSystem } from "../fs/types";
import { persistMetrics } from "../package/persist";
import { applySqliteSchemaMigrations } from "./migrateSchema";
import { SQLITE_FTS5_SQL, SQLITE_FTS_FALLBACK_SQL, SQLITE_SCHEMA_SQL } from "./schema";

export type SqlRow = Record<string, unknown>;

export type SqliteClient = {
  exec(sql: string, params?: unknown[]): void;
  query<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): T[];
  get<T extends SqlRow = SqlRow>(sql: string, params?: unknown[]): T | undefined;
  transaction(work: () => void): void;
  persist(): Promise<void>;
  exportBytes(): Uint8Array;
  close(): Promise<void>;
  hasFts5: boolean;
};

export const SQLITE_PATH = "library.sqlite";
const SQLITE_TMP_PATH = `${SQLITE_PATH}.tmp`;
const SQLITE_BAK_PATH = `${SQLITE_PATH}.bak`;

let SQL: SqlJsStatic | null = null;

async function loadSql(): Promise<SqlJsStatic> {
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
    locateFile: () => sqlWasmUrl,
  });
  return SQL;
}

function bind(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params as never[]);
}

function tryOpenDatabase(engine: SqlJsStatic, bytes: Uint8Array | null): Database | null {
  if (!bytes || bytes.byteLength < 100) return null;
  try {
    const db = new engine.Database(bytes);
    db.exec("SELECT count(*) FROM sqlite_master");
    return db;
  } catch {
    return null;
  }
}

function hasFts5Table(db: Database): boolean {
  try {
    const result = db.exec(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'papers_fts' LIMIT 1"
    );
    const sql = result[0]?.values[0]?.[0];
    return typeof sql === "string" && /using\s+fts5/i.test(sql);
  } catch {
    return false;
  }
}

async function loadDatabaseBytes(fs: FileSystem, engine: SqlJsStatic): Promise<Database> {
  const candidates = [SQLITE_PATH, SQLITE_TMP_PATH, SQLITE_BAK_PATH];
  for (const path of candidates) {
    const bytes = await fs.readBytes(path);
    const db = tryOpenDatabase(engine, bytes);
    if (db) {
      if (path !== SQLITE_PATH) {
        console.warn(`Recovered library.sqlite from ${path}`);
      }
      return db;
    }
  }
  return new engine.Database();
}

async function writeSqliteAtomic(fs: FileSystem, bytes: Uint8Array): Promise<void> {
  await fs.writeBytes(SQLITE_TMP_PATH, bytes);
  if (await fs.exists(SQLITE_PATH)) {
    await fs.remove(SQLITE_BAK_PATH);
    // Keep previous good file as .bak before replacing, so a future corrupt
    // open can fall back. rename is atomic on the same volume.
    await fs.rename(SQLITE_PATH, SQLITE_BAK_PATH);
  }
  await fs.rename(SQLITE_TMP_PATH, SQLITE_PATH);
}

export async function openSqlite(fs: FileSystem): Promise<SqliteClient> {
  const engine = await loadSql();
  const db = await loadDatabaseBytes(fs, engine);
  db.run(SQLITE_SCHEMA_SQL);
  let hasFts5 = false;
  try {
    db.run(SQLITE_FTS5_SQL);
    // `IF NOT EXISTS` succeeds for an older ordinary fallback table too.
    // Inspect the actual schema instead of treating that no-op as proof that
    // MATCH is supported; otherwise every reopened fallback database takes a
    // failing FTS path before falling back to LIKE.
    hasFts5 = hasFts5Table(db);
    if (!hasFts5) db.run(SQLITE_FTS_FALLBACK_SQL);
  } catch {
    db.run(SQLITE_FTS_FALLBACK_SQL);
  }
  applySqliteSchemaMigrations(db);

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let persistChain: Promise<void> = Promise.resolve();

  const persistNow = async () => {
    if (closed) return;
    persistMetrics.sqliteExports += 1;
    const bytes = db.export();
    await writeSqliteAtomic(fs, bytes);
  };

  const enqueuePersist = (): Promise<void> => {
    // Serialize exports so an older in-flight write cannot overwrite a newer one.
    const next = persistChain.then(persistNow, persistNow);
    persistChain = next.catch((error) => {
      console.warn("library.sqlite persist failed:", error);
    });
    return next;
  };

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void enqueuePersist();
    }, 3000);
  };

  const client: SqliteClient = {
    exec(sql, params = []) {
      bind(db, sql, params);
      schedulePersist();
    },
    query<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
    get<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []) {
      return client.query<T>(sql, params)[0];
    },
    transaction(work) {
      bind(db, "BEGIN");
      try {
        work();
        bind(db, "COMMIT");
      } catch (error) {
        try {
          bind(db, "ROLLBACK");
        } catch {
          // ignore rollback failure
        }
        throw error;
      }
      schedulePersist();
    },
    async persist() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await enqueuePersist();
    },
    exportBytes() {
      return db.export();
    },
    async close() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (!closed) {
        await enqueuePersist();
        closed = true;
        db.close();
      }
    },
    hasFts5,
  };
  return client;
}
