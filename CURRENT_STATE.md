# Current State

最終更新: 2026-09-15  
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
| Import cancel | **done** | AbortSignal を safe checkpoint に伝播。partial-ready 後は原文を残し `needsTranslationResume=false`（自動再開しない）。UI Cancel |
| Library Backup / Restore | **done** | Settings → データ。consistent snapshot barrier + `PRAGMA quick_check`/`integrity_check`。validate → safety → swap → rollback |
| Packaged acceptance | **done** | Layer A integration + Layer B UI E2E（`packaged:e2e*`）。browser smoke 単体では代替しない |
| Developer ID / 公証 | **done** | `.app` 署名・公証後に DMG 生成（[docs/MACOS_RELEASE.md](./docs/MACOS_RELEASE.md)）。fast には掛けない |
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
- **翻訳**: MADLAD-400 3B / MPS / bf16、文バッチ既定 24、品質ゲート（pipeline v61）。監査手順は [TRANSLATION_CORPUS_AUDIT.md](./TRANSLATION_CORPUS_AUDIT.md)
- **硬化メモ**: [P0_HARDENING.md](./P0_HARDENING.md)
- **packaged acceptance**: [docs/RELEASE_ACCEPTANCE.md](./docs/RELEASE_ACCEPTANCE.md)

---

## Known limitations / 残課題

### 2026-09-15 停止 checkpoint

- v58 full corpus audit は完了済み（21 papers / 206 rows）。ordinary body の reader-visible fallback は 17/74 = 22.97% で、目標の 5% 以下には未到達。
- 残差改善候補として `facebook/m2m100_1.2B` の比較実験を開始したが、区切りのよい時点で停止。レポート `test-data/real-papers/reports/model-cascade-v58-m2m12-ordinary.json` は保持しているため、再開時に内容を評価すること。production のモデル切替は未実施。
- 現在、corpus audit / model comparison の長時間プロセスは停止済み。翻訳サーバーを起動していた場合は開発用の常駐プロセスとして別途扱う。
- 次の再開手順: (1) m2m12 レポートの7件を品質ゲートで再評価、(2) v58 fallback 17件の原因別確認、(3) 改修は before/after 指標を取れる一般化可能なものだけ実施、(4) full audit を再実行。
- 停止前の回帰確認: Vitest 85 tests passed、translation-server unittest 72 tests passed。代替モデル比較は5件生成済み（レポートの `count=5`）。
- 追加修正: MADLADが出力する連続UTF-8 byte escape（`<0xHH>`）を、完全なUTF-8列だけ復元してから品質判定するようにした。不正列は従来どおり拒否する。translation-server unittest 74 tests passed。
- v63調査結果: 長段落の生成上限を384へ上げても最長fallback（1,063文字）はsource fallbackのままだったため、256へ戻した。救済分割のfragment閾値変更は既存回帰を壊したため不採用。現在のfull corpusはordinary 74件中fallback 15件（20.27%）。
- 目標再開Phase 1: 残存15件のpaper/block/page/reason/文字数/一次原因仮説を監査末尾に全件記録。次は各ケースのsource integrity・bbox・canonical geometryを確認し、仮分類を確定する。確定前に新しい翻訳ルールを追加しない。
- attribution補足: audit rowsでは15件すべて`structuralWarnings: []`だがbboxを保存していないため、structure関連ラベルは未確定。server source fallback 7件をTRANSLATION_UNIT_DEBUGとcanonical geometry付きで優先再現する。

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

### Pause checkpoint (2026-09-15)

Corpus-audit work is paused at a clean boundary. No benchmark, test, or audit
job is running. The packaged app translation server remains running because it
belongs to the user's launched `.app`; it was left untouched.

Resume from Phase 1 attribution of the 15 remaining ordinary-body fallbacks.
The measured rate is still 15/74 (20.27%), so the <=5% goal is not met. Next,
capture canonical block geometry and `TRANSLATION_UNIT_DEBUG=1` traces for all
15 rows before adding new rules.

### Phase 1 attribution evidence (2026-09-15)

Added `scripts/attribute-translation-fallbacks.ts` and generated
`test-data/real-papers/reports/translation-fallback-attribution.json` without
starting the translation server. All 15 remaining fallback rows matched
exactly one extracted Canonical block and one layout block, so page/bbox
evidence is now available. Preliminary cause hypotheses are A model/adequacy
9, D structure mixing 3, and E scientific layout 3. No matched fallback block
currently shows a within-block column switch, so reading-order failure has not
been claimed from this evidence. These
labels are explicitly hypotheses until manual line-level review; no production
heuristic was changed from this inventory.

The fixed fixture was rerun under `3b-mt-v5-semantic-v61`; direct, micro-batch,
protection, atomic citation, whole-sentence, and repeat outputs were
deterministic. No unrelated hallucinated fact appeared, while terminology
remains awkward (for example 「移動領域」), confirming a semantic adequacy
issue rather than a splitter or batch failure.

Segmenter v62 now merges leading two- or three-word prefixes forward (while
preserving colon-ended list lead-ins). This addresses meaningless first units
seen in several source-echo paragraphs; cache identity is `semantic-v62`.
Segmenter tests pass, but full-corpus impact is not yet measured.

Added a source-grounded terminology repair for `mobile domain` → `モバイル分野`
when the model emits `移動領域`; unrelated sources are untouched. Glossary
tests (16) and TypeScript validation pass. Full-corpus fallback impact remains
unmeasured until the next benchmark.

The line-level source-integrity pass found 14/15 matched blocks with one
consistent column, no list boundary, and no continuation edge. One block
(`cognitive-psychology-gpt3/b-b4ed26af`) contains four detected list lines and
is marked `review`; it remains a structure-mixing candidate rather than a
model-only failure.

The existing fixed-fixture model isolation report shows direct and
MicroBatchScheduler parity (64 input / 86 output tokens), parity with and
without production protection, and deterministic greedy output. Atomic
author-year citation protection preserves the full citation and the safe
two-chunk split remains coherent. No unrelated hallucinated fact appears in
this isolated sentence, so semicolon splitting and batch mapping are not
supported as its direct cause.

| 項目 | 状態 |
| --- | --- |
| `npm run tauri:build:fast` → `.app` | 日常確認（cached Python） |
| `npm run tauri:build:clean` / `tauri:build` → `.app` + `.dmg` | リリース（clean Python）。CI acceptance は clean |
| PR CI | `.github/workflows/ci.yml`（TS lint/test/build + browser smoke、Rust fmt/clippy/test + Tauri Linux deps、軽量 Python）。MADLAD なし |
| Packaged acceptance | `npm run packaged:e2e`（Layer A+B）+ `release-acceptance.yml` + [docs/RELEASE_ACCEPTANCE.md](./docs/RELEASE_ACCEPTANCE.md) |
| MADLAD 大容量 download | 通常 CI 外（nightly / human acceptance） |
| Developer ID / 公証 | [docs/MACOS_RELEASE.md](./docs/MACOS_RELEASE.md)。`.app` 署名後に DMG。`PAPER_READER_SIGN=1`（clean のみ） |
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
| `npm run release:acceptance` | release 前自動ゲート + packaged E2E（`.app` があるとき）+ 残 manual 手順 |
| `npm run packaged:e2e` | Layer A integration + Layer B UI（実 `.app`） |
| `npm run packaged:e2e:integration` | Layer A only（service-assisted smoke） |
| `npm run packaged:e2e:ui` | Layer B only（Accessibility / System Events） |
| `npm run macos:sign` | Sign `.app` → DMG from signed app → sign DMG + verify |
| `npm run macos:dmg` | Build DMG from existing `.app`（no Tauri rebuild） |
| `npm run test:bundle-python` | Python runtime content-hash cache + stage smoke |
| `npm run tauri:build:fast` | 日常 `.app`（cached Python、未署名） |
| `npm run tauri:build:clean` | リリース `.app` + `.dmg`（clean Python）。`PAPER_READER_SIGN=1` で公証まで |

基盤回帰の例: `importResumeServerReady.test.ts`（100 completed → body read 0）、`dirtyTracking.test.ts`（100 read-only → write 0）、`sectionVirtualization.test.ts`（50+ jump mount bound）、`ftsFreshness.test.ts`。

`verify:browser` は preview/dev サーバ起動前提。workspace 子フォルダ見出し待ちでタイムアウトすることがある（既知フレーク）。CI では build 後に `vite preview` を立てて実行する。

Python PR CI は torch 不要の `tests.test_citation_protect` を実行。`micro_batcher` / `segmenter`（MADLADEngine import）はローカル／nightly（torch あり）向け。
Segmenter v62 full benchmark (same 21-paper, `--limit 8` sample) remained at
48 ordinary-body rows and 14 fallbacks (29.17%). Tiny-unit segmentation tests
improved, but the product metric did not move; treat this layer as plateaued.
## 2026-09-15 checkpoint: attribution rerun

- `scripts/attribute-translation-fallbacks.ts` を現行 `translation-audit.json` に対して再実行し、現行レポート上の ordinary-body fallback 14件を canonical/layout geometry に再結合した。
- 14件すべてが一意に source block と一致し、抽出側で再現可能な状態を確認した。出力は `test-data/real-papers/reports/translation-fallback-attribution.json`（ローカル監査生成物）へ更新。
- これはモデル改善を意味しない。次の作業は各行の `attribution` と manual review を現行14件へ同期し、A/E/D の帰属を確定したうえで、救済可能な一般化経路だけを候補比較する。
- 現時点で production translation server / benchmark process は停止済み。`.app` build は未実施。

## 2026-09-15 checkpoint: whole-unit rescue retry

- `madlad_mps.py` の最終 paragraph 品質検査で失敗した場合、既存の構文依存 `rescue_units_for_translation()` を whole-unit レベルでも一度だけ再試行する経路を追加。
- per-chunk は通過して join 後に科学トークンや協調節が欠落するケースを救済対象にした。品質ゲート自体は緩和していないため、再試行結果も失敗すれば従来どおり原文 fallback。
- `py_compile`、TypeScript 型チェック、citation protection 26テスト、差分チェックに成功。実モデルでの fallback 率改善は未測定で、次回サーバー起動時に focused benchmark を実行する。
- サーバーを v63 で起動し `power-over-skin` の実ブロックを再送したところ、`TQP3M9009` が `RFTQP3M9009` に変形する既存症状は再現した。これは per-chunk 通過後の join/whole-unit 品質失敗に該当するため、rescue 経路の実測改善はまだ確認できていない。

## 2026-09-15 checkpoint: identifier repair audit (not shipped)

- 技術識別子の source-grounded 復元を実モデルで試験したが、長文では識別子が戻っても内容の省略・置換が残った。fallback 率だけを下げる unsafe false accept になるため、本番経路には採用せず、実装と cache version は semantic-v63 に戻した。
- 固定短文では `TQP3M9009` の付着が解消した一方、実ブロックでは原文にない伝送器・実験結果への置換が再現。今後は識別子修復単独ではなく、意味欠落を検出できる候補評価を先に設計する。

## 2026-09-15 checkpoint: concessive rescue coverage (v64)

- rescue segmentation が文頭 `Although ... , it ...` を対象外にしていたため、長い譲歩節を2つの意味単位へ分ける条件を拡張。括弧内引用は従来どおり保護し、round-trip は維持。
- `power-over-skin` の274文字節が `Although ...` / `it still ...` の2単位へ分割されることを確認。segmenter 33テスト成功。
- production identifier repair は導入していないため、意味品質を損なう安全側の判断は維持。cache identity は `semantic-v64` に更新。

## 2026-09-15 checkpoint: proactive concessive segmentation (v65)

- 長い `While/Although ... , main clause` を品質失敗後だけでなく通常の segmenter でも分割。括弧・引用内部の区切りは対象外で、source round-trip を維持。
- これにより MADLAD が長文の主節だけを採用する decode を事前に避ける。segmenter 34テスト成功。
- 本番 identifier repair は引き続き未導入。cache identity は `semantic-v65` に更新。
- v65 の `power-over-skin` source/unit/model_input/round-trip を `translation-server/benchmarks/segmenter-v65-concessive.json` に固定。8 unit、`roundTrip=true` で次回の before/after 比較を再現可能にした。
- proactive path 自体の回帰テストを追加し、segmenter テストは35件成功。fixture も proactive model input に再生成した。
- v65 サーバーで分割後の `It still approximates ...` を直接翻訳し、`受信機接地面が電力伝送の大きな制約であるため、この方式は摩耗した送信機の性能に近い。` を得た。分割単位では意味が保たれるが、全段落の安全性判定は別途必要。
- translation-server 全テストを venv で実行し、79件すべて成功（microbatch の意図的 unit fallback テスト出力を含む）。
- フロント側の `quality.test.ts` / `glossary.test.ts` も実行し、75件すべて成功。DOMMatrix の canvas 警告は既存のテスト環境依存で、テスト結果には影響なし。

## 2026-09-15 checkpoint: v65 full sample benchmark

- v65 server で全21 paper / 139 rows / ordinary-body 48 rowsを完走。reader-visible fallback は14/48 = 29.17%で、v62 sampleと同率だった。
- proactive concessive segmentation は分割品質を改善するが、現行サンプルの全体fallback率は下げなかった。ログには `AGMMAGMM` のような技術識別子反復も残るため、quality gate緩和は行わない。
- ベンチマーク結果は `test-data/real-papers/reports/translation-audit.{json,md}` に保存。サーバーは完走後に停止済み。

## 2026-09-15 checkpoint: local model cascade audit

- キャッシュ済み `Helsinki-NLP/opus-mt-en-jap` を残存 ordinary fallback 8件へ audit-only で比較。長文で大幅な短縮・不自然な語列・反復が発生し、現行MADLADの代替として安全に採用できないことを確認。
- したがってモデル切替による fallback 率改善は保留し、現行の原文 fallback 安全策を維持する。比較結果は `test-data/real-papers/reports/model-cascade-v65-opus-enja-ordinary.json`。
- `facebook/m2m100_418M` も同じ8件で比較完了。数値や引用の変形、機械的な不自然さが残り、代替採用不可と判定。結果は `test-data/real-papers/reports/model-cascade-v65-m2m418-ordinary.json`。
- v65 full sample の ordinary fallback 14件の理由内訳を集計: server source fallback 8、degenerate output 2、scientific invariant欠落（M2W/Machine-to-Wearable、TQP3M9009/dB、不要な1914）3、source negation missing 1。次の優先順位は server/model retry 8件と長文意味欠落の候補評価。

## 2026-09-15 checkpoint: whole-unit beam retry (v66)

- paragraph結合後の品質失敗時に、同一translation unitsを `num_beams=4` で再生成し、既存の品質ゲートを通過した場合だけ採用する再試行を追加。
- 失敗時は従来の rescue segmentation、最終的に原文 fallback。ゲート緩和ではない。
- translation-server全79テスト成功、cache identityを `semantic-v66` に更新。実モデル全体benchmarkは次回実行する。
- v66 全体サンプルを完走したが 21 papers / 139 rows / 48 ordinary-body / 14 fallback = 29.17% で、v65 と同率。beam retry は現行サンプルの fallback を減らさなかったため、常用設定としての効果は未確認。

## 2026-09-15 checkpoint: coverage audit signal

- `scripts/score-translation-coverage.ts` を追加し、v66 report の ordinary-body 40行を audit-only 集計。文数不足（coverage < 0.5）は0、長さ比 <0.28 は0だったが、source invariant の単純保持判定で2行に欠落を検出した。
- これは現行 quality gate が「fallbackでない＝安全」を保証しない証拠。候補スコアはまだ production gate に接続していないため、2行の手動レビューを先に行う。

## 2026-09-15 checkpoint: paused at a clean boundary

- ユーザー指示により、監査・ベンチマークの常駐プロセスを確認して停止。`server.py`、`benchmark-real`、`compare_fallback_model`、coverage/attribution 実行プロセスはいずれも残っていない。
- v66 の現状値は 21 papers / 139 rows / ordinary-body 48 rows / reader-visible fallback 14 rows (29.17%)。目標の5%以下には未到達。
- coverage audit の invariant 欠落候補2件を手動レビュー。`thermal-earring/b-22de2c20` は `14.4uW` の表記差自体は誤警告だが、末尾文の脱落・主語の意味変化があり、severity 3 の unsafe false accept と確定。`thermal-earring/b-01a329cd` は空欄ではなく server source fallback で、正しい安全側fallbackと確定。レビュー記録を `audit-manual-review.json` に追加。
- 次の再開順: (1) 2件の canonical/translation row と reader-visible 状態を確認、(2) coverage 判定を正規化表記対応にする、(3) 空翻訳が fallback として表示されない経路を追跡、(4) 変更後に v66 相当 benchmark とテストを実行。サーバーは検証後必ず停止する。

## 2026-09-15 checkpoint: Phase 1 attribution inventory refreshed

- 現行 v66 report の reader-visible ordinary fallback は14件（objective冒頭の15件はv61時点）。PDF再抽出との一意一致は14/14で、未一致・曖昧一致は0。
- 原因仮説を全件に付与し、内訳は A correct-source/model candidate 9件、D structure mixing candidate 2件、E equation/scientific-layout candidate 3件。G unclassified は0件になった。
- Aの9件は単一column・listなし・continuation兆候なしの provisional-pass sourceで、モデル/品質ゲート再評価を優先する。D/Eは構造・科学記法の切り分けを優先し、翻訳側のブラックリスト追加は行わない。
- 更新済み report: `test-data/real-papers/reports/translation-fallback-attribution.json`。次は A 9件の translation-unit/debug evidence と D/E 5件の geometry evidenceを確認し、source-integrity と model-quality の分母を分離する。
- A群の内訳も固定: server source fallback 6件、degenerate output 2件、source negation missing 1件。長文（747〜1496文字）の単一column source fallbackが複数あるため、次回は単一長文を直接再現するdebug fixtureを作り、segmenter/chunk境界とdecode失敗を分離する。

## 2026-09-15 checkpoint: clean-source fallback fixtures

- A群の代表3件（thermal-earring、cognitive-psychology-gpt3、linguistics-language-model-physics）をPDF非依存の固定fixture `translation-server/benchmarks/translation-unit-fallback-fixtures-v66.json` に追加。
- fixtureは実際のfallback source、必須科学トークン、round-trip、極端な短片禁止を定義。`test_segmenter.py` に読み込みテストを追加し、segmenterテスト36件が成功。
- これはモデル出力を改善したものではなく、PDF抽出を完全に外した再現基盤。次は同一fixtureをMADLAD direct / production translation pathへ流し、server source fallbackとdecode失敗を分離する。

## 2026-09-15 checkpoint: direct MADLAD fixture diagnosis

- 同一process・同一MADLAD v66で3つのclean-source fixtureを直接実行し、結果を `translation-server/benchmarks/translation-unit-fallback-direct-v66.json` に保存。
- `thermal-earring-b-01a329cd` と `linguistics-language-model-physics-b-30cd3318` はPDFを介さず `degenerate translation output` を再現。これは抽出だけでは説明できないモデル/品質経路の失敗。
- `cognitive-psychology-gpt3-b-9c57b65a` は例外なく返ったが、出力中に不自然な `GPT。GPT-3` の分断が発生。現行degenerate gateだけではsemantic errorを捕捉できない具体例になった。
- direct診断後のモデルプロセスは終了済み。次回は fixture の各条件（raw/protected/atomic、whole sentence/safe split）を同一形式で記録し、production retryで救済可能かを比較する。fallback 5%以下は未達。
- 全translation-server unittestを再実行し、80件成功。新fixture診断はproduction挙動を変更せず、再現と回帰検証だけを追加している。

## 2026-09-15 checkpoint: per-unit failure instrumentation

- `_translate_chunks` のbatch経路・逐次経路で、`TRANSLATION_UNIT_DEBUG=1` 時に失敗unitのindex、chars、words、reason、sourceを `[TRANSLATION_UNIT_FAILURE]` として記録するようにした。通常実行ではログ量を増やさない。
- これにより「一つのchunk失敗→段落全体fallback」昇格を、実際の入力単位で追跡できる。translation-server全テスト82件が成功。
- 次回はこのdebugをA群fixture/production benchmarkで有効化し、失敗unitが長文の一部か、構造混在かを集計する。

## 2026-09-15 checkpoint: debug capture of paragraph escalation

- `TRANSLATION_UNIT_DEBUG=1` のproduction serverへthermal fixtureを投入し、実ログを採取。3 units中、index 0（253 chars / 38 words）が失敗し、`[TRANSLATION_UNIT_FAILURE]` を出力した。
- 最初のdecodeとbeam retryは短い結論へ圧縮され、rescueの最初のunitも `implausibly_short`。この1 unit失敗が段落全体のsource fallbackへ昇格することを確認。
- 診断記録を `translation-server/benchmarks/translation-unit-debug-thermal-v68.md` と response JSONへ保存。サーバー停止済み。

## 2026-09-15 checkpoint: manual safety metric

- `audit-manual-review.json` のレビュー済み16件を集計し、reader-visible fallbackでないのに severity >=2 の誤訳が4件。暫定 unsafe false-accept rate は 4/16 = 25.0%。これはfallback率とは別の指標で、現状を研究用途へ出すには高すぎる。
- 該当は semantic_shift/omission が中心（cognitive-psychology、dont-mind-me、marketing-consumer-response、thermal-earring）。quality gateの形式チェックだけでは意味破綻を十分に捕捉できていない証拠として記録し、ゲート緩和は行わない。

## 2026-09-15 checkpoint: orphaned identifier-prefix guard

- `GPT。GPT-3` のように、日本語文末へsource identifierの接頭辞だけが残るdecode異常を、特定語blacklistではなく「出力末尾tokenがsourceのhyphenated identifierのprefixか」という一般条件で検出する品質ガードを追加。
- `test_madlad_quality.py` に回帰テストを追加。quality/segmenter対象48件は成功。既存の安全側fallback方針は維持し、通常の完全な固有名詞は対象外。
- 次回はこのガードをfixture direct診断に適用した場合の分類（unsafe accept→fallback増加か、再試行で救済可能か）を測定し、全corpusで絶対fallback改善があるか確認する。

## 2026-09-15 checkpoint: v67 full-corpus guard benchmark

- orphaned identifier-prefix guardを含むサーバーで全21論文・139 rowsを完走。ordinary-body 48 rows、reader-visible fallback 14 rows = 29.17%で、v66から改善なし。
- fallback理由は source fallback 8、degenerate 2、invariant/negation系4。ガードは安全性検出を強化したが、現行サンプルのfallback率を下げなかった。
- benchmark結果は `test-data/real-papers/reports/translation-audit.{json,md}` に更新。サーバーは停止済み。
- 次の優先順位は、短いchunk拒否で全体fallbackになるA群の再セグメント/再結合評価と、D/E構造候補のsource-integrity実測。品質ガードを緩める方向へは進めない。

## 2026-09-15 checkpoint: medium concessive units kept intact

- direct診断でthermal-earringの253文字 `While ... , directly ...` が5単位へ分割され、短い単位の拒否で全体fallbackになることを確認したため、proactive concessive splitを260文字以上へ限定。274文字の長い `Although` rescueは維持し、253文字の通常文は1 unitのままにした。
- `test_segmenter.py` に中長さWhile文の不分割回帰を追加。segmenter/quality 49件が成功。
- これはfallback削減を狙った入力境界変更で、全corpus効果は未測定。次回は同じMADLAD fixture directまたはfull benchmarkで、5→1 unit化がdegenerate率を下げるか確認する。

## 2026-09-15 checkpoint: v67 thermal direct recheck

- 閾値変更後のthermal fixtureは5 unitから3 unitへ減少したが、MADLAD直呼び出しは依然 `degenerate translation output`。`耳の温度から体温を直接推定するには…`（source unitが長い主張を短い結論へ圧縮）が `implausibly_short` で拒否され、beamと2-unit rescue後も失敗した。
- よって、単純なproactive split抑制だけではこのケースを救済できない。品質ゲート緩和は行わず、次は「長文source unitを意味境界で分割して各主張を保つ」方向を、実測結果とともに再設計する。

## 2026-09-15 checkpoint: thermal production recheck after v68 boundary change

- thermal-earringだけをproduction server経由で再実行。ordinary-body 2件中1件がfallback（1/2）で、対象fallback `b-01a329cd` は従来どおり server source fallback。`b-22de2c20` はacceptのまま。
- 変更で既存のaccepted blockを悪化させた証拠はないが、論文単位のfallback率は改善していない。結果は `translation-audit-thermal-earring.{json,md}` に保存。
- サーバー停止済み。全体v68 benchmarkは未実行のため、次回変更前後の全体比較が必要。

## 2026-09-15 checkpoint: v68 full benchmark after boundary change

- v68境界変更（medium concessive split抑制）を含む全21論文・139 rowsで再測定。ordinary-body 48 rows、fallback 14 rows = 29.17%で、v67/v66から変化なし。
- 変更はthermalの既存accepted blockを壊していないが、残存source fallback/decode failureを減らさなかった。次は単位ごとの品質結果を保持して、長文の一部失敗が段落全体fallbackになる経路を定量化する。
- ベンチマーク完走後のサーバー停止を確認済み。目標5%以下は未達。

## 2026-09-15 checkpoint: v75 benchmark paused at checkpoint

- v75の全体ベンチマークを再開したが、最初の論文（interactive-jewellery）の8 translation unitsを処理してチェックポイントを保存した時点で停止した。
- 現在の保存済みレポートは1論文・8 rows、ordinary-body 5 rows、reader-visible fallback 1 row（20%）。これは全体指標ではなく、途中経過として扱う。
- 実験用translation-serverとベンチマークプロセスは停止済み。次回は保存済みチェックポイントから再開できる。
- 停止前後に `src/test/quality.test.ts` を再実行し、60/60 tests passed。品質ゲート変更の既存回帰は確認されていない。
- 保存済みv69 attributionを再集計すると14件は D=2（構造混在）、A=9（完全な本文に対するモデル品質）、E=3（科学記号・レイアウト混入）。7件が1000文字以上、3件が500文字未満で、長文だけに限定されない。次の実装判断はこの内訳を基準にする。
- 回帰確認：`npm run test:extraction-corpus` は2 files / 40 tests passed、translation-server unittestは83 tests OK。抽出・サーバーの既存回帰は発生していない。
- 残存failureの優先キューを `TRANSLATION_FAILURE_TRIAGE.md` に追加。A/D/Eを混ぜず、次回は各群の入力単位・出力・品質理由を比較する。
- ページ境界・段組の回帰も確認：`src/test/readingOrder/readingOrder.test.ts` は27/27 tests passed。既存の明確なcontinuation stitchを維持できている。
- A分類の認知心理学代表論文を4-unit診断で再測定中、PDF抽出が長時間化したため中断。サーバーログには通常の短いunitsは訳せる一方、`implausibly_short` でbeam retryに入るunitと、統計・固有名詞周辺の不自然な出力が確認できた。測定は完了扱いにせず、サーバーは終了済み。
- 次回A分類はPDF抽出を再実行せず、`translation-server/benchmarks/translation-unit-fallback-fixtures-v66.json` の固定sourceを使う。whole-unit / safe-clause / protection条件ごとにmodel input・output・token数・quality reasonsを保存し、`translation-unit-diagnosis-v76.json` として比較する。
- バッチ安全性を強化：`translateBatch` が入力件数と異なる結果配列を返した場合、静かにindex割当せず明示的に失敗するガードを追加。型チェック（`npx tsc --noEmit`）passed。
- バッチ件数不一致ガードの回帰テストを追加（`src/test/madladEngine.test.ts`、1/1 passed）。
- 品質・バッチ回帰を統合実行：2 files / 61 tests passed。
- PDF抽出を介さないA分類一括診断スクリプト `translation-server/scripts/diagnose_fallback_fixtures.py` を追加。固定fixtureのsegmenter unitsとmodel inputsを保存し、次回の同一モデル比較を再現可能にした。py_compileとTypeScript型チェックpassed。
- v76 fixture診断を実行し `translation-server/benchmarks/translation-unit-diagnosis-v76.json` を生成。3 cases中、cognitiveは4 unitsで完了（ただし出力にGPT-3境界の不自然さあり）、thermalは3 units、linguisticsは3 unitsがいずれも`degenerate translation output`でfallback。PDF抽出を外してもA群の失敗が再現するため、少なくとも一部はモデル/単位品質層に帰属できる。この成果物は原因帰属用であり、最新完全ベンチマークの14/48（29.17%）を改善したものではない。診断後のサーバー・ベンチマークプロセスは停止済み。
- 固定fixture 3件のsegmenter round-tripを回帰テスト化し、segmenter suiteは39件すべて成功。fixtureの単位分割がsourceの語・句読点を改変していないことを継続検証できる。
- 翻訳サーバー全体のPython回帰も再実行し、`unittest discover` は84件すべて成功。fixture追加による既存segmenter・citation・quality・microbatch回帰は確認されていない。
- クライアント側の品質・バッチ回帰（61 tests）とTypeScript型チェックも再実行して成功。現在の品質ゲートとbatch件数不一致ガードは維持されている。
- `scripts/validate-fallback-attribution.py` を追加し、現行14件の帰属レポートに必須証拠フィールドが揃うことと、分類が A=9 / D=2 / E=3 であることを検証。次回の手動レビュー・実験で古い件数や未分類を混入させない。
- 帰属14件のsource-integrity内訳を再集計し、`provisional-pass` 13件 / `review` 1件、全件が単一ページのparagraph nodeであることを確認。これは現行fallback集合の証拠であり、全corpusの抽出品質を代表するとは扱わない。
- 原因・integrity・fallback理由の集計を `translation-fallback-attribution-summary-v77.json` として保存し、`npm run audit:summarize-fallback-attribution` で再生成可能にした。手動レビュー必須フラグと14/48の製品指標も明示している。
- この検証を `npm run audit:validate-fallback-attribution` として定常実行できるよう package script に登録し、実行成功を確認。
- 監査検証を強化し、14件のうちdiagnosticsが空の行を警告として可視化。分類の存在だけでは手動レビュー証拠が十分とはみなさない状態にした（現行14件すべてに警告、未分類はなし）。
- 既存の抽出matchから14件のderived diagnostics（match/line数、column、page、bbox）を補完し、`npm run audit:validate-fallback-attribution` の空欄警告を解消。各行は引き続き `manualReviewRequired=true` で、人手レビュー済みとは扱わない。
### Checkpoint: extraction corpus command repaired

- `npm run test:extraction-corpus` was previously wired to the main Vitest config, whose exclude rules caused the real-paper files to be skipped. The new `vitest.extraction.config.ts` makes the command execute both real-paper suites.
- Corrected three stale fixture expectations using cached PDF evidence: Interactive Jewellery token order is cross-page (no page restriction), the neuroscience sample is single-column on page 1, and the economics sample is multi-column on page 14.
- Validation: 2 test files, 40 tests passed.
- Translation-server regression also passes with the project environment: `PYTHONPATH=translation-server translation-server/.venv/bin/python -m unittest discover -s translation-server/tests -p 'test_*.py'` → 82 tests OK. The system Python lacks torch and is not the supported runner.
- Re-ran fallback attribution after the harness checkpoint: 14/14 ordinary fallback rows matched uniquely; attribution remains A=9, D=2, E=3, unmatched=0. No model or gate change was made in this step.
- Generated `test-data/real-papers/reports/translation-fallback-analysis-v69.json` as the next diagnostic artifact. It records all 14 ordinary fallback sources, page spans, lengths, warnings, quality reasons, and attribution; 7/14 are 1000+ characters and all 14 are post-model decisions in the current report. This confirms the next experiment should target long-unit/model adequacy while keeping D/E structure cases separate.
- Baseline TypeScript quality/glossary suites rechecked: 75 tests passed. No new algorithm change was made; this is the comparison baseline for the upcoming long-unit translation experiment.
- v69 fixed-fixture direct diagnosis completed for the author-year citation sentence. With the same MADLAD process/model, A/B/D/E/F all produced the same stable Japanese output; C (unprotected) also completed with citation transliteration, and G (safe two-unit split) preserved meaning. No hallucination or microbatch mismatch appeared. This rejects citation splitting and microbatch mapping as the cause for this sentence; the remaining quality issue is adequacy of the model's wording ("mobile domain" rendered as "移動領域"). Results are stored in `translation-server/benchmarks/translation-fixture-diagnosis.json`.
- Existing local MLX INT8 alternative was load-tested and benchmarked without switching production. It loads successfully, but the representative long `intro` output omits multiple source claims and the title output is truncated; therefore it is not a safe replacement yet. Raw run is `/tmp/madlad-mlx-int8-bench.json`.
- MLX segmented comparison exposed a general boundary bug: `In line with van Dijk et al. [8] ...` was split after `et al.`, and the isolated `[8]` unit triggered hallucinated output. Updated `_is_abbreviation` to recognize the two-token `et al.` abbreviation; added a regression test. Segmenter tests now pass 38/38. This is a source-unit fix, not a blacklist or model change.
- Re-ran the full translation-server suite after the `et al.` boundary fix: **83 tests passed**. No server process was left running.
- Direct segmenter verification now keeps `In line with van Dijk et al. [8] ...` as one unit with round-trip integrity (`units=1`, `round_trip=True`), confirming the isolated citation fragment is removed before model submission.
- Bumped the shared pipeline cache identity from `3b-mt-v5-semantic-v66` to `3b-mt-v5-semantic-v67` after the `et al.` segmentation change. Server segmenter tests (38) and TypeScript typecheck pass, preventing stale v66 translations from being silently reused.
- v70 direct MPS run confirms the fix reaches production MADLAD input: `et al. [8]` remains inside one 164-character unit, protected only at model encoding, and output contains no isolated citation hallucination. Server reported `3b-mt-v5-semantic-v67`; process exited after the single run.
- v71 direct MPS recheck of the 245-character `significant-other` A-group fallback now completes as one chunk (66→73 tokens) with a non-degenerate Japanese result under v67. This suggests at least one former transient/model-path failure is recoverable after the pipeline-version/segmentation update, but it is not yet a corpus fallback measurement. Saved as `translation-server/benchmarks/translation-unit-direct-significant-v71.json`.
- v71 HTTP production-path recheck of the same block returned 200 with the same 1-chunk, 66→73-token result and model version v67. This confirms client-facing server/MicroBatch path does not reproduce that former fallback. Server was explicitly shut down after the request.
- v72 full 21-paper benchmark under v67 completed (139 rows; 48 ordinary; 14 reader-visible fallbacks = 29.17%, unchanged from v68). The same `significant-other` block that succeeds in an isolated HTTP request still appears as a fallback in the concurrent corpus run, so next investigation must compare request scheduling/batch context and not assume the isolated result generalizes. Server was stopped after completion.
- v73 concurrency reproduction: the same `significant-other` HTTP request returned byte-identical 73-token output in 3 sequential and 4 concurrent requests. Thus simple request concurrency does not reproduce that row's fallback; the benchmark discrepancy is likely in block selection/cache/report timing or a different generation context, and should not be “fixed” by disabling concurrency.
- Added `--serial` to `benchmark-real-paper-translation.ts` so future corpus comparisons can run the same sampled blocks sequentially or concurrently. TypeScript typecheck passes; this is diagnostic-only and does not alter production scheduling.
- Targeted significant-other serial vs concurrent audit (8 samples each) produced identical 3 fallback rows in both modes. The former 245-character block's server output was valid, but the client audit quality gate labeled it `degenerate output` due its phrase-repetition heuristic; a provisional relaxation was rejected by the existing phrase-loop regression test and reverted. This is a confirmed quality-gate false-reject candidate requiring a more discriminating detector, not a gate loosening.
- Added a narrow, source-length-gated quality adjustment: a single coherent sentence flagged only by phrase repetition may pass when the source is at least 180 characters; multi-sentence loops and short byte/garbage outputs remain rejected. Added regression coverage; quality suite is 60/60. Client cache identity is now `3b-mt-v5-semantic-v67-quality-v1` so prior gate decisions are not reused.
- Targeted production benchmark after that gate change: `significant-other` 8 sampled units produced 4 ordinary-body rows and 2 ordinary fallbacks; the former 245-character `b-bb2064ca` is now accepted with the same source-grounded output. The remaining fallbacks are separate rows, so this is a local improvement only; full corpus must be remeasured before claiming a rate change.
