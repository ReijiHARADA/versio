# Apple Translation performance evaluation v1

Date: 2026-10-09

## Method

Seven clean ordinary-body blocks from the existing 114-paper audit were selected across seven disciplines. The same English source was submitted sequentially to a native macOS `TranslationSession` (`en`→`ja`) after the English/Japanese language packs were installed. MADLAD values below are the previously recorded translations for the exact same source blocks; this is a controlled smoke benchmark, not a claim about the whole 114-paper corpus.

| # | discipline | Apple latency (s) | Apple output | Existing MADLAD output | numeric tokens preserved |
|---:|---|---:|---|---|---|
| 1 | hci | 0.688 | 図2 Otto Künzli 1980「Gold Makes Blind」アームバンド。 ゴム、金。 画像提供：個人コレクター。 | Fig.2 オットー・キュンツリー 1980年 ゴールド・メイクス・ブラインド ゴム・ゴールド。個人コレクターの写真です。 | yes |
| 2 | ergonomics | 0.117 | これらの基準を適用すると、ウェアラブルオブジェクトを配置するための最も目立たない場所になります。 これらは以下に示されています。 | これらの基準を適用することにより, 着用可能な物体の配置に対して最も注意を引かない位置を得ることができる。これらは以下に示す。 | yes |
| 3 | linguistics | 0.136 | 頭の表面の動きに加えて、発声スピーチには、口の中のさまざまなアーティキュレーター（口、舌など）の動きも含まれます。 SSRの舌と口の動きをとらえるために、研究者は | 発声音声は頭部表面の動きに加えて, 口内の異なる調音器(例えば口, 舌)の動きを含む。SSRのための舌と口の動きを捕捉するために, 研究者は, 舌と口を同時に動かすことを可能にするために舌と口に100個の小さな円形の円板を置いた。 | yes |
| 4 | education | 0.121 | これは、多数の参加者をサポートするように設計されたWebベースのクラスを指します。 コースを受講したい人なら誰でも、出席に制限なく、学習コンテンツをオンラインで提供できます。 それらはLMSと同じ情報を保存します。 | これは, 多数の参加者をサポートするために設計されたウェブベースのクラスを指す。これは, 受講者数に制限を設けず, 受講したい人にオンラインで学習内容を提供できる。これらは,LMSと同じ情報を保持する。 | yes |
| 5 | medicine | 0.050 | [8]、[9]、[10]、[11]など、さまざまな医療画像アプリケーションからいくつかの重要な技術が生まれます。 | 医療画像応用における主要な技術として,[8],[9],[10], 及び[11]がある。 | yes |
| 6 | marketing | 0.068 | これらの実験について報告する前に、私たちが区別し、推定することを目指す因果関係を説明し、オンライン広告と社会的影響に関するいくつかの追加の関連研究を確認します。 | これらの実験を報告する前に, 我々が区別し推定することを目的とする因果関係を述べ, オンライン広告と社会的影響に関するいくつかの関連研究をレビューした。 | yes |
| 7 | cognitive-psychology | 0.057 | 3.3.1 関連する調査。 関連する調査論文および関連については、[14、34、93]を参照してください。 | 3.3.1 関連調査(調査論文, 関連項目は[14, 34, 93]を参照)。 | yes |

## Results

- Apple completed Japanese output for **7/7 (100%)** blocks; no API errors or Apple-side fallback occurred.
- Total sequential translation time was **1.241 s**, mean **0.177 s/block**, median **0.117 s/block**. This excludes language-pack download and app startup.
- All extracted numeric tokens in this sample were present in the Apple output (**100% token presence**, a syntactic check only).
- The outputs were generally fluent and concise. The figure-caption sample translated `Gold Makes Blind` semantically as a title, while the medical reference sample retained bracketed citations.
- This sample does not establish semantic correctness: Apple output still needs blind human review for terminology, scope, negation, and citation placement. It also does not compare Apple against MADLAD under identical runtime latency because MADLAD is GPU/model-backed and its prior audit timings are not directly comparable.

## Decision

Apple Translation is technically viable as a macOS-native selective fallback for short/medium clean blocks. The evidence is insufficient to replace MADLAD for full-paper translation: the test covers 7 blocks, 7 disciplines, no scanned PDFs, tables, extraction failures, or long multi-page units. The next evaluation should blind-review at least 50 matched blocks and measure semantic error, terminology error, omission/addition, and reader-visible fallback alongside latency and numeric/citation preservation.
