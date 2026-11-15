# Versio

## 文書の更新ルール

実装の正は **コード**。文書の役割を混ぜない。

| 文書 | 更新するとき |
| --- | --- |
| [CURRENT_STATE.md](./CURRENT_STATE.md) | **user-visible な現在状態**が変わったとき（機能の追加・削除・制限の変化、検証状況の更新） |
| [ROADMAP.md](./ROADMAP.md) | **プロダクト目標・優先度・スコープ**が変わったときだけ。通常の実装修正では触らない |
| [README.md](./README.md) | **製品の定義・対応環境・セットアップ・主要導線・ドキュメント入口**が変わったときだけ |
| [QUICKSTART.md](./QUICKSTART.md) | 起動手順・venv・トラブルシュートが変わったとき |
| 本ファイル (AGENTS.md) | エージェント向け制約・ビルド／OCR／翻訳／データルールが変わったとき |

- 通常のバグ修正・リファクタ・小さな UX 調整で README / ROADMAP を書き換えない
- 完了した目標を ROADMAP の「未達」に残さない。現状は CURRENT_STATE へ
- 抽出・翻訳の詳細は専門文書へ書き、README / ROADMAP / CURRENT_STATE に重複コピーしない

## Tauri macOS アプリ

- Versio の基本動作確認は **Tauri macOS 実機を基準**にする。ブラウザ／Playwright確認は補助であり、取り込み・PDF抽出・翻訳・永続化・書き出し・macOS固有UIは最新の `.app` または `tauri:dev` で最終確認する。
- UI を変えたら `npm run dev` または preview を上げ、`npm run verify:browser` で Library / 設定 / Reader を実ブラウザ確認する。このセッションの Cursor に Browser MCP は無いので Playwright（`@playwright/test`）を使う。翻訳サーバーは `http://127.0.0.1:8765/health`。
- 新しい UI は [UI_INTERACTION_PRINCIPLES.md](./UI_INTERACTION_PRINCIPLES.md) に従う。局所操作は Popover、一時的な大きい作業は Sheet / Overlay、論文全体の一覧は Inspector。本文操作で Notes を自動で開かない。別 route は Library / Reader / Workspace / Settings だけ。同一対象の場所・サイズ変化（図の拡大など）は Shared Element Transition でビューを切らない。
- `src-tauri/` が Tauri v2 のシェル。`npm run tauri:dev` で開発。日常の `.app` 確認は `npm run tauri:build:fast`（cached Python / `.app` のみ）。リリース確認は `npm run tauri:build:clean`（clean Python / `.app` + `.dmg`）。`npm run tauri:build` は clean のエイリアス。
- 生成物: `src-tauri/target/release/bundle/macos/Versio.app`
- Xcode は `/Applications/Xcode-beta.app` を使用。ビルド時は `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` を設定すること。
- 翻訳サーバーはアプリが spawn し、終了時に停止する。
- Python runtime は `scripts/bundle-python.sh` が `uv` + `requirements.lock` + `.python-version`（patch 固定）から `translation-server/venv/` を作る（開発者 `.venv` のコピーはしない）。content-hash が一致し validation が通れば reuse。`clean` のみゼロから再構築。Tauri 同梱は lite の `src-tauri/bundled-resources/translation-server`（server / engines、venv なし）＋別 stage の `translation-venv`。`.app` への venv 注入は `scripts/inject-translation-venv.sh`（APFS clone）。`npm run tauri:build:fast` / `clean` が注入まで行う。`models/` や開発用 `.venv*` は入れない。phase 時間は `scripts/tauri-build.sh` と `.build-timings` / [docs/BUILD_TIMINGS.md](./docs/BUILD_TIMINGS.md)。
- 本番 CSP は有効。WKWebView 向けに `script-src` は nonce のみにしない（`'self' 'unsafe-inline' 'wasm-unsafe-eval'`）。変更時は `.app` で白画面にならないか確認する。
- PDF 解析は **pdfjs-dist 3.11（legacy build）**。6.x は WKWebView で Iterator Helpers が無く即クラッシュするので上げない。日本語 CID フォントは `pdfjs-dist/cmaps`（Adobe-Japan1 など）をアプリに同梱してデコードする。
- ユーザー領域への書き出しは Rust の save dialog コマンドで完結させる。フロントから任意 absolute path への write API を復活させない。

## OCR（スキャン PDF 対応）

- Apple Vision Framework を Rust から呼び出す Tauri コマンド `ocr_image` を実装済み（`src-tauri/src/ocr.rs`）。
- `src/services/ocrService.ts` がフロントエンド側のラッパー。`isTauriApp()` で Tauri 環境を判定し、非 Tauri では「デスクトップ版のみ」と案内する。
- OCR 言語は `["en-US", "ja-JP"]` を既定値として渡している（Vision が自動検出）。
- スキャン判定は `extractAcademicPdf` 内の Page Classification（平均 item < 10 の baseline + garbled/mixed）。ImportService には OCR heuristic を置かない。

## Translation

- Production engine is **MADLAD-400 3B on MPS + bfloat16**. Do not switch the default to CPU or to community MLX INT8.
- Sentence-level `generate()` calls are batched (default 24). Set `MADLAD_BATCH_SIZE=1` to restore one call per chunk.
- Concurrent `/translate` requests are coalesced by `MicroBatchScheduler` (25ms window). `generate()` stays single-threaded. Disable with `MADLAD_MICROBATCH=0`.
- Frontend translation concurrency default is 8 so requests can share a batch; this is not parallel Metal generate.
- Batching measurements: `translation-server/MPS_BATCH_OPTIMIZATION_REPORT.md`.
- Do not run `update_python_env.sh` unless the pinned Python venv is broken. Prefer `.python-version` patch pin.
- Restart the server with `./restart-translation-server.sh`.
- The app-spawned server writes stdout/stderr to `~/Library/Logs/com.harada.versio/translation-server.log` (previous launch: `translation-server.prev.log`). Rust warnings/errors go to `Versio.log` in the same dir. Check these first when a packaged `.app` cannot translate.
- Speed measurements and rejected alternatives live in `translation-server/SPEED_BENCH.md`.
- MLX bf16 (unquantized official 3B) was measured in `translation-server/MLX_BF16_BENCH_REPORT.md`. Do not switch production to it: quality matches MPS, but it is not 1.5–2× faster than the batched MPS path.

## Licenses (Settings)

- Settings → ライセンス lists Versio MIT plus **required** third-party notices (distributed on macOS and attribution-required). Regenerate with `npm run generate:licenses` (also `prebuild`). Source of truth is `src/generated/thirdPartyLicenses.json`. Do not invent SPDX identifiers; mark missing metadata as unknown/partial. Exclude: dev-only / non-bundled deps, other-platform Rust crates, and packages where a no-attribution license can be elected (`0BSD` / `Unlicense` / `CC0-1.0` / `MIT-0` / `WTFPL`). Policy details: `THIRD_PARTY_NOTICES.md`.

## Local data

- Paper body source of truth is the Paper Package at `<AppData>/papers/<paperId>/` (`source.pdf`, `paper.json`, `original.md`, `ja.md`, `translation.json`, `structure.json`, optional `layout.json.gz`, `assets/`). Do not store paper bodies only in IndexedDB or SQLite. Keep structured authors / affiliations / DOI in `paper.json`; do not mint `author-1` when ids already exist. Block APIs take `{ paperId, blockId }`. Re-extract must `reconcileBlockIds` then remap annotations / reading position.
- During MADLAD translation, persist only `ja.md` / `paper.json` / `structure.json` on a debounce. Never rewrite `source.pdf`, `assets/`, or `layout.json.gz` per block. Full atomic persist + validation stays on finalize. Do not change MADLAD 3B / MPS / bf16 / batch 24 / microbatch / concurrency 8 to “fix” Reader jank.
- SQLite (`library.sqlite`) holds the library index, workspace tree, annotations, reading positions, glossaries, translation cache, and rebuildable FTS/LIKE search. See `DATA_ARCHITECTURE.md`.
- Zustand `useAppStore` is UI only (current paper, display settings, expanded originals). `useLibraryCache` / `useProjectStore` are in-memory query caches. Do not treat them as the document authority; persist through Paper Package / SQLite first.
- Original PDFs stay in the package as `source.pdf`. First import persist includes `sourcePdf` in the atomic Paper Package write. Do not pre-write `source.pdf` and then replace the package directory.
- SQLite schema is versioned. Add a numbered migration when changing tables. `translation_cache` PK is `(text_hash, model, model_version, source_language, target_language)`. `papers.source_file_hash` is UNIQUE. Close/exit must `flushDocumentPersist` + `db.persist()`; do not drop pending timers without writing.
- Annotations live in SQLite, anchored to stable block IDs. Re-anchor still uses selectedText + prefix + suffix.
- IndexedDB `versio` v4 is a read-only backup after migration. Do not delete it in the same release that introduces the new store.
- Assign papers to any WorkspaceNode by dragging a library paper row onto the sidebar item. Drag onto Inbox to remove all workspace memberships. Do not use HTML5 drag-and-drop for this: WKWebView often starts a drag but never fires `drop`. Use pointer tracking and `elementFromPoint`.
- Import a PDF by dropping it onto the app window. Use Tauri `onDragDropEvent` in the desktop app (HTML5 `drop` does not receive files in WKWebView). Browser `npm run dev` can keep HTML5 file drop. A drop on `/project/:id` attaches the paper to that project. Do not navigate to `/import` as the main path; start `startBackgroundImport` and stay on Library. Show readiness (`preparing` / `readable` / `translating` / `needs_attention`) on cards, not raw processing stages. `⌘K` is library search, `⌘F` is in-paper search; focusing library search must not leave Reader.
- Workspace delete lives in the sidebar node's three-dot menu; do not show a duplicate trash icon in the workspace screen header. Deleting a node removes its subtree memberships only; paper records stay, and unassigned papers reappear in Inbox. The “論文を追加” button sits in the header next to the title on a WorkspaceNode, All Papers, and Inbox.
- Reading-order regression fixtures: `test-fixtures/` (synthetic PDFs only). Real papers from the jewelry-first-computing index live in gitignored `test-data/real-papers/` (`npm run fetch:real-papers`). Do not copy those PDFs into the repo or edit jewelry-first-computing.
- Broad extraction-eval OA PDFs live in gitignored `test-fixtures/real-papers/pending-pdfs/` (local only). Commit `pending-oa-candidates.json` + `scripts/fetch-oa-europepmc.mjs`; re-download with `node scripts/fetch-oa-europepmc.mjs --limit=40` (Europe PMC `isOpenAccess=Y` + CC license only). Do not commit PDF binaries.
- Academic PDF extraction: CanonicalDocument is the extraction source of truth. Persist as Paper Package (Markdown + structure). Import calls `extractAcademicPdf` then writes the package. Reader consumes Document AST / projection, not pdfLayout or GROBID internals. `pdfLayout.ts` remains the generic heuristic engine (do not rewrite column left→right). Format Profile apply thresholds stay APPLY_MIN=0.75 / APPLY_MARGIN=0.12. Do not use catalog.json formatFamily for production detection. Do not upgrade pdfjs-dist to 6.x. GROBID/Docling are optional enrichers, not required dependencies. Reuse block IDs on re-extract; do not mint a fresh UUID for every block.
- Workspace: WorkspaceNode is one type. Every node can have children, papers, and metadata; nesting is unrestricted except cycles. Papers are never copied and belong through WorkspacePaper many-to-many relations.
- Dotted grant identifiers (`016.128.303`) are not section headings or paper titles. Wrap them into the preceding `grant number` paragraph. Latin-ratio quality checks ignore source proper nouns and numeric ids.

## Maintenance and refactoring

- Refactor periodically at stable feature milestones, especially after extraction, translation, or package-format changes.
- Use [docs/REFACTORING_CADENCE.md](./docs/REFACTORING_CADENCE.md) for the cadence, scope, verification, and `CURRENT_STATE.md` record format.
- Keep refactoring separate from behavior/quality changes whenever practical. Preserve public APIs and add characterization tests before moving logic.
- Prefer small responsibility splits, duplicate removal, and clearer names over new abstraction layers or rule engines.
- Run targeted tests, typecheck, and relevant extraction/packaged checks after each refactor. Record the scope and verification in `CURRENT_STATE.md`.
- Do not start a broad refactor while a production-quality regression is still being diagnosed; first capture the failing case and stabilize the behavior.
