/**
 * Library scale bench: how the sql.js library DB behaves at 100–10000 papers.
 *
 *   SIZES=100,1000,3000,10000 npm run bench:library-scale
 *
 * Uses the production code paths (`openSqlite`, `rebuildPaperFts`, `searchPapersFts`,
 * `listPapers` SQL) against a node-fs FileSystem in `.cache/library-scale/<N>/`.
 * Paper text is sampled sentence by sentence from the local Versio library
 * (`~/Library/Application Support/com.harada.versio/papers/*`), or from a synthetic
 * vocabulary when none is present, so sizes match real papers.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
  statSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { FileSystem } from "../../src/data/fs/types";
import { openSqlite } from "../../src/data/sqlite/client";
import { rebuildPaperFts, searchPapersFts } from "../../src/data/sqlite/fts";
import { SynonymDictionary } from "../../src/domain/search/synonymDictionary";
import { buildSearchQuery } from "../../src/domain/search/searchQuery";

const OUT = ".cache/library-scale";
const LIB = join(
  homedir(),
  "Library/Application Support/com.harada.versio/papers",
);
const CACHE_ROWS_PER_PAPER = 110; // measured: 438 rows / 4 papers
const QUERIES = [
  "transformer",
  "注意機構",
  "使いやすさ",
  "cognitive load",
  "zqxjv-not-present",
];

function nodeFs(root: string): FileSystem {
  const p = (path: string) => join(root, path);
  return {
    async readBytes(path) {
      return existsSync(p(path)) ? new Uint8Array(readFileSync(p(path))) : null;
    },
    async writeBytes(path, data) {
      mkdirSync(dirname(p(path)), { recursive: true });
      writeFileSync(p(path), data);
    },
    async readText(path) {
      return existsSync(p(path)) ? readFileSync(p(path), "utf8") : null;
    },
    async writeText(path, text) {
      mkdirSync(dirname(p(path)), { recursive: true });
      writeFileSync(p(path), text);
    },
    async exists(path) {
      return existsSync(p(path));
    },
    async remove(path) {
      rmSync(p(path), { force: true });
    },
    async rename(from, to) {
      renameSync(p(from), p(to));
    },
    async list() {
      return readdirSync(root);
    },
  };
}

function loadPools(): { en: string[]; ja: string[] } {
  const en: string[] = [];
  const ja: string[] = [];
  if (existsSync(LIB)) {
    for (const id of readdirSync(LIB)) {
      const o = join(LIB, id, "original.md");
      const j = join(LIB, id, "ja.md");
      if (existsSync(o))
        en.push(
          ...readFileSync(o, "utf8")
            .split(/(?<=[.!?])\s+/)
            .filter((s) => s.length > 20),
        );
      if (existsSync(j))
        ja.push(
          ...readFileSync(j, "utf8")
            .split(/(?<=。)/)
            .filter((s) => s.length > 10),
        );
    }
  }
  if (en.length < 50) {
    const words =
      "model data method result analysis system learning network attention user study design signal error".split(
        " ",
      );
    for (let i = 0; i < 2000; i++)
      en.push(
        Array.from(
          { length: 18 },
          (_, k) => words[(i * 7 + k * 13) % words.length],
        ).join(" ") + ".",
      );
  }
  if (ja.length < 50) {
    for (let i = 0; i < 2000; i++)
      ja.push(`本研究では手法${i}を用いて結果を分析した。`);
  }
  return { en, ja };
}

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
function body(pool: string[], bytes: number, tag: string): string {
  const out: string[] = [];
  let n = 0;
  while (n < bytes) {
    const s = pick(pool);
    out.push(s);
    n += s.length;
  }
  out.push(tag);
  return out.join(" ");
}

const ms = (t: number) => `${(performance.now() - t).toFixed(0)}ms`;
const mb = (b: number) => `${(b / 1e6).toFixed(1)}MB`;

async function bench(
  n: number,
  pools: { en: string[]; ja: string[] },
  dict: SynonymDictionary,
) {
  const root = join(OUT, String(n));
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const fs = nodeFs(root);
  const result: Record<string, string> = { papers: String(n) };

  let t = performance.now();
  const db = await openSqlite(fs);
  const now = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    const id = `paper-${i}`;
    const title = pick(pools.en).slice(0, 90);
    db.exec(
      `INSERT INTO papers (id, source_file_hash, title_original, title_translated, authors_json, page_count, processing_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 12, 'completed', ?, ?)`,
      [
        id,
        `hash-${i}`,
        title,
        pick(pools.ja).slice(0, 40),
        JSON.stringify([{ id: "a1", name: `Author ${i}` }]),
        now,
        now,
      ],
    );
    rebuildPaperFts(db, id, {
      title,
      authors: `Author ${i}`,
      original: body(pools.en, 60_000, `uniqtoken${i}`),
      translation: body(pools.ja, 25_000, ""),
      annotation: "",
    });
    for (let k = 0; k < CACHE_ROWS_PER_PAPER; k++) {
      db.exec(
        `INSERT INTO translation_cache (text_hash, model, model_version, source_language, target_language, translated_text, cached_at)
         VALUES (?, 'plamo', '1', 'en', 'ja', ?, 0)`,
        [`h-${i}-${k}`, pick(pools.ja).slice(0, 80)],
      );
    }
  }
  result.build = ms(t);

  t = performance.now();
  await db.persist();
  result.persist = ms(t);
  const size = statSync(join(root, "library.sqlite")).size;
  result.dbSize = mb(size);

  // One small user action (an annotation / reading position) → the full export again.
  t = performance.now();
  db.exec("UPDATE papers SET last_read_offset = ? WHERE id = ?", [
    0.5,
    "paper-0",
  ]);
  await db.persist();
  result.persistAfterSmallEdit = ms(t);

  t = performance.now();
  const rows = db.query(
    "SELECT * FROM papers WHERE trashed_at IS NULL AND source_file_hash NOT LIKE 'importing-%' ORDER BY updated_at DESC",
  );
  result.listPapers = `${ms(t)} (${rows.length})`;

  for (const q of QUERIES) {
    const parsed = buildSearchQuery(q, { dictionary: dict });
    t = performance.now();
    const hits = searchPapersFts(db, parsed);
    result[`search:${q}`] = `${ms(t)} (${hits.length})`;
  }
  await db.close?.();

  // Cold open: read file + new Database + schema + migrations.
  t = performance.now();
  const db2 = await openSqlite(fs);
  result.coldOpen = ms(t);
  await db2.close?.();
  const mem = process.memoryUsage();
  result.rss = mb(mem.rss);
  result.arrayBuffers = mb(mem.arrayBuffers);
  return result;
}

export async function runLibraryScaleBench(sizes: number[]): Promise<void> {
  const pools = loadPools();
  const dict = new SynonymDictionary(
    JSON.parse(readFileSync("src/generated/synonyms.json", "utf8")),
  );
  console.log(`pools: en=${pools.en.length} ja=${pools.ja.length} sentences`);
  for (const n of sizes.length ? sizes : [100, 1000]) {
    try {
      const r = await bench(n, pools, dict);
      console.log(JSON.stringify(r));
    } catch (error) {
      console.log(
        JSON.stringify({ papers: n, error: String(error).slice(0, 300) }),
      );
    }
  }
}
