# Current State

最終更新: 2026-09-14  
**このファイルが「いま main に何があるか」の正です。** 実装を変えたらここを更新する（[AGENTS.md](./AGENTS.md)）。

コードを source of truth とし、アーキテクチャ詳細は各専門文書へリンクする（重複しない）。

---

## Feature status

| 領域 | 状態 | 要点 |
| --- | --- | --- |
| ライブラリ / ワークスペース | **done** | 階層フォルダ、パス trail、サイドバー幅調整、⌘K（FTS + メタデータ） |
| 起動時データ | **done** | メタデータのみ先読み。本文は Reader で lazy load。終了時は persist flush |
| Reader 本文 | **done** | 日本語 1 カラム、原文展開、目次、読書位置、⌘F |
| 長論文描画 | **done** | section 単位の遅延マウント + block プレースホルダ。短編は全マウント |
| メモ | **done** | 訳文選択 Popover。右パネルは一覧専用（本文操作で自動オープンしない） |
| 用語集 | **done** | Inspector で CRUD + 訳後置換。本文中用語の軽量 Popover |
| Citation | **done** | 一意 `[n]` は preview Popover（ジャンプ / DOI・URL）。曖昧番号はリンクしない |
| 図表 | **done** | 本文表示 + Shared Element lightbox |
| 書き出し | **done** | Markdown / Notion ZIP / 検証パッケージ。保存ダイアログ〜 write は Rust |
| 元 PDF | **partial** | ページ指定で open。Preview ページジャンプは Accessibility 依存の best-effort。bbox ハイライトは未 |
| Import UX | **done** | background import、失敗原因の分類、再試行 / 再開、重複時に既存を開く |
| Import abort | **not done** | 実行中ジョブの真の中断は未実装（dismiss / 保存後の翻訳再開が主経路） |
| モデル lifecycle | **done** | process 起動と download/load/warmup 分離。Library は準備中も可。固定 90s timeout なし |
| セキュリティ | **done** | 本番 CSP、localhost API、CSPRNG token、任意 path write 廃止、PDF path 検証 |
| 再現ビルド | **done** | `bundle-python.sh` + `requirements.lock` + Python **3.12.14** 固定 |
| OCR | **done** | Apple Vision（Tauri のみ）。ブラウザ dev では不可 |
| 抽出 / 翻訳品質 | **ongoing** | CanonicalDocument + 品質ゲートは稼働中。残差は別ストリーム（下記） |

---

## Architecture（現行）

- **シェル**: Tauri 2 macOS。UI は React。翻訳サイドカーはアプリが spawn / 終了時に停止
- **本文の正本**: Paper Package（`<AppData>/papers/<paperId>/`）— [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)
- **索引・所属・メモ・読書位置・用語・FTS**: SQLite `library.sqlite`
- **抽出**: `extractAcademicPdf` → CanonicalDocument → Package。詳細は [ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md](./ACADEMIC_PDF_EXTRACTION_ARCHITECTURE.md)
- **翻訳**: MADLAD-400 3B / MPS / bf16、文バッチ既定 24、品質ゲート。監査手順は [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md)
- **硬化メモ**: [P0_HARDENING.md](./P0_HARDENING.md)

---

## Known limitations

- Citation / 用語 Popover の authors・title は参考文献・用語テキストのヒューリスティック。構造化抽出の強化は extraction 側
- 長論文仮想化の **実 PDF メモリ計測**（50–100 ページ）は fixture 依存で未実測。ユニット指標と通常の Reader 検証で代替
- Preview ページジャンプは失敗しても PDF 自体は開く
- 配布 `.app` での一連操作（メモ、元 PDF、DOI、Notion インポート、CSP 白画面）はコード上実装済みだが、**公証付きビルドでの再確認**は残る
- `tauri-plugin-shell` の未使用残り・公証 CI は hardening 残件（P0_HARDENING）
- 2 段組・図キャプション・affiliation grid・インライン数式などの抽出残差は別ワークストリーム

---

## Release readiness

| 項目 | 状態 |
| --- | --- |
| `npm run tauri:build` → `.app` / `.dmg` | 可能（`beforeBuildCommand` で clean Python） |
| Python runtime 再現性 | **3.12.14** + lock |
| App Store / 公証フローの CI | 未整備 |
| Windows | 対象外 |

---

## Test / verification

| コマンド | 役割 |
| --- | --- |
| `npm test` | Vitest（抽出・翻訳・Reader UX ロジックなど） |
| `npm run lint` | oxlint |
| `npm run build` | `tsc` + Vite |
| `npm run verify:browser` | Playwright スモーク（Library / 設定など） |
| `npm run fetch:real-papers` ほか | 実論文コーパス（gitignore の `test-data/`） |

P1 回帰の例: `src/test/reader/sectionVirtualization.test.ts`, `src/test/reader/p1ReaderUx.test.ts`。

`verify:browser` は環境により workspace 見出し待ちでタイムアウトすることがある。失敗時は再現条件をこの節に追記する。
