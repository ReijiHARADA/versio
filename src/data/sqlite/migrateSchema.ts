import type { Database } from "sql.js";
import { SQLITE_SCHEMA_VERSION } from "../schemaVersion";
import { sqliteSchemaVersionSql } from "./schema";
import { normalizeIndexText } from "../../domain/search/normalizeSearchText";

type SchemaMigration = {
  from: number;
  to: number;
  run: (db: Database) => void;
};

function readSchemaVersion(db: Database): number {
  try {
    const stmt = db.prepare("SELECT value FROM meta WHERE key = ?");
    stmt.bind(["schema_version"]);
    const version = stmt.step() ? Number(stmt.getAsObject().value) : 0;
    stmt.free();
    return Number.isFinite(version) ? version : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(db: Database, version: number): void {
  db.run(sqliteSchemaVersionSql(version));
}

function tableInfo(db: Database, table: string): Array<{ name: string; pk: number }> {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const rows: Array<{ name: string; pk: number }> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push({ name: String(row.name), pk: Number(row.pk ?? 0) });
  }
  stmt.free();
  return rows;
}

function rebuildChildTable(
  db: Database,
  table: string,
  createSql: string,
  columns: string
): void {
  db.run(`DROP TABLE IF EXISTS ${table}_new`);
  db.run(createSql);
  db.run(`INSERT OR IGNORE INTO ${table}_new (${columns}) SELECT ${columns} FROM ${table}`);
  db.run(`DROP TABLE ${table}`);
  db.run(`ALTER TABLE ${table}_new RENAME TO ${table}`);
}

function migrateV2ToV3(db: Database): void {
  const columns = tableInfo(db, "papers").map((column) => column.name);
  if (!columns.includes("package_revision")) {
    db.run("ALTER TABLE papers ADD COLUMN package_revision INTEGER NOT NULL DEFAULT 0");
  }
}

function migrateV1ToV2(db: Database): void {
  db.run("PRAGMA foreign_keys = OFF");

  const cacheInfo = tableInfo(db, "translation_cache");
  const cachePkCount = cacheInfo.filter((column) => column.pk > 0).length;
  if (cachePkCount === 1) {
    db.run(`
      CREATE TABLE translation_cache_new (
        text_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        model_version TEXT NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (text_hash, model, model_version, source_language, target_language)
      )
    `);
    db.run(`
      INSERT OR IGNORE INTO translation_cache_new
      SELECT text_hash, model, model_version, source_language, target_language, translated_text, cached_at
      FROM translation_cache
    `);
    db.run("DROP TABLE translation_cache");
    db.run("ALTER TABLE translation_cache_new RENAME TO translation_cache");
    db.run("CREATE INDEX IF NOT EXISTS translation_cache_by_model ON translation_cache(model)");
  }

  db.run(`
    DELETE FROM papers WHERE id NOT IN (
      SELECT MIN(id) FROM papers GROUP BY source_file_hash
    )
  `);
  db.run("DROP INDEX IF EXISTS papers_by_hash");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS papers_unique_hash ON papers(source_file_hash)");

  db.run("DELETE FROM project_papers WHERE paper_id NOT IN (SELECT id FROM papers)");
  db.run("DELETE FROM project_papers WHERE project_id NOT IN (SELECT id FROM workspace_nodes)");
  db.run("DELETE FROM annotations WHERE paper_id NOT IN (SELECT id FROM papers)");
  db.run("DELETE FROM reading_positions WHERE paper_id NOT IN (SELECT id FROM papers)");
  db.run("DELETE FROM glossaries WHERE paper_id NOT IN (SELECT id FROM papers)");
  db.run("DELETE FROM translation_jobs WHERE paper_id NOT IN (SELECT id FROM papers)");
  db.run("DELETE FROM benchmarks WHERE paper_id NOT IN (SELECT id FROM papers)");

  rebuildChildTable(
    db,
    "project_papers",
    `CREATE TABLE project_papers_new (
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      note TEXT,
      relevance REAL,
      status TEXT,
      decision TEXT,
      tags_json TEXT,
      quotes_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, paper_id),
      FOREIGN KEY (project_id) REFERENCES workspace_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "project_id, paper_id, note, relevance, status, decision, tags_json, quotes_json, created_at, updated_at"
  );
  db.run("CREATE INDEX IF NOT EXISTS project_papers_by_paper ON project_papers(paper_id)");

  rebuildChildTable(
    db,
    "annotations",
    `CREATE TABLE annotations_new (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      project_id TEXT,
      block_id TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      prefix_context TEXT NOT NULL,
      suffix_context TEXT NOT NULL,
      translation_text_hash TEXT NOT NULL,
      note TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "id, paper_id, project_id, block_id, start_offset, end_offset, selected_text, prefix_context, suffix_context, translation_text_hash, note, status, created_at, updated_at"
  );
  db.run("CREATE INDEX IF NOT EXISTS annotations_by_paper ON annotations(paper_id)");
  db.run("CREATE INDEX IF NOT EXISTS annotations_by_block ON annotations(block_id)");
  db.run("CREATE INDEX IF NOT EXISTS annotations_by_paper_block ON annotations(paper_id, block_id)");

  rebuildChildTable(
    db,
    "reading_positions",
    `CREATE TABLE reading_positions_new (
      paper_id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL,
      offset REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "paper_id, block_id, offset, updated_at"
  );

  rebuildChildTable(
    db,
    "glossaries",
    `CREATE TABLE glossaries_new (
      paper_id TEXT PRIMARY KEY,
      entries_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "paper_id, entries_json, created_at, updated_at"
  );

  rebuildChildTable(
    db,
    "translation_jobs",
    `CREATE TABLE translation_jobs_new (
      paper_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, block_id),
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "paper_id, block_id, status, updated_at"
  );

  rebuildChildTable(
    db,
    "benchmarks",
    `CREATE TABLE benchmarks_new (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      model TEXT NOT NULL,
      model_version TEXT NOT NULL,
      input_chars INTEGER NOT NULL,
      input_tokens INTEGER,
      output_chars INTEGER NOT NULL,
      translation_time_ms INTEGER NOT NULL,
      chars_per_sec REAL NOT NULL,
      tokens_per_sec REAL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )`,
    "id, paper_id, model, model_version, input_chars, input_tokens, output_chars, translation_time_ms, chars_per_sec, tokens_per_sec, timestamp"
  );
  db.run("CREATE INDEX IF NOT EXISTS benchmarks_by_paper ON benchmarks(paper_id)");
  db.run("CREATE INDEX IF NOT EXISTS benchmarks_by_model ON benchmarks(model)");
  db.run("CREATE INDEX IF NOT EXISTS benchmarks_by_timestamp ON benchmarks(timestamp)");

  db.run("PRAGMA foreign_keys = ON");
}

function migrateV3ToV4(db: Database): void {
  const columns = tableInfo(db, "project_papers").map((column) => column.name);
  if (!columns.includes("folder_id")) db.run("ALTER TABLE project_papers ADD COLUMN folder_id TEXT REFERENCES workspace_nodes(id) ON DELETE SET NULL");
  if (!columns.includes("sort_order")) db.run("ALTER TABLE project_papers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
}

function migrateV4ToV5(db: Database): void {
  db.run("PRAGMA foreign_keys = OFF");
  // Very old databases did not yet have a projects metadata table.
  db.run("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, description TEXT, research_question TEXT, keywords_json TEXT)");
  db.run(`
    CREATE TABLE workspace_nodes_v5 (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      description TEXT,
      research_question TEXT,
      keywords_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`
    INSERT INTO workspace_nodes_v5
      (id, parent_id, name, sort_order, description, research_question, keywords_json, created_at, updated_at)
    SELECT n.id, n.parent_id, n.name, n.sort_order,
      p.description, p.research_question, p.keywords_json, n.created_at, n.updated_at
    FROM workspace_nodes n LEFT JOIN projects p ON p.id = n.id
  `);
  db.run("DROP TABLE workspace_nodes");
  db.run("ALTER TABLE workspace_nodes_v5 RENAME TO workspace_nodes");
  db.run("CREATE INDEX workspace_nodes_parent ON workspace_nodes(parent_id, sort_order)");
  // The current-schema bootstrap may have created this empty table before
  // migrations run; v4 had no user data in it.
  db.run("DROP TABLE IF EXISTS workspace_papers");
  db.run(`
    CREATE TABLE workspace_papers (
      node_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      note TEXT, relevance REAL, status TEXT, decision TEXT, tags_json TEXT, quotes_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (node_id, paper_id),
      FOREIGN KEY (node_id) REFERENCES workspace_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    INSERT OR REPLACE INTO workspace_papers
      (node_id, paper_id, sort_order, note, relevance, status, decision, tags_json, quotes_json, created_at, updated_at)
    SELECT COALESCE(folder_id, project_id), paper_id, sort_order, note, relevance, status, decision,
      tags_json, quotes_json, created_at, updated_at
    FROM project_papers
  `);
  db.run("DROP TABLE project_papers");
  db.run("DROP TABLE projects");
  db.run("CREATE INDEX workspace_papers_by_paper ON workspace_papers(paper_id)");
  const annotationColumns = tableInfo(db, "annotations").map((column) => column.name);
  if (annotationColumns.includes("project_id") && !annotationColumns.includes("workspace_node_id")) {
    db.run("ALTER TABLE annotations ADD COLUMN workspace_node_id TEXT");
    db.run("UPDATE annotations SET workspace_node_id = project_id");
  }
  db.run("PRAGMA foreign_keys = ON");
}

function migrateV5ToV6(db: Database): void {
  const columns = tableInfo(db, "papers").map((column) => column.name);
  if (!columns.includes("needs_translation_resume")) {
    db.run(
      "ALTER TABLE papers ADD COLUMN needs_translation_resume INTEGER NOT NULL DEFAULT 0"
    );
  }
  // Backfill from processing status so completed papers never force package loads.
  db.run(`
    UPDATE papers SET needs_translation_resume = 1
    WHERE processing_status IN ('queued','extracting','structuring','glossary','translating','partial','failed')
  `);
  db.run(`
    UPDATE papers SET needs_translation_resume = 0
    WHERE processing_status = 'ready'
  `);
}

function migrateV6ToV7(db: Database): void {
  const paperColumns = tableInfo(db, "papers").map((column) => column.name);
  if (!paperColumns.includes("trashed_at")) {
    db.run("ALTER TABLE papers ADD COLUMN trashed_at TEXT");
  }
  db.run("CREATE INDEX IF NOT EXISTS papers_by_trashed ON papers(trashed_at)");

  const nodeColumns = tableInfo(db, "workspace_nodes").map((column) => column.name);
  if (!nodeColumns.includes("trashed_at")) {
    db.run("ALTER TABLE workspace_nodes ADD COLUMN trashed_at TEXT");
  }
  if (!nodeColumns.includes("trash_root_id")) {
    db.run("ALTER TABLE workspace_nodes ADD COLUMN trash_root_id TEXT");
  }
  db.run("CREATE INDEX IF NOT EXISTS workspace_nodes_trashed ON workspace_nodes(trashed_at)");
  db.run("CREATE INDEX IF NOT EXISTS workspace_nodes_trash_root ON workspace_nodes(trash_root_id)");
}

function migrateV7ToV8(db: Database): void {
  const paperColumns = tableInfo(db, "papers").map((column) => column.name);
  if (!paperColumns.includes("read_status")) {
    db.run("ALTER TABLE papers ADD COLUMN read_status TEXT NOT NULL DEFAULT 'unread'");
    // Papers already opened before this column existed are at least being read.
    if (paperColumns.includes("last_opened_at")) {
      db.run("UPDATE papers SET read_status = 'reading' WHERE last_opened_at IS NOT NULL");
    }
  }
  if (!paperColumns.includes("tags_json")) {
    db.run("ALTER TABLE papers ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
  }
}

/** DOI copy of paper.json for duplicate lookup; filled by the package sync on startup. */
function migrateV8ToV9(db: Database): void {
  const paperColumns = tableInfo(db, "papers").map((column) => column.name);
  if (!paperColumns.includes("doi")) db.run("ALTER TABLE papers ADD COLUMN doi TEXT");
  db.run("CREATE INDEX IF NOT EXISTS papers_by_doi ON papers(doi)");
}

/** `papers_fts` now stores normalized search text; rewrite the rows already there. */
function migrateV9ToV10(db: Database): void {
  const exists = db.exec("SELECT 1 FROM sqlite_master WHERE name = 'papers_fts' LIMIT 1");
  if (!exists[0]?.values.length) return;
  const fields = ["title", "authors", "original", "translation", "annotation"] as const;
  const result = db.exec(`SELECT paper_id, ${fields.join(", ")} FROM papers_fts`);
  const rows = result[0]?.values ?? [];
  const update = db.prepare(
    `UPDATE papers_fts SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE paper_id = ?`
  );
  try {
    for (const [paperId, ...values] of rows) {
      update.run([...values.map((value) => normalizeIndexText(String(value ?? ""))), paperId]);
    }
  } finally {
    update.free();
  }
}

const MIGRATIONS: SchemaMigration[] = [
  { from: 1, to: 2, run: migrateV1ToV2 },
  { from: 2, to: 3, run: migrateV2ToV3 },
  { from: 3, to: 4, run: migrateV3ToV4 },
  { from: 4, to: 5, run: migrateV4ToV5 },
  { from: 5, to: 6, run: migrateV5ToV6 },
  { from: 6, to: 7, run: migrateV6ToV7 },
  { from: 7, to: 8, run: migrateV7ToV8 },
  { from: 8, to: 9, run: migrateV8ToV9 },
  { from: 9, to: 10, run: migrateV9ToV10 },
];

export function applySqliteSchemaMigrations(db: Database): number {
  let version = readSchemaVersion(db);
  if (version === 0) {
    db.run("DROP INDEX IF EXISTS papers_by_hash");
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS papers_unique_hash ON papers(source_file_hash)");
    db.run("CREATE INDEX IF NOT EXISTS annotations_by_paper_block ON annotations(paper_id, block_id)");
    db.run("CREATE INDEX IF NOT EXISTS papers_by_trashed ON papers(trashed_at)");
    db.run("CREATE INDEX IF NOT EXISTS papers_by_doi ON papers(doi)");
    db.run("CREATE INDEX IF NOT EXISTS workspace_nodes_trashed ON workspace_nodes(trashed_at)");
    db.run("CREATE INDEX IF NOT EXISTS workspace_nodes_trash_root ON workspace_nodes(trash_root_id)");
    setSchemaVersion(db, SQLITE_SCHEMA_VERSION);
    db.run("PRAGMA foreign_keys = ON");
    return SQLITE_SCHEMA_VERSION;
  }
  for (const migration of MIGRATIONS) {
    if (migration.from === version) {
      migration.run(db);
      version = migration.to;
      setSchemaVersion(db, version);
    }
  }
  db.run("PRAGMA foreign_keys = ON");
  return version;
}
