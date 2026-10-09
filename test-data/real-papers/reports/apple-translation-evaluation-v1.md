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

## Matched 50-block benchmark

A second run selected 50 blocks from the existing 114-paper audit corpus, spanning 46 papers. Selection required `ordinary-body-prose`, no prior source fallback, and source length 40–500 characters. One selected row was actually an author-metadata line despite its audit category; it remained unchanged by Apple. Excluding that metadata contamination leaves 49 ordinary prose blocks.

| metric | result |
|---|---:|
| Apple request completion | 50/50 (100%) |
| Japanese-script output among selected rows | 49/50 (98%); 49/49 after metadata exclusion |
| numeric token presence | 84/84 (100%) |
| mean latency | 0.120 s/block |
| median latency | 0.110 s/block |
| total sequential time | 6.004 s |
| API errors | 0 |

The run was executed in one native process with installed English/Japanese language packs. It measured translation calls only; model/language-pack download, session startup, extraction, and UI rendering were excluded. Numeric presence is a preservation check, not a semantic accuracy score. The unchanged author line demonstrates why extraction-role validation must precede translation evaluation.

### Quality interpretation

Apple completed every clean prose request in this sample and was substantially faster than the local MADLAD calls measured in the earlier three-sentence probe. That comparison is operational rather than a normalized model benchmark: MADLAD runs through a local 3B model on MPS and Apple runs through the on-device system translation service. The 50-block run still needs human semantic review for terminology, negation, scope, omissions, and additions before a product decision. It supports testing Apple as a selective fallback/cascade for clean blocks, not unconditional replacement of MADLAD.

## Large-scale 100-block evaluation

A larger run selected 100 blocks from the 114-paper audit corpus, spanning 49 papers and nine discipline labels. The selection used the existing audit's `ordinary-body-prose` category, excluded prior source fallbacks, and limited source length to 30–700 characters. One row was still misclassified author metadata (`osworld-multimodal-agents`); it was retained as an extraction-contamination signal and excluded from clean translation quality rates.

| metric | all selected | clean prose (metadata excluded) |
|---|---:|---:|
| blocks | 100 | 99 |
| Japanese-script output | 99 (99%) | 99 (100%) |
| API errors | 0 | 0 |
| numeric tokens preserved | 128/128 (100%) | 128/128 (100%) |
| mean latency | 0.147 s | 0.147 s |
| median latency | 0.133 s | 0.133 s |
| total sequential time | 14.713 s | — |

Discipline counts (clean output / total): cognitive psychology 14/14, design research 1/1, education 2/2, ergonomics 13/13, HCI 36/37 (the one metadata line), linguistics 12/12, machine learning 3/3, marketing 17/17, medicine 1/1.

### Migration decision

The evidence supports **selective integration**, not a full replacement yet:

1. Apple is operationally reliable for clean short/medium blocks: 99/99 clean blocks produced Japanese output, with no API errors and complete numeric-token presence in this corpus.
2. Apple is much faster in this local probe than the MPS MADLAD calls, but the runtimes are not a normalized model-speed comparison because they use different hardware/services.
3. The one non-Japanese result was an extraction-role error, not an Apple translation failure. This confirms that extraction validation remains a prerequisite for either backend.
4. The benchmark has not yet measured human semantic error, domain terminology, negation/scope, table/figure handling, scanned PDFs, or long multi-page paragraphs. Those gaps prevent a defensible full migration decision.

Recommended product path: add Apple as a macOS-only selective cascade for clean blocks and MADLAD quality-gate fallbacks, while preserving MADLAD for long/complex blocks and non-macOS. Before making it the default backend, run a blind human review of at least 100 matched Apple/MADLAD outputs covering the same source units and record severity-weighted semantic error, omission/addition, terminology, and citation errors.

## Blind matched manual review (20 pairs)

To estimate semantic quality beyond automatic gates, 20 matched source blocks were sampled across the evaluated disciplines. The two Japanese outputs were shown as anonymized A/B alternatives with the engine identity hidden during the first pass. Review labels covered meaning shift, terminology, omission/addition, and wording; severity 0–4 follows the audit scale. This was a single-reviewer exploratory assessment, so it is evidence, not an inter-rater gold standard.

- Preferred output: **Apple 17/20**, MADLAD 3/20.
- Preferred-output labels: minor wording 10, semantic shift 5, terminology error 2, omission 2, addition 1 (a case can carry a severity label even when the preferred output was the safer fallback).
- Severity distribution for the reviewed preferred outputs: severity 0 = 9, severity 1 = 2, severity 2 = 3, severity 3 = 6, severity 4 = 0.
- Examples favoring Apple: complete treatment of participant counts, methods, equations, citations, and long ergonomics/marketing prose.
- Examples favoring MADLAD: one design-research sentence and one medical citation fragment where MADLAD's wording was slightly closer to the source.
- High-severity cases exposed source-unit problems as well as translation behavior: an incomplete linguistics block was completed with unsupported content by one engine, and an extraction fragment containing `Kong, et al.` was mistranslated by both. These must be handled by source validation, not model selection alone.

The anonymized review confirms a strong Apple quality signal on clean blocks, but it does not justify unconditional migration: 6/20 preferred outputs still had severity ≥2, and the sample is small and single-reviewed. The defensible migration decision remains Apple as a macOS selective cascade, followed by a larger multi-reviewer study before replacing MADLAD as the default.

## Production routing gate / Go-No-Go

The routing policy is implemented and tested, but a production reduction claim is **not yet proven**. The current machine returns `TranslationError.Cause.notInstalled` for the Apple language pack, so the packaged app exercised the MADLAD fallback path rather than Apple acceptance. On the existing audit data, the policy identifies 102 of 239 unique non-fallback ordinary-body rows as Apple-eligible; this is a static eligibility count, not an accepted-translation count.

**Decision: conditional No-Go for default replacement; Go for guarded selective-cascade code.** Keep the routing behind the macOS/language-pack availability check, preserve MADLAD fallback, and do not count unavailable Apple attempts as reduced reader-visible fallback. Before enabling Apple as the default first choice for users, rerun the held-out cohort with the language pack installed and record attempted/accepted/rejected/fallback counts plus severity-reviewed accepted outputs. The existing 20-pair review includes severity ≥2 cases, so the unsafe-false-accept requirement is not yet demonstrated at zero.

## Native helper held-out routing run

The Apple language pack became available during this run, so the packaged native helper was exercised directly against the 102 statically eligible ordinary-body rows from the existing audit corpus.

- Apple eligible / attempted: **102 / 102**
- Native Apple completed: **102 / 102**
- Japanese-script output: **102 / 102**
- Numeric tokens preserved: **138 / 138**
- Mean native-helper latency: **364 ms/block** (process-launch overhead included)
- Existing quality gate accepted: **96 / 102**
- Existing quality gate rejected: **6 / 102**
- Apple rejection reason: quality gate (all six); these must be sent to MADLAD rescue, so they are not automatically reader-visible fallbacks.

The machine-level Apple capability blocker is therefore cleared. The six quality rejections demonstrate that Apple is subject to the same safety policy and that routing must not treat native completion as acceptance. A separate MADLAD-rescue replay is still required to measure the final reader-visible fallback rate for this cohort; the summary is stored in `apple-routing-quality-summary.json`.
