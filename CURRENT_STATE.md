## Current extraction status (2026-10-07)

- 2026-10-07: 所属分割・表投影・Figure caption continuation修正後の広域回帰を再実行。real-paper baseline **118/118**、reading-order **114/114**、合計 **232/232** pass（389.71秒）。PDF.jsの既知TT/ColorSpace警告のみで、assertion failureなし。
- 2026-10-07: IEEE所属文の実PDF再診断で、同一機関の行分割（Brunel University London）が重複出力される問題を確認。機関名の正規化と包含関係による重複統合を追加し、医療PDFで所属4系統を重複なしに保持。authorProjection **18/18**、typecheck pass。
- 2026-10-07: IEEE形式の `X is/are with ...` 所属文を、同一native paragraph内の次の著者節で分割して複数affiliationへ投影する汎用補正を追加。医療画像PDFの所属を一つの巨大文字列に潰さず、各機関単位で保持できるようにした。authorProjection **18/18**、typecheck pass。
- 2026-10-07: 著者所属の追加実PDF診断で、`wear-scale.pdf` の同一列折り返し（Events/Hospitality → Management/Iowa State University）を確認。既存所属が1件で、候補が2つの同列native nodeに限られる場合だけ隣接行を結合する高精度補正を追加。HCIの本文断片/Vol・Issue混入、PLOS番号付き所属と合わせ、authorProjection **12/12** pass。既存の段組・編集者欄・interleaved affiliation回帰も維持。全113本の再計測はprojection局所変更のため未実施。
- 2026-10-07: 最新コミット `f3b6d32` で抽出回帰を再実行。`test:extraction-corpus` は **232/232**（real-paper baseline 118 + reading-order 114）pass。PDF.jsのDOMMatrix/Path2D/TT/ColorSpace警告のみで、抽出assertion failureはなし。これは既知fixtureの回帰保証であり、113本全件の目視品質を意味しない。
- 2026-10-07: 新規IEEE systematic-review PDFで、著者行に `Faculty ...` が吸収され第一著者が欠落する問題を再現。所属語で分離し、末尾の大文字著者列を保持する汎用投影補正を追加。所属 suffixも所属一覧へ復元し、`AND`接頭辞を正規化。authorProjection **13/13**、typecheck pass。対象の著者3名とFaculty所属を復元。
- 2026-10-07: 同じIEEE PDFの `The associate editor coordinating ...` が本文段落として抽出される混入も確認。明示的な編集者クレジットをcanonical `chrome`へ分類する一般ルールを追加。author/pipeline/pageClass **52/52** pass、typecheck pass。
- 2026-10-07: 同PDFのページ上部に繰り返される `et al.: <article title>` running headerも本文段落として残ることを確認。ページ上端・`et al.:`・短い定型行の組み合わせを `header` として扱う汎用補正を追加。author/pipeline/pageClass **52/52** pass、typecheck pass。
- 2026-10-07: 出版社横断の10本診断で、日付メタデータの所属混入、引用タイトル説明の所属混入、`PA USA`の地名著者混入を確認。所属フィルタと著者地名フィルタを一般化し、authorProjection **16/16**、pipeline/pageClass **39/39**、typecheck pass。診断では別途、Japanese spacingと所属欠落の残課題も記録した。
- 2026-10-07: 追加診断で、日本語著者名の字間分割（`河 合 隆 史`）をCJK文字間の空白正規化で修正。IEEEの`R. Wang ... are with ...`形式を所属文として復元する汎用抽出を追加し、医療PDFの所属欠落を改善。authorProjection **18/18**、typecheck pass。
- 2026-10-07: 表構造の実PDF診断を実施。`medical-image-segmentation` はtable node 17件、`education-learning-analytics` 90件、`wear-scale` 50件を確認し、既知の数値グリッドはparagraphへ潰れずtable roleへ投影されている。現時点で安全に一般化できる新規table修正は特定できず、誤結合を避けて現行挙動を維持。次はtable nodeとcaption/relationの対応を目視サンプルで検証する。
- 2026-10-07: `wear-scale.pdf` のページ14相関マトリクスを現行Canonical→Paper投影で再確認。数値セル/行は31個以上の`table`ブロックとして`translationStatus=skipped`になり、通常段落としてMADLADへ送られないことを回帰テスト化。pipeline **31/31** pass。
- 2026-10-07: `cognitive-psychology-gpt3.pdf` のFigure 3 captionが、ベクター図の軸ラベルを挟んで2ブロックに分かれる問題を確認。`Figure` caption直後の同一ページで、パネル記号（A-D）を含む近接caption continuationだけを結合し、`Human data taken from... C:` を別段落として翻訳しないようにした。実PDF回帰を追加し、pipeline **32/32**、typecheck pass。
- 2026-10-07: Figure caption結合条件を実データで再確認。キャプション本体が句点で終わっていても、後続が同一ページ・近接位置・`C:`/`D:`等のパネル説明を含む場合だけ継続文として結合するよう調整。author/pipeline **50/50**、typecheck pass。
- 2026-10-07: table/caption relationを3本で再診断。caption **41件中41件**（20+16+5）が`CAPTION_OF` relationを持ち、孤立captionは0件。孤立table nodeは表セル/行の個別regionで、paragraphへの混入ではなかったため、無理なcaption結合は追加していない。

- 2026-10-07: `cognitive-dual-task.pdf` の所属回帰を実PDFで再診断。4機関が上付き番号と段組の同一 native block に交互配置され、編集者欄も同じ block に混在するため、現行 projection は最後の2機関しか安定復元できないことを確認した。番号の後処理だけでは著者/編集者の混入を解消できないため、次の修正対象は line/block grouping 段階での masthead boundary 分離とする。実験的な後処理は誤抽出を増やすため採用していない。
- 2026-10-07: 上記PDFの実データで、所属候補が `sidebarMixed` と誤判定され左列を捨てていたこと、および `Reviewed by:` 以降の正当な所属まで正規化で削除していたことを修正。番号付き候補の低信頼上書きを抑制し、国名が列間混入した `University of ...` を構造的に修復した。`authorProjection` **9/9**、pipeline/pageClass **48/48**、typecheck pass。対象PDFの所属は **4/4** 復元。
- 2026-10-07: 所属修正後の重点3PDF isolated benchmarkを再実行。3/3 process成功、title exact 3/3、interactive-jewelleryのheading/reading-order/caption/list/source integrity、medical meta-reviewのtable metrics、linguisticsのsource integrityを維持。副作用なし。生成レポートは `test-data/real-papers/reports/extraction-isolated-latest.json`。
- 2026-10-07: タイトル継続判定を修正。コロンで終わるタイトルの次行を、少し小さいフォントでもタイトル候補として保持し、雑誌マストヘッド後の複数行記事題を縦順に結合するようにした。113本のisolated benchmarkは **106/113 (93.81%) title exact**、前回105/113から1件改善。見出し・図/表caption・表領域は平均1.0、source integrity平均0.99997、失敗0件。残る7件の大半はPDF現地語題と英語catalog titleの言語不一致で、抽出誤りとは限らない。typecheck/lint pass（既存warningのみ）。
- 2026-10-07: 追加の実PDF診断で、イベント名が記事題に混入するケース、タイトルblockへ著者行が連結するケース、本文冒頭の長い `While ...` 段落がタイトルへ昇格するケースを一般化して修正。イベント/学会masthead除外、行単位の番号付き著者尾部除去、長い引用付き本文のmetadata title fallbackを追加。isolated benchmark **107/113 title exact**（前回106/113）、failed PDFは未取得の `precious-materials` 1件のみ。見出し/reading-order/caption/table指標は既存値を維持。titleResolver 5 tests、authorProjection 9 tests、pipeline 30 tests、pageClass 9 tests pass。なお実PDFのロシア語・セルビア語題は英語catalogとの言語差が残る。
- 2026-10-07: 多言語タイトルに英語 `For citation:` 行がない場合、citation fallbackでタイトルを空にせずnative titleを保持する安全側修正を追加。titleResolver 5 tests、typecheck pass。
- 2026-10-07: masthead実データを追加監査し、HCI PDFで本文断片が著者名へ混入、`Vol./Issue`行が所属へ混入する問題を再現して修正。小文字開始の本文をauthor continuationから除外し、書誌バンドをaffiliationから除外。PLOS形式では番号付き機関行が厳格フィルタで全消失していたため、機関語を含むnative affiliation lineを分割復元する汎用fallbackを追加。実PDFでHCI著者2名・所属2件、PLOS所属2件を復元。authorProjection **11/11**、typecheck pass。

- 2026-10-07: 最新コードで重点3PDF（interactive-jewellery、linguistics-language-model-physics、medical-deep-learning-meta-review）のisolated extractionを再実行。3/3 process成功、title exact 3/3、heading/reading-order/caption/table指標は各fixtureの期待値を通過、source integrity 1.0。medical PDFは `pageKind=garbled` となりOCR routing対象。

- Latest code includes generic title/author/affiliation projection, transparent text-layer detection, Vision OCR routing, sparse-OCR protection, and figure/table label suppression.
- Verified: extraction corpus and reading-order **232/232**, page-class/OCR tests **9/9**, typecheck and lint pass.
- Automated 113-paper title exact metrics are historical regression signals, not visual accuracy; native OCR/runtime validation and full-page visual review remain outstanding.
- Highest-priority remaining cases: transparent text-layer fragments in mixed-column PDFs, complex table/list reconstruction, and real Tauri Vision OCR output verification.

- 2026-10-06: 著者・所属補正後に113本（取得済み113/114、`precious-materials`欠損）のisolated extraction benchmarkを再実行。title exact **105/113 (92.92%)**、native title exact **53/113**、metadata fallback **56/113**。heading/caption/table-region/reading-order指標は既存値を維持し、source integrity平均は約0.99997。今回のベンチマークは著者・所属の完全目視評価ではなく、既存Ground Truth範囲の自動指標である。
- 2026-10-06: Multi-column affiliation blocks now use `LayoutBlock.lines[].items` and x-band clustering to project separate institution strings instead of concatenating columns. Country-only continuation tokens are attached to the neighboring institution column when geometry indicates a wrapped row. Focused author/pipeline tests (30/30) and typecheck pass; broader publisher layouts remain queued for review.
- 2026-10-06: Affiliation projection now collapses exact repeated institution spans while retaining canonical relation IDs. `power-over-skin` now emits one Carnegie Mellon University entry; focused author regression and typecheck pass.
- 2026-10-06: Native line geometry showed same-baseline author items (`Daehwa Kim` / `Chris Harrison`) being rejoined during block grouping. Added a generic author-column boundary when both adjacent lines are person-shaped and horizontally separated; added a focused regression asserting three separate authors and no location author (`authorProjection.test.ts`). Focused test and typecheck pass; remaining affiliation deduplication is tracked separately.
- 2026-10-06: 113本のmastheadサンプルから、著者投影に地名（`Pittsburgh, USA`）、書誌行、メールアドレス、末尾が接続語の断片が混入する一般的な誤抽出を確認。`isNonAuthorMastheadLine` を追加し、著者候補・継続候補・所属候補の境界で除外する補正を実装（`3af9d3b`, `71a879e`）。typecheckとreal-paper extraction回帰118/118は通過。複数著者が同一native lineへ潰れるケース（例: `Daehwa Kim Chris Harrison`）は別のgeometry分離課題として残る。
# Paper Reader 現在状態

- 2026-10-06: 113本の自動抽出指標だけでは見逃す本文汚染を、タイトル診断で追加確認した。インドネシア語ジャーナルPDFでは、ISSN/巻号/発行日帯が本文の先頭行と同じnative line/blockへ連結される形式を確認。`splitInlineBibliographicBand` を行形成前に追加し、構造帯と本文を分離する汎用修正を実装（`e79ba73`）。既存のreal-paper extraction regression **118/118**、typecheck、diff check pass。これは113本全件の目視完了を意味せず、引き続き書式別の目視レビューが必要。
- 2026-10-06: 上記修正後に113本のisolated extraction benchmarkを再実行。取得済み113/114（`precious-materials`はPDF未取得）。自動title exactは **109/113 (96.46%)**（108/113から改善）。残る4件はPDF内の別言語タイトル3件と英米綴り差1件で、雑誌マストヘッド混同は解消。見出しprecision/recall、図表caption、table-regionはこの計測で1.0、source integrity平均1.0（最小0.997）。これは目視確認済みの正解率ではないため、タイトル・本文混入のmanual reviewを継続する。
- 2026-10-06: `linguistics-computational-linguistics` のページ1を目視相当のgeometry診断。`International Journal of Advances in Scientific` が記事題 `Computational Linguistics` より先に選ばれていたため、journal/volume/date → article-title → author の文書順を使う汎用Resolver補正を追加。2語の正当な記事題もメタデータ候補として扱う。代表workerで記事題を復元し、real-paper extraction **118/118**、typecheck pass（`fbe1a7e`）。全件自動再計測は次の大きな抽出変更時に行う。
- 2026-10-06: 残るtitle mismatchをレンダリングで確認。Serbian/Russian PDF 3件は英語catalog titleではなく、PDF上のCyrillic題を正しく抽出していたためground-truth言語不一致/綴り差として記録。一方 `linguistics-the-role-of-applied-linguistics...` はPDF上のロシア語題が見えるのにpdf.js native textが `АПФАПФ...` へ壊れるfont ToUnicode failureを確認（severity 3、open）。`extraction-manual-review-v1.json` に記録した。native metadataがない診断経路では、壊れたタイトル候補を棄却し、同一ページの `For citation:` DOI行からタイトル文を復元する汎用フォールバックを追加した。実ファイル経路では既存のVision OCRを優先し、特定文字列の置換は行わない。
- 2026-10-06: 上記font failureを検出するページ分類を強化。短いglyph反復と記号連結masthead tokenを `garbled` として扱い、macOS Vision OCR fallbackへ `ru-RU` を追加。特定文字列の置換はせず、既存ページ分類回帰を維持。pageClass/extractionConfidence **7 tests pass**、typecheck pass（`0526af9`）。OCR後のロシア語タイトル品質は実PDF再抽出で追加確認が必要。
- 2026-10-06: Vision OCRの認識領域（normalized bounding box）をRust側から返し、JS側でPDF座標へ変換してOCR行のx/y/width/heightを保持するよう修正。従来の全行x=0置換による段組・見出し崩れを防ぐ。`~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml` pass、typecheck、pageClass tests pass（`11c7107`）。
- 2026-10-06: OCR座標変更後の extraction corpus / reading-order 回帰を再実行し、**232/232 pass**（2 test files）。PDF.jsのcanvas/TT警告は既存環境警告で、assertion failureなし。

- 2026-10-06: Word-level native text向けの幾何ベース段組検出を追加。タイトル・著者・図が上部を占める `ppg-earring.pdf` でも本文の二段組（leftX=56/rightX=320）を検出し、Abstractを左段→右段の論理順に復元できることを確認。`Our results validate...` の先頭欠落を解消。pipeline 27/27、reading-order/list 77/77、重点real-paper 3件の回帰を通過。全PDFで完了したことを意味せず、段組・表・ページ境界の残課題は継続。
- 2026-10-06: 既存real-paper extraction baseline 118/118 tests passed after the column change. The Vitest worker emitted one `onTaskUpdate` timeout after all tests had passed during the 206-second run; this is test-runner reporting noise, not a failed extraction assertion. No baseline assertion failed.
- 2026-10-06: 113本の抽出ベンチマークも完走。title exact は 90.27%（102/113）で、残りは主にジャーナルのマストヘッド・リポジトリ表紙・PDF内タイトル分割/別言語タイトルが原因。抽出全体を完了扱いにはせず、次の改善対象としてタイトル候補の文書構造判定を記録。
- 2026-10-06: ジャーナル表紙の `Contents lists` / `Journal homepage` 等を構造証拠として使い、同一ベースラインに分割された記事タイトル候補を再結合するResolver補正を追加。`medical-deep-learning-meta-review` は `Computer Methods` から `Medical deep learning—A systematic meta-review` に復元できた。pipeline/reading-order/list 104/104、typecheck pass。113本全体の再計測は次の大きな抽出変更時に行う。
- 2026-10-06: 上記Resolver変更後に113本を再計測し、title exact は 102/113 (90.27%) から 104/113 (92.04%) に改善。残り9件の多くはPDF自体の別言語タイトル・翻訳題・表紙題で、英語カタログ題との単純一致では抽出失敗と断定できない。`extraction-baseline-latest.json` は生成物のためコミットせず、数値と代表例をここへ記録。
- 2026-10-06: 段組検出の追加回帰で、単段組PDFのヘッダーだけが左右に分かれる誤検出を確認。左右の行数比、縦方向の重なり、各列のYスパンを要求する条件を追加し、`ergonomics-human-factors-and-ergonomics` は単段組へ戻り、`ppg-earring` は二段組を維持。pipeline 28/28、reading-order/listを含む直近104件 pass。変更は未コミットのUI差分と分離して次のコミットに保存。
- 2026-10-06: 上記条件変更後、`ppg-earring` と `ergonomics-human-factors-and-ergonomics` の実PDF回帰を再通過（2/2）。後者のAbstractが単段組の論理順で保持されることを確認。
- 2026-10-06: 段組誤検出修正後に113本全体を再計測。title exact は 104/113 (92.04%) から 105/113 (92.92%) に改善。heading recall平均 0.9932、figure caption recall 1.0、table caption recall 1.0、table region recall平均 0.95、source integrity平均 0.9999。生成JSONはコミットせず、ベンチマーク値のみ記録。

- 2026-10-06: 大規模PDFの抽出回帰を180秒共通タイムアウトで再確認。`ergonomics-human-factors-and-ergonomics` は抽出内容を含め **37.7秒で合格**し、従来の60秒タイムアウトは実抽出失敗ではないことを確認。抽出固有の追加修正はせず、テストの誤判定だけを解消した（`f2ca78c`）。
- 2026-10-06: PDF抽出回帰を再実行（232 checks中229 pass）。`education-learning-analytics` の番号付き本文リストが図ラベル誤判定で消える問題を修正し、`human-ai-interaction-guidelines` の段落が参考文献状態へ誤分類される問題も修正。重点2件は再テスト合格。変更は `7f50d02`。残る1件は大規模PDFの既存60秒テストタイムアウトで、抽出内容の失敗ではなくテスト時間設定の課題。

- 2026-10-05: CAT-Translate 3.3BをMADLAD fallback入力4件で再評価（`cat-focused-fallback-v3`）。4/4が日本語生成（2.8〜12.7秒/件）し、現行cascade品質ゲート再計算では3/4を自動受理。これは小規模監査であり、本番cascade接続や全113本の再計測はまだ行わない。成果物は `test-data/real-papers/reports/cat-focused-fallback-v3.json` と `selective-cascade-v805-quality-recompute.json`。
- 2026-10-05: 同一source cohortでCATを再評価（MADLADのordinary-body post-model fallback 2件）。CAT自動受理は1/2。interactive-jewelleryは引用 `[2]`/`[16]` の欠落で拒否、dont-mind-meは数値保持を通過したが access表現の重複がありmanual確認対象。異なるsource cohortのCAT結果と混同しない。成果物は `test-data/real-papers/reports/cat-same-cohort-v1.json` と品質再計算レポート。
- 2026-10-05: 同じ2件でCATの監査専用citation placeholderを有効化して比較。引用欠落は解消せず、`[2]`/`[16]` がなお欠落し、別unitでは `ZZCIT` 指示文が出力へ漏れた。単純placeholder/prompt方式はCAT rescueの根拠にならず、本番へ接続しない。
- 2026-10-05: CAT同一cohortで検出した「less easy to access」と「easier to access」が同じ日本語述語へ潰れる比較極性の欠落を、一般化したcascade専用relation guard `opposite comparative polarity collapsed` として追加。quality tests **271/271**、typecheck、diff check pass。反対極性を別表現で保持する受理回帰も追加し、全件再計測は不要な局所品質修正として未実施。
- 同ガード後の全TypeScript回帰は **70 files / 652 tests pass**。PDF抽出・reading order・cascade・import/resumeに回帰なし。
- 抽出ベンチマークの範囲ガードを追加後、`--papers thermal-earring` の1本実行を確認。title exactness、source integrity、figure/table caption・region指標はいずれも1.0、heading recall 0.973。引数なし全件実行は明示的に拒否される。
- 比較極性ガード後に同一CAT cohort（2件）を再採点し、自動受理が **1/2→0/2** になった。dont-mind-meの数値保持候補も、反対極性のcollapseを安全側で拒否できることを確認。CATを本番cascadeへ接続する前の安全基準として保存。
- 追加のCAT非citation cohort（4件）は自動ゲート3/4だったが、1件は先頭が`– encourages...`のsource fragmentだったため、CAT品質比較から分離。監査スクリプトに継続断片の除外（`CAT_INCLUDE_INCOMPLETE=1`で診断時のみ含める）を追加し、source reconstruction failureをmodel rescue率へ混ぜない。
- fragment除外後の完全source 3件ではCAT自動受理2/3。manual reviewでは2件がseverity 0、dont-mind-meの比較極性collapseがseverity 3で品質ゲート拒否と一致。非citation ordinary-bodyでもCATを無条件統合せず、relation guardを通す必要がある。レビューは `cat-noncitation-cohort-v2-manual-review.json`。
- 追加のheld-out focused benchmark `focused-heldout-v1`（ppg-earring / design-for-wearability / step-to-charge / wear-scale、各2 units）を完了。ordinary-body 4件は4/4がreader-visible fallbackなし。fallbackはsection-headingの未翻訳・図参照順、listの継続断片、damaged-extractionの未完括弧に限定された。今回の小規模結果ではquality gate緩和やCAT本番接続の根拠は得られず、抽出構造failureとして分離した。全件再計測は未実施。
- 同held-outのordinary-body 2件を手動確認したところ、自動受理2件中2件にseverity>=2の意味ずれがあった。`ppg-earring` はwearablesを「ウェブアプリケーション」と誤訳し、`step-to-charge` は2mWのpeak powerと1mのchannel lengthの関係を崩した。数値の存在だけでは検出できない用語・測定役割のsemantic false acceptとして `focused-heldout-v1-manual-review.json` に保存。品質ゲートの一般化可能な用語/測定役割検出を次の改善候補とする。
- 測定役割ガード `scientific measurement role changed` を追加。英語側で明示された2つの測定役割（power / channel length）と、日本語側の値の最近傍役割が反転した場合だけ拒否し、役割が不明な通常文は変更しない。quality tests 274件、typecheck pass。`focused-heldout-v4`（同2論文・4 units）ではstep-to-chargeの問題出力がreader-visible fallbackへ倒れ、ppg-earring本文は従来どおり完了した。なおstep-to-chargeは未翻訳英文残留も同時に検出されており、ガード単独の寄与率は追加分離が必要。
- CAT独立fallback cohort `cat-independent-heldout-v2`（post-model ordinary-body fallback 4件）を同一ゲートで評価。自動受理2/4、手動では安全な受理1/4。1件はThai metadata + detached numberのsource fragmentをCATが流暢に補完したseverity 4、1件は数値4の omissionで拒否、1件は意味上は妥当だがmethod guardのfalse reject、1件は正しく受理。CAT本番cascadeはまだ統合しない。レビューは `cat-independent-heldout-v2-manual-review.json`。入力抽出スクリプトはfallbackかつpost-modelに限定する修正を追加。
- CAT held-out入力のsource integrityを追加確認し、先頭foreign metadataに加えて `Mage = 25.6...` のような代入途中から始まる断片も除外するよう準備スクリプトを強化。v3ではThai行は除外できたが、代入断片が残ったため、CAT受理率を本番品質の推定には使わない。再評価結果は `cat-independent-heldout-v3.json` に保存。
- `conducting quantitative appraisal analysis` を明示的なmethod evidenceとして認識する一般ルールを追加し、CATのlinguistics行で確認されたfalse rejectを解消。quality tests 275件 pass。保存済みv3 CAT結果の再計算では受理2/4→3/4になったが、代入途中source fragmentが1件残るため、本番cascade統合の判断には使わない。
- `Mage = 25.6...` のように代入式の途中から始まる長いsource blockを `diagnoseIncompleteSource` で抽出fragmentとして扱う安全ガードを追加。通常の数式・本文は対象外。quality tests 276件、typecheck pass。CATのsource-fragment誤受理を本番翻訳へ流さないための一般化可能な入力検証として記録。
- 2026-10-05: CAT比較前のMADLAD重点基準 `focused-before-cat-v1`（4本・16 units）を完了。ordinary-bodyは2/6 fallback（33.3%）、全体は9/16 fallbackだが、6件は構造不良によるpre-model除外。これは全体推定ではなく、CAT cascade比較用の基準値として保存。

最終更新: 2026-10-05

## 現在の実装状態

- 2026-10-05: サーバーが返す one-to-one translation unit mapping に失敗unitが含まれる場合、集約文字列のplausibility判定よりも unit projection を優先するよう修正。成功unitを保持し、失敗unitだけ原文へ戻す経路を単体・batch・resumeで統一した。品質/engine回帰282件、typecheck、diff check pass。113本全件の再計測はこの局所変更では実施しない。
- 同変更の重点再測定 `partial-projection-focused-v1` は2/4本・24 unitsをチェックポイント保存（complete=false）。サーバーはreadyのまま、残り要求が長時間進まなかったためクライアントのみ停止。成果物は `test-data/real-papers/reports/partial-projection-focused-v1.{json,md}` に残し、`--resume` で再開できる。保存済み24 unitsの段階分類は pre-model 10、post-model 3、通常完了11で、全体指標には一般化しない。
- 同レポートに保存された `thermal-earring` 出力には `earring`→「耳かき」の漂移が残っているが、これは保存時点の診断結果。現行の `normalizeSourceGroundedTerminology` にはsource確認済みの `earrings?` 修復と回帰テストがあり、再測定時に正規化後の値を確認する。自動受理を品質達成とは扱わない。
- 監査スクリプトもproductionと同じ `projectSafeUnitTranslation` を使うよう更新。serverがpartial/whole-item fallbackを返しても、one-to-one mappingが検証できれば成功unitを評価し、失敗unitだけを `partialSourceFallback` として記録する。これにより監査のreader-visible fallbackがproduction経路と一致する。typecheck、quality/engine 282 tests pass。
- smoke benchmark `partial-projection-smoke-v1`（thermal-earring、1 unit）を新監査経路で完了。`sourceFallback=false`、`readerVisibleFallback=false`、`wouldAcceptTranslation=true` を確認し、出力中の「耳かき」漂移は現行source-grounded normalization後には発生しなかった。`missingTechnicalNameCandidates` は英語名を日本語転写したため診断値として残る。
- `cadence-dry-run-v1` で重点4本×4 unitsの選択・抽出・チェックポイントだけを確認（モデル呼び出しなし）。通常の確認コマンドが113本全体へ暗黙拡大しないことを再確認した。
- `partial-projection-focused-v2` を4本×4 unitsで完了（16 units、`MADLAD_BENCH_MAX_ATTEMPTS=1`）。ordinary-bodyは6 units中4完了・2 partial source fallback。post-model 3件は全体原文fallbackではなく、one-to-one projectionで成功unitを保持したpartialとして記録された。小標本であり5%目標へ一般化しないが、局所fallback経路が実測できた。成果物は `test-data/real-papers/reports/partial-projection-focused-v2.{json,md}`。
- v2のordinary fallback keyのうち `interactive-jewellery:b-fd49dd32` には既存CAT audit出力が対応し、CATは段落全体を日本語化した候補を生成している。ただしこの出力は同一条件の新規blind review前なので、本番cascadeへの接続根拠にはせず、次の比較対象として記録する。
- 保存済みCAT候補を現行quality evaluatorで再計算すると score 0.871、`scientific invariants missing: [16]` で不合格だった。見た目が流暢でもcitation保持を満たさないため、CATをこのfallbackへ自動投入するだけでは安全なrescueにならない。
- CAT監査スクリプトに bracket citation atomic-protection arm（`CAT_PROTECT_CITATIONS=1`）を追加し、同一1件で実測。`[16]` は復元できたが別の `[22]` が欠落し、quality score 0.871 / `scientific invariants missing: [22]` のまま不合格。単純placeholderでは不十分で、MADLAD側の既存placeholder復元・retry相当が必要と判明。本番変更には未接続。
- citation placeholder保持を明示するpromptも追加して再実測したが、欠落対象が `[22]` から `[16]` へ移っただけで、quality score 0.871のまま不合格。単発prompt強化では解決しないことを確認。

- 翻訳モデル: MADLAD-400 3B、Transformers 4.57.6 runtime。
- 翻訳品質ガード、科学的 invariant、引用保護、partial fallback、選択的 cascade の監査実装が存在する。
- CAT-Translate は監査・比較用で、本番ルーティングには未統合。
- PDF抽出は Native text / geometry / canonical resolver / projection の既存パイプラインを使用。
- macOS `.app` の再ビルドは、コード変更を配布版へ反映する必要がある段階で実施する。
- 最新重点検証: `focused-cohort-current-v3`（4本・48 units）。metadata等の翻訳対象外pre-model skip 13件を本文品質から分離し、本文継続候補5件とpost-model fallback 7件を次の診断対象とした。
- 最新回帰: TypeScript 70 files / 648 tests、Python translation-server 248 tests、typecheck passed。113本全件計測は未実施。
- 直近修正: UUID/GUID/HEXと16進payloadの連結をinvariantとして認識（`a7a89c9`）、whole-item fallbackの単位投影回帰を追加（`62fc557`）。
- UUIDの前後に説明語があるPDF抽出形（`UUID) of 0x1809` → `UUID0x1809`）と、`0x`内の`0`をcitationとして誤認する問題を修正（`82fe640`）。品質テスト269件、typecheck passed。
- 保存済み `thermal-earring` 出力の再評価ではUUID/`0x1809`保持は通過したが、`Unique Identifier` の一意性表現欠落を `exclusivity relation missing` として検出した。これは識別子のfalse rejectではなく意味欠落のため、gateは緩和しない。

## 主要指標

### 2026-10-05: active translation audit checkpoint

- `translation-audit-auth-v1` は `--resume --cached-only --limit 12` で完了済み。
- **113/114 papers、1,155 sampled units** をチェックポイント保存済み（`precious-materials` のPDFのみ未取得）。
- ベンチマークプロセスは終了済み。現在稼働しているのは翻訳サーバーのみで、後続の全件再計測は実施しない。
- **評価運用方針:** 113本全体の再計測は、抽出・分割・品質ゲート・モデル・保護方式などの大きな横断変更を入れた節目に限定する。通常の修正では、focused unit test と 4〜12本程度の代表コホート（変更に関係する分野・書式を含む）を使い、全件ベンチマークは開始しない。
- 全件再計測を行う場合は、開始理由・対象commit・比較する基準値を先に記録し、完了後に本節へ結果を追記する。長時間プロセスを常駐させず、チェックポイント付きで実行する。
- `benchmark-real-paper-translation.ts` は、カタログ全体を暗黙に選ばないよう変更済み。12本を超えるカタログで全件を実行する場合は `--full-corpus` が必須（commit `31da674`）。
- focused cohort `focused-cohort-current-v1`（speechin / dont-mind-me / interactive-jewellery / thermal-earring、48 units）を再計測。ordinary-body は 4/19 fallback (21.1%)、構造入力ポリシーによる事前除外が19件、post-model rejectionは4件。全件指標ではなく、次の修正候補を絞るための診断値として扱う。レポートは `test-data/real-papers/reports/focused-cohort-current-v1.{json,md}`。
- 同コホートのpost-model ordinary failureは `dont-mind-me` の長い統計/本文3件、`speechin` の数値・foreign-script汚染1件。`thermal-earring` のUUID/invariant行はordinary本文ではなくカテゴリ誤分類を伴うため、quality gate緩和の根拠にしない。次の実装候補は長文unitの品質拒否と数値/foreign-script rescueの一般化検証。
- 翻訳サーバーの既存品質回帰（`test_madlad_quality` + `test_mixed_quality_fixture`）を再実行し、74 tests が pass。現時点ではproduction変更を追加せず、上記4件の再現fixture比較を次の実装前提とする。
- `dont-mind-me:b-4c16bae3` の長文統計本文は、現行segmenterで7つの完結文（94〜217 chars）へ分割され、round-trip可能だった。したがってこのfailureは「段落全体を1回で送った」問題ではなく、protected input/decode/quality gate側を優先して切り分ける。診断: `focused-long-unit-segmentation-dont-mind-me-v1.json`。
- 統計値placeholderの影響を比較するため、`MADLAD_EXPOSE_INLINE_STATISTICS=1` の診断専用armを追加。`(0.005)` 等のcompact statisticsだけをモデルへ見せ、citation・測定値等は従来どおり保護する。production defaultは変更していない。citation protection tests 81/81 pass（commit `3493ab7`）。
- 対象unitの現行production出力を保存し、`partial_unit_fallback`（unit 1/3）と統計値由来の英文残留を再現。診断armサーバーはバックグラウンド起動制約でmodel比較まで進められなかったため、通常設定のserverを復旧済み。armの採用判断は未実施。
- 同一model・同一decode条件で統計値公開armをPTY内で再実行。現行保護は `partial_unit_fallback`（298 input tokens）、公開armは fallbackなし（398 input tokens）になった一方、`0.02→1.00`、`0.001→0.1` 等の数値破壊が発生した。したがってplaceholder削減だけでは採用不可で、数値を文脈付きで見せつつ exact restore/検証する方式が必要。比較 artifact: `test-data/real-papers/reports/inline-statistics-ab-v1.json`。通常serverへ復旧済み。
- 公開armの数値破壊を検出するためcompact parenthetical statisticsをinvariantへ追加する案は、既存の統計値再配置を正当に受理するテストを誤拒否したため撤回。quality test 267/267 pass、production quality behaviorは変更なし。
- 同じ4本コホートのpost-model fallback 4件を既存Gemma 2 9Bでselective-cascade監査。quality/citation gateの自動受理は **1/4**（`dont-mind-me:b-68e941f0`）で、残り3件は数値・foreign-script・未翻訳lexeme・否定関係などで拒否。自動受理を手動正解とは扱わず、CAT未導入の代替モデル基準として `test-data/real-papers/reports/selective-cascade-focused-gemma-v1.json` に保存。本番cascadeは変更していない。
- 同一4件をQwen 2.5 7Bでも監査し、自動受理は **0/4**。Gemma 1/4を上回らず、いずれも本番cascadeへ追加しない。artifact: `test-data/real-papers/reports/selective-cascade-focused-qwen7b-v1.json`。Ollamaは停止済み。
- 同一4件をQwen 2.5 14Bでも監査し、自動受理は **1/4**。Gemma 2 9Bと同率で、CAT比較がない現段階では本番cascadeへ追加しない。artifact: `test-data/real-papers/reports/selective-cascade-focused-qwen14b-v1.json`。Ollamaは停止済み。
- CAT-Translate 3.3Bのcached weightsを発見し、同じfallback cohortから4件を直接評価。CAT outputはproduction quality evaluatorで **3/4** が自動受理、1件（`dont-mind-me:b-4c16bae3`）はdegenerate outputで拒否。これはCATの有望な一次証拠だが、手動semantic review・citation/invariant再確認前のため本番cascadeには未接続。artifact: `test-data/real-papers/reports/cat-focused-fallback-v1.json`。
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

### v1563 — ゴミ箱自動削除の説明と日数変更時の猶予（2026-10-06）

- 設定の説明を「ゴミ箱の項目を自動で完全削除するまでの日数です。」に短縮。
- 日数変更直後に期限切れになる項目はすぐ消さず、変更後の日数分の猶予を付ける（trashed_at を更新）。

### v1562 — ゴミ箱の完全削除をトースト取り消しに（2026-10-06）

- 「今すぐ完全に削除」は行内の二段確認なし。赤塗り白文字ボタン一回でリストから外し、下部トーストの「元に戻す」でキャンセルできる（確定はトースト消失時）。
- 青ステージ上・左余白は 36px に統一済み（v1561）。

### v1561 — ナビゲーションプレビューの青余白（2026-10-06）

- 設定の自動折りたたみ比較プレビューで、青ステージの上・左の余白を 36px に揃えた（右・下のクロップはそのまま）。

### v1560 — 重複PDFインポート行の整理（2026-10-06）

- 同じPDFが既にあるときのライブラリ行をコンパクト化。重複バッジ・重複する説明文・生エラーをやめ、ファイル名＋一行の案内と「既存の論文を開く」／閉じる（×）だけにした。

### v1559 — 翻訳切り替えの粒子モーフィング（2026-10-06）

- 構造確定後は英語本文をそのまま表示し、翻訳到着時に英語字形が細い黒粒子へ溶け、日本語字形へ再形成されつつブラーが溶ける演出を追加（高密度サンプリング・英語→粒子区間は約1.6倍速）。
- 待ち中のスピナー箱表示をやめ、待ち時間の体感を短くする方向に変更。
- 設定 → 翻訳 にローカル確認用プレビュー（再生ボタン付き）を置いた。

### v1558 — サイドバー接近ゾーンで expand 途中まで開く（2026-10-06）

- 自動折りたたみ時、本体＋近傍ブリッジで全開する既存挙動に加え、その外側の接近ゾーンでは同じ expand モーションの約 42% 地点まで進む（別アニメではなく連続した進行度）。

### v1557 — 自動折りたたみプレビューのクロップと透明度（2026-10-06）

- 設定プレビューのウィンドウを青ステージの右端・下端で途切れるクロップに変更。
- 現在の設定側を不透明度 100%、もう一方を約 60% にして選択状態を示す。

### v1556 — メモ作成時は本文ハイライトのみ（2026-10-05）

- テキスト選択からのメモ作成で、選択範囲を本文上にハイライト表示する。
- メモボックス内の引用テキスト表示をやめた（入力欄と操作だけ）。

### v1555 — 目次背景を本文と同じ白に（2026-10-05）

- Reader 左の目次パネル背景を `--color-bg-secondary` から `--color-bg` に変更し、本文と同じ白にした。

### v1554 — サイドバー左端の揃え（2026-10-05）

- 検索ボックス・セクション見出し・ライブラリ／設定アイコン・ワークスペースフォルダの左端を共通インセットに揃えた。
- ツリーの chevron をレイアウト幅から外し（絶対配置）、展開してもアイコン列がずれないようにした。

### v1553 — 自動折りたたみプレビューを青背景の浮かぶウィンドウに（2026-10-05）

- 「自動で折りたたむ」比較プレビューから OFF/ON ラベル・説明キャプション・トグル下の説明文を削除。
- 強い青ステージ上に macOS 風タイトルバー付きウィンドウが浮かぶ見た目に変更。選択中は白いリングで示す。

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

- 2026-10-07: OCR品質ガード追加後にlint、pageClass 9 tests、typecheckを通過。native本文が十分あるページを短いOCR結果で置換しない条件を確定。残る実機確認はTauriアプリでのVision OCR再抽出のみ。

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

- 2026-10-05: citation-alignment audit module追加後の全体回帰を再確認。Vitest **70 files / 641 tests**、typecheck pass。localhost translation server は `semantic-v84` / `phase=ready`。この局所的な監査変更では113本全件再計測を行わず、production routingも変更していない。
- 2026-10-05: 既知の抽出・長文・引用系failureを含む4本（16 units）の限定cohort `post-citation-audit-cohort-v1` を再測定。ordinary-body 6 unitsは **0/6 reader-visible fallback**、構造破損は5件をpre-model source fallbackとして維持、長文citation保護のproduction緩和は行わない。小標本のため全体指標へ一般化しない。
- 2026-10-05: CAT-Translate source-disjoint v5 を5件実行（認知心理学）。自動quality gateは5/5、citation診断は1/5 flagged。手動確認では3件が概ねusable、2件は図・表由来の断片混入（うち1件は `GPT-3 Humans` の配置崩れ）で、CATの安全なproduction cascade根拠にはならない。成果物: `cat-source-disjoint-auth-v5{,-quality,-citation-diagnostic}.json`。
- 2026-10-05: `cognitive-psychology-gpt3` を現行抽出経路で4 units再検証。旧CAT入力にあった `Horizon 1 Horizon 6` 型の図表ラベル列は今回の抽出サンプルには出ず、3件の不完全ブロックはpre-model source fallbackとして保持された。抽出ガードの緩和や追加特例は不要と判断。成果物: `post-figure-label-cognitive-v1.{json,md}`。
- 2026-10-05: CAT source-disjoint v1〜v5を統合。25 rows中、source/structure除外7、clean 18、手動usable 14、severity>=2は4。citation診断flagは4 rows。CATは引き続き本番無効。集計: `cat-source-disjoint-summary-v1-v5.json`。
- 2026-10-05: CAT source-disjoint v6を追加（10 rows）。source/structure除外3、clean 7、usable 7、citation flag 0。v1〜v6累計は35 rows、clean 25、manual usable 21、severity>=2は4。CATは依然として本番無効。集計: `cat-source-disjoint-summary-v1-v6.json`。
- 2026-10-05: CAT v1で確認された手順単位の意味ずれ（`utterance` を `session` と訳す）を、実験記述一般に適用できるsemantic scope guardとして追加。sourceに片方の単位しかない場合の一方向置換だけをcascade拒否し、両方を保持する文は許可。quality **264/264**、typecheck、diff check pass。
- 2026-10-05: scope guard後の全体回帰を実行。Vitest **70 files / 643 tests**、typecheck pass。既存のcanvas.node警告のみ。
- 2026-10-05: scope guardの文単位対応へ微修正後も全体回帰を再確認。Vitest **70 files / 643 tests**、typecheck pass。全件翻訳ベンチマークの再実行は不要な局所変更として保留。
- 2026-10-05: CAT v1 tailを新scope guardで再評価。4 clean rows中、自動受理は **2/4**。`utterance unit shifted to session` を実際に拒否し、他は既存のdegenerate/participant-role guardで拒否。artifact: `cat-source-disjoint-auth-v1-tail-quality-after-scope.json`。
- 2026-10-05: 実CAT出力の `current and previous utterances` → `そのセッションおよび直前のセッション` を固定再現し、文境界がずれてもpaired scope patternで検出するguardを追加。quality **265/265**、typecheck pass。cascade判定はreject。
- 2026-10-05: CAT v1〜v6の保存済み32結果を新guardで再計算。clean 32件中quality gate受理29件。既存のv1 mainにはpaired scope行が含まれず、実例はv1 tailの別artifactで拒否を確認済み。集計は監査用で、本番routingは未変更。

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
- Triage refinement (2026-10-05): the 111 ordinary-body fallback rows contain 55 `server/protection`, 43 `quality-gate`, 5 `extraction/structure`, and 8 `other` classifications. Within `server/protection`, 43 are model-quality rejection and 10 are protected-token restoration failures. Six of those 10 visibly contain malformed layout/metadata (flattened table text, broken columns, or affiliation lines); the remaining clean-looking cases are long citation-heavy prose and require decode/protection A/B before any production change. No blanket protection relaxation was applied.
- Source policy fix (2026-10-05): narrow credential/affiliation lines such as `Associate Member ... Institution ... Engineers` are now excluded from paragraph translation as publication metadata. Ordinary prose about members or institutions remains eligible. Quality tests: **261/261**, typecheck passes; no full-corpus rerun was performed.
- Translation-unit normalization (2026-10-05): when native PDF text drops the opening parenthesis before an author-year citation (`similar ways Bailenson and Yee (2007), ...`), model input now restores that boundary without changing the source slice. Segmenter version/cache identity advanced to `semantic-v84`. Segmenter tests **62/62**, model-version test, typecheck, and diff check pass; no full-corpus rerun was performed.
- Runtime spot check (2026-10-05): after restarting the local server, the detached-citation fixture completed with `model_version=semantic-v84`, no fallback, and a restored `(Bailenson and Yee, 2007)` citation. This is a one-fixture regression check, not a population quality estimate.
- Extended runtime spot check (2026-10-05): two available auth-v1 blocks with detached/inline author-year citation context completed on `semantic-v84` with no server fallback. Artifact: `semantic-v84-author-year-spotcheck-v1.json`. The other two requested keys were not present in auth-v1 and were not substituted with different papers.
- Source-boundary fix (2026-10-05): long blocks ending at a bare `Fig.`/`Figure`/`Table` label are now classified as incomplete cross-references, covering a page/column cut that previously bypassed the numbered-label guard. Quality tests **262/262**, typecheck, and diff check pass; no full-corpus rerun was performed.
- Focused extraction regression (2026-10-05): reran `ergonomics-job-rotation-robotics` (4 sampled units) after the bare-label guard. The `... shown in Fig.` unit stayed pre-model/source fallback with the explicit figure-label completeness reason; it was not sent to MADLAD. Other failures were existing mixed-script/fragment cases. Artifact: `post-bare-fig-v1.{json,md}`; this is a one-paper diagnostic, not a corpus metric.
- Cascade audit hardening (2026-10-05): citation alignment is now shared by the audit diagnostic and selective-cascade benchmark. Cascade results expose `citationAlignment` and `acceptedForCascade`; a model output that drops eligible source citation occurrences is not counted as safe for cascade, while production routing remains unchanged. Targeted tests **264/264**, typecheck, and the citation diagnostic pass (CAT v3: 5 rows, 1 flagged).
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
- Citation-integrity follow-up (2026-10-05): attempted a generic citation-occurrence-count gate against the CAT v3 citation-shift example, but existing tests showed false rejects for valid superscript, clustered, and HTML-wrapped citation forms. The experimental code was reverted; production quality behavior is unchanged. Citation alignment remains a diagnostic/manual-review gap rather than a new unsafe heuristic.
- Citation diagnostic (2026-10-05): added audit-only `scripts/diagnose-citation-alignment.ts` and `npm run audit:citation-alignment`. It compares bracketed/inline citation token inventories without changing production routing. On CAT v3 it flags only the GPT-3 cognitive-psychology row (missing citation tokens `2` and `6`); ordinary numeric/measurement rows are not flagged. This is a review aid, not an automatic acceptance gate.
- Citation diagnostic expansion (2026-10-05): ran the audit-only citation alignment tool on CAT v1/v2/v3 artifacts. v1 single/tail had 0 flagged rows; v2 had 2 flags, both structurally contaminated rows; v3 had 1 flag, the manually identified GPT-3 citation-shift row. This supports using the diagnostic after source-integrity filtering and not as a standalone gate.
- Citation diagnostic v2 (2026-10-05): the audit script now excludes incomplete sources itself and ignores Figure/Table numeric labels. Rechecking CAT v2 yields 1 eligible, 4 source-excluded, 0 citation flags; CAT v3 yields 5 eligible, 1 citation flag (the known GPT-3 row). Typecheck passes.
- Regression after citation diagnostic v2 (2026-10-05): `npm test` passed 69 files / 636 tests. The diagnostic remains audit-only and does not affect production translation behavior.
- CAT benchmark deduplication (2026-10-05): `scripts/benchmark-cat-translate.py` now deduplicates whitespace-normalized source text by SHA-256 before applying `CAT_MAX_ROWS`, and records `duplicateSourceCount`. This prevents overlapping report generations from filling a supposedly source-disjoint cohort; Python compilation and diff checks pass.
- CAT source-disjoint v4 (2026-10-05): after excluding source hashes used by v1-v3, evaluated five new clean rows across HCI, cognitive/AI, neuroscience-adjacent systems, and computational linguistics. CAT automatic gate accepted 5/5; manual review found 3 usable severity-0 rows and 2 severity-2 citation omissions (`keyboard 11`, inline Xapian citation `2`). Citation diagnostic flagged exactly those two. Artifact: `cat-source-disjoint-auth-v4-manual-review.json`; no production cascade change.
- CAT cohort summary (2026-10-05): consolidated manual reviews for source-disjoint CAT v1-v4 in `cat-source-disjoint-summary-v1-v4.{json,md}`. Across 20 reviewed rows, 15 remain after source/fallback exclusion; 11 were manually safe for a bounded cascade and 4 had severity >=2 (two citation omissions in v4 plus the prior procedure-scope shift). This is diagnostic evidence only, not a corpus estimate or production approval.
- CAT source-disjoint v7 (2026-10-05): evaluated five additional source-hash-disjoint ordinary-body rows from `interpreting-neural-networks` with CAT-Translate 3.3B. All 5 outputs were complete and manually judged usable (severity 0); quality evaluator accepted 5/5 and citation diagnostic flagged 0. Aggregate v1-v7 is 40 rows, 30 clean after source/fallback exclusion, 26 manually safe clean rows, and 4 severity>=2 rows; CAT remains production-disabled because the held-out cohort is still small and prior severe citation/scope failures remain. Artifacts: `cat-source-disjoint-auth-v7.json`, `cat-source-disjoint-auth-v7-manual-review.json`, `cat-source-disjoint-summary-v1-v7.json`.
- Cascade citation safety (2026-10-05): selective alternate-model acceptance now applies the existing citation-alignment diagnostic at the production opt-in boundary. Eligible source citation occurrences missing from an alternate output are rejected as `citation occurrence missing`; incomplete sources remain governed by the existing source-integrity gate. Added regression coverage for numeric citation omission; targeted 20/20 tests and typecheck pass. CAT remains audit-only/disabled.
- Regression verification after cascade citation guard (2026-10-05): full Vitest passed **70 files / 645 tests**; citation-alignment and alternate-engine tests pass, and the worktree remains clean after commit `e30a70e`.
- CAT source-disjoint v8 (2026-10-05): evaluated five additional source-hash-disjoint ordinary-body fallback rows. Two long e-textile prose rows were manually usable (severity 0); the speech-in row had a severity-2 procedure-scope shift (`utterances` rendered as `sessions`) and was rejected by the quality guard; two GPT-3 rows were correctly excluded as incomplete list/question sources. Automatic quality accepted 2/3 clean rows; citation diagnostic flagged 0. Aggregate v1-v8 is 45 rows, 33 clean, 28 manually safe, and 5 severity>=2. CAT remains production-disabled.
- CAT terminology-prompt probe (2026-10-05): a one-row retry with explicit `utterance`/`session` terminology instructions was invalid as a quality experiment because CAT emitted a Japanese translation of the instruction suffix before the source. The result is retained with `experimentValidity.valid=false`; it is not counted in CAT metrics. `benchmark-cat-translate.py` now records prompt suffix/system prompt/acronym-protection metadata in every audit report to prevent this class of unnoticed contamination.
- CAT terminology system-prompt probe (2026-10-05): moving terminology guidance to the CAT system message avoided prompt-text contamination. A single fixture-specific system prompt that explicitly named `utterance`/`session` passed the quality gate and preserved the distinction, but is not generalizable production evidence. A second single-row probe using only generic terminology guidance still produced `utterance → session` twice and was rejected. No production prompt change was made; artifacts `cat-terminology-system-v1*.json` and `cat-terminology-generic-system-v1*.json` record both results.
- CAT dynamic terminology hint probe (2026-10-05): added an audit-only, frequency/shape-based extractor for repeated content words and passed those hints through the CAT system message. On the same speech-in fixture, the generic dynamic hint still left a participant-role shift and was rejected (0/1). No production prompt or routing change was made; this confirms that simple automatic repeated-word hints are insufficient.
- CAT literal terminology system-prompt probe (2026-10-05): a generic instruction to retain ambiguous technical nouns in English parentheses did not resolve the participant-role shift (0/1 accepted). No production prompt change was made. Together with the dynamic-hint probe, this indicates the remaining CAT error is semantic role alignment rather than simple terminology omission.
- CAT repeated-term placeholder probe (2026-10-05): mechanically protecting repeated content words caused untranslated labels (`participants`, `button`, `figure`, etc.) and a detached figure reference; quality accepted 0/1. This confirms broad repeated-term placeholder protection is harmful for CAT and must not be promoted to production.
- Sentence-alignment false-reject fix (2026-10-05): participant-role scope checking now tolerates a one-sentence boundary shift only when source/output sentence counts differ and an adjacent output sentence explicitly contains the participant role. Same-count aligned role shifts remain rejected. This removed the false rejection on the CAT speech-in system-prompt probe (quality 0/1 -> 1/1) without weakening the existing direct role-shift regression. Quality suite 266/266 passes.
- Regression verification after sentence-alignment guard (2026-10-05): full Vitest passed **70 files / 646 tests** and typecheck passed. The CAT system-prompt fixture remains accepted after the generic alignment fix; direct same-count participant-role regressions remain covered.
- Alignment evidence artifact (2026-10-05): re-evaluated the unchanged CAT system-prompt output after the role sentence-alignment fix; `cat-terminology-system-v1-quality-after-alignment.json` records the 1/1 acceptance and explicitly identifies this as a gate correction, not a model-output change.
- CAT gate recomputation after sentence alignment fix (2026-10-05): re-evaluated stored v1-v8 outputs without regeneration. Across the available artifacts, 33 clean rows yielded 31 automatic quality accepts; outputs were unchanged. This is gate-only evidence and does not replace manual review (which still reports 5 severity>=2 rows in the broader v1-v8 cohort summary).
- Sentence-alignment false-reject follow-up (2026-10-05): utterance/session scope checking now also tolerates neighboring Japanese sentence alignment when counts differ and an adjacent sentence preserves 発話/発言. Same-count and paired current/previous session shifts remain rejected. Quality suite 267/267 and typecheck pass.
- Regression verification after utterance/session alignment guard (2026-10-05): full Vitest passed **70 files / 647 tests** and typecheck passed; worktree clean.
- Verification correction (2026-10-05): reran Python compileall with the project-root path after an earlier relative-path typo; `translation-server/.venv/bin/python -m compileall -q translation-server/engines translation-server/server.py` succeeds.
- Fresh post-diagnostic benchmark (2026-10-05): ran `dont-mind-me` only (4 sampled units) against the ready server after fallback-detail instrumentation. All 4 completed with `fallbackStage=none`; no new rejection-detail rows were produced. Artifact: `test-data/real-papers/reports/translation-diagnostic-post-reason-v1.{json,md}`. This is a focused smoke check, not a corpus metric.
- Fresh diagnostic benchmark (2026-10-05): `speechin` 4-unit smoke run produced 2 successful translations and 2 pre-model source-structure fallbacks; no post-model failure. `interactive-jewellery` 4-unit smoke run produced 2 pre-model structural skips and 2 model outputs, one carrying a non-fallback diagnostic `scientific invariants missing: 9, 11`. This confirms the new reason detail is visible in fresh reports and that source-structure issues remain distinct from model rejection. Artifacts: `translation-diagnostic-speechin-v1.{json,md}` and `translation-diagnostic-interactive-jewellery-v1.{json,md}`.
- Benchmark reason semantics fix (2026-10-05): `benchmark-real-paper-translation.ts` now leaves `fallbackReason` empty whenever `fallbackStage=none`; non-fatal quality diagnostics remain in `quality.reasons`. This prevents accepted translations such as `scientific invariants missing: 9, 11` from being miscounted as fallback causes. Focused typecheck/quality tests pass; fresh 2-unit `interactive-jewellery` run confirms one structural pre-model fallback has a reason and one accepted unit has no fallback reason.

## CAT-Translate fallback review

Manual source/output review was completed for the four-row fallback-enriched CAT-Translate 3.3B artifact (`test-data/real-papers/reports/cat-focused-fallback-v1-manual-review.json`). All four rows had no severity>=2 semantic error; three were gate-accepted and the long statistical row was semantically correct but rejected by the existing degenerate-output gate, indicating one false reject. The interactive-jewellery row remains a source continuation fragment (severity 1 extraction/unit issue). This supports CAT as a bounded audit candidate, but the sample is too small to enable production cascade; expand with held-out fallback rows and numeric/claim review first.

## CAT-Translate expanded fallback review

A second audit-only run evaluated all seven post-model fallback rows from the focused cohort with cached CAT-Translate 3.3B (`cat-focused-fallback-v2.json`). Manual review found 6/7 rows without a severity>=2 issue; one SpeeChin methods row changed “current and previous utterances” to “current and previous sessions” (severity 2 scope shift). The existing quality gate also false-rejected one semantically faithful long statistical row. This rules out enabling CAT solely on automatic acceptance: it can improve readability, but relation/scope review and a conservative cascade policy are still required. See `cat-focused-fallback-v2-manual-review.json`.

## Quality-gate false reject fix

The CAT fallback review exposed a generic false reject: repeated Japanese predicates in a faithful statistical comparison list were classified as phrase degeneration. `evaluateJaTranslation` now permits the shape-only repetition signal when the source contains three or more explicit comparative predicates and the output is sentence-level Japanese; all other degeneration checks remain active. This is a narrow source-structure condition, not a vocabulary exception. Quality tests remain 267/267, and the reviewed CAT statistical row now scores without `degenerate output`.

## Focused cohort after comparative-list gate fix

Re-ran the same 4-paper/48-unit cohort as `focused-cohort-current-v2` after the TypeScript quality-gate change. The cohort remained 19 ordinary-body units with 4 reader-visible fallbacks (21.1%) and 7 post-model fallback rows. This is expected: the changed gate currently affects client/cascade quality evaluation, while the server-side MADLAD fallback classification remains unchanged. The change removes a proven false reject from alternate-candidate evaluation but does not by itself solve the primary server fallback rate.

## Server-side comparative-list gate

Applied the same source-aware comparative-list repetition guard to the Python MADLAD server. This keeps the server and TypeScript quality gates aligned: repeated predicates in a source list of four or more comparisons are not treated as decoder looping when the output is sentence-level Japanese. All translation-server Python tests pass (246 tests). The running server must be restarted before this change is active; no benchmark restart was performed automatically.

## Post-restart server probe

Restarted the translation server from the updated Python source (model version reports the current v84 pipeline) and probed the known 1,161-character statistical list unit directly. It still returned `partial_unit_fallback`, so the remaining failure is not solely the generic phrase-repetition gate; further attribution must inspect the unit-level reason (protected scientific spans, decode output, or another invariant) before weakening additional server checks.

## Unit-level fallback attribution

Saved `test-data/real-papers/reports/server-stat-unit-diagnostic-v1.json` from a single post-restart request for `dont-mind-me:b-4c16bae3`. The server reports `unit_1` and `unit_3` as `translation_quality_rejected:degenerate translation output`; both are complete comparative-statistics sentences, not extraction fragments. The other five units return Japanese. Their preserved source units and partial outputs show that the model can produce malformed comparative lists (including altered p-values) before the fallback gate, so simply permitting repetition would be unsafe. The next fix should target a structured comparative-list rescue or alternate model, with numeric verification, rather than weakening the gate.

## Comparative-statistics rescue

Added a bounded server rescue for comparative-result sentences that fail quality: when three or more comparative predicates are present, retry once with only compact inline statistic literals visible to MADLAD. The normal scientific invariant gate still rejects altered or missing values; this does not globally expose placeholders. Python tests pass (246). This requires a translation-server restart before runtime validation.

## Three-item comparative-list attribution

The server log from the diagnostic request showed the failing units each had three repeated comparative predicates (`less natural`, `less normal`, `less cool`), so the previous four-item threshold never applied. Lowered the source-structure threshold to three in both gates and in the bounded inline-statistics rescue. Tests remain green (267 TypeScript quality tests; 246 Python translation-server tests). Runtime revalidation is pending a clean server restart because the prior process was handling queued requests when interrupted.

## Comparative rescue safety correction

Runtime validation after the three-item threshold showed the rescue could return a no-fallback response while its partial unit text omitted parenthesized p-values. Added an explicit multiset check for all numeric values in the comparative-statistics retry; a rescue candidate is now rejected if any value is missing or changed. This preserves the original safe fallback behavior until a candidate keeps every statistic. Python tests remain green (246).

Added unit tests covering the comparative-statistics rescue integrity contract: all source numeric values must be present and unchanged; missing or altered values are rejected. The focused MADLAD quality test file now passes 74 tests.

Added `scripts/diagnose-comparative-rescue.py` to replay the known statistical unit against a running server and persist the complete response. It is diagnostic-only and does not alter production settings; use it after restarting the server to verify fallback reason, unit indices, and elapsed time consistently.

## Runtime replay safety finding

The replay script exposed an unsafe case: the server returned `fallback_stage=null` while a partial comparative-list output changed several p-values (for example source `0.0/0.001` becoming `0.1/0.2`). Added a global server-side statistical numeric-drift guard so any missing/changed parenthesized statistic or p-value rejects the candidate. This is a safety correction; it may increase fallback until a semantically valid alternate candidate exists. Quality tests now include 75 MADLAD cases; full Python suite should be rerun after the next server restart.

Full translation-server test suite after the global statistical numeric-drift guard: **248 tests passed**. Candidate selection, microbatch, citation protection, and segmenter regressions remain green.

Added one bounded beam-search retry after an inline-statistics greedy rescue fails. The beam candidate is accepted only when every source statistic/p-value is preserved exactly; otherwise the original fallback remains. MADLAD quality tests pass (75).

- Borderless table recovery (2026-10-06): `buildTableRegionEvidence` now searches a bounded window above and below each caption and can promote a compact set of aligned, non-sentence rows when vector rules are absent. This fixes captions placed below borderless tables (e.g. OzCHI Table 3) without promoting sentence-shaped prose. OzCHI table-region recall improved 0.8→1.0; the full 113-paper extraction run retained titleExact 105/113 (92.92%) and all 4 papers with table-region ground truth at 1.0. Focused extraction tests (111) and typecheck pass. Commit: `684f087`.

- Body-sized numbered subsection recovery (2026-10-06): generic candidate generation now treats short hierarchical labels such as `4.3 Battery` as headings when followed by prose, even when their font matches body text. Numeric matrix rows are explicitly excluded from this rule. Thermal Earring heading recall improved 0.973→1.0; focused extraction/reading-order tests (110) and typecheck pass. Commit: `51e5915`.

- Masthead/title geometry pass (2026-10-06): adjacent same-baseline title spans are joined by the title resolver, and page-one email-only / affiliation-marker-only native rows are excluded from canonical author/affiliation metadata before inherited role hints are applied. This is intentionally conservative: combined author+institution lines (common in ACM/IEEE mastheads) still need a dedicated geometry-aware splitter; no paper-specific rule was added. Typecheck and focused extraction/reading-order tests (104) pass. Commit: `c4aa807`.

- Flattened masthead recovery (2026-10-06): the Paper projection now recognizes a conservative all-caps `AUTHOR, institution...` pattern when a PDF has flattened every author into an affiliation block, recovering separate author names and cleaned affiliation tails. It requires at least two matching author/institution pairs and leaves canonical evidence unchanged. The extraction benchmark now also uses verified catalog authors when a fixture has no richer hand-authored labels. Typecheck and pipeline tests (29) pass. Commit: `584252c`.

- Masthead manual-review corpus (2026-10-06): added `scripts/build-masthead-review-sample.ts`, which generated `test-data/real-papers/reports/masthead-manual-sample-v1.json` for all 113 available PDFs. Each row contains page-one native title/author/affiliation candidates with bounding boxes, catalog title/authors where available, and pending manual labels. 27 rows have verified catalog author metadata; this artifact is for visual/semantic review and is not an automatic accuracy claim.

- Author-list extraction pass (2026-10-06): page-one author rows with superscript markers or comma/`and`-separated title-case names now override stale paragraph hints; projection expands them into individual names. This fixed the observed OSWORLD author list (17/17, F1 1.0), marketing platform list (4/4, F1 1.0), and recovered 4/5 visible HFE names (F1 0.8; the fifth catalog name is not present in the visible masthead). The benchmark now measures the Paper projection rather than raw layout blocks. Typecheck passed. Commit: `ff0efda`.

- Publisher masthead recovery (2026-10-06): added middle-dot author separators and a post-grouping author-list recheck for stale paragraph hints; filtered publisher labels such as `ORIGINAL ARTICLE` and copyright lines from projected authors. Quantified Factory Worker author F1 improved 0→1.0. Focused tests and typecheck pass. Commit: `f504291`.

- Duplicate title collapse (2026-10-06): title resolution now removes an exact repeated title caused by duplicated native masthead lines, while preserving legitimate subtitles and distinct title spans. HFE scoping-study title now resolves to one copy. Pipeline tests (29) and typecheck pass.

- Weak native title fallback (2026-10-06): when a PDF promotes a short section label (for example a localized “Abstract” heading) as the only title candidate, a substantially longer verified metadata title can now repair the identity. The rule requires a short native title and a large length gap; it does not replace normal native titles.

- Truncated title prefix repair (2026-10-06): title resolution now recognizes a native title sharing its first three normalized words with a longer metadata title when only a few words are missing (for example `Human Factors “Ergonomics” Facilities`). Quotes and punctuation are normalized for comparison; the native text remains the source evidence.

- Author projection normalization (2026-10-06): author lists now preserve comma/middle-dot boundaries, split PDF producer camel-case joins such as `ZhongyuHu`, remove standalone superscript numbers, and filter publisher labels/title-like nodes from projected authors. This targets the remaining catalog-author F1 failures without changing canonical source evidence. Typecheck passed. Commit: `9770eec`.

### 2026-10-06: long marker-separated author masthead regression fixed

The author projection filter had a 220-character cutoff. This excluded valid long author rows such as the 17-author OSWORLD masthead before `expandAuthorLine` could split marker-separated names, yielding an empty public author list despite the canonical node being correctly classified. The cutoff is now 500 characters; ordinary prose remains excluded by the existing punctuation/role/separator checks. OSWORLD now projects all 17 authors again. Typecheck and the focused PDF extraction/reading-order suite pass (104 tests).

The 113-paper extraction percentages remain automated ground-truth comparisons, not visual inspection. The masthead sample artifact is a manual-review queue; it must not be described as completed visual QA.

### 2026-10-06: flattened uppercase affiliation rows

A second author extraction failure was reproduced in `modeling-human-behavior-cognitive-uncertainty`: the PDF flattened `ANDREW FUCHS, institution` and `ANDREA PASSARELLA and MARCO CONTI, institution` into affiliation-role nodes, so the public author list was empty. A generic institution-tail/name-prefix recovery now handles uppercase publisher rows and conjunction-separated names, without changing canonical roles. The fixture now recovers all three names; typecheck and the 29-case PDF pipeline suite pass. This is a targeted generic recovery, not a claim that all masthead formats are solved.

### 2026-10-06: publisher location/email contamination in author projection

A conference PDF (`how-content-volume-landing-pages`) exposed a generic masthead split where author lines included an email or a city/country continuation (`Ruti Gafni* email`, `Tel Aviv, Israel Nim Dvir`, `Albany, NY, USA`). Projection now removes email tokens before author expansion, strips recognized location prefixes only when they precede a name, and rejects sentence-shaped/location-only author candidates. The public author list is now `Ruti Gafni`, `Nim Dvir`; typecheck and the 29-case PDF pipeline suite pass. This remains an extraction projection repair; affiliation cleanup is still incomplete for some publisher layouts.

### 2026-10-06: affiliation projection normalization

Affiliation projection now removes email tokens and footnote-only labels (`corresponding author`, equal-contribution notes), normalizes marker punctuation, and applies the same cleanup to recovered masthead affiliations. This prevents contact metadata from appearing as an institution in the public Paper object. Typecheck and the 29-case PDF pipeline suite pass.

### 2026-10-06: full 113-paper extraction rerun

The explicit `--all` extraction benchmark completed after the author/affiliation projection fixes. Title exact match is 108/113 (95.6%), with all 113 having a known title comparison. The five misses are primarily native non-English titles compared with English catalog metadata (Russian/Serbian/Indonesian cases) plus one English spelling/wording variant; they require language-aware ground truth handling rather than blindly replacing healthy native titles. Author metrics are available for 27 catalog-author papers: mean F1 0.693, 12 perfect; remaining failures are publisher-specific masthead layouts and remain under investigation. The generated report was copied to `/tmp/extraction-113-latest.json` for diagnostics and the ignored working report was restored. No visual review is implied by these automated figures.

### 2026-10-06: split masthead continuation guard

A generic continuation candidate was added for publisher layouts that place a middle-dot-prefixed author continuation in a paragraph-role node on the same baseline as the first author row. The candidate is restricted to short name-shaped text with multiple capitalized name pairs; it does not relabel canonical nodes. Initial author extraction remains stable for `ergonomics-flight-deck-applications`; the remaining continuation inclusion needs a dedicated fixture assertion before claiming full recovery. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: initialed continuation names recovered

The split masthead guard initially missed continuation rows containing middle initials (`Katherine L. Plant`, `Neville A. Stanton`). The name-shape evidence now allows an optional initial, and `ergonomics-flight-deck-applications` projects all six authors instead of only the first three. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after split-row repair

The 27-paper author benchmark was rerun after the initialed continuation fix. Mean author F1 improved from 0.693 to 0.786; perfect papers increased from 12/27 to 16/27. The remaining 11 failures are concentrated in social-influence, cognitive dual-task, several marketing mastheads, and one clinical review; their layouts need separate generic diagnostics. The benchmark artifact is `/tmp/author-27-after-cont.json`; the tracked working report was restored.

### 2026-10-06: institution-labelled author rows

`social-influence-social-advertising` used affiliation-role rows for `EYTAN BAKSHY, Facebook` and `DEAN ECKLES, Stanford University & Facebook`, while another author block concatenated `RONG YAN` and `ITAMAR ROSENN`. A strict uppercase name-prefix parser now recovers institution-labelled author rows and separates adjacent all-caps names without treating organization names as authors. The fixture now projects all four authors. Typecheck and the 29-case pipeline suite pass; the 27-paper aggregate will be rerun after this change.

### 2026-10-06: citation-style author noise filtered

The cognitive dual-task fixture revealed that the PDF resolver marked bibliography-style short forms (`Castaño LAA`, `Arai H`, etc.) as author nodes alongside the real masthead. Projection now removes mixed-case names ending in citation initials, organization-like tokens, and duplicate names, while retaining full names with legitimate middle initials. The fixture now returns the full masthead names without the citation list noise. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: masthead location row excluded

`conversation-analysis-user-experience` had `Palo Alto, CA 94304-1314 USA` classified as an author row. The projection now excludes location-only masthead candidates while retaining the two real authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after location/citation cleanup

Reran the 27-paper author benchmark after the masthead location and citation-noise fixes. Mean author F1 is now 0.864 (previous 0.812), with 19/27 perfect papers. Remaining failures are eight layouts: two clinical reviews, four cognitive/marketing mastheads, and two marketing publisher formats. The temporary report was restored after measurement.

### 2026-10-06: clinical masthead boundary diagnosis

The clinical scoping fixture now recovers its four native title-page authors cleanly. Two catalog names (`Margaret Codd`, `Mary Browne`) are not present in the recovered title-page text; they appear only in a citation-style `et al.` line, so adding them from metadata would be unsafe extraction overreach. This is recorded as a native-text/fixture limitation for later PDF geometry investigation, not silently patched.

### 2026-10-06: benchmark ground-truth mismatch corrected

`hfe-healthcare-patient-safety-review` was not an extraction failure: its catalog incorrectly listed `Hassan Hignett / others`, which belongs to a different paper. The PDF-native masthead contains six authors (`Xuanyue Mao`, `Pengli Jia`, `Longhao Zhang`, `Pujing Zhao`, `Ying Chen`, `Mingming Zhang`), and the catalog ground truth was corrected after title/PDF verification. The single-paper benchmark now reports author F1 1.0. This prevents a metadata error from driving extraction changes.

### 2026-10-06: corrected 27-paper author benchmark

After correcting the mislabeled patient-safety catalog entry, the 27-paper author benchmark is 0.901 mean F1 with 20/27 perfect papers. Seven remaining cases are either genuine missing native author rows or publisher-specific formatting; no further broad heuristic was added from aggregate scores alone. The temporary report was restored after measurement.

### 2026-10-06: marked author names and keyword contamination

The Frontiers marketing fixture had dagger-marked authors (`Maria Pilar Martinez-Ruiz1*† and Karin S. Moser2†`) projected with markers/digits, while the keyword paragraph was misread as an author continuation. Marker-part cleanup now removes footnote digits/symbols and leading conjunctions, and continuation candidates exclude keyword rows. The fixture now projects exactly the two authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: post-marker 27-paper check

The post-marker 27-paper run is 0.896 mean author F1 with 18/27 perfect papers. This is slightly below the previous 0.901 run because marker cleanup changes exposed additional catalog/layout mismatches in clinical and marketing fixtures; no aggregate-only heuristic relaxation was made. The temporary benchmark report was restored. Next work should compare the affected rows by source content before changing projection rules.

### 2026-10-06: author projection bounded by masthead region

`marketing-unavailable-choice` contained later reviewer/editor names as author-role nodes. Projection now derives the first page body/abstract y-boundary and only projects author nodes above that masthead boundary. The fixture now returns exactly Jing Tian, Rong Chen, and Feng He; the cognitive dual-task masthead remains intact. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after masthead boundary

The 27-paper benchmark after the masthead y-boundary repair reached mean author F1 0.918, with 19/27 perfect papers. `marketing-unavailable-choice` left the failing set. Remaining failures are eight layouts, including two catalog/PDF metadata cases and several publisher-specific mastheads. The temporary report was restored after measurement.

### 2026-10-06: sidebar editor/reviewer exclusion

`marketing-neurophysiology-consumer-motivation` mixed editor/reviewer sidebar names with the article masthead. A minimum masthead width guard excludes narrow sidebar author-role nodes while retaining the full-width article row. The PDF confirms five article authors (`Sanchit Pawar`, `Asle Fagerstrøm`, `Valdimar Sigurdsson`, `Aurelija Burinskiene`, `Erik Arntzen`); the catalog ground truth was corrected to include Aurelija. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: narrow author-row regression avoided

A global minimum-width filter intended to remove Frontiers sidebar reviewers caused regressions across valid narrow-column publisher mastheads (27-paper mean F1 fell to 0.837). It was removed; the masthead-boundary and label/keyword safeguards remain. The corrected 27-paper benchmark returned to mean author F1 0.921 with 19/27 perfect papers. Sidebar reviewer handling remains a targeted follow-up rather than a global width rule.

### 2026-10-06: name-only affiliation masthead rows

`marketing-health-goals-nudging` stored `Jeroen S. Benjamins` and `Femke de Boer` in an affiliation-role row because the publisher separated the name list from its numbered institution block. A strict name-only affiliation recovery now handles short comma/and-separated rows without accepting institution-shaped text. The fixture now projects all five catalog authors. Typecheck and the 29-case pipeline suite pass.

### 2026-10-06: author benchmark after name-only affiliation recovery

The 27-paper benchmark after the name-only affiliation change is 0.915 mean author F1 with 18/27 perfect papers. The targeted health-goals fixture is corrected, while social-influence and several publisher formats still need source-level review; aggregate score alone is not used to add another heuristic. The temporary report was restored after measurement.

### 2026-10-06: linguistics masthead email noise

`syntax-prosody-correlation` had a continuation author row beginning with a comma and a separate brace-wrapped email row classified as author. Author expansion now trims leading punctuation and rejects brace/email candidates. The fixture projects Arne Köhn, Timo Baumann, and Oskar Dörfler only. Typecheck and the 29-case pipeline suite pass.

- Masthead contact-row cleanup (2026-10-06): affiliation-derived author recovery could reintroduce brace-wrapped email rows after the primary author filter. The projection now excludes contact-only rows in both recovery and affiliation outputs. `syntax-prosody-correlation` projects Arne Köhn, Timo Baumann, and Oskar Dörfler only. Typecheck and the 29-case extraction pipeline suite pass; automated metrics remain distinct from visual QA.

- Masthead label-aware filtering (2026-10-06): author projection now uses nearby heading labels and column geometry to suppress editor/reviewer/correspondence metadata, while retaining adjacent real author rows; affiliation-derived recovery also rejects taxonomy/category rows. On the 27-paper catalog-author subset, automated author F1 improved 0.926→0.939 (21→22 perfect papers). Remaining failures are publisher-specific layouts and require visual review; this metric is not a claim of complete extraction quality.

- Ground-truth and reviewer-label cleanup (2026-10-06): corrected two catalog entries after comparing their native title pages: the Frontiers dual-task paper now lists its nine article authors (editor/reviewer names were previously included), and the online-context paper now lists Maria Pilar Martinez-Ruiz and Karin S. Moser instead of a placeholder. Projection also recognizes label rows emitted as affiliation/paragraph roles, suppressing nearby editor/reviewer names without removing adjacent author clusters. Remaining cases include split multi-part names and native reading-order loss; they need further geometry-level work and visual review.

- Author-list continuation probe (2026-10-06): added a conservative marker-and-comma signature for paragraph-role author continuations (numeric affiliation markers, short pre-abstract line, no sentence punctuation). It passes typecheck and the 29-case extraction suite. The dual-task Frontiers PDF still exposes a split `Camila Vieira` / `Ligo Teixeira` name through canonical reading order, so this remains an unresolved geometry/line-grouping case rather than a catalog problem.

- Visual masthead inspection (2026-10-06): rendered the Frontiers dual-task page and confirmed the source PDF visually contains the full `Camila Vieira Ligo Teixeira` line; the canonical pipeline currently separates it across two roles/lines and also exposes sidebar editor/reviewer content. Added a conservative marked-author paragraph recovery hook, but the split name remains unresolved, so further work must target canonical line grouping rather than catalog matching. Typecheck and 29 extraction tests pass.

- Sidebar-aware masthead projection (2026-10-06): Frontiers-style pages with repeated `Edited by`, `Reviewed by`, `Correspondence`, `Specialty section`, or citation labels now identify the narrow left metadata band only when a wide right body band is also present. Author/affiliation candidates in that band are excluded without changing canonical nodes. This removed reviewer/editor contamination from the dual-task and neurophysiology cases and prevented keyword paragraphs from becoming authors. The 27-paper author benchmark improved mean F1 0.939→0.983 and perfect papers 22→24. Remaining failures are hfe healthcare scoping, the split multi-part Camila/Ligo name, and a cognitive motor masthead; all require further visual/geometry work.

- Cross-column author recovery (2026-10-06): BMJ HFE masthead lines `Margaret Codd` / `Mary Browne` were classified as a heading because the author list crossed columns. Projection now accepts a tightly constrained, short, numbered name-list heading as an author continuation. The sidebar-aware filter remains active. On the 27-paper author subset, mean F1 improved 0.983→0.990 and perfect papers 24→25; the HFE scoping paper now projects all six authors. Remaining imperfect cases are two complex Frontiers mastheads with split/duplicated names. Typecheck and 29 extraction tests pass.

- Frontiers sidebar/author gutter recovery (2026-10-06): native lines can combine a left sidebar name with a right-column author on one baseline. Projection now uses the node's x/width geometry to remove only the sidebar prefix, and merges a numbered paragraph-role prefix with a following author line when both share the masthead baseline. This recovered the full nine-author list for the dual-task paper and removed the reviewer Melissa Meade from the motor-memory paper. The 27-paper author subset now reaches mean F1 0.996 with 26/27 perfect. One remaining case (`marketing-neurophysiology-consumer-motivation`) has an actual author (`Aurelija Burinskiene`) sharing a mixed sidebar/body line and needs item-level provenance to distinguish the prefix safely.

- Final masthead mixed-line fix (2026-10-06): when a line spans the sidebar/body gutter, the projection now strips the left segment only when it is immediately below a sidebar label; a farther mixed line is retained as a genuine article-author candidate. This recovers `Aurelija Burinskiene` while still excluding reviewer `Melissa Meade`. The 27-paper catalog-author benchmark is now 27/27 perfect, mean F1 1.0. Typecheck and the 29-case extraction suite pass. This is still an author-metadata benchmark; full visual QA of all PDF content remains a separate task.
### Extraction corpus isolation benchmark (2026-10-06)

Added `npm run bench:pdf-extraction:isolated -- --all`, which evaluates each
catalog PDF in a child process. Native PDF.js/Poppler failures can therefore be
reported per paper instead of aborting the complete corpus. The first full run
processed 113 of 114 catalog entries; one entry (`precious-materials`) is
missing its PDF and was recorded as an acquisition failure. Among processed
papers, the automated title exact rate was 95.58% (108/113). The five misses
include catalog/native-title disagreements (language, transliteration,
truncation, or `behaviour` spelling), so this is not a visual accuracy score.
The run also exposed three small source-integrity losses (0.993–0.997), which
remain queued for visual review. This benchmark does not replace manual
comparison of body blocks, tables, figures, or affiliations.

### Provenance repair (2026-10-06)

Fixed a generic column-continuation path where a detached inline citation band
was appended to `LayoutBlock.text` but its native `lines` were left on the
separate block. That made the canonical text look lossy to integrity checks and
could also discard source bounding-box provenance downstream. The merge now
updates text and lines together. Focused extraction tests remain 29/29 passing;
the four affected-paper replay reduced two integrity failures to 1. The
remaining Russian-language and long rotated-page cases are native-layout cases
queued for visual review rather than being hidden by a looser metric.

### Rotated table containment (2026-10-06)

Visual review of `wear-scale` page 14 found a rotated inter-item correlation
matrix emitted as paragraph blocks, with its caption title projected as a
figure. Generic page-level rotated/numeric evidence now promotes the matrix
rows to skipped table blocks, and `rotation-aware-table-caption` evidence
projects the caption as a table block. This keeps the matrix and explanatory
footnote out of normal paragraph translation without relying on the paper ID.

The post-change corpus replay completed 113/114 catalog entries again (the same
missing `precious-materials` PDF), with table-region recall remaining 1.0 and
the minimum source-integrity rate improving to 0.99698. The rotated-table
change did not regress the title or structural metrics.

### Masthead and cross-column boundaries (2026-10-06)

Two generic reading-order issues found by the corpus suite were fixed: a large
first-page title containing the word `and` could be misclassified as an author
list, and continuation repair could absorb a body line into a heading or leave
an accepted same-page cross-column join unmarked. Title geometry now wins over
name-list heuristics, headings are hard boundaries, and verified overlapping
column joins carry explicit provenance. Focused regressions for the two title
cases and PPG Earring reading order pass.

### Full extraction regression suite (2026-10-06)

After these fixes, `npm run test:extraction-corpus -- --reporter=dot` completed
successfully: 2 test files, 232 tests passed, 0 failed (386.55s). This verifies
the automated extraction and reading-order corpus; it does not replace visual
review of every page or semantic review of affiliations and body text.

### Masthead projection repair (2026-10-06)

A real-paper replay of the Wear Scale PDF exposed two generic metadata errors:
correspondence/academic-rank labels were being returned as authors, and wrapped
institution lines emitted as paragraph roles were omitted from affiliations. The
projection now filters metadata labels, admits institution-shaped page-one
continuations before the body, and restores spaces lost at native font-run
boundaries. The regression asserts the two expected authors, excludes the labels,
and retains Iowa State University. Focused baseline tests (2/2) and typecheck pass.

The full extraction corpus was rerun after this projection change: 2 test files,
232 tests passed, 0 failed (380.77s), confirming no regression in the existing
reading-order and structural extraction checks.

### Caption-anchored table fallback (2026-10-06)

Visual inspection of education-learning-analytics page 20 found three ruled
tables whose native rule geometry was incomplete. The table-region builder now
uses a caption-anchored text-region fallback only when at least three nearby
table-scored, non-sentence rows exist; a caption alone cannot promote prose.
Typecheck and the focused education/Wear Scale/rotated-table tests pass.
The first full replay exposed and fixed a null-signature reference in this
fallback; the focused suite now passes 5/5 and typecheck is clean. A complete
232-test replay after that null fix remains pending before this change can be
called corpus-wide green.

The pending replay is now complete: 2 test files, 232 tests passed, 0 failed
(386.86s) after the null-signature fix.

### Title fragment fusion (2026-10-06)

Title diagnostics found a genuine two-line title split in the Indonesian
ergonomics paper and a two-column title split in the green-marketing paper.
The line grouper now fuses adjacent title columns and a preceding same-style
title prefix that was misclassified as an author. Diagnostics now recover the
full Indonesian title and `IMPACT OF GREEN MARKETING ON CONSUMER BEHAVIOUR`.
Focused reading-order regressions and typecheck pass; the full corpus replay
should be rerun after this title change.

The title-change replay completed successfully: 2 test files, 232 tests passed,
0 failed (431.54s). Title fusion did not regress reading order, tables, or other
structural extraction checks.

### Vector figure label containment (2026-10-06)

Visual review of the GPT-3 cognitive-psychology paper showed a vector-only
diagram whose labels shared the native text stream with the Linda vignette.
The generic vector-label evidence now also uses a dense graphics page plus a
nearby Figure caption to suppress short, punctuation-free labels above the
caption. It does not suppress sentence-shaped prose. The regression confirms
that `Decision-making Information search` is not sent as a pending translation
block; focused test and typecheck pass. A full corpus replay is still required
after this change.

The vector-label change replay completed successfully: 2 test files, 232 tests
passed, 0 failed (406.96s). Existing structural and reading-order checks remain
green after the new graphics/caption evidence.

## 2026-10-06 title extraction audit follow-up

- The 113-paper extraction report's `titleExact` metric compares the canonical title after metadata fallback; it therefore can hide a wrong native title candidate. The report shows many cases where `fusedTitle` is DOI/journal/event furniture while `canonicalTitle` is correct only because catalog metadata was supplied.
- Added generic masthead filtering in `src/services/pdfExtraction/resolver/titleResolver.ts`. When the first title candidate is an obvious DOI/URL/volume/event/journal masthead, a later article-title candidate on page 1 is preferred before metadata fallback. No publisher- or paper-specific rule was added.
- Added resolver regression tests in `src/test/pdfExtraction/titleResolver.test.ts`.
- `npm run typecheck -- --pretty false` and the PDF extraction test suite (64 tests) pass after this change.
- Remaining unresolved extraction case: malformed embedded-font PDFs (notably the Russian-title sample) still need macOS Vision OCR runtime validation; catalog metadata must not be treated as proof of native extraction quality.
- Added benchmark diagnostics `nativeTitleCandidate`, `nativeTitleExact`, and `titleUsedMetadataFallback`; this prevents the corpus score from confusing metadata repair with successful native extraction.
- A selected no-metadata replay found generic journal masthead candidates (e.g. volume/date lines) and malformed embedded-font title text; metadata-backed production now repairs tiny page-one mastheads, while native extraction remains explicitly reported as a failure.
- Full isolated rerun (113 available PDFs; one missing `precious-materials.pdf`) reports canonical title exact 107/113 (94.69%), but native title exact only 53/113 (46.90%) and metadata fallback on 56/113. This exposes the remaining extraction gap rather than hiding it.
- Added structural recovery for article title candidates misclassified as paragraph/title fragments after a publisher masthead; typecheck and 31 PDF extraction tests remain green. The medical Elsevier sample still requires further candidate-level tuning because its title is split (`Medical deep` + `learning—...`) beside journal furniture.
- Generic candidate fusion now reattaches a short affiliation-role prefix immediately left of a same-baseline title candidate, preserving geometry and adding evidence. This fixed the Elsevier sample without paper-specific text: `Medical deep` + `learning—A systematic meta-review` now resolves correctly with no metadata.
- Focused resolver/pipeline tests remain 31/31 green. The full corpus needs a fresh rerun after this candidate-layer change before updating aggregate native-title metrics.
- Post-change 113-paper rerun completed (113 available, one missing fixture). The aggregate canonical score is currently 103/113 and native evidence score 53/113; several remaining mismatches are language variants, malformed embedded fonts, or catalog-title disagreements. The new same-baseline repair is confirmed on the Elsevier split-title sample via no-metadata replay, but the corpus aggregate still needs per-case review before claiming improvement.
- Added generic year/volume/issue masthead signals to title resolver; focused tests and typecheck pass. Remaining corpus mismatches were reviewed as language/metadata disagreement, embedded font corruption, or unresolved publisher layout rather than patched with paper-specific rules.
- Full extraction/reading-order regression after title candidate changes: 232/232 passed (373s). Existing pdf.js canvas/TT/ColorSpace warnings remain non-fatal.
- OCR diagnostic on the malformed Russian-title PDF detects pages 1 and 10 via `brokenTokenHits=2` (page 1 has 2 symbol-joined broken tokens), so the macOS Vision OCR path will replace those pages rather than trusting corrupted pdf.js text. Actual Vision OCR output still requires a macOS runtime/app check.
- No-metadata replay of six remaining title cases: neuroscience, Elsevier meta-review, two medical imaging reviews, and ergonomics review resolve to plausible article titles; the medical imaging outputs include legitimate subtitles absent from catalog ground truth. The only clearly unrecoverable native case remains the malformed Russian embedded-font title, for which OCR is selected on pages 1 and 10.
- macOS Rust OCR path compiles successfully with `~/.cargo/bin/cargo test --manifest-path src-tauri/Cargo.toml ocr`; the repository currently has no OCR unit tests (0 tests matched), so actual Vision recognition output remains a runtime validation task rather than a compile/test failure.
- Direct Vision OCR CLI attempt is blocked by the installed CommandLineTools/Swift SDK mismatch: Swift compiler 6.2.0.19.9 vs SDK modules 6.2.0.16.14, plus duplicate SwiftBridging module definitions. The Rust Tauri OCR path still compiles; validating actual OCR output requires the matching Xcode toolchain or launching the app on the user's existing environment.
- Vision OCR runtime validation succeeded using `/Applications/Xcode-beta.app` toolchain on the malformed Russian-title PDF page 1. It recovered the Russian article title `Взаимосвязь прикладной лингвистики и лингводискурсивного анализа с практикой преподавания английского языка`, three author names, and institution lines from the page image. This confirms the production OCR strategy can repair the pdf.js embedded-font corruption; full app-level invocation still needs a user launch because the standalone check uses the same Apple Vision framework but not Tauri IPC.
- 2026-10-06: Native PDF診断で `Transla T ion` / `The r ole` のような語中単一glyph分割がページ分類をすり抜けるケースを確認。`splitWordHits` を追加し、同種の分割が2件以上あるページをgarbledとしてVision OCR対象にする汎用修正を実装。pageClass回帰を含む重点PDF抽出テスト **38/38**、typecheck pass。これによりOCR対象ページの検出精度を上げたが、Vision OCRの実機出力品質はmacOSアプリで追加確認が必要。
- 2026-10-06: 著者行の `First Last Second van den Surname` 形式を汎用分割し、同一native blockに結合された複数著者を分離。`interactive-jewellery` の `Maarten Versteeg` / `Elise van den Hoven` / `Caroline Hummels` を正しく投影する回帰を追加。author projection **2/2 pass**。所属列の混線は別の未解決課題として残る。
- 2026-10-06: 所属投影の列境界で生じた `Department of` やglyph間隔だけの罫線を公開affiliationへ出さない汎用品質フィルタを追加。短い未完接続句・罫線・単一glyph連結を除外し、著者/本文抽出を保全。author/pipeline **31 tests pass**、typecheck pass。複数行・複数列の所属再結合は引き続き課題。
- 2026-10-06: `interactive-jewellery` の所属座標を再診断。各行のx列自体は安定しているが、単純なページ内x帯結合は別機関（Duncan/University等）を誤結合するため採用せず破棄。所属再構築は著者マーカー・番号・列の縦連続性を同時に使う必要がある。保守的な現行出力を維持し、回帰 **31/31** pass。
- 2026-10-06: 所属番号が先頭行にだけ現れる複数行mastheadで、番号を同一x帯の後続行へ伝播してから投影する処理を追加。`interactive-jewellery` の所属断片数を12→4へ減らし、列の縦継続を保った。著者/pipeline **31/31 pass**、typecheck pass。機関名の意味的な分割（同一列に複数機関が並ぶ形式）はなお手動確認対象。
- 2026-10-06: ACM系の重なったmastheadで、native text内の `ACM Reference Format:` 著者列を汎用的な二次構造証拠として利用。PPG Earringで壊れた座標投影を6著者へ復元し、地名・所属・メールの著者混入を除去。author projection **3/3 pass**、typecheck pass。所属機関の列再構築は別課題。
- 2026-10-06: ACM `Reference Format` fallbackにより、座標が重なったmastheadの著者投影を修正。PDF extraction全体 **13 files / 70 tests pass**、typecheck pass。113本全体の再計測は大きな抽出変更時の方針に従い未実施。
- 2026-10-06: 番号付き所属が1つのnative blockへ潰れる形式（`1Institute... 2Center...`）を番号境界で分割。`neuroscience-rule-following` の5所属を個別投影できることを確認。author/pipeline **32/32 pass**、typecheck pass。番号なし・列混在の所属は引き続き要診断。
- 2026-10-06: affiliation公開フィルタを強化し、`Contents`/`Article history`、単一文字マーカーが多数混ざる列断片、短い非機関語を除外。既存著者・パイプライン回帰は維持。複数列の機関名自体を完全再構築する代わりに、確信のない文字列を公開しない方針を継続。
- 2026-10-07: 著者・所属変更後の代表4本（interactive-jewellery / power-over-skin / ppg-earring / neuroscience-rule-following）をisolated benchmark。4/4でcanonical titleExact、source integrity 1.0、figure/table relation 1.0。著者投影はACM重複mastheadと番号付き所属の回帰を維持。全113本のレポートはこの局所計測で上書きされるため、113本の旧集計値とは混同しない。
- 2026-10-07: 文字付き所属マーカー（`a Institute... b Department...`）を番号付き所属と同じ構造証拠として分割。medical-deep-learning-meta-reviewの混在1 blockを6所属へ復元し、ScienceDirect chromeを除外。author projection **4/4 pass**、typecheck pass。
- 2026-10-07: 文字付き所属マーカー修正後のPDF extraction回帰 **13 files / 71 tests pass**。既存の表・図・読み順・著者投影への副作用なし。typecheck pass。
- 2026-10-07: 著者・所属投影の修正（ACM参照形式の著者復元、番号/文字マーカー付き所属の分割、chrome/markerノイズ除去）後に、113本のisolated extraction benchmarkを再実行。取得済み113/114（`precious-materials`はPDF未取得）。canonical title exact **105/113 (92.92%)**、native title exact **53/113**、metadata fallback **56/113**。既存Ground Truth対象では heading recall/precision、figure/table caption、table region、reading-order がすべて1.0、source integrity平均 **0.99997**。これはタイトル・本文の全件目視検査ではなく、自動指標の回帰確認である。focused author/affiliation tests 4/4、pdfExtraction 13 files/71 tests、typecheck pass。未解決の所属投影例（interactive-jewellery/PPG）は、列重なりを含むため次のgeometry診断対象として残す。
- 2026-10-07: interactive-jewelleryの所属診断で、行ごとのx座標を独立クラスタ化すると短い折返し語（Sydney等）が別列へ混入することを確認。最初の複数項目行を列アンカーにし、後続語を最近傍列へ割り当てる投影へ変更。国名の列移動は次項目が国名でない場合だけ適用し、`Faculty of Design...Sydney Australia`、`Industrial Design...The Netherlands`、`Australian Research...Macquarie University` を保持する回帰を追加。pdfExtraction **13 files / 72 tests**、typecheck、diff check pass。所属の完全な意味復元（PDF側で列順自体が崩れたケース）は引き続き未解決。
- 2026-10-07: ロシア語タイトルPDFのnative textが `АПФАПФ&ПЛ&ПЛ` のようにPDF item境界をまたいで壊れるため、page-class signalの連結を空白区切りへ変更。item単位の `brokenTokenHits` を検出して `garbled` 判定し、Vision OCR対象へ送るようにした。実PDF page 1で `brokenTokenHits=4`、`garbled`、OCR対象を確認。`pageClass` **7 tests**、typecheck pass。OCR実行後のタイトル品質はmacOS Vision runtimeで別途確認が必要。
- 2026-10-07: 113本のtitle mismatch 8件を内訳確認。3件はPDFの可視タイトルがロシア語/セルビア語でcatalogの英訳と一致しないもの、1件はBehaviour/Behaviorの綴り差、1件はGround Truth側のAND/TND差。実抽出失敗として残るロシア語タイトルはToUnicode破損（`АПФАПФ&ПЛ&ПЛ`）で、前項のOCR routing修正対象。自動title exactをそのまま意味的正解率と解釈しない。
- 2026-10-07: 実PDF page 1をVision OCR相当で直接検証しようとしたが、ローカルSwift compilerとmacOS SDKのバージョン不一致（SDK swiftlang 6.2.0.16.14 / compiler 6.2.0.19.9）で一時Swift harnessが起動できなかった。アプリ側Rust Vision実装のコンパイル確認とは別の環境問題であり、OCR routing判定（実PDFをgarbled→OCR対象）は既にテスト済み。次回macOSアプリ実行時に実OCR出力を確認する。
- 2026-10-07: アプリが使用するRust/objc2 Vision OCR実装を `cargo check --manifest-path src-tauri/Cargo.toml` で検証し成功。`ru-RU` を含むVision呼び出しと座標変換コードはコンパイル可能。Swift単体ハーネスのSDK不一致とは切り分けられた。実OCR出力の目視確認には、現行Tauriアプリを起動して対象PDFを再抽出する必要がある。
- 2026-10-07: title resolverにも、PDF ToUnicode破損で生じる短い大文字glyphの重複＋記号（例 `АПФАПФ&ПЛ&ПЛ`）をdecoder garbageとして除外するEvidenceを追加。source言語がロシア語等でも正当なタイトルを一律除外しないよう、翻訳品質の`isGarbageTitle`全体ではなく専用geometry/text patternだけを使用。title resolver + quality **279 tests**、typecheck pass。
- 2026-10-07: `cognitive-dual-task.pdf` の所属ブロックに査読者（`Reviewed by:`, `Yi Sun, NIH...`）と本文断片が混入するケースをgeometry診断。所属正規化で明示ラベル境界、ラベル省略時の人名＋機関テール、lowercase本文断片を除外。結果から査読者情報が消え、author projection regression **6/6**、typecheck pass。残る `University of ... United States Campinas` の列混在は別のmarker/column再構成課題として記録。
- 2026-10-07: `cognitive-dual-task` のFrontiers型サイドバーが所属native blockへ混ざるケースで、superscript文字列分割を避け、body側x帯だけを列復元へ渡す補正を追加。`University of Massachusetts`（編集者所属）と査読者をaffiliation projectionから除外する回帰を確認。author projection **6/6**、typecheck pass。残る2列の所属同士の境界（University of Campinas / NIH等）はPDF native順序が交差しており、marker-aware groupingの追加診断対象。
- 2026-10-07: サイドバー混在所属のsuperscript分割でも、native itemからサイドバー除去後のmarkerSourceを作るよう変更。`cognitive-dual-task` で編集者/査読者混入は除去済みだが、同一本文列内の機関1〜4はまだ2ブロックへ連結されるため、修正を部分適用として記録。author projection **6/6**、typecheck pass。次はmarker位置と行順を使った機関境界復元を優先する。
- 2026-10-07: markerSource変更後のpdfExtraction全回帰を実行し、**13 files / 75 tests pass**。既存のheading、table、list、OCR classification、author/affiliation regressionに失敗なし。所属1〜4の完全分離は未達のため、全件benchmark値は更新せずfocused regressionとして扱う。
- 2026-10-07: marker順序を行内x順ではなくPDF native item順で読むようにし、`cognitive-dual-task` の機関1〜4を4所属へ分離。確認結果: Applied Kinesiology、Electromyography Studies、National Center、NIH Biomedical Centerが各別ブロックになり、編集者/査読者所属は除外。author projection **6/6**、typecheck pass。サイドバー混在専用経路として実装し、通常2段組への影響を回帰で確認する。
- 2026-10-07: numbered-affiliation順序復元後の全pdfExtraction回帰を再実行し、**13 files / 75 tests pass**、typecheck pass。サイドバー混在経路の追加でも既存の段組・表・見出し・OCR分類へ回帰なし。
# 2026-10-07: extraction manual-review sample generation

Generated `test-data/real-papers/reports/extraction-manual-sample-v1.json` with
1,719 candidates across all 113 available PDFs. The review sampler now records
short papers as `underSampled` instead of aborting; three papers had 9–11
candidates because they contain fewer extractable structural/body blocks. This
is a sampling-tool fix only and does not change production extraction.

# 2026-10-07: repeated top-margin URL contamination

The 113-paper review sample exposed a generic reading-order defect in
proceedings PDFs: a repeated URL at the top margin was being appended to the
preceding body paragraph across a page boundary (and sometimes became a
standalone paragraph). URL-only top-margin lines are now classified as header
chrome before continuation stitching. A real-paper regression for the CPCIG
conference PDF passes; inline body URLs are intentionally not changed.

# 2026-10-07: displaced table-header boundary

The manual-review sample also found a page-boundary merge in which a short
statistics header (`Variable N Mean Std. Min Max`) from a displaced table
column was appended to the preceding prose paragraph. A conservative geometry
plus header-token boundary now prevents that merge while leaving ordinary
sentences containing statistical terms unchanged. The marketing-platform real
PDF regression passes.

# 2026-10-07: repeated ISSN/header stream contamination

An Indonesian journal PDF exposed the same failure with a richer masthead:
`p-ISSN / e-ISSN / journal URL` lines at the top of each page were being
reclassified as paragraph candidates after layout reconstruction. The generic
candidate layer now preserves `header`, `footer`, `copyright`, and `chrome`
layout roles instead of allowing paragraph heuristics to override them. A
real-paper regression confirms the repeated journal URL no longer appears in
body paragraphs; legitimate ISSN text inside a bibliography entry remains
unchanged.

# 2026-10-07: affiliation author contamination guard

The production projection now rejects affiliation-derived author candidates
that contain generic institution/role phrases (for example `Research
Director`, `Industrial Design`, or `Interactive Computing`). This prevents
malformed column-interleaved affiliation text from being exposed as people.
The change is intentionally conservative: when no reliable author remains,
the projection keeps the author list empty rather than publishing an
institution as a person. Focused author projection tests and TypeScript
typecheck remain green; representative PDFs still require geometry-specific
follow-up for heavily interleaved publisher mastheads.
# 2026-10-07: interleaved multi-column masthead recovery

Added a conservative column-anchor recovery path in the canonical projection.
It uses author-sized text anchors and native item x positions to reconstruct
publisher mastheads whose same-baseline columns were flattened together. The
path is only used when the inferred result has multiple author and affiliation
groups; otherwise the existing resolver projection remains authoritative. The
PPG Earring regression now recovers all six authors and removes figure-caption
text from affiliations. PDF extraction tests: 27 suites / 75 tests passed.
# 2026-10-07: numbered institution spans in flattened mastheads

For publisher mastheads where a single affiliation node contains author names
followed by numbered institution phrases, projection now extracts distinct
capitalized `... Design` / `... Computing` institution spans and removes brace
contact aliases from the final affiliation label. This is gated on multiple
numbered spans and does not change normal single-affiliation rows. The
`dont-mind-me.pdf` regression now exposes Department of Computer Science,
University of Colorado, Industrial Design, Interactive Computing, and Georgia
Institute of Technology without author/contact contamination. PDF extraction
tests: 27 suites / 76 tests passed.
# 2026-10-07: flattened single-author report masthead

The generic author projection now recovers a single person when a report/book
template flattens `author -> role -> institution` into one affiliation node.
The pattern requires a person-shaped prefix, an academic role marker, and an
institution-shaped tail, so it does not relabel ordinary body prose. The
`ergonomics-human-factors-and-ergonomics` fixture now projects **Murali Krishna
Pasupuleti** and **National Education Services**. Author projection tests:
8 passed; TypeScript check passed.
# 2026-10-07: adjacent author names in flattened mastheads

Author projection now splits a comma-bounded four-token title-case run when a
publisher loses the delimiter between two adjacent two-token names. The
`dont-mind-me` masthead now exposes `James Clawson` and `Thad Starner`
separately while preserving the other authors. The rule is limited to
comma-bounded name-shaped runs and does not apply to institution prose.
# 2026-10-07: affiliation marker cleanup

Affiliation normalization now removes duplicated flattened superscript
markers (for example `1 1New Delhi`) and rejects isolated initial runs such as
`M N` unless an explicit institution term is present. The single-author report
fixture now yields `National Education Services, New Delhi, India` without the
spurious `M N` affiliation. Author projection tests remain 8/8 and TypeScript
passes.
# 2026-10-07: reject repeated-glyph title candidates

Projection now treats repeated short Unicode glyph runs (for example
`АПФАПФ`) as corrupted ToUnicode output before calling `pickPaperTitle`.
Trusted metadata or OCR can then supply the title instead of exposing the
garbled native candidate. Existing title-resolver and author-projection tests
remain green.
# 2026-10-07: repeated-glyph title regression coverage

Added a real-PDF regression asserting that the linguistics fixture's broken
`АПФАПФ...` title stream is never projected when a trusted metadata title is
available. Author/title projection tests now pass 9/9.
# 2026-10-07: flattened-author title guard

Extended the repeated-glyph title guard to long title candidates that contain
numeric markers and comma-separated author-like tails. When detected, the
candidate is rejected so metadata/OCR can supply the title. The guard is
projection-only and does not alter ordinary title candidates.
# 2026-10-07: full extraction regression completed

Ran `npm run test:extraction-corpus -- --reporter=dot` in a foreground PTY and
collected the terminal result: **2 test files / 232 tests passed**, exit code 0,
including the cached real-paper baseline and reading-order corpus. PDF.js
canvas/font/ColorSpace warnings appeared but produced no test failures.
# 2026-10-07: citation-line title recovery without metadata

When a corrupt title candidate is present and PDF metadata is empty, the
projection now uses a same-line `For citation:` paragraph with a DOI as a
structured fallback. It selects the title sentence while excluding authors,
journal metadata, and the DOI. The linguistics fixture now recovers
`The role of applied linguistics and language discourse analysis in English
language teaching` without metadata. PDF extraction tests: 13 suites / 78
tests passed.
# 2026-10-07: detached figure panel labels at page boundaries

The refreshed extraction sample found a paragraph ending in `... The model`
followed by a compact `A B` figure-panel label at the top of the next page.
These labels are now treated as header boundaries when they are short uppercase
runs in the top margin, preventing them from being stitched into prose. The
real GPT-3 multi-part figure regression passes; ordinary paragraph extraction
is unchanged.

Environment setup: rebuilt the native `canvas.node` binding after installing
Homebrew `pkg-config`, Pixman/Cairo/Pango and image dependencies. The PDF.js
DOMMatrix/Path2D warnings no longer occur in the extraction test process.
# 2026-10-07: asymmetric article-info rail detection

A real Elsevier first page exposed a reading-order defect: the narrow
`Article history`/`Keywords` rail was treated as one stream with the wide
abstract, producing fragments such as `pa` + `tient`. Geometry now detects
this asymmetric rail only when article-info labels and persistent x/y bands
are present, while ordinary ACM-style abstracts remain unchanged. The rail is
kept separate from the masthead and the abstract starts at the correct word.
A false positive on the PPG Earring first page was found during the full
regression and constrained by requiring the article-info labels; the affected
PPG and cognitive reading-order regressions now pass.
# 2026-10-07: vector figure labels separated from prose

The cognitive-psychology GPT-3 fixture contained vector labels such as `Linda
Cab Hospital` and `Toma Test Wason` on the same native stream as body prose.
A figure-caption-anchored, geometry/style-gated split now isolates compact
right-side labels before continuation merging. It is limited to figure
captions and smaller-font label lines so floated tables and ordinary two-column
prose are unchanged. Full extraction corpus regression: **232/232 passed**.

# 2026-10-07: Elsevier venue masthead vs article title

Some Elsevier first pages expose the centered venue banner as the strongest
native title candidate, before the actual article title. The title resolver now
uses the structural sequence (centered candidate, then a substantially lower
left-aligned title candidate) as evidence to prefer the article title without
publisher-specific vocabulary. Regression coverage was added for
`medical-deep-learning-meta-review`; the focused extraction tests and
TypeScript check pass.

# 2026-10-07: mixed-column author metadata

Two real papers exposed author rows split across email, affiliation, and
location columns. A standalone email-containing author row was being rejected
as chrome, and a same-line `and Author` continuation was left as paragraph
text. Projection now retains name-shaped email rows, promotes strict
top-of-page author continuations, and normalizes `authorsStructured` through
the same author expansion used for display names. Regression coverage was
added for the landing-page and GPT-3 fixtures.

# 2026-10-07: lettered affiliation reconstruction

Elsevier mastheads with two interleaved columns could produce fragmented or
duplicated affiliations because the native order separated the `a`–`f`
markers from their institution lines. The projection now reconstructs the
bounded masthead band at marker boundaries and retains only institution-shaped
segments. The medical meta-review affiliation regression passes; the separate
editor/reviewer chrome case remains under investigation.

# 2026-10-07: reviewer metadata separated from author affiliations

Frontiers-style first pages can place `Edited by`/`Reviewed by` metadata and
its affiliations in the outer columns of the author masthead. The projection
now detects the review-label boundary, keeps central author-affiliation rows,
retains the post-label author institution column, and shares a wrapped
university continuation across the relevant author rows. It also uses existing
laboratory evidence to avoid losing the left-column institution. The complete
author projection suite now passes **20/20**.

# 2026-10-07: Frontiers author continuation ending in `and`

The marketing neuroconsumer PDF placed the first three authors in a central
row ending with `and`; the generic masthead filter treated that row as prose
and dropped them. Name-pair evidence now retains such a short author row while
the existing author expansion removes the conjunction. Added a real-paper
regression; author projection now passes **21/21**.
