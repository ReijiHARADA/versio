# Versio 現在の状態

user-visible な現在状態だけを書く。日付つきの作業ログ・計測の経緯は `docs/history/` へ。
2026-11-15 までの詳細ログ: [docs/history/CURRENT_STATE-log-2026-11-15.md](./docs/history/CURRENT_STATE-log-2026-11-15.md)（それ以前: [CURRENT_STATE-2026-10-05.md](./docs/history/CURRENT_STATE-2026-10-05.md)）。

## 提供中の機能

| 領域 | 状態 |
| --- | --- |
| 取り込み | ウィンドウへの PDF ドロップ、または Finder の「このアプリケーションで開く」/ `open -a Versio a.pdf b.pdf`（複数可・起動前でも可）でバックグラウンド取り込み。カードに readiness（preparing / readable / translating / needs_attention）。スキャン PDF は Apple Vision OCR（デスクトップ版のみ） |
| ライブラリ | 階層 WorkspaceNode、Inbox / お気に入り / 最近 / ゴミ箱、論文行のサイドバーへのドラッグ割り当て、⌘K 横断検索（題・著者・本文・訳文・ハイライト・メモ、FTS5 → LIKE fallback） |
| リーダー | 日本語 1 カラム、目次、原文段落展開、読書位置保存、⌘F 論文内検索、図表の本文内表示と拡大 |
| メモ・用語 | 訳文上のインラインメモ（block ID アンカー）、用語集 |
| 書き出し | 訳文 Markdown / Notion 用 ZIP / EPUB（スマホ同期）、フォルダ単位 ZIP。保存先は Rust save dialog |
| 元 PDF | 読んでいる付近のページを Preview で開く（macOS のみ） |
| 翻訳 | MADLAD-400 3B（MPS + bf16、batch 24、microbatch）。アプリが `127.0.0.1:8765` に spawn しトークン認証 |
| 設定 | 表示設定、ライセンス一覧（Versio MIT + 必須 third-party notices） |

## 検証状況

- CI（`main`）: TypeScript test / lint / build、Rust fmt / clippy / test（Ubuntu）、Python 軽量テスト すべて green。
- `src/test`: 110 files / 1124 tests pass、typecheck pass（2026-11-15）。oxlint 警告 0 は #6 マージ後。
- 実 PDF 依存テストはローカル fixture（gitignored）が無い環境では検証されない。CI ではこれらは実質未検証。
- `test:extraction-corpus`（CI 非ゲート）: 13 fail / 215 pass（2026-11-08 時点）。baselineRealPapers 11 件（title 誤選択・author/format 期待値差）と realPapers reading-order 2 件。
- 配布 `.app`（ROADMAP A1）: 未署名 `.app` で packaged integration E2E（Layer A: 取り込み・メモ・検索・書き出し・再起動）pass（2026-11-15）。packaged UI E2E（Layer B）は「カードを開く」段階で未通過（System Events の AXPress でカードの onClick が発火しない、過去にも通過記録なし）。署名・公証済みでの確認は未実施。
- packaged で見つけた同一 PDF の同時取り込みの生 SQLite エラーは修正済み（#12）。

## 品質の現状値

計測条件と経緯は専門文書を参照。ここには直近の代表値のみ。

- 抽出（OA コーパス 113 本）: source integrity 平均 0.99987、heading recall 平均 0.993、table-region recall 0.950。title exactness 0.867（正解未検証のため保留）。→ [docs/PDF_EXTRACTION_EVALUATION.md](./docs/PDF_EXTRACTION_EVALUATION.md)
- 抽出の項目別（出版社の構造化データを正解に 106 本・英日、ユーザー目視で妥当性確認済み）: 英語で title 0.95 / authors 0.24 / 著者↔所属 0.05 / references 0.24、日本語 title 0.20。GROBID は英語の authors 0.85・references 0.95 で、段階 3 で採用を検討中。→ [docs/EXTRACTION_FIELD_EVAL.md](./docs/EXTRACTION_FIELD_EVAL.md)
- 翻訳: fresh audit（113 本 / 954 units）で ordinary-body fallback 30.8%、目標 5% は未達。自動受理は品質達成とは扱わない。→ [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md)、[docs/PDF_EXTRACTION_TRANSLATION_QUALITY_EVALUATION.md](./docs/PDF_EXTRACTION_TRANSLATION_QUALITY_EVALUATION.md)
- CAT-Translate / Gemma / Qwen は監査比較のみで本番 routing 未統合。

## 既知の制限・未解決

1. `test:extraction-corpus` の 13 fail（上記）。
2. ページ境界・未閉鎖 delimiter・参考文献混入による source reconstruction failure。
3. 長い本文 unit の translation quality failure。
4. borderless table と flattened numeric rows の汎用抽出。
5. 100 本規模の section-stratified sampling と manual semantic review が不足。
6. 抽出コードの `formats/` 外に出版社・誌名別の判定が 66 行残る（ROADMAP B1 と不一致）。増加はテストで禁止済み、移行計画は [docs/EXTRACTION_SPECIAL_CASES.md](./docs/EXTRACTION_SPECIAL_CASES.md)。
7. 元 PDF を開く操作・Vision OCR は macOS 以外未対応。

## 診断の入口

- 配布 `.app` の翻訳サーバー出力（#5 マージ後）: `~/Library/Logs/com.harada.versio/translation-server.log`（前回起動分 `.prev.log`）。Rust 側は同ディレクトリの `Versio.log`。

## 保守リファクタリング記録

形式は [docs/REFACTORING_CADENCE.md](./docs/REFACTORING_CADENCE.md)。1 エントリ = 対象 / 挙動維持の根拠 / 検証 / 残課題。

- 2026-11-15 lint 整理: oxlint 警告 53 → 0。正規表現の不要エスケープのみ（意味不変）、hooks 偽陽性に理由付き注記。検証: tsc、pdfExtraction + translation 409 tests（実 PDF あり）。残課題: なし。
- 2026-11-15 publisher predicate 保守リファクタリング: 対象: 出版社・誌名別 predicate を `pdfExtraction/formats/publisherChrome.ts` へ集約。挙動維持の根拠: 呼び出し位置と無条件適用を維持。検証: policy Vitest、tsc。残課題: SENOPATI/NSTDA 等の単一論文ルールの汎用化は未実施。
- 2026-11-15 projection 保守リファクタリング: 対象: `projectCanonicalToPaper` を `projectFrontMatter` / `projectBody` / `finalizePaperProjection` に分離。挙動維持の根拠: characterization 209 PDFs、0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans と約560行の body node loop は state split が必要、単一プロセスの大きな PDF corpus run は Node heap を枯渇させる。
- 2026-11-15 projection finalization 保守リファクタリング: 対象: `finalizePaperProjection` を title projection・editor/reviewer recovery・block finalization の小さな sub-phase に分離。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans と body node dispatcher の state split は後続 PR で扱う。
- 2026-11-15 projection body dispatcher 保守リファクタリング: 対象: `projectBody` の node projection を typed state を介する dispatcher と table / heading / caption / equation / footnote / prose handler に分離し、後段 block aggregation を別 sub-phase 化。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans は後続 PR で扱う。
- 2026-11-15 front-matter author-recovery 保守リファクタリング: 対象: `projectFrontMatter` の early masthead author recovery（chapter footer / column masthead / ACM / affiliation and copyright rows）を typed `FrontMatterState` の named sub-phase に分離。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: 残る author recovery、title、affiliations、abstract/keywords は後続 PR で扱う。
- 2026-11-15 `projectFrontMatter` 分割: 1959 → 459 行。本文中の著者行の拾い直し（`frontMatter/bodyBylineRecovery.ts`）と、外側の `authorNames` / `affiliations` だけを書き換える 16 のかたまりを、AST 解析で機械的にモジュール関数へ切り出し、捕捉のない補助関数 4 つを最上位へ移動。挙動維持の根拠: 各段で characterization 209 PDFs（最小 150 + 最大 50 + synthetic）0 diffs。検証: vitest 112 files / 1061 pass、tsc、oxlint。残課題: 12〜36 行の小さなかたまりが残る（必要になったら）。
