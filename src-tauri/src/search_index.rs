//! Library full-text search index in a native SQLite file (`search-index.sqlite`).
//!
//! Paper bodies used to live in sql.js's in-memory `papers_fts`, which made
//! library.sqlite ~137 KB per paper and rewrote the whole file on every change
//! (docs/research/library-scale-bench-2026-11.md). Here rows are written in
//! place (WAL), and a query narrows candidates with an FTS5 trigram index
//! before scoring them exactly like `scoreFields` in `src/domain/search/searchQuery.ts`.
//!
//! The text is `normalizeIndexText` output computed on the frontend, and the
//! frontend also computes each variant's needles; this module only finds them.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, State};

const FILE: &str = "search-index.sqlite";
/// Private-use mark that turns a one- or two-character CJK string into one
/// trigram (`字\u{E000}\u{E000}`, `漢字\u{E000}`); trigram FTS cannot look up
/// anything shorter than three characters.
const MARK: char = '\u{E000}';
/// Field weights, as `FIELD_WEIGHTS` in `src/data/sqlite/fts.ts`.
const WEIGHTS: [f64; 5] = [4.0, 3.0, 2.0, 1.0, 1.0];
/// `INSIDE_WORD_FACTOR` in `src/domain/search/searchQuery.ts`.
const INSIDE_WORD_FACTOR: f64 = 0.2;
/// Ranked ids returned per query; the frontend drops trashed papers and keeps 50.
const MAX_RESULTS: usize = 500;

#[derive(Default)]
pub struct SearchIndexState(Mutex<Option<Connection>>);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PaperText {
    pub paper_id: String,
    pub title: String,
    pub authors: String,
    pub annotation: String,
    pub original: String,
    pub translation: String,
    /// `singleCharWords` output (` 蚊 数 `).
    pub words: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMeta {
    pub paper_id: String,
    pub title: String,
    pub authors: String,
    pub annotation: String,
}

#[derive(Debug, Deserialize)]
pub struct Variant {
    pub term: String,
    pub weight: f64,
    /// `isSingleCharTerm(term)`.
    pub single: bool,
    /// `variantNeedles(variant)` (just `[term]` for a single-character term).
    pub needles: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Group {
    pub variants: Vec<Variant>,
}

pub(crate) fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS paper_text (
           rowid INTEGER PRIMARY KEY,
           paper_id TEXT NOT NULL UNIQUE,
           title TEXT NOT NULL,
           authors TEXT NOT NULL,
           annotation TEXT NOT NULL,
           original TEXT NOT NULL,
           translation TEXT NOT NULL,
           words TEXT NOT NULL
         );
         CREATE VIRTUAL TABLE IF NOT EXISTS paper_tri USING fts5(
           title, authors, annotation, original, translation, words,
           tokenize = 'trigram case_sensitive 1', content = '', contentless_delete = 1
         );",
    )?;
    Ok(conn)
}

fn is_markable(c: char) -> bool {
    c as u32 >= 0x3000 && !c.is_whitespace()
}

/// Every distinct markable character and adjacent pair, as marked trigrams.
fn cjk_marks(texts: &[&str]) -> String {
    let mut marks = BTreeSet::new();
    for text in texts {
        let mut prev: Option<char> = None;
        for c in text.chars() {
            if is_markable(c) {
                marks.insert(format!("{c}{MARK}{MARK}"));
                if let Some(p) = prev {
                    marks.insert(format!("{p}{c}{MARK}"));
                }
                prev = Some(c);
            } else {
                prev = None;
            }
        }
    }
    marks.into_iter().collect::<Vec<_>>().join(" ")
}

/// A field as indexed: its text, then the marks for its short CJK strings.
fn indexed_field(text: &str) -> String {
    let marks = cjk_marks(&[text]);
    if marks.is_empty() {
        text.to_string()
    } else {
        format!("{text}\n{marks}")
    }
}

pub(crate) fn put(conn: &mut Connection, doc: &PaperText) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let existing: Option<i64> = tx
        .query_row(
            "SELECT rowid FROM paper_text WHERE paper_id = ?1",
            [&doc.paper_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(rowid) = existing {
        tx.execute("DELETE FROM paper_tri WHERE rowid = ?1", [rowid])?;
        tx.execute("DELETE FROM paper_text WHERE rowid = ?1", [rowid])?;
    }
    tx.execute(
        "INSERT INTO paper_text (paper_id, title, authors, annotation, original, translation, words)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            doc.paper_id,
            doc.title,
            doc.authors,
            doc.annotation,
            doc.original,
            doc.translation,
            doc.words
        ],
    )?;
    let rowid = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO paper_tri (rowid, title, authors, annotation, original, translation, words)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            rowid,
            indexed_field(&doc.title),
            indexed_field(&doc.authors),
            indexed_field(&doc.annotation),
            indexed_field(&doc.original),
            indexed_field(&doc.translation),
            doc.words
        ],
    )?;
    tx.commit()
}

fn get(conn: &Connection, paper_id: &str) -> rusqlite::Result<Option<PaperText>> {
    conn.query_row(
        "SELECT paper_id, title, authors, annotation, original, translation, words
         FROM paper_text WHERE paper_id = ?1",
        [paper_id],
        row_to_text,
    )
    .optional()
}

fn row_to_text(row: &rusqlite::Row<'_>) -> rusqlite::Result<PaperText> {
    Ok(PaperText {
        paper_id: row.get(0)?,
        title: row.get(1)?,
        authors: row.get(2)?,
        annotation: row.get(3)?,
        original: row.get(4)?,
        translation: row.get(5)?,
        words: row.get(6)?,
    })
}

/// Replace title / authors / annotation, keeping the body. False when the paper
/// has no row yet (the next full index write brings them).
pub(crate) fn set_meta(conn: &mut Connection, meta: &PaperMeta) -> rusqlite::Result<bool> {
    let Some(mut doc) = get(conn, &meta.paper_id)? else {
        return Ok(false);
    };
    doc.title = meta.title.clone();
    doc.authors = meta.authors.clone();
    doc.annotation = meta.annotation.clone();
    put(conn, &doc)?;
    Ok(true)
}

pub(crate) fn delete(conn: &mut Connection, paper_id: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let existing: Option<i64> = tx
        .query_row(
            "SELECT rowid FROM paper_text WHERE paper_id = ?1",
            [paper_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(rowid) = existing {
        tx.execute("DELETE FROM paper_tri WHERE rowid = ?1", [rowid])?;
        tx.execute("DELETE FROM paper_text WHERE rowid = ?1", [rowid])?;
    }
    tx.commit()
}

fn quote(token: &str) -> String {
    format!("\"{}\"", token.replace('"', "\"\""))
}

/// FTS5 phrase that matches exactly the rows whose column contains `needle`, or
/// None when the needle is too short to look up.
fn needle_expr(needle: &str) -> Option<String> {
    let chars: Vec<char> = needle.chars().collect();
    match chars.len() {
        0 => None,
        1 if is_markable(chars[0]) => Some(quote(&format!("{}{MARK}{MARK}", chars[0]))),
        2 if is_markable(chars[0]) && is_markable(chars[1]) => {
            Some(quote(&format!("{}{}{MARK}", chars[0], chars[1])))
        }
        1 | 2 => None,
        _ => Some(quote(needle)),
    }
}

const COLUMNS: [&str; 5] = ["title", "authors", "annotation", "original", "translation"];

/// `scoreFields` over the five text fields plus the words field.
pub(crate) fn score(doc: &PaperText, groups: &[Group]) -> f64 {
    let fields = [
        doc.title.as_str(),
        doc.authors.as_str(),
        doc.annotation.as_str(),
        doc.original.as_str(),
        doc.translation.as_str(),
    ];
    let mut total = 0.0;
    for group in groups {
        let mut best = 0.0_f64;
        for variant in &group.variants {
            for (text, field_weight) in fields.iter().zip(WEIGHTS) {
                let mut value = field_weight * variant.weight;
                if variant.single {
                    value *= INSIDE_WORD_FACTOR;
                }
                if value > best
                    && !text.is_empty()
                    && variant.needles.iter().any(|n| text.contains(n.as_str()))
                {
                    best = value;
                }
            }
            if variant.single && variant.weight > best && !doc.words.is_empty() {
                let needle = format!(" {} ", variant.term);
                if doc.words.contains(&needle) {
                    best = variant.weight;
                }
            }
        }
        if best == 0.0 {
            return 0.0;
        }
        total += best;
    }
    total
}

/// Every (column, needles, value) lookup a group needs; None when one of its
/// needles cannot be looked up in the index.
fn group_lookups(group: &Group) -> Option<Vec<(&'static str, String, f64)>> {
    let mut lookups = Vec::new();
    for variant in &group.variants {
        let exprs: Option<Vec<String>> = variant.needles.iter().map(|n| needle_expr(n)).collect();
        let expr = exprs?.join(" OR ");
        for (column, field_weight) in COLUMNS.iter().zip(WEIGHTS) {
            let factor = if variant.single {
                INSIDE_WORD_FACTOR
            } else {
                1.0
            };
            lookups.push((
                *column,
                expr.clone(),
                field_weight * variant.weight * factor,
            ));
        }
        if variant.single {
            lookups.push((
                "words",
                needle_expr(&format!(" {} ", variant.term))?,
                variant.weight,
            ));
        }
    }
    Some(lookups)
}

/// Best value per row for one group, from the index alone.
fn group_scores(
    conn: &Connection,
    lookups: &[(&'static str, String, f64)],
) -> rusqlite::Result<HashMap<i64, f64>> {
    let mut best: HashMap<i64, f64> = HashMap::new();
    let mut stmt = conn.prepare_cached("SELECT rowid FROM paper_tri WHERE paper_tri MATCH ?1")?;
    for (column, expr, value) in lookups {
        let mut rows = stmt.query([format!("{{{column}}} : ({expr})")])?;
        while let Some(row) = rows.next()? {
            let entry = best.entry(row.get(0)?).or_insert(0.0);
            if *value > *entry {
                *entry = *value;
            }
        }
    }
    Ok(best)
}

/// Ranked paper ids. Scores come from per-column phrase lookups in the trigram
/// index (exact substring matches), so no paper body is read; a query with a
/// needle too short to look up scores every row with `score` instead.
pub(crate) fn search(conn: &Connection, groups: &[Group]) -> rusqlite::Result<Vec<String>> {
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    let mut scored: Vec<(f64, i64)> = Vec::new();
    match groups.iter().map(group_lookups).collect::<Option<Vec<_>>>() {
        Some(all) => {
            let mut totals: Option<HashMap<i64, f64>> = None;
            for lookups in &all {
                let group = group_scores(conn, lookups)?;
                totals = Some(match totals {
                    None => group,
                    Some(prev) => prev
                        .into_iter()
                        .filter_map(|(rowid, sum)| group.get(&rowid).map(|v| (rowid, sum + v)))
                        .collect(),
                });
            }
            scored.extend(
                totals
                    .unwrap_or_default()
                    .into_iter()
                    .map(|(rowid, v)| (v, rowid)),
            );
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT rowid, paper_id, title, authors, annotation, original, translation, words FROM paper_text",
            )?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let doc = PaperText {
                    paper_id: row.get(1)?,
                    title: row.get(2)?,
                    authors: row.get(3)?,
                    annotation: row.get(4)?,
                    original: row.get(5)?,
                    translation: row.get(6)?,
                    words: row.get(7)?,
                };
                let value = score(&doc, groups);
                if value > 0.0 {
                    scored.push((value, row.get(0)?));
                }
            }
        }
    }
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    scored.truncate(MAX_RESULTS);
    let mut id_of = conn.prepare_cached("SELECT paper_id FROM paper_text WHERE rowid = ?1")?;
    scored
        .into_iter()
        .map(|(_, rowid)| id_of.query_row([rowid], |row| row.get(0)))
        .collect()
}

fn ids(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT paper_id FROM paper_text")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

fn with_conn<T>(
    app: &AppHandle,
    state: &SearchIndexState,
    work: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
) -> Result<T, String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "検索インデックスを開けません".to_string())?;
    if guard.is_none() {
        let root = crate::paper_fs::e2e_app_data_root(app)?;
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        *guard = Some(open(&root.join(FILE)).map_err(|e| e.to_string())?);
    }
    let conn = guard.as_mut().ok_or("検索インデックスを開けません")?;
    work(conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_index_put(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
    doc: PaperText,
) -> Result<(), String> {
    with_conn(&app, &state, |conn| put(conn, &doc))
}

#[tauri::command]
pub async fn search_index_put_many(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
    docs: Vec<PaperText>,
) -> Result<(), String> {
    with_conn(&app, &state, |conn| {
        for doc in &docs {
            put(conn, doc)?;
        }
        Ok(())
    })
}

#[tauri::command]
pub async fn search_index_set_meta(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
    meta: PaperMeta,
) -> Result<bool, String> {
    with_conn(&app, &state, |conn| set_meta(conn, &meta))
}

#[tauri::command]
pub async fn search_index_delete(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
    paper_id: String,
) -> Result<(), String> {
    with_conn(&app, &state, |conn| delete(conn, &paper_id))
}

#[tauri::command]
pub async fn search_index_ids(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
) -> Result<Vec<String>, String> {
    with_conn(&app, &state, |conn| ids(conn))
}

#[tauri::command]
pub async fn search_index_search(
    app: AppHandle,
    state: State<'_, SearchIndexState>,
    groups: Vec<Group>,
) -> Result<Vec<String>, String> {
    with_conn(&app, &state, |conn| search(conn, &groups))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(id: &str, title: &str, original: &str, translation: &str, words: &str) -> PaperText {
        PaperText {
            paper_id: id.into(),
            title: title.into(),
            authors: String::new(),
            annotation: String::new(),
            original: original.into(),
            translation: translation.into(),
            words: words.into(),
        }
    }

    fn variant(term: &str, weight: f64, single: bool, needles: &[&str]) -> Variant {
        Variant {
            term: term.into(),
            weight,
            single,
            needles: needles.iter().map(|n| n.to_string()).collect(),
        }
    }

    fn mem() -> Connection {
        open(Path::new(":memory:")).unwrap()
    }

    fn library() -> Connection {
        let mut conn = mem();
        put(
            &mut conn,
            &doc(
                "a",
                " attention models ",
                " we use attention here ",
                " 注意機構を用いた ",
                " を ",
            ),
        )
        .unwrap();
        put(
            &mut conn,
            &doc(
                "b",
                " vision ",
                " download the attention data ",
                " 機構 ",
                "",
            ),
        )
        .unwrap();
        put(
            &mut conn,
            &doc("c", " 関数 ", " nothing ", " 関数 の 数 ", " 数 の "),
        )
        .unwrap();
        conn
    }

    #[test]
    fn ranks_title_hits_above_body_hits() {
        let conn = library();
        let groups = vec![Group {
            variants: vec![variant("attention", 1.0, false, &["attention"])],
        }];
        assert_eq!(search(&conn, &groups).unwrap(), vec!["a", "b"]);
    }

    #[test]
    fn every_group_must_match() {
        let conn = library();
        let groups = vec![
            Group {
                variants: vec![variant("attention", 1.0, false, &["attention"])],
            },
            Group {
                variants: vec![variant("download", 1.0, false, &["download"])],
            },
        ];
        assert_eq!(search(&conn, &groups).unwrap(), vec!["b"]);
    }

    #[test]
    fn finds_two_and_one_character_japanese() {
        let conn = library();
        let two = vec![Group {
            variants: vec![variant("機構", 1.0, false, &["機構"])],
        }];
        assert_eq!(search(&conn, &two).unwrap(), vec!["a", "b"]);
        // 数 is a word only in c; it is also inside 関数 (title, 4 × 0.2 = 0.8 < 1).
        let one = vec![Group {
            variants: vec![variant("数", 1.0, true, &["数"])],
        }];
        assert_eq!(search(&conn, &one).unwrap(), vec!["c"]);
        let inside = vec![Group {
            variants: vec![variant("意", 1.0, true, &["意"])],
        }];
        assert_eq!(search(&conn, &inside).unwrap(), vec!["a"]);
    }

    #[test]
    fn word_start_needles_do_not_hit_inside_words() {
        let conn = library();
        let groups = vec![Group {
            variants: vec![variant("load", 1.0, false, &[" load"])],
        }];
        assert!(search(&conn, &groups).unwrap().is_empty());
    }

    #[test]
    fn short_latin_needles_fall_back_to_a_scan() {
        let conn = library();
        assert_eq!(needle_expr("we"), None);
        let groups = vec![Group {
            variants: vec![variant("we", 1.0, false, &["we"])],
        }];
        assert_eq!(search(&conn, &groups).unwrap(), vec!["a"]);
    }

    #[test]
    fn put_replaces_and_delete_removes() {
        let mut conn = library();
        put(&mut conn, &doc("a", " other ", " nothing ", "", "")).unwrap();
        let groups = vec![Group {
            variants: vec![variant("attention", 1.0, false, &["attention"])],
        }];
        assert_eq!(search(&conn, &groups).unwrap(), vec!["b"]);
        delete(&mut conn, "b").unwrap();
        assert!(search(&conn, &groups).unwrap().is_empty());
        let mut all = ids(&conn).unwrap();
        all.sort();
        assert_eq!(all, vec!["a", "c"]);
    }

    #[test]
    fn set_meta_keeps_the_body() {
        let mut conn = library();
        let meta = PaperMeta {
            paper_id: "b".into(),
            title: " renamed ".into(),
            authors: String::new(),
            annotation: " my note ".into(),
        };
        assert!(set_meta(&mut conn, &meta).unwrap());
        let groups = vec![Group {
            variants: vec![variant("note", 1.0, false, &["note"])],
        }];
        assert_eq!(search(&conn, &groups).unwrap(), vec!["b"]);
        let body = vec![Group {
            variants: vec![variant("download", 1.0, false, &["download"])],
        }];
        assert_eq!(search(&conn, &body).unwrap(), vec!["b"]);
        let missing = PaperMeta {
            paper_id: "zz".into(),
            title: String::new(),
            authors: String::new(),
            annotation: String::new(),
        };
        assert!(!set_meta(&mut conn, &missing).unwrap());
    }

    /// Ranking by reading every body with `score`, to check the index-only path.
    fn search_by_scan(conn: &Connection, groups: &[Group]) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT rowid, paper_id, title, authors, annotation, original, translation, words FROM paper_text")
            .unwrap();
        let mut scored: Vec<(f64, i64, String)> = stmt
            .query_map([], |row| {
                let doc = row_to_text_at(row, 1)?;
                Ok((score(&doc, groups), row.get(0)?, doc.paper_id))
            })
            .unwrap()
            .map(Result::unwrap)
            .filter(|(v, _, _)| *v > 0.0)
            .collect();
        scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        scored.into_iter().map(|(_, _, id)| id).collect()
    }

    fn row_to_text_at(row: &rusqlite::Row<'_>, at: usize) -> rusqlite::Result<PaperText> {
        Ok(PaperText {
            paper_id: row.get(at)?,
            title: row.get(at + 1)?,
            authors: row.get(at + 2)?,
            annotation: row.get(at + 3)?,
            original: row.get(at + 4)?,
            translation: row.get(at + 5)?,
            words: row.get(at + 6)?,
        })
    }

    #[test]
    fn index_scores_match_reading_the_text() {
        let mut conn = library();
        put(
            &mut conn,
            &doc(
                "d",
                " attention ",
                " 注意 と 機構 ",
                " 数学 の 研究 ",
                " 数 ",
            ),
        )
        .unwrap();
        let cases: Vec<Vec<Group>> = vec![
            vec![Group {
                variants: vec![
                    variant("attention", 1.0, false, &["attention"]),
                    variant("注意", 0.8, false, &["注意"]),
                ],
            }],
            vec![
                Group {
                    variants: vec![variant("機構", 1.0, false, &["機構"])],
                },
                Group {
                    variants: vec![variant("数", 1.0, true, &["数"])],
                },
            ],
            vec![Group {
                variants: vec![
                    variant("data", 0.6, false, &[" data"]),
                    variant("研究", 1.0, false, &["研究"]),
                ],
            }],
            vec![Group {
                variants: vec![variant("Attention", 1.0, false, &["Attention"])],
            }],
        ];
        for groups in &cases {
            assert_eq!(
                search(&conn, groups).unwrap(),
                search_by_scan(&conn, groups)
            );
        }
    }

    #[test]
    fn quotes_in_needles_are_escaped() {
        let conn = library();
        let groups = vec![Group {
            variants: vec![variant("a\"b", 1.0, false, &["a\"bc"])],
        }];
        assert!(search(&conn, &groups).unwrap().is_empty());
    }
}

/// Scale bench over `.cache/library-scale/native-input.json` (written by
/// `npm run bench:library-scale`):
/// `NATIVE_SCALE=1000,10000 cargo test --release native_scale -- --ignored --nocapture`.
#[cfg(test)]
mod scale_bench {
    use super::*;
    use std::time::Instant;

    #[derive(Deserialize)]
    struct Input {
        en: Vec<String>,
        ja: Vec<String>,
        words: Vec<String>,
        queries: Vec<Query>,
    }

    #[derive(Deserialize)]
    struct Query {
        query: String,
        groups: Vec<Group>,
    }

    fn body(pool: &[String], bytes: usize, seed: &mut u64, tag: &str) -> String {
        let mut out = String::new();
        while out.len() < bytes {
            *seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            out.push_str(&pool[(*seed >> 33) as usize % pool.len()]);
            out.push(' ');
        }
        out.push_str(tag);
        out
    }

    #[test]
    #[ignore]
    fn native_scale() {
        let input: Input = serde_json::from_str(
            &std::fs::read_to_string("../.cache/library-scale/native-input.json")
                .expect("run npm run bench:library-scale first"),
        )
        .unwrap();
        let sizes = std::env::var("NATIVE_SCALE").unwrap_or_else(|_| "1000".into());
        for n in sizes.split(',').filter_map(|s| s.parse::<usize>().ok()) {
            let path = std::env::temp_dir().join(format!("versio-search-bench-{n}.sqlite"));
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
            }
            let mut conn = open(&path).unwrap();
            let mut seed = 42_u64;
            let start = Instant::now();
            for i in 0..n {
                let doc = PaperText {
                    paper_id: format!("paper-{i}"),
                    title: input.en[i % input.en.len()].chars().take(90).collect(),
                    authors: format!(" author {i} "),
                    annotation: String::new(),
                    original: body(&input.en, 60_000, &mut seed, &format!(" uniqtoken{i} ")),
                    translation: body(&input.ja, 25_000, &mut seed, ""),
                    words: input.words[i % input.words.len()].clone(),
                };
                put(&mut conn, &doc).unwrap();
            }
            let build = start.elapsed();
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .unwrap();
            let size = std::fs::metadata(&path).unwrap().len();
            let start = Instant::now();
            let doc = PaperText {
                paper_id: "paper-0".into(),
                title: " edited ".into(),
                authors: String::new(),
                annotation: String::new(),
                original: body(&input.en, 60_000, &mut seed, ""),
                translation: body(&input.ja, 25_000, &mut seed, ""),
                words: String::new(),
            };
            put(&mut conn, &doc).unwrap();
            let one_put = start.elapsed();
            let start = Instant::now();
            let _ = open(&path).unwrap();
            let reopen = start.elapsed();
            let mut line = format!(
                "papers={n} build={:.1}s size={:.0}MB put1={}ms reopen={}ms",
                build.as_secs_f64(),
                size as f64 / 1e6,
                one_put.as_millis(),
                reopen.as_millis()
            );
            for q in &input.queries {
                let start = Instant::now();
                let hits = search(&conn, &q.groups).unwrap();
                line.push_str(&format!(
                    " | {}: {}ms ({})",
                    q.query,
                    start.elapsed().as_millis(),
                    hits.len()
                ));
            }
            println!("{line}");
        }
    }
}
