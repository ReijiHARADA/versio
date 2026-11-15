# P0 改善メモ（2026-09-13）

製品投入向けの 4 課題。実装の要約と残課題。

## 1. ライブラリ起動の本文フルロード廃止 + FTS

**Before:** `AppShell` が全論文の sections/blocks を Paper Package から読み込み zustand に載せていた。

**After:**
- 起動時は SQLite の論文メタ + workspace のみ
- 本文は Reader 開時（および import / 対象を絞った resume）で lazy load
- Reader 離脱時に `clearPaperBody` + `forgetDocument` で解放（翻訳中は保持）
- ⌘K / サイドバー検索は FTS（`searchLibraryPaperIds`）+ メタデータ OR。本文をメモリに載せない

**残課題:** 翻訳ホットパスでは FTS を毎回 rebuild しないため、古い索引の論文はメタデータヒットに依存。必要なら遅延 rebuild。

## 2. Production security

**After:**
- `tauri.conf.json` で production CSP を有効化（ESM + wasm-unsafe-eval + worker + localhost:8765）
- WebView から `shell:allow-spawn/kill` を削除。翻訳プロセスは Rust `std::process::Command` のみ
- PDF 読取・コピーは絶対パス + `.pdf` + 存在確認。ユーザー書き込みパスは `..` 拒否
- 翻訳サーバー: CORS を許可 origin 列挙に縮小。`MADLAD_SERVER_TOKEN` 時は POST に `X-Versio-Token` 必須。Tauri がトークン生成・注入、フロントは invoke で取得

**残課題:** 配布 `.app` での CSP 実機確認。`tauri-plugin-shell` crate 依存は未削除（未使用）。公証フロー自体は未実行。

## 3. Translation model lifecycle / UX

**After:**
- サーバー HTTP 起動と model download/load/warmup を分離（lifespan で即 yield）
- `/health` に `phase` / `progress` / `message` / `error`
- フロントは固定 90 秒 timeout を廃止し、phase 付きでポーリング（最大約 1 時間）
- バナーは downloading / loading 等を表示。Library ルートはブロックしない

**残課題:** Import は翻訳開始前にモデル ready を待つ（抽出を完全にサーバー非依存にするのは次）。HF ダウンロード進捗はキャッシュ有無ヒューリスティック（細粒度 % は未配線）。

## 4. Reproducible build

**After:**
- `scripts/bundle-python.sh` は開発者 `.venv` をコピーせず、`uv` + `requirements.lock` + `.python-version` から `translation-server/venv` を生成。content-hash cache（lock / Python patch / script）で reuse、`clean` で強制再構築。validation 失敗時は再利用しない
- Tauri resources は `scripts/stage-translation-bundle.sh` が作る `src-tauri/bundled-resources/translation-server` のみ（`models/`・開発用 `.venv*`・tests/benchmarks を同梱しない）
- `translation-server/requirements.lock` を追加（`uv pip compile`）

**残課題:** CI での clean マシン検証、公証付き署名、Windows 非対応のまま。

## 検証

- `npx tsc --noEmit` OK
- Vitest: P0 関連・resume・settings・readiness OK。`realPapers` コーパス失敗は既存（本変更外）
- `cargo test` OK
- `npm run lint` は既存 warning のみ
- `python3` で `server.py` 構文 OK
