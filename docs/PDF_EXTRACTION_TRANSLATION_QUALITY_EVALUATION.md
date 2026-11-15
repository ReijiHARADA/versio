# PDF抽出・翻訳品質の定量評価

## 結論

このレポートは**EPUB変換・容量・同期を一切評価対象に含めない**。実在PDFの既存手動構造ラベルと、現行のPDF→抽出→翻訳実行結果だけを集計する。

現時点で発表資料に載せられる抽出品質の数値は、開発用実PDFでの限定的な構造指標だけである。本文CER/WER、欠落率、重複率、独立PDFでの読み順・段落・表TEDS・数式CDMは、完全な**人手goldが無いためN/A**である。テスト成功率・抽出成功率・ラベルなし健全性検査は精度に代用していない。

翻訳についても、現行モデルの意味精度、数値/引用保持率、品質ゲートの誤受理率を人手精度としては報告できない。既存の手動翻訳レビューは明示的に agent-manual-comparison であり、人間の正解ラベルではないためである。自動品質ゲートを通った出力に重大な意味改変があることは現行実行で確認しており、受理率を精度と扱わない。

## 指標と採否

PDF抽出の指標語彙は [OmniDocBench](https://github.com/opendatalab/OmniDocBench) と既存の [PDF extraction benchmark](PDF_EXTRACTION_BENCHMARK.md) に合わせた。CERは人手正解文字列を分母とする文字Levenshtein距離、role-aware Block F1はIoU対応と役割一致、読み順は正解block列の編集距離、表はTEDS、数式はNED/CDMである。Paragraph-boundary F1とcaption-relation F1はVersio固有の構造保持指標である。これらは完全な同一ページのhuman goldがあるときだけ算出する。

WERは英語の分かち書き規則に依存し、既存evaluatorに実装されていないため、今回CERの代替数値を作らずN/Aとする。翻訳は、二重blind人手判定で「意味」「情報欠落」「追加/幻覚」「数値・単位・統計」「否定・条件・比較・因果」「専門用語・引用」を別々に判定し、severity 2以上を重大エラーと定義する。品質ゲートの誤受理率は、人手判定済みの自動受理件数を分母に重大エラー件数を置くが、その分母が未整備なのでN/Aである。

BLEU・chrF・COMETは独立の日本語参照訳を必要とする。モデル出力を参照訳にせず、有料APIも使わない方針のため、参照訳が完成するまでは未適用である。

## 1. PDF抽出: 実測済みの構造指標

実行: 2026-11-05T01:58:45.125Z、7本の実在開発PDF、隔離worker、各240秒上限。すべての数値は論文ごとのmacro meanで、括弧内は採点可能な論文数である。

| 指標 | 実測値 | 分母 | 解釈 |
| --- | ---: | ---: | --- |
| Heading recall | 86.46% | 3 | Existing manually checked development labels; macro-document mean; development only. |
| Table-caption recall | 75.00% | 4 | Existing manually checked development labels; macro-document mean; development only. |
| Table-region recall | 66.67% | 3 | Existing manually checked development labels; macro-document mean; development only. |
| Figure-caption recall | 100.00% | 2 | Existing manually checked development labels; macro-document mean; development only. |
| Reading-order pair score | 100.00% | 1 | One development paper only; not independent generalization. |
| Text CER / WER | N/A | 0 | No complete human text gold; N/A. |
| Text omission / duplication | N/A | 0 | No complete human text gold; N/A. |
| Paragraph-boundary F1 | N/A | 0 | No complete human boundary gold; N/A. |
| Caption relation F1 | N/A | 0 | No complete independent human relation gold; N/A. |
| Table TEDS / formula NED/CDM | N/A | 0 | No complete independent human table/formula gold; N/A. |

読解上の注意: Heading recall 86.46%は3論文だけ、reading-order 100%は1論文だけであり、全論文の抽出正確率には一般化できない。table-caption 75.00%・table-region 66.67%は失敗を含む実測で、表中心の文書で低下する兆候であるが、分母が小さい。

独立性: publisher/template familyを開発コーパスと分離した4論文は、二重抽出のlabel-free health gateを4/4通過した。しかしこれはdeterminism・座標・provenanceの健全性確認にすぎず、CERやBlock F1ではない。独立精度はhuman gold完了までN/Aとする。

## 2. 翻訳: 現行モデルの実測運用結果（精度ではない）

実行: 2026-11-05T02:05:58.250Z、4論文（HCI、医学レビュー、数理マーケティング、計算言語学）×3抽出本文、MADLAD google/madlad400-3b-mt / mps。標本は層化した診断用であり、母集団率の推定には使わない。

| 自動経路の結果 | 件数 / 分母 | 値 | 95% Wilson CI（記述的） |
| --- | ---: | ---: | ---: |
| モデル応答あり | 8/12 | 66.7% | 39.1–86.2% |
| 完全翻訳として自動受理 | 6/12 | 50.0% | 25.4–74.6% |
| reader-visible原文fallback | 6/12 | 50.0% | 25.4–74.6% |
| 抽出/入力ポリシー起因のpre-model fallback | 3/12 | 25.0% | 8.9–53.2% |
| モデル/品質ゲート後のpost-model fallback | 3/12 | 25.0% | 8.9–53.2% |
| ordinary-bodyのfallback | 3/8 | 37.5% | 13.7–69.4% |

これは訳文の正しさではない。自動受理6件のうち interactive-jewellery:b-9481ee91 は、原文のwearables/jewelleryに関する主張を、無関係なwebsite/web application構築へ置換しているにもかかわらず受理された。従って、**品質ゲート受理率50.0%は翻訳精度50.0%を意味しない**。

COMET、chrF、BLEUは、日本語の独立参照訳が無いため未適用である。モデル出力を参照訳にしたり、agent reviewをhuman goldと呼んだりして数値を作ることはしない。

## 3. 抽出由来と翻訳由来の切り分け

同じ12抽出本文で、抽出起因と判定できるものは 3件: 医学レビューの3件が、改行ハイフン・機能語欠落・継続断片の検出によりモデル投入前に原文fallbackとなった。post-model 3件は、degenerate出力またはcitation placeholder/未翻訳英文検出によるfallbackである。

これは「原因別fallback件数」の実測であり、原因別の意味誤り率ではない。A/B比較に必要なB（レンダリングPDFから人手で転記・検証した英語）と、その同一モデル出力はまだ無い。以下のreview queueにAを固定し、Bを独立転記後に同じモデルで翻訳して、同一の人手判定票で比較する。

## 4. 人手goldを完成させるための実行済み準備

test-data/extraction-evaluation/human-review-queue-current-v6.json に、今回実行した12行のA条件、PDFページ、B条件の空欄、2名のバイリンガル査読者と調停の欄を出力した。人が次を記録すれば、初めて以下の実測が可能になる。

1. PDFレンダリングに対する完全な英語転記（B）
2. A/B双方の日本語出力に対する、意味・欠落・追加/幻覚・数値/単位/統計・否定/条件/比較/因果・専門用語・引用のblind判定
3. 独立日本語参照訳（BLEU/chrF/COMETを使う場合のみ）

人手入力前に出せる発表用数値は、上記の**限定された構造recall**だけである。本文を何%正しく抽出・翻訳できるかという総合値は、現状では答えを捏造しないためN/Aとする。

## 再現手順

~~~sh
npm run bench:pdf-extraction:development -- --timeout-ms 240000 --output test-data/extraction-evaluation/current-development-regression.json
npm run audit:pdf-extraction:unlabeled -- --cohort test-fixtures/extraction-benchmark/validation-cohort-v1.json --all --timeout-ms 240000 --output test-data/extraction-evaluation/current-validation-health.json
npm run report:pdf-translation-quality
~~~

翻訳のA条件は既存の実行結果 translation-audit-current-v6-stratified-v1.json を入力として再集計する。B条件とreference Japaneseは、人間の独立転記・翻訳を追加してから同一MADLAD versionで再実行する。
