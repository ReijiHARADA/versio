# Versio

## 文書の更新ルール

実装の正は **コード**。文書の役割を混ぜない。

| 文書 | 更新するとき |
| --- | --- |
| [CURRENT_STATE.md](./CURRENT_STATE.md) | **user-visible な現在状態**が変わったとき（機能の追加・削除・制限の変化、検証状況の更新） |
| [ROADMAP.md](./ROADMAP.md) | **プロダクト目標・優先度・スコープ**が変わったときだけ。通常の実装修正では触らない |
| [README.md](./README.md) | **製品の定義・対応環境・セットアップ・主要導線・ドキュメント入口**が変わったときだけ |
| [QUICKSTART.md](./QUICKSTART.md) | 起動手順・トラブルシュートが変わったとき |
| 本ファイル (AGENTS.md) | エージェント向け制約・ビルド／OCR／翻訳／データルールが変わったとき |
| [docs/handoffs/](./docs/handoffs/index.md) | セッションをまたぐ作業の**途中の状態**が変わったとき（下の「引き継ぎ」） |

- 通常のバグ修正・リファクタ・小さな UX 調整で README / ROADMAP を書き換えない
- 完了した目標を ROADMAP の「未達」に残さない。現状は CURRENT_STATE へ
- 抽出・翻訳の詳細は専門文書へ書き、README / ROADMAP / CURRENT_STATE に重複コピーしない

## 引き継ぎ（handoff）

- 複数のセッションが並行して作業するので、引き継ぎは**作業ごとに 1 ファイル**: `docs/handoffs/<開始日>-<作業名>.md`（OKF、`type: Handoff`）。一覧は `docs/handoffs/index.md`（進行中／完了）。自分の作業のファイルだけを更新し、他のセッションのファイルは読むだけにする。
- handoff に書くのは**途中の状態だけ**: 依頼と目標、今の状態（main のコミット、作業中のブランチ・PR）、比べる基準 run と worktree の場所、次の一手、判断待ち・未確認。数行で済む量に保つ。
- 長く使う知識（現状値、済んだこと、次の候補、試して見送ったこと、測り方、作業上の注意）は分野ごとの**作業内容**の文書に書き、handoff からはリンクする。抽出は [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)。
- セッションの区切り（大きな PR のマージ後、作業の中断前）で handoff を更新し、作業内容の文書に移すべき知識があれば移す。作業が終わったら `status: deprecated` にして index の「完了」へ移す。
- `test-data/` などの gitignore 下に引き継ぎを置かない（worktree や他のセッションから見えない）。

## Tauri macOS アプリ

- Versio の基本動作確認は **Tauri macOS 実機を基準**にする。ブラウザ／Playwright確認は補助であり、取り込み・PDF抽出・翻訳・永続化・書き出し・macOS固有UIは最新の `.app` または `tauri:dev` で最終確認する。
- UI を変えたら `npm run dev` または preview を上げ、`npm run verify:browser` で Library / 設定 / Reader を実ブラウザ確認する。このセッションの Cursor に Browser MCP は無いので Playwright（`@playwright/test`）を使う。
- 新しい UI は [UI_INTERACTION_PRINCIPLES.md](./UI_INTERACTION_PRINCIPLES.md) に従う。局所操作は Popover、一時的な大きい作業は Sheet / Overlay、論文全体の一覧は Inspector。本文操作で Notes を自動で開かない。別 route は Library / Reader / Workspace / Settings だけ。同一対象の場所・サイズ変化（図の拡大など）は Shared Element Transition でビューを切らない。
- 角丸はクロソイド（`src/styles/squircle.module.css` の `surface` / `clip`、半径は `--sq-*`）。素の `border-radius: 8px` や `var(--radius-*)` は `src/styles/squircleGuard.test.ts` が落とす。円は `50%`。ピル（`999px`）は `composes: pill`（端が直線へ G2 で滑らかにつながる形）。円弧のままにする理由があればそのルール内に `/* squircle-exempt: 理由 */`。足りない半径は `scripts/generate-squircle-css.mjs` の `RADII` に足して再生成。SVG の角も `clothoidCorner()` で作る。
- `src-tauri/` が Tauri v2 のシェル。`npm run tauri:dev` で開発。日常の `.app` 確認は `npm run tauri:build:fast`（`.app` のみ）。リリース確認は `npm run tauri:build:clean`（`.app` + `.dmg`）。`npm run tauri:build` は clean のエイリアス。
- 生成物: `src-tauri/target/release/bundle/macos/Versio.app`
- アプリアイコンは Icon Composer 形式 `src-tauri/icons/AppIcon.icon`（ライト/ダーク）。`npm run build:icon` で `src-tauri/icons/Assets.car` にコンパイルしてコミットし、bundler はその `.car` を同梱する（bundler 内の actool は ibtoold デーモンが壊れて失敗するため使わない）。`icon.icns` はフォールバック。元画像は `design/icon/staple_icon.py`（`-- out.png 1024 384 light|dark layer|flat [shadow_gain]`）。現行ライトは `light layer 0.295`（左上キーライト、影は大きな影用ライトで物理的にぼかしてピーク約20%）、ダークは `dark layer`。V字影の試作は `design/icon/explorations/v-shadow/`。
- オンボーディング（イントロ動画・Introduction 論文・PLaMo 画面）の確認は `npm run onboarding:test`（`-- build` で再ビルド）。別 identity `com.harada.versio.onboarding` の「Versio Onboarding.app」を毎回データ初期化して開く。PLaMo モデルは日常用からハードリンクし、`VITE_VERSIO_ONBOARDING_PREVIEW=1` でモデル導入済みでも PLaMo 画面を出し、「ダウンロード」は約 8 秒の擬似進捗（下部の進捗通知を確認する用）。配布版のオンボーディングは初回 1 回だけ。イントロ後の「使い方」2 ページの動画（`src/assets/intro/howto-*.mp4/jpg`）は `npm run record:howto` で撮り直す（撮影専用デモビルド `VITE_VERSIO_DEMO_SEED=howto` を Playwright で操作し HEVC へ）。ライブラリや Reader の見た目を大きく変えたら撮り直す。
- 日常使いの Versio は `npm run install:app`（main をビルドして `/Applications/Versio.app` に置く）の1本に統一する。worktree の `.app` は確認用の使い捨て。
- PR をマージしたら `npm run prune:worktrees` でマージ済み worktree とローカルブランチを消す（未コミット変更あり・1時間以内に触った worktree は残す）。廃止したエンジンのモデル・venv・HF キャッシュは、コード削除と同じ PR の作業中にローカルからも消す。ベンチ／監査の出力先は作ったときに `.gitignore` へ入れる。
- Xcode は `/Applications/Xcode-beta.app` を使用。ビルド時は `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` を設定すること。
- phase 時間は `scripts/tauri-build.sh` と `.build-timings` / [docs/BUILD_TIMINGS.md](./docs/BUILD_TIMINGS.md)。
- macOS メニューバーは日本語の独自メニュー（`src-tauri/src/menu.rs`）。独自項目は `menu-action` イベントで `AppShell` が処理する。システムが足す項目（音声入力・絵文字など）は `src-tauri/Info.plist` の `CFBundleLocalizations = ja` で日本語になる。
- 本番 CSP は有効。WKWebView 向けに `script-src` は nonce のみにしない（`'self' 'unsafe-inline' 'wasm-unsafe-eval'`）。変更時は `.app` で白画面にならないか確認する。
- PDF 解析は **pdfjs-dist 3.11（legacy build）**。6.x は WKWebView で Iterator Helpers が無く即クラッシュするので上げない。日本語 CID フォントは `pdfjs-dist/cmaps`（Adobe-Japan1 など）をアプリに同梱してデコードする。
- ユーザー領域への書き出しは Rust の save dialog コマンドで完結させる。フロントから任意 absolute path への write API を復活させない。

## OCR（スキャン PDF 対応）

- Apple Vision Framework を Rust から呼び出す Tauri コマンド `ocr_image` を実装済み（`src-tauri/src/ocr.rs`）。
- `src/services/ocrService.ts` がフロントエンド側のラッパー。`isTauriApp()` で Tauri 環境を判定し、非 Tauri では「デスクトップ版のみ」と案内する。
- OCR 言語は `["en-US", "ja-JP"]` を既定値として渡している（Vision が自動検出）。
- スキャン判定は `extractAcademicPdf` 内の Page Classification（平均 item < 10 の baseline + garbled/mixed）。ImportService には OCR heuristic を置かない。

## Translation

- Production engine is **PLaMo 3 Translate 2B (GGUF Q4_K_M)** served by a bundled static `llama-server` sidecar (llama.cpp `b12110`, `src-tauri/src/plamo.rs`). Rust starts it lazily on `127.0.0.1:8766` (a free port if taken; readiness requires an authenticated `/v1/models` 200) with a per-launch `--api-key`, kills orphaned sidecar/curl via pid files in `<AppData>/models/`, `-np 8 -c 65536`, and stops it on window close. Frontend: `src/services/translation/plamoEngine.ts`.
- The model is **downloaded on first use** to `<AppData>/models/` (pinned HF revision + SHA-256, resumable `.part`). Do not bundle it in the `.app`. Build the sidecar with `npm run build:llama-server` (also run by `tauri-build.sh`); `src-tauri/binaries/` is gitignored and must link only system libraries.
- Translations are accepted by the deterministic check in `src/services/translation/translationCheck.ts` (breakdown + numbers/citations/URLs). Do not reintroduce `quality.ts` gates on the PLaMo path; those heuristics were tuned to MADLAD failures.
- Engine choice and evidence: `docs/research/local-llm-translation-bench-2026-11.md` (blind MQM + fact checks + whole-paper timing). Re-run `translation-server/scripts/local_llm_bench/` before switching models.
- Sidecar log: `~/Library/Logs/com.harada.versio/plamo-server.log` (previous launch: `plamo-server.prev.log`). Check it first when a packaged `.app` cannot translate.
- Frontend translation concurrency default is 8, matching the 8 server slots.

- MADLAD-400 (Python `translation-server`, port 8765) and the Apple short-item router were removed in 2026-11. Old `translation_cache` rows and saved `translationEngine` / `madladServerUrl` keys are ignored, not migrated. Do not reintroduce a Python translation runtime.

## Library search dictionary

- Library search expands queries with the bundled dictionary `src/generated/synonyms.json` (lazy chunk). Rebuild it with `npm run build:synonyms` (sources pinned with SHA-256 in `scripts/synonyms/sources.json`, cached in gitignored `.cache/synonyms-src/`); curated academic terms live in `scripts/synonyms/curated.txt`. Check expansions with `npx tsx scripts/synonyms/probe.ts <query>`. After editing `curated.txt`, run `npx tsx scripts/synonyms/validate-curated.ts` (PLaMo in context; review TSV) and `npx tsx scripts/synonyms/eval-search.ts` (recall / precision; keep precision ≥ 0.95 on the English-only corpus). Do not chain a generic English word with ` ~ ` (it floods results).
- Do not add ShareAlike sources (ConceptNet, JMdict) to the bundled dictionary. New sources need a Settings → ライセンス entry in `scripts/generate-licenses.mjs`.
- Papers' own definitions (`Long Form (ABBR)`, `日本語（English）`) go to SQLite `library_terms` via `indexPaperText` (raw Markdown; never from normalized `papers_fts` text). Query terms no dictionary knows are translated by PLaMo only through `plamo_server_if_running`: search must never start the sidecar.
- One-character Japanese query terms match `paper_words` (one-character word segments from `Intl.Segmenter("ja")`, written by `rebuildPaperFts`) at full weight; a hit only inside a longer word counts × `INSIDE_WORD_FACTOR` (0.2), so it always ranks below a word hit.
- Index and query go through the same `normalizeSearchText`; `papers_fts` stores normalized text only. Scoring runs in the `versio_search_score` SQL function (re-registered after every sql.js `export()`). Background: `docs/research/search-synonym-dictionary-2026-11.md`.

## Licenses (Settings)

- Settings → ライセンス lists Versio MIT plus **required** third-party notices (distributed on macOS and attribution-required). Regenerate with `npm run generate:licenses` (also `prebuild`). Source of truth is `src/generated/thirdPartyLicenses.json`. Do not invent SPDX identifiers; mark missing metadata as unknown/partial. Exclude: dev-only / non-bundled deps, other-platform Rust crates, and packages where a no-attribution license can be elected (`0BSD` / `Unlicense` / `CC0-1.0` / `MIT-0` / `WTFPL`). Policy details: `THIRD_PARTY_NOTICES.md`.

## Local data

- Paper body source of truth is the Paper Package at `<AppData>/papers/<paperId>/` (`source.pdf`, `paper.json`, `original.md`, `ja.md`, `translation.json`, `structure.json`, optional `layout.json.gz`, `assets/`). Do not store paper bodies only in IndexedDB or SQLite. Keep structured authors / affiliations / DOI in `paper.json`; do not mint `author-1` when ids already exist. Block APIs take `{ paperId, blockId }`. Re-extract must `reconcileBlockIds` then remap annotations / reading position.
- During translation, persist only `ja.md` / `paper.json` / `structure.json` on a debounce. Never rewrite `source.pdf`, `assets/`, or `layout.json.gz` per block. Full atomic persist + validation stays on finalize. Do not change the translation engine, server slots, or concurrency 8 to “fix” Reader jank.
- SQLite (`library.sqlite`) holds the library index, workspace tree, annotations, reading positions, glossaries, translation cache, and rebuildable FTS/LIKE search. See `DATA_ARCHITECTURE.md`.
- Zustand `useAppStore` is UI only (current paper, display settings, expanded originals). `useLibraryCache` / `useProjectStore` are in-memory query caches. Do not treat them as the document authority; persist through Paper Package / SQLite first.
- Original PDFs stay in the package as `source.pdf`. First import persist includes `sourcePdf` in the atomic Paper Package write. Do not pre-write `source.pdf` and then replace the package directory.
- SQLite schema is versioned. Add a numbered migration when changing tables. `translation_cache` PK is `(text_hash, model, model_version, source_language, target_language)`. `papers.source_file_hash` is UNIQUE. Close/exit must `flushDocumentPersist` + `db.persist()`; do not drop pending timers without writing.
- Annotations live in SQLite, anchored to stable block IDs. Re-anchor still uses selectedText + prefix + suffix.
- IndexedDB `versio` v4 is a read-only backup after migration. Do not delete it in the same release that introduces the new store.
- Assign papers to any WorkspaceNode by dragging a library paper row onto the sidebar item. Drag onto Inbox to remove all workspace memberships. Do not use HTML5 drag-and-drop for this: WKWebView often starts a drag but never fires `drop`. Use pointer tracking and `elementFromPoint`.
- Import a PDF by dropping it onto the app window. Use Tauri `onDragDropEvent` in the desktop app (HTML5 `drop` does not receive files in WKWebView). Browser `npm run dev` can keep HTML5 file drop. A drop on `/project/:id` attaches the paper to that project. macOS "Open With" / `open -a Versio.app a.pdf b.pdf` also imports (PDF file association with `LSHandlerRank` Alternate, never Default): Rust queues `RunEvent::Opened` paths and the frontend drains them with `take_opened_pdfs` on mount and on `opened-pdfs`. Use this for scripted test imports; do not add a URL scheme that accepts arbitrary paths. Do not navigate to `/import` as the main path; start `startBackgroundImport` and stay on Library. Show readiness (`preparing` / `readable` / `translating` / `needs_attention`) on cards, not raw processing stages. `⌘K` is library search, `⌘F` is in-paper search; focusing library search must not leave Reader.
- Workspace delete lives in the sidebar node's three-dot menu; do not show a duplicate trash icon in the workspace screen header. Deleting a node removes its subtree memberships only; paper records stay, and unassigned papers reappear in Inbox. The “論文を追加” button sits in the header next to the title on a WorkspaceNode, All Papers, and Inbox.
- Reading-order regression fixtures: `test-fixtures/` (synthetic PDFs only). Real papers from the jewelry-first-computing index live in gitignored `test-data/real-papers/` (`npm run fetch:real-papers`). Do not copy those PDFs into the repo or edit jewelry-first-computing.
- Real-paper extraction tests (`src/test/pdfExtraction`, `extractionIntegrityRegression`) skip without the gitignored PDFs, so CI never runs them. Before merging an extraction change, run `npx vitest run src/test/pdfExtraction` in a worktree whose test data is linked (`test-data/extraction-audit/tools/mkwt.sh`, which links `real-papers`, `field-gold`, `paragraph-gold`, and `pending-pdfs`). A dev A/B alone let 10 of them break unnoticed in 2026-11.
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
