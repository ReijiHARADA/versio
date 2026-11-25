---
type: Handoff
title: 論文 1000〜10000 本に耐える
description: ライブラリ規模ベンチで見つけたボトルネックを順に直す作業の途中の状態。
tags: [performance, sqlite, library, search]
status: draft
---

# 論文 1000〜10000 本に耐える（2026-11-26〜）

- **依頼**: 論文が 1000〜10000 本になっても動くようにする。直す順番（[ベンチ文書](../research/library-scale-bench-2026-11.md)の「直す順番」）の 1〜4 を進める。
- **済み**: #573 ベンチ、#575 IPC を raw body に、#577 一覧の仮想化。
- **作業中**: ブランチ `perf/native-search-index`（worktree `app-worktrees/native-search`）。検索本文を native SQLite（`search-index.sqlite`、rusqlite + FTS5 trigram）へ移す。直す順番の 3（本文部分）と 4（候補の絞り込み）にあたる。
- **測り方**: `SIZES=… npm run bench:library-scale`（sql.js 側。`.cache/library-scale/native-input.json` も書き出す）→ `cd src-tauri && NATIVE_SCALE=1000,10000 cargo test --release --lib native_scale -- --ignored --nocapture`。
- **次の候補**:
  - `translation_cache`（約 94KB/本）と `benchmarks`（約 25KB/本）を sql.js から出すか、上限を設ける。
  - 起動時の `syncPaperIndexesFromPackages` が全論文の `paper.json` を IPC で 1 本ずつ読む（10000 本で数秒以上かかる見込み。未計測）。
  - ワークスペース画面（`ProjectScreen`）の一覧は仮想化していない。
- **判断待ち**: なし。
