---
type: Note
title: Versio 現在の状態
description: user-visible な現在状態のまとめ。
tags: [status]
---

# Versio 現在の状態

user-visible な現在状態だけを書く。日付つきの作業ログ・計測の経緯は `docs/history/` へ。
2026-11-15 までの詳細ログ: [docs/history/CURRENT_STATE-log-2026-11-15.md](./docs/history/CURRENT_STATE-log-2026-11-15.md)（それ以前: [CURRENT_STATE-2026-10-05.md](./docs/history/CURRENT_STATE-2026-10-05.md)）。

## 提供中の機能

| 領域 | 状態 |
| --- | --- |
| 取り込み | ウィンドウへの PDF ドロップ、または Finder の「このアプリケーションで開く」/ `open -a Versio a.pdf b.pdf`（複数可・起動前でも可）でバックグラウンド取り込み。カードに readiness（preparing / readable / translating / needs_attention）。スキャン PDF は Apple Vision OCR（デスクトップ版のみ）。複数取り込み時は 1 本ずつ順番に処理（抽出→翻訳、他は一時停止）し、Reader で開いた論文の翻訳へ即座に切り替える |
| ライブラリ | 階層 WorkspaceNode、Inbox / お気に入り / 最近 / ゴミ箱、論文行のサイドバーへのドラッグ割り当て、⌘K 横断検索（題・著者・本文・訳文・ハイライト・メモ、FTS5 → LIKE fallback） |
| リーダー | 日本語 1 カラム、目次、原文段落展開、読書位置保存、⌘F 論文内検索、図表の本文内表示と拡大 |
| メモ・用語 | 訳文上のインラインメモ（block ID アンカー）、用語集 |
| 書き出し | 訳文 Markdown / Notion 用 ZIP / EPUB（スマホ同期）、フォルダ単位 ZIP。保存先は Rust save dialog |
| 元 PDF | 読んでいる付近のページを Preview で開く（macOS のみ） |
| 翻訳 | 既定は PLaMo 3 Translate 2B（同梱 `llama-server`、`127.0.0.1:8766`、起動ごとのトークン）。モデル（1.8 GB）は初回利用時に設定画面または取り込み時にダウンロード。旧 MADLAD-400 3B と Python 翻訳サーバーは削除済み（2026-11-17）。根拠: [docs/research/local-llm-translation-bench-2026-11.md](./docs/research/local-llm-translation-bench-2026-11.md) |
| 設定 | 表示設定、ライセンス一覧（Versio MIT + 必須 third-party notices） |

## 検証状況

- CI（`main`）: TypeScript test / lint / build、Rust fmt / clippy / test（Ubuntu）すべて green。
- `src/test`: 110 files / 1124 tests pass、typecheck pass（2026-11-15）。oxlint 警告 0 は #6 マージ後。
- 実 PDF 依存テストはローカル fixture（gitignored）が無い環境では検証されない。CI ではこれらは実質未検証。
- `test:extraction-corpus`（CI 非ゲート）: 13 fail / 215 pass（2026-11-08 時点）。baselineRealPapers 11 件（title 誤選択・author/format 期待値差）と realPapers reading-order 2 件。
- 配布 `.app`（ROADMAP A1）: 未署名 `.app` で packaged integration E2E（Layer A: 取り込み・メモ・検索・書き出し・再起動）pass（2026-11-15）。packaged UI E2E（Layer B）は「カードを開く」段階で未通過（System Events の AXPress でカードの onClick が発火しない、過去にも通過記録なし）。署名・公証済みでの確認は未実施。
- packaged で見つけた同一 PDF の同時取り込みの生 SQLite エラーは修正済み（#12）。

## 品質の現状値

計測条件と経緯は専門文書を参照。ここには直近の代表値のみ。

- 抽出（OA コーパス 113 本）: source integrity 平均 0.99987、heading recall 平均 0.993、table-region recall 0.950。title exactness 0.867（正解未検証のため保留）。→ [docs/PDF_EXTRACTION_EVALUATION.md](./docs/PDF_EXTRACTION_EVALUATION.md)
- 抽出の項目別（出版社の構造化データを正解に 106 本・英日、ユーザー目視で妥当性確認済み）: 英語で title 0.95 / authors 0.24 / 著者↔所属 0.05 / references 0.95、日本語 title 0.20。英語の参考文献は、ページの文字列から参考文献の範囲を決め、GROBID 0.9.1 の CRF（Apache-2.0）を TypeScript に移植した区切り・解析で 1 件ずつのブロック（著者・題・年・誌名・DOI 付き）に再構成する（日本語・失敗時は従来どおり）。GROBID 本体は英語の authors 0.85・references 0.95。→ [docs/EXTRACTION_FIELD_EVAL.md](./docs/EXTRACTION_FIELD_EVAL.md)
- 段落の抽出品質（JATS とページ画像の書き起こしを正解に、アプリと同じ抽出経路で監査）: 「段落の末尾が欠けている…原文を表示しています」の大半は抽出の失敗（図表・柱をまたぐ段落の分断、狭いガターの 2 段組の行の交互混入）。段落のつなぎ直しと段組・柱の判定を直し、警告の出る段落は実論文 113 本で 15.8% → 11.8%、評価用セットで 20.9% → 14.9%。さらに、結合や箇条書き分割の後に残っていた古い警告と、数式の前後の誤警告を最終テキストで判定し直し、実論文で 9.9%、評価用セットで 10.8%。数字や括弧の続きで始まる段落もつなぐようにして、実論文で 9.0%。評価コーパスを JATS 正解付きの 1,277 本に広げ、字下げによる段落区切り・行末ハイフン・表に吸い込まれた本文・セルごとの表・参考文献の誤判定・文末の誤判定を直して、調整に使っていない評価用 404 本で正しくまとまった段落 72.4% → 82.5%、警告ブロック 4,757 → 3,939。実論文で 7.7%。単語単位の 2 段組 PDF で段の境界がずれて行末の語が消える誤りと、文の切れ目で段組・ページをまたぐ段落の分断を直し、評価用で 85.9%（PDF に印字された段落だけなら 87.8%、指標の天井は約 98%）、警告ブロック 3,759。読み順を組む前に表/図の領域を切り出すようにして、評価用で 86.7%（印字分 88.7%）、本文外ブロックへの警告 1,704 → 1,499。表/図の領域が本文行を飲み込む誤り・表の文字を段組の証拠にする誤り・引用番号で始まる本文行の脚注誤判定を直し、図表の注記をまたいで段落をつなぐようにして、評価用で 87.7%（印字分 89.6%）、警告ブロック 3,280 → 3,116。表の見出しがあって本文の行がほぼ無いページの小さい字を表として扱い、本文外の警告を減らして警告ブロック 3,116 → 3,003（正しくまとまった段落は変わらず）。→ [docs/EXTRACTION_INTEGRITY_AUDIT.md](./docs/EXTRACTION_INTEGRITY_AUDIT.md)
- 本文以外の要素（要素正解、Europe PMC dev 868 本 / ACL 20 本 / arXiv 20 本）: 所属・ライセンス・脚注が本文段落に混ざる割合 25.1% / 13.4% / 14.5% → 13.5% / 7.2% / 7.2%。脚注 2.8% / 44.0% / 70.0% → 23.9% / 68.1% / 83.3%。誌名/学会名を表示（88.6% / 90.0%、ACM 形式は未対応）。→ [docs/ELEMENT_GOLD.md](./docs/ELEMENT_GOLD.md)
- タイトル（要素正解、Europe PMC dev 868 本 / ACL 20 本 / arXiv 20 本）: 折り返したタイトルを最大の字の行から組み直し、78.2% / 80.0% / 55.0% → 79.5% / 100% / 70.0%。→ [docs/ELEMENT_GOLD.md](./docs/ELEMENT_GOLD.md)
- 付録・補足の図表番号（`Table A6:`、`Table S2.`、`Figure A3:`）をキャプションとして認識し、段の中のキャプションの近くで行を集めるときは同じ段の行だけを使う。要素正解 dev で ACL の表 69.3% → 79.2%、Europe PMC 106 本の表 89.6% → 90.7%（論文単位の悪化なし）。→ [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)
- LaTeX の分離したアクセント記号（`D´ıaz`、`N´u˜nez`、`Franc¸ois`）を行の段階で合成する。全大文字の著者名は `Edoardo Ballico` の形にそろえ、`AND` で区切り、`OF`・`ON` などを含む全大文字のタイトル行は著者に入れない。要素正解 dev で arXiv の著者 40.7% → 51.9%、Europe PMC 106 本の著者 73.1% → 73.7%（論文単位の悪化なし）。続けて、所属に直接くっついた名前（`PandeyDepartment`）、ACM Reference Format による著者の補完、段の境界で切れた著者行の再結合、上付きの所属番号の位置でのカンマ補完、AASTeX の `Name,1` 形式の著者行に対応し、arXiv の著者は 100%（54/54）。
- 要素正解の採点で、宣言系の注記（Author contributions、Competing interests など）は脚注でも見出し付きの末尾の節でも正解とする。Europe PMC dev の脚注 23.9% → 28.8%（採点の変更のみ）。→ [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)
- 責任著者の連絡先（`Correspondence: 名前, メール`）を脚注として Reader に残す。サイドバーのラベル・名前・メールは 1 つの注記にまとめる。Europe PMC 106 本の脚注 31.5% → 68.5%、ACL・arXiv は変化なし。
- ACL の著者行で、名前の直後の上付き所属番号の位置に区切りを補う（`Zhenhua Liu¹ Tong Zhu¹`）。ACL dev の著者 71.1% → 82.9%、他は変化なし。
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

- 配布 `.app` の PLaMo サイドカー出力: `~/Library/Logs/com.harada.versio/plamo-server.log`。Rust 側は同ディレクトリの `Versio.log`。

## 保守リファクタリング記録

形式は [docs/REFACTORING_CADENCE.md](./docs/REFACTORING_CADENCE.md)。1 エントリ = 対象 / 挙動維持の根拠 / 検証 / 残課題。

- 2026-11-15 lint 整理: oxlint 警告 53 → 0。正規表現の不要エスケープのみ（意味不変）、hooks 偽陽性に理由付き注記。検証: tsc、pdfExtraction + translation 409 tests（実 PDF あり）。残課題: なし。
- 2026-11-15 publisher predicate 保守リファクタリング: 対象: 出版社・誌名別 predicate を `pdfExtraction/formats/publisherChrome.ts` へ集約。挙動維持の根拠: 呼び出し位置と無条件適用を維持。検証: policy Vitest、tsc。残課題: SENOPATI/NSTDA 等の単一論文ルールの汎用化は未実施。
- 2026-11-15 projection 保守リファクタリング: 対象: `projectCanonicalToPaper` を `projectFrontMatter` / `projectBody` / `finalizePaperProjection` に分離。挙動維持の根拠: characterization 209 PDFs、0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans と約560行の body node loop は state split が必要、単一プロセスの大きな PDF corpus run は Node heap を枯渇させる。
- 2026-11-15 projection finalization 保守リファクタリング: 対象: `finalizePaperProjection` を title projection・editor/reviewer recovery・block finalization の小さな sub-phase に分離。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans と body node dispatcher の state split は後続 PR で扱う。
- 2026-11-15 projection body dispatcher 保守リファクタリング: 対象: `projectBody` の node projection を typed state を介する dispatcher と table / heading / caption / equation / footnote / prose handler に分離し、後段 block aggregation を別 sub-phase 化。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: front-matter の author-recovery spans は後続 PR で扱う。
- 2026-11-15 front-matter author-recovery 保守リファクタリング: 対象: `projectFrontMatter` の early masthead author recovery（chapter footer / column masthead / ACM / affiliation and copyright rows）を typed `FrontMatterState` の named sub-phase に分離。挙動維持の根拠: main と比較した characterization（150 smallest + 50 largest + synthetic、209 PDFs）で 0 diffs。検証: full Vitest、tsc、oxlint。残課題: 残る author recovery、title、affiliations、abstract/keywords は後続 PR で扱う。
- 2026-11-15 `projectFrontMatter` 分割: 1959 → 459 行。本文中の著者行の拾い直し（`frontMatter/bodyBylineRecovery.ts`）と、外側の `authorNames` / `affiliations` だけを書き換える 16 のかたまりを、AST 解析で機械的にモジュール関数へ切り出し、捕捉のない補助関数 4 つを最上位へ移動。挙動維持の根拠: 各段で characterization 209 PDFs（最小 150 + 最大 50 + synthetic）0 diffs。検証: vitest 112 files / 1061 pass、tsc、oxlint。残課題: 12〜36 行の小さなかたまりが残る（必要になったら）。
