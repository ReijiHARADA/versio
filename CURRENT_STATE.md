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
| 初回起動 | 紙を裏から見た画面に青いホチキスの受け皿が迫り、二段階で綴じて（録音した音に同期）バネの反動で浮き上がって去るイントロ（Blender 動画、`design/intro/`）→「Versioを使い始める」→ 翻訳モデル未導入なら専用画面で PLaMo（1.8 GB）のダウンロードを案内（「ダウンロード」で本画面へ進み裏でインストール、画面下部に進捗バー付きの常駐通知、完了・失敗はトースト。「あとで」可、設定と同じダウンロードを共有）。続けて全員に「使い方」2 ページ（慣れた人の操作を録画したループ動画＋見出し 1 行：1「PDF を落として、集める」、2「日本語で読み、原文で確かめる」。「次へ／はじめる」「スキップ」、動きを減らす設定では静止画。ダウンロードは裏で続く。動画はデモビルドを `npm run record:howto` で録画し、Rotato で MacBook に載せた透過動画）。ライブラリが空の初回だけ、使い方を章立てで説明する英日対訳の同梱論文「Versio: 言語を越えて論文を読む」（`src/data/introductionPaper.ts`）を投入（ゴミ箱に入れても再投入しない、既存ユーザーには入れない）。動画も Introduction も配布版では初回 1 回だけ。確認用は `npm run onboarding:test` |
| 取り込み | ウィンドウへの PDF ドロップ、または Finder の「このアプリケーションで開く」/ `open -a Versio a.pdf b.pdf`（複数可・起動前でも可）でバックグラウンド取り込み。「論文を追加」を押すと出るポップオーバーで「PDF ファイルを選択…」（⌘O と同じ）か、arXiv ID・DOI（URL 可）を入れると、オープンアクセスの PDF を取得して同じ経路で取り込む（Rust `download_open_access_pdf`。arXiv は arxiv.org、DOI は OpenAlex が示す https の PDF のみ、100MB まで、`%PDF` で確認。デスクトップ版のみ）。カードに readiness（preparing / readable / translating / needs_attention）。スキャン PDF は Apple Vision OCR（デスクトップ版のみ）。複数取り込み時は 1 本ずつ順番に処理（抽出→翻訳、他は一時停止）し、Reader で開いた論文の翻訳へ即座に切り替える。Reader の参考文献に arXiv ID・DOI があれば、引用のポップオーバーと参考文献の一覧に「ライブラリに追加」（arXiv を先に試し、だめなら DOI）、すでにライブラリにあれば「ライブラリで開く」を出す。DOI も arXiv ID も無い参考文献は「題名で探す…」で Crossref（文字列そのまま）→ OpenAlex（推定した題名）を検索し、題名・年・筆頭著者が合う候補を「この論文ですか？」と確認してから追加する（英語の参考文献で約 7〜9 割が見つかり、測った範囲で別の論文の誤りは 0。→ [docs/research/reference-title-search-2026-11.md](./docs/research/reference-title-search-2026-11.md)） |
| ライブラリ | 階層 WorkspaceNode、Inbox / お気に入り / 最近 / ゴミ箱、論文行のサイドバーへのドラッグ割り当て、すべての論文・フォルダ画面のリスト／アイテム表示切り替えと並べ替え（追加日・最近開いた日・タイトル・発行年 × 昇順／降順、論文のみ。アイテム表示は元 PDF 1 ページ目の表紙と、中の論文が覗くフォルダ。表紙は `covers/<paperId>.jpg` にキャッシュ）、サイドバーは常時表示（幅 1024px 未満では畳んでホバーで開く・ロゴ横のボタンで手動開閉）、⌘K 横断検索（題・著者・本文・訳文・ハイライト・メモ。索引とクエリを同じ規則で正規化して表記ゆれを吸収（全角半角、カタカナの長音、ヴ／バ、中黒・ハイフン）、空白区切りは AND、題の一致を上位、UI・AR など 3 文字以下の英字は単語単位で照合。蚊・数・め のような 1 文字の日本語は、単語として使われている論文を上位に、熟語の中にだけ出てくる論文（「目」に対する 目鼻、「数」に対する 関数）をその下に並べる（`Intl.Segmenter` の単語分割、schema v12 の `paper_words`）。同梱の類義語辞書（Sudachi 同義語辞書・Open English WordNet + 日本語 WordNet・独自の学術用語）で類義語・訳語・略語・表記ゆれも検索し、取り込んだ論文の本文で定義された略語・対訳（「System Usability Scale (SUS)」「認知負荷（cognitive load）」、schema v11 の `library_terms`）と、辞書に無い語は起動中の PLaMo による日英訳も足す。検索欄の「+N」から語ごとにオン／オフ・機能ごとオフ（弱い候補は既定でオフ）。同梱の sql.js に FTS5 は無いので、本文を 1 行 1 回だけ読む採点関数で部分一致。schema v10）。読書ステータス（未読／読書中／読了、初めて開くと読書中）とタグを論文メニューで設定しカードに表示、並べ替えメニューで絞り込み（絞り込みは保存しない）。どちらも SQLite のみ（schema v8）。DOI か題名（正規化、16 文字以上）が同じ論文を「重複の可能性」として並べ替えメニューで絞り込み（組ごとに並ぶ）、取り込み時に似た論文があればトーストで知らせる（取り込みは続ける）。DOI は `paper.json` から SQLite に写す（schema v9、起動時の同期で補完）。複数選択中に選択内の論文を右クリックすると一括メニュー（お気に入り・読書ステータス・ワークスペースに追加／から外す・まとめてゴミ箱へ、元に戻すは一括） |
| リーダー | 日本語 1 カラム、目次、原文段落展開、読書位置保存、目次は既定で非表示、⌘F 論文内検索（右上の検索欄が画面に応じてスコープを切り替え。本文右上に件数と前後移動の小さなバー、検索中は右インスペクタに一時的な「検索」タブで結果一覧）、右インスペクタ（情報 / メモ / 用語のタブ。選択中のタブはグレーのハイライトが滑って移り、中身はフェードで切り替わる。情報は Zotero / Mendeley 型で、概要・書誌情報（BibTeX コピー）・ライブラリ状態・翻訳の進み具合や図表・参考文献・メモの数を表示。広い窓では地に置き、初回は「情報」で開く。開閉と最後のタブを保持）、図表の本文内表示と拡大 |
| 論文タブ | メインカードの上（タイトルバーの帯）に Chrome 風のタブ。論文を開くと同じ論文のタブがあればそこへ、なければ今のタブの右に新しいタブを開く。ライブラリなど論文以外の画面ではどのタブも選ばれていない状態。クリックで切り替え、× か中クリックで閉じる、ドラッグで並べ替え、翻訳中の論文は「翻訳中」と表示。⌘W でタブを閉じる（論文以外の画面ではウインドウを閉じる。⇧⌘W は常にウインドウ）、⌘1〜⌘9（9 は最後）、⌃Tab ／ ⌃⇧Tab。開いていたタブの一覧は再起動後も残る（起動時はライブラリを表示）。ゴミ箱に入れた・削除した論文のタブは自動で消える |
| 書誌情報 | 論文メニュー「書誌情報…」のシートで題・著者・掲載誌・年・巻・号・ページ・DOI・URL を編集し `paper.json` に保存。DOI / arXiv ID（URL 可）を入れて「取得」を押したときだけ Crossref / arXiv に問い合わせ（Rust の `fetch_bibliographic_record`、固定ホストのみ）、内容を確認してから保存 |
| メモ・用語 | 訳文上のインラインメモ（block ID アンカー）、用語集（Reader の用語タブで手動編集。登録した用語は PLaMo に訳語の指定として渡す。Ollama による自動生成は 2026-11 に廃止） |
| 書き出し | 訳文 Markdown / Notion 用 ZIP / EPUB（スマホ同期）、フォルダ単位 ZIP。参考文献は論文メニュー「BibTeX をコピー」、フォルダメニュー「BibTeX / RIS を書き出す…」（書誌情報は `paper.json` から）。保存先は Rust save dialog |
| 元 PDF | 読んでいる付近のページを Preview で開く（macOS のみ） |
| 翻訳 | 既定は PLaMo 3 Translate 2B（同梱 `llama-server`、`127.0.0.1:8766`、起動ごとのトークン）。モデル（1.8 GB）は初回利用時に設定画面または取り込み時にダウンロード。旧 MADLAD-400 3B と Python 翻訳サーバーは削除済み（2026-11-17）。根拠: [docs/research/local-llm-translation-bench-2026-11.md](./docs/research/local-llm-translation-bench-2026-11.md) |
| 設定 | 読書（表示設定）・翻訳（モデル、速度、全論文に効く共通の用語集。論文ごとの用語集が同じ用語では優先、これから翻訳する文章に効く）・ライブラリとデータ（保存場所を Finder で表示と使用容量、バックアップ、ゴミ箱、翻訳キャッシュ、EPUB 同期）・このアプリについて（バージョン、アップデートを確認、ショートカット一覧、翻訳ログを Finder で表示）、ライセンス一覧（Versio MIT + 必須 third-party notices）。保存場所・アップデート・翻訳ログはデスクトップ版のみ |
| 画面の動き | 画面（ライブラリ・リーダー・設定・フォルダ）の切り替えはフェード。シート・モーダル・ポップオーバー・メニュー・セレクト・検索バー・表示設定・メモ・目次・右インスペクタ・フォルダの開閉・原文展開・処理中バナー・PDF ドロップ表示は、開くときも閉じるときもアニメーションする（共通の `Presence` と `src/styles/motion.module.css`、「視差効果を減らす」設定では止まる） |
| macOS 標準操作 | ウインドウの位置・サイズを次回起動時に復元。表示メニューの「文字を大きく／小さく／標準サイズに」（⌘= ／ ⌘− ／ ⌘0、JIS では ⌘; も可）。ヘルプメニュー（項目検索欄つき）から「キーボードショートカット」（⌘/）の一覧。起動時と Versio メニュー「アップデートを確認…」で GitHub Releases の新しい版を確認し、トーストから入れて再起動（リリース未公開のため現時点では常に最新扱い） |

## 検証状況

- CI（`main`）: TypeScript test / lint / build、Rust fmt / clippy / test（Ubuntu）すべて green。
- `src/test`: 110 files / 1124 tests pass、typecheck pass（2026-11-15）。oxlint 警告 0 は #6 マージ後。
- 実 PDF 依存テストはローカル fixture（gitignored）が無い環境では検証されない。CI ではこれらは実質未検証。
- `test:extraction-corpus`（CI 非ゲート）: 13 fail / 215 pass（2026-11-08 時点）。baselineRealPapers 11 件（title 誤選択・author/format 期待値差）と realPapers reading-order 2 件。
- 配布 `.app`（ROADMAP A1）: ad-hoc 署名の `.app` で packaged integration E2E（Layer A: 取り込み・メモ・検索・書き出し・再起動）と packaged UI E2E（Layer B: カード→Reader→メモ保存→論文内検索→書き出し→再起動後のメモ表示）が pass（2026-11-24、Layer B は初の通過）。配布は Developer ID なしの ad-hoc 署名（初回起動は「プライバシーとセキュリティ」→「このまま開く」）。Developer ID 署名・公証での確認は未実施。
- packaged で見つけた同一 PDF の同時取り込みの生 SQLite エラーは修正済み（#12）。

## 品質の現状値

計測条件と経緯は専門文書を参照。ここには直近の代表値のみ。

- 抽出（OA コーパス 113 本）: source integrity 平均 0.99987、heading recall 平均 0.993、table-region recall 0.950。title exactness 0.867（正解未検証のため保留）。→ [docs/PDF_EXTRACTION_EVALUATION.md](./docs/PDF_EXTRACTION_EVALUATION.md)
- 抽出の項目別（出版社の構造化データを正解に 106 本・英日、ユーザー目視で妥当性確認済み）: 英語で title 0.95 / authors 0.24 / 著者↔所属 0.05 / references 0.95、日本語 title 0.20。英語の参考文献は、ページの文字列から参考文献の範囲を決め、GROBID 0.9.1 の CRF（Apache-2.0）を TypeScript に移植した区切り・解析で 1 件ずつのブロック（著者・題・年・誌名・DOI 付き）に再構成する（日本語・失敗時は従来どおり）。GROBID 本体は英語の authors 0.85・references 0.95。→ [docs/EXTRACTION_FIELD_EVAL.md](./docs/EXTRACTION_FIELD_EVAL.md)
- 段落の抽出品質（JATS とページ画像の書き起こしを正解に、アプリと同じ抽出経路で監査）: 「段落の末尾が欠けている…原文を表示しています」の大半は抽出の失敗（図表・柱をまたぐ段落の分断、狭いガターの 2 段組の行の交互混入）。段落のつなぎ直しと段組・柱の判定を直し、警告の出る段落は実論文 113 本で 15.8% → 11.8%、評価用セットで 20.9% → 14.9%。さらに、結合や箇条書き分割の後に残っていた古い警告と、数式の前後の誤警告を最終テキストで判定し直し、実論文で 9.9%、評価用セットで 10.8%。数字や括弧の続きで始まる段落もつなぐようにして、実論文で 9.0%。評価コーパスを JATS 正解付きの 1,277 本に広げ、字下げによる段落区切り・行末ハイフン・表に吸い込まれた本文・セルごとの表・参考文献の誤判定・文末の誤判定を直して、調整に使っていない評価用 404 本で正しくまとまった段落 72.4% → 82.5%、警告ブロック 4,757 → 3,939。実論文で 7.7%。単語単位の 2 段組 PDF で段の境界がずれて行末の語が消える誤りと、文の切れ目で段組・ページをまたぐ段落の分断を直し、評価用で 85.9%（PDF に印字された段落だけなら 87.8%、指標の天井は約 98%）、警告ブロック 3,759。読み順を組む前に表/図の領域を切り出すようにして、評価用で 86.7%（印字分 88.7%）、本文外ブロックへの警告 1,704 → 1,499。表/図の領域が本文行を飲み込む誤り・表の文字を段組の証拠にする誤り・引用番号で始まる本文行の脚注誤判定を直し、図表の注記をまたいで段落をつなぐようにして、評価用で 87.7%（印字分 89.6%）、警告ブロック 3,280 → 3,116。表の見出しがあって本文の行がほぼ無いページの小さい字を表として扱い、本文外の警告を減らして警告ブロック 3,116 → 3,003（正しくまとまった段落は変わらず）。→ [docs/EXTRACTION_INTEGRITY_AUDIT.md](./docs/EXTRACTION_INTEGRITY_AUDIT.md)
- 段落正解（Europe PMC の JATS の段落、評価用 405 本、2026-11-22 main 6aeb68b）: intact 89.8%、警告ブロック 2,246（うち正しい段落への誤警告 357）。目標は intact 98% / 警告 500 / 誤警告 50。→ [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)
- 本文以外の要素（要素正解、Europe PMC dev 868 本 / ACL 20 本 / arXiv 20 本）: 所属・ライセンス・脚注が本文段落に混ざる割合 25.1% / 13.4% / 14.5% → 13.5% / 7.2% / 7.2%。脚注 2.8% / 44.0% / 70.0% → 23.9% / 68.1% / 83.3%。誌名/学会名を表示（88.6% / 90.0%、ACM 形式は未対応）。→ [docs/ELEMENT_GOLD.md](./docs/ELEMENT_GOLD.md)
- タイトル（要素正解、Europe PMC dev 868 本 / ACL 20 本 / arXiv 20 本）: 折り返したタイトルを最大の字の行から組み直し、78.2% / 80.0% / 55.0% → 79.5% / 100% / 70.0%。→ [docs/ELEMENT_GOLD.md](./docs/ELEMENT_GOLD.md)
- 付録・補足の図表番号（`Table A6:`、`Table S2.`、`Figure A3:`）をキャプションとして認識し、段の中のキャプションの近くで行を集めるときは同じ段の行だけを使う。要素正解 dev で ACL の表 69.3% → 79.2%、Europe PMC 106 本の表 89.6% → 90.7%（論文単位の悪化なし）。→ [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)
- LaTeX の分離したアクセント記号（`D´ıaz`、`N´u˜nez`、`Franc¸ois`）を行の段階で合成する。全大文字の著者名は `Edoardo Ballico` の形にそろえ、`AND` で区切り、`OF`・`ON` などを含む全大文字のタイトル行は著者に入れない。要素正解 dev で arXiv の著者 40.7% → 51.9%、Europe PMC 106 本の著者 73.1% → 73.7%（論文単位の悪化なし）。続けて、所属に直接くっついた名前（`PandeyDepartment`）、ACM Reference Format による著者の補完、段の境界で切れた著者行の再結合、上付きの所属番号の位置でのカンマ補完、AASTeX の `Name,1` 形式の著者行に対応し、arXiv の著者は 100%（54/54）。
- 要素正解の採点で、宣言系の注記（Author contributions、Competing interests など）は脚注でも見出し付きの末尾の節でも正解とする。Europe PMC dev の脚注 23.9% → 28.8%（採点の変更のみ）。→ [docs/extraction-next-steps.md](./docs/extraction-next-steps.md)
- 論文のキーワード（`Keywords` / `KEYWORDS` / `Index Terms` の後の語の並び）を `paper.json` の `keywords` に保存し、Reader の見出し（所属の下）にチップで表示する。本文からはその行を外す。Europe PMC dev で 148/290 本に付き、JATS のキーワードと 96% 一致。既存の論文は「PDFを再抽出」で付く。
- 責任著者の連絡先（`Correspondence: 名前, メール`）を脚注として Reader に残す。サイドバーのラベル・名前・メールは 1 つの注記にまとめる。Europe PMC 106 本の脚注 31.5% → 68.5%、ACL・arXiv は変化なし。
- ACL の著者行で、名前の直後の上付き所属番号の位置に区切りを補う（`Zhenhua Liu¹ Tong Zhu¹`）。ACL dev の著者 71.1% → 82.9%、他は変化なし。
- 太字のキャプション番号（`Figure 6.`）が、ページ幅のキャプションから左の段に取り残されないようにする。図 arXiv dev 63.6% → 68.2%、Europe PMC 106 本 86.3% → 87.2%。
- レイアウト領域化で分かれた表キャプションと隣接する native grid を、キャプションの block ID を保った 1 つの Reader 表へ再結合する。要素正解 dev で Europe PMC 106 本の表セル 10.8% → 52.8%、表 92.7% → 95.5%（他の採点指標は低下なし）。
- 要素正解の採点で、図・表のキャプションは空白・記号・アクセントの違いを無視しても照合する（LaTeX 由来の `Δ 0`・`μ m` と PDF の `Δ0`・`μm`）。dev の図 ACL 89.1% → 92.2%、arXiv 68.2% → 83.3%、Europe PMC 106 本 87.2% → 88.6%（採点の変更のみ）。
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
- 2026-11-22 フロントエンド保守リファクタリング（#257 / #258 / 本 PR）: 対象: 未参照の5ファイルと呼び出し元のない関数・型5つを削除、自ファイル内でしか使わない symbol の export を外す、ライブラリ4画面の一覧・空の状態・開く処理を `LibraryPaperList` / `LibraryEmptyState` / `useOpenPaper` に集約、Figure / Table のキャプションを `MediaCaption` に集約、設定画面2か所の手書き theme 反映を削除（`App.tsx` の effect に一本化）。挙動維持の根拠: Figure / Table の SSR markup を変更前のコードで snapshot 化し、変更後も一致。library / favorites のスクショは変更前とバイト単位で同じ、theme 切り替えで `data-theme` が dark→light に変わることをブラウザで確認。検証: tsc、oxlint（新しい警告なし）、Vitest（pdfExtraction pipeline / authorProjection の 5〜7 件失敗は main でも同様に再現する既存の問題）、verify:browser。残課題: CSS の重複は #264 で対応済み。
- 2026-11-22 `PaperContent` 分割（#262 / #264 / 本 PR）: 対象: `PaperBlockView`（ブロック種別ごとの描画と参照文献の描画）を `PaperBlockView.tsx` へ、表示ブロックの判定・セクション別振り分け・注釈の振り分け・参照インデックスの安定化を `paperContentData.ts` へ移動（924 → 690 行）。あわせて隠しファイル input を `PdfFileInput` に統一し、メモ / 用語集パネルの共通 CSS を `SidePanel.module.css` へ移動。挙動維持の根拠: 全種類のブロックを含む PaperContent の SSR markup を変更前のコードで snapshot 化し、変更後も一致。パネルとダイアログの要素スクショは変更前とバイト単位で同じ。検証: tsc、oxlint、Vitest（既知の pipeline 5 件以外は通過）、verify:browser。残課題: 表示中セクションの追跡（IntersectionObserver）と遅延マウントは状態が絡むため未分割。
- 2026-11-23 デザイントークン保守リファクタリング: 対象: z-index を役割別 `--z-*` に置換（52 箇所）、繰り返し出る色の直書きをトークンへ（106 箇所、残りは `color-literal-ok:` で理由付き）、値が一致する font-size（7）・transition（1）をトークンへ、設定画面の重複ルールを `composes` に。`src/styles/tokenGuard.test.ts` が色と z-index の直書きを落とす。挙動維持の根拠: 置換前後の値をライト／ダークで機械照合し、Library / Reader / 設定 4 セクションのライト・ダーク計 14 枚のスクリーンショットが main とバイト一致。検証: styles Vitest、tsc、build。残課題: 余白 px 直書き（約 180）と `EvaluationStudio` は対象外。
- 2026-11-24 CSS 保守リファクタリング（文字サイズ・未使用ルール）: 対象: 既存トークンと同値の font-size 直書き 147 箇所を `var(--font-size-*)` に置換し、繰り返す値に micro / tiny / lead / subtitle / display / dialog-title を追加、`src/styles/fontSizeGuard.test.ts` で新規の直書きを禁止。どの TS/TSX からも参照されないクラスのルール（旧バナー・削除確認・undo bar・`motion.route` など 35 selector）を削除。挙動維持の根拠: Library / Inbox / Trash / Settings / Reader の全要素（3,560）の computed style と矩形が変更前と一致。検証: full Vitest、tsc、oxlint、Playwright スクリーンショット比較。残課題: `AppSidebar.module.css`（約 940 行）の分割は、サイドバー開閉状態とツリー行をまたぐ selector が 6 つあり CSS Modules のファイル単位ハッシュで壊れるため見送り。余白の px 直書きは値の段階が揃っていないため未着手。
- 2026-11-24 余白トークン保守リファクタリング（段階 1）: 対象: gap / padding / margin で既存段階と同値の直書き 151 箇所を `var(--spacing-*)` に置換し、頻出の 2 / 6 / 12px を `--spacing-2xs` / `--spacing-xs-plus` / `--spacing-sm-plus` として追加、`src/styles/spacingGuard.test.ts` で新規の直書きを禁止。calc() 内の寸法計算と top / left などの位置指定は対象外。意図した微調整 23 箇所は `spacing-literal-ok: 理由`、段階に寄せる候補 31 箇所は `spacing-snap-candidate` で印付け。挙動維持の根拠: Library / Inbox / Favorites / Trash / Settings / Reader をライト・ダークで全要素（7,425）の computed style と矩形が変更前と一致。検証: full Vitest、tsc、oxlint。残課題: snap-candidate（5 / 7 / 9 / 10 / 14 / 18 / 20 / 30px）を見た目の比較つきで段階へ寄せるか判断する（段階 2）。
- 2026-11-24 余白の段階寄せ（段階 2、見た目の変更あり）: 対象: 段階 1 で印を付けた 31 箇所。10px は `--spacing-sm-mid` として段階に追加（変化なし）。論文カードとフォルダのメニュー項目を 6 / 10px、外側を 6px にそろえ、ほかは 5→4・7→6・9→8・14→12・18 / 20→16・30→32px に寄せた。`spacing-snap-candidate` 印は廃止。検証: メニュー・ツールチップ・サイドバー・論文情報パネル・イントロ・PLaMo 画面の変更前後をスクリーンショットで比較しユーザー確認済み。メモの吹き出しはブラウザで開けず数値のみ確認。
