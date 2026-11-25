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

## 結論

- 〜300 本: 問題なし。
- 1000 本: Tauri 版は IPC のバイト配列 JSON 化で persist が破綻する見込み。DB と検索だけなら実用範囲（0.3 秒）。
- 10000 本: sql.js の全体 export（5 秒）、起動（6 秒）、検索（3〜8 秒）、一覧（6.7 秒、入力 10 秒）のすべてが破綻する。

## 直す順番

1. **IPC をバイナリで渡す**: `write_app_file` / `read_app_file` を Tauri v2 の raw body（`tauri::ipc::Request` / `Response`）にする。小さい変更で 1000 本の壁を外せる。
2. **一覧を仮想化する**: 見えている行だけ描画する。検索の入力は deferred にする。
3. **SQLite をネイティブにする**: Rust の rusqlite でファイルへ差分を書き込み、sql.js の全体 export と起動時の全体読み込みをやめる。10000 本にはこれが必須。
4. **検索の候補を先に絞る**: FTS5 `MATCH`（trigram など）で候補を絞ってから `versio_search_score` をかける。3 を入れると FTS5 / trigram が確実に使える。
5. `translation_cache` は件数に上限を設けるか、別ファイルに分ける。
