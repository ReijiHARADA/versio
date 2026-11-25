---
type: Report
title: ライブラリ規模ベンチ（100〜10000本, 2026-11）
description: 論文が 1000〜10000 本になったときの SQLite 永続化・起動・検索・一覧描画を実測し、限界と直す順番をまとめる。
tags: [performance, sqlite, sql.js, library, scale]
status: stable
generated: 2026-11-26
---

# ライブラリ規模ベンチ（2026-11）

## 測り方

- DB: `SIZES=100,1000,3000,10000 npm run bench:library-scale`（`scripts/bench/library-scale.ts`）。本番の `openSqlite` / `rebuildPaperFts` / `searchPapersFts` を node の fs で動かす。本文はローカルの論文から文をサンプリングし、1本あたり英語 60KB + 日本語 25KB、`translation_cache` 110 行（実データ 4 本の平均）。**Tauri IPC は含まない**（下で別に測る）。
- 一覧: `npm run bench:library-render -- 100 1000 3000 10000`（`scripts/bench/library-render.mjs`）。デモビルドの `?scaleN=N`（メモリ上のみ、ユーザーのライブラリには触れない）を headless Chromium で開く。
- IPC: `tauriFs.writeBytes` と同じ `Array.from(bytes)` → JSON を、JavaScriptCore（WKWebView と同じエンジン）の `jsc` で測る。

## 結果（M シリーズ Mac、node 22 / Chromium / jsc）

### DB（sql.js、IPC を除く）

| 本数 | DB サイズ | persist（全体 export） | 小さな編集後の persist | 起動時 open | 検索 1 回 |
| --- | --- | --- | --- | --- | --- |
| 100 | 13.8MB | 14ms | 16ms | 7ms | 25–36ms |
| 1000 | 137MB | 167ms | 176ms | 39ms | 0.26–0.36s |
| 3000 | 412MB | 0.8s | 0.6s | 0.44s | 0.7–1.1s |
| 10000 | 1.37GB | 5.5s | 2.6s | 6.0s | 3.2–7.8s |

- 1 本あたり約 137KB（大半が `papers_fts` の正規化済み本文）。
- 検索は、該当がない語（`zqxjv…`）でも全行の本文を走査するので、時間は本数にほぼ比例する。

### Tauri IPC（`Array.from` + JSON、jsc）

| DB サイズ | 書き込み側 | 読み込み側 | JSON | 最大メモリ |
| --- | --- | --- | --- | --- |
| 14MB | 263ms | 151ms | 31MB | 0.67GB |
| 50MB | 1.2s | 0.49s | 111MB | 2.6GB |

- V8（node）では 134MB を超える `Array.from` 自体が `RangeError` になる。
- jsc では 50MB でメモリが 2.6GB に達した。1000 本（137MB）では 1 回の persist に推定 7GB 前後が要り、変更から 3 秒ごとにそれが起きる。**実機で最初に詰まるのはここ。**

### 一覧描画（仮想化なし、全カードを DOM に置く）

| 本数 | 最初のカード表示 | 5 文字入力 | DOM 要素 | スクロール p95 / max | JS heap |
| --- | --- | --- | --- | --- | --- |
| 100 | 0.29s | 0.15s | 2.3k | 16.8 / 17ms | 18MB |
| 1000 | 0.52s | 1.2s | 20k | 16.8 / 17ms | 45MB |
| 3000 | 1.1s | 4.6s | 60k | 16.8 / 33ms | 103MB |
| 10000 | 6.7s | 9.9s | 200k | 133 / 250ms | 269MB |

- 入力時は全カードを再描画するので、1000 本でも 1 文字あたり約 0.25 秒止まる。

#### 仮想化後（`VIRTUALIZE_ABOVE` = 150 本を超えたら表示中の行だけ描画）

スクロールは実際のホイールイベント（120px / 16ms）で測る（上の表は rAF 内で `scrollTop` を書く旧方式）。同じ方式での前後:

| 本数 | 最初のカード表示 | 5 文字入力 | DOM 要素 | スクロール p50 / p95 | JS heap |
| --- | --- | --- | --- | --- | --- |
| 1000（前） | 0.43s | 0.82s | 20k | 16.7 / 16.8ms | 42MB |
| 1000（後） | 0.21s | 0.11s | 2.2k | 16.7 / 16.8ms | 28MB |
| 3000（前） | 0.90s | 2.2s | 60k | 33.3 / 33.4ms | 97MB |
| 10000（前） | 3.2s | 7.1s | 200k | 100 / 167ms | 254MB |
| 10000（後） | 0.21s | 0.13s | 2.2k | 16.7 / 16.7ms | 33MB |

### 検索本文をネイティブ索引へ（`search-index.sqlite`）

`cd src-tauri && NATIVE_SCALE=1000,10000 cargo test --release --lib native_scale -- --ignored --nocapture`（入力は `npm run bench:library-scale` が書き出す `.cache/library-scale/native-input.json`）。

| 本数 | ファイル | 1 本の書き込み | 検索（8 クエリ） |
| --- | --- | --- | --- |
| 1000 | 381MB | 21ms | 0–4ms（cognitive load のみ 75ms） |
| 10000 | 3.7GB | 32ms | 0–36ms（cognitive load のみ 250ms） |

- sql.js では 10000 本で検索 3.2〜7.8 秒、library.sqlite 1.37GB を変更のたびに丸ごと書き直していた。いまは本文が sql.js から出て、行単位で書き込む（WAL）。
- 列ごとの trigram フレーズ検索（`detail=full`、`case_sensitive 1`）だけで採点し、本文は読まない。`detail=none` の候補絞り込み＋本文照合も試した: ファイルは 1000 本で 119MB と小さいが、検索が 74〜153ms（10000 本では約 1 秒）かかり見送り。
- 1〜2 文字の CJK（`研究`、`数`）は印付き trigram（`研究\uE000`、`数\uE000\uE000`）で引く。
- 1000 本相当を移す初回の移行は約 30 秒。起動を止めないよう、バックグラウンドで走らせる。

## 結論

- 〜300 本: 問題なし。
- 1000 本: Tauri 版は IPC のバイト配列 JSON 化で persist が破綻する見込み。DB と検索だけなら実用範囲（0.3 秒）。
- 10000 本: sql.js の全体 export（5 秒）、起動（6 秒）、検索（3〜8 秒）、一覧（6.7 秒、入力 10 秒）のすべてが破綻する。

## 直す順番

1. **IPC をバイナリで渡す**（済: `write_app_file` / `read_app_file` / `read_dropped_pdf` / `download_open_access_pdf` を Tauri v2 の raw body / `tauri::ipc::Response` にした）。小さい変更で 1000 本の壁を外せる。
2. **一覧を仮想化する**（済: `LibraryPaperList` を `@tanstack/react-virtual` で行単位に仮想化。グリッドは列数ごとに行へまとめる）。ワークスペース画面（`ProjectScreen`）は未対応。
3. **SQLite をネイティブにする**（検索本文は済: `search-index.sqlite`。sql.js に残るのはメタデータ・注釈・`translation_cache`・`benchmarks`）。
4. **検索を索引で引く**（済: FTS5 trigram の列ごとのフレーズ検索で採点）。
5. `translation_cache` は件数に上限を設けるか、別ファイルに分ける。
