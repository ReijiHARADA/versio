# Current State

最終更新: 2026-09-14  
**このファイルが「いま main に何があるか」の正です。** 実装を変えたらここを更新する（[AGENTS.md](./AGENTS.md)）。

コードを source of truth とし、アーキテクチャ詳細は各専門文書へリンクする（重複しない）。

---

## Feature status

| 領域 | 状態 | 要点 |
| --- | --- | --- |
| ライブラリ / ワークスペース | **done** | 階層フォルダ、パス trail、サイドバー幅調整、⌘K（FTS + メタデータ） |
| 起動時データ | **done** | メタデータのみ先読み。本文は Reader で lazy load。終了時は dirty のみ persist flush |
| Reader 本文 | **done** | 日本語 1 カラム、原文展開、目次、読書位置、⌘F |
| 長論文描画 | **done** | section 単位 lazy mount（非表示 section は 1 spacer）。pin は transient のみ（references / 全 search 一致を恒久 pin しない） |
| メモ | **done** | 訳文選択 Popover。右パネルは一覧専用（本文操作で自動オープンしない） |
| 用語集 | **done** | Inspector で CRUD + 訳後置換。本文中用語の軽量 Popover |
| Citation | **done** | 一意 `[n]` は preview Popover（ジャンプ / DOI・URL）。曖昧番号はリンクしない |
| 図表 | **done** | 本文表示 + Shared Element lightbox。asset は on-demand Blob URL（close で revoke） |
| 書き出し | **done** | Markdown / Notion ZIP / 検証パッケージ。保存ダイアログ〜 write は Rust |
| 元 PDF | **partial** | ページ指定で open。Preview ページジャンプは Accessibility 依存の best-effort。bbox ハイライトは未。Reader open では source.pdf を renderer に載せない |
| Import UX | **done** | background import、失敗原因の分類、再試行 / 再開、重複時に既存を開く |
| Import abort | **not done** | 実行中ジョブの真の中断は未実装（dismiss / 保存後の翻訳再開が主経路） |
| モデル lifecycle | **done** | process 起動と download/load/warmup 分離。extraction は model ready を待たない。原文 Reader は partial 後すぐ利用可。翻訳は ready 後に開始 / resume |
| server-ready resume | **done** | `needs_translation_resume`（SQLite schema v6）。completed paper の本文全件再読込なし |
| セキュリティ | **done** | 本番 CSP、localhost API、CSPRNG token、任意 path write 廃止、PDF path 検証 |
| 再現ビルド | **done** | `bundle-python.sh`（content-hash cache）+ lock + Python **3.12.14**。fast/clean 分離。stage で models/開発 venv を除外 |
| OCR | **done** | Apple Vision（Tauri のみ）。ブラウザ dev では不可 |
| 抽出 / 翻訳品質 | **ongoing** | CanonicalDocument + 品質ゲートは稼働中。残差は別ストリーム（下記） |

---

## Architecture（現行）

- **シェル**: Tauri 2 macOS。UI は React。翻訳サイドカーはアプリが spawn / 終了時に停止
- **本文の正本**: Paper Package（`<AppData>/papers/<paperId>/`）— [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)
- **索引・所属・メモ・読書位置・用語・FTS**: SQLite `library.sqlite`（schema v6: `needs_translation_resume`）
- **Reader open**: document / layout / source.pdf / assets を分離。既定 load は markdown + structure のみ。図は `assets/…` パスを保持し必要時に Blob 化
- **document cache**: `dirty` フラグ。read-only open → close では package を再 write しない
- **FTS**: annotation CRUD と translation checkpoint で per-paper incremental refresh
- **ReaderScreen**: hooks に分割（document / glossary / search / annotations / export / translation resume / reading position）。挙動は維持
- **抽出**: `extractAcademicPdf` → CanonicalDocument → Package。詳細は [ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md)
- **翻訳**: MADLAD-400 3B / MPS / bf16、文バッチ既定 24、品質ゲート。監査手順は [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md)
- **硬化メモ**: [P0_HARDENING.md](./P0_HARDENING.md)
- **packaged acceptance**: [docs/RELEASE_ACCEPTANCE.md](./docs/RELEASE_ACCEPTANCE.md)

---

## Known limitations / 残課題

- Citation / 用語 Popover の authors・title はヒューリスティック。構造化抽出の強化は extraction 側
- Preview ページジャンプは失敗しても PDF 自体は開く
- 配布 `.app` での一連操作の **公証付きビルドでの再確認**は残る（acceptance checklist は整備済み）
- `tauri-plugin-shell` の未使用残り・公証 CI は hardening 残件（P0_HARDENING）
- **抽出残差（本変更では未修正）**: `npm run test:extraction-corpus` にて実コーパスで確認。現状ローカル fixture では `interactive-jewellery`（token order）、`neuroscience-rule-following` / `economics-regularized-deepiv`（page1 multi-column 判定）が失敗。2 段組・図キャプション・affiliation grid・インライン数式などは別ワークストリーム
- **native SQLite 移行**: 未実施。下記計測を見て判断する（現時点で rewrite しない）

---

## Scale measurements（synthetic in-memory）

`npm run bench:library-scale -- --count N`（sql.js + memory FS。相対指標）

| N | buildMs | openAllPapersMs | searchLatencyMs | sqliteBytes | shutdownPersistMs |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | ~78 | ~6 | ~0.7 | ~586 KB | ~0 |
| 500 | ~364 | ~28 | ~0.6 | ~2.3 MB | ~1 |

Reader open は source.pdf / assets を読まない前提。native SQLite の必要性は、実ディスク + 実 UI メモリでも同様のボトルネックが出てから再判断する。

---

## Release readiness

| 項目 | 状態 |
| --- | --- |
| `npm run tauri:build:fast` → `.app` | 日常確認（cached Python） |
| `npm run tauri:build:clean` / `tauri:build` → `.app` + `.dmg` | リリース（clean Python）。CI acceptance は clean |
| PR CI | `.github/workflows/ci.yml`（TS test/lint/build、browser smoke、Rust fmt/clippy/test、軽量 Python） |
| Packaged acceptance | `release-acceptance.yml` + [docs/RELEASE_ACCEPTANCE.md](./docs/RELEASE_ACCEPTANCE.md) |
| MADLAD 大容量 download | 通常 CI 外（nightly / human acceptance） |
| App Store / 公証フローの CI | 未整備 |
| Windows | 対象外 |

---

## Test / verification

| コマンド | 役割 |
| --- | --- |
| `npm test` | Vitest（Reader / data / import 基盤。extraction corpus は除外） |
| `npm run test:extraction-corpus` | 実 PDF 抽出品質（別ストリーム） |
| `npm run lint` | oxlint |
| `npm run build` | `tsc` + Vite |
| `npm run verify:browser` | Playwright スモーク |
| `npm run bench:library` | 100/500 synthetic library 指標（startup / memory proxy / SQLite / search / persist） |
| `npm run release:acceptance` | release 前自動ゲート + `.app` 手順表示 |
| `npm run test:bundle-python` | Python runtime content-hash cache + stage smoke |
| `npm run tauri:build:fast` | 日常 `.app`（cached Python） |
| `npm run tauri:build:clean` | リリース `.app` + `.dmg`（clean Python） |

基盤回帰の例: `importResumeServerReady.test.ts`（100 completed → body read 0）、`dirtyTracking.test.ts`（100 read-only → write 0）、`sectionVirtualization.test.ts`（50+ jump mount bound）、`ftsFreshness.test.ts`。

`verify:browser` は preview/dev サーバ起動前提。workspace 子フォルダ見出し待ちでタイムアウトすることがある（既知フレーク）。CI では build 後に `vite preview` を立てて実行する。

Python PR CI は torch 不要の `tests.test_citation_protect` を実行。`micro_batcher` / `segmenter`（MADLADEngine import）はローカル／nightly（torch あり）向け。

