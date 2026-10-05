# Paper Reader 現在状態

最終更新: 2026-10-05

## 現在の実装状態

- 翻訳モデル: MADLAD-400 3B、Transformers 4.57.6 runtime。
- 翻訳品質ガード、科学的 invariant、引用保護、partial fallback、選択的 cascade の監査実装が存在する。
- CAT-Translate は監査・比較用で、本番ルーティングには未統合。
- PDF抽出は Native text / geometry / canonical resolver / projection の既存パイプラインを使用。
- macOS `.app` の再ビルドは、コード変更を配布版へ反映する必要がある段階で実施する。

## 主要指標

### 2026-10-05: active translation audit checkpoint

- `translation-audit-auth-v1` を `--resume --cached-only --limit 12` で継続中。
- 現在 **54/114 papers、561 sampled units** をチェックポイント保存済み（最新: `hci-social-touch-in-human-computer-interaction`）。
- この実行は翻訳サーバーと同一環境で継続中。完了後に現行レポート単独で fallback / extraction / quality-gate / semantic-review を再集計する。
- `translation-audit.json` および別コホートの `CURRENT_STATE` 記録と混ぜず、auth-v1 の完了値を正式な比較対象とする。
- 中間集計（47本/493 units）では全体 fallback 293件、通常本文187件中47件（25.1%）。これは未完了の暫定値であり、目標達成とは扱わない。

### 抽出コーパス

- OAカタログ: **114件**
- PDF取得済み: **113本**
- source integrity 平均: **0.99987**（最小 0.99363）
- canonical provenance: **1.000**
- heading recall 平均: **0.99324**（最小 0.97297）
- table-region recall: **0.950**
- table-caption relation precision 平均: **0.99468**（最小 0.75）
- title exactness: **0.867**。OpenAlex由来タイトルをPDFの正解として未検証のため、品質回帰の指標としては保留。

### 翻訳評価

- MADLAD既存held-out: 30 rows。受理 20/30。
- CAT比較: 30 rows。自動受理 27/30、手動レビューで severity 2 以上 0件。ただし本番未統合。
- Qwen2.5 14B cascade probe: 同一held-out 5 rowsで受理1/5。4件は反復語、未翻訳・foreign-script、科学的invariant欠落などで拒否。本番統合の根拠には不十分。
- 選択的 cascade の監査投影: reader-visible fallback 1/30（3.3%）。同一held-out上の監査値であり、本番保証ではない。
- 新規OAサンプル: 16 papers / 16 blocks、10受理・6 fallback。1論文1ブロックの診断値で、製品fallback率ではない。
- 114本を選択した fresh translation audit を完了（PDF取得済み113本、評価954 units。`precious-materials` はPDF未取得）。全体fallback 624/954 (65.4%)。ordinary-body は 111/360 (30.8%)で、目標5%を未達。内訳は pre-model 4、post-model 107（server/model 由来55、quality gate 32、extraction/structure 17、その他7）。これは現行の実測ベースラインであり、次の改善対象をモデル/品質ゲートと抽出境界に分離できた。
- 追加fresh sample: 4 papers / 8 blocks、3受理・5 fallback。4件は抽出構造由来、1件は長い本文のpost-model品質拒否。
- ordinary-body fallback 111件のsource/fallback段階/quality理由を [`translation-failure-triage-v1.json`](test-data/real-papers/reports/translation-failure-triage-v1.json) に固定。server/protection 55、quality-gate 43、extraction/structure 5、その他8（分類はtriage用で重複理由を含む）。

## 直近の変更

### v1552 — Reader 中のサイドバー青ハイライトを論文に付ける（2026-10-05）

- 論文を開いているとき、格納フォルダではなくサイドバー上の当該論文行を現在位置としてハイライトするよう修正。

### v1551 — 自動折りたたみ設定プレビューを実UI寄りに更新（2026-10-05）

- 「自動で折りたたむ」の before/after GIF を現行サイドバー＋リーダー風メイン面で再キャプチャ。
- フィクスチャを `修士研究 / Interactive jewelry` 系に更新し、スケルトン棒のプレビューをやめた。

### v1550 — 折りたたみ時は最上位だけ表示の設定を削除（2026-10-05）

- 設定「折りたたみ時は最上位だけ表示」と関連 GIF プレビューを削除。
- アイコンレール時は最上位フォルダのみ、展開時に入れ子を出す挙動は固定のまま。

### v1549 — ワークスペースパスの1行省略（2026-10-05）

- 左上の場所パス（例: `修士研究 / Interactive jewelry / …`）が折り返して2行にならないよう、1行固定＋`…` 省略に変更。祖先セグメントを先に縮める。

### v1548 — サイドバー見出しと新規フォルダ導線（2026-10-05）

- 「ワークスペース」「ライブラリ」のセクション見出しを一段階大きくした。
- 検索直下にあった「新規フォルダ」ボタンを削除し、「ワークスペース」見出し右の + から同じ作成フローを開くようにした。

### v1545 — quality policy facade refactor（2026-10-05）

- `quality.ts` からタイトル、出版メタデータ、参考文献、名称付き見出しの判定を `quality/documentPolicy.ts` へ分離。旧exportはfacadeで維持。
- 品質テスト 250/250、全Vitest 624/624、typecheck、lint、diff checkを通過。品質閾値・fallback条件・モデル設定は変更していない。


### v1544 — fresh benchmark再開（2026-10-05、完了）

- 114本コーパスのstable checkpointを `--resume` で再開。先行実行で63本分を保存後、長文要求が長時間返らない状態を検出したため、翻訳サーバーは維持し、クライアントのみ終了。
- 再開時は1論文あたり4 unitsに縮小し、checkpointを追記してレポートを生成済み。productionの翻訳ロジックは変更していない。
- レポート生成後にordinary-body fallbackと原因分類を再集計済み。


### v1543 — 保守性リファクタリング第一段階（2026-10-05）

- `quality.ts` の退化出力検出を `src/services/translation/quality/degeneration.ts` に分離。
- `quality.ts` は既存のexport名・import pathをfacadeとして維持。品質閾値、fallback条件、モデル設定は変更していない。
- 対象テスト 258/258、全体テスト 624/624、typecheck、`git diff --check` を通過。
- 分割計画と残りの候補は [`docs/MAINTENANCE_REFACTOR_PLAN.md`](docs/MAINTENANCE_REFACTOR_PLAN.md) に記録。


- リスト導入文（コロン終端）を、直後の箇条書き・番号付き項目とは別の安全な翻訳単位として扱うよう改善。
- 実PDFで従来pre-model fallbackだった導入文がMADLADへ送られ、既存ゲートで受理されることを確認。
- 全Vitest **624/624 across 69 files**、抽出pipeline **26/26**、quality tests **250/250**、typecheck pass。
- 詳細な実験ログは [`docs/history/CURRENT_STATE-2026-10-05.md`](history/CURRENT_STATE-2026-10-05.md) を参照。

## 未解決課題

1. 100本規模コーパスの section-stratified translation sampling と manual semantic review が不足。
2. ページ境界・未閉鎖 delimiter・参考文献混入による source reconstruction failure。
3. 長い完全本文の translation-unit / model quality failure。
4. borderless table と flattened numeric rows の汎用抽出。
5. `quality.ts` の責務集中と、品質判定・翻訳ポリシーの依存関係整理。
6. CAT / alternate model の本番統合可否は未決定。

## 2026-10-05: quality policy refactor checkpoint

- `quality.ts` の caption/title の純粋なsource-shape policyを `src/services/translation/quality/sourceIntegrity.ts` へ分離した。旧facadeのexport名と判定順は維持している。
- 品質テスト **257/257**、typecheck、`git diff --check` を通過。品質閾値・fallback条件・モデル設定は変更していない。
- 次は paragraph structure policy の依存（`unsafeParagraphStructureReason` と `shouldTranslateParagraph`）を挙動固定テスト付きで分離するか判断する。翻訳品質の現状目標は未達であり、今回のrefactorを品質改善の実測結果とは扱わない。

## 2026-10-05: packaged-server replay checkpoint

- `.app` 同梱translation serverは `MADLAD_SERVER_TOKEN` を要求するため、診断用 `scripts/replay-translation-fallbacks.mjs` が401になっていた。スクリプトが環境変数を `X-Paper-Reader-Token` として送るよう修正し、トークン自体は保存・出力しない。
- 同一`.app`サーバーで3件を再実行。長いJogwheel本文は約182秒後に `whole_item_fallback`、Silent Speech本文は約101秒後に protected-token restore failureを伴う `whole_item_fallback`、参考文献行はサーバー終了により未完了。これは品質改善の証拠ではなく、長文decodeと保護復元の再現診断である。
- 実行中に`.app`サーバーが終了し、後続の直接再生は接続失敗になった。レポートは `test-data/real-papers/reports/madlad-fallback-replay-v3.json` に保存済み。production routingやgateは変更していない。
- protected-token restore failureのdebugログに、missing spanを `author_year_citation` / `numeric_citation` / `measurement` / `structural_reference` / `identifier` / `other` へ分類する診断情報を追加。判定・retry可否・出力は変更しない。Python品質テスト **153 passed + 3 subtests**、py_compile、差分チェックを通過。
- 翻訳サーバー全体のPython回帰 **247 passed + 11 subtests** を確認。診断分類追加によるsegmenter、micro-batch、citation保護の回帰はない。
- `.app`の稼働サーバー `/status` は `model_version=...semantic-v73...` を返し、現在ソースのv83系より古い同梱物であることを確認。`npm run tauri:build` は clean Python bundle staging まで成功したが、残っている未整理TypeScript/UI差分に起因する build-only typecheck（`LayoutRole`/`process`、Ollama enum、sidebar型など）で停止し、`.app`は更新されていない。`importServiceV2.ts` の未定義 `llmProvider` は修正済み。品質変更の失敗とは分離して記録する。
- その後、build-only型エラーを修正し、`npx tsc -b` を通過。`npm run tauri:build` が成功し、`.app`とDMGを生成した。`.app`更新日時は **2026-10-05 10:15:39**。同梱 `segmenter.py` は `semantic-v83` で、開発ツリーとbyte一致を確認。現在起動中の旧プロセスは再起動するまで旧bundleのままなので、実機反映には旧アプリとserverを終了して新しい`.app`を起動する必要がある。

## 次の作業

- `docs/MAINTENANCE_REFACTOR_PLAN.md` の順に、挙動固定テストを維持しながら品質モジュールを段階分割する。
- 抽出変更は113本ベンチマークと既存回帰を毎回実行する。
- 翻訳変更はfresh cohort・manual review・semantic false acceptを確認してから採用する。

### v1546 — plural possessive segmentation fix (2026-10-05)

- `segmenter.py` が `linguistics' cognition` の末尾アポストロフィを開き引用符と誤認し、段落内の文境界を隠していた。所有格アポストロフィを引用状態に入れない一般修正を適用し、`SEGMENTER_VERSION` を `semantic-v83` に更新。
- セグメンター回帰 **61/61**。長文診断の単一unitは2件から1件へ減少し、該当本文は4つの文単位へ分割。残る1件は表由来のflattened numeric rowで抽出課題。
- 続けて、resolverが `vector-figure-label-cluster` 等を `other` としたノードを翻訳projectionから除外。医療画像PDFのflattened `1×1 Conv / Rate / Channel` 行はPaperBlockにならず、図内ラベルとして扱われる。抽出pipeline関連テスト **28/28**。
- `speechin` のFigure参照fallbackをPDF外で再現。完全文・第2文単独の両方でMADLADが `The necklace case` を落とすため、原因はplaceholderやPDF結合ではなくdecode側。入力の受動表現を自然な能動表現へ正規化すると改善したが、一般化検証前のproduction適用は保留。
- HCI/心理/マーケティング/人間工学/言語学の受動構文5文でraw/正規化ABを実測。明確な改善はHCI例のみで、他は同等または視点・用語が変化したため、全体rewriteは採用しない。結果は `test-data/real-papers/reports/passive-construction-ab-v1.json`。
- 医療論文の簡体字混入fallbackについて、既存の汚染検出をserver decode rescueにも適用。beam再試行後、`学习` を含んだ出力が通常の `学習` を含む日本語へ変わり、fallbackなしで受理可能になった。held-out全体での改善率は未測定。証拠: `server-simplified-cjk-rescue-v1.json`。
- 同一医療論文を新serverで再監査。ordinary-bodyは **2/2 fallback → 1/2 fallback**、全体は6/8→6/8以外の構造fallbackを含むため、改善をordinary-bodyの1件に限定して記録。残るordinary-bodyはmixed-script decoder corruptionではなく、他の品質理由を別途確認する。
- 残った `CycleGAN` 例は、`サイクルGAN` という正しい技術語表記を混在スクリプト破損と誤判定していた。source identifierのuppercase suffix（`CycleGAN`→`GAN`）を許容する一般条件を追加。quality tests **251/251**、typecheck pass。
- 同一医療論文を品質ゲート修正後に再監査し、ordinary-body fallback **1/2 → 0/2** を確認。全体fallbackは構造fallbackを含むため62.5%だが、今回の改善対象はordinary-body 2件。report: `post-cyclegan-gate-medical-v1`。

### v1547 — fresh quality cohort (2026-10-05)

- `post-quality-12-v1` は指定12件のうち、PDFがローカルに存在する11件（44 units）を処理。`precious-materials` はPDF未取得のため未評価で、レポートの `complete` は false のまま保存されている。
- 抽出構造を除外した evaluable 33 units では fallback **10/33 (30.3%)**、ordinary-body は **1/18 (5.6%)**。ordinary-bodyの唯一のfallbackは `dont-mind-me` の複数unit server partial fallbackで、目標5%に近いが、サンプル18件では達成判定しない。
- 既存のfallback率を達成扱いせず、missing PDFを補完した上で同一cohortを再実行し、manual semantic reviewを追加する。
- 12本コホートの唯一のordinary-body server fallbackを再現し、`“Normal”` / `“Awkward”` を技術名として誤保護する一般的な誤判定を修正。識別子形状または命名文脈を持つ引用名だけを保護し、サーバー quality gate を v36 に更新した。4つの問題文を同一サーバーで再実行し、4/4が日本語訳を返し、fallbackなしになった。
- 修正後の同一11本・44-unit再監査（`post-quality-quoted-label-v1`）は完了。構造除外後33 evaluable unitsのreader-visible fallbackは **14/33 (42.4%)**、ordinary-bodyは **2/18 (11.1%)**。ラベル誤保護は消えたが、`speechin` のIR/SSR・引用欠落、`thermal-earring` の否定/BPM、図参照順、UUIDなど別のpost-model問題が残るため、5%達成とはみなさない。
- IR/BPM/SSRのように本文中で正式名称が展開され、日本語側で自然な展開語になる標準科学略語を、対応する日本語展開（赤外線・心拍・無声音声等）が保持されていれば受理する一般ルールを追加。quality tests **254/254**、全Vitest **628/628**。引用番号欠落や切断文は引き続きfallback対象とする。
- `speechin` の再監査では `infrared (IR)` を「赤外線」とした本文がfallbackなしになったことを確認（`post-acronym-expansion-speechin-v1`）。残る `SSR, [4, 9, 29, ...` の行はPDFページ境界で切れた引用列を含むsource fragmentであり、保護緩和せずExtraction側の課題として扱う。

## 2026-10-05: citation-column stitch verification

- Added a high-precision same-page layout repair in `pdfLayout.ts` for a paragraph whose left-column block ends with an open numeric citation and whose right-column continuation begins with `], and ...`. It requires paragraph roles, same page, horizontal left-to-right order, overlapping vertical bands, and matching body font size.
- On `speechin.pdf`, the extracted text now joins `...[4, 9, 29, 36, 37, 57 ], and capacitive sensors in the mouth [38, 43].` into the preceding paragraph. The paragraph still ends in `Tongue` and is therefore correctly retained as damaged extraction rather than being sent to translation as a complete claim; the next block begins `movement can also ...` and needs a separate conservative continuation repair.
- `post-citation-stitch-speechin-v1` rerun: 4 units; 1 ordinary-body block remains reader-visible fallback because the source still ends at `Tongue`; the clean abstract and list units completed without fallback. This confirms the citation fragment was repaired, while the remaining failure is a word-level column continuation/extraction issue.
- Verification: targeted TS tests 354/354 (quality 254, extraction pipeline 26, reading order 74); typecheck and lint pass. Full-suite rerun remains pending after this extraction change.
- Added a second conservative same-column continuation repair: a long paragraph ending in a short title-case token followed immediately by a lowercase paragraph at the same x/y flow is joined only when font size and vertical gap match. On `speechin.pdf`, `Tongue` now correctly joins `movement can also be inferred...`; the resulting 437-character block remains marked damaged-extraction only because the source block still contains mixed multi-column provenance, but it is no longer sent as an isolated fragment.
- `post-word-continuation-speechin-v1`: the ordinary-body abstract and list completed with no reader-visible fallback; the two extraction-damaged blocks were preserved before model translation. This removes the prior ordinary post-model fallback from the sampled units without relaxing the quality gate.
- Started fresh broad regression `post-extraction-continuation-cohort-v1` with all 114 cached OA catalog papers and 12 section-stratified units/paper (separate report/checkpoint; no prior report mixing). The process is still running in the active benchmark session. First completed papers: `interactive-jewellery`, `significant-other`, `power-over-skin` (36 units total). Early reader-visible fallbacks are being separated into damaged extraction, structural/list, and post-model quality failures; no production gate has been relaxed.
- Fresh cohort progress update: `neuroscience-rule-following` completed; 20/114 papers and 213 sampled units are now checkpointed in `post-extraction-continuation-cohort-v1`.
- Fresh cohort progress: 24/114 papers and 233 units checkpointed; latest `medical-imaging-deep-learning-review` (4 units) and `covid-ml-review` (3 units).
- Fresh cohort progress: 25/114 papers and 245 units checkpointed; latest `medical-image-segmentation-deep-learning`.
- Fresh cohort progress: 27/114 papers and 269 units checkpointed; latest `human-ai-interaction-guidelines`.
- Fresh cohort progress: 28/114 papers and 281 units checkpointed; latest `social-influence-social-advertising`.
- Fresh cohort progress: 29/114 papers and 293 units checkpointed; latest `modeling-human-behavior-cognitive-uncertainty`.
- Fresh cohort progress: 31/114 papers and 305 units checkpointed; latest `osworld-multimodal-agents` (12 units) and `conversation-analysis-user-experience` (0 units).
- Fresh cohort progress: 33/114 papers and 329 units checkpointed; latest `computational-linguistics-nlp-translation` and `how-content-volume-landing-pages`.
- Fresh cohort progress: 34/114 papers and 341 units checkpointed; latest `using-cognitive-psychology-gpt3`.
- Fresh cohort progress: 37/114 papers and 369 units checkpointed; latest `hfe-healthcare-2024` and `hfe-healthcare-safety-review`.
- Fresh cohort progress: 39/114 papers and 393 units checkpointed; latest `cognitive-dual-task-older-adults` and `marketing-unavailable-choice`.
- Fresh cohort progress: 40/114 papers and 405 units checkpointed; latest `marketing-framing-organic-food`.
- Fresh cohort progress: 41/114 papers and 413 units checkpointed; latest `marketing-platform-attitude`.
- Fresh cohort progress: 42/114 papers and 421 units checkpointed; latest `marketing-consumer-production-journey`.
- Fresh cohort progress: 43/114 papers and 433 units checkpointed; latest `ergonomics-job-rotation-robotics`.
- Fresh cohort progress: 44/114 papers and 445 units checkpointed; latest `ergonomics-quantified-factory-worker`.
- Fresh cohort progress: 45/114 papers and 457 units checkpointed; latest `ergonomics-flight-deck-applications`.
- Fresh cohort progress: 46/114 papers and 469 units checkpointed; latest `linguistics-register-web-corpus`.
- Fresh cohort progress: 47/114 papers and 481 units checkpointed; latest `linguistics-appraisal-institutional-discourse`.
- Fresh cohort progress: 48/114 papers and 493 units checkpointed; latest `marketing-neurophysiology-consumer-motivation`.
- Fresh cohort progress: 50/114 papers and 505 units checkpointed; latest `cognitive-memory-cue-interest` and `cognitive-vr-mnemonic-processing`.
- Fresh cohort progress: 51/114 papers and 513 units checkpointed; latest `cognitive-motor-incidental-memory`.
- Fresh cohort progress: 54/114 papers and 549 units checkpointed; latest `marketing-health-goals-nudging`, `hfe-healthcare-patient-safety-review`, and `marketing-online-context-web-evolution`.
- Fresh cohort progress: 55/114 papers and 561 units checkpointed; latest `hci-social-touch-in-human-computer-interaction`.
- Fresh cohort progress: 56/114 papers and 573 units checkpointed; latest `hci-human-computer-interaction`.
- Fresh cohort progress: 58/114 papers and 587 units checkpointed; latest `hci-human-computer-interaction-as-science` and `cognitive-psychology-study-on-the-optimization-effect-of-memory-on-vocabulary-teaching-in-c`.
- Fresh cohort progress: 59/114 papers and 599 units checkpointed; latest `cognitive-psychology-research-progress-of-memory-mechanism-in-cognitive-psychology`.
- Fresh cohort progress: 60/114 papers and 609 units checkpointed; latest `cognitive-psychology-a-tribute-to-the-memory-of-professor-neisser-the-godfather-of-cognitiv`.
- Fresh cohort progress: 61/114 papers and 612 units checkpointed; latest `cognitive-psychology-cognitive-psychology-first-language-and-false-memories`.
- Fresh cohort progress: 63/114 papers and 636 units checkpointed; latest `cognitive-psychology-role-of-educational-psychology-in-the-study-of-memory-conceptual-proce` and `cognitive-psychology-a-study-on-the-teaching-of-chinese-characters-memorization-for-foreign`.
- Fresh cohort progress: 64/114 papers and 648 units checkpointed; latest `cognitive-psychology-the-underlying-reasons-for-making-reminders-an-investigation-on-memory`.
- Fresh cohort progress: 65/114 papers and 659 units checkpointed; latest `cognitive-psychology-participant-nonnaivet-and-the-reproducibility-of-cognitive-psychology`.
- Fresh cohort progress: 66/114 papers and 671 units checkpointed; latest `marketing-consumer-behavior-marketing-and-supply-chains-of-fermented-foods-and-h`.
- Fresh cohort progress: 67/114 papers and 672 units checkpointed; latest `marketing-a-review-of-rural-consumer-behavior-marketing-strategies-and-consumer-`.
- Fresh cohort progress: 68/114 papers and 684 units checkpointed; latest `marketing-integrating-value-at-risk-var-model-into-behavior-economics-for-consum`.
- Fresh cohort progress: 72/114 papers and 711 units checkpointed; latest `marketing-the-blind-box-economy-exploring-consumer-behavior-marketing-strategies`, `marketing-digital-marketing-consumer-behavior`, `ergonomics-6-virtual-reality-and-ergonomics-human-factors`, and `ergonomics-2s2-1-ergonomics-human-factors-in-around-1964`.
- Fresh cohort progress: 74/114 papers and 735 units checkpointed; latest `ergonomics-analisis-pemetaan-bibliometrik-komputational-publikasi-pada-ergonomics` and `linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng`.
- Fresh cohort progress: 75/114 papers and 747 units checkpointed; latest `linguistics-eco-linguistics-in-english-reviewing-the-role-of-language-in-environme`.
- Fresh cohort progress: 78/114 papers and 783 units checkpointed; latest `linguistics-internet-linguistics-a-linguistic-analysis-of-electronic-discourse-as-`, `linguistics-text-discourse-dicteme-language-personality-as-basic-concepts-of-text-`, and `linguistics-the-importance-of-discourse-studies-in-linguistics-language-teaching-a`.
- Fresh cohort progress: 79/114 papers and 795 units checkpointed; latest `linguistics-discussion-on-second-language-acquisition-in-cognitive-linguistics-in-`.
- Fresh cohort progress: 80/114 papers and 807 units checkpointed; latest `linguistics-study-of-animal-discourse-in-language-textbooks-from-the-perspective-o`.
- Fresh cohort progress: 81/114 papers and 819 units checkpointed; latest `hci-introduction-to-human-computer-interaction`.
- Fresh cohort progress: 82/114 papers and 831 units checkpointed; latest `hci-intelligent-human-computer-interaction`.
- Fresh cohort progress: 84/114 papers and 843 units checkpointed; latest `cognitive-psychology-research-on-the-effects-of-different-listening-process-models-in-liste` and `cognitive-psychology-chronometric-constructive-cognitive-learning-evaluation-model-measurin`.
- Fresh cohort progress: 85/114 papers and 849 units checkpointed; latest `cognitive-psychology-editorial-the-role-of-the-distinctions-between-identification-producti`.
- Fresh cohort progress: 87/114 papers and 863 units checkpointed; latest `cognitive-psychology-the-validity-of-the-specific-coding-principle-the-explanations-from-co` and `cognitive-psychology-grand-challenges-in-environmental-psychology`.
- Fresh cohort progress: 88/114 papers and 875 units checkpointed; latest `marketing-the-influence-of-social-media-marketing-on-consumers-behavior`.
- Fresh cohort progress: 89/114 papers and 887 units checkpointed; latest `marketing-impact-of-sensory-marketing-on-consumer-behavior`.
- Fresh cohort progress: 90/114 papers and 899 units checkpointed; latest `marketing-impact-of-e-marketing-on-consumer-behavior`.
- Fresh cohort progress: 91/114 papers and 909 units checkpointed; latest `marketing-marketing-communication-and-consumer-behavior-in-digital-era`.
- Fresh cohort progress: 92/114 papers and 921 units checkpointed; latest `marketing-impact-of-green-marketing-on-consumer-behavior`.
- Fresh cohort progress: 93/114 papers and 933 units checkpointed; latest `ergonomics-human-factors-and-ergonomics`.
- Fresh cohort progress: 94/114 papers and 945 units checkpointed; latest `ergonomics-human-factors-ergonomics-in-hydrocarbon-facilities`.
- Fresh cohort progress: 96/114 papers and 959 units checkpointed; latest `linguistics-an-empirical-analysis-of-the-use-of-discourse-markers-by-second-langua` and `linguistics-linguistics-and-politics-russianisms-in-the-western-english-language-p`.
- Fresh cohort progress: 98/114 papers and 983 units checkpointed; latest `linguistics-constructing-or-disrupting-peace-through-language-a-peace-linguistics-` and `linguistics-gender-linguistics-in-the-linguo-limological-aspect-by-the-material-of`.
- Fresh cohort progress: 100/114 papers and 997 units checkpointed; latest `hci-development-of-user-interface-user-experience-using-design-thinking-ap` and `hci-user-experience-analysis-on-mobile-application-design-using-user-exper`.
- Fresh cohort progress: 101/114 papers and 1003 units checkpointed; latest `hci-a-comparative-research-on-usability-and-user-experience-of-user-interf`.
- Fresh cohort progress: 102/114 papers and 1015 units checkpointed; latest `hci-user-experience-design-using-machine-learning-a-systematic-review`.
- Fresh cohort progress: 104/114 papers and 1039 units checkpointed; latest `hci-redesign-of-user-experience-in-inaportnet-using-the-user-experience-qu` and `cognitive-psychology-the-role-of-attention-memory-and-cognition-in-the-decision-making-proc`.
- Fresh cohort progress: 105/114 papers and 1051 units checkpointed; latest `cognitive-psychology-attention-and-entrepreneurial-cognition`.
- Fresh cohort progress: 106/114 papers and 1059 units checkpointed; latest `marketing-the-impact-of-online-advertising-on-consumer-choice-consumption-traps-`.
- Fresh cohort progress: 107/114 papers and 1071 units checkpointed; latest `marketing-a-study-on-the-relationship-between-advertising-value-choice-of-media-`.
- Fresh cohort progress: 108/114 papers and 1083 units checkpointed; latest `marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the`.
- Fresh cohort progress: 109/114 papers and 1095 units checkpointed; latest `marketing-influence-of-advertising-incentives-on-consumers-in-the-digital-enviro`.
- Fresh cohort progress: 110/114 papers and 1107 units checkpointed; latest `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport`.
- Fresh cohort progress: 112/114 papers and 1131 units checkpointed; latest `ergonomics-analysis-of-burnout-and-occupational-safety-in-nurses-a-literature-rev` and `ergonomics-risk-factors-for-occupational-fatigue-in-construction-workers-a-system`.
- Fresh cohort progress: 113/114 papers and 1143 units checkpointed; latest `linguistics-the-role-of-morphology-in-computational-linguistics-its-significance-i`.
- Fresh cohort completed: report `post-extraction-continuation-cohort-v1` contains 114 papers and 1,155 sampled units. Automatic attribution: 440 damaged-extraction, 404 ordinary-body-prose, 172 list, 41 statistical-prose, 35 section-heading, 61 reference-chrome, 2 caption. Ordinary-body reader-visible fallback is 118/404 (29.2%), so the <=5% target is not met. Across all rows, 607 fallbacks are pre-model and 155 post-model; this is evidence for a broad extraction/source-completeness problem plus a separate model/quality problem, not evidence to relax gates. Manual semantic review and category-specific fixes remain required.
- Ordinary-body fallback attribution is more specific: 116/118 are post-model and 2/118 are pre-model. The broad pre-model count is dominated by damaged/list/reference rows; ordinary prose needs model-quality and semantic-review analysis rather than an indiscriminate extraction-gate change. Review queue saved as `test-data/real-papers/reports/ordinary-fallback-review-v1.{json,md}`.
- Preliminary semantic review of 17 representative ordinary fallback rows found 9 omissions, 2 hallucinations, 3 semantic shifts, 1 numeric/invariant failure, and 2 source fragments; 11 had severity 4. This confirms that reducing fallback by accepting current outputs would be unsafe. Review artifact: `test-data/real-papers/reports/ordinary-fallback-manual-review-v1.json`.
- Selective-cascade audit dry-run over the fresh report identifies 140 post-model rows with source text eligible for an alternate model and excludes 15 rows with incomplete source; no Ollama endpoint is currently available, so no alternate output was accepted. Dry-run artifact: `test-data/real-papers/reports/selective-cascade-post-cohort-v1.json`.
- Added two behavior-locking quality tests for reviewed participant-fact and bibliographic hallucinations; quality suite now passes 256 tests.
- Benchmark accounting correction: 114 catalog entries were selected, but `precious-materials` had no cached PDF and produced no rows; the measured corpus is therefore 113 papers / 1,155 units, with the missing PDF tracked separately.
## 2026-10-05 validation checkpoint

- Final post-build verification: `npm test` passes (69 files / 631 tests), `npx tsc -b --pretty false` passes, `git diff --check` passes, and translation-server `pytest translation-server/tests -q` passes (247 tests, 11 subtests). The `npm test -- --runInBand` invocation itself is unsupported by Vitest; the plain `npm test` run is the authoritative result.
- The rebuilt macOS bundle is at `src-tauri/target/release/bundle/macos/Paper Reader.app` (mtime 2026-10-05 10:15:39), with bundled `segmenter.py` byte-identical to source and `SEGMENTER_VERSION="semantic-v83"`. The bundled MADLAD source includes the Transformers 4.57.6 / semantic-v83 version components. Fully quit the currently running app/server before launching this bundle; the old process previously reported semantic-v73.
- Resumed fresh benchmark with the ready local server (`translation-audit` run `2026-10-05T01-19-33-121Z`): 112/114 papers, 1,266 evaluable units, 322 model responses, 994 original fallbacks; ordinary-body fallback was 242/447 (54.1%). The run is diagnostic only because 672 units were blocked by the production input policy and 538 damaged-extraction rows dominated the fallback rate. This confirms that relaxing the quality gate alone would not reach the target; the next work must reduce structural/source blocking and separately evaluate the 322 model outputs semantically. One catalog entry still had no eligible blocks and is recorded in the report.
- The authenticated-free benchmark `translation-audit-auth-v1` was restarted after the previous 37-paper run stalled on long-lived requests. The new server/benchmark are live (PIDs 3715/4069); `--resume` skipped 29 checkpointed papers and the report currently contains 38 papers / 381 rows, latest `marketing-unavailable-choice`. Current interim ordinary-body fallback is 29/123 (23.6%); this is not final until all selected papers finish.
- Interim checkpoint diagnostic (not final): 213 sampled rows across those 18 papers include 71 ordinary-body-prose rows; 16 are reader-visible fallbacks (22.5%), with 15 post-model and 1 pre-model. Treat this as directional only until all papers finish; it already indicates that post-model quality rejection remains the dominant ordinary-prose issue.

- Post-extraction continuation benchmark remains available at `test-data/real-papers/reports/post-extraction-continuation-cohort-v1.{json,md}`. The catalog contains 114 entries and 1,155 sampled units; the raw report currently has 109 paper entries with non-empty rows because four catalog entries have empty cached-row results and `precious-materials` is explicitly missing its PDF. Treat `papersWithRows` from the summary artifact as the authoritative paper count until those entries are repaired; do not describe this as 114 fully measured papers.
- Verification after the latest benchmark: `npm run lint` passes with existing warning-only escape/comparison diagnostics; `git diff --check` passes; `npm run typecheck` passes; `npm test -- --run src/test/quality.test.ts` passes (256 tests).
- Translation server and Ollama are stopped/unavailable after the benchmark. No alternate-model result has been collected yet, so no production cascade/protection change is justified from that experiment.
- Benchmark bookkeeping was tightened in `scripts/benchmark-real-paper-translation.ts`: `--resume` now treats an entry as complete only when it has at least the requested per-paper sample count, preventing empty extraction/server checkpoints from being silently counted as complete.
- Added `test-data/real-papers/reports/empty-entry-diagnostic-v2.{json,md}`. The four empty cached entries are now attributed explicitly: no eligible audit blocks after the 90-character paragraph filter (23/1/0/6 paragraph candidates respectively), rather than being reported as silent zero-row successes. This is an audit-sampling/extraction eligibility issue, not evidence that translation succeeded or failed.
- Re-ran those four entries with the server ready; `missing-four-cohort-v1.{json,md}` confirms the same eligibility errors, so no model output was produced for them. The server was then stopped to avoid leaving the local model resident.
- Post-change verification: lint exits 0 with existing warning-only diagnostics, typecheck exits 0, and `translation-server/tests/test_segmenter.py` passes (61 tests, 8 subtests).
- Added `ordinary-fallback-triage-v2.json`: the 118 ordinary-body fallbacks split into 47 server quality rejections, 38 scientific-invariant failures, 13 semantic-relation failures, 8 protected-token restore failures, 4 language/degeneration failures, 2 pre-model cases, and 6 other cases. This confirms the next optimization target is post-model handling/model output, not broad extraction relaxation; the counts remain automatic diagnostics, not semantic ground truth.
- Replayed three held-out ordinary fallback sources directly against the current server in `madlad-fallback-replay-v1.json`. The long participant-method block still triggered partial-unit fallback (52s); the speechin block produced mixed-script/unsupported-content output in 83s; the bibliography block produced an unrelated Japanese citation in 7s, but the production audit's invariant gate correctly rejects that row. These direct outputs reinforce that model decode can drift and that the invariant gate is preventing at least this hallucination from reaching the reader.
- Promoted the replay helper to `scripts/replay-translation-fallbacks.mjs` so future model/protection comparisons can reproduce the same sources without touching production caches. `node --check`, typecheck, and diff checks pass.
- Added the human-readable companion `test-data/real-papers/reports/madlad-fallback-replay-v1.md` with source/output pairs for manual semantic review.
- Local Ollama was available with pre-existing `qwen2.5:7b` and `qwen2.5:14b` models. Audit-only selective-cascade probes were run on three fallback rows: qwen2.5:7b accepted 1/3, while qwen2.5:14b accepted 2/3 by the current gate. The 14B accepted output still contained the Chinese conjunction `其次`, so this is not production-ready evidence; the rejected cases correctly caught mixed Chinese, missing invariants, or untranslated lexemes. Reports: `selective-cascade-qwen25-7b-v1.json`, `selective-cascade-qwen25-14b-v1.json`. Ollama was stopped after the probe.
- A qwen3:14b probe was started but the first long candidate exceeded the 240-second request budget and was terminated; `selective-cascade-qwen3-14b-v1.json` is explicitly incomplete (1 result). It is not a quality conclusion.
- Consolidated the small alternate-model probes in `selective-cascade-model-comparison-v1.{json,md}`. qwen2.5:7b accepted 1/3 (mean 8.4s), qwen2.5:14b accepted 2/3 (mean 15.1s with Chinese contamination in an accepted output), and qwen3:14b is incomplete (1/3, 137.6s). These are diagnostic only and do not justify production routing.
- Added a regression guard for the observed Chinese connective compound `其次` in mixed Japanese output. This extends the existing script-contamination detector (rather than a hallucinated-content blacklist); quality suite now passes 257 tests.
- Re-evaluated the saved qwen2.5:14b outputs with the updated gate in `selective-cascade-qwen25-14b-post-gate-v1.json`: the previously accepted contaminated output is now rejected, leaving 1/3 accepted. This is a gate-safety improvement, not a model-quality improvement or production cascade decision.
- A broader qwen2.5:14b run was started for 10 candidates but was stopped after 3 long results (1 accepted) because the first three already took nearly two minutes each. `selective-cascade-qwen25-14b-v2-10.json` is explicitly partial and must not be treated as a 10-case benchmark.
- Authenticated-free real-paper benchmark `translation-audit-auth-v1` progressed to 39/113 papers and 405 rows; ordinary-body is 134 rows with 36 reader-visible fallbacks (26.9% interim). Benchmark/server remain active; metrics are not final.
- Benchmark checkpoint updated: `translation-audit-auth-v1` is now 40/113 papers, 413 rows; ordinary-body 142 rows, 36 reader-visible fallbacks (25.4% interim). Server and benchmark remain active.
- Benchmark checkpoint updated: `translation-audit-auth-v1` is now 41/113 papers and 421 rows; ordinary-body fallback remains to be recalculated from the live report.
- Benchmark checkpoint: `translation-audit-auth-v1` reached 42/113 papers, 433 rows; ordinary-body 153 rows, 38 reader-visible fallbacks (24.8% interim). Latest `ergonomics-job-rotation-robotics`.
- After checkpoint-preserving restart, `translation-audit-auth-v1` resumed at 41/113 papers, 445 rows; ordinary-body 160 rows, 40 reader-visible fallbacks (25.0% interim). Dedicated server session and benchmark session are active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **54/114 papers and 561 sampled units**, latest `hci-social-touch-in-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **55/114 papers and 573 sampled units**, latest `hci-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **56/114 papers and 585 sampled units**, latest `hci-human-computer-interaction-as-science`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **57/114 papers and 587 sampled units**, latest `cognitive-psychology-study-on-the-optimization-effect-of-memory-on-vocabulary-teaching-in-c`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **58/114 papers and 599 sampled units**, latest `cognitive-psychology-research-progress-of-memory-mechanism-in-cognitive-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **59/114 papers and 609 sampled units**, latest `cognitive-psychology-a-tribute-to-the-memory-of-professor-neisser-the-godfather-of-cognitiv`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **60/114 papers and 612 sampled units**, latest `cognitive-psychology-cognitive-psychology-first-language-and-false-memories`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): `translation-audit-auth-v1` reached **62/114 papers and 636 sampled units**, latest `cognitive-psychology-a-study-on-the-teaching-of-chinese-characters-memorization-for-foreign`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **63/114 papers and 648 sampled units**, latest `cognitive-psychology-the-underlying-reasons-for-making-reminders-an-investigation-on-memory`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **64/114 papers and 659 sampled units**, latest `cognitive-psychology-participant-nonnaivet-and-the-reproducibility-of-cognitive-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **65/114 papers and 671 sampled units**, latest `marketing-consumer-behavior-marketing-and-supply-chains-of-fermented-foods-and-h`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **66/114 papers and 672 sampled units**, latest `marketing-a-review-of-rural-consumer-behavior-marketing-strategies-and-consumer-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **67/114 papers and 684 sampled units**, latest `marketing-integrating-value-at-risk-var-model-into-behavior-economics-for-consum`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **68/114 papers and 696 sampled units**, latest `marketing-the-blind-box-economy-exploring-consumer-behavior-marketing-strategies`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **72/114 papers and 723 sampled units**, latest `ergonomics-analisis-pemetaan-bibliometrik-komputational-publikasi-pada-ergonomics`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **74/114 papers and 747 sampled units**, latest `linguistics-eco-linguistics-in-english-reviewing-the-role-of-language-in-environme`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **77/114 papers and 783 sampled units**, latest `linguistics-the-importance-of-discourse-studies-in-linguistics-language-teaching-a`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **78/114 papers and 795 sampled units**, latest `linguistics-discussion-on-second-language-acquisition-in-cognitive-linguistics-in-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **79/114 papers and 807 sampled units**, latest `linguistics-study-of-animal-discourse-in-language-textbooks-from-the-perspective-o`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **80/114 papers and 819 sampled units**, latest `hci-introduction-to-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **81/114 papers and 831 sampled units**, latest `hci-intelligent-human-computer-interaction`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **83/114 papers and 843 sampled units**, latest `cognitive-psychology-chronometric-constructive-cognitive-learning-evaluation-model-measurin`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **84/114 papers and 849 sampled units**, latest `cognitive-psychology-editorial-the-role-of-the-distinctions-between-identification-producti`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **86/114 papers and 863 sampled units**, latest `cognitive-psychology-grand-challenges-in-environmental-psychology`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **87/114 papers and 875 sampled units**, latest `marketing-the-influence-of-social-media-marketing-on-consumers-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **88/114 papers and 887 sampled units**, latest `marketing-impact-of-sensory-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **89/114 papers and 899 sampled units**, latest `marketing-impact-of-e-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **90/114 papers and 909 sampled units**, latest `marketing-marketing-communication-and-consumer-behavior-in-digital-era`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **91/114 papers and 921 sampled units**, latest `marketing-impact-of-green-marketing-on-consumer-behavior`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **92/114 papers and 933 sampled units**, latest `ergonomics-human-factors-and-ergonomics`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **93/114 papers and 945 sampled units**, latest `ergonomics-human-factors-ergonomics-in-hydrocarbon-facilities`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **95/114 papers and 959 sampled units**, latest `linguistics-linguistics-and-politics-russianisms-in-the-western-english-language-p`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **97/114 papers and 983 sampled units**, latest `linguistics-gender-linguistics-in-the-linguo-limological-aspect-by-the-material-of`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **99/114 papers and 997 sampled units**, latest `hci-user-experience-analysis-on-mobile-application-design-using-user-exper`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **100/114 papers and 1003 sampled units**, latest `hci-a-comparative-research-on-usability-and-user-experience-of-user-interf`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **101/114 papers and 1015 sampled units**, latest `hci-user-experience-design-using-machine-learning-a-systematic-review`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **103/114 papers and 1039 sampled units**, latest `cognitive-psychology-the-role-of-attention-memory-and-cognition-in-the-decision-making-proc`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **104/114 papers and 1051 sampled units**, latest `cognitive-psychology-attention-and-entrepreneurial-cognition`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **105/114 papers and 1059 sampled units**, latest `marketing-the-impact-of-online-advertising-on-consumer-choice-consumption-traps-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **106/114 papers and 1071 sampled units**, latest `marketing-a-study-on-the-relationship-between-advertising-value-choice-of-media-`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **107/114 papers and 1083 sampled units**, latest `marketing-is-digital-advertising-effective-under-conditions-of-low-attention-the`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **108/114 papers and 1095 sampled units**, latest `marketing-influence-of-advertising-incentives-on-consumers-in-the-digital-enviro`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **109/114 papers and 1107 sampled units**, latest `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **111/114 papers and 1131 sampled units**, latest `ergonomics-risk-factors-for-occupational-fatigue-in-construction-workers-a-system`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **112/114 papers and 1143 sampled units**, latest `linguistics-the-role-of-morphology-in-computational-linguistics-its-significance-i`; server and benchmark remain active.
- Current live checkpoint (2026-10-05): translation-audit-auth-v1 reached **113/114 papers and 1155 sampled units**, latest `linguistics-computational-linguistics`; server and benchmark remain active.
- Translation audit auth-v1 completed its cached corpus pass: **113/114 catalog papers had PDFs**, with **1 missing PDF (`precious-materials.pdf`)**; 4 cached papers produced no eligible blocks because the sampler minimum was 90 characters. The report contains **1,155 sampled units**. Ordinary-body reader-visible fallback is **118/404 (29.2%)**, so the <=5% target is not met. A machine-readable summary is saved at `test-data/real-papers/reports/translation-audit-auth-v1-summary.json`. Main measured issue is post-model quality fallback in ordinary prose (116/118), while damaged extraction is predominantly blocked pre-model (405/440). Benchmark processes have exited normally; translation server remains running.
- Follow-up checkpoint (2026-10-05): cached audit `translation-audit-auth-v1` has 140 post-model fallback candidates eligible for selective-cascade replay (15 incomplete-source candidates excluded). `scripts/benchmark-selective-cascade.ts` dry-run artifact: `test-data/real-papers/reports/selective-cascade-auth-v1-dry.json`. Ollama CLI exists at `/opt/homebrew/bin/ollama`, but `ollama list` reports no running Ollama server; no alternate-model output has been claimed. Production behavior remains unchanged.
- Selective cascade probe (2026-10-05): Ollama server was started and `curl http://127.0.0.1:11434/api/tags` confirmed local models, including `qwen2.5:7b`. The Node/Vite benchmark process nevertheless received `TypeError: fetch failed` for all 20 probes (localhost isolation between the benchmark runtime and Ollama), so **no alternate-model quality result is claimed**. Artifact: `test-data/real-papers/reports/selective-cascade-auth-v1-qwen25-7b.json` records the transport failures. To obtain valid outputs, run the benchmark from the same host shell where Ollama is reachable.
- CAT decision checkpoint (2026-10-05): consolidated existing CAT-Translate 3.3B evidence in `test-data/real-papers/reports/cat-translate-decision-v1.json`. CAT remains production-disabled. Existing frozen 30-row cascade projection is 1/30 reader-visible fallback (3.3%) with 0 severity>=2 among 10 CAT candidates, but it is not an independent population estimate; prior CAT reviews contain severity-3 terminology/semantic errors and runtime integration is unverified. Next gate is source-hash-disjoint fallback evaluation with complete blind semantic review.
- Extraction/translation quality fix (2026-10-05): resume translation now uses `projectSafeUnitTranslation` for block-level partial server results. Valid one-to-one unit mappings retain successful Japanese units and preserve failed units as exact source; all-failed, title, and section results remain all-or-nothing. Partial blocks are marked `translationOutcome: partial_source_preserved` with failed unit indices. Focused tests 267/267 and typecheck pass. A fresh 113-paper benchmark is still required to measure the fallback change; no quality threshold was relaxed.
- Fresh targeted regression after safe partial projection (2026-10-05): reran 4 audited papers (`dont-mind-me`, `speechin`, `hci-empirical-methods`, `interpreting-neural-networks`), 16 units, with report `translation-audit-partial-projection-v1`. Results are saved for before/after comparison; this is not the full 113-paper refresh.
- Partial projection follow-up (2026-10-05): client-side MADLAD response validation now accepts a safe one-to-one partial unit projection before the whole-text Japanese plausibility check; unsafe/unmapped or all-failed responses remain rejected. Added resume regression covering persisted Japanese units plus exact English source for failed units. Full suite now passes **632/632 across 69 files**, typecheck passes.
- Full audit refresh started (2026-10-05): `translation-audit-auth-v2-partial-projection` is running against 113 cached PDFs (114 catalog entries, one missing), same 12-unit sampling as auth-v1. First checkpoint `interactive-jewellery` completed; benchmark session remains active.
- Benchmark policy checkpoint (2026-10-05): stopped the full 113-paper `translation-audit-auth-v2-partial-projection` refresh at 2 papers / 24 units because the user requested full-corpus measurement only at major algorithm/model/quality-gate milestones. The partial report is retained but is not a corpus-wide metric. Routine changes should use focused representative papers plus regression tests; rerun the full corpus only after a major change.
- Focused post-fix benchmark checkpoint (2026-10-05): `translation-audit-partial-projection-v2` was intentionally stopped after the first paper (`dont-mind-me`, 4 units) because the next paper made no progress for an extended MPS interval. The partial report is diagnostic only; no corpus-wide rate is inferred. Full-corpus runs remain reserved for major milestones.
- Batch partial projection parity (2026-10-05): `/translate/batch` now applies the same safe one-to-one partial projection as `/translate`; added batch regression coverage. Full suite passes **633/633 across 69 files**, typecheck passes. No quality thresholds were relaxed.
- Partial projection source-integrity hardening (2026-10-05): one-to-one partial projection now also verifies that the normalized concatenation of server `translation_units` exactly reconstructs the request source. Missing, reordered, or substituted units therefore remain whole-block fallback. Focused tests (15/15) and typecheck pass.
- CAT source-disjoint probe (2026-10-05): evaluated one previously unmeasured ordinary-body fallback (`interactive-jewellery:b-d753999d`) with CAT-Translate 3.3B. Generation completed in 7.5s (117 input / 77 output tokens), but the current safety evaluator rejected it for `exclusivity relation missing`. Artifacts: `cat-source-disjoint-auth-v1-single.json` and `cat-source-disjoint-auth-v1-single-quality.json`. No production routing change.
- Quality false-reject fix (2026-10-05): CAT source-disjoint probe exposed a natural Japanese exclusivity rendering (`独自の物理的歴史`) rejected as `exclusivity relation missing`. Added generic `独自`/`独特` recognition to the relation evaluator with regression coverage. The same CAT output now passes the evaluator (1/1 instead of 0/1); no blacklist or paper-specific rule. Full suite **634/634**, typecheck passes.
- CAT source-disjoint tail probe (2026-10-05): evaluated 4 additional clean ordinary-body fallback rows with CAT-Translate 3.3B. Automatic gate accepted **2/4 (50%)**; two were rejected for `degenerate output` and `participant role shifted to researcher`. Combined with the prior one-row probe (accepted after the exclusivity false-reject fix), this is **3/5 automatic accepts**, not a semantic safety claim; manual review remains required. Artifacts: `cat-source-disjoint-auth-v1-tail.json` and `cat-source-disjoint-auth-v1-tail-quality.json`.

- Benchmark cadence policy (2026-10-05): 113本規模の全件計測は、抽出/reading-order、segmenter/translation unit、placeholder protection、モデル/Transformers/decode、quality gate/fallback/cascadeなど、複数分野へ影響する大きな変更またはリリース判定時だけ実施する。通常の局所修正は、代表4〜12論文、failure cohort、回帰テスト、typecheck/lintで確認する。詳細は `docs/TRANSLATION_BENCHMARK_POLICY.md`。未完了の全件レポートは全体指標に使わない。

- CAT source-disjoint manual review (2026-10-05): reviewed all 5 outputs from `cat-source-disjoint-auth-v1-single` + `...tail`. Automatic accepts were 3/5; all 3 accepted rows were judged usable for this small sample (two severity 0, one severity 1). One rejected row had a procedure-scope semantic shift (source `utterances` rendered as `sessions`, severity 2); the other was degenerate and correctly rejected. Artifact: `test-data/real-papers/reports/cat-source-disjoint-auth-v1-manual-review.json`. This remains diagnostic only; CAT production cascade stays disabled until a larger held-out cohort and blind review are complete.

- CAT source-disjoint v2 probe (2026-10-05): five additional fallback rows were generated with CAT-Translate 3.3B (`cat-source-disjoint-auth-v2.json`). Manual review found 2 clean complete rows, both usable (severity 0), while 3 rows contained extraction/list-boundary artifacts and were excluded from model-quality conclusions. This reinforces the need to separate source reconstruction failures before comparing models; no production cascade change was made.
- CAT v2 review correction (2026-10-05): the HCI row initially marked clean was reclassified as `source_fragment` after running the existing `diagnoseIncompleteSource` evaluator; it ends without terminal punctuation. The corrected v2 review has 1 clean complete row, 4 source/structure-excluded rows. CAT quality artifact: `cat-source-disjoint-auth-v2-quality.json`.

- Source-boundary fix (2026-10-05): `diagnoseIncompleteSource` now flags long prose ending in a bare Figure/Fig/Table label as a structural boundary (`図表ラベルが段落末尾に混入している可能性があります`), preventing caption/paragraph blends from entering clean model comparisons. Added regression coverage; quality suite 258/258 and typecheck pass.
- Post-boundary focused check (2026-10-05): reran CAT v2 quality evaluation after the trailing figure-label guard. Both `step-to-charge` rows now receive the explicit structural reason `図表ラベルが段落末尾に混入している可能性があります`; the HCI row remains excluded for missing terminal punctuation, and the cognitive row is rejected as degenerate. Artifact: `cat-source-disjoint-auth-v2-quality-post-boundary.json`.
- Source-boundary fix (2026-10-05): `diagnoseIncompleteSource` now flags numbered dash items embedded after a completed sentence (for example `... 40 dollars. 4 - Machine ...`) as list/body merges. Quality suite 259/259 and typecheck pass; this is a generic structural guard, not a paper-specific rule.
- Post-list-boundary verification (2026-10-05): CAT v2 re-evaluation now classifies all four structurally contaminated rows as source-excluded; only `power-over-skin:b-51971114` remains clean (1/1 quality accepted). Artifact: `cat-source-disjoint-auth-v2-quality-post-structure-v2.json`.
- Full regression verification after structural guards (2026-10-05): `npm test` passed 69 files / 636 tests; typecheck had already passed for the same change. The initial `--runInBand` option was unsupported by Vitest and was rerun correctly without it.
- Static verification after source guards (2026-10-05): `npm run lint` exits 0 with the repository's existing warning-only diagnostics; no new error was introduced.
- CAT source-disjoint v3 (2026-10-05): selected five clean complete fallback rows (no source-integrity flags). CAT quality gate accepted 5/5. Manual review judged 4 usable (three severity 0, one severity 1) and found one severity-2 citation alignment risk in the GPT-3 cognitive-psychology paragraph, where inline citation numbers shifted relative to claims. Artifact: `cat-source-disjoint-auth-v3-manual-review.json`; CAT remains production-disabled.
