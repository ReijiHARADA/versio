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
| Library Backup / Restore | **done** | Settings → データ。write barrier は **active writer drain**（admission 済み in-flight も待機）+ `PRAGMA quick_check`/`integrity_check`。validate → safety → swap → rollback |
| Packaged acceptance | **done** | Layer A integration + Layer B UI E2E（export 実ファイル + relaunch annotation mark 必須）。browser smoke 単体では代替しない |
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
- v77集計に手動レビュー状況も追加。レビュー完了16件、未完了169件、severity 2以上のunsafe false acceptは4件（暫定25%）として、fallback率と混同しない形で保存した。
- v78としてauthor-year citation fixtureのA〜G条件比較を同一MADLAD process/modelで再実行。全条件が完了し、A/B/D/E/Fは同じ出力、Cは引用の自然言語化、Gは安全分割後も意味を維持。異常なhallucinationやmicrobatch対応ずれは再現せず、残る問題は `mobile domain` の「移動領域」という語彙適合性。結果は `translation-server/benchmarks/translation-fixture-diagnosis.json` を更新し、実行後プロセスは終了済み。
- v78後の回帰確認として extraction corpus **40/40**、reading-order **27/27** が成功。既存のPDF構造判定と段組テストに回帰なし。
- v79としてthermal-earringのclean-source A群をwhole-source / semantic-units-joinedで同一MADLADへ比較。両条件とも3 units処理中に最初の253文字unitが`implausibly_short`となり、beam/rescue後も`degenerate translation output`でfallback。分割後に単純結合するだけでは救済されないことを実測し、`translation-unit-variants-v79.json` に保存。
- v79をrescue-units-joinedにも拡張したが、同じ253文字unitの短縮decodeが残り、whole / semantic / rescueの3条件すべてfallback。意味境界分割だけでなく、モデル側の長文主張保持能力を独立評価する必要がある。
- v79診断を `npm run audit:diagnose-a-cohort` として再実行可能にした。診断は固定fixtureのみを使い、productionの翻訳経路やquality gateを変更しない。
- 登録コマンドを実際に再実行し、v79 JSONを再生成。whole / semantic / rescueの3条件で同じfallbackが再現し、コマンド終了コード0とプロセス終了を確認。
- v79診断スクリプト追加後の `npm run lint` も終了コード0。既存warningのみで、新規errorはない。
- v79診断に `A_COHORT_CASE=<fixture-id>` 選択を追加し、thermal以外のA群（cognitive/linguistics）を同じ条件比較へ拡張できるようにした。fixture selectorの入力検証とPython compileは成功。
- linguistics fixtureを実行し、whole / semantic / rescue（rescueが存在する場合）の各variantで、`BERT`を含む最初のunitが短縮decodeとなりfallback。途中でrescue unitが空の場合に空入力を送る診断バグも修正し、再実行結果をv79 JSONへ保存。
- 修正版v79では空rescue variantを除外し、linguisticsの有効な2条件（whole / semantic）のみを記録。どちらも`implausibly_short`でfallbackとなり、空入力による偽の成功行は残っていない。
- cognitive fixtureをv79で実行した結果、whole / semanticの両条件が同一出力（180入力 / 230出力token）で完了したが、source末尾の「AとBは個別に…CとDは…」条件が欠落。現行gateが通す明確なsemantic omissionの再現例であり、fallback削減ではなくcontent-coverage評価が必要な証拠になった。結果は同じv79 JSONへ保存。
- cognitive fixtureの期待値に、単語保持だけでなく関係保持（A/Bの個別危険性、C/Dの非危険性）を`mustKeepRelations`として追加。これは検出器の実装ではなく、semantic coverage評価用のground truth。
- v79診断出力へfixture期待値を併記する変更を加え、Python compileで構文を検証。次回実行から各variantとground truthを同一JSONで比較できる。
- 診断成功行にrequired token / relation token presenceのaudit-only coverage結果を追加。semantic omission校正に使えるが、単語共起だけでは意味正確性を証明しないためproduction gateへは投入しない。
- cognitive fixtureを再実行し、coverage結果を生成。whole / semantic両条件でA/B/C/Dは存在、`GPT-3`はUnicodeハイフン化により単純一致がfalseとなった。これはnormalizationが必要な監査上の所見であり、関係共起だけでは末尾条件の意味省略を検出できないことも確認できる。
- segmenter fixture testで`mustKeepRelations`の構造とsource内存在を検証し、39件すべて成功。関係ground truthの破損を回帰時に検知できる。
- ground truth追加後もtranslation-server全体 **84/84** tests成功、対象ファイルのdiff check成功。
- 既存 `score-translation-coverage.ts` を再実行したが、入力 `translation-audit.json` は旧5-row reportのため、coverage summaryも5行のみ（lowSentenceCoverage=0等）。これは現行14/48 corpus指標やv79 omissionを評価する証拠として不十分であり、次回v79相当full report生成後に再計測する。
- coverage scriptに`TRANSLATION_AUDIT_INPUT`環境変数を追加し、任意のreportを明示指定できるようにした。旧形式reportでは`sourceCategory`がないため0行になることも確認し、形式差を隠さず次回の集約処理課題として残す。
- 旧形式report向けのparagraph/sourceFallback fallback分類を追加。cognitive reportで5行を抽出でき、invariantLoss=1を検出した（ただし現行full reportではないため製品指標には使用しない）。
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

### Checkpoint: paused cleanly for handoff

- Requested pause completed on 2026-09-15. The active variant diagnosis had finished; no benchmark or model process remains running.
- One stale bundled translation-server process was found during verification and terminated. It was not part of an active benchmark.
- Resume from the v79 cognitive variant artifact (`translation-server/benchmarks/translation-unit-variants-v79.json`) and the unresolved 14/48 ordinary-body fallback attribution. The current product fallback target (<=5%) is not met; no completion claim is made.
- On resume, attribution validation and summary were rerun successfully: 14 rows, A=9, D=2, E=3, product metric 14/48 (29.17%). This confirms the persisted evidence is internally consistent and the next meaningful step is a general fix for the A-cohort model/source-unit failures, followed by a full-corpus rerun.
- The goal file refers to a historical 15-row queue; the current persisted v77 attribution contains 14 rows because one formerly rejected `significant-other` block became accepted after the v67 segmentation/quality correction. The discrepancy is recorded explicitly rather than inventing a fifteenth classification; the next full-corpus run must reconcile the queue against current block IDs.
- Full 21-paper sequential benchmark completed after model warm-up (139 rows, 48 ordinary-body rows). Current result is 13 reader-visible ordinary fallbacks, **27.08%**, down from the prior 14/48 (29.17%). The benchmark report is `test-data/real-papers/reports/translation-audit.{json,md}`; the local translation server was stopped after completion. This is a baseline resynchronization, not completion of the <=5% target.
- Updated `scripts/summarize-fallback-attribution.py` to intersect persisted attribution with the latest full benchmark's ordinary-body fallback IDs. Historical rows that became healthy no longer inflate the current summary; the refreshed summary reports 13 rows and A=8, D=2, E=3 while retaining the original attribution evidence.
- Updated `scripts/validate-fallback-attribution.py` to report the current benchmark count and explicitly warn about stale historical attribution rows. It now reports 13 current ordinary fallbacks and identifies only `significant-other/b-bb2064ca` as historical.
- Added a retry-only conservative rescue for exceptionally long (300+ character) units at a top-level comma when both resulting clauses are substantial and delimiter-balanced. It preserves exact source slices, adds sentence closure only to model inputs, and runs after all existing semantic rescue strategies. Added a round-trip regression test; translation-server tests now pass **85/85**. Production cache/model identity advanced to `semantic-v68` so prior translations are not silently reused.
- Targeted v68 model benchmark completed for the three A-cohort papers: thermal-earring **1/2**, linguistics-language-model-physics **2/3**, neuroscience-rule-following **1/5** ordinary-body fallbacks. The new comma rescue did not reduce these targeted rates, so it is retained as a safe retry capability but is not counted as an improvement. Reports are `translation-audit-{thermal-earring,linguistics-language-model-physics,neuroscience-rule-following}.{json,md}`; server stopped afterward.
- Added v69 candidate selection for long units: after a valid greedy result, units of 300+ characters receive a deterministic beam candidate; a conservative tie-breaker rewards preserved numeric/scientific tokens and penalizes severe length collapse, while rejected candidates remain rejected. This is a candidate ranking layer, not a gate relaxation. Translation-server tests remain **85/85** and TypeScript typecheck passes. Full-corpus effect is not yet measured.
- v69 targeted validation on `thermal-earring` completed with the same ordinary-body result as v68: **1/2 fallback**. The failing block remains `b-01a329cd` (`server returned source fallback`), so candidate ranking has not yet demonstrated a reduction. The server was stopped after the run; do not count this as a corpus improvement.
- Added a regression test for candidate scoring: a candidate retaining GPT-3, 92.4%, and p < 0.001 outranks a fluent candidate that omits them. Translation-server tests now pass **86/86**. This validates the scorer's intended safety ordering; it does not establish semantic correctness or a lower corpus fallback rate.
- Tightened candidate scientific-token extraction so generic prose words beginning with `p`, `F`, or `t` are not mistakenly treated as protected evidence. The scorer now recognizes numbers, p-values, F/T statistics, BERT, and GPT identifiers only; the 86-test suite remains green.
- Expanded long-unit candidate generation threshold from 300 to 220 characters (v70). This targets the remaining 220–280 character A-cohort failures while preserving the same candidate validity and token-retention checks. Tests pass; targeted model benchmark is still pending, so no fallback improvement is claimed yet.
- v70 targeted model benchmark completed for thermal-earring and linguistics-language-model-physics. Results were unchanged from v69: thermal **1/2**, linguistics **2/3** ordinary-body fallbacks. The 220-character expansion is therefore retained only as a safe capability, with no measured reduction; server stopped afterward.
- Reverted the ineffective 220-character candidate threshold after the targeted plateau check; v71 restores the 300-character scope that produced the one verified corpus recovery, avoiding unnecessary beam generation for shorter units. Regression tests and typecheck remain green.
- Full v69 sequential benchmark completed after model warm-up: 21 papers / 139 rows, 48 ordinary-body rows, **12 fallbacks (25.00%)**. This is an improvement from the v68 baseline 13/48 (27.08%); the report is `test-data/real-papers/reports/translation-audit.{json,md}` and the server was stopped afterward. The <=5% target remains unmet.
- Comparing v69 IDs with the v68 baseline shows the recovered block is `neuroscience-rule-following/b-026d207e`; the remaining 12 IDs are unchanged. This is the first corpus-level evidence that long-unit candidate ranking can recover a real block, although the absolute reduction is only 2.08 percentage points.
- 2026-09-15 E-cohort follow-up: inspected the three current scientific/layout fallback sources through `protect_citations()`. Protection runs before model input and correctly creates placeholders for identifiers such as `TQP3M9009`, `M2W`, `Machine-to-Wearable`, `dB`, figures, and author/title spans; no citation-only fragment was observed at this boundary. The persisted E reasons (missing/unexpected invariants) therefore cannot yet be attributed to semicolon segmentation or placeholder creation alone. No production code was changed in this checkpoint; next step is to capture the exact post-decode/restore output for these rows and compare it with the client `invariantQuality()` result before changing the gate. Translation server and benchmark processes are stopped.
- 2026-09-15 E-cohort output evidence: existing audit reports preserve the post-restore model outputs. `power-over-skin` emits `RFTQP3M9009` after the protected `TQP3M9009` span, and `step-to-charge` concatenates `Machine-to-WearableM2W`; `dont-mind-me` introduces `1914` although the source says only “Prior to World War I”. These are decode/post-restore safety failures, not gate-only false rejects. The current invariant gate correctly falls back instead of displaying them. No blacklist or gate relaxation was added. This checkpoint is complete with all model/benchmark processes stopped; next work should compare raw decoded placeholder text and restored text if a general restoration repair is attempted.
- 2026-09-15 diagnostic instrumentation: with `TRANSLATION_UNIT_DEBUG=1`, MADLAD now emits separate `[TRANSLATION_DECODE]` (protected input, raw decoded output, citation map) and `[TRANSLATION_RESTORED]` records before quality validation. This is opt-in and does not change production translation or acceptance behavior. Python translation-server regression suite remains **86/86 OK**. No server process is running after verification.
- 2026-09-15 audit resynchronization: `audit:validate-fallback-attribution` validates 14 historical rows (A=9, D=2, E=3), while the latest full benchmark currently intersects to 12 ordinary-body fallbacks out of 48 (25.00%). Two persisted rows are stale because they recovered in later runs (`neuroscience-rule-following/b-026d207e`, `significant-other/b-bb2064ca`). The refreshed summary now reports current causes A=7, D=2, E=3 and keeps the historical evidence without counting it in the product metric. The goal file's 15/74 figure is therefore a historical target baseline; it must be reconciled against a future full corpus run before completion claims.
- 2026-09-15 fixed-fixture smoke run: started the current server, confirmed startup model `3b-mt-v5-semantic-v71`, and sent the exact 184-character author-year citation sentence directly to `/translate`. The response was a 109-character Japanese translation preserving the full citation group and “mobile domain”; no hallucinated 100mm/consumer terms appeared. This single direct run is evidence that the sentence can decode correctly under the current model, but it does not explain the earlier PDF-row failures. The server was terminated immediately after the request; no translation process remains.
- 2026-09-15 raw decode capture completed for the fixed citation sentence. Debug output shows the atomic citation placeholder `ZZCIT1ZZ` in the model input; MADLAD raw output uses fullwidth `ＺＺＣＩＴ１ＺＺ`, and `restore_citations()` restores the exact author-year group in the final Japanese output. Therefore this control case is clean at both decode and restore layers. The earlier malformed scientific identifiers remain fixture-specific decode failures, not a universal placeholder-restoration defect. Server stopped with Ctrl-C after the capture.
- 2026-09-15 decisive E-cohort capture: `power-over-skin` raw decode preserved neither placeholder in the final unit (`raw='この信号を…27.36ｄＢ…'`), while the protected input contained placeholders for `RF` and `TQP3M9009`. `restore_citations()` then appended missing citations at the end, producing `…。RFTQP3M9009`. This identifies the malformed identifier as a post-decode restoration artifact caused by dropped placeholders, not a hallucinated source token and not semicolon segmentation. The existing invariant gate correctly rejects it; changing append behavior to accept the output would be unsafe. The capture is complete and the server was stopped after the request.
- 2026-09-15 safety fix: added `reject_missing` to `restore_citations()` and enabled it for single and microbatch MADLAD paths. If the model drops a protected scientific/citation placeholder, the request now fails before malformed end-appending (for example `RFTQP3M9009`) can reach downstream quality/UI layers. The default API remains backward compatible for existing callers. Added a regression test; translation-server suite is **87/87 OK** and diff check passes. This deliberately does not reduce fallback rate yet; it removes unsafe malformed intermediate output while preserving fallback safety. No server process is running.
- 2026-09-15 cache identity: bumped server/client translation identity to `3b-mt-v5-semantic-v71-strict-restore-v1` because strict placeholder-drop rejection changes translation behavior and must not reuse cached malformed results. Python tests **87/87** and TypeScript typecheck pass. No server process is running.
- 2026-09-15 post-change verification: client quality/madlad tests **61/61** pass, TypeScript typecheck passes, lint exits 0 with existing warnings, and Python translation-server tests remain **87/87**. The strict restore change and cache identity bump introduce no observed regression. Server process is stopped.
- 2026-09-15 reproducibility artifact: saved the captured `power-over-skin` protected input, citation map, raw decode, and legacy malformed restoration as `translation-server/benchmarks/translation-scientific-placeholder-debug-v72.json`. It records the expected strict behavior (`reject_missing`) without storing any new PDF content. This enables deterministic regression checks for the restoration bug. No server process is running.
- 2026-09-15 strict-restore regression coverage expanded: added a fullwidth-placeholder acceptance test alongside the dropped-placeholder rejection test. Citation protection tests now pass **28/28**; this covers the actual MADLAD glyph normalization path while ensuring missing scientific spans fail closed. No server process is running.
- 2026-09-15 runtime verification of strict restore: the full `power-over-skin` 1062-character request now returns `source` unchanged with `model_version=3b-mt-v5-semantic-v71-strict-restore-v1`, `input_tokens=0`, and `output_tokens=0`. Server logs explicitly report `protected citation placeholder dropped by model: RF, TQP3M9009`; no malformed `RFTQP3M9009` is returned. This confirms the safety fix in the real `/translate` + microbatch path. Server stopped after the request.
- 2026-09-15 full regression after strict restore: Vitest **297/297** across 59 files and translation-server Python **88/88** pass. Existing PDF/reading-order/quality coverage remains green; only pre-existing pdfjs canvas warnings appear. No server process is running.
- 2026-09-15 identity consistency check: Python reports `3b-mt-v5-semantic-v71-strict-restore-v1`, matching the TypeScript `MADLAD_MODEL_VERSION` exactly. No translation server process remains.
- 2026-09-15 alternative-model check: evaluated cached free `Helsinki-NLP/opus-mt-en-jap` on the 7 current ordinary-body source-fallback rows using `compare_fallback_model.py`. All seven outputs were severely truncated or nonsensical (38–116 output tokens for 149–485-token inputs, fragmented Japanese and repeated/incorrect content). It is not a production candidate; no model switch was made. Raw results are in `translation-server/benchmarks/model-cascade-opus-v72.json`; the process exited normally.
- 2026-09-15 alternative-model comparison: evaluated cached free `facebook/m2m100_1.2B` on all 7 current ordinary-body source-fallback rows. Outputs were longer than opus-mt but still showed clear semantic drift, repetition, mistranslated technical terms, and truncation to the 256-token generation cap (for example the 485-token cognitive row produced 257 tokens and omitted content). It is not safe as an automatic cascade without a stronger semantic validator. Results are in `translation-server/benchmarks/model-cascade-m2m100-1.2b-v72.json`; process completed and no server remains.
- 2026-09-15 fixed-fixture protection follow-up: ran the cognitive-psychology GPT-3 fixture in one MADLAD process with direct whole-source and per-semantic-unit inputs. The unprotected whole input completed but omitted the final pill-safety clause; the current protected path also omitted it, so this omission is model adequacy (not citation splitting). Strict restoration exposed dropped protected spans (`GPT` and footnote `24`) in individual units and correctly converted those cases to source fallback. This fixture has no author-year group, so atomic author-year protection was not applicable; it must be measured with the OzCHI citation fixture separately. Results are in `translation-server/benchmarks/translation-unit-variants-v79.json`; the diagnostic script is syntax-checked and the model process is stopped.
- 2026-09-15 OzCHI author-year control: direct one-chunk comparison under the same model showed unprotected input transliterates author names/years and changes the citation surface; current protection restores the exact citation group; atomic whole-group protection also preserves the citation at model-input level (the diagnostic custom `ZZREF1ZZ` restore needs fullwidth normalization, while production `ZZCIT` restoration already handles it). All four outputs kept the sentence meaning at a high level and none produced the earlier 100mm/consumer hallucination. This supports retaining atomic author-year protection for citation fidelity, but it does not reduce the A-cohort semantic-omission failure. Results are saved in `translation-server/benchmarks/translation-unit-variants-v79.json`; no process remains running.
- 2026-09-15 strict-restore full-corpus measurement: reran the sequential 21-paper audit under `3b-mt-v5-semantic-v71-strict-restore-v1`. Report contains 19/21 papers (2 PDFs remain uncached), 48 ordinary-body rows, and 16 reader-visible fallbacks (33.33%). This is worse than the prior 12/48 baseline because fail-closed placeholder-drop rejection converts malformed model outputs into explicit fallbacks; it is a safety regression in coverage, not evidence that the old malformed outputs were acceptable. Current fallback reasons include 7 generic server source fallbacks, one degenerate output, one negation loss, and several strict scientific/citation failures. The report was saved to `test-data/real-papers/reports/translation-audit.{json,md}` and the server was stopped. Attribution must be reconciled against this new model-version cohort before changing the gate.
- 2026-09-15 protection precision fix: generic acronym matching no longer extracts the uppercase prefix of hyphenated model identifiers (`GPT-3`) as a separate scientific placeholder. This prevents a standalone `GPT` placeholder from being dropped and unnecessarily triggering strict fallback, while independent identifiers such as `RF`, `BERT`, and alphanumeric method names remain protected. Added a regression test; Python citation tests are **29/29**, full server suite remains green, and `npx tsc --noEmit` passes. Translation identity is `3b-mt-v5-semantic-v71-strict-restore-v2`; full-corpus impact is not yet measured and no server process is running.
- 2026-09-15 targeted v2 check: reran the cognitive-psychology paper after the hyphenated-acronym protection fix. It still had 5 ordinary-body fallbacks across 6 sampled ordinary rows (four server source fallbacks plus one degenerate output); therefore the GPT-3 rule did not produce a measurable paper-level recovery. The change remains safety-oriented and must not be counted as a fallback improvement. Report: `test-data/real-papers/reports/translation-audit-cognitive-psychology-gpt3.{json,md}`. Server stopped after the run.
- 2026-09-15 v2 verification: `git diff --check` passed; full translation-server Python suite **89/89** passed; Python and TypeScript model-version identifiers both resolve to strict-restore-v2; no translation server or diagnostic process is running. The latest targeted benchmark remains 5/6 cognitive ordinary fallbacks, so the <=5% product target is still open.
- 2026-09-15 v2 full-corpus measurement: after the model was fully ready, reran the 21-paper sequential audit under `3b-mt-v5-semantic-v71-strict-restore-v2`. The valid report covers 19/21 cached papers, 139 rows, 48 ordinary-body rows, and **17 fallbacks (35.42%)**, versus 16/48 (33.33%) on the prior v2 run. This small increase is run variance plus strict placeholder rejection; the `GPT-3` acronym rule did not improve the product metric. The server was stopped after completion. Do not claim a quality gain from this change; next step is to classify the 17 current IDs and address the dominant source/model causes rather than adding more acronym exceptions.
- 2026-09-15 fallback attribution resync: matched the latest v2 report's 17 ordinary-body fallback IDs against the persisted inventory. Five new IDs were added provisionally as A/G candidates with source and invariant diagnostics; two historical recovered IDs remain stale for provenance. Validation now reports 19 inventory rows (A=14,D=2,E=3), 17 current. Newly added rows are explicitly `sourceIntegrity=review` and `manualReviewRequired=true`; they are not treated as proven model failures until raw decode evidence is captured.
- 2026-09-15 provisional review of five newly surfaced fallbacks: `dont-mind-me/b-2562a1cf`, `cognitive-psychology-gpt3/b-b4361dd7`, `marketing-consumer-response/b-4019f21f`, `education-learning-analytics/b-25729d7b`, and `neuroscience-rule-following/b-ddf5ca5d` each have coherent ordinary prose, no structural warnings, and ordinary roles. Their attribution is therefore provisionally A (model/decode or server path), with manual review still required; no row was promoted to a proven model failure without raw decode evidence. Attribution validation passes for 19 inventory rows and 17 current IDs.
- 2026-09-15 gate attribution and v4 adjustment: raw debug for `cognitive-psychology-gpt3/b-b4361dd7` showed four coherent translated units and one unit rejected solely as `implausibly_short` (`We, therefore, ... tested GPT-3 ...` → `GPT-3を実際のタスクベースの実験でテストした。`). This is a quality-gate false reject candidate: the output retains the core experimental claim, with no scientific-token loss. `_is_implausibly_short_unit` now uses a 0.21 floor only for 110–179-character prose without qualification conjunctions; sentences containing `because/while/even/...` retain the 0.28 safety floor. Added a regression test, and bumped identity to `strict-restore-v4`. Targeted/full-corpus effect remains to be measured; no server process is running.
- 2026-09-15 v4 targeted result: cognitive-psychology paper rerun after the mid-length gate adjustment. Ordinary-body fallback decreased from 5/6 to **3/6**. The previously gate-rejected `We, therefore ... tested GPT-3 ...` unit is now accepted; remaining failures are two strict/server fallbacks and one genuinely degenerate output. This is a 33 percentage-point paper-level reduction, but not yet a full-corpus product metric. Report: `test-data/real-papers/reports/translation-audit-cognitive-psychology-gpt3.{json,md}`. Server stopped.
- 2026-09-15 v4 full-corpus result: after the mid-length implausibly-short gate adjustment, the ready-model sequential audit covers 19/21 cached papers, 139 rows, 48 ordinary-body rows, and **15 fallbacks (31.25%)**, down from 17/48 (35.42%) under v2. The reduction is consistent with the targeted cognitive recovery and was measured on the same corpus/sample configuration. The server was stopped after completion; the <=5% target remains open.
- 2026-09-15 v4 fallback inventory: latest 15 ordinary fallbacks comprise 13 `server returned source fallback`, 1 `source negation missing`, and 1 `degenerate output`. The 13 server fallbacks span scientific identifiers, citations, and long prose; they require raw decode capture before any gate relaxation. This confirms the next priority is per-row decode attribution, not another global length threshold change.
- 2026-09-15 terminal-reference recovery: raw v4 logs showed MADLAD dropping terminal `(Fig. 8 and Table S3)` while translating the surrounding sentence correctly. `restore_citations()` now recovers missing reference-shaped spans beginning with `(` or `[` immediately before a translated terminal mark; measurements, identifiers, and statistics still fail closed. Added regression coverage; targeted citation/quality tests **44/44** pass. Identity bumped to `strict-restore-v5`; full-corpus effect remains unmeasured and no server process is running.
- 2026-09-15 v5 targeted neuroscience result: reran `neuroscience-rule-following` (5 ordinary rows) after terminal-reference recovery. Fallback decreased to **1/5**, with the remaining `b-9ba3fd27` server fallback caused by a separate protected scientific span; the `(Fig. 8 and Table S3)` row now translates successfully after terminal reference recovery. Report saved at `test-data/real-papers/reports/translation-audit-neuroscience-rule-following.{json,md}`; server stopped.
- 2026-09-15 identifier-drop rescue: added a single conservative retry when strict restore reports only identifier-like missing placeholders. The retry sends the original unit without scientific placeholders; client-side invariant validation remains authoritative, so missing RF/TQP3M9009 or other critical facts still fallback. Other missing citations/statistics do not use this path. Python suite is **91/91** and model identity is now `strict-restore-v6`; full-corpus impact is pending.
- 2026-09-15 v6 targeted power-over-skin result: identifier-drop retry reduced this paper to **1/2 ordinary-body fallback**. The RF/TQP3M9009 block was retried without placeholders, but the client invariant gate rejected the result because `TQP3M9009` and `dB` were still missing; no malformed translation was shown. The other sampled ordinary block translated successfully. This confirms the retry improves recoverability only when all scientific invariants survive, while preserving the safety boundary. Report: `test-data/real-papers/reports/translation-audit-power-over-skin.{json,md}`; server stopped.
- 2026-09-15 v6 targeted step-to-charge result: identifier-drop retry was exercised on a technical paragraph. The row still fell back because `Machine-to-Wearable` was absent after the unprotected retry; client invariant validation correctly rejected it. Ordinary fallback remained **1/2**, so v6 has not yet shown a product-metric reduction beyond recoverable cases. Report: `test-data/real-papers/reports/translation-audit-step-to-charge.{json,md}`; server stopped.
- 2026-09-15 v6 full-corpus result: ran the ready-model sequential 21-paper audit with identifier-drop retry. The report covers 19/21 cached papers, 139 rows, 48 ordinary-body rows, and **12 fallbacks (25.00%)**, down from 15/48 (31.25%) under v5. This is a 3-row / 6.25-point reduction while retaining invariant rejection for missing `Machine-to-Wearable`/`TQP3M9009`; no malformed scientific output was accepted. Server stopped after completion; target <=5% remains open.
- 2026-09-15 v6 attribution reconciliation: synchronized `translation-fallback-attribution.json` with the authoritative v6 full report. The inventory now contains exactly the 12 current ordinary-body fallback rows (A=7, D=2, E=3); seven recovered/stale historical rows were removed from the current inventory. `audit:validate-fallback-attribution` passes with 12 current rows and no stale warning. This is bookkeeping/source-of-truth progress, not a quality improvement. Server and benchmark processes remain stopped.
- 2026-09-15 audit tooling fix: `summarize-fallback-attribution.py` now accepts both historical object-form `sourceIntegrity` values and the current string-form values. The summary regenerates successfully: 12 current fallbacks, source-integrity pass=7/fail=5, causes A=7/D=2/E=3, and 4 reviewed unsafe accepts (severity >=2). This fixes an audit-reporting failure without changing translation behavior; server remains stopped.
- 2026-09-15 audit slice reporting: fixed `summarize-fallback-attribution.py` to derive discipline groups from explicit catalog metadata or majority labels in manual-review records, leaving unannotated papers as `unknown`. Regenerated v77 summary reports current format and discipline slices (cognitive psychology 3/6, linguistics 2/3, marketing 1/3, HCI 0/3); no labels are inferred from paper names. Python compile and diff checks pass; server remains stopped.
- 2026-09-15 audit safety metric: v77 summary now emits `reviewedAcceptedBlocks` and `unsafeFalseAcceptRate` alongside the existing unsafe count. Current manual-review corpus reports 4 severity>=2 false accepts among 93 explicitly accepted reviewed blocks (4.30%); 169 review items remain pending. This metric is review coverage-dependent and is not treated as product-wide quality. No server process is running.
- 2026-09-15 manual-review taxonomy reporting: v77 summary now includes label and severity distributions from `audit-manual-review.json` (labels currently correct=6, minor_wording=6, semantic_shift=4, omission=2, numeric_error=1; 169 unlabeled pending items). This makes the 4.30% unsafe false-accept metric auditable instead of a lone count. No translation behavior changed; server remains stopped.
- 2026-09-15 verification: citation protection unit tests pass 30/30 and audit summary generation passes. A direct unittest discovery from the system Python cannot import torch, so model-dependent suites require the project translation-server environment; this is an environment limitation, not a test regression. No server process is running.
- 2026-09-15 environment verification: reran the complete translation-server unittest suite using the repository `translation-server/.venv` (the system Python lacks torch). **91/91 tests passed**, including microbatch, segmenter, citation protection, and quality paths. Server and model processes remain stopped.
- 2026-09-15 checkpoint verification: `npx tsc --noEmit`, `audit:validate-fallback-attribution`, and `git diff --check` all pass. Current authoritative ordinary fallback remains 12/48 (25.00%), with A=7/D=2/E=3. No translation server process is running.
- 2026-09-15 progress ledger: synchronized `audit-progress.json` with v77 metrics (12/48 fallback, A=7/D=2/E=3, source-integrity pass=7/fail=5, unsafe false-accept review rate 4.30% over 93 accepted reviewed blocks). JSON and diff checks pass; no server process is running.
- 2026-09-15 attribution evidence enrichment: synchronized current fallback rows with report-level `fallbackStage`, model/token counts, quality, structural warnings, and source invariants. All 12 current fallbacks are confirmed `post-model`; v77 summary now exposes this stage distribution instead of inferring it. Validator and diff checks pass; server remains stopped.
- 2026-09-15 clean-source A-cohort rerun: executed `diagnose_fallback_fixtures.py` in `translation-server/.venv` with the current MPS model, bypassing PDF extraction. The 3-fixture artifact `translation-unit-diagnosis-v76.json` was regenerated. Thermal-earring still fails on a short valid sentence after greedy/beam/rescue (`degenerate translation output`), cognitive psychology succeeds only after per-unit rescue with citation `24` preserved, and linguistics succeeds after identifier-drop retry but output remains semantically truncated at the final clause. This confirms remaining A failures are model/decode/quality-path issues independent of PDF extraction. Server/model process exited cleanly after capture.
- 2026-09-15 full client regression: Vitest completed **297/297 tests across 59 files**. PDF extraction, reading-order, translation quality, resume, deletion, and UI suites remain green; only existing pdfjs canvas polyfill warnings appear. No server process is running.
- 2026-09-15 A-cohort conclusion: clean-source fixture evidence now covers short, citation-heavy, and identifier-heavy prose. The dominant remaining A failures are decode-level omission/degeneration; extraction changes cannot address them. Alternative local/free model artifacts (Opus and M2M100) remain unsafe due truncation/drift, so no model replacement was adopted. The next productive experiment is a model-level candidate cascade evaluated against the same fixtures, with strict source-invariant gating retained.
- 2026-09-15 targeted segmenter verification: repository venv `tests.test_segmenter` passes **40/40**, including author-year citation atomicity, decimal/year boundaries, round-trip reconstruction, and continuation handling. No server process is running.
- 2026-09-15 OzCHI controlled variant rerun: `translation-unit-variants-v79.json` compares the same author-year sentence under unprotected, current protection, atomic author-year protection, and current protected unit paths. All four remain one semantic unit; no semicolon split occurs. Unprotected decode transliterates citation years and loses exact token fidelity, while current/atomic protection restores the exact citation group. All paths preserve the final mobile-domain negation semantically (though “mobile domain” remains a terminology-quality issue), and none produce the previously observed hallucinated facts. This isolates citation protection as a fidelity improvement, not the cause of the old hallucination. Server exited after capture.
- 2026-09-15 candidate ranking v7: added a terminal-boundary preservation bonus to `_candidate_score()`. When greedy and beam candidates both pass hard gates, a candidate retaining the source sentence terminal mark is preferred; the signal cannot accept a rejected output. Bumped Python/TypeScript identity to `strict-restore-v7`. Targeted quality/citation tests **44/44** pass; full corpus metric is pending and server is stopped.
- 2026-09-15 v7 controlled measurement: reran the OzCHI author-year variant matrix after terminal-boundary candidate scoring. All four conditions produced the same outputs as v6; no candidate switch occurred and no fallback-rate change is expected from this patch. Citation protection still preserves the exact author-year group, while unprotected mode transliterates it. Tests remain green; server stopped after the run.
