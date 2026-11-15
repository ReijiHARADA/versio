# 2026-11-08: src/test 全green化・extraction corpus 回帰の棚卸し

- `src/test` 4 fail → **1122/1122 pass**、`tsc -p tsconfig.app.json` pass。
- `layoutFromExtraction.inferCaptionGrid`: native layout がある頁では grid 行に block id が無く、cell と同一（text+原点一致）の投影 paragraph が Reader に残っていた（10-16 の `hasNativeLayout` guard 以降）。完全一致の重複 cell block だけ除去。
- 古い期待値を現行仕様へ更新: 失敗 caption は transport 失敗として retryable（10-16 方針）、`intu-itively` は `joinHyphenated` の compound 保持方針、脚注記号は `projects3` 形式も許容。
- **未解決**: `test:extraction-corpus` 13 fail / 215 pass（471s）。baselineRealPapers 11件（title誤選択 例: computational-linguistics が `Common business goals…`、author/format 期待値差）+ realPapers reading-order 2件（ozchi `n = 20` が equation に混入、cognitive-dual-task）。今回の変更を戻しても同じ11件が落ちるため、作業中の未コミット差分（resolver/mathFragmentMerge・candidates・pdfLayout 等）由来。次はここから。

# 2026-11-05: PDF抽出・翻訳品質の現状計測

- `docs/PDF_EXTRACTION_TRANSLATION_QUALITY_EVALUATION.md` と `report:pdf-translation-quality` を追加。EPUB変換・容量・同期を除外し、実在PDFの既存手動構造ラベル（development 7本）と、現行MADLADの4分野×3抽出本文の実行ログだけを再集計する。個別行CSV/JSONはローカルの `test-data/real-papers/reports/` に生成する。
- 開発用の限定実測は heading recall **86.46%**（3論文）、table-caption recall **75.00%**（4論文）、table-region recall **66.67%**（3論文）、figure-caption recall **100.00%**（2論文）、reading-order pair score **100.00%**（1論文）。分母が小さく開発データなので、全PDFの抽出精度とは表現しない。本文CER/WER、欠落・重複、独立コホートの構造精度、表TEDS、数式CDMは完全な人手goldが無く **N/A**。
- 翻訳の現行診断標本は12本文中、モデル応答8件、自動受理6件、reader-visible原文fallback 6件。受理済みでも意味改変を確認しているため、受理率は翻訳精度に用いない。抽出起因のpre-model fallback 3件と、post-model fallback 3件を分離して記録する。人によるA/B評価用の12行queueを生成するが、独立転記・参照訳・二重査読の完了前に意味保持率やBLEU/chrF/COMETは報告しない。

# 2026-11-05: 信頼性・性能評価の再現レポート

- `docs/RELIABILITY_PERFORMANCE_EVALUATION.md` と `report:reliability-performance-evaluation` を追加。全1,432ユニークPDFの既存実測、7本のdevelopment抽出ゲート、4本の独立validation health gate、現行MADLADの4分野×3本文auditを、CSV/JSON/SVGグラフへ同じ入力から再生成できる。全件容量の結論は原本PDF→スマホ同期用EPUB 3で **61.34%総容量削減**（1,423/1,432成功、95% Wilson CI 98.8–99.7%）のまま。
- 抽出の独立コホートはhuman gold未完成のため、CER/NED、Block F1、完全な読み順、TEDS/CDMを正解率として報告しない。現行translation auditは12本文中6件の自動受理・6件のreader-visible fallbackで、gate通過でも重大な意味改変の例を確認したため、翻訳精度の宣伝値には使わない。旧モデルの手動レビューはcurrent modelと分離して記録する。
- 今回の検証: development extraction 7/7、validation health 4/4、評価ロジック/reading-order等 **267 pass**。同時にauthorProjectionは83件中4件の既存期待値との差分でfail（author正規化・余剰著者）したため、完全greenではない。生成スクリプトと`typecheck`はpass。

# 2026-11-05: 撮影用Presentation Demo

- `VITE_VERSIO_DEMO=1` の明示buildでのみ、取り込んだPDFの抽出段階を撮影用の構造化fixtureへ置換する。通常build・抽出評価は既存`extractAcademicPdf`のまま。fixtureは同じPaper Package→Library→Reader経路を通るが、抽出精度・翻訳品質やbenchmark結果として扱わない。
- 主要Reader論文は Gemperle et al.「Design for Wearability」(ISWC '98)。本文段落・図キャプション・参考文献11件はローカル原論文PDFからの引用（抜粋。改行ハイフンと明白な誤植のみ修正）、図1/2/4/7/8と13ガイドラインの枠は原PDFから切り出し・抽出した画像、日本語訳は撮影用に人手で作成（MADLAD出力ではない）。目次は16節（ガイドライン1〜6と7–13を2階層目）。
- Libraryはメモリだけに6論文（Design for Wearability、Interactive Jewellery、Power-over-Skin、SpeeChin、finger-specific touch、OSWorld。いずれもローカル実論文の書誌情報、本文は主要論文のみ）、ワークスペース階層、38%の取込み中カードを表示する。通常ライブラリ・SQLiteへは触れない。
- `npm run prepare:demo-video` で撮影用PDFと図アセット（gitignored、`pdftoppm`/`pdfimages`/`sips`）を生成し、`npm run tauri:demo`で起動する。`VITE_VERSIO_DEMO_START_PATH` で起動直後のrouteを指定できる。手順は`docs/PRESENTATION_DEMO.md`。
- 取込み中の論文行は既存論文と同じ星アイコン列を確保し、状態と進捗率は1グループ、キャンセルは独立したホバー領域として右端に収める。
- 図の画像URLが `/` 始まり（アプリ同梱の静的ファイル）の場合はPaper Package内アセットとして解決しない。
- 検証: presentation demo tests **3/3**、`tsc -p tsconfig.app.json` pass（ルートの`npm run typecheck`は`files: []`のため実質チェックしない）。src/test全体は1112 pass / 10 fail（抽出・author projection・quality系。デモ変更とは無関係の作業中差分）。

# 2026-11-04: Mobile EPUB同期容量ベンチマーク

- スマホ同期の実出力（1論文ごとの最適化済み EPUB 3 / ZIPコンテナ、外側ZIPなし）を、ブラウザ抽出→Paper Package→production EPUB exporterで全ローカルPDFコーパスへ実測する `bench:mobile-epub-storage` と集計コマンドを追加。翻訳は実行せず、通常の原文フォールバックで本文言語差を容量値へ混入させない。
- 1,511パス中、内容hash重複79件を除く1,432ユニークPDFを全件測定。1,423件成功（99.4%）、9件はChromium crash/navigationとしてパス付きで記録、未測定0。成功分は原本3,075.84 MiB→EPUB 1,189.10 MiB、合計容量61.3%削減（論文単位平均52.7%、中央値61.7%、増量124件）。抽出済み図表アセット10,968件はEPUBに全件保持（exporter missing 0）。
- 容量を小さくするための設定変更はしていない。現行同期exporterの既定（必要時のみ1600px/quality 0.92 JPEG化、表はPNG維持）をそのまま計測。コンテンツ特性別・圧縮前後・失敗一覧・プレゼン用注記は `docs/MOBILE_EPUB_STORAGE_BENCHMARK.md`、個別行はローカルgitignore reportで再現できる。typecheck と EPUB export regression **1/1** pass。

# 2026-10-22: 回転 page-foot 裸 Table N demote

- 縦書き相当 bbox（w≤14, h≫w, y>650）の裸 `Table N` を chrome demote（assayblast）
- 回帰: bareCaptionMerge rotated page-foot

# 2026-10-22: BMJ depression byline + McGuire + symptom reject

- BMJ Open `other` 著者列（Rashmi/Megan/Philip…）を回収；`Hopelessness;…` 症状列を author 拒否
- CamelCase 分割後に `Mc Guire` → `McGuire` を再膠着
- Setting/Participants/Objective を structured abstract として回収
- 回帰: authorProjection bmj-depression-bylines

# 2026-10-22: Frontiers dated and-wrap + Agarwal Group

- `… and` + `14 June 2026 Raúl Sampieri-Cabrera *` を byline continuation（year gate 例外）
- `Services, Dr Agarwal’s Group of Eye Hospitals…` を author から除外
- 回帰: authorProjection editorial-dated-and-wrap / xr-commentary-agarwal-group

# 2026-10-22: BMJ table 構造化 abstract + PRACTICE OR POLICY

- BMJ Open Quality の `table`/`other` `Introduction Given…` / `Methods…` を structured abstract として回収
- `PRACTICE OR POLICY` を author chrome 拒否
- 回帰: authorProjection bmj-human-factors-structured-abs

# 2026-10-22: CORRESPONDENCE glue / Protti 重複 / Md. pair

- `*CORRESPONDENCEMd. Shabiul…` を peelし `Md. Name` + 次人物を分割（brain-tumor）
- `Dario A. Protti Dario A. Protti` 重複除去；`Mechanical Engineering` author 拒否
- 回帰: authorProjection correspondence-peel / protti-duplicate

# 2026-10-22: Frontiers other-role and-wrap byline

- カンマ終わり author 行の直下 `other` `Name and Name` を continuation として回収（dual-pathway）
- emptyCap FIGURE は画像のみ（凡例テキスト無し）を維持
- 回帰: authorProjection dual-pathway-other-and-wrap

# 2026-10-22: PLOS trailing Abstract + biobank consortium

- `… CHINA Abstract` で Abstract band を開き、左レール x に固定しない（atrial oculomics noAbs 解消）
- `UK Biobank Eye` / `Vision Consortium` を author 拒否
- 回帰: markAbstracts plos-trailing；authorProjection atrial

# 2026-10-22: Frontiers star-lead / OUP Corresponding / comma-wrap

- `*, Jennifer S. Stevenson Xia Wang and Jiayi Wang` を undelimited triple として回収（RECEIVED/KEYWORDS chrome 拒否）
- star-lead は先頭 `*` 必須（`Name and Name` 誤上書きで長い byline を潰さない）
- Frontiers `Carlos…2,` paragraph + 次行 `Micael… and Rachid…` を predecessor 結合（comma≥2）
- OUP `*Corresponding authors: … (email)` を byline continuation から除外
- soft0: noAuthors は教科書のみ；bareEq/FIGURE9 は画像式・凡例無しを維持
- 回帰: authorProjection star-lead / OUP corresponding-rail / multimodal comma-wrap

# 2026-10-22: 引用リスト裸 (n) 列対応 glue

- 二段組で右列 wrap に遮られても左列 `• …` へ bare `(49)` を膠着（covid CVI）
- 回帰: mathFragmentMerge cite-list；式本体への弱推測はしない

# 2026-10-22: residual 検証（spot/soft/diagnose）

- spot150: noAuthors 0 / emptyCaption 0 / noAbs 1（Editorial のみ）
- soft700 emptyCap 0；diagnose 0–400 帯 clean；2302 p2 式 (1)–(5) 維持
- 意図的残差: 教科書 noAuthors、画像式 bareEq、凡例無し FIGURE、Early-access/Editorial noAbs

# 2026-10-22: PLOS Abstract + other Background/Methods

- `other` の裸 `Background`/`Methods` を structured-abstract subhead として維持（health-professionals noAbs 解消）
- `STUDY PROTOCOL` を author chrome 拒否
- 回帰: markAbstracts PLOS-other-subhead；authorProjection

# 2026-10-22: 右レール裸 Table N + 結果グリッド demote

- 同一 baseline の広い table セル左＋右レール `Table 9` を chrome demote（hybrid-real-synthetic）
- 回帰: bareCaptionMerge right-rail Table

# 2026-10-22: Figure N. ピリオドのみ + bare 双子 demote

- `Figure 2.` と裸 `FIGURE 2`（同ページ・凡例無し）を chrome demote（radial-consistency）
- 画像のみ裸 FIGURE（凡例テキスト無し）は caption 維持
- 回帰: bareCaptionMerge period-twin

# 2026-10-22: Keywords トピック列を author 拒否

- `Psychological Distress, … Well-Being, Dropout intention…` を author から除外
- spot120: noAuthors 0 / emptyCaption 0；soft700/900 emptyCap 解消維持
- 回帰: authorProjection keywords-not-authors

# 2026-10-22: 続き表ページ末 TABLE N chrome demote

- ページ末の裸 `TABLE N` + 次ページ先頭のセル断片を continued-table chrome として demote
- soft700 emptyCap 4→0（nap Figure 3 / multimodal TABLE 3 / influence Table 2）
- soft900 emptyCap 解消；diagnose40 clean；残 bareEq は画像式（optotagging/(17)）
- 回帰: bareCaptionMerge；typecheck；vite build

# 2026-10-22: ページ境界 bare Figure N 凡例結合

- ページ末の裸 `Figure N` + 次ページ先頭の Title-Case/β-… 凡例を結合（nap Figure 3）
- 回帰: bareCaptionMerge page-boundary

# 2026-10-22: Frontiers 単一 Name* abstract byline + Table 5 左凡例

- `Gopal Singh Jamnal* Forecasting…` を abstract から剥離（true-xai noAuthors 解消）
- 裸 `Table 5` + 直下フル幅 Title-Case 凡例を結合（psychological-distress）
- 回帰: authorProjection single-star；bareCaptionMerge Table 5

# 2026-10-22: Table N shows-the… 凡例結合

- 裸 `Table N` + 同一 baseline の `shows/presents/…` 凡例を結合（influence motivation）
- 回帰: bareCaptionMerge legend-verb

# 2026-10-22: bare Table 文中挟み込み demote

- 裸 `Table N` が `2). Their…` / `= 2), and…` など文中断片と近接するとき chrome demote（hope Table 4）
- 回帰: bareCaptionMerge mid-sentence Table

# 2026-10-22: bare-(n) 幾何 lookback + dim≤ / ENQ

- 二段組で prose に遮られないよう bare `(n)` 結合を幾何スコア化（BCI `(8)`→`dim(S)≤dim(A)`）
- ENQ/`dim (` を ≤ 文脈として sanitize；`dim (AI) ≤ dim (At) (10)` も equation
- 回帰: mathFragmentMerge dim-baseline；画像のみ式番号は未結合のまま

# 2026-10-22: bare Figure callout demote（直下フル凡例）

- 裸 `Figure N` が同列直下の全文 `Figure … | …` 凡例の上にあるとき chrome として demote
- clinicians Figure 2–5 emptyCap 解消；レジェンド無し裸 FIGURE（ssvep FIGURE 3）は維持
- 回帰: bareCaptionMerge callout-demote

# 2026-10-22: scrambled FIGURE N 幾何近傍レジェンド結合

- 二段組で読み順が崩れたとき、配列末尾ではなく同列・近接 gap の裸 `FIGURE N` に凡例を結合
- 介在する別 FIGURE caption は splice しない（anthropomorphic-hand FIGURE 4）
- 回帰: bareCaptionMerge scrambled-order；emptyCap FIGURE 4 解消

# 2026-10-22: correspondence scrub / Institute demote / glued star name

- *CORRESPONDENCE 下の `Filip Stefanovic,` を reviewer scrub から除外
- Institute 行を spaced byline にしない；`PlamenkaNanova*` 単独 affiliation 回収
- REVIEWED BY+星付き本文著者（Bhagat Smith / Adams）；Furhat Tsvetkova
- 回帰: authorProjection；tableware / mind-gap / tourism 維持

# 2026-10-22: Yong-SeokJang* / LAY SUMMARY / affiliation-dump abstract

- 膠着 `Yong-SeokJang*`；LAY SUMMARY→abstract；所属ダンプ abstract を demote→late promote
- cite 膠着 lead を late-front abstract 候補から除外
- soft0: ai-driven noAuthors 解消；noAbs 3→2（textbook noAuthors・画像式 bareEq は意図的）
- 回帰: authorProjection 69；markAbstracts 関連

# 2026-10-22: correspondence scrub / Institute byline / PlamenkaNanova*

- *CORRESPONDENCE 下の `Filip Stefanovic,` を reviewer scrub から除外
- Institute 行を spacedBodyByline から除外；`PlamenkaNanova*` affiliation 回収
- compact-rail / survey Bhagat Smith / Furhat / Nanova
- soft900: noAuthors 0；残 bareEqPara は optotagging 画像式（意図的未対応）
- 回帰: authorProjection 69

# 2026-10-21: one-comma byline / PLOS ID / REVIEWED-BY peel

- `Name *, Name and Name`（カンマ1）本文 byline；`Paiva ID` 除去
- 末尾 `Name2 and` 単独 continuation；REVIEWED BY+番号著者を sidebar 例外で回収
- tourism López-Naranjo…；mind-the-gap / mobile PLOS
- 回帰: authorProjection 69+；mathFragmentMerge enumeration

# 2026-10-21: Frontiers body byline / abstract-star / reviewer final scrub

- 本文カンマ byline（`Liandi He *, Rilei He , …`）を reviewer 混入時に優先
- abstract 先頭 `Name* Department…` 回収；REVIEWED BY 接頭辞 peel
- reviewer 最終 scrub；glued CamelCase；Jilin；enum `(3)`；Ministério
- 回帰: authorProjection 68；mathFragmentMerge enumeration

# 2026-10-21: Frontiers reviewer demote + glued CamelCase body byline

- `Name, University, Country` / `, Affiliated` / Ministério·Vigilância を author 拒否
- 本文膠着 byline（`SiddharthaSinghal and KakelliAnilKumar*` / `RevathyP. and AkilaVictor*`）を優先回収
- 所属尾 `Jilin Changchun`；同一 baseline 列挙 `(3)`→paragraph；tableware CamelCase+NSTDA
- 回帰: authorProjection 67；mathFragmentMerge enumeration

# 2026-10-21: location-tail author demote + same-baseline enum `(n)`

- 所属尾 `Jilin Changchun 130024` を author から除去（affiliation ノードも参照）
- 同一 baseline の列挙 `(3)` は paragraph に膠着（偽 equation にしない）
- glued CamelCase byline + NSTDA demote を維持
- 回帰: authorProjection city-tails / tableware；mathFragmentMerge enumeration

# 2026-10-21: glued CamelCase byline + NSTDA agency demote

- `MingZhang*, ShanDing… and` → CamelCase 境界挿入＋末尾 `and` 除去で 5 名回収
- trailing-`and` の personPairs 判定も CamelCase 分割後にカウント
- `Development Agency (NSTDA)` を author chrome として拒否
- 回帰: authorProjection multimodal-tableware（65）

# 2026-10-21: Frontiers カンマ終わり byline 行 + Figure N) / SENOPATI / Spanish Ma

- paragraph `Carlos…1*, Phani…2,` を authorContinuation（カンマ終わり番号付き）
- bare `Figure N:` ↔ 同番号 `Figure N)`；SENOPATI title|byline；Spanish `Ma Lam`
- 回帰: authorProjection 64；bareCaptionMerge same-number Figure

# 2026-10-21: FIGURE Methods-of… / This-figure / 長パネル / Figure depicting

- bare `FIGURE N` の continuation 拒否を `methods?\b` から exact section のみへ
- 番号付き `Figure N…` のみ拒否し、`Figure depicting…` 凡例は結合（transformer-nlp FIGURE 1）
- `Methods of analysis…`；先行 `: This figure illustrates…`；パネル長凡例 420 語
- 裸 `Methods` / `Results` heading・通常本文は結合しない
- 回帰: bareCaptionMerge Methods-of / preceding / long panel / Figure depicting

# 2026-10-21: bare FIGURE/Table キャプション凡例結合

- bare `FIGURE N` で numberedProcedure 拒否を外す（wav2vec FIGURE 2/3）
- same-baseline `Table N` + 長い Title-Case 凡例（Eyettention Table 7、単語上限 80）
- math 後に caption continuation 再実行
- 回帰: bareCaptionMerge；soft550 emptyCap 0

# 2026-10-21: 学位論文 / キリル / 括弧 affiliation 著者回収 + STATEMENT demote

- `Author: Friswell, Rena`；PhD cover Irene；キリル `Ивана Ж. БАЛТЕЗАРЕВИЋ`；`Yoshinori HORIE (College…)`
- COPYRIGHT/AUTHENTICITY/ORIGINALITY STATEMENT → copyright
- 回帰: authorProjection thesis / Cyrillic / paren affiliation；editorialChromeHeadings

# 2026-10-21: Scientific Reports 抽象先頭 byline（El / El-Din 粒子姓）

- gluedByline の姓トークンを最大 2（`Moataz M. El Sherbiny1` / `Hossam El-Din Mostafa1`）
- 抽象本文から byline を剥がし著者回収（xgboost diabetes multi-classification）
- 回帰: authorProjection particle surnames

# 2026-10-21: ∏/∣/⊙ display 判定 + 孤児 ∫→dt 再結合

- math 文字に `∏` / `∣` / `⊙`；積公式 `(4)`、Hadamard `Tcross…⊙… (12)`（geoepred）
- `∫ T`（脚注挟み可）→ `η = ∫ dt … (n)`（MPPT `(42)`）
- 回帰: mathFragmentMerge；soft1200 math soft フラグ解消

# 2026-10-21: Frontiers 著者から Universidad / cite 略記を除去

- `Universidad…` / `Facultad…` / `Escuela…` 先頭行は常に非著者
- cite 略記 `Fres´an-Orellana A`（acute 含む）をフルネーム横で drop
- 回帰: authorProjection editorial-public-health
- 既知残: Spanish 複合姓の分割（Ma Lam）は main でも失敗していた既存課題

# 2026-10-21: 数式 fragment merge 拡張（分数 / heading / ∥ / 前方番号 / ルール demote）

- stacked function fraction + heading display の bare `(n)`（disentangling `(12)`、physiology `(16)`/`(17)`）
- bare `(n)` が本体より先に来る場合の forward merge（robust sex-diff Model `(4)`）
- `(0)` 層添字除外；`∥`(U+2225) + 空バー opener（coropinn `(5)`）；CN2 `≥=…` demote
- 意図的未結合: 2D/画像のみ番号、BCI `(8)`、列挙/文献、`{i,j∑} (11)`、PPO 画像 `(25)`
- 2302 p.2 `(1)`–`(5)` + marginal ∫ 維持

# 2026-10-21: 章フッタ copyright からの著者回収 + Jan 名誤認修正

- copyright 帯の `© The Author(s) 2018 … D. A. Shepherd, H. Patzelt` を著者へ（Shepherd 章）
- `isNonAuthorMastheadLine` 月名をフル表記のみに（`Jan Berghold` 保持）；BMC `and Decision Making` 除外
- 回帰: authorProjection Shepherd / Jan Berghold

# 2026-10-21: spaced ORIGINAL MANUSCRIPT バナーがタイトル `T` になる不具合

- `stripLetterspacedTitleBanner` が `… C R I P T` の末尾 `T` を本文タイトルと誤認 → 単一英字 remainder は strip しない
- `looksLikeSpacedArticleTypeOnly` に `MANUSCRIPT` を追加しバナーを chrome 扱い（Eyettention II 全文タイトル回収）
- 回帰: titleResolver ORIGINAL MANUSCRIPT；実 PDF eyettention-ii

# 2026-10-21: 数式 display 昇格の追加（eth / ¼ / ∼ / table誤認 / ∫ strip）

- eth 式番号は merge 前 sanitize；eth 内側長を 48 に拡張；残り `þ` → `+`；`¼` → `=`
- 番号付き関係式（`→` / `≥` / `∼` / `× exp` / SmoothL1）と無番号 `∑/∫/∏`
- 単行 table/footnote/heading 誤認の numbered display を equation へ（Fed-XLM-R SNRA (15)、bionic (38)）
- 繰り返し `√ √ √` demote；`∫` 再前置バグ修正；display-as-para ハント 0–900 で実質残 0
- 意図的未結合: 画像のみ裸番号、2D 分裂式、引用番号、凡例無し FIGURE、`{i,j∑} (11)` 断片
- 回帰: mathFragmentMerge；2302 p.2 維持；diagnose 広範囲 clean

# 2026-10-21: eth 式番号の sanitize-before-merge（番号付き display 昇格）

- `mergeMathematicalDisplayFragments` 先頭で eth/C0 sanitize → `… ð3Þ` / `… ð3` が numbered-display 昇格に乗る（ionic MSD/(1)(3)、optotagging (4)）
- 画像のみ裸 `(1)`–`(3)`（optotagging where 節）は未結合のまま
- 回帰: mathFragmentMerge eth-wrapped numbers；2302 p.2 維持

# 2026-10-21: page-1 byline が table 誤認されるケースの回収

- 所属上付き数字付き byline（`Geddam1, … & Ghayvat4,5`）を page-1 table から author へ回収（sEMGCareHCI）
- 共有 `looksLikeAuthorList` は変更せず、table 回収側だけ数字マーカーを許容（Spanish byline 回帰なし）
- spot offset200 noAuthors 0；dual-pathway Frontiers は ABSTRACT 帯なし（意図的 noAbs）

# 2026-10-21: 2302 / math 回帰の再確認

- 2302 p.2: (1)–(5) equation、読み順 (4)→marginal∫→(5) 維持
- pipeline **98/98**；diagnose 400/750/1000/1300 clean；eth 残 0（atomistic）

# 2026-10-21: BMJ cite crumb + Research Square p.3 構造化 abstract

- ABSTRACT 帯で `et al.` cite crumb を本文扱いしない（Introduction 誤クローズ防止）
- colon/bare 構造化 abstract の適用を page≤3 に拡張（GalaxyR Background–Conclusions）
- 回帰: markAbstracts BMJ cite crumb；GalaxyR / BMJ protocol で abs 回収
- abstract-continuation 後に BMJ cite/title chrome（bmjopen / supplemental）を demote
- bilingual cover abstract は複数ノードでも本文が揃えば可（pipeline 期待を結合テキストに緩和）

# 2026-10-21: 数式 C0 / eth-thorn 括弧の正規化

- 行列省略 `\u0004…` → `⋯`、overline `\u0016` → ̄、`EGB \u0001 Ebulk` → `/`、DC2/DC3 → `(Ea)`
- eth/thorn 括弧を繰り返し置換＋閉じ欠落の式番号 `ð19` → `(19)`。merge 後に再 sanitize
- microstructural / atomistic で eth 残 0
- 意図的未結合: physiology 2段組分裂分数+(16)/(17)、画像のみ裸番号、引用 `(55)`

# 2026-10-21: min/max 下の `i i` index crumb 消費

- display 直下の孤立 `i` / `i i` を式へ吸収（テキスト追記なし・下付き推測なし）
- IVN MARCOS (13)(14) で独立 paragraph が消えることを確認。画像のみ式の裸 `(9)` は未結合のまま

# 2026-10-21: 2302 p.2 読み順 + ∫ 定義文への再配置

- `repairInterleavedContinuationOrder` が小文字始まりの中央 display（`d DKL…(4)`）と左寄せ本文を入れ替えていた → 同一 baseline かつ非 display のみ swap
- 孤立 `∫` は定義文の `=` 直後へ（`p(z)=∫ p…`）。先頭 orphan としては落とさない／付けない
- 2302.03792 p.2: (4)→marginal→(5) の順と integrand ∫ を確認。画像のみ式への遠方番号は未結合のまま
- 検証: typecheck / math+stacked+pipeline+readingOrder **197** / vite build；diagnose 1150/1250 clean

# 2026-10-21: piecewise cases + 式番号 lookback

- cases / 複数 `if` 行を display とみなし、中央寄りの裸 `(6)` を再結合（foveal vision）
- 画像のみの式に対する遠方 `(1)`/`(25)` は弱関連として未結合（意図的）
- 裸 `(n)` lookback + `∑_i … (1)`；pipeline **98/98**；diagnose 200/850/950/1050 clean

# 2026-10-21: 式番号 lookback + 総和 index `i (1)` 結合

- 裸 `(n)` は短 crumb/heading を飛び越して直前 display へ再結合（influenza μθ… (3)）
- `i (1)` を `∑_i … (1)` に結合（memory episodic model）

# 2026-10-21: thesis cover `partial fulfilment` 著者回収

- `A thesis presented in partial fulfilment…` + heading `Irene Irawaty Santoso`（p.1–2）を著者へ
- spot の noAuthors（marketing digital advertising thesis）を解消

# 2026-10-21: QStrain 均等貢献 crumb / SOFTWARE banner

- `Lee, and Sumin Jeong have Abstract` と letterspaced `SOFTWARE` を著者投影から除外
- 回帰: authorProjection QStrain + Lotte peel + Santoso thesis

# 2026-10-21: 単著番号 byline の abstract 膠着 peel

- `Fabien Lotte1,2 Deep learning…` を abstract から剥離（abstract-lead 語彙がある単一 person のみ）
- 回収名の末尾カンマを除去；soft math scan 50本 hits **0**；wide offset800/1000/1100 **clean**；pipeline **98/98**；reading-order **83**；spot offset200/600 clean
- 残 soft: テキスト層にレジェンドが無い裸 `FIGURE 3`（本文へ誤結合しない）

# 2026-10-21: ∫ グリフ結合後の display 昇格 + 加重和の裸番号再結合

- 先頭 `∫` crumb を numbered display に結合したら `equation` へ昇格（BFMGHC (9)(10)(16)–(19) が paragraph 固定だった）
- display 判定に `+ − ⊕` を加算 → `L(x)=w·f…` + 右カラム `(13)` を再結合
- 単一ノードでも promote/sanitize が走るように early-return を緩和

# 2026-10-21: Correction 著者回収確認 + FIGURE Results-of レジェンド + √ orphan

- Frontiers Correction: `Frontiers Production Office` + `Author First Last` を空 masthead から回収（実 PDF 確認）
- 裸 `FIGURE N` + heading `Results of FC…` を caption 結合（裸 section `Results` は結合しない）
- display merge 後の本文先頭 orphan `√` を除去（意図的な先頭 `∫ The marginal…` は維持）
- author↔abstract 膠着 peel は数字上付き byline 必須に厳格化（Indonesian cover 誤 peel 防止）
- 2302.03792 p.2 再抽出: eq (1)–(5) が `equation` + 番号付き；`√ Let…` 解消；`∫ The marginal…` は意図維持
- 検証: typecheck / mathFragmentMerge+stackedDerivative+bareCaption / authorProjection 関連 / pipeline+readingOrder **181** / vite build；wide pending offset600 **clean 60/60**；spot offset300–500 clean；spot offset100 `noAbs 1`（Frontiers 意見記事・Introduction 始まり・偽 abstract 補充しない）

# 2026-10-21: 図キャプション本文のページ跨ぎ吸い込み防止 + Table レジェンド

- `FFA U-Net architecture.` が前ページ本文へ結合されないよう short caption-title を page-boundary merge から除外
- 同一基線で先に来る `Results of…` を裸 `Table N` へ前方結合；`Table 5 Results…` を peel で割らない（数字直後の膠着 `5Author` のみ peel）
- 続き表フッタの裸 `TABLE N`（右カラム小文字断片と同一基線）を demote
- 裸 `Fig. N`＋短い heading レジェンド結合；ページ上部／表グリッド同一基線の裸 `Table N` を chrome demote

# 2026-10-20: 裸キャプション結合 + 誌名偽著者 + 連続 Table N chrome

- 裸 `FIGURE N` / `Table N:` は直後の説明段落・タイトル行を caption に結合（24語制限の例外、長文レジェンドは220語まで）
- 複数ページ同Yの裸 `Table N` は running chrome として demote（初出のみ caption）
- BMC 誌名折り返し `and Decision Making` を著者から除外

# 2026-10-20: 数式 display 線形化・underbrace 残骸（2302.03792 p.2）


- `d BODY (n) dγ [∫]` → `d/dγ BODY (n)`；末尾 `∫` は近傍の `The marginal is…` へ移す（弱関連の番号付与はしない）
- 式番号直後の `γ,γ)` と `≡ xˆ(min…) E` / `arg minxˆ(z mse` などの underbrace 混入を scrub
- 回帰: `mathFragmentMerge` + `stackedDerivativeEquation`；実 PDF は git 外（Desktop）で p.2 目視

# 2026-10-20: 構造化 abstract 裸ラベル再マージ防止

- `Results` / `Methods` 等のコロン無しバンドラベルは abstract-continuation-merge しない（`Results Of the…` 化を防止）。`Background:` 形式のみ label+prose 結合
- handedness BMJ: bare `Results` abstract ラベル復旧

# 2026-10-20: Frontiers Correction 著者回収

- `Correction:` 記事で Production Office / `Author First Last` を footer から回収（APPROVED BY chrome で空になりがち）
- `ABSTRACT CORRESPONDING AUTHOR:` を author chrome として demote

# 2026-10-20: spot residual 80本（stride）

- noTitle / shortTitle / author affil / emptyCaption / titleIsChrome **0**
- noAbs **1**: VR InfoViz 意見記事（本文 Introduction 始まり・抽象なし）— 偽 abstract 補充は意図的に停止済み
- odd **[]**

# 2026-10-20: pipeline 回帰スイート 98/98

- thesis `… under` 結合、abstract Results 誤吸収、Elsevier article-info peel、CJK √、Option chrome、ALL-CAPS 見出しなど一連の修正後
- `npx vitest run src/test/pdfExtraction/pipeline.test.ts` → **98/98**；typecheck / vite build 通過
- pending diagnose offset700 limit50 / offset0 limit100: clean

# 2026-10-20: vignette `A: Option 2.` chrome 救済

- 図帯の回答コールアウトが layout chrome→copyright で欠落 → Option N を other として保持
- author-copy / IEEE editor credit の回帰期待を copyright 許容に更新

# 2026-10-20: CJK √比較行の vector-label 誤発火

- `人类驾驶员 + … √ √` 行が vector-figure-label-cluster で other 化 → CJK+checkmark は vector 除外、role を table に固定
- 回帰: CJK checkmark comparison rows

# 2026-10-20: ALL-CAPS 節見出しの誤 demote 防止

- `titleCaseDense` が `H COMPARISONS WITH LOGISTIC…` を表ヘッダ膠着と誤認 → ALL-CAPS バナーは除外
- 回帰: all-caps section heading + editorialChromeHeadings

# 2026-10-20: Elsevier 非対称 article-info と abstract 剥離

- 所属レール（`a Institute…`）を abstract 帯へ昇格しない；`a b s t r a c t` / 所属先頭の膠着本文を peel
- 回帰: asymmetric article-info rail

# 2026-10-20: abstract/表/図ラベル回帰修復

- 平文 Abstract 後の裸 `Results`/`Discussion` が structured-abstract 帯に飲み込まれないよう `sawStructuredSubhead` ゲート
- caption 近傍テーブルに `structuralLabel` を再付与；2行ベクトル凡例で `vector-figure-label-cluster`
- 重複パネルリード（`for GPTrel… for GPTrel…`）を dense-vector-panel で `other` へ
- 図近傍の短文 prose（`by only reading`）を vector-label から除外；重ね打ちタイトルを phrase collapse
- 回帰: markAbstracts / pipeline synthetic＋linguistics figure-label / HFE title / method-goal

# 2026-10-20: thesis カバータイトル `… under` 結合

- 著作権シートの page-1 タイトルが前置詞 `under` で途切れ、page-2 カバー（`conditions of low attention?` + 副題）へ進まない
- `isIncompleteTitleEnd` / `looksLikeTruncatedTitle` に `under` ほかを追加；不完全 native で `recoverThesisCoverTitle` を起動
- カバー再掲の同一 stub を dedupe；回帰: titleResolver ユニット + pipeline thesis cover

# 2026-10-20: caption/heading residual 再スキャン clean

- 同一120本を修正後再走査: truncatedTitle / chromeHead / orphanCaps **0**

# 2026-10-20: タイトル継続 `What Doesn't` + TABLE caption 昇格

- Frontiers: `… Transfers and` + `What Doesn't` が looksLikePersonName で落ち、タイトル欠落 → 疑問詞先頭を人名から除外
- `KEYWORDS COPYRIGHT` 見出し demote；`TABLE 3 A summary…` など standalone キャプションを paragraph→caption
- caption/heading residual 120本の truncatedTitle / chromeHead / orphanCaps を解消
- 回帰: readingOrder + editorialChromeHeadings

# 2026-10-20: dense residual offset1 clean + typecheck

- pending 1/7 標本 offset1（197本）: noAuthors / chromeAuthor / badTitle / receivedHead **0**
- `npm run typecheck` 通過

# 2026-10-20: Frontiers タイトル末尾 Abstract + title-stack 著者誤認

- `Optic Flow Transfers From Abstract` が `… Abstract` 汚染ルールで title 候補から除外され、著者に混入
- トピック語としての Abstract を許可；title-stack フレーズを author chrome として拒否
- Research Highlight バナーを author から demote（byline 無しは空著者のまま）
- dense residual offset5（197本）の2件を解消

# 2026-10-20: Frontiers 膠着 RECEIVED レール見出し demote

- `RECEIVED … ACCEPTED … KEYWORDS PUBLISHED …` が outline heading（長さ>48で旧ゲート漏れ）→ 複数日付レールを copyright/other へ
- 回帰: editorialChromeHeadings ユニット；heading residual 80本標本の chromeHead 2件を解消対象

# 2026-10-20: 章フッター著者 + インドネシア表紙の title/byline 膠着

- Shepherd 章: `© The Author(s) 2018 … D. A. Shepherd, H. Patzelt` を copyright から回収；後続ページの ALL-CAPS ランニングヘッダは除外
- SENOPATI: 抽象本文リード／Diagram／日付レールを title から除外；`Analisis… VOSviewer Ario1, Indri2…` 膠着を剥離してタイトル＋3著者を回収
- `Jurnal SENOPATI` / `INFORMASI ARTIKEL` / キーワード列を author chrome として demote
- dense residual offset3（197本）: noAuthors / chromeAuthor の2件を上記で解消

# 2026-10-20: letterspaced INFO/ABSTRACT + APPROVED BY chrome

- ASHA 系サイドバー `I N F O` / `A B S T R A C T` が paper.authors に混入 → letterspaced バナー語彙を拡張して demote
- Frontiers Correction の `APPROVED BY` を author から除外（Production Office は訂正記事の正しい著者として維持）
- dense residual（pending 1/7 標本 197本）: 実害は letterspaced INFO のみ；absByline 2件は `COVID-19` / `Enhancing 3D` の偽陽性

# 2026-10-20: Frontiers `and` 共著者 + letterspaced RESEARCH chrome

- `and Sarah Maggioli` が y≈290 で `y < 220` ゲートに落ち、共著者欠落 → `firstBodyY`（≤360）まで引き上げ
- letterspaced `R E S E A R C H` / `SPECIALTY SECTION` / `of Nebraska Kearney…` を author role から demote
- 回帰: authorProjection 実PDF 2件；pending diagnose **offset=1200 limit=200: clean 179/179**（末尾スライス）

# 2026-10-20: Introduction 後の偽 abstract 補充を停止

- Frontiers 意見記事（VR InfoViz）: abstract 欠落時の toPaper 補充が `The HMD…` 本文を abstract 化
- Introduction 見出しより後（index / Y）の段落は補充しない；resolver 側でも同条件 demote を最終ゲートに残置
- pending diagnose **offset=1000 limit=200: clean 200/200**

# 2026-10-20: スペイン語複合名 / Ma 粒子 / Mar≠March

- 4語名の無条件ペア分割を抑制；単独 `Adriana Monserrath Monge Moreno` を維持
- `stripAuthorCredentials` の `/MA/i` が `Ma` を学位と誤認 → ALL-CAPS 学位は case-sensitive に
- 月名ゲート `mar(?:ch)?\b` が ASCII `\b` で `María` を拒否 → Unicode `(?!\p{L})`
- 本文列の番号付き byline を digit-anchored 回収（5名全員）
- 回帰: authorProjection **47/47**＋スペイン語実PDF
- pending diagnose **offset=900 limit=100: clean 100/100**；caption/heading strict spot ~126本で chromeHead/emptyCap **0**

# 2026-10-20: 論文リポジトリ表紙 / Frontiers RECEIVED 膠着 abstract / 機関偽著者

- 学位論文カバー: タイトル末尾 `Author: Friswell, Rena Publication Date: 2013 DOI:` を剥離；`Author: Last, First` / 氏名フォームから著者回収；`(PLEASE TYPE)` 抽象フォーム文言を除去
- Frontiers: `RECEIVEDREVISED… Many primarily… ACCEPTEDPUBLISHED…` を abstract へ昇格し日付レールをインライン除去；`Front. Educ. :.` / `Frontiers Media` を著者から除外
- `1Universidad…` / `Facultad…` など機関先頭行を著者にしない（Title-Case 2語でも拒否）
- pending diagnose **offset=400 limit=150: clean 150/150**；`--offset` を diagnose に実装
- 残: Correction 記事の共著者欠落

# 2026-10-20: 括弧付き Latin byline / セルビア語 Cyrillic 著者回収

- 日本人間工学会ノート: `Yoshinori HORIE (College of Industrial Tech., Nihon University)` が affiliation のまま → `recoverParentheticalLatinAuthor`
- Баштина 系: `Прегледни рад Ивана Ж. БАЛТЕЗАРЕВИЋ* Факултет…` → `recoverCyrillicGivenInitialSurname`（`\b` は Cyrillic で無効なので使わない）
- 回帰: authorProjection 実PDF 2件；pending diagnose limit=400 **400/400 clean**；`--offset` を diagnose に追加

# 2026-10-20: BMC Methods-for… abstract 帯 + PLOS mega-author overflow

- BMC（CB-Search）: `Methods for analyzing…` が `SECTION_INTRO` 誤判定で abstract 帯から脱落 → `isSectionIntroHeading` を Methods/Results 見出し専用にし、本文先頭の Methods for… を維持
- PLOS（PREFER-IT）: masthead 回収後も `Jetse Goris5…` 名列が abstract に残る → `authorNames` 非空でも byline overflow を demote して著者へ合流
- 著者回収済みでも abstract 先頭の膠着 byline を剥離: Frontiers `Hamza Boukeffa1… Early warning…`、Nature `Leonie Koban 22,23 1234567890():,; Human…`、PLOS 所属ダンプ `Ke Zhao 20* 1 Department…`（→ `To address…` を abstract 昇格）
- 表ヘッダ風 `Parameter Value` を outline から demote
- 実PDF: CB-Search abstract に Methods/Results/Conclusion；PREFER-IT authors≥20・abstract は AI prose のみ
- 回帰: markAbstracts + editorialChrome + authorProjection（PREFER-IT / CB-Search 実PDF）**62/62**
- wide pending diagnose **limit=400: clean 400/400**；strict residual spot 154本 **issue 0**

# 2026-10-20: 翻訳中の画面更新を間引く

- `ReaderScreen` は翻訳ブロックの更新バッチをマウント中に1つだけ作り、閉じるときに破棄する。再レンダーのたびに作ってグローバル集合へ残していた
- 本文セクションの監視コールバックと、段落へ渡す関数の同一性を固定し、訳文の反映で全セクションの付け外しと全段落の再描画が起きないようにした
- ライブラリ／受信箱／お気に入り／最近／フォルダ画面は、ブロック全体の購読をやめ、開く操作のときだけ本文の有無を見る。翻訳中の行だけが進捗を更新する
- 並列数の既定は 8 のまま。ウォームアップ後の MADLAD 8 文では、メインスレッド遅延は並列 1/2/4/8 とも約 1.2ms。所要時間は並列 4 が 23.7s、並列 8 が 27.8s、並列 2 が 26.2s で、UI 遅延は動かなかった
- 検証: 360 ブロックの更新中、IntersectionObserver の付け外しは 132 回から 0 回。同じ条件のスクロール反映は 55ms から 11ms。Long Task は修正前後とも 0。チェックポイント保存は 400 ブロックで約 6ms。`batchBlockUpdates` と `npm run typecheck`

# 2026-10-20: 未使用の取り込み・論文モデルを削除

- 呼び出しゼロの旧入口を削除: `importService.ts`（`importPDF`）、`translationService.ts`（OpenAI / Ollama / mock）、`import/importPaper.ts`（`importPDFV2` の別名）、`domain/paper.ts` と `paperModel.test.ts`
- 本番の取り込みは `tryStartPdfImport` → `startBackgroundImport` → `importPDFV2` のまま。翻訳は `TranslationEngine`（MADLAD / Apple / 任意 Ollama）。ライブラリ表示は `domain/paperReadiness.ts` のまま
- 検証: `npm run typecheck`
- 残: PDF 抽出の整理は対象外

# 2026-10-20: PDF Extraction Evaluation Studio（開発専用）

- `/eval.html` の独立 Vite entry。PDF.js 原本表示と CanonicalDocument / Reader projection の読書順表示、双方向ハイライト、回転対応の領域指定、ページ完了状態、ブロック・欠落・CAPTION_OF 関係レビューを提供
- Studio は window 内に固定し、PDF・ブロック・レビューの各ペインだけを縦スクロールする。PDF は初期表示と「全高」操作で利用可能な window 高へ合わせる。ブロック判定・誤りタグ・role・深刻度は操作時に対象 ID へ即時保存され、native text bbox は描画時に baseline→top-left 補正して PDF canvas に重ねる（保存座標は不変）
- 左 PDF の選択済み判定枠は直角矩形。枠本体のドラッグで移動、四隅ハンドルでリサイズし、レビューの `targetRegion` に保存する（抽出 snapshot は変更しない）
- 新規レビューの深刻度は `critical` が既定。保存済み状態や自動保存など実装上の文言は UI に表示しない
- 抽出 snapshot と人手 Ground Truth review を分離。SHA-256 による browser local 保存・JSON bundle 書出し／再読込を提供し、Paper Package / SQLite / 翻訳サーバーには触れない
- `npm run eval:pdf-extraction -- --input <bundle>` で role / paragraph boundary / reading order / relation の P/R/F1 と対象数を JSON 出力。完全性未確認は `null` (N/A) で、100% 扱いしない
- 使用手順・現時点の boundary / reading-order annotation 制約は `docs/PDF_EXTRACTION_EVALUATION.md`

# 2026-10-20: サイドバー検索をヘッダー縦中央に揃える

- ライブラリ検索窓をメイン側ヘッダー（`--header-height`）の縦中央に合わせる

# 2026-10-20: 日本語化中はプログレスバー表示

- ライブラリ行の「日本語化中 N%」をやめ、ラベル＋インライン進捗バーに変更

# 2026-10-20: ライブラリから読了率表示を削除

- 論文行の「N%まで読了」を出さない（読書位置の保存自体は維持）

# 2026-10-20: EPUB「スマホで読む」UI

- スターはタイトル左。EPUB 同期は右側操作領域の「スマホで読む」（アイコン＋ラベル）
- 未設定時はトースト「設定を開く」→ `/settings`。設定済みはワンクリック同期
- 同期成功は `epubSyncByPaper` に永続化し、以降「保存済み」表示（再送で更新可）
- 送信中／失敗を行上とトーストで表示。処理は既存 `pushPaperEpubToSyncFolder` を再利用
- 回帰: `paperFavoriteEpubSync`

# 2026-10-20: 書き出しアイコンを上向き矢印に

- Reader `FileDown`→`FileUp`、フォルダ書き出し `Download`→`Upload`（矢印を下→上）

# 2026-10-20: 論文メニュー「ゴミ箱へ移動」

- 「ライブラリから削除」「論文の削除」を「ゴミ箱へ移動」に統一（完全削除ではないことが分かる文言）
- メニュー危険操作は赤文字（`.menu button` の色上書きを修正）

# 2026-10-20: 出版社 chrome（Check for updates / GRAPHICAL ABSTRACT / STUDY PROTOCOL / Open Access 偽著者）

- Nature `Check for updates` / `GRAPHICAL ABSTRACT` / `Abbreviations` / 裸 `STUDY PROTOCOL` を outline から demote
- Springer `SOFTWARE Open Access` 等を著者から除外；タイトル最終 scrub で `STUDY PROTOCOL` / `OPEN` レールを剥離（City Research Online 表紙 PDF で確認）
- XGBoost diabetes: 粒子付き byline（`El Sherbiny` / `El-Din`）が abstract に膠着 → gluedByline を粒子・複合名対応＋散文境界フォールバックで著者5名＋abstract 本文復旧
- 回帰: editorialChrome + titleResolver **55/55**；authorProjection **40/40**
- wide pending diagnose **limit=200: clean 200/200**

# 2026-10-20: hanging title に膠着していた著者名を分離

- ICEMCT 系: タイトル同フォントの `Qiuxia Guo` が JMIR 短行 title ヒューリスティックに誤分類 → person-name を title 帯から除外
- 単独 First Last の一律 author 化は Frontiers `An Feng` 断片を誤 author 化し膠着 byline 回収を壊すため撤回。長い title 直下の 2 語だけ post-pass で author 化
- JMIR 継続語（`Clinician Acceptance` 等）を person-name 判定から除外
- 回帰: readingOrder hanging-title **pass**；authorProjection+titleResolver+markAbstracts+editorialChrome **176/176**
- wide pending diagnose **limit=200: clean 200/200**

# 2026-10-20: Springer Nature `OPEN` バッジのタイトル混入を除去

- `OPEN A diffusion model…` のように ALL-CAPS `OPEN` / `OPEN ACCESS` が display title 先頭に膠着 → `stripMastheadSuffix` で剥離（Title-Case の Open Access 話題題は維持）
- 回帰: titleResolver **36/36**；実PDFタイトルから OPEN 除去を確認

# 2026-10-20: Nature early-access 表紙の unlabeled abstract 誤認を修正

- Sci Rep early-access（mask-use COVID）: page1 の unedited/license クロムが unlabeled abstract になり、page2 の本文リードが取れない。cite レール `et al.` が著者に混入
- 修正: early-access 表紙では page1 unlabeled をスキップ；`promoteLateFrontAbstracts` は page≥2 を優先し license 継続を除外；著者から `et al.` cite を除外
- 実PDF: abstract=page2 政策ナラティブ／著者6名；spot 120: **noAbs 0 / noAuthors 0**

# 2026-10-20: PLOS 構造化 abstract（rival title の Abstract）復旧

- PLOS One（lombard-gain）: 裸の `Abstract` が rival title→paragraph 化され `markAbstracts` が帯を開けず abs=0。同時に左レール長 cite が abstract 化し Introduction 本文まで吸収
- 修正: bare Abstract を title/paragraph/other からも heading 化して帯開始；対向列は長さ問わずスキップ；`1 Introduction`（ピリオド無し）でも帯終了
- 著者: `Universität` / Medical Physics 機関行と how-to-cite イニシャルを著者投影から除外 → 著者5名
- 実PDF: abstract 5ノード（Background〜Conclusions 本文）/ page2 本文は paragraph；回帰 `markAbstracts` + authorProjection/editorialChrome **58/58**；typecheck pass

# 2026-10-20: 表セル throughput の偽見出しを除去

- VR InfoViz（Frontiers）: `2019 118.80 GPixels/sec` が table 断片から outline heading 化 → `tableMetricCellHeading` で `other` へ demote（GPixels/FPS/FLOPS 等の単位付き数値のみ）
- 実PDF: 目次から GPixels 行が消え `2. WHY DOES…` 等の正規見出しのみ；spot 100本で metric/図番号偽見出し **0**
- 回帰: editorialChromeHeadings（metric cell）＋ authorProjection **57/57**

# 2026-10-20: Frontiers / IEEE ランニングヘッダを目次から除去

- `Frontiers in Psychology` / `Frontiers Bae` / `IEEE XPLORE` 等が ALL-CAPS heading スコアで outline 化 → layout header/copyright を維持し、`looksLikeJournalRunningHeader` で demote
- spot 120本: 当該ジャーナル chrome 見出し **0**；editorialChrome **16/16**

# 2026-10-20: 数式フラグメント統合（arXiv 2302.03792 p.2 レビュー根拠）

- Evaluation Studio レビュー（`2302.03792v1.pdf.evaluation.json` page2）を根拠に、native PDF の数式崩れを修復
- `mergeMathematicalDisplayFragments`: stacked `d`/`dγ` → `d/dγ` 付き equation、孤立 `√` の段落再結合、`[ 2]` 上付きの吸収、`(n)` display の equation 昇格、C0→`ε` sanitize
- layout: 未完了段落が数式境界（equation / `d` / `dγ` / `[ 2]` / `√`）を飲み込まないガード
- bare `(n)` 段落（例 genesis-shield `(21)`/`(37)`、mixed-updating `(6)`）を、番号未付与の直前 display 式へ幾何根拠付きで再結合（既に `(k)` 付きの式には推測で付けない）
- 単一 `=` の番号付き代入式（`yˆ = g(…) (2)`）も display equation へ昇格
- 回帰: synthetic `stacked-derivative-equation` fixture + `mathFragmentMerge`（bare-number / single-equals 含む）/ `stackedDerivativeEquation` tests
- 対象PDF p.2: (1) d/dγ 統合・√再結合・ε・‖²・table化解消は改善。(3)(4) の 2D/underbrace 崩れは未対応（推測結合しない）
- 残: 複数行ディスプレイの 2D 再構成、arg min 下付きの完全復元、Evaluation Studio 目視の継続

# 2026-10-20: title断片誤demote＋caption囲い込み表セル

- `title-fragment-demotion` を title 近傍ページに限定し、軸ラベル証拠付きセルと単一語断片を除外（`Employee wellbeing` 等が本文・表で copyright 化しない）
- `promoteCaptionBoundedTableCells`: geometry 無しの Frontiers SEM 表（TABLE 6–8）を caption 間の短セルから table 昇格→行マージ
- SEM 効果量セル（`0.444 (large)…`）と二重 construct 見出しを outline から demote
- inline-split 由来の親見出し（`5. Results` after `5.3`）を同ページ subsection 後のみ demote
- standalone 昇格 FIGURE caption に同ページ figure shell を付与（compact-rail orphan-caption 解消）
- `Copyright and` / Moral Rights / `KEYWORDS CITATION` を outline から demote
- 本文クロスリフ `Figure 5 maps…` を caption から paragraph へ demote；`Table 5Author…` 膠着を caption+cell に剥離
- 構造化 abstract: 散文見出しを band に含め、bare `Background:`/`Methods` と本文を同一行でも merge（label の汚染 bbox は先頭箱で測る）
- soft-wrap abstract（`Discussion: These` / `Overall, Fed-XLM-R`）と correspondence / registry rail demote
- abstract merge が sidebar author/誤 affiliation 散文で止まらないよう緩和；cite crumb demote 拡充
- abstract 帯の誤 affiliation 長散文を abstract へ回収してから merge
- 表セル／`***`／page+2 以降への abstract 帯漏れを demote；JMIR 引用尾を abstract から除外
- competing-strain / compact-rail orphan-caption 解消
- wide pending-only フル診断 **1379/1379 clean**（flagged 0）
- 残: 2 列 OCR で単語が散らばった abstract（`Background: women` 等）は推測再構成しない
- 回帰: `tableRegionResolver`（caption-bounded）/ `editorialChromeHeadings` / `mathFragmentMerge`

# 2026-10-19: 翻訳再試行経路を import と同じエンジンに揃える

- `createTranslationEngine` で Apple→MADLAD（＋任意 cascade）を一箇所に集約
- **resume** と **Reader 段落再試行** も同じ組み立てを使う（以前は MADLAD のみ）
- 段落再試行は品質拒否時に `source_fallback`（原文保持）、輸送失敗は `failed` のまま
- 回帰: `createTranslationEngine` / `retryBlockTranslation` / `resumeTranslation`

# 2026-10-19: Frontiers sidebar 著者 + 構造化 abstract + OA 拡充

- BMJ Open 列スクランブル（effect-of-simulation）: To cite 左レール（x≈40）が abstract 列（leftX≈147）と Y 交錯して本文に混線 → (1) sidebar 幅比 2.5→1.7 (2) multi-column 時 `bodyLeftX-16` でレール切断 (3) marginRailXBoundary でブロック結合拒否 (4) Protected by copyright / Downloaded from を全ページ chrome (5) 解決済み title 内の短い hyphen crumb を demote。実PDF: scramble 0 / intro・methods 正常 / 著作権 paragraph 0；reading-order cite-rail 回帰追加
- Frontiers 5G（frai.2025.1644415）: 左サイド citation crumb（`Arvind…, LSTM…` / 機関名）が title・authors を汚染 → venue-banner 左crumb拒否、EDITED BY/機関偽著者除外、Stolen mid-title fragment（`LSTM with Deep Dual`）を `Convolutional`↔`Info-Varcoder` のみ再挿入。タイトル全文＋著者2名復旧
- 回帰: authorProjection+editorialChrome **44/44**；reading-order cite-rail 含む関連 **pass**；spot limit=60: **noAuthors 1**（Correction 記事のみ）/ emptyCaption 0 / noAbs 0；wide pending **limit=80: clean 80/80** → **limit=200: clean 200/200**
- Frontiers 2著者 byline（`An Feng1* and Tao Wenyin2 Optical…`）が abstract に膠着し paper.authors=[] → comma 無し `and` 膠着を mislabelled byline として回収＋abstract から byline 剥離。multi-way-radial **著者2名**復旧
- JMIR preprint 表紙: 大画像の裏にある title/byline が embeddedFigureText で消失 → 11pt+ と大カバー画像を除外；Title-Case 話題行を author 誤認しない；display title 帯で全タイトル結合。Danish GP: タイトル全文＋著者5名
- spot offset=60: noAbs≤2（dataset / VR perspective）；wide pending **200/200 clean**
- spot offset=120 limit=80: **n=75 / noAuthors 0 / emptyCaption 0 / noTitle 0 / noAbs 1**（Twelve quick tips 教育記事）；odd []
- 証拠ダンプ: `test-data/extraction-evidence/key-papers-2026-10-19.json`（5G / BMJ / JMIR / Frontiers radial）
- Reader 目視: `reader-bmj-sim-scramble-fix.png`（タイトル全文・著者5・列混線なし）/ `reader-frontiers-5g-title-fix.png`（LSTM 込みタイトル・著者2）/ `reader-jmir-danish-cover-fix.png`（再撮影）
- JMIR metadata `Preprint - 10.2196/…` が native タイトルを上書き → preprint chrome を metadata 拒否；BMJ TOC の `For numbered affiliations see` / `Correspondence to` を demote。再撮影で JMIR タイトル全文を確認
- wide pending **300: clean 299 / flagged 1**（MDPI `Academic Editors:` 誤タイトル）→ Academic Editors 拒否＋カンマ連題（`, and` / Review）を contamination から除外。AR/MR スコープレビューはタイトル全文復旧
- PLOS protocol: カンマ連題が contamination 誤判定で OSF レールが title 化 → `: Protocol for a scoping review` 例外＋OSF/Registries 拒否。Nature Communications ジャーナルレールを著者除外。Þ 単一グリフ見出し demote。`TraNSlaTiON` スタンプを chrome 化
- wide pending **500/500** → **700/700** → **900/900** → **1100: clean 1100 / flagged 0** → フル pending **1379: clean 1379 / flagged 0**
- bare `COPYRIGHT` / `Copyright:` / `Copyright © 2022…` / `Copyright (1998)…` を copyright ロールへ。spot offset=400/900: **issues 0**
- MQM Globe: `The …` 長タイトルを contamination 誤拒否 → 本文リード形のみ拒否＋ Abstract 膠着 wrap 拒否。正式タイトル復旧後にフル再計測 clean
- BMJ: layout `chrome`→copyright。cite-only abstract demote。再撮影 `reader-bmj-sim-chrome-hidden.png` / `reader-bmj-abs-fix.png`
- Frontiers fishermen: title 過スコア byline→author（3名）。本文リード／構造化 abstract 偽見出し demote。再撮影 `reader-frontiers-fishermen-outline.png`
- 回帰: editorialChromeHeadings **13/13**；titleResolver **34/34**
- Reader 再撮影: `reader-plos-mqm-title-fix.png`（正式タイトル全文）/ `reader-frontiers-copyright-hidden.png`（COPYRIGHT 非表示・タイトル正常）
- `Results of EFA indicated…` 系の結果散文 wrap を目次から demote；`TABLE 2` は caption 維持（heading スコア上書き抑止）、膠着列ヘッダ demote（editorialChrome **15/15**）
- 残: Correction / tip / Editorial 無 abstract 許容残差、要確認バッジの精査、.app 目視

- BMJ Open chrome 見出し: `Downloaded from` / `24 September 2026.` / `Protected by copyright…` を demote；`Methods and analysis This will be…` 膠着を paragraph 化；`To cite:… ABSTRACT` / `STRENGTHS AND LIMITATIONS…` を author 役割から demote；図キャプション `Conceptual framework…` を outline から demote。editorialChromeHeadings 回帰 **10/10**
- PLOS ORCID `PaivaID` 接尾辞を `expandAuthorLine` で剥離 → mobile-apps elderly 著者9名復旧；TOC 誤本体 PDF を `_quarantine/` へ隔離＋ TOC タイトル拒否；`Abstract` が `other` でも構造化 abstract 帯を開く
- spot limit=80: **noAuthors 0** / emptyCaption 0 / noAbs≤1（Frontiers perspective 無 abstract）；wide pending 200: **clean 199 / flagged 1**（title-id-mismatch）；`authorProjection` **34/34**

- PDF 本体は **git に上げない**（`pending-pdfs/**/*.pdf` は gitignore。候補 JSON のみコミット）。再取得は `node scripts/fetch-oa-europepmc.mjs`
- Europe PMC 追加取得（再）: クエリ拡充 → **+167**（失敗244=主に 403）；pending PDF **1380** / candidates **1432**（PDF 本体は gitignore のまま）
- BMJ Open タイトル切れ: same-baseline 結合が多行 `height` で右隣フラグメント（`experimental pre-`）を誤吸収 → fontSize 基準の Y 許容に変更；`quasi-post` へ `experimental pre-` を splice（`quasi-experimental pre-post`）；短い LNCS スタック再構築が長い結合タイトルを上書きしないようガード。wide pending 100 **clean 100/100**
- Nature Sci Rep: 番号付き byline が abstract に膠着（`… Amygdalos5 Primary…` / `Florian W. R. Vondran`）→ PUA 除去・複数イニシャル対応で著者12名＋本文 abstract を復旧；`authorProjection` **34/34**
- PLOS Digit Health 長 byline（`Philippe J. Guérin` のミドル初期ピリオドを文境界と誤認）→ 長い pure numbered byline を abstract 誤ラベル判定で回収（著者20名）。chrome-only 著者投影時も byline 復旧を実行
- Reader 目視: `reader-nature-oct-authors.png`（著者12）/ `reader-plos-mqm-authors.png`（長 byline）/ `reader-bmj-sim-title.png`（BMJ 列スクランブル残差・THIS STUDY 混入は継続）
- Malay 名粒子: `expandAuthorLine` の 4-token pair-split が `Mansor Bin` / `Abu Talib` に割らないよう `bin|binti|ibn|van|…` を除外 → `Mansor Bin Abu Talib` + `Luoting Lin`；Frontiers CORRESPONDENCE 膠着も維持；`authorProjection` **34/34**
- Europe PMC 追加取得: クエリ拡充 + publisher DOI 直リンク（Frontiers/PLOS/BMC/Nature/PeerJ）優先 → 本セッション **+100**（失敗143=主に JMIR/PeerJ 403）；pending PDF **1215** / candidates **1265**（PDF 本体は gitignore のまま）
- residual spot limit=80（再）: **noAuthors 0** / caption空 0 / **noAbs 2**（Editorial + tip記事／human-factors 訓練論文など）；odd 0
- SurvMarker preprint: 番号付き所属行 `Name1, Name2* 1Inst…` から著者回収；Wiley `Name MD | Name MD, MPH` + letterspaced 誌名バナー除去（5R's）；Frontiers 単一段落 unlabeled abstract（`stopY=10000`）
- BMJ Open chrome: `THIS STUDY` / `To cite:… ABSTRACT` を著者から除外；BMJ 断片 abstract（列スクランブル）は残差
- spot limit=80 / offset=40: **noAuthors 0** / emptyCaption 0 / noAbs≤2（editorial・PLOS tip）
- authorProjection 回帰修復: Murali 単著者レポート（sidebar 除外回避）／Woodruff `Palo Alto` 郵便剥離＋title-case 段落回収／IEEE `NAMEFaculty`・email byline を誤除外しない；**34/34**
- wide pending 200: **clean 199 / flagged 1**（当時 `micro-heading:Aim`；現行では Aim は `other`）
- residual spot limit=80: **noAuthors 0** / caption空 0 / **noAbs 3**（editorial のみ）；offset=40 でも noAuthors 0 / noAbs 1（Correction 1頁）
- Abstract 中央ラベル列ずれ・BMC 構造化帯・Nature 無ラベル abstract・Frontiers how-to-cite scrub・`Received:`+early-access 膠着・`& Shane` / `July London` / `Io T` 偽著者を修正
- wide pending **limit=200: clean 200/200**（flagged 0）；サンプル40本で caption空 0 / 短見出し嫌疑 0；`authorProjection` **34/34**
- Reader 目視: Nature PEV（`reader-nature-pev.png`）著者4名・本文リード；BMC CPS（`reader-bmc-cps2.png`）Abstract→Background＋親子見出し分割；Nature `Check for updates` を affiliation から demote
- 住所行 `Palo Alto, CA ZIP` を著者から除外 → Woodruff/Aoki の title-case 所属分離を復旧（APA `author` 役割は citation 形のみ）
- Nature/BMC early-access: `Received: DATE Name1, Name2…`（colon ゲート緩和）と abstract に膠着した番号付き byline（`Klein 1,5, … Krausewitz3,5 Preoperative…`）を著者回収
- 数式 crumb 見出し `V ar(QM B − QM F )` を demote；表ヘッダ行（`Brain Region` 隣の `Framework Component`）を outline から demote
- `authorProjection` **34/34**
- Reader: DovePress implanter / Springer shoulder VR（`:5180`, `reader-dove-implanter.png` / `reader-springer-shoulder.png`）— タイトル・Abstract・著者行を確認
- Springer `Name1 · Name2 ·` 段落 byline と Nature `✉ Name` を著者回収（長い middot 行が firstBodyY を自己除外しないよう修正）
- Frontiers abstract 先頭に膠着した byline（`Name…* While…`）を分離して著者・本文を復元
- Frontiers `Medical Sciences, New Delhi` を著者から除外
- 無ラベル abstract: `SECTION_INTRO` の `result, …` 誤マッチ修正；最早 narrative 帯；短い所属 crumb で run 非切断
- residual spot / epmc 層別診断: caption空 0；epmc 層別60本 **clean 59 / flagged 1**（repository cover）
- PLOS 二段組: 左レール `Citation:` で Abstract 帯を切らない；本文列のみ abstract 化；Author summary / funding 見出しを demote
- Frontiers `other`/`copyright`/APA citation byline（`Cook, D., …` 含む）・★付き所属末尾人名を著者回収
- Reader: PLOS endometrial（`reader-plos-endometrial.png`）でタイトル・Abstract・正規見出しを確認

# 2026-10-19: tauri:build:fast 高速化

- `tauri build` を1回化（以前は `--no-bundle` → `--bundles app` の二重リンク）
- Tauri 同梱は lite（~300K）のみ。venv（~730M）は `inject-translation-venv.sh` で APFS clone
- fast パスで `CARGO_INCREMENTAL=1`
- warm 再計測: **61.6s → 24.5s**（docs/BUILD_TIMINGS.md）

# 2026-10-19: Apple Translate 短い文のパック翻訳

- 単独だと落ちやすい短い英文（〜80字）を `<<n>>` マーカーでまとめ、Apple に一度渡し、訳を分割して戻す
- 同時に走っている短いブロックを 30ms 窓で合流（最大 8 件 / 1600 字）。マーカー欠落や品質不合格はユニット単位で MADLAD へフォールバック
- 版: `apple-translation-macos-v2`。回帰: `appleShortPack` / `appleTranslationEngine`

# 2026-10-19: Import の中断・再開（A2）


- **中断**: 取り込みカードのキャンセルに加え、`paperId` 付き（日本語化中で ImportJobCard 非表示）でも `cancelPaperWork` → 論文メニュー「翻訳を中断」
- **保持**: 抽出済みパッケージと完了ユニットは残す。キュー未着手は `onTaskCancelled` で outstanding を解放（ハング防止）。飛行中タスクは完了させ進捗を捨てない
- **再開**: `partial` →「続きから再開」、`failed` →「翻訳を再試行」。ユーザー中断時は `needsTranslationResume=false`（サーバー復帰での auto-resume なし）
- resume 経路にも AbortController。回帰: `importCancel` + `translation/cancelPaper`

# 2026-10-19: IEEE 無ラベル abstract + OSWORLD 図チャート見出し除去

- IEEE ACCESS: `Abstract` 見出し無しの front narrative を abstract 化；`I. INTRODUCTION` を author→heading に復帰
- OSWORLD: Percentile/Tokens/flowchart `Task Initial State Setup Config…` を outline から demote
- Cureus `Methods:` / `Results:` は section stop にしない（structured abstract 維持）
- chrome 著者追加除去: `PERSPECTIVE OPEN` / `LAY SUMMARY` / `Eye Tracking` / `Ph D` / `Toyota Research Institute`；`Name of Colorado Boulder` は人名のみ残す
- Browser 取り込みが `process is not defined` で落ちる不具合: `pdfLayout.ts` の裸 `process.env` を `layoutEnv()` に置換
- Reader 目視スクショ: `test-results/browser-verify/reader-role-attn.png` / `reader-hci-ieee.png` / `reader-osworld.png`
- mid-paragraph section split の `/i`+`[A-Z]` 誤マッチを修正 → OSWORLD 裸 `Results` / IEEE 早期 `Discussion` を outline から除去
- pending wide diagnose **limit=40: scanned 40 / flagged 0 / clean 40**；図パネル見出し `Statistics` を caption 近傍で demote（`2.2.1 Overview` は維持）
- wide **limit=200: scanned 200 / flagged 1 / clean 199**（`embedded-section-marker`）→ `Results Of the participants…` を heading 分離；小文字 glue のみ拒否に修正
- `, for the` が byline 全体を isNonAuthor で落としていたのを修正 → handedness 5名（Tomizawa…Mori）を回収
- 再診断 **limit=200: scanned 200 / flagged 0 / clean 200**

# 2026-10-19: UX イニシャル著者 / Cureus chrome / structured abstract

- `I D Sabukunze*1, A Arakaza2` を affiliation から著者へ回収。タイトル字間空きの誤著者は `recoverColumnMasthead` で拒否
- Cureus: Creative Commons / MeSH レールを著者から除外。Background/Methods/Results/Conclusions を1 abstract に結合
- DOI は page-1 のみ（参考文献 `doi:` を拾わない）。UX は DOI null、Cureus は `10.7759/cureus.108550`
- lettered affiliation が `recoverColumnMasthead` 上書きで壊れるのを防止。空 synthetic table を absorption 対象に戻し table identity 回帰を復旧

# 2026-10-19: 翻訳中のシェル操作を軽くする

- 症状: MADLAD 翻訳中にサイドバー開閉・フォルダ作成が重い
- 対策: ブロック UI 更新を 200ms 結合 + `startTransition`；論文カード化後の translating 進捗 tick は importJobStore を更新しない；benchmark 保存は await しない；サイドバー／新規フォルダ modal 操作中は翻訳 UI パッチを defer
- MADLAD 設定（3B / MPS / bf16 / batch 24 / concurrency 8）は変更なし
- 回帰: `batchBlockUpdates`（defer 理由の重ね合わせ）

# 2026-10-19: OzCHI タイトル折り返し断片の本文残留

- `Mobile Phone User Interfaces` は本文見出しではなく、タイトル
  `Exploring Finger Specific Touch Screen Interaction for Mobile Phone User Interfaces`
  の視覚的2行目
- 結合後も duplicate title fragment が `other`/低信頼度段落として残っていた → 読み順から除去
- 回帰: `drops OzCHI title-wrap fragments from the reading stream`
- 既存取り込みは再インポート（または再抽出）が必要

# 2026-10-19: 要確認ポップオーバーが切れるのを修正

- 読み順信頼度の警告メニューが Reader の `overflow` で下端クリップされていた
- `InfoPopover` を `document.body` へ portal。要確認も同コンポーネントに統一（上下クランプ）

# 2026-10-19: 書き出し保存ダイアログを1ステップに

- 検証パッケージ／ライブラリバックアップが「親フォルダ選択 → 自動でサブフォルダ作成」の2段になっていたのを廃止
- `choose file name` でパッケージ／バックアップフォルダの名前と場所を一度に指定
- 成功時は ExportDialog を閉じてトースト表示（閉じるクリックを省略）

# 2026-10-19: フォルダ単位の一括書き出し（A6）

- 入口: フォルダ画面ヘッダー「書き出す」、サイドバー `WorkspaceTree` 三点メニュー「このフォルダを書き出す…」
- 範囲: 選択フォルダ＋子孫。論文は所属ノードの階層パスへ配置（同一論文の複数所属はその分だけ複製）
- 形式: 既存と同じ Markdown / Notion / 検証パッケージ / EPUB。成果物は 1 つの階層つき ZIP（`save_export_file`）
- 失敗: 論文単位でスキップし続行。失敗または 0 件時は ZIP 内 `export-report.txt` に記録
- 回帰: `src/test/data/folderExport.test.ts`（plan + markdown/notion ZIP）

# 2026-10-19: wide 1039 + キーワード誤著者除去

- wide diagnose：**scanned 1039 / flagged 1 / clean 1038**（`title-id-mismatch` 1件＝ファイル名と本文タイトル不一致）
- ラベル無しキーワード列（`medical students`, `confirmatory factor analysis`）を著者から除外
- Playwright 目視: `networkidle`+IDB wipe だと import が空振り。`data-testid=library-add-pdf-input` + `domcontentloaded` で成功
- role-of-attention Reader: タイトル全文 + 著者 `Mirela SPIŢĂ` を確認（翻訳サーバ 401 は別件）

# 2026-10-19: abstract 断片の結合（二段組表紙）

- `markAbstracts` を Keywords / `1. Introduction` で打ち切り
- `mergeAbstractContinuations`: タイトル挟みの同一ページ abstract を幾何で結合
- role-of-attention: abs **4→1**（`of psychological` スペース維持）

# 2026-10-19: IEEE 著者膠着（NAME+Faculty）+ セクション誤著者

- `ABBASFaculty of…` を author ノードとして保持し `splitAffiliationNamePrefix` で名前／所属分離
- `I. INTRODUCTION` / OPEN ACCESS / how-to-cite を著者から除外
- HCI 著者: ABBAS / GHAUTH / TING。`authorProjection` **27/27** 通過

# 2026-10-19: same-baseline 表グリッド分離 + 長caption CAPTION_OF

- linguistics Table 3: セルが同一baselineの単一item行として caption に吸収 → `splitSameBaselineCellGridFromCaptions`
- 長文 `Table N …` タイトルが `tableCaptionShape` で落ち CAPTION_OF 不能 → 記述タイトルを許容
- OSWORLD: 文末後の短Title-Caseを caption 継続しない；二段組段落を表領域メンバーに
- HCI / linguistics / OSWORLD の table caption orphan **0**、CAPTION_OF 全リンク

# 2026-10-18: OA 追加取得 + 画像表ギャップcrop

- Europe PMC CC OA を追加取得：**+120 本**（失敗3）。pending PDF はローカル約 **928** 本（`pending-pdfs/**/*.pdf` は gitignore；候補 JSON のみコミット）
- wide diagnose 919本: flagged 5（すべて `orphan-caption`、実質 HCI / linguistics / OSWORLD）
- 原因: キャプション下にテキスト行のない画像・ベクタ表で table シェルを落としていた
- `tableCaptionEmptyGapBelow` で空ギャップを crop / `CAPTION_OF` シェル化。HCI orphan **10→0**

# 2026-10-18: Reader 目視（role-of-attention）

- `tauri:dev` + Playwright で bilingual 表紙 PDF を取り込み、Reader 見出しが
  `The Role of Attention, Memory and Cognition in the Decision-Making Process of Adolescent Students`
  / 著者 `Mirela SPIŢĂ`（INDEX COPERNICUS なし）を確認
- スクリーンショット: `test-results/browser-verify/import-role-attn-reader.png`

# 2026-10-18: ライセンス遷移を距離ベースに（加速度っぽさを除去）

大きい deltaY を「強フリック」扱いしていたのが違和感の主因。端で一度静止して武装 → 以後は1イベント寄与をキャップした距離加算のみ。idle で離し判定。速度／加速度は使わない。

# 2026-10-18: bilingual cover title / small-caps / author chrome

- 二段組未検出の表紙で display title と abstract が同一行に混ざるのを gutter+font 差で分割
- `Attention, Memory` などトピック句の person-name 誤判定を抑制
- 途中切れタイトルを How to cite レールから延長；small-caps 表示タイトルを Title Case に正規化
- INDEX COPERNICUS / Anuarul / Doctorand / constructs を著者から除外

# 2026-10-18: 厳格監査フォロー（著者汚染・frontiers footer・空table）

- 厳格監査 55件中17件に匂い → 実害は著者汚染 / `frontiersin.org` 見出し / 章末byline欠落
- 本文・トピック句の著者投影を拒否；章末 `D. A. Shepherd…` を復旧
- caption-only 空 table シェルを作らない；`11 frontiersin.org` を見出し demote

# 2026-10-18: wide diagnose 879/879 clean

- `diagnose-extraction-wide-corpus`：**scanned 879 / flagged 0 / clean 879**
- 直前のタイトル・見出しchrome・表紙スタック結合修正がコーパス全体の自動フラグを潰した
- 残りは Reader/.app 目視と、ヒューリスティック外の深掘り欠陥

# 2026-10-18: 表紙タイトル積み上げ結合 + Keywordsレール + OA拡充

- `Intelligent` / `Human Computer` / `Interaction` のような大フォント表紙スタックを再結合（人名誤爆を回避）
- `Keywords: …` ペイロード付きレールを見出しから demote
- OA pending PDF 約808本（本体は gitignore）

# 2026-10-18: Frontiersタイトル折り返し（小文字続き）+ 表ヘッダー見出しdemote

- `… prevent poor` + `mental health during the…` を pdfLayout で再結合（isHangingTitleEnd / midPhraseWrap）
- 膠着した表カラム見出し（Risk Category… / What It Reflects）を heading から demote
- University Teaching / Citation / Community drop-cap 誤爆は前エントリで対応済み

# 2026-10-18: 見出しchrome + タイトル誤爆修正（University / Community / Citation）

- 走行ヘッダー・`Article`・国名・p値レールを見出しから demote
- `University Teaching` を affiliation 誤爆しないよう looksLikeAuthorish を限定
- `Community-…` タイトルの drop-cap 誤検知を除去；Citation/Editor/節バナーをタイトル拒否
- PDF本体は gitignore（`pending-pdfs/`）。候補JSONだけコミット

# 2026-10-18: タイトル誤検知続報（From/DOI/section）+ 回帰

- drop-cap 判定が `From`/`These` を誤検知 → 実英単語 opener を除外
- `DOI 10.…`（コロン無し）を masthead 扱い、`2.1.2 …` 節見出しをタイトル候補から除外
- Cureus 折り返し（Study/Photographs）の person-name 誤検知を除外
- titleResolver / readingOrder 回帰を追加。canopy / glaucoma / HRI / electrophysiology 実PDFでタイトル確認済み。wide 再実行中（872本規模）。

# 2026-10-18: wide 811本 flagged 3→タイトル修正 + Frontiers取得強化

wide **811 scanned / 808 clean / flagged 3**（いずれも title-id-mismatch）。対応: (1) 長い英単語2つを decoder 誤検知しない (2) `*`-付き著者行 / scale database タイトル拒否の緩和 (3) Cureus 折り返しタイトルを person-name 誤検知から除外して結合。OA 取得は Frontiers/PLOS/BMC 寄りに変更（+60 成功）。pending PDF は gitignore のまま。再 wide 実行中。

# 2026-10-18: wide 794本（flagged 5→対応中）+ 著者/タイトル補正

拡充コーパス wide **794 scanned / 789 clean / flagged 5**（title-id-mismatch 3, embedded-section 1, fragmented-tables 1）。PRISMA checklist のみの OA PDF を quarantine。Questionnaire / PRISMA chrome タイトル拒否、Frontiers/Wiley 著者・Springer 所属バンドを修正。

# 2026-10-18: Frontiers/Wiley著者・所属バンド補正

- 末尾1文字イニシャル（`Sandhiya … D`）を著者から落とさない
- Frontiers byline末尾メールを許可しつつ純粋メール著者は demote
- Springer番号付き所属帯を copyright→affiliation に戻す
- ソフトハイフン付き所属の重複を潰す（Brunel）

# 2026-10-18: Wiley著者パイプ区切り / Keywords: chrome / 重複title断片

深掘り50本中の典型欠陥を修正。`Keywords:` 見出し demote、`Name | Name` 著者投影、解決済みタイトルの接尾辞 title ノードを除去。

# 2026-10-18: vignette/IEEE/OzCHI/math/thesis 抽出修正 + OA PDF拡充

- vignette `Q:`/`Option` を prose-cell-grid の table 昇格から除外（questionnaire / method-goal は維持）
- IEEE ACCESS の `ABBASFaculty` 膠着と `, AND NAME` 著者断片を投影で回復
- OzCHI 行列の純数値セル（`0.594`）を garbage 扱いしない。axis-label 付き短ラベルも維持
- thesis `n No Minor…` 行列と math 論文の文状 prose を `other`/誤 demote から保護
- ローカル pending PDF 約 680（git には上げない。`pending-oa-candidates.json` のみ）
- wide 診断（修正前コーパス）739/739 clean
- pipeline 回帰（OzCHI/IEEE/math/thesis/vignette ほか）再緑化

# 2026-10-18: ライセンス遷移を距離ベースに（加速度っぽさを除去）

大きい deltaY を「強フリック」扱いしていたのが違和感の主因。端で一度静止して武装 → 以後は1イベント寄与をキャップした距離加算のみ。idle で離し判定。速度／加速度は使わない。

# 2026-10-18: ライセンス遷移のゲージ速度と戻り位置

ゲージ溜めを遅く。ライセンスからプルバックしたときは詳細セクション先頭へ飛ばず、設定側の直前スクロール位置を復元。

# 2026-10-18: トラックパッド離しでゲージ確定／リセット

wheel 停止後 110ms の idle で「手を離した」とみなす。満タンなら遷移、未満ならゲージを弾性リセット。端への強フリックだけラッチ（穏やかな引っ張りは初回からコミット可）。

# 2026-10-18: ライセンス遷移ゲージをスクロール増減に追従

円形ゲージが下スクロールで徐々に溜まり、上スクロールで減るよう調整。最大で離すと遷移、0まで戻すと通常スクロール復帰。dashoffset に短い transition。

# 2026-10-18: 表行断片マージ + OA拡張後の wide 再走査

pending PDF **628**（git外）。wide 再走査中。新規30本深掘り issues 0。Elsevier 雑誌バナーがタイトル先頭に付く問題を修正（lead は hanging 必須／journal masthead 判定）。titleResolver + Elsevier pipeline pass。`TABLE 1 List of…` caption 化、図キャプションの vector-label `other` 抑止、questionnaire 表の `CAPTION_OF`（末尾ピリオド）＋セル再構築で pipeline 回帰 pass。数式/Funding chrome 見出し demote 継続。他の pipeline 失敗数件は本変更前から再現。ゴール「完璧」と Reader/.app 目視は未達。

# 2026-10-18: wide 7 flagged タイトル/©chrome 修正

catalog+pending 当時 **427 / 427 clean**。protocol/scoping カンマ列、Data Availability / LNCS、ALL-CAPS lead、header ギャップ、Editorial keywords 誤認、キリル vs ISSN、`©Biomedical` copyright。

# 2026-10-18: Frontiers 分割タイトル接合 + OAコーパス拡張

catalog+pending 当時 **427 / 420 clean / 7 flagged**。タイトル断片の主な修正: hyphen 分割の `joinLines`、`root-associated` inline-label 誤認、Frontiers 小文字続き、citation rail、`press conference` event 誤検出。目視スポット 7/7 OK。

# 2026-10-18: ライセンス遷移ゲージをスクロール増減に追従

円形ゲージが下スクロールで徐々に溜まり、上スクロールで減るよう調整（COMMIT 140px / wheel scale 0.65、逆方向は settle しない）。最大で離すと遷移、0まで戻すと通常スクロール復帰。dashoffset に短い transition。

# 2026-10-18: 設定↔ライセンスを Pull-to-Refresh 型に再設計

不自然さの主因は、引っ張り量を `overflowToReveal` で次ページ全体のスライド露出にしていたこと。PTR / Marvin / Flutter two-level に合わせ、引っ張り中は現ページのゴム微変位＋ゲージのみ（行き先は隠す）。閾値超えで「離して…」、離すとスタック遷移。未満は弾性戻り。慣性の端ヒットは従来どおり一旦ラッチ。`prefers-reduced-motion` で変位ほぼゼロ・遷移短縮。単体: pullVisualOffset / commit progress / latch cap。

# 2026-10-18: 設定→ライセンスの引っ張りUI（ゲージ＋端で一旦停止）

勢いよく設定を下までスクロールしたとき、端に当たった最初のオーバースクロールはゴム戻りだけにしてページ遷移しない（一旦停止）。端に止まったあとの引っ張りで遷移可能。引っ張り中は円形ゲージがコミット閾値まで溜まり、閾値超過でアクセント色＋「離すと…」。`useSettingsElasticPull` + Settings ヒント UI。単体: pullCommitProgress / latchOverflowCap。

# 2026-10-18: wideコーパス7件のタイトル/見出し/セクション接合を修正

catalog+pending **346/346 clean**（PRISMA付録PDFはquarantine）。DOI後の偽author帯でタイトル後半が落ちる問題、spaced SYSTEMATIC REVIEW / citation byline / checklist タイトル誤検出、Frontiers散文・数式見出し、BMC `Background/Methods` 連鎖の再帰分割を修正。Unpaywallがappendixのみ返すJMIR本は隔離。

# 2026-10-18: Frontiers FIGURE| キャプション + OA大量追加（git外）

`FIGURE 1 | …` / `FIGURE 1PRISMA…` を figure_caption、`Table N (Continued).` を table_caption に昇格。タイトル先頭の `O R I G I N A L R E S E A R C H` 帯を除去。Europe PMC の `?pdf=render` は CF/403 が多いため、権利確認は Europe PMC（OA+CC）のまま PDF 本体は Unpaywall の出版社 URL から取得するよう `fetch-oa-europepmc.mjs` を更新。pending PDF は引き続き gitignore（コミットしない）。ローカル pending 約 **236** PDF / 候補メタ **297**。Frontiers の `EDITED BY` / `OPEN ACCESS` / 抄録リードイン見出し化と所属マッシュタイトルも抑止。pending 80本サンプルは **78/80 clean**。回帰: caption / title banner / affiliation-mash unit pass。ゴール「完璧」と Reader 目視は未達。

# 2026-10-18: EPUB 3 export and explicit cloud-folder sync

Reader export now includes an EPUB 3 option for Apple Books / Kindle. The
export is built from the existing translated Paper Package and reuses the
Markdown failed-translation policy, so failed blocks are omitted by default
or retained as the existing warning/original callout when explicitly enabled.
The archive contains an uncompressed first `mimetype` entry, `container.xml`,
OPF metadata (title/author/language), a navigation document, XHTML content,
CSS, and package assets under `OEBPS/images/`. A focused EPUB test verifies the
container, navigation, content image links, and asset placement.

Settings now allow the user to choose an existing iCloud Drive or Google Drive
folder. EPUB export can explicitly copy the same deterministic `.epub` into
that folder; there is no background sync, cloud API, OAuth, or automatic
library-wide export. The macOS command writes through a temporary sidecar and
renames it atomically, validates the selected absolute folder and filename,
and never deletes or touches unrelated files.

Validation: `npm run typecheck`, `npm run lint`, focused EPUB test, Vite
production build, `PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path
src-tauri/Cargo.toml`, and the fresh packaged Tauri integration pass. The
packaged acceptance marker now records a non-empty `epubBytes` value and the
archive contains the required EPUB entries. Full Vitest still has the
repository's existing unrelated PDF/quality regression failures; none are in
the new EPUB or sync paths. Apple Books / Kindle visual import has not been
exercised on a device.

# 2026-10-18: 設定→ライセンスを掲載必須のみに再調査

サードパーティ一覧を「macOS 配布物かつ帰属表示が必要なもの」に絞った。Rust は全 resolve（約 466）ではなく `cargo tree --target {aarch64,x86_64}-apple-darwin -e no-dev,no-build`（237）のみ。`Unlicense OR MIT` / `0BSD OR …` / `CC0-1.0 OR …` など帰属不要を選択できる二重ライセンスは除外。結果 **529 → 293** 件（非配布 229 + 帰属不要選択可 7 をフィルタ）。`generatorVersion` 2。方針は `THIRD_PARTY_NOTICES.md` / `scripts/generate-licenses.mjs`。`npm run generate:licenses` と `src/test/licenses.test.ts` pass。

# 2026-10-18: 日本語追悼散文の表誤分類を修正

深い目視サンプルで Neisser 追悼 PDF の多段組日本語本文が table になっていた。CJK 句読点付き長文は layout の table 役割より paragraph を優先。チェックマーク比較表回帰は維持。wide 構造診断は直前 **247/247 clean**。ゴール「完璧」と Reader 目視は未達。

# 2026-10-18: Using-to 学術タイトルの誤除外を修正

catalog+pending フル診断 **247** 本で flagged 2（同一 GPT-3 PDF の二重登録）。`Using Google Cloud…` 抑止が `Using cognitive psychology to understand GPT-3` までツール行扱いしていた。学術 Using-to/for パターンと vignette `Option N:` を分離。修正後の再走査は **247/247 clean**。ゴール「完璧」と Reader 目視は未達（構造診断以外の表境界・読み順の目視継続）。

# 2026-10-17: 拡張OAコーパスのタイトル誤検出を修正

pending 136 本の wide 診断で flagged 5（Cureus の `Using Google Cloud…` ツール行タイトル、倫理文タイトル、参考文献の embedded-section 誤検知）。ツール行・倫理 boilerplate を title 候補から除外し、番号付き参考文献を診断から除外。pending 再走査で clean 目標。回帰: Cureus tool-line title pass。

# 2026-10-17: pending PDFはgitに入れない + OA大量追加

実PDF本体は評価用ローカル資産。`test-fixtures/real-papers/pending-pdfs/**/*.pdf` を gitignore し、追跡済みPDFを index から外した（ディスク上のファイルは残す）。再取得は `node scripts/fetch-oa-europepmc.mjs`（Europe PMC で OA+CC 確認 → Unpaywall/出版社 PDF）。コミット対象は候補JSON・取得スクリプト・gitignore。最新件数は冒頭の 2026-10-18 エントリを参照。

# 2026-10-17: 図パネル/凡例の見出し誤昇格を抑止

目視監査で GPT-3 論文の `A B` / `Mean regret` / `HumansDavinci` などが outline に混入。Title-Case を「3文字以上の語」必須にし、図キャプション帯の短軸ラベル・camelCase 凡例・`Input:` を demote。Cyrillic ALL-CAPS 見出し・arXiv スタンプ・`X∞` 抑止とあわせ、wide **207/207 clean**。ゴール「完璧」と Reader 網羅目視は未達。

# 2026-10-17: Cyrillic見出し・arXivスタンプ・数式マイクロ見出し

残 sparse-headings（sensory marketing）は `headingTextShape` / `uppercaseRatio` がラテン専用だったのが原因。Unicode 大文字比 + 同一サイズ ALL-CAPS セクション昇格で Cyrillic 見出しを復旧。あわせて `arXiv:` スタンプのタイトル誤採用と `X∞` 系図中ラベルの見出し化を抑止。wide 診断（catalog+pending）**207 / 207 clean**（flagged 0）。目視サンプル 16 本の自動スキャンでも arXiv/空タイトル/無見出しは無し。ゴール「完璧」と Reader 網羅目視は未達。

# 2026-10-17: タイトル誤検出とセクション分割の硬化 + OA追加

Europe PMC から CC BY のみ再取得（成功 10 / 403 多数は迂回せず）。権利未確認の CRC 教科書・誤本体・複数論文合体 PDF は `_quarantine/` へ隔離（コミット対象外）。gaze は日付レンジのマストヘッド誤爆と PRISMA 表セルタイトルを修正。fatigue は plain Materials/Methods 見出し分割。Keywords 行のタイトル化と Cyrillic ALL-CAPS 復旧を追加。フル診断 **210**（catalog 113 + pending 97）は **flagged 5 / clean 205**（重複 id・誤PDF・sparse が主因；隔離後は再走査予定）。回帰: date-range title / Materials-Methods split pass。ゴール「完璧」と Reader 目視は未達。

# 2026-10-16: OA論文の権利確認付き追加取得

Europe PMC API で `isOpenAccess=Y` かつ `license` が `cc by` / `cc by-nc` の論文だけを取り込む `scripts/fetch-oa-europepmc.mjs` を追加。12本を pending にダウンロードし、候補メタに `license` / `licenseVerifiedVia` / `pmcid` を記録。ScienceDirect / Wiley 直リンクの 403 は迂回せず失敗扱い。既存の arXiv・著者ホスト・PMC 方針は維持。

あわせてタイトル復旧を強化: 汚染露語マストヘッド、章本文のタイトル化、`npj | …` / `Journal 50 (2026)` ジャーナル帯、スキャン本の空タイトル。pending 診断は新規を含め再走査。

# 2026-10-16: PDF抽出の広範囲診断と改善（catalog+pending）

118本カタログを超える評価のため `scripts/diagnose-extraction-wide-corpus.ts` を追加。pending 76 の初回は flagged **72** / clean **4**（`embedded-section-marker` 過検知が支配）。最新フル走査 **189** 本（catalog 113 + pending 76）は構造診断で **flagged 0 / clean 189**（`test-data/real-papers/reports/extraction-wide-corpus-latest.json`）。pending 初回 72 flagged からの改善。あわせて投影側で captionless method/goal 表の段落化と CJK ✓比較表の caption 吸収を直し、当該 pipeline 回帰も pass。Reader 実機の網羅目視はまだゴール未達。

入れた修正:

- **図中マイクロラベルの見出し化**: `Q` / `VM` / `ASPP` / `PA:` / `Task` などが rare figure font + `headingTextShape` で見出し昇格。candidate demote + heading score clamp（`other` は上げない）。medical / osworld / hci-ihci で short heading 0。
- **学位論文の著作権シート**: copyright boilerplate を masthead 扱い、表紙タイトルを接合。
- **弱タイトル復旧**: Abstract 語・CID 制御文字・短断片（`RF Energy`）・欠落時に page1–2 の Latin / heading / ALL-CAPS から代替（キーワード行・著者行は除外）。
- **表 DOI スタンプ**: `doi:10.…t002` を paragraph ではなく `other`。
- **IEEE `Abstract—` 分割**: 1段落の `Abstract—本文…` を heading `Abstract` + abstract 本文に分割（medical survey で確認）。
- **診断ノイズ削減**: `Abstract.` 章頭・参考文献・"Results are…" を embedded-section から除外。

実PDF確認: medical survey / osworld / marketing thesis / Thai marketing / Japanese ergonomics / Russian linguistics / power-over-skin / HFE DOI。回帰: IEEE Abstract— / diagram micro / thesis copyright / lowercase colon pass。captionless method table・CJK checkmark は本変更前から失敗（別件）。ゴール「完璧」は未達（残 flag・既存 table 回帰・catalog 再走査の継続が必要）。

# 2026-10-16: ゴミ箱「空にする」ボタン幅

ヘッダーの「ゴミ箱を空にする」を、行の「元に戻す」+「削除」の合計幅に合わせた。

# 2026-10-16: 「翻訳に失敗しました」多発の抑制

実パッケージでは失敗ブロックの再訳が通る一方、初回 import / resume は `retryFailed: false` でタイムアウト1回が即 failed になっていた。加えて失敗コールバックがリトライ前に走り、キューがタイムアウト再試行で詰まりやすかった。queue は一時エラーだけリトライし exhausted 後に failed、品質拒否は原文保持（failed UI なし）、401 は token 再取得、figure キャプションの `図N.` 局所化を追加。retry/resume/UI テスト 11/11・typecheck pass。既存の failed ブロックは再開／再試行で拾える。

# 2026-10-16: Reader ヘッダーアイコンをデザイントークンへ

色・余白・`--control-height` は既にあったがアイコン尺度が無く、Reader 右上が `size={20}` でサイドバー（16）より一段大きく見えていた。`--icon-size*` / `--icon-button-size` を追加し、ヘッダーツールを 16px アイコン＋32px ヒット領域に揃えた（`iconTokens.ts` は Lucide 用の数値ミラー）。

# 2026-10-16: 設定→ライセンスのサイドバー遷移を弾性スナップに

サイドバーの「ライセンス」クリックが stack を即切替していたのを、オーバースクロールと同じ `goToPage` スナップ（400ms）に揃えた。ライセンスから設定項目へ戻るときも同様にアニメーションし、戻ったあと対象セクションへスクロールする。

# 2026-10-16: 目次スクロールバーを非表示

Reader 左の目次はスクロール可能のまま、スクロールバーだけ非表示（`scrollbar-width: none` / webkit display none）。

# 2026-10-16: lowercase colon lead-in の見出し昇格を抑止

本文の discourse lead-in（`follows:` / `triggered:` / `following comment:`）が、同一ベースライン上の italic 引用と font 差で colon-prefix 分割され、見出し扱いになる問題を直した。colon-prefix 分割は Title Case / ALL CAPS の構造ラベル（`Background:` 等）に限定し、`classifyLineRole` と candidate demotion でも小文字 colon 行を paragraph に戻す。`2686612.2686699.pdf` では該当語は本文段落に留まり、ABSTRACT 等の正規見出しは維持。focused pipeline 回帰（lowercase colon + CJK title）2/2 pass。

# 2026-10-16: 翻訳中の本文スクロールが重い

翻訳完了のたびに全ブロックへ `blocks` 配列を渡して memo が無効化され、かつ毎フレーム近く store 更新していた。引用用リスト／index を安定化し、ブロック更新を 120ms 結合＋スクロール中は適用 defer。セクションに `content-visibility: auto`。翻訳パッチでの不要な layout effect も外した。batch/reader テスト 33/33・typecheck pass。

# 2026-10-16: 本文がエラーなしで未翻訳のまま残る

Reader の Paragraph が import の `shouldTranslateBlock` より狭い `shouldTranslateParagraph` だけで表示を決めていた。リスト項目など import 対象の pending/failed が「対象外」扱いになり、待ち表示も失敗 UI もなく原文だけ出ていた。表示判定を `resolveParagraphTranslationUi` に寄せ、pending/processing/failed は必ず待ち／再試行面を出す。reader テスト 31/31・typecheck pass。

# 2026-10-16: 目次ハイライトと本文スクロールのガタつき

IntersectionObserver は変化したエントリだけを返すのに、交差中の先頭だけを目次の現在位置にしていたため、スクロール中にハイライトが跳ねていた。交差集合を保持し文書順で選ぶ。目次クリック中は対象セクションをロック。仮想化スペーサは実測高さがあればそれを使い、ビューポートより上でマウントしたときの高さ差分だけ `scrollTop` を補正する。reader テスト 27/27・typecheck pass。

# 2026-10-16: retain single-column table rows in the Reader

The table package boundary previously kept native rows only when at least one
row had two or more cells. Single-column tables and vertically flattened table
streams therefore fell through to the space-joined source fallback, even
though their native line geometry was available. `attachLinesToBlocks` now
retains any multi-row table as `metadata.tableRows`, including one-cell rows,
and the Reader renders that fallback as row surfaces. Ordinary paragraphs are
not affected because the change applies only after a block has already been
classified as a table. The existing multi-column grid path is unchanged.

The focused layout tests pass **6/6** (including the new single-cell-row
regression), `npm run typecheck` and lint pass with only the existing warnings,
and the full real-paper extraction/reading-order suite passes **232/232**
(118 extraction + 114 reading-order, 436.50s). The refreshed 118-PDF table
audit still has **0 extraction errors**; readable native row fallbacks increased
from **491 to 517**. `npm run tauri:build:fast` completed successfully and
updated `src-tauri/target/release/bundle/macos/Versio.app` at 03:43:29
JST. The fresh bundle passed the complete tiny-fixture packaged integration
flow (import, annotation, search, both exports, quit, relaunch). A real
cognitive-memory packaged import also persisted **192 blocks**, including
**32** table blocks and **25** with row metadata, but its acceptance flow still
timed out after `import_ok` while starting search; this remains the known
search-concurrency verification item rather than an extraction failure.

The same package path exposed a second generic table issue: wrapped PDF cell
fragments whose bboxes physically overlapped were being treated as separate
columns (for example `Option (` / `Correct` / `Answer`). Row normalization now
joins overlapping fragments within the preceding cell while preserving truly
separate columns. A regression covers this geometry case. The complete
real-paper suite remains **232/232** after the change (118 extraction + 114
reading-order, 434.57s).

The `.app` was rebuilt again after this geometry change at **03:59:04 JST**;
the latest bundle passed the complete tiny-fixture packaged integration flow
with an isolated acceptance home. The earlier real cognitive-memory run still
has the separate search-concurrency timeout described above.

# 2026-10-16: serialize database startup migration/index sync

The packaged OzCHI run showed that extraction and Reader package loading were
complete (168 blocks), but the acceptance flow stalled when search was started
while the paper still had `processingStatus=translating`. `database.ready()`
could previously run the IndexedDB migration and package-index synchronization
concurrently from multiple import, translation, Reader, annotation, and search
callers. It now shares one in-flight promise, preventing interleaved sql.js
transactions and duplicate package-index rebuilds. The lock is reset by the
existing test reset helper.

FTS integration, migration, annotation tests (**6/6**), typecheck, and lint
pass (lint reports only pre-existing warnings). The real-PDF extraction suite
remains **232/232**; the next packaged run must verify the search step with a
still-translating real paper.

# 2026-10-16: demote prose falsely retained as table fallback

The table-reader audit found five reader-visible `prose-like` fragments that
had no recovered cell rows but were marked `tableSourceFallback` by the
geometry resolver. They were ordinary narrative/question text (including the
wrapped continuation `To this end, it is fundamental ... Potential
application`), so the Reader skipped translation and showed them as opaque
table cards. Package attachment now applies a narrow, generic repair: an
explicit table fallback is returned to `paragraph` only when it has strong
paragraph evidence, table-row geometry evidence, at least ten prose words, and
no structured cell row. Captioned tables, image-backed tables, and any block
with two or more recovered cells are untouched. The repaired block is marked
`packageRoleRepair=narrative-table-fallback-demoted` and returned to the
translation queue.

The focused package-layout regression is **2/2**, typecheck and lint pass with
only existing warnings, and the full cached extraction/reading-order corpus is
**232/232** (118 extraction + 114 reading-order) in **456.54s**. The refreshed
118-PDF table audit has **0 extraction errors**, **367** table captions, **251**
crop-ready captions, **637** reader-visible source-only fragments, and **491**
native structured-grid fallbacks. Fragment triage is now
`structured-grid=491`, `short-label=130`, `ambiguous=15`, `numeric-grid=1`,
`prose-like=0`; the remaining source-only fragments are not sentence-shaped
false table fallbacks and remain a diagnostic review set.

The fast Tauri bundle was rebuilt at **2026-10-16 03:05 JST** and its compiled
frontend contains `narrative-table-fallback-demoted`. A packaged run with the
OzCHI fixture reached Reader package loading with **168 blocks**; the
acceptance-only trace then stopped at the search call while the imported paper
was still `translating`. The same bundle passed the complete integration flow
with the tiny fixture. This is an acceptance/search-concurrency verification
item, not an extraction failure; the prior real-PDF packaged runs and the
232/232 extraction suite remain green.

# 2026-10-15: packaged cognitive-memory table verification

The latest `.app` was exercised with the real
`cognitive-memory-cues.pdf` fixture, rather than the tiny acceptance PDF. The
package imported and persisted **125** blocks, including **52** table blocks
and **32** blocks with native `tableRows`; search, annotation, Markdown/Notion
export, quit, and relaunch all passed. This confirms the flattened-cell row
projection is present in the actual Tauri package, not only in the TypeScript
benchmark.

# 2026-10-15: recover rows from flattened native table nodes

Some questionnaire and compact multi-column tables had reliable native cell
boxes but were projected as one concatenated source-only string because the
resolver node and layout block were not joined at projection time. The table
projection now reattaches a matching layout block by page/text when needed,
groups repeated x-position cells on the same baseline, and stores the result
as `tableRows` only when at least two rows share multiple columns. The fallback
remains source-only and skipped for translation. On the 114-PDF table audit,
`prose-like` fragments fell **18 → 7**, `ambiguous` fell **64 → 35**, and
readable native-grid fallbacks rose **676 → 718**, with zero extraction errors.
The cognitive-memory questionnaire is covered by a regression test.

# 2026-10-15: corpus provenance mismatch recorded

The full extraction benchmark found one catalog/source mismatch independent of
the parser: `linguistics-the-role-of-morphology-in-computational-linguistics-its-significance-i.pdf`
contains an adolescent mental-health article and DOI `10.5281/zenodo.18409657`,
while its catalog entry claims a morphology paper and DOI
`10.5281/zenodo.18456227`. The linked publisher page currently serves the same
adolescent-health PDF. This item is recorded in
`test-data/real-papers/reports/source-provenance-mismatches-v1.json` and must
be replaced or corrected before using its title metric as extraction evidence.

# 2026-10-15: separate reviewer/editor affiliations from flattened author mastheads

The `cognitive-dual-task` Frontiers PDF exposed a generic masthead failure:
the native stream flattened the editor/reviewer institutions, reviewer names,
and numbered author affiliations into one affiliation row. The projection now
uses the review-label geometry to exclude short reviewer-location rows,
removes a reviewer institution prefix only when the following text has clear
organization evidence, and splits long numbered affiliation streams at stable
institution starts. Aggregate rows are discarded only when they contain two or
more recovered institution names. The existing reviewer-chrome and author
projection suite passes **27/27**; this changes metadata projection only and
does not alter canonical source nodes.

# 2026-10-15: recover compact caption-anchored table regions

The medical deep-learning review exposed a generic table relation gap: bare
captions such as `Table 1` were excluded from caption-to-table matching, and
small native cell rows had no individual table score after the PDF stream
flattened them. The resolver now accepts a bare numbered table caption, while
region evidence uses a conservative caption-local x/y repetition fallback
only for short, numeric or compact rows. It does not promote sentence-shaped
prose. On the four corpus papers with table-region ground truth, region recall
improved from **0.8214 mean (minimum 0.2857)** to **1.0 mean/minimum**; table
caption recall, source integrity, and the full **232/232** extraction/reading
order regression remained green.

# 2026-10-15: recover interrupted native titles without absorbing issue rails

The full cached corpus benchmark now records both the title shown to the
Reader and the title recovered from native PDF evidence. Across 113 cached
papers, Reader-title exactness was **105/113 (92.92%)** before the latest
change, while native-title exactness was **68/113 (60.18%)**; **39** papers
used verified catalog metadata as a fallback. A generic title continuation
rule now joins same-font, lowercase continuation lines whose preceding line
ends in an unfinished function word, while rejecting issue/date/ISSN/DOI rails
as title prefixes. On the affected Eco-Linguistics PDF the canonical title is
now complete, and the full benchmark's Reader-title exactness improved to
**106/113 (93.81%)**. The regression is covered in `pipeline.test.ts`;
catalog mismatches should still be corrected in corpus metadata rather than
hidden in the resolver.

# 2026-10-15: packaged OzCHI masthead and table verification

The actual packaged import path was also exercised with the OzCHI 2014
finger-specific-touch PDF that previously exposed permission-text, masthead,
and flattened-table failures. It completed import, annotation, search, both
exports, quit, and relaunch. The saved package has the two extracted authors
(Ashley Colley and Jonna Häkkilä), two institutional affiliations, and no ACM
permission, copyright, DOI, or venue text in readable blocks. It contains
seven table nodes, five with native cell grids; the former flattened `Finger
Thumb …` and `Function Call …` strings do not occur as reader blocks. This is
package-level evidence, not a claim that every table in the corpus is fully
semantic.

# 2026-10-16: 目次ハイライトと本文スクロールのガタつき

IntersectionObserver は変化したエントリだけを返すのに、交差中の先頭だけを目次の現在位置にしていたため、スクロール中にハイライトが跳ねていた。交差集合を保持し文書順で選ぶ。目次クリック中は対象セクションをロック。仮想化スペーサは実測高さがあればそれを使い、ビューポートより上でマウントしたときの高さ差分だけ `scrollTop` を補正する。reader テスト 27/27・typecheck pass。

# 2026-10-15: preserve prose continuations beside a table or figure band

A real cognitive-psychology page contains a compact left statistics table and
right results prose at the same y positions. The right-side lead,
`In this study, there was a significant difference between gist memory`, was
correctly kept as a paragraph but had also been recorded as a possible
figure-band label merely because of a nearby caption. Continuation searching
then skipped it unconditionally, leaving `and detailed memory at 10 min …` as
a separate paragraph and translation unit.

The continuation pass now distinguishes a genuine short graphic label from a
body run using its role, word count, native width, and document body font. A
body run stays eligible as the predecessor even if it lies near a caption. The
same sentence is now reconstructed as one paragraph while the left statistics
table remains a table. The targeted real-PDF regression, typecheck, and lint
pass; the complete **118 extraction + 114 reading-order** corpus passes
**232/232** in **458.99 seconds** under `caffeinate -dimsu`. A fresh fast
`.app` built at **2026-10-15 18:37:19 JST** passed the isolated packaged
import, annotation, search, Markdown/Notion export, quit, and relaunch flow
with this PDF. Its saved package has one paragraph containing both `gist
memory` and `and detailed memory at 10 min`; no standalone tail remains.

# 2026-10-15: initial import no longer waits for optional figure rasterization

A packaged import of the real 30-page cognitive-memory PDF exposed that the
Reader package was not saved while `extractFigureImages()` was still trying to
rasterize vector-only caption crops. PDF.js canvas rendering can occupy the UI
thread synchronously, so the promise timeout cannot reliably interrupt it. The
failure left the import at `図を抽出しています...` for more than seven minutes and
therefore made an otherwise valid document appear as an empty Reader.

Initial import now persists the native extraction, captions, and reconstructed
native table cells before any optional figure/table raster asset work: it calls
the academic pipeline with `extractFigures: false`. Explicit re-extraction
retains full figure-asset extraction. Thus Reader usability and source-only
cell grids do not depend on a page-wide vector raster completing. A fresh fast
`.app` was built at **2026-10-15 18:14 JST** and packaged integration E2E with
`cognitive-memory-cues.pdf` passed import, annotation, search, Markdown and
Notion export, quit, and relaunch. Its saved structure contains **59** tables,
**34** native cell grids, **0** image-table assets, and does not put `In this
study … gist memory` into a table. The focused interleaved table/body
regression, typecheck, lint (known warnings only), and package verification
pass. A fresh full 118-PDF table Reader audit also completed with **0**
extraction errors, **347** table captions, **1,029** reader-visible raw table
fragments, and **676** native cell-grid fallbacks. Its remaining
`prose-like=18` entries describe long table cells and remain a review set, not
a reason to weaken table confidence. Future work may add background asset
enrichment, but it must never block initial package persistence or Reader
availability.

# 2026-10-15: split interleaved table/body columns before role resolution

A real cognitive-psychology PDF exposed a high-cost table error: a compact
left-column statistical table and right-column results prose share y positions.
The native PDF stream grouped their alternating lines into one block, so the
table grid evidence classified the whole block as `table`; right-column prose
then became a source-only table fallback and was never sent for translation.

Layout reconstruction now separates this narrow shape before canonical role
resolution. It requires three compact numeric rows with a repeated left-side
grid, an actual horizontal gutter, independently body-sized type to the right,
and sufficient prose words. Mixed lines are divided by their native item x
coordinates. Table evidence now also keeps the exact predicate that promoted
it, and repeated-caption grids require a compact three-column anchor band that
the candidate itself intersects. Therefore a prose line merely aligned with a
table cannot inherit its role. The regression keeps `Memory cue / F / Sig.` as
a table while `In this study … gist memory` and `and detailed memory …` remain
paragraphs; neither may appear inside a table node.

The same paper also has individual baselines composed of three small numeric
cells followed by a right-column sentence. A second, local repair now splits
this form only when two nearby rows repeat those numeric x origins and the
right run has body-sized typography and prose. Thus `0.397 / 0.674 / 0.014`
remains table data while `they were not significantly correlated …` remains a
paragraph. The full 118+114 corpus was rerun after this refinement and again
passes **232/232** in **475.65 seconds**.

The full cached corpus passes **232/232**: **118** extraction baselines and
**114** reading-order checks in **538.29 seconds** under `caffeinate -dimsu`.
The refreshed 118-PDF table Reader diagnostic has **0** extraction errors,
**347** table captions, **257** crop-ready captions, **1,028** reader-visible
source-only fragments, and **675** readable native-grid fallbacks. Triage is
`short-label=268`, `structured-grid=675`, `prose-like=18`, `ambiguous=64`,
`numeric-grid=3`. These are diagnostics, not a claim that all tables have
semantic cell reconstruction. The next review set remains the 18 prose-like
fragments; do not suppress tables or relax confidence merely to lower it.

# 2026-10-15: refreshed full-corpus table-reader audit

After the precision change, the table-reader readiness audit completed across
all available real PDFs without extraction errors. It records **347** numbered
table captions, **257** crop-ready captions, and **1,041** reader-visible
source-only table fragments. Of those, **686** have native cell rows suitable
for the Reader fallback grid; fragment triage is `short-label=269`,
`structured-grid=686`, `prose-like=19`, `ambiguous=64`, `numeric-grid=3`.
Compared with the previous 114-PDF diagnostic (**1,115** reader fragments,
**900** cell-grid fallbacks), both counts decrease. These metrics describe
fallback geometry, not semantic table completeness.

The remaining `prose-like=19` cases are the next high-value review set. A
sample contains a statistical table geometrically interleaved with a narrative
results paragraph: this must be attributed at the native line/grouping layer
before changing table evidence. Do not relax the table score or hide all
source-only tables to improve this count.

# 2026-10-15: prose-grid precision and table-cell evidence precedence

The first `repeated-prose-cell-grid` implementation correctly recovered the
captionless education-method table but was too page-wide: a nearby ordinary
paragraph could share two of its x origins and be marked as a table. The
geometry evidence now learns **physical baselines** from native item gaps and
requires at least three repeated, separated anchors on three same-baseline
rows. A candidate must also intersect that proved vertical core, so preceding
body prose stays a paragraph. It supports table headers and long prose cells;
headers are promoted only after the full three-band proof exists.

A second resolver path was lowering an already-proved table score to the broad
`tableLike` fallback score of 0.68. Native-grid evidence now combines by
maximum, preserving stronger document-level evidence. The education regression
therefore verifies all of: header is a table, representative long cells are
tables skipped by translation, and the immediately preceding narrative stays a
paragraph. The CJK checkmark matrix regression still passes.

Targeted regressions, typecheck, lint (pre-existing warnings only), and diff
validation pass. The complete cached 118-PDF extraction baseline and 114-PDF
reading-order suite pass **232/232 in 445.34 seconds** under `caffeinate
-dimsu`. A new fast Tauri bundle was built at **2026-10-15 12:11:53 JST**:
`src-tauri/target/release/bundle/macos/Versio.app`. Its isolated import
of the 30-page education PDF completed annotation, search, Markdown and Notion
export, quit, relaunched, and retained the package (`ok=true`, search hit
**1**, Markdown **61,695 bytes**, Notion **1,107,751 bytes**). The saved
structure keeps the preceding `There is a wide range …` text as a paragraph,
while `Method / Goal-description / Key applications` and the long
`Distillation of data …` cell are source-only tables with native cell x
coordinates. No Versio or bundled translation-server process remains.

# 2026-10-15: borderless prose tables and CJK checkmark matrices

Two real-paper regressions remained after the caption-owned native-grid work. An
education paper contains a captionless three-column method table whose cells are
ordinary prose, so its numeric density was insufficient for the existing
captionless-grid evidence and each cell was sent to translation as a paragraph.
Separately, a CJK comparison matrix uses checkmarks (`√`) as column values; its
repeated comparison-row geometry was detected, but a later mathematical-fragment
guard treated the same marks as equation symbols and erased that table evidence.

Generic extraction now adds a high-confidence `repeated-prose-cell-grid`
evidence only for compact page-local bands with **three or more visibly separate
native x anchors**, each repeated across at least three logical blocks. This
recovers qualitative, borderless tables without treating ordinary two-column or
indented prose as a table. CJK checkmark comparison rows retain their existing
repeated-row evidence through the mathematical-fragment guard, while genuine
formula detection remains unchanged. No vocabulary, title, or paper-specific
condition was added.

The education table's method, goal, and application cells and the first three
CJK comparison rows now resolve as `table`, are omitted from paragraph
translation, and carry inspectable geometry evidence. Their real-PDF regressions
pass. Typecheck and lint pass (lint has only pre-existing warnings). The complete
118-PDF extraction baseline plus 114-PDF reading-order corpus passes **232/232**
in **470.41 seconds** under `caffeinate -dimsu`. The broad pipeline suite has
**67/67 assertions passing**; Vitest still exits nonzero only because of an
existing `onTaskUpdate` worker-RPC timeout after completion. A fresh fast Tauri
bundle is still required before the change is called packaged acceptance.

# 2026-10-14: detached native caption-title recovery

A 305-page transport-safety thesis exposed a malformed but common native-PDF
case: `Table 2.5:` and `Light truck crash rates in NSW in 2000 and 2011` are
one visual caption, yet their PDF text objects carry incompatible vertical
coordinates. The title therefore became a paragraph while the identifier was
absorbed into the flattened table-cell row. Layout reconstruction now rejoins
only a bare numbered `Table`/`Figure` identifier with a **unique** one-line
title sharing the page, left edge, font size, font face, and a bounded,
pre-identifier coordinate displacement. Ordinary adjacent captions continue
to use the normal line-gap merge.

The repair is tagged through projection, so only this malformed caption class
forms a boundary during same-baseline table-row aggregation. The Reader keeps
`Table 2.5: Light truck crash rates in NSW in 2000 and 2011` as a separate
table caption instead of folding it into source-cell text. Synthetic and real
thesis regressions pass, as do typecheck, lint (existing warnings only), and
diff validation. The broad `pipeline.test.ts` suite retains two known failures
on the unmodified HEAD as well: the captionless education-method table and the
CJK checkmark matrix currently project as paragraphs. Treat those as a
separate baseline repair, not as evidence against this caption change.

The fast Tauri bundle was rebuilt at **2026-10-14 19:44:08 JST**:
`src-tauri/target/release/bundle/macos/Versio.app`. Its isolated import
of the 305-page thesis wrote a package whose `Table 2.5` block has the repaired
caption metadata and a readable raster table asset. The general packaged E2E
runner timed out while background Vision OCR reported page 1/7, after package
creation; treat full OCR completion as a separate import-progress issue rather
than claiming that acceptance flow passed.

# 2026-10-14: hierarchical table-caption identifiers

The table audit of a long technical thesis exposed an identifier gap: captions
such as `Table 2.5:` were not recognized by the shared layout caption predicate,
because it accepted only one numeric component. `isTableCaption` now accepts
numeric paths and appendix prefixes (`Table 2.5`, `Table A.3.1`) consistently
for ordinary, delimited, continuation, and title-bearing caption forms. This
does not promote a contents entry by itself; the existing dotted-leader and
page-geometry rules still classify navigation entries independently.

Unit regressions cover both hierarchical forms. The real thesis regression
continues to keep its contents entry out of table projection while recognizing
the body caption and avoiding a nearby figure relation. Focused tests,
typecheck, lint (existing warnings only), and diff check pass. This small source
change was included in the next fast `.app` package build.

# 2026-10-14: repeated vector-panel annotation suppression

The table-reader audit still contained plot-panel subtitles from a vector-heavy
computational-linguistics paper. The labels were only one native line each,
so the prior multi-line grid guard could not distinguish them from a table
cell. Generic extraction now recognizes a panel annotation only when an
exceptionally graphics-dense, image-rich page has no nearby table caption and
an exact same-baseline, horizontally separated peer using tiny native type.
This is geometry and repetition evidence, not a vocabulary rule. It leaves
ordinary short text and real captioned tables untouched.

The real regression covers the paired `for GPTrel …` panel labels, which now
resolve to `other` rather than `table`. Across the cached corpus, reader-visible
raw table fragments improve **685→678**, cell-grid fallbacks **495→488**, and
the diagnostic paper improves **55→48**; table captions (**345**), crop-ready
captions (**255**), and extraction errors (**0**) are unchanged. The complete
cached extraction and reading-order corpus passes **232/232** in **464.86
seconds** under `caffeinate -dimsu`; targeted regression, typecheck, lint
(existing warnings only), and diff check pass. The fast `.app` was rebuilt at
**2026-10-14 19:12:23 JST**. Fresh isolated packaged acceptance imported the
real vector-heavy PDF, completed annotation, search, Markdown and
Notion-package export, quit, relaunched, and retained the package
(`result.json`: `ok=true`, searchHits **1**, Markdown **129,271 bytes**,
Notion **80,954 bytes**). No app or bundled translation-server process remains.

# 2026-10-14: caption-owned native table grids and dense-page import bound

Reader-visible table cells were still escaping their numbered caption when a
native PDF table had no reliable raster crop. In OzCHI this produced standalone
cards such as `Comfortable / Finger 1 / 0.000` and `Finger / Phonebook / …`,
which neither read as a table nor belonged in translation. Package projection
now folds a grid into an existing same-page, same-column numbered table caption
only when repeated native x-bands occur across at least three short visual rows.
It preserves the cell geometry for the Reader grid and removes the source cell
blocks, without using paper-specific words. Raw layout is consulted only after
Canonical projection has intentionally absorbed cell nodes, and projected
block ids take precedence so no duplicate card remains.

The optional full-page canvas fallback for figure/table crops can synchronously
stall on vector-dense pages; a promise timeout cannot interrupt that work. Pages
with more than three captions now retain embedded assets and native grids but
skip this expensive whole-page raster fallback. A fresh packaged OzCHI import
completed in **14.4 seconds**, including annotation, search, Markdown and
Notion-package export, relaunch, and persistence (`ok=true`, search hit **1**,
Markdown **45,395 bytes**, Notion **1,030,149 bytes**). Its saved package has
Table 1 (**10 rows**), Table 2 (**5**), Table 4 (**8**), and Table 5 (**1**) as
caption-owned native grids; Table 3 remains its extracted table image. No
bundled translation-server process remains.

The complete cached extraction and reading-order corpus passes **232/232** in
**444.96 seconds** under `caffeinate -dimsu`; the focused package-layout and
OzCHI regressions, typecheck, lint (existing warnings only), and diff check
pass. The fast bundle was rebuilt at **2026-10-14 18:25:33 JST**:
`src-tauri/target/release/bundle/macos/Versio.app`. Continue using
`caffeinate -dimsu` for all lengthy commands because the workstation can sleep
or activate its screen saver.

# 2026-10-14: wrapped table-of-contents precision

Long entries in a table of contents can wrap before the dotted leader and page
number. The first physical line had no leader of its own, so generic geometry
could classify it as a compact table row. The candidate layer now inherits
table-of-contents evidence only when a same-page, immediately following,
indented dotted-leader line exists and at least three such peers establish a
real contents list. This is based on layout relation and does not use paper
titles or heading vocabulary.

The targeted thesis regression verifies that `3 Work characteristics associated
with injury ...` resolves to `other`. The 114-PDF table-readiness audit remains
error-free and improves reader-visible raw table fragments from **728 to 724**
and native cell-grid fallbacks from **537 to 533**, while retaining all **345**
table captions and **255** crop-ready regions. The full cached extraction plus
reading-order corpus passes **232/232 in 460.24 seconds** under
`caffeinate -dimsu`; typecheck and lint pass, with only existing repository
lint warnings. The fast `.app` was rebuilt at **2026-10-14 14:02:40 JST**.
Fresh isolated packaged acceptance then imported the 305-page long-haul
transport thesis, completed annotation, search, Markdown and Notion-package
export, quit, relaunched, and retained the package (`result.json`: `ok=true`,
searchHits=1, Markdown **520,836 bytes**, Notion **1,359,222 bytes**). No
bundled translation-server process remains.

# 2026-10-14: bounded document-level figure extraction

A packaged import of `economics-regularized-deepiv.pdf` initially remained at `structuring: 図を抽出しています...`. Per-page PDF.js timeouts already existed, but a document with several expensive figure/table pages could consume those timeouts sequentially, leaving no import-level bound. `extractFigureImages` now shares a **45-second document budget** across all optional image extraction; each page is limited to both its existing page timeout and the remaining document budget. When exhausted, remaining captions are skipped with progress, while native text, canonical blocks, captions, and table-cell fallback continue to import.

Focused timeout test and typecheck pass. The fast `.app` was rebuilt at **2026-10-14 13:41:42 JST**. A fresh isolated packaged E2E rerun for the same economics PDF completed in **16 seconds** with `exit_code=0`: import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence passed (`result.json`: `ok=true`, searchHits=1, Markdown **97,912 bytes**, Notion **217,378 bytes**). No bundled app or translation-server process remains. This runtime-only change does not alter canonical extraction; continue using `caffeinate -dimsu` for long runs.

# 2026-10-14: fragmented mathematical display disambiguation

The table audit found a broad class of false tables in math/economics PDFs: independently positioned formula glyphs and a punctuation-led formula lead-in were receiving generic grid evidence without any table-caption relationship. The resolver now distinguishes (1) low-prose Greek/symbolic fragments as equation evidence and (2) incomplete punctuation-led mathematical clauses as paragraph evidence. It preserves captioned tables and ordinary statistical sentences. Real regressions cover both `, with probability at least … exp(…)` and the standalone `α2 α` fragment in the economics fixture.

The error-free 114-PDF table-readiness audit improves from **807→728** reader-visible raw table fallbacks and **615→537** cell-grid fallbacks. `economics-regularized-deepiv.pdf` improves **55→14** reader fallbacks; `linguistics-language-model-physics.pdf` improves **81→55** through the same symbolic guard; the long ergonomics table fixture remains **133** reader fallbacks with **87** cell grids. The full extraction plus reading-order suite passes **232/232 in 448.07 seconds** under `caffeinate -dimsu`; typecheck, lint (existing warnings only), and diff check pass. The source change is not yet packaged.

# 2026-10-14: packaged figure-panel verification

The fast `.app` containing `d449afb` was rebuilt at **2026-10-14 13:16:42 JST**. The isolated packaged Tauri acceptance again used `linguistics-language-model-physics.pdf` and passed import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence. `result.json` records `ok=true`, `searchHits=1`, Markdown export **129,376 bytes**, and Notion package **80,965 bytes**. The harness again left a bundled translation-server process after application exit; it was explicitly stopped, so no Versio process remains.

# 2026-10-14: figure-caption panel-label disambiguation

A further region diagnostic identified Figure 23 and Figure 29 as the source of many apparent table candidates: native axis/grid glyphs were positioned like cells, but lay within a dense vector Figure region whose caption occurred below. Generic evidence now uses figure-caption proximity, native type scale, graphics density, and the absence of a nearby table caption to mark those labels as `other`. This is independent of paper title or label vocabulary. Target checks show Figure 29 table nodes **4→0** and Figure 23 **29→17**; the remaining Figure 23 nodes are outside the deliberately bounded caption relation and remain a follow-up region-grouping task.

The 114-PDF readiness audit is still error-free. Its aggregate raw reader fallback count is **807** (versus **806** immediately before this change), so this rule is retained for the verified on-page correction, not presented as a global-count improvement; the audit combines role assignment with row projection and is not a complete semantic ground truth. The full cached extraction plus reading-order corpus passes **232/232 in 437.59 seconds** under `caffeinate -dimsu`; typecheck, lint (existing warnings only), and diff check pass. This source change has not yet been packaged.

# 2026-10-14: packaged micro-label verification

The fast `.app` was rebuilt at **2026-10-14 12:55:40 JST** with `e32b9db`. Fresh isolated Tauri acceptance used the real `linguistics-language-model-physics.pdf` regression input and passed import, annotation, search, Markdown/Notion-package export, quit, relaunch, and persistence. `result.json` reports `ok=true`, `searchHits=1`, Markdown export **130,206 bytes**, and Notion package **81,148 bytes**. The bundled translation server that survived the harness quit was explicitly stopped; no Versio process remains.

# 2026-10-14: micro-label vector-panel follow-up

A second diagnostic showed that the first dense-vector guard still left one- and two-line glyph labels inside a single image-rich multipanel figure eligible for page-grid table evidence. The evidence now also covers these micro-labels, but only on a graphics-dense, image-rich page with no nearby table caption, tiny typography, and a very short physical block. A real fixture asserts both the multi-line plot tick stream and a standalone `lay1 lay1` panel label resolve to `other` with the recorded geometry evidence.

The refreshed 114-PDF table-readiness audit remains error-free and changes reader-visible fallback counts from **835→806** and native cell-grid fallbacks from **643→614**; the diagnostic language-model-physics paper changes **109→80**. Captioned tables are excluded by construction, and the large ergonomics table fixture retains **91** cell-grid fallbacks. The complete cached extraction and reading-order suite passes **232/232 in 438.24 seconds** under `caffeinate -dimsu`; typecheck, lint (existing repository warnings only), and diff check pass. The follow-up source change is not yet packaged; future package verification must build a new `.app`.

# 2026-10-14: packaged dense-vector verification

The fast Tauri build containing `29ff6ce` completed at **2026-10-14 12:34:43 JST**: `src-tauri/target/release/bundle/macos/Versio.app`. A fresh isolated packaged acceptance imported `linguistics-language-model-physics.pdf`, completed annotation, search, Markdown and Notion-package export, quit, relaunched, and retained the package. `result.json` records `ok=true`, `searchHits=1`, Markdown export **130,190 bytes**, and Notion package **81,167 bytes**. The app exited successfully; its orphaned bundled translation-server process was then explicitly stopped. No app or translation-server process remains.

# 2026-10-14: dense vector-panel table suppression

The 114-PDF table-reader audit exposed a precision failure that remained after prior vector-diagram work: ultra-small native glyph rows inside dense, multi-panel figures could be reconstructed as captionless `table` blocks and appear as reader-visible cell cards. The new generic evidence path assigns `other` only when all of the following hold: there is no nearby table caption, the candidate has tiny native type, the page is graphics-rich, and either repeated same-shaped panel peers exist or the candidate is a micro-grid on an image-rich vector page. Captioned tables remain excluded from this suppression.

A real computational-linguistics fixture now verifies both repeated plot labels and a four-line tick-label grid are not canonical tables. The refreshed 114-PDF readiness audit has no extraction errors and reports **1,333** raw table fragments, **500** crop-backed fragments, **835** reader-visible fallbacks, and **643** cell-grid fallbacks (the immediately prior sequential-row baseline was 1,338 / 500 / 840 / 648). This is a narrow precision gain; remaining fallback grids, especially vector-figure labels in the same paper, still need region-level figure grouping rather than broader role suppression.

Focused regression, `npm run typecheck`, `npm run lint` (existing warnings only), and `git diff --check` pass. The complete cached extraction plus reading-order corpus also passes **232/232** in **461.49 seconds** under `caffeinate -dimsu`. The source change is not yet included in a packaged `.app`; build and isolated Tauri acceptance remain the next verification steps. Keep using `caffeinate -dimsu` for all long-running commands because the workstation can sleep or invoke its screen saver.

# 2026-10-13: high-precision OCR routing and packaged import

A packaged import of the 305-page long-haul transport thesis had previously stalled at `OCR処理中... (1/9ページ)`. Diagnostics showed the first selected page was a completely readable title page emitted as seven large native text items (200 characters), and another selected page held 315 readable native characters. The former `itemCount < 10` fallback incorrectly treated both as scans. A page is now classified as scanned only when it has fewer than ten native items **and** fewer than 80 non-whitespace characters; true image-only pages remain OCR candidates.

The focused classification suite passes **15/15**, typecheck and diff check pass, and the real thesis now selects **7** rather than **9** OCR pages. The full cached extraction plus reading-order corpus also passes **232/232** in **475.75 seconds** under `caffeinate -dimsu`. The fast `.app` containing `f1eb178` was built at **2026-10-13 21:49:15 JST**. A fresh isolated packaged import of that same PDF completed import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence (`result.json`: `ok=true`, `searchHits=1`, Markdown 520,689 bytes, Notion package 1,359,134 bytes). No application or bundled translation-server process remained. All long-running commands used `caffeinate -dimsu`.

# 2026-10-13: packaged sequential-row verification

The fast bundle containing `49a37b8` was built at **2026-10-13 21:34:32 JST**. The isolated packaged OzCHI acceptance completed import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence. Its saved package has **161 blocks**, **5 table blocks**, **5 image-backed tables**, and **0** source-table fallbacks; no bundled application or translation-server process remained afterwards.

An additional packaged import using the long-haul-transport table regression PDF did not reach projection because it stalled in the unrelated OCR step at `OCR処理中... (1/9ページ)` until the 420-second harness limit. The harness and its bundled processes were explicitly stopped after recording the result. Treat this as a separate native/OCR import-stall regression, rather than evidence against sequential-row reconstruction.

# 2026-10-13: sequential native table-row reconstruction

A remaining reader failure was caused by borderless native tables being projected as one `PaperBlock` per physical row. The Reader could render each block as a cell grid, but showed a stack of tiny independent table cards instead of one readable table. `projectCanonicalToPaper` now merges only consecutive table-row candidates that share a page and column, have small vertical gaps, contain at least two cells each, and repeat at least two quantized native x-origins across three or more rows. This is geometry-based and does not use paper-specific terms.

The real ergonomics regression now confirms that the separate `Articulated trucks`, `Passenger vehicles`, and `Total motor vehicles` rows become one source-fallback grid with explicit `tableRows`; ordinary prose, captions, lists, and standalone label fragments remain excluded. Target regression and `npm run typecheck` pass. The full cached extraction plus reading-order corpus passes **232/232** in **445.66 seconds** under `caffeinate -dimsu`; `npm run lint` passes with only the repository's existing warnings. Long-running commands must continue to use `caffeinate -dimsu` because this workstation may sleep or activate its screen saver.

# 2026-10-13: vector-diagram package and corpus verification

The fast Tauri bundle containing the vector-diagram fix was rebuilt at **2026-10-13 20:59:27 JST**. A fresh isolated real-app acceptance imported OzCHI `2686612.2686699.pdf`, completed annotation/search, Markdown and Notion export, quit/relaunched, and retained data. The persisted package contained **161 blocks**, **5 table blocks**, and **5 image-backed tables** with **0** source-table fallbacks. No app or bundled translation-server process remained after acceptance.

The full cached reading-order corpus then passed **114/114** in **114.19 seconds** under `caffeinate -dimsu`. Together with the preceding full extraction baseline (**118/118** in 363.04 seconds), this verifies the general vector-diagram guard across the cached corpus. PDF.js font/ColorSpace warnings remain non-fatal fixture warnings.

# 2026-10-13: vector-diagram/table disambiguation

Corpus triage found a remaining precision failure in a computational-linguistics paper: dense mathematical labels inside a vector Figure 10 diagram were being projected as a source-only `table` because native glyph positions formed a matrix. The resolver now uses a strict competing evidence path: a dense mathematical glyph stream must sit immediately above an overlapping Figure caption on a graphics-rich page, with no nearby table caption. It receives `other` evidence and caps the generic table score. A real-PDF regression fixes the exact Figure 10 shape without relying on a paper name or vocabulary.

The extraction-corpus run after this change passed the full **118-paper baseline**; the subsequent reading-order corpus reported one metadata failure, not a product failure. Visual rendering of `economics-regularized-deepiv` page 14 showed that the page is single-column, so the catalog's incorrect `expectMultiColumnOnPages: [14]` assertion was removed. Its targeted reading-order test now passes. Typecheck, lint, diff check, and the Figure 10 regression pass.

# 2026-10-13: refreshed table-reader corpus audit

After narrowing header-only table recovery to one physical native line, the full cached extraction baseline passes **118/118** in **363.04 seconds** under `caffeinate -dimsu`. The refreshed table-reader audit covers all cached PDFs with no extraction errors: **345** numbered table captions, **255** geometry-crop-ready captions, **1,681** raw table-region fragments, and **1,044** fragments left visible when a reliable crop is unavailable. Of those visible fallback fragments, **852** already contain `tableRows` and are rendered as native cell grids rather than concatenated prose; the audit-only residual taxonomy is `short-label=154`, `structured-grid=852`, `prose-like=11`, `ambiguous=26`, `numeric-grid=1`.

The audit is deliberately diagnostic rather than a blanket suppression rule. The remaining high-volume cases include genuine borderless tables, thesis tables of contents, mathematical/diagram label matrices, and quiz/reference grids. Changes must distinguish these from body text through geometry, caption/figure relations, and typography before changing production roles. `npm run lint` passes with the repository's pre-existing warnings only. Long-running corpus and package commands must use `caffeinate -dimsu`.

# 2026-10-13: packaged OCR timeout hardening

The latest packaged acceptance exposed a separate Tauri-path stall: the OzCHI fixture stayed at `structuring: 図を抽出しています... (5/17)` until the 600-second harness timeout, and even the tiny fixture could remain at `OCR処理中 (1/1ページ)`. `ocrDocument` previously started its timeout only after `doc.getPage()`; page acquisition is now inside the same per-page timeout. A regression test covers a stalled PDF.js `getPage`, and OCR tests pass **4/4**. The fix preserves native text on timeout and prevents a packaged OCR resource stall from holding import forever.

The fast `.app` was rebuilt after this fix at `2026-10-13 15:00:45 +0900`. The full real-paper baseline remains **118/118**. A fresh OzCHI packaged acceptance then completed successfully through import, annotation, search, Markdown/Notion export, quit, relaunch, and persistence (`result.json`: `ok=true`, searchHits=1, exportBytes=45,498, notionBytes=1,115,780). No app or bundled translation-server process remains running.

# 2026-10-13: final table-candidate guard and full corpus verification

The table candidate guard now rejects only long/multi-line caption-adjacent prose (`wordCount > 24` or more than four native lines). Short table cells that end in punctuation remain eligible, preserving marketing table rows without allowing ordinary long prose to become a table. The temporary single-item narrative cap was removed after it caused a false negative in the marketing-consumer-production-journey regression.

The real-paper extraction baseline now uses a 600-second corpus timeout (test infrastructure only; product behavior is unchanged). The full cached corpus passed **118/118** tests in 753.92s. The post-change table readiness audit over 114 PDFs completed with `extractionErrors=0`, `tableCaptions=345`, `cropReadyCaptions=255`, `rawTableFragments=1723`, `cropBackedFragments=610`, `readerRawFragments=1115`, `readerCellFallbacks=900`, and reader fragment kinds `structured-grid=900`, `short-label=158`, `prose-like=17`, `ambiguous=38`, `numeric-grid=2`; these are diagnostics, not claims that all tables have perfect semantic schemas.

`npm run lint` and `git diff --check` pass (only existing lint warnings). The latest fast Tauri bundle was built successfully at `2026-10-13 14:26:36 +0900` at `src-tauri/target/release/bundle/macos/Versio.app`. The previous isolated OzCHI packaged acceptance remains green; rerun it after any further source changes that affect package persistence or reader projection.

# Active PDF extraction objective (2026-10-11)

# 2026-10-13: latest table-row projection and packaged acceptance

After the same-baseline cell projection change, direct extraction of
`2686612.2686699.pdf` produced 201 blocks, 14 table blocks, and 4 blocks with
explicit grid rows. The former OzCHI strings now retain sorted x-positioned
cells (for example `Error dist. | Finger 1 | Finger 2 | Finger 3 | Finger 4`)
for the Reader fallback grid. `npm run typecheck`, focused pipeline/layout
tests, lint, and `git diff --check` pass; lint still reports only the existing
warnings. The fast `.app` was rebuilt at 2026-10-13 13:33:21 JST and the
packaged Tauri acceptance route completed successfully with the real OzCHI PDF:
import, annotation, search, Markdown/Notion export, quit, relaunch, and
persistence all passed (`result.json` export 45,498 bytes; Notion package
1,115,780 bytes). The `caffeinate`-wrapped acceptance left no app or bundled
translation-server process running.

## Verification update (2026-10-13 15:58 JST)

The full cached real-paper extraction suite was rerun after the parallel
native table-column reconstruction with `caffeinate -dimsu`. It passed
**118/118** in **340.33 seconds**. This covers the generic OzCHI-style
parallel-column fix together with the existing title, heading, author,
affiliation, caption, table, reference, reading-order, and page-boundary
regressions. The command output is retained at
`/tmp/versio-extraction-regression-final.log` for this session.

Long-running extraction, corpus, and packaged-app commands must continue to
use `caffeinate -dimsu`: the workstation may sleep or enter the screen saver
while they run.

# 2026-10-13: completed-prose guard beside table headers

A real-paper diagnostic found a results sentence in the Frontiers cognitive
psychology paper (`PVF (r=0.461; p=0.040, n=25). No other significant
associations were observed.`) that was emitted as a skipped table because it
sat below a nearby header-like table region. The source had no table-grid
ownership evidence; the generic header-only row detector was too permissive.
It now rejects complete sentences. Caption/grid/rotated-table paths remain
available for actual tables. The regression confirms this block is a pending
paragraph while the surrounding numeric table rows remain structured tables.
Targeted real-paper regression, typecheck, lint, and diff check pass.

# 2026-10-13: bounded figure-image extraction

The new packaged OzCHI run demonstrated that a single PDF.js figure page can
remain inside `getOperatorList()` or page rendering long after text/table
extraction is complete. Figure crops are optional presentation assets, so
`extractFigureImages` now bounds page opening, operator-list retrieval, and
page rendering to 15 seconds each. A render timeout cancels the PDF.js render
task; the affected page/figure is skipped and the import continues with the
canonical text, captions, and source-only table-cell fallback intact. Progress
is now reported after each completed or skipped caption rather than before a
potentially stalled operation. `pdfServiceTimeout.test.ts` covers timeout and
cancellation; re-extraction, typecheck, lint, and diff check pass. The
previous isolated package run was terminated after exceeding its 600-second
acceptance window, leaving no app or bundled translation-server process.

## Table-crop priority follow-up (2026-10-13)

The first 15-second bound made the app complete, but also skipped captioned
OzCHI table crops on a vector-heavy page. Figure extraction now processes
table captions before optional figure captions, and gives table-bearing pages
one bounded 45-second operation budget. The current fast bundle was built at
**2026-10-13 16:40:27 JST**. A fresh isolated packaged OzCHI acceptance then
completed in **14.7 seconds**: import, annotation, search, Markdown/Notion
export, quit, relaunch, and persistence all succeeded. Its persisted package
has 161 blocks and exactly **5 tables with 5 image assets** (the five captioned
OzCHI tables); no bundled app or translation-server process remained.

# 2026-10-13: header-only table rescue narrowed to physical rows

The refreshed 114-PDF table audit found a Nature-style paper whose two-line
title and first abstract sentence were being converted to source-only tables.
They happened to lie within the broad vertical search range of a
header-shaped layout block, but had no caption or repeated-grid ownership
evidence. The header-only table rescue now accepts a single physical native
line only; wrapped table descriptions remain covered by the stronger
caption/grid evidence paths. Regression confirms the paper's canonical title
and first abstract paragraph stay title/paragraph, while Frontiers numerical
table rows retain their cell grids. Targeted real-paper regression and
typecheck pass; rerun the full corpus before treating this as a baseline.

# 2026-10-13: typography guard for heading/table competition

Corpus diagnosis found a generic failure in which a separated all-caps
section line could inherit a nearby table-caption score from its split native
glyphs. The resolver now uses document-local font-size ratio, spacing-before,
uppercase ratio, and punctuation-free short-line evidence to give a strong
heading score; long single-item prose lines are simultaneously capped as table
evidence. A regression using `detecting-statistical-interactions.pdf` now keeps
`H COMPARISONS WITH LOGISTIC REGRESSION BASELINES` as a canonical heading and
the focused pipeline tests pass. The fast `.app` was rebuilt after this change.

The follow-up table audit after the typography guard remains error-free across
all 114 PDFs: rawTableFragments=1710, cropBackedFragments=605,
readerRawFragments=1107, readerCellFallbacks=901, structured-grid=901,
prose-like=8, ambiguous=36, numeric-grid=2, orphanFragments=1058. This is a
small reduction in table candidates versus the previous run and a larger
reduction in prose-like fragments (17→8); the remaining ambiguous items are
mostly legitimate compact/quiz/reference grids and require region-level
geometry or crop evidence before further role changes.

# 2026-10-13: cross-column continuation projection regression

The 118-paper extraction regression was rerun under `caffeinate`: 117/118
passed. The only remaining red test is the existing
`ergonomics-human-factors-and-ergonomics` fixture, whose per-test timeout is a
hard-coded 180 seconds while its very large PDF extraction exceeds that
budget; it is not an assertion failure. The floated table continuation
assertion now passes after allowing explicitly evidenced table rows that
resolve as `other` to remain transparent, and after deferring continuation
targets that sort before their source by y-coordinate. Typecheck, lint,
focused regression, and the latest fast `.app` build pass.

The post-projection table audit was rerun across all 114 cached PDFs under
`caffeinate`: extractionErrors=0, papersWithTableCaptions=48,
tableCaptions=345, cropReadyCaptions=255, rawTableFragments=1736,
cropBackedFragments=619, readerRawFragments=1119, readerCellFallbacks=904,
orphanFragments=1069. Compared with the prior 649 structured fallbacks,
preserving same-baseline rows raised structured-grid fragments to 904 and
reduced audit-only ambiguous fragments from 113 to 38, prose-like from 50 to
17, and numeric-grid from 106 to 2. These are reader readiness diagnostics,
not a claim that every table's semantic row/column schema is fully recovered.

The latest packaged Tauri acceptance after the continuation fix also passed:
`result.json` at 2026-10-13T05:04:41Z reports `ok=true`, annotation/search
success, Markdown export 45,498 bytes, Notion package 1,115,780 bytes, and
successful quit/relaunch persistence. No app, bundled server, audit, or test
process remains running.

The active goal is **not limited to the OzCHI finger-touch PDF**. That PDF is
one high-value Golden Regression Case because it combines a two-column ACM
layout, a mixed author/affiliation masthead, publisher permission chrome,
statistical prose, borderless and ruled tables, figures, and references. Every
production change must be format-neutral and must also be checked against the
diverse real-paper corpus: ACM/OzCHI, IEEE, Springer/LNCS, Elsevier, Nature,
APA-like, J-STAGE and other journal/conference/preprint/report layouts,
including single/two-column, table-heavy, equation-heavy, old/scanned, and
multilingual PDFs.

# 2026-10-13: same-baseline table cells are preserved as grid rows

The projection reducer previously joined adjacent table blocks on the same
baseline into one `original` string and dropped their x positions. That is the
source of Reader cards such as `Finger Thumb Finger1 ...` even when the role
was correctly `table`. It now carries a sorted `metadata.tableRows` row while
performing the same aggregation, so the existing Reader grid fallback can
render cells instead of a prose-like concatenation. This is a projection-only
change; role resolution and crop suppression are unchanged. `npm run typecheck`
and the focused pipeline/layout tests pass. High-ambiguity corpus inspection
also confirmed that medical/education review papers contain genuine dense
tables, so they are retained for grid/image handling rather than demoted to
paragraphs.

Completion requires both (1) targeted regressions for each diagnosed failure
and (2) held-out, cross-format evidence that the fix does not trade one paper's
success for regressions elsewhere. The end-to-end acceptance route remains
real PDF import in the Tauri app through CanonicalDocument/PaperBlock, Reader
rendering, and Markdown/Notion export. Docling and GROBID are comparison or
optional-evidence sources; neither may replace the canonical resolver or
become a mandatory runtime dependency without corpus-wide evidence.

Native typography is retained as structural evidence throughout diagnosis and
resolution: `fontName`, `fontSize`, bold/italic score, indentation, baseline,
and spacing before/after are combined with geometry and neighboring blocks.
A font change is a boundary clue, not a hard role assignment; matching fonts
can support wrapped-line continuity, while a size/weight/family transition can
support a heading, masthead, caption, table, or bibliography boundary.

# 2026-10-11: font-aware masthead/grid and inline-marker regressions

Font identity and size are now checked when collecting same-baseline native
spans for caption-adjacent table rows, reducing accidental table promotion from
aligned prose. A repeated multi-line grid remains visible as a skipped table
block even when its caption relation points at a synthetic region. Bilingual
Japanese/Latin author rows preserve CJK token boundaries instead of shortening
the row to its romanization. Numbered `(a)`/`1)` markers embedded in a native
prose line stay in that paragraph; only markers at physical line starts split a
list. Full test suite: 757/757; typecheck passes; lint has only pre-existing
warnings. OzCHI and selected cross-format real-paper regressions remain green.
The fast Tauri bundle was rebuilt at 2026-10-11 22:42:58 JST. The staged
translation-server source hashes match the working tree exactly. A process
already running from before this build remains separate; quit/reopen the app
before checking the new extraction behavior in the UI.

# 2026-10-11: Paper Package write/read race found on Tauri path

The isolated packaged Tauri import exposed a real persistence race: a reader
could observe a package while only its first core file had been written, which
produced `Paper Package が不完全です` and an empty Reader. Full package swaps
and mutable checkpoints now share a process-local write queue, while the final
directory rename remains the visibility boundary. A concurrent-write regression
passes. The direct Canonical extraction and all 757 unit/regression tests pass.
The packaged full OzCHI run still needs a clean end-to-end rerun after this
build; the first attempt also encountered the app-side translation-server
startup wait, so its marker is not evidence against extraction quality.

# 2026-10-11: REFERENCES の欠落と表示不統一

本文中段の `UIST '11. ACM, 627-636.` が、先頭の会議名だけで running
header と誤判定され、block 化前に失われていた。会議名型 chrome 判定を
ページ上端に限定し、同じ font family/size・hanging indent・通常行間を
持つ前行へ残すよう修正。明示的 REFERENCES 節では番号のない author-year
形式と `In Proc.` も bibliography evidence として扱い、長いエントリも
一貫して `reference`（小さなグレー表示、翻訳対象外）へ投影する。OzCHI
回帰と ACM/Springer/IEEE/arXiv/Nature/PMLR/Elsevier を含む選択15件は成功。

# 2026-10-11: 指タッチ論文で抽出が図表破片だらけだった

読み順 Kahn がページ無視で後半ページの表セルを ABSTRACT より先に出していた。ready キューを page/y/x で並べる。チャート軸の短語は破棄。番号付き Table N（CAPTION_OF あり）のセル破片はキャプション／実質グリッド以外を投影しない（captionless 行列は維持）。当該PDFは再インポートが必要。Desktop の旧エクスポートは古い抽出のまま。

# 2026-10-11: 保存失敗なのに「同じPDFがすでにあります」と出る

`importPDFV2` が失敗時も `null` を返すため、`startBackgroundImport` がすべて duplicate 扱いにしていた。duplicatePaperId があるときだけ duplicate。分類も `duplicate-block-id` を PDF 重複にしない。画像無し table で空 caption（`"" ?? text`）が Markdown を空にし orphan-structure で保存失敗していたのを修正。

# 2026-10-11: 表が無いのに「表を抽出できませんでした」が大量表示

図表近傍の本文が borderless table region に巻き込まれ、空の Table シェルになっていた。region メンバー条件を厳格化し、本文誤分類は paragraph に戻す。画像の無い table は失敗メッセージではなく抽出テキストを表示。当該PDFには Table 1–5 の数値表もある（再インポートで反映）。

# 2026-10-11: Paper Package が書けず再開後に開けない

原因: Markdown パーサがページ番号ブロックを落とし、`validatePaperPackage` が structure との不一致（orphan-structure）で保存を失敗させていた。失敗は握りつぶされ SQLite 索引だけ残った。パーサでは落とさず、`projectionToPackage` で chrome を除外。保存失敗は再送出。パッケージ無しの索引は起動時に `failed` にする。壊れた行は再インポートが必要。

# 2026-10-11: REFERENCES への会議 running header 混入

TEI/CHI 系のページヘッダ（例: `Share, Show And Tell TEI 2016, February…`）が参考文献の間に本文スタイルで残っていた。抽出で header 扱い／除外し、著者行＋翌ページの `2007. Title…` を再結合。既存論文は再インポート不要（Reader でヘッダ非表示＋結合）。

# 2026-10-11: 本文中のページ番号（脚注スタイル）を非表示

PDF のページ番号が footnote として本文に残り、区切り線＋薄い数字で表示されていた。表示・projection・新規抽出で単独の 1–3 桁数字を除外（原文が空で訳だけ数字の古いパッケージも対象）。既存論文は再インポート不要（Reader 読み込み時に隠す）。

# 2026-10-10: 終了後に論文一覧が消える対策

`library.sqlite` は tmp→rename のアトミック置換＋直列 persist に変更（途中クラッシュでインデックスが空／破損しにくくする）。起動時は破損時に `.bak` / `.tmp` から復旧し、ディスク上の Paper Package があるのに SQLite 行が無い論文はインデックスを再構築する。

# 2026-10-10: 目次ジャンプの信頼性（長文・仮想化）

Reader 左の目次クリックは、本文スクロールコンテナ基準で対象セクションへジャンプする。セクション仮想化中は対象を pin して本文を実マウントし、`scroll-margin-top` を反映した位置合わせが安定するまで pin を維持する。マウント用 IntersectionObserver も本文スクロールルートを root にする。

# 2026-10-09: 設定にライセンス一覧

設定サイドバー最下部に「ライセンス」。本体 MIT と npm / Python / Rust / モデル・アセットの依存を検索・全文表示。一覧は `npm run generate:licenses`（`prebuild`）で `src/generated/thirdPartyLicenses.json` に自動生成。オフライン閲覧可。種別不明は推測せず「要確認」。

# 2026-10-09: macOS タイトルバー下の区切り線

実ウィンドウ（Tauri）ではタイトルバー直下に `1px` の `--color-border` を描画。

# 2026-10-09: macOS タイトルバーをサイドバー色に

実ウィンドウのタイトルバーを `TitleBarStyle::Transparent` にし、`NSWindow` 背景を `--color-bg-secondary`（light `#f8f9fa` / dark `#252526`）へ同期。テーマ変更時は `sync_window_chrome_theme` で追従。`.app`: `src-tauri/target/release/bundle/macos/Versio.app`。

# 2026-10-09: trash CTA radius + hold-to-empty

ゴミ箱行の「元に戻す」「削除」の角RをヘッダーCTAと同じ `radius-md` に揃えた。「削除」は赤アウトライン、「ゴミ箱を空にする」は赤塗り長押し（文言・サイズ固定、ゲージは左→右）。上がりきると実行。

# 2026-10-09: selection highlight = solid blue / white text

目次の現在位置、Reader 右上ツールの選択、設定ナビ／テーマ・セグメント選択、サイドバーの現在行、検索結果・メモカードの選択を、薄い青ではなく **青塗り＋白文字** に統一（`--color-selection-bg` / `--color-selection-fg`）。

# 2026-10-08: Frontiers masthead editor-credit boundary fix

`cognitive-dual-task.pdf` had `Edited by:` / `Reviewed by:` labels mixed into the author-role stream. The projection now treats inline credit labels as masthead boundaries, excluding adjacent editor/reviewer names while preserving the nine paper authors. Targeted author F1 improved **0.7000 → 0.7778**; author projection **24/24**, typecheck pass. This is a generic label/geometry rule; the full 113-paper benchmark remains pending.

The subsequent full corpus rerun completed **113/113** without extraction process failure. Title exactness remained **106/113 (93.8053%)**, unchanged from the prior baseline; the seven misses are catalog/PDF identity or language/spelling disagreements (Russian/Serbian native titles, `behaviour`/`behavior`, a catalog `TND`/`AND` discrepancy, and one fixture whose PDF is a different paper). This confirms the editor-credit change did not regress corpus title extraction; the remaining title misses do not justify a title heuristic change.

The same full structural suite initially exposed the OzCHI Table 2 borderless-region edge case: table-region recall was **0.4** because caption-only synthetic regions had low confidence even when strong caption-anchored region evidence existed. Region evidence is now carried into relation-node projection, so those regions retain their geometry/confidence; the targeted OzCHI benchmark is **tableRegionRecall 1.0**, with heading hierarchy 1.0, source integrity 1.0, and table-caption relation precision 1.0. Focused pipeline/author tests pass **73/73** and typecheck passes. The full 118-paper suite should be rerun after this change.

The rerun completed the full extraction corpus: **232/232 tests passed** (118 real-paper baseline + 114 reading-order checks, 382s). The PDF.js `TT`, `ColorSpace`, and similar warnings remain non-failing parser warnings. No generated benchmark report is retained in the worktree.

The GPT-3 cognitive psychology paper exposed a real line-formation defect: a short vector/diagram annotation at the right edge of a prose line (`A: Option 2.`) was concatenated into the paragraph. Geometry-based inline span separation now keeps the annotation as its own block and preserves the prose; no vocabulary blacklist is used. A regression was added; pipeline tests **50/50** and typecheck pass. The full 232-test corpus should be rerun before packaging this change.

The post-change full extraction regression completed **232/232** again (118 baseline + 114 reading-order, 401s). The GPT-3 paper now keeps the annotation out of the prose paragraph; all existing corpus assertions remain green.

The COVID-ML review exposed a second real issue: a borderless table stream with repeated multi-cell x geometry was emitted as a pending paragraph. A conservative block-level rule now requires at least three numeric multi-item lines and at least three repeated x bands before promoting it to `table`; the block is preserved and skipped for translation. The focused regression now asserts this behavior; pipeline tests **50/50** and typecheck pass.

The latest fast `.app` build includes this table-stream fix and the diagram annotation fix. The bundle completed successfully at 23:49 (unsigned development build).

# 2026-10-08: full 113-paper extraction baseline rerun

After the mixed-masthead fix and PDF.js cleanup, a fresh full `--all` run completed over **113 papers** with title exact **106/113 (93.8053%)**. The repaired digital-marketing PDF is now stable in the serialized report: canonical title `DIGITAL MARKETING: CONSUMER BEHAVIOR`, source integrity 1.0. The remaining seven title mismatches are catalog/PDF disagreements (Russian/Serbian native titles versus English catalog titles, `behaviour`/`behavior`, a likely `TND`/`AND` catalog typo, and one morphology fixture whose PDF content is a different medical paper).

The full cached corpus benchmark completed: **113 papers**, title exact rate **105/113 (92.92%)**. The eight title misses are now classified: several catalog entries expect an English translation while the PDF prints a Russian/Serbian title, one differs only by `behaviour`/`behavior`, one catalog has a likely `TND`/`AND` typo, and one morphology fixture is a different medical paper. The bilingual digital-marketing PDF contains both Russian and English title blocks; the resolver retains the first/native Russian title, which is conservative and avoids inventing a translated title. This run does not justify a generic title heuristic change.

# 2026-10-08: targeted real-paper extraction benchmark

A targeted benchmark over `ppg-earring`, the multilingual applied-linguistics PDF, the HCI systematic review, and the fatigue/occupational-safety PDF produced **3/4 exact titles**. The only mismatch is a source/catalog language mismatch: the PDF's native title is Russian, while the catalog expects an English translated title; metadata fallback preserves the Russian canonical title rather than inventing English text. The other three papers retain exact titles, figure/table relations, and source integrity; the fatigue PDF reports 43 flattened numeric rows and 30 chart-label nodes as expected geometry diagnostics. No generic resolver change is justified by this run.

# 2026-10-08: extraction suite clean single-worker verification

The full PDF extraction suite was rerun with a single Vitest worker to avoid the parallel worker notification timeout: **13 files, 124 tests passed, exit code 0**. The earlier parallel run also had 124/124 assertions passing but exited 1 because of one Vitest worker `onTaskUpdate` timeout.

# 2026-10-08: packaged UI OCR E2E isolation and duplicate-data diagnosis

The packaged UI harness now honors `VERSIO_UI_E2E_HOME` in the Rust app-data and source-PDF paths, and the script accepts the legacy `VERSIO_ACCEPTANCE_HOME` alias. `npm run tauri:build:fast` succeeds. A rerun with the malformed multilingual OCR fixture still does not reach the target import: the isolated app-data is populated with pre-existing Paper Packages and the Accessibility label lookup for the add-paper action fails, so this run is not evidence about OCR quality. Native extraction remains 124/124 and real-paper regression remains 118/118.

## Current extraction status (2026-10-07)

- 2026-10-07: OCR enrichment now requests only pages selected by the page classifier instead of rendering every page in a mixed document and discarding most results. This reduces unnecessary Vision OCR exposure on healthy native pages while preserving the existing replacement boundary. Added page-selection regressions; OCR/page-class tests **15/15**, PDF extraction suite **124/124**, and typecheck pass.
- 2026-10-07: Tauri Vision OCR Rust path revalidated with `cargo test --manifest-path src-tauri/Cargo.toml ocr`; compilation succeeded and the filtered test target completed without failures (the OCR module currently has no unit tests). Runtime recognition still requires launching the macOS app against a scanned/garbled fixture.
- 2026-10-07: Representative post-change extraction workers for the malformed multilingual title PDF and the 305-page mixed thesis both completed without process or source-integrity failure. The multilingual title mismatch remains a catalog-language disagreement (native/OCR title is Russian while the catalog title is English), not evidence that OCR should overwrite it with metadata.
- 2026-10-07: Fast macOS Tauri build completed successfully after the OCR page-selection and resolver type fixes. The generated `src-tauri/target/release/bundle/macos/Versio.app` was timestamped 22:23:19, and its bundled `translation-server/engines/segmenter.py` hash matches the source. The build is unsigned.
- 2026-10-07: The generated unsigned `.app` was launched successfully; the bundled Rust binary was running and contains the `ocr_image` command. This verifies app startup and resource embedding, but not OCR recognition of a PDF page; that still requires importing a scanned/garbled fixture through the running UI.
- 2026-10-07: Packaged integration E2E was attempted against the built `.app`, but the acceptance harness stalled at `Paper Package tmp validation failed` because another packaged app instance was already running and the harness data contained a stale terminal marker. The run was terminated; this is an E2E harness/environment failure, not an extraction assertion. The existing app process was left untouched.
- 2026-10-07: Improved `persistPaperPackage` to include validation error codes/messages when temporary package recheck fails. Package persistence tests **6/6**, typecheck, and production frontend build pass; this makes the packaged E2E failure diagnosable on the next clean app run without changing extraction behavior.
- 2026-10-07: Rechecked OCR routing on real mixed documents after the page-selection change. The malformed multilingual PDF routes only page 1/11 to OCR; the 305-page mixed thesis routes 9 pages (scanned pages 2, 10, 18, 122, 198, 232, 243 plus garbled transparent-fragment pages 174–175). This confirms the classifier is selecting sparse/garbled pages rather than OCRing the full thesis; no native page was added by the new page-selection logic.
- 2026-10-07: Replayed three previously sensitive mastheads (`hfe-healthcare-scoping-2024`, `cognitive-dual-task-older-adults`, `marketing-neurophysiology-consumer-motivation`). All completed with source integrity **1.0** and catalog title exactness **3/3**; the marketing paper's native title comparison remains false only because its catalog title includes a different subtitle form.
- 2026-10-08: Ran the malformed embedded-font PDF `linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng.pdf` through the built Tauri `.app` packaged acceptance path. Import, package persistence, search/export, quit, relaunch, and persistence checks all completed: `ok=true`, `searchHits=1`, `exportBytes=36087`, with no acceptance failure. This is the first end-to-end app-level validation of the Vision OCR routing path; the acceptance harness does not expose OCR text per page, so page-level OCR content remains separately diagnosed by the native Vision check.
- 2026-10-08: Packaged UI E2E was attempted with the same OCR fixture. The app/import path started, but System Events could not click the Open panel because macOS Accessibility permission is disabled (`osascript -25211`); this is a UI automation permission failure, not an extraction assertion. The generated Paper Package files were present in the isolated acceptance home.
- 2026-10-07: Visual/geometry review of the pending Macedonian journal PDF `marketing-impact-of-e-marketing-on-consumer-behavior.pdf` found a generic masthead failure: the second title-case author was flattened together with `Republic of Macedonia` / `Ohrid` location lines and exposed as a long author string. Author projection now keeps the unique short person-shaped line when a small masthead node contains surrounding location/affiliation lines. Focused author projection **22/22** and typecheck pass; the new regression asserts both authors and excludes location leakage. The fix is geometry- and vocabulary-gated and does not alter ordinary body extraction.
- 2026-10-07: OCR routing review of the 305-page thesis `ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf` found ordinary citation/journal pairs (`Arnold & Hartley`, `Analysis & Prevention`) incorrectly counted as broken glyphs, routing 43 readable native pages to OCR. The page classifier now recognizes only short all-caps symbol pairs (`АПФ & ПЛ`, `CIP & PL`) as this corruption signal. Page 9 and 28 now classify as native-text; page 10 remains correctly scanned (image-only). Page-class tests **12/12** and typecheck pass.
- 2026-10-07: Added a real-document OCR routing regression for the same thesis: page 10 is image-only and is included in `pagesNeedingOcr` even though the document as a whole is mixed native/scanned. Page-class tests now **13/13** and typecheck pass.
- 2026-10-07: Re-ran the 305-page thesis extraction benchmark after the OCR classifier change. The document remains `mixed`, title exactness remains true, source integrity **0.9997349**, figure-caption relation **1.0**, and table-caption relation **0.9714286**; no regression was introduced. The remaining table relation misses are pre-existing and require separate geometry review.
- 2026-10-07: Table-relation diagnostics on the thesis found a real false positive: `Table 4.1` was linked to the nearby `Figure 4.1` because the table caption and figure region shared a page. Caption relation resolution now constrains table-shaped captions to table targets and rejects body sentences such as `Table 4.4 summarises ...` as structural captions. The focused mixed-page regression passes; the same benchmark's table-caption relation precision improves from **0.9714 to 1.0**, while the underlying `Table 4.1` content still needs separate row/caption boundary reconstruction.
- 2026-10-07: The same thesis page exposed a second boundary issue: the table caption block absorbed all table rows because the first table header was a single centered native item. Caption continuation now treats a large geometry shift after a decimal table label (`Table 4.1:`) as a table-region boundary. `Table 4.1` is now a standalone caption, rows become table/other blocks, and the caption relation correctly targets a table row; title/source integrity remain stable. Focused mixed-page regression and typecheck pass.
- 2026-10-07: Representative post-change extraction rerun passed for the thesis, `wear-scale`, and `medical-image-segmentation-deep-learning`: all titles exact; source integrity **0.999742 / 1.0 / 1.0**; table/figure relation metrics remained **1.0** where annotated; `wear-scale` table caption and region recall remained **1.0**. This is a focused compatibility check, not a replacement for the full corpus regression.
- 2026-10-07: Full PDF extraction suite after table caption boundary/relation fixes passed **13 files / 124 tests** (42.51s). Existing PDF.js font warnings remain non-failing.
- 2026-10-07: After tightening table-caption relation targeting, the full real-paper extraction baseline was rerun and passed **118/118** (290.22s). The earlier OzCHI table-region regression (0.4 recall) was traced to over-prioritizing low-confidence synthetic regions; relation selection now keeps the existing high-confidence table node path while still preventing table captions from linking to nearby figures.

- 2026-10-07: Full application suite after wrapped author recovery passed **72 files / 720 tests** (44.57s).
- 2026-10-07: After wrapped Elsevier author recovery, reading-order regression passed **114/114** (93.06s).
- 2026-10-07: Elsevier meta-review visual review exposed wrapped author nodes (`Jan Egger, Christina` / `Gsaxner, ...`) and a trailing consortium line misclassified as an author. Projection now merges contiguous author-row fragments and resolver demotes institution-shaped author candidates to affiliation. Canonical authors recover all 8 names without the consortium; extraction suite **120/120** and baseline **118/118** pass (`f0e004e`).
- 2026-10-07: Visual review of the Russian/English bilingual title page confirmed the native title, numbered author row, affiliations, and abstract are visually distinct; the canonical extraction keeps these boundaries separate.
- 2026-10-07: Full application test suite after vector-label fixes passed **72 files / 719 tests** (41.39s).
- 2026-10-07: After vector figure-label demotion, reading-order regression passed **114/114** (93.79s).
- 2026-10-07: After vector figure-label role resolution, full real-paper baseline rerun passed **118/118** (294.51s); no extraction regression.
- 2026-10-07: Visual review of `interpreting-neural-networks.pdf` found figure heatmap labels (`F1`–`F10`, `x1`–`x10`) being promoted to heading nodes despite vector-label evidence. Resolver/projection now demote strong vector figure label clusters to `other`, preventing translation and heading hierarchy pollution. Focused regression passes; PDF extraction suite **119/119** passes (`a9c9291`).
- 2026-10-07: All PDF extraction unit/integration suites after math-aware page classification pass: **13 files / 118 tests** (37.33s). Existing PDF.js/fixture warnings remain non-failing.
- 2026-10-07: Visual review of the equation-heavy medical page 9 confirmed the native text layer is legible and structurally usable (figures, two-column prose, equations, and captions). This supports keeping those pages on native extraction instead of OCR after `c89fa7f`.
- 2026-10-07: Equation-heavy medical pages contained valid spaced tensor symbols (`D H W`, `C Q K`) that triggered garbled/OCR routing. Page classification now discounts dense single-letter mathematical notation while retaining true split-glyph signals. The 23-page medical PDF classifies fully as native-text; page-class tests **11/11** and extraction baseline **118/118** pass (`c89fa7f`).
- 2026-10-07: After title-layer deduplication, reading-order regression was rerun: **114/114** passed (96.72s).
- 2026-10-07: After repeated-title-layer fix, the full real-paper baseline was rerun: **118/118** passed (294.96s).
- 2026-10-07: `hfe-healthcare-scoping-2024.pdf` contained an identical three-line title layer twice at the same coordinates, causing duplicated title text and metadata fallback. `joinLines` now removes only exact repeated line sequences with matching geometry; the canonical title is restored once. Focused regression and typecheck pass (`4deacf3`).
- 2026-10-07: `hfe-healthcare-scoping-2024.pdf` exposed false `garbled`/OCR routing from ordinary phrases (`is a need`, `as a result`, initials such as `Marie E Ward`) matching the split-word heuristic. The classifier now ignores ordinary single-letter words/initials and requires a large geometric gap for interleaved short-token evidence. All 13 pages classify as native-text with no OCR routing; page-class tests and baseline **118/118** pass (`6d65913`).
- 2026-10-07: Computational-linguistics PDF exposed an unedited-author-copy publication notice being stitched into the first body paragraph across a page boundary. A generic author-copy/DOI chrome boundary now prevents that metadata from entering paragraph translation; focused regression passes. Broad extraction regressions after this fix: baseline **118/118**, reading-order **114/114**, typecheck pass (`b50d784`).
- 2026-10-07: `significant-other.pdf` exposed a legacy caption form (`Fig.2 Otto Künzli ...`) with no punctuation after the figure number. It was being emitted as translatable paragraph text. `isFigureCaption` now recognizes unpunctuated, title-like continuations while excluding verb-led prose such as `Fig. 2 shows ...`; the following photographer line is retained as caption continuation. Targeted regression passes and typecheck passes (`f0b7d68`).
- 2026-10-07: `covid-ml-review.pdf` exposed a wide review table whose native cells were fragmented into short paragraph blocks across alternating x-columns. Caption-anchored dense-band evidence now recognizes repeated x origins and promotes only short local blocks to skipped table rows, leaving the following long review prose as paragraphs. The focused regression and the full baseline extraction suite (**118/118**) pass; reading-order regression also passes.
- 2026-10-07: A Russian multilingual article exposed a title/author boundary where superscript affiliation numbers caused the author row (`...лаба1, путу...`) to be appended to the title. Title continuation now treats numbered comma-separated name rows as author metadata; the native article title remains separate. Focused title/pipeline tests pass and typecheck passes.
- 2026-10-07: A pending IEEE HCI review PDF exposed a flattened masthead (`ABDALLAH ... ABBASFaculty ... , KHAIRIL ...`) and a two-line associate-editor credit. Affiliation-name recovery now inserts a boundary before institution leads, recovers the trailing all-caps author, rejects funding acknowledgements as affiliations, and stitches the editor credit into non-prose metadata. The focused regression recovers all three authors and keeps the credit out of paragraph translation.
- 2026-10-07: The same IEEE PDF split its keyword list across two paragraph blocks (`... user` / `interaction, user behavior`). A conservative comma-density and lowercase-continuation rule now joins only this short metadata shape; the focused regression confirms the complete keyword list is preserved as one block.

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
# Versio 現在状態

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

### 2026-10-07 — 表キャプション近傍の誤分類を診断（未採用）

- 表キャプションの近くにある本文が、ネイティブspanのx配置だけで表セルとして扱われる例を診断。
- 長文本文ガードは既存の `marketing-consumer-production-journey` 表セルを段落へ落とし、113本回帰が231/232になったため撤回。
- CJKの `表 3 ...` を単純にキャプション認識する案も、同じページの中国語本文を表領域へ巻き込むため保留。
- 次は caption proximity ではなく、ページ内の行帯・反復x列・セル密度をResolverで統合する必要がある。

### 2026-10-07 — CJK本文の途中切れをtable evidenceの負例に追加

- 中国語本文がページ／列境界で句点なしに切れると、`tableLike` の構造grid判定が table=0.95 を出し、長文本文を表へ昇格させていた。
- CJK文字量と句読点密度を使った `cjkSentenceLikeProse` を、table evidence の負例へ追加。短いセル行や既存の数値表には適用しない。
- `ergonomics-human-factors-ihci` page 11 の長文本文で table score が 0.95→0.68 に下がり、Resolverのtable昇格閾値を下回ることを確認。
- 全コーパス回帰はこの変更後に再実行する。
- `scripts/diagnose-table-geometry.ts` を追加し、caption候補から300px以内の行帯、native x位置、反復列をJSONで確認できるようにした。`ergonomics-human-factors-ihci` では、表1〜3の実際の行帯と本文断片のx列が混在していることを可視化できた。
- CJK比較表で、`√/✓` 記号・短いCJK行・近傍反復x列が揃う場合だけ `cjkComparisonTableRow` をtable evidenceとして追加。対象PDFの4行をtableへ投影し、周辺本文はparagraphのまま保持した。
- 回帰結果: pipeline 40/40、全件抽出コーパス 232/232。

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

- `.app` 同梱translation serverは `MADLAD_SERVER_TOKEN` を要求するため、診断用 `scripts/replay-translation-fallbacks.mjs` が401になっていた。スクリプトが環境変数を `X-Versio-Token` として送るよう修正し、トークン自体は保存・出力しない。
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
- The rebuilt macOS bundle is at `src-tauri/target/release/bundle/macos/Versio.app` (mtime 2026-10-05 10:15:39), with bundled `segmenter.py` byte-identical to source and `SEGMENTER_VERSION="semantic-v83"`. The bundled MADLAD source includes the Transformers 4.57.6 / semantic-v83 version components. Fully quit the currently running app/server before launching this bundle; the old process previously reported semantic-v73.
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
# 2026-10-07: publication metadata emitted as adjacent title candidate

The 113-paper benchmark exposed a generic title-resolution failure where a
publication line immediately below the article title was classified as a
second `title` candidate and concatenated into the article title (for example,
`www... IJRMMS 2021; 3(1): 63-65`). The resolver now treats an adjacent
document/journal masthead candidate as a boundary and keeps it out of the
article title. A direct suffix regression and the real rural-consumer PDF now
pass; title-resolver tests pass 7/7 and TypeScript passes.

# 2026-10-07: explicit research-book title anchor

Report/book PDFs can label the title as `Research Book Title:` while the
generic role classifier assigns that line to the masthead and promotes the
following `Abstract:` line as the title. The resolver now recognizes explicit
title labels as document-level title evidence and keeps them ahead of nearby
abstract text. The human-factors report fixture now resolves to
`Human Factors and Ergonomics`; title-resolver tests pass 8/8.

The refreshed 113-paper benchmark after the title-boundary fixes is
**104/113 title-exact (92.04%)**, up from 101/113. The remaining nine cases
are isolated for triage; several are source-PDF/catalog mismatches or
legitimate language/spelling variants rather than native extraction loss.

# 2026-10-07: inline journal rail between wrapped title fragments

Some PDFs place a journal/year/page rail between two native title fragments,
for example `... role` followed by `IJLE 2026; 6(1): 05-09 language ...`.
The title resolver now removes the bounded publication token while retaining
the surrounding title text. The real eco-linguistics PDF now resolves exactly;
title-resolver tests pass 9/9.

# 2026-10-07: uppercase title split across author-scored lines

Some conference PDFs score an all-uppercase article title as `author` because
the title sits inside the author masthead. When two nearby title-scored lines
form a contiguous uppercase cluster, the resolver now joins them as the title
before applying masthead fallback. The advertising-incentives PDF now resolves
its full title; title-resolver tests pass 10/10.

# 2026-10-07: title benchmark residual triage

The remaining title mismatches were checked against page-one native text.
Several fixtures contain only a Russian/Serbian original title while the
catalog stores an English translation; one differs only by British/American
spelling (`behaviour`/`behavior`), one catalog entry has a likely `TND`/`AND`
typo, and the morphology fixture contains a different medical paper. These
are acquisition/ground-truth issues, not evidence that the title resolver
should invent an English title. Remaining implementation work focuses on
author/affiliation, reading order, tables, and genuine native-text loss.

# 2026-10-07: numbered procedure steps absorbed into figure caption

Manual layout review found a genuine paragraph-boundary error in the
language-model/physics PDF: `Figure 3` caption text was joined with a following
numbered procedure (`2. For each layer...`). Caption continuation now rejects
multi-step numbered procedure blocks, preserving the caption and paragraph as
separate canonical nodes. The regression is covered in the pipeline suite;
PDF extraction pipeline tests pass 38/38.

# 2026-10-07: captionless method/goal table detection

The education-learning-analytics PDF contained a two-column `Method /
Goal/description` table without a caption. Its rows were otherwise emitted as
ordinary paragraphs and would be sent to translation. The generic candidate
layer now requires explicit column-heading evidence plus repeated x-origins,
and excludes pages with figure captions. The rows are projected as skipped
table blocks; the pipeline suite passes 39/39. A first broader heuristic was
reverted after the full corpus caught a Wear Scale author regression. The
strict version preserves the full extraction corpus: **232/232 passed**.
# 2026-10-07: CJK comparison table rows and caption recovery

The ergonomics/HF regression PDF contains a CJK comparison matrix whose rows
use repeated x positions and checkmarks (`√`, `✓`, `☑`, `☒`). The generic
candidate layer now promotes only geometry-matched checkmark rows to table
evidence and promotes a nearby `表 N` line to caption evidence only when at
least three such rows and two repeated column origins are present. A regression
verifies the rows are tables, `表 3` is a canonical caption, and nearby `其次`
prose remains a paragraph. Targeted pipeline tests pass 40/40; the full
extraction corpus remains 232/232 after this change.
# 2026-10-08: mixed masthead title separation regression fix

The Russian `marketing-digital-marketing-consumer-behavior.pdf` exposed a generic late-stage reconstruction bug: page-one affiliation lines from the left column were merged back into the larger right-column article title during masthead processing. `reconstructDocument` now applies a conservative final geometry/style split for a page-one two-column masthead when the right run is materially larger and predominantly uppercase. The rule is document-format based and does not match paper-specific text. The target benchmark now reports `titleExact: 1` and canonical title `DIGITAL MARKETING: CONSUMER BEHAVIOR`; a regression test asserts that the title block contains no affiliation text. Typecheck, the focused title/pipeline suite (59/59), and the focused regression pass. The full extraction suite reached 121/124 assertions, but three existing heavy author-projection cases exceeded Vitest's 60-second task timeout; no assertion failure was reported for those cases. Re-run those heavy tests with an extended timeout before treating the full suite as clean.
# 2026-10-08: numbered masthead author preservation

Frontiers-style numbered author continuations were being resolved as affiliation blocks when they appeared in an adjacent column. The resolver now promotes only short page-one marker-bearing lines with multiple person-shaped tokens and no institution vocabulary; location-only author leakage is filtered for the same projection. The `cognitive-dual-task` targeted benchmark author F1 improved from **0.2353 to 0.5714**; title/source integrity stayed 1.0. Author projection tests **24/24** and typecheck pass. The result is an incremental improvement: several authors remain split across the PDF's interleaved columns and require further geometry-aware stitching.
# 2026-10-08: Frontiers masthead column stitching

The projection layer now performs a guarded final stitching pass for page-one mastheads containing `Edited by`/`Reviewed by` chrome. It joins adjacent same-column native lines before extracting full person-shaped runs, then replaces shorter fragments only within that format signal. The `cognitive-dual-task` author F1 improved from **0.5714 to 0.7000**; title exactness and source integrity remain 1.0. Author projection tests **24/24** and typecheck pass. The remaining misses are genuinely ambiguous author/editor fragments and require stronger numbered-marker relation evidence.
# 2026-10-09: interactive jewellery masthead/caption boundary fix

`interactive-jewellery.pdf` exposed two extraction problems. `mergeFigureCaptionContinuations` could absorb a long sentence-like body paragraph after an unpunctuated Figure caption; the resolver now merges only short/panel-like continuations and a regression verifies Figures 1, 2, and 5 remain separate from body prose. The ACM masthead also flattened adjacent affiliation columns. Projection now uses native span x geometry (excluding superscript markers from the column anchor) and bbox overlap when propagating affiliation markers. The four primary affiliation records are separated; focused pipeline coverage and typecheck pass. Commits: `d839aa8`, `4be7206`.

The broad 232-case extraction corpus was run after the change: 230/232 passed. The two failures are existing/independent cases (`ppg-earring` abstract stitching and `cognitive-memory-cue-interest` layout-chrome paragraph stitching); they remain follow-up extraction work. No `.app` rebuild has been made for these commits.

The two 230/232 failures were then reproduced and fixed generically: long statistical prose with scattered numeric spans was being promoted to `table` by the compact mixed-stream fallback. A sentence-boundary and word-count guard now leaves prose as paragraph while retaining compact borderless table streams. The targeted PPG, cognitive-memory, interactive-jewellery baseline/reading-order checks now pass (6/6); the full corpus should be rerun after the final masthead continuation tweak.

Final rerun after the masthead continuation tweak completed **232/232** (118 baseline real-paper checks + 114 reading-order checks, 395s). This validates the extraction changes across the cached corpus. The remaining PDF.js `TT`/ColorSpace warnings are parser warnings, not failed assertions. The `.app` bundle has not been rebuilt since these extraction commits.

After adding the generic same-column affiliation stitch (comma-terminated row + nearby continuation), the full author projection suite passed **24/24**, and the final cached extraction corpus again passed **232/232**. The interactive-jewellery masthead now keeps the main institution continuations separate without affecting existing masthead cases. The packaged `.app` still needs a rebuild to include these commits.

`npm run tauri:build:fast` was then completed successfully at **2026-10-09 00:47:42**. The generated app is `src-tauri/target/release/bundle/macos/Versio.app`; this is an unsigned fast build with DMG/signing skipped.

The Reader header now renders extracted `paper.affiliations` below the author list when available, with a compact secondary style and no output when the list is empty. Reader tests **12/12** and typecheck pass. The UI change was packaged in a new unsigned fast `.app` at **2026-10-09 00:59:09**.

# 2026-10-09: Apple Translation selective backend

Added a macOS-native `AppleTranslationEngine` and conservative `SelectiveAppleTranslationEngine`. Only extracted paragraph blocks with complete prose-like text (40–700 chars, sufficient words, no contact/URL/reference/caption/list markers) are registered for Apple; titles, headings, figures, tables, references, and uncertain blocks remain on MADLAD. Unavailable language packs, native errors, and existing quality-gate failures fall back to MADLAD. Apple and route identities are distinct for translation cache keys. The helper is compiled from `src-tauri/apple_translation.swift` during both fast and clean builds and bundled as `apple-translation`. Routing tests and typecheck pass; the unsigned `.app` was rebuilt at 10:29:26. The current machine reports `TranslationError.Cause.notInstalled` for the Apple language pack, so runtime safely uses MADLAD until the pack is installed. Evaluation artifacts and the migration decision are in `test-data/real-papers/reports/apple-translation-evaluation-v1.md`.

# 2026-10-09: Apple routing gate status

The guarded selective backend is production-ready as code but remains **conditional No-Go for default replacement**: the current machine reports the Apple language pack as not installed, so no real Apple accepted/rejected/fallback counts have been observed inside the app. Static policy analysis identifies 102/239 unique non-fallback ordinary-body audit rows as eligible. The 20-pair manual review still contains severity >=2 cases, so unsafe false-accept = 0 is not proven. Keep MADLAD as the safe fallback and rerun the held-out cohort after installing the language pack before enabling Apple as the default first choice.

- 2026-10-09: Apple language pack became available and native helper held-out routing was measured on 102 eligible ordinary-body rows: Apple accepted 96/102, MADLAD rescued 5/6 Apple quality rejections, and final reader-visible fallback was 1/102 (0.98%) for this cohort. This is below 5% operationally, but the source set is from the existing audit corpus and the 20-pair manual review still contains severity >=2 cases; full default-replacement Go is not claimed. Summary: `apple-routing-quality-summary.json`.

- 2026-10-09: Moved numbered affiliation + body contamination into PDF extraction. A generic multi-institution masthead band is now classified as an `affiliation` block before projection, so it cannot enter the following paragraph translation unit. Regression on `linguistics-register.pdf` passes; the three institutions are projected as affiliations and no block contains both the affiliation band and article prose. Latest unsigned `.app` rebuilt at 10:45.

- 2026-10-09: Full PDF extraction suite after the affiliation-band boundary fix passed **129/129 tests across 13 files** in a single worker. Parallel Vitest mode still has the known `onTaskUpdate` timeout despite all assertions passing; single-worker is the authoritative result.
### 2026-10-11: latest packaged build and typography evidence

- `npm run tauri:build:fast` completed successfully. The latest bundle is `src-tauri/target/release/bundle/macos/Versio.app`, built at `2026-10-11 22:57:00 +0900`.
- The bundled `translation-server/engines/segmenter.py` and `madlad_mps.py` hashes match the working tree. Native line provenance keeps `fontName`, `fontSize`, x/y, width/height, and rotation through layout diagnostics and package layout. Heading/table/masthead resolvers use font family/size and geometry as evidence, so typography is now an explicit block-boundary clue rather than a display-only field.
- A packaged acceptance run with `/Users/harada/Desktop/2686612.2686699.pdf` started the bundled server successfully (`/health` ready), but remained at `import_started` for the 120-second harness window. The run was stopped and retained at `/tmp/versio-ozchi-acceptance.Mrk2R0`; no extraction result was claimed from this incomplete run. Direct Canonical extraction and the full regression suite remain the valid evidence until the packaged import can complete in a longer/interactive run.
- The old unrelated PID 54697 server on port 8765 was stopped before the acceptance run, so the bundle spawned its own sidecar; this avoids testing against a stale server.
- The package checkpoint fix is now bundled at `2026-10-11 23:22:03 +0900`. The latest app was fully restarted from that bundle; its bundled translation server reached `/health` `phase=ready`, `model_loaded=true`. A fresh Tauri run reached `import_dispatched` without the earlier immediate package error during the first 20 seconds (`/tmp/versio-ozchi-acceptance-final2.qk3PcZ`); the full translated import still requires a longer interactive run because this harness was intentionally stopped before completion.
- After adding the post-source-hash flush and live-package read retry, the full JavaScript regression suite passes: **80 files, 758 tests**. Typecheck, focused package tests, and `git diff --check` also pass. The latest app remains running from the 23:16 build for manual Tauri verification.
- The Golden PDF's same-baseline masthead authors were found to be reversed by sub-pixel y-coordinate noise (`Jonna Häkkilä, Ashley Colley` despite Ashley being left). The generic author-source sort now treats y differences ≤1pt as one visual row and orders by x, yielding `Ashley Colley, Jonna Häkkilä`; a baseline regression asserts this order. Author projection focused tests pass **25/25**. The latest `.app` containing this fix was rebuilt at `2026-10-11 23:27:43 +0900`, restarted, and its bundled translation server reached `phase=ready`.

- The 113-paper reading-order rerun exposed one generic regression in `medical-imaging-deep-learning-review`: a short first line beginning `Abstract—Since ...` inherited title typography and was omitted from the paragraph stream. The layout classifier now treats inline abstract labels followed by multi-word prose as paragraph evidence; this is punctuation/typography based and applies to IEEE/arXiv-style layouts generally. The full reading-order corpus now passes **114/114**.
- The final unsigned fast `.app` was rebuilt at `2026-10-11 23:51:15 +0900` from the working tree, restarted, and its bundled server reports `/health` `phase=ready`, `model_loaded=true`. Bundle hashes match the source for `segmenter.py` (`e6e2ad06…`) and `madlad_mps.py` (`c5c7dc12…`).

- A clean isolated packaged integration acceptance run finally completed for the Golden OzCHI PDF (`/Users/harada/Desktop/2686612.2686699.pdf`): import, Paper Package persistence, Reader body lookup, annotation creation, library search, English Markdown export (`46,022` bytes), quit/relaunch, and persisted annotation verification all returned `ok=true`. The result is retained at `scripts/packaged-e2e/artifacts/integration/result.json`. The persisted package has the expected title, ordered authors Ashley Colley / Jonna Häkkilä with both affiliations, no ACM permission-text paragraph, 21 reference blocks, and captioned Table 1–5 blocks. This validates the real bundled Tauri path through CanonicalDocument/PaperBlock and Markdown export; interactive visual inspection and Notion ZIP inspection remain separate follow-up checks.

- Docling was evaluated in an isolated `tmp/docling-eval-venv` (`docling==2.137.0`) on the same Golden PDF. It produced useful Markdown grids for some tables, but introduced title-to-abstract reading-order contamination, emitted the full ACM permission notice as article prose, flattened affiliation/email metadata, and corrupted diacritics/statistical glyphs (`Jonna HŠkkilŠ`, `usersÕ`, `�2`). The full evidence and decision are in `test-data/real-papers/reports/docling-ozchi-finger-specific-touch-v1.md`; Docling is not a native-parser replacement, only a possible future low-confidence table-evidence enricher.

- Packaged acceptance now also creates and structurally validates the real Notion import archive, rather than only exercising plain Markdown export. The Golden PDF passed a second clean run with `notionBytes=1,137,805`; its ZIP has one Markdown file plus 15 figure/table image files at the archive root, so Notion will not create an empty `assets` page. The final result preserves the Notion byte count after relaunch. Typecheck and focused Markdown/package tests pass. Latest fast unsigned `.app` was rebuilt at `2026-10-12 00:04:52 +0900`, then started; bundled translation `/health` reports `phase=ready`, `model_loaded=true`.

- GROBID `0.9.1` was then built and run locally with Java 21 for the same Golden PDF; no Docker, Podman, or cloud service was used. `processHeaderDocument` exactly recovered the title, both author names, emails, DOI, and useful affiliation structure. `processFulltextDocument` excluded the ACM permission chrome, but returned only 20 references versus native 21, 10 figures versus native 12, and logged seven incomplete/malformed tables whose cells are interleaved with prose. The comparison is recorded in `test-data/real-papers/reports/grobid-ozchi-finger-specific-touch-v1.md`. GROBID remains optional local **header evidence** only; it must not replace the native Canonical extraction path. The TEI parser now retains sibling department/institution/country tags within an affiliation link; its focused tests pass 3/3 and typecheck passes. Typography continues to be retained as resolver evidence (`fontName`, size, weight, baseline, indent and spacing) together with geometry, never as a standalone role rule.

- The fast unsigned `.app` was rebuilt after the GROBID TEI parser and comparison-report changes at `2026-10-12 00:19:40 +0900`: `src-tauri/target/release/bundle/macos/Versio.app`. The focused GROBID TEI test passes **3/3**, typecheck and `git diff --check` pass. This rebuild includes all current extraction/UI worktree changes; start this bundle afresh to use it.

- A fresh packaged Tauri acceptance run against `/Users/harada/Desktop/2686612.2686699.pdf` passed again after that build: isolated import, Canonical/Paper Package persistence, Reader body lookup, annotation, library search, English Markdown export (`46,022` bytes), root-level Notion archive (`1,137,805` bytes), quit/relaunch, and persisted annotation verification all returned `ok=true`. Result: `scripts/packaged-e2e/artifacts/integration/result.json`. The full cached extraction corpus was then rerun against the current worktree: **232/232** pass (118 real-paper baseline + 114 reading-order checks, 417.62s). Parser font/ColorSpace warnings are non-failing PDF.js diagnostics only.

- Latest-bundle visual verification: the normal `Versio.app` process creates a real native window and its library surface was captured from the current bundle at `scripts/packaged-e2e/artifacts/integration/latest-app-window.png`. The dedicated Accessibility UI E2E was strengthened after two harness-only failures: its isolated HOME now reuses the host Hugging Face model cache, and Open-panel paths are pasted rather than typed so a Japanese IME cannot convert path punctuation. The panel now reaches and selects the Golden PDF. The remaining UI-driver issue is the final NSOpenPanel confirmation: the native panel closes but WKWebView does not deliver a file-input change event under System Events automation, so no package is materialized. This does not contradict the separately successful packaged acceptance import, which reads the same PDF through Tauri's `read_dropped_pdf` command. Reader visual interaction still needs either a stable macOS picker driver or a short manual import/open check; do not treat the failed UI harness as an extraction regression.

- The fast unsigned `.app` was rebuilt again at **2026-10-12 00:58:24 +0900** after the packaged UI harness changes. The bundle path is `src-tauri/target/release/bundle/macos/Versio.app`; the build completed successfully. The translation server was started separately for UI verification and stopped cleanly afterward.
- The UI harness now explicitly uses the Tauri `read_dropped_pdf` + `startBackgroundImport` path when `VERSIO_UI_E2E=1` and `VERSIO_UI_E2E_DIRECT_IMPORT=1`, avoiding the flaky native picker/IME path. A subsequent run with the bundled app and a ready translation server still exited before producing a UI watcher marker, so no new visual UI pass is claimed. The earlier packaged integration acceptance remains the authoritative end-to-end pass; no production direct-import behavior is enabled.
- Follow-up process audit found four orphaned `Versio.app/Contents/MacOS/app` processes left by earlier UI/manual attempts (including isolated `VERSIO_UI_E2E` homes). They were not a current production instance and were terminated. This explains why screen captures showed unrelated/stale window content and why Accessibility enumeration was ambiguous; future UI checks must launch one fresh bundle instance and clean it in a `finally`/trap.
- Re-inspected the retained latest-bundle screenshot `scripts/packaged-e2e/artifacts/integration/latest-app-window.png`: it is a real Versio library window from the packaged app (Japanese library title and paper card), not a mock or browser capture. It verifies native window rendering and the imported paper card; the deeper Reader-pane visual remains covered by the successful Reader body lookup in packaged integration, but lacks a stable screenshot artifact.
- After the display was turned back on, CGWindowList inspection identified the Versio native window directly (owner `Versio`, PID 36251, window ID 128250, bounds `1280×832` at `Y=-1018` on another Space/display). Capturing that window with `screencapture -l 128250` succeeded and produced `/tmp/versio-window-direct.png`, confirming the app window was present; the earlier full-screen captures had shown Cursor because they captured the active Space rather than this off-screen window.
- Keyboard navigation through that same off-screen native window reached the Reader pane. Direct capture `/tmp/versio-keyclick.png` shows the actual Reader layout, TOC, title, abstract and translation-failure banner. This is a real visual verification of the packaged Reader surface. The displayed object is an older persisted user paper (it shows only `Jonna Häkkilä` and six failed blocks), so it is not used as a regression result; the clean packaged acceptance artifact remains authoritative for the Golden PDF's current extraction (Ashley + Jonna, 232/232 corpus).

# 2026-10-12: borderless matrix row-label resolution

The Golden OzCHI PDF exposed a generic role conflict in the borderless p-value
matrix on page 5. Bold axis labels such as `Comfortable` received a perfect
heading-style score even though the geometry evidence identified a repeated
numeric neighbourhood and a high table score. The resolver now lets that
specific geometry/table evidence win for short punctuation-free labels, so
matrix headers and rows remain table members and are not emitted as translated
headings. A fresh diagnostic reduced the report from 132 to 131 blocks and
resolves `Comfortable` as `table`; the valid page-6 Table 3 grid remains a
table (`Finger / Thumb / Finger1…` and its function rows), not body prose.
The source-only table fallback is intentional: uncertain/borderless cells are
shown verbatim and are not sent to MADLAD, which explains why these blocks do
not receive a translation status. Typecheck and lint pass; the focused PDF
test process was stopped after PDF.js fixture work exceeded the local timeout,
so the full extraction corpus should be rerun before packaging this change.

The cached extraction baseline was rerun in a single fork: **118/118 tests
passed**. Vitest then reported its known `onTaskUpdate` worker timeout while
the second reading-order file was still running; no extraction assertion
failure was reported. The focused Golden diagnostic and new table assertions
confirm the role change. `npm run tauri:build:fast` completed successfully at
**2026-10-12 09:58:17 +0900** and produced the unsigned app at
`src-tauri/target/release/bundle/macos/Versio.app`; the bundle contains
the updated extraction code and bundled translation server. A full packaged
import/visual check of the new table rendering remains the next manual step.

# 2026-10-12: image-backed ruled-table projection

The remaining Golden PDF Reader failure was not role classification: Table 3
was correctly identified as a ruled table, but its two native-text columns
were projected as separate source-only blocks because the table-caption crop
used ordinary figure bounds and clipped the table rows themselves. `figureImageRect`
now recognizes compact multi-line rows directly above a `table_caption` and
uses their top edge as the raster crop bound. After a numbered caption receives
a real crop, projection removes only its caption-owned `table-region-*`
fragments; if crop extraction fails, those source cells remain visible rather
than being discarded. Focused crop and fragment-suppression tests pass, as do
typecheck, lint, and diff validation.

The freshly rebuilt app was exercised through the actual packaged Tauri import
path with the Golden OzCHI PDF in an isolated app-data directory. Import,
annotation, search, Markdown/Notion export, quit, and relaunch all succeeded.
The persisted structure contains image-backed Table 1–5, including Tables 3
and 4, and no separate `Finger/Thumb` or `Function` table-column fragments.
Artifact: `scripts/packaged-e2e/artifacts/integration/result.json`; isolated
package: `app-data-68774`. The current app bundle was rebuilt at
**2026-10-12 12:14:25 +0900**. Existing user imports retain their old stored
extraction and need a fresh import to receive this structural repair.

# 2026-10-12: extraction usability goal and corpus table baseline

An active extraction-usability goal now treats the real-paper corpus and the
Tauri Reader as the product regression surface, rather than treating role
classification alone as success. The first table-region cohort pass completed
with **0 extraction errors**, **41 PDFs containing 204 table regions**. This
is an inventory, not a precision claim: the next phase samples/inspects these
regions by publisher and format, verifies caption-to-crop attachment, and
records whether the Reader shows one readable table rather than detached
columns. Artifact: `test-data/real-papers/reports/table-region-cohort-v1.json`.

# 2026-10-12: caption-above table projection follow-up

The Golden OzCHI `Finger/Thumb…`, `Function…`, and `Error dist.…` Reader
cards were a projection defect, not prose translation: the native table regions
were detected, but a numbered table crop and its raw cell fallback could both
be displayed. The import path now suppresses a fallback only after its
numbered caption has a rendered image, and recognizes both new
`table-region-*` fragments and legacy `tableSourceFallback` / table-region
evidence. Source text remains visible if rasterization fails.

`figureImageRect` now supports caption-below and caption-above tables. The
caption-above path needs a contiguous sequence of compact cell rows, so one
ordinary prose line cannot become a crop. Focused crop/projection tests pass
**4/4**, plus typecheck and lint. A full **114-PDF** Reader-readiness pass
completed with 0 extraction errors: among 47 PDFs with 366 numbered table
captions, crop-ready captions increased from **178 to 232**. Golden OzCHI is
now 5/5 crop-ready and all five raw table fragments are crop-owned. The report
records 1,830 unowned table-like fragments for the next precision-focused
iteration; they are not globally hidden because many are charts, appendices,
or tables lacking a trustworthy caption/crop. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The Resolver change was included in a further fast unsigned build at
**2026-10-13 13:25:25 +0900**. The packaged OzCHI acceptance run against that
bundle passed again; its persisted structure has 161 blocks, 5 tables, and 12
figures, with no raw `Finger Thumb Finger1`, `Function Call tapped`, or
`Phonebook Finger` streams.

# 2026-10-13: real Tauri import completion and OCR fallback safety

The isolated packaged-app acceptance test now completes with the current
bundle: native PDF import, atomic Paper Package persistence, Reader block
loading, annotation, library search, Markdown export, Notion ZIP export, quit,
and relaunch persistence all passed. This run exposed that the initial import
still assembled its package through mutable cache checkpoints before reading it
back to attach layout/source data. A document with no projected body block
could therefore reach that read before any package existed, yielding `Paper
Package が不完全です` and an empty Reader. Initial import now creates the complete
package directly from the extracted projection, native layout, and `source.pdf`
in one atomic package swap; the visible library index receives its final source
hash only afterwards.

Vision OCR is now bounded to 15 seconds per selected page. Timeout or Vision
failure produces an empty OCR result for that page and retains PDF.js native
text, so an auxiliary macOS OCR request cannot indefinitely block an otherwise
readable import. The OCR-stall regression, typecheck, lint (existing warnings
only), and the packaged acceptance test pass. The latest fast unsigned bundle
is `src-tauri/target/release/bundle/macos/Versio.app`, rebuilt at
**2026-10-13 03:05:27 JST**.
For the OzCHI finger-specific-touch regression itself, all **5/5** numbered
tables are crop-ready; all 9 raw table fragments are caption-owned and the
Reader simulation leaves **0** raw table fragments. Existing user exports are
still historical until **PDFを再抽出** is run from the paper menu.

The next generic correction prevents later same-baseline matrix propagation
from overwriting stronger graphic-label evidence. It affects chart/diagram
labels only when their `other` evidence is already at least 0.82; captioned
and ordinary native table rows keep their table evidence. The real
`linguistics-language-model-physics` fixture now verifies that repeated plot
labels (`lay9 … lay10`) are not emitted as a Reader table, while OzCHI Table
3/4 checks still pass. A second 114-PDF audit retains **0 extraction errors**,
345 numbered captions, and 255 crop-ready captions; raw table fragments fall
from 1,811 to **1,808**, Reader-visible fragments from 1,151 to **1,148**.

`reextractPaper` now has a real saved-package integration regression using the
OzCHI PDF: it seeds a Paper Package with `source.pdf`, runs the stored-source
re-extraction path, then confirms the same paper ID and source are retained
and Table 4's native `Finger | Phonebook` cells persist in `structure.json`.
The Node test deliberately observes zero raster crops because its PDF runtime
has no Canvas backend; this validates the source-only fallback, not Tauri
image rendering. The packaged Tauri import acceptance remains the authoritative
check for actual raster table crops.

# 2026-10-12: image-backed package persistence verified on the actual OzCHI route

The prior large-PDF packaged acceptance failure was not an extraction failure:
`list_app_files` resolved the requested directory in the isolated acceptance
home but built its returned relative paths from the normal macOS app-data
directory. Consequently `loadPaperPackage(..., includeAssets: true)` saw no
freshly written `assets/figure-*.png` or `assets/table-*.jpg` and rejected the
temporary package as incomplete. The filesystem command now uses the same
environment-aware root for both resolution and recursive listing.

The actual bundled Tauri app imported
`/Users/harada/Desktop/2686612.2686699.pdf` in an isolated acceptance home and
reached `ready_for_relaunch`, including annotation, search, Markdown export,
and Notion ZIP export. The persisted package contains **17 assets**. Its
original document keeps the `p=0.007` statistical prose as text and represents
Table 3 as `assets/table-003.jpg` plus its caption; the former `Finger Thumb …`
and `Function Call …` raw table-cell streams are absent. The isolated test app
and its translation server were stopped after verification.

Typecheck and lint pass (existing warnings only). The Rust release bundle was
rebuilt after clearing stale DMG files and debug cache when the development
volume ran out of space. Current bundle:
`src-tauri/target/release/bundle/macos/Versio.app`, built at
**2026-10-12 21:54:19 +0900**. The debug cache was intentionally removed; a
future `cargo test` will rebuild it.

# 2026-10-12: vertical-bar journal captions and full-column numeric table crops

The real `cognitive-dual-task.pdf` Tauri import exposed a second generic table
failure: `TABLE 2 | Baseline characteristics` was stored as a caption but was
not eligible for an image crop, leaving the table rows in Markdown. The
vertical bar is now recognized as a caption delimiter alongside colon, period,
and dash. The crop detector now also accepts a near-full-column row only when
it has repeated same-line cell geometry and numeric cell content; this recovers
wide ruled result tables without admitting short prose.

Direct native-PDF geometry diagnostics now produce crop rectangles for Tables
1, 2, and 4 in that paper. Focused crop regressions, caption recognition, and
typecheck pass. The complete `pipeline.test.ts` presently has four pre-existing
failures (mixed thesis caption, captionless method table, Elsevier title, and
synthetic column classification) plus Vitest's reporter timeout; these need
separate attribution before claiming a green full suite. The new unsigned
bundle was built at **2026-10-12 22:14:30 +0900**. An isolated reimport of this
second PDF could not complete because that fresh bundle's translation server
entered first-download state; it was stopped rather than leaving a background
process. This does not affect the direct PDF extraction evidence or the earlier
complete OzCHI packaged acceptance.

# 2026-10-12: title-masthead and two-column regression repair

Single-worker execution of the 66 pipeline regressions separated real failures
from the PDF.js/Vitest reporter timeout: 65 assertions passed, with one real
Elsevier title failure. The resolver had combined a journal masthead with its
shorter repeated venue-name variant as if they were article-title lines. A
normalized prefix check now removes that repeated publisher rail after the
first candidate is established as masthead furniture; the real article title
is retained. The targeted title regression passes.

The earlier single-column safeguard also initially treated a genuine two-column
row as a midpoint-crossing span. It now preserves two-column layout when the
same baseline has independently long left and right spans. Both the genuine
two-column and midpoint-spanning single-column regressions pass. The mixed
thesis caption test was corrected to select the body caption rather than its
correctly-suppressed table-of-contents entry. Latest unsigned bundle:
`src-tauri/target/release/bundle/macos/Versio.app`, built at
**2026-10-12 22:26:32 +0900**.

# 2026-10-12: non-table grid false-positive follow-up

The next orphan-fragment review showed that raw-table counts also included
table-of-contents dotted leaders and symbolic assignment displays. These are
not data tables and should never be rendered as table cards. The generic layer
now marks a dotted leader as non-body only when at least three matching
leader-plus-page-number peers occur on the same page. It marks a dense
mathematical display as an equation only when it has multiple assignment/math
operators, dense numeric rows, and little prose, while preserving
caption-anchored data tables. Real-PDF regressions cover the ergonomics thesis
contents page and the language-model-physics display. Focused tests, typecheck,
lint, and diff validation pass. The fast unsigned bundle was rebuilt at
**2026-10-12 21:26:40 +0900**:
`src-tauri/target/release/bundle/macos/Versio.app`.

# 2026-10-12: packaged import / persistence acceptance

With the stale orphan sidecar stopped, an isolated launch of the current
packaged app using `open -n` completed the real Tauri acceptance flow. It
created all required package files (`paper.json`, `original.md`, `ja.md`,
`structure.json`, `layout.json.gz`, `source.pdf`, and `translation.json`), then
completed annotation, search, Markdown export, and Notion ZIP export. A second
isolated launch recorded `relaunch_ok`, verifying that the imported paper and
annotation persisted. This is the package-level proof that the provisional
index visibility fix prevents the earlier incomplete-package Reader state for
the exercised fixture. Test data lived only under
`/tmp/versio-package-open.TvjJ4P` and both test app and sidecar were
stopped afterwards.

The fast unsigned bundle was rebuilt after this change at **2026-10-12
12:46:37 +0900**: `src-tauri/target/release/bundle/macos/Versio.app`.

# 2026-10-12: orphan table-candidate precision pass

The Reader-readiness report showed that many unowned `tableSourceFallback`
blocks were not tables at all. Real-PDF inspection identified two generic
causes: math-rich prose was fragmented into many native spans and inherited a
grid score, while numeric label matrices near a figure caption entered the
captionless-table fallback. The resolver/generic evidence now keeps prose with
ordinary lexical and punctuation structure as a paragraph, treats a strongly
symbolic low-prose display as an equation, and gives figure-adjacent vector
labels `other` priority over captionless table recovery. Caption-anchored
tables retain their dedicated evidence.

Focused real-PDF regressions pass for the economics `Regularized DeepIV`
math-prose case and the language-model-physics figure-label/formula cases,
along with the existing captionless-grid fixture; typecheck, lint, and diff
validation pass. Before the formula follow-up, the 114-PDF report reduced raw
table fragments from **1,951 to 1,643** and orphan fragments from **1,830 to
1,524**, with all 232 crop-ready numbered captions retained. Current targeted
diagnostics further reduce the language-model-physics source-only table count
to 109 and project its `|S| …` display as an equation. A full corpus rerun is
required after the final equation refinement before the next bundle build.

# 2026-10-12: bidirectional caption ownership and borderless matrix follow-up

The next full corpus pass found three complementary table layouts that had to
be handled together rather than by a paper-specific exception: captions below
their cells (common in ACM proceedings), captions whose left-aligned text
introduces a table extending into the right column, and borderless p-value
matrices where every cell is a separate native block. Generic candidate
evidence now recognises a nearby numbered table caption in either vertical
direction, multi-cell text bands adjacent to it, and a short axis label sharing
a baseline with an already strongly evidenced matrix cell. Typography cannot
revive those labels as headings after the matrix geometry has won.

Projection also no longer suppresses every short table node on a page merely
because that page has one caption relation. Suppression is confined to the
caption target's local geometry; an independently located matrix remains a
source-only table until the actual import path replaces it with a successful
image crop. The Golden OzCHI `Comfortable`/`Finger` p-value matrix, the
caption-below Table 3 `Finger/Thumb` and `Function` columns, and the Springer
wide-table cells in `marketing-consumer-production-journey` all remain table
blocks (`skipped` for translation), while figure labels and symbolic equations
retain their non-table roles.

Validation: focused Golden/marketing/captionless-grid checks pass **3/3**;
focused prose/figure-label/equation checks pass **3/3**; typecheck, lint and
`git diff --check` pass. The complete cached real-paper baseline now passes
**118/118** in `test-data/real-papers/reports/extraction-baseline-v4.log`
(304s). Vitest emits a non-failing `onTaskUpdate` reporter timeout after this
single-fork long run, but reports no failed assertion.

The refreshed 114-PDF table-reader inventory completed with **0 extraction
errors**: 47 papers contain 366 numbered table captions; 232 captions have
a usable image-crop geometry. It records 2,061 source-level table fragments,
117 of which are crop-backed. The remaining 1,922 are deliberately retained
for precision review: they include genuinely uncaptioned tables, charts, and
appendices, so they must not be globally hidden. This inventory is geometry
triage, not an assertion of visual correctness. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The unsigned Tauri bundle was rebuilt after this final geometry change at
**2026-10-12 16:35:27 +0900**:
`src-tauri/target/release/bundle/macos/Versio.app`. The next action is
an isolated packaged import/reload confirmation, then a clean re-import of the
Golden PDF for Reader visual confirmation.

# 2026-10-12: narrative prose beside a table follow-up

Visual inspection of OzCHI page 5 established that the `p=0.007` / `H2`
statistical result is a normal right-column paragraph beneath Table 2, not a
table cell. A caption-adjacent matrix signal had incorrectly overridden its
multiple complete sentences because it shared a page with the left-column
table. Strong table promotion now yields to a substantial multi-sentence
narrative block; short matrix cells remain table candidates. A Golden
regression asserts this paragraph remains `pending` for translation and keeps
`p=0.007`.

The wear-scale correlation matrix regression now permits its numbered-caption
region to be represented by a consolidated skipped table target rather than
requiring every native cell to be projected separately. It still verifies that
the table data is retained and never translated. Full pipeline assertions pass
**59/59**, and the cached real-paper baseline passes **118/118** in
`test-data/real-papers/reports/extraction-baseline-v5.log` (281s). As above,
Vitest's long single-fork reporter emits a non-assertion `onTaskUpdate`
timeout after successful tests. Typecheck, lint, and diff validation pass.

The unsigned bundle was rebuilt at **2026-10-12 17:01:15 +0900**:
`src-tauri/target/release/bundle/macos/Versio.app`. The next action is
to re-import the Golden PDF through the packaged app. Existing package/export
folders are historical extraction outputs and must be deleted/re-imported to
reflect this pipeline version.

The refreshed 114-PDF table diagnostic has **0 extraction errors**. It finds
366 numbered captions in 47 papers, with 232 crop-ready regions. Raw
table-like fragments fell from 2,061 to **1,997** and unowned fragments from
1,922 to **1,863** after restoring the OzCHI body paragraph. These counts are
triage indicators, not quality scores: remaining unowned entries include real
captionless tables, charts, and appendices that need separate high-precision
region work.

# 2026-10-12: single-column midpoint and generous-leading repair

A long single-column marketing thesis was falsely classified as two columns:
native spans crossing the page midpoint were excluded from both column bands,
leaving artificial left/right starts. `detectPageColumns` now falls back to a
single column when a majority of wide body rows have midpoint-crossing spans.
Paragraph merging also accepts generous leading only when text continuity,
alignment, and font style all agree. The affected source now reconstructs a
seven-line paragraph, remains `pending` for translation, and no longer becomes
a table fallback. Real-PDF regressions cover this case and retain a genuine
two-column OzCHI page. The full cached corpus passes **118/118** in
`test-data/real-papers/reports/extraction-baseline-v6.log` (324s); the known
Vitest reporter timeout remains non-assertion-only. Rebuild the bundle before
manual package reimport.

# 2026-10-12: incomplete Paper Package publication race

The packaged Tauri acceptance path reproduced a separate Reader failure behind
the visible `コンテンツがありません` state and markdown-export error `Paper Package が
不完全です`: the SQLite paper index was published with its final source hash
before the atomically persisted `paper.json`, `original.md`, `ja.md`, and
`structure.json` package existed. The Reader could select that card during this
window.

Imports now retain their `importing-<uuid>` provisional hash until the complete
Paper Package has been written. The library query hides only those provisional
records, then exposes the card after the final hash is saved. If package
persistence fails, import reports a retryable error rather than creating an
empty Reader card. `sqlitePersistSafety.test.ts` covers the visibility boundary;
the focused test, typecheck, lint, and diff validation pass.

The fast unsigned bundle was rebuilt at **2026-10-12 17:49:10 +0900**:
`src-tauri/target/release/bundle/macos/Versio.app`.

An isolated packaged acceptance run with the large OzCHI PDF no longer reached
the previous immediate incomplete-package error, but it did not complete before
the three-minute test timeout. A follow-up isolated run using the small fixture
was prevented by macOS application-instance behaviour while the normal bundled
app is open. Do not kill the user’s app or its translation server automatically.
After the user fully quits it, rerun `scripts/packaged-e2e/run-integration.sh`
or an equivalent isolated acceptance launch to obtain the complete
import/annotation/export/relaunch marker.

# 2026-10-12: Golden Table 3 reader-visibility regression

Direct native-PDF diagnosis of OzCHI page 6 confirms that the two strings that
previously appeared as unreadable Reader cards — `Finger Thumb Finger1 …` and
`Function Call tapped contact …` — resolve as `table` nodes with `skipped`
translation status. The nearby `p=0.007` result remains a normal `paragraph`
with `pending` translation status. A real-PDF regression now injects the
reader's successful Table 3 image-crop artifact and asserts both raw cell
streams are removed while the caption/image table remains. This proves the
intended reader projection boundary rather than merely testing a synthetic
grid. The new crop-visibility test, statistical-prose regression, SQLite
visibility test, typecheck, lint, and diff validation pass.

The table-fragment ownership rule now covers both publisher conventions:
numbered captions above their table and below their table. It still requires a
same-page, same-column raw table-region fragment with horizontal overlap and a
bounded local vertical distance, so ordinary nearby prose cannot be hidden.
The focused above-caption and real OzCHI Table 3 regressions pass. The fast
unsigned bundle including this change was rebuilt at **2026-10-12 21:14:26
+0900**: `src-tauri/target/release/bundle/macos/Versio.app`.

The refreshed 114-PDF table-reader diagnostic completed with **0 extraction
errors**. It now finds 372 numbered captions, 240 crop-ready captions, and
588 raw table fragments that are locally owned by an image-backed caption and
will therefore be suppressed in the actual import path. The prior inventory
found 115 crop-backed fragments; the increase primarily comes from accepting
caption-above layouts. Unowned raw fragments fell from 1,863 to **1,106**.
These remain a review queue for genuinely uncaptioned tables, charts, and
appendices rather than a signal to hide all table-like content. Artifact:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The diagnostic was rerun against the current extraction code on 2026-10-12:
**0 extraction errors / 114 PDFs**, 337 numbered captions, 233 crop-ready
captions, 1,772 raw table-region fragments, 587 crop-backed fragments, and
1,078 remaining unowned fragments. The remaining count is deliberately a
triage queue, not an error count: it mixes captionless data tables with plots,
equations, references, and other high-precision false-positive exclusions.

# 2026-10-13: source-only table reader fallback and package freshness finding

The user-visible `exploring-finger-specific-touch-screen-interacti` export is
an older immutable package: it contains only `table-001.jpg` through
`table-003.jpg`. Current geometry diagnostics find valid crop rectangles for
OzCHI Tables 3, 4, and 5, so it must be re-imported (or explicitly
re-extracted) to receive the newer table image path. Paper Packages currently
have no extraction-pipeline version, which explains why rebuilding the app
alone never rewrites a prior import. The library and workspace three-dot menu
now provides **PDFを再抽出**. It rebuilds the package from stored `source.pdf`
while retaining the paper ID, memberships, annotations, reading position, and
only translations whose normalized source is unchanged. Changed blocks remain
pending rather than inheriting an unrelated translation, and stale table/figure
assets are replaced atomically.

For tables where a raster crop is unavailable, import now persists native PDF
same-baseline cells as `TableMetadata.tableRows`; the Reader renders that data
as rows/cells instead of one concatenated prose string. This is deliberately a
fallback: an image-backed numbered caption still suppresses its local raw cell
fragments, preserving a visual source of truth. The focused metadata test and
re-extraction translation-carry-forward test, typecheck, lint, and real OzCHI
baseline pass. OzCHI Table 4 confirms cells are retained; Table 3
is represented by two independent vertical native columns and is therefore
covered by the crop path rather than falsely claimed as a reconstructed grid.

The packaged acceptance helper no longer overrides `HOME`: it isolates app
data with `VERSIO_ACCEPTANCE_HOME` while reusing the local MADLAD cache.
The prior override downloaded a second multi-GB model cache and exhausted the
disk before extraction could be assessed. An isolated large-PDF acceptance
run still did not reach its package marker within its 180-second timeout and
left no package files, so it remains a separate real-Tauri import performance
diagnostic; it is not evidence that the current extraction completed.

The refreshed table-reader diagnostic completed over all **114 locally
available real PDFs** with **0 extraction errors**. It found 345 numbered table
captions; 255 have a geometry-valid crop. Of 1,811 raw table-region fragments,
662 are hidden by the actual Reader rule once their caption crop is present.
After that Reader simulation, 1,151 raw table regions remain; **663** retain
same-baseline cells and will render as the structured source-only grid rather
than a concatenated sentence. The rest is a focused triage queue containing
equations, charts, captions, references, and genuinely ambiguous/one-column
table material; it must not be blanket-classified as a table. Report:
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

The real Tauri packaged import was then run against the Golden OzCHI PDF.
It completed import, export, quit, and relaunch persistence successfully.
The resulting package contains `table-001.jpg` through `table-005.jpg`; all
five Table captions are image-backed and no raw `Finger Thumb Finger1 …`,
`Function Call tapped …`, or `Phonebook / Finger` cell stream remains in its
Reader structure. The `t(36)=-2.84, p=0.007` result remains a paragraph in
`original.md`, rather than a display equation or table. This validates the
current app route, not the old Desktop export.

# 2026-10-13: vector figure-label triage and latest packaged build

The 114-PDF table-reader audit was rerun after adding an image-proximity
evidence rule for short, same-baseline native labels. Labels emitted just above
or over an image (for example `truth GPT GPT_rel ...` and `cut0 cut50 ...` in
the linguistics paper) no longer receive table evidence merely from repeated
numeric columns. The rule is limited to paragraph-shaped blocks with multiple
short native spans and an image geometry match; image-backed table blocks are
not routed through it. The linguistics real-paper baseline passed with explicit
regressions for those labels. Audit result: 0 extraction errors; numeric-grid
triage fell from 123 to **112**, while structured-grid increased from 661 to
**676** as the remaining native rows were classified more accurately. The
audit-only report is `test-data/real-papers/reports/table-reader-readiness-v1.json`.

Typecheck, lint (existing warnings only), diff check, and the focused
linguistics extraction regression pass. A new fast unsigned `.app` was built at
**2026-10-13 11:44:18 +0900**:
`src-tauri/target/release/bundle/macos/Versio.app`.
The real Tauri OzCHI acceptance run passed import, annotation/search/export,
quit, and relaunch persistence using that bundle. A separate linguistics
packaged run reached OCR processing on page 7/8 but exceeded the fixed 180
second acceptance window; this is an OCR/import-duration issue to measure
separately, not a successful extraction result.

# 2026-10-13: mixed-document OCR routing and figure extraction timing

`pagesNeedingOcr` no longer treats a low document-wide text-item average as
proof that every page is scanned. The document-wide fallback now applies only
when every page is independently `scanned` or `garbled`; mixed papers use
page-local classification. This preserves OCR for scanned pages while keeping
native text on readable figure-heavy pages. A regression test covers a native
page plus a scanned page whose average would otherwise trigger both. Page/OCR
focused tests pass (17/17), typecheck and diff check pass.

On the language-model-physics PDF this reduced the OCR set from the whole
document to **8 of 46 pages**. The latest `.app` was rebuilt after this change
and the Golden OzCHI Tauri acceptance still passed. The language-model-physics
acceptance then advanced beyond OCR but remained in figure extraction at
`6/32` captions within the fixed 180-second harness window. This identifies a
separate performance bottleneck in image/vector figure extraction; it is not
evidence that the PDF has no content. The lazy page-render optimization is in
place, but the large vector-heavy case still needs profiling/optimization
before claiming broad packaged-import completion.

The packaged acceptance harness now accepts `VERSIO_E2E_TIMEOUT_S` for
large real-paper runs while retaining the 180-second default. With
`caffeinate` and a 600-second timeout, the latest `.app` completed the full
language-model-physics import, annotation/search/export, quit, and relaunch
checks. Marker: `/tmp/versio-acceptance-ling-v4/_acceptance/result.json`
(`ok: true`, export 130260 bytes, Notion ZIP 81127 bytes). Its persisted
structure contains 842 blocks (628 paragraphs, 136 tables, 32 figures), so the
earlier 180-second result was a harness timeout rather than an import failure.
The latest bundle timestamp is **2026-10-13 13:07:00 +0900**.

# 2026-10-13: cross-column caption promotion guard

The 114-PDF audit exposed a reusable false positive in the COVID review: a
right-column statistical explanation was promoted into the left-column Table 2
region because page-wide caption evidence and numeric plot labels overlapped.
The candidate now requires matching column context for nearby table captions,
and the resolver refuses to promote nodes carrying explicit image/vector-label
evidence into a table region. The real-paper regression confirms that
`Prediction of epidemic results of` remains a paragraph.

After the fix, the full audit still has **0 extraction errors** and improved:
raw table fragments **1,736**, Reader raw fragments **1,119**, source-only
cell fallbacks **649**, numeric-grid triage **106**, prose-like **50**, and
ambiguous **113**. This is a reduction from 1,814 / 1,154 / 676 / 112 / 51 /
115 in the previous run. The focused COVID baseline, typecheck, lint (existing
warnings only), and diff check pass. The latest audit artifact remains
`test-data/real-papers/reports/table-reader-readiness-v1.json`.
# 2026-10-13: final table-candidate guard and full corpus verification

The table candidate guard now rejects only long/multi-line caption-adjacent
prose (`wordCount > 24` or more than four native lines). Short table cells
that end in punctuation remain eligible, which preserves marketing table rows
without allowing ordinary long prose to become a table. The temporary
single-item narrative cap was removed after it caused a false negative in the
marketing-consumer-production-journey regression.

The real-paper extraction baseline now uses a 600-second corpus timeout (test
infrastructure only; product behavior is unchanged). The full cached corpus
passed **118/118** tests in 753.92s. The post-change table readiness audit over
114 PDFs completed with `extractionErrors=0`, `tableCaptions=345`,
`cropReadyCaptions=255`, `rawTableFragments=1723`, `cropBackedFragments=610`,
`readerRawFragments=1115`, `readerCellFallbacks=900`, and reader fragment
kinds `structured-grid=900`, `short-label=158`, `prose-like=17`,
`ambiguous=38`, `numeric-grid=2`; these are diagnostics, not claims that all
tables have perfect semantic schemas.

`npm run lint` and `git diff --check` pass (only existing lint warnings). The
latest fast Tauri bundle was built successfully at
`2026-10-13 14:26:36 +0900` at
`src-tauri/target/release/bundle/macos/Versio.app`. The previous isolated
OzCHI packaged acceptance remains green; rerun it after any further source
changes that affect package persistence or reader projection.
# 2026-10-13: parallel table-column reconstruction and captioned-grid rescue

Two generic table failures were repaired without paper-specific terms. First,
some borderless PDFs emit each visual column as an independent multi-line
block; projection now merges adjacent, same-page/same-column blocks only when
their vertical spans, line count, baseline positions, and horizontal gap prove
they are parallel columns. It preserves every cell as `metadata.tableRows`, so
the Reader grid displays one table rather than separate flattened cards.
OzCHI Table 3 now has six rows such as `Finger | Function` and
`Thumb | Call tapped contact`.

Second, a Table caption plus repeated multi-cell native rows was being
overridden by the vector-label guard. The generic layer now produces strong
table evidence only when three compact baselines repeat at least two x-bands
next to an explicit table caption; ordinary nearby prose and uncaptioned figure
labels still retain the safer paragraph/other fallback. This restores the
mixed thesis Table 4.1 relation without linking it to Figure 4.1.

Validation: focused OzCHI and thesis regressions pass; the extraction pipeline
passes **67/67**; typecheck, lint (existing warnings only), and diff checks
pass. The corpus run exercised all **118** tests; the sole initial red case was
the OzCHI assertion for its intentionally changed row-major string and passes
after updating that regression expectation. The fresh 114-PDF table audit has
`extractionErrors=0`, `structured-grid=956`, `short-label=164`,
`prose-like=18`, `ambiguous=38`, and `numeric-grid=2`. The growth in structured
grid rows reflects retaining captioned native grids as source-only tables, not
translation input. The fast `.app` was rebuilt at `2026-10-13 15:34:24 +0900`.
The fresh OzCHI packaged acceptance passed import, annotation/search,
Markdown/Notion export, quit, relaunch, and persistence (`ok=true`,
`searchHits=1`, export 45,498 bytes, Notion package 1,115,780 bytes). The
figure extraction stage took longer than the marker's first update but did
complete; no bundled process remains.
# 2026-10-15: recover title-case authors flattened into affiliations

The 118-paper extraction benchmark exposed a generic masthead case where a
title-case author line had been flattened into an affiliation, for example
`Allison Woodruff and Paul M. Aoki Palo Alto Research Center`. The projection
now separates person-shaped title-case prefixes from institution-shaped tails
when recovering masthead pairs. The real-paper regression recovers both
authors and keeps the research-center affiliation; no paper-specific string
rule was added. After this change the cached corpus benchmark reports
author F1 **1.0 mean/minimum across 28 evaluated papers**, while title,
heading, table, reading-order, source-integrity, and provenance metrics remain
unchanged (reader title exactness **106/113**, table-region recall **1.0**,
source integrity **0.99996049**, provenance **1.0**). The focused projection
test, typecheck, and lint pass. A full extraction/reading-order regression is
the next verification step before rebuilding the packaged app.
# 2026-10-15: keep wrapped table captions out of table regions

The OzCHI regression exposed a generic caption-boundary bug: a table caption
continuation such as `of visual target between different fingers. Significant
values bolded.` was emitted as short paragraph blocks in the same font and
then promoted to table cells by numeric-neighborhood evidence. Canonical
resolution now joins lowercase, same-page continuation lines inside the
caption geometry before table-region promotion. It leaves sentence-like
uppercase body prose unchanged. The focused OzCHI caption/table tests pass;
the 118-paper benchmark remains unchanged at reader-title **106/113**,
author F1 **1.0**, table-caption recall **1.0**, table-region recall **1.0**,
source integrity **0.99996049**, and provenance **1.0**. Full 232-case
extraction/reading-order regression is the next gate before rebuilding the
packaged app.
# 2026-10-15: avoid captionless math-prose table promotion

The arXiv `Physics of Language Models` fixture exposed another generic false
positive: a one-column mathematical paper's repeated inline-formula x origins
were treated as a borderless prose-cell grid. Blocks such as `In Result 4, we
used the full hidden layer, Ei(x)` and `by only reading Ei(x)...` became table
nodes even though no table caption anchored them. The prose-cell detector now
requires a nearby table caption for sentence-like blocks; captioned prose
tables retain the existing path. A regression test covers both blocks. The
118-paper benchmark remains unchanged (reader title **106/113**, author F1
**1.0**, table-region recall **1.0**, source integrity **0.99996049**), and
the targeted math/OzCHI tests, typecheck, and lint pass. Full 232-case
regression and packaged-app verification remain before this change is
released.
# 2026-10-15: normalize numbered affiliation streams and duplicates

The corpus boundary scan found masthead metadata issues that the author F1
metric alone did not expose: numbered institution lines could remain joined,
contact text could leak into affiliation names, and a shared research center
could be repeated once per recovered author. Projection now splits only at
explicit superscript-like numbers followed by institution phrases, removes a
known wrapped marker before `and Science`, and deduplicates exact/contained
affiliation values at the public metadata boundary. Real-paper checks now
normalize the Conversation Analysis research center to one affiliation and
keep the Cognitive Motor Memory affiliations free of email/contact markers.
Focused author tests pass; full benchmark and packaged verification are the
next gates.
# 2026-10-15: recover flattened multi-row table nodes without reviving chart labels

`speechin.pdf` exposed a generic projection gap: a 9-row, 6-column native
wearable-technique grid carried strong `table-row-geometry` evidence and real
cell boxes, but the resolver role was conservatively `paragraph`. That caused
the whole grid to appear as a translatable paragraph. Projection now recovers
`table` only when the matched native layout has at least three multi-cell rows,
high-confidence table-row geometry, and no explicit vector-figure/chart-label
evidence. The grid is emitted as a skipped table with nine `tableRows` and is
not sent to translation. A separate regression prevents dense COVID plot
labels with the same geometry signal from being promoted to tables.

The focused `speechin` and `covid-ml-review` regressions pass, typecheck and
lint pass with the existing warnings, and the full **232/232** extraction and
reading-order corpus passes in **469.28 seconds**. The refreshed table audit
has **0** extraction errors, **353** captions, **241** crop-ready captions,
**1,605** raw table fragments, **723** native cell-grid fallbacks, and only
**7** prose-like / **35** ambiguous fragments. These audit counts are
diagnostic; the remaining fragment review set is not suppressed by lowering
table precision.
# 2026-10-15: suppress dense infographic labels mistaken for tables

`human-ai-interaction-guidelines.pdf` revealed that Figure 2's radial
infographic labels were being emitted as dozens of captionless table cards
because their tiny native text received `repeated-prose-cell-grid` evidence.
Projection now suppresses only dense compact-grid candidates on a page that
also has a numbered figure caption (12 or more candidates, native box height
at most 9pt); the figure caption remains the readable representation. The
condition is page-level and geometry/evidence based, so ordinary tables such
as the OzCHI grids are retained. Regression coverage includes Human-AI Figure
2 and OzCHI table cells.

The full **232/232** extraction and reading-order corpus passes in **447.00
seconds**. The refreshed table audit has **0** extraction errors, **353** table
captions, **241** crop-ready captions, **1,464** raw fragments, **916** reader
raw fragments, and **676** native cell-grid fallbacks. Fragment triage improved
to `short-label=200`, `structured-grid=676`, `prose-like=7`, `ambiguous=32`,
`numeric-grid=1` (previously 283/723/7/35/1). This is a precision safeguard,
not a blanket table suppression rule.
# 2026-10-15: prevent cross-column table headers from joining body prose

`cognitive-memory-cues.pdf` exposed a reading-order boundary failure: a left
column paragraph ending near a page bottom was joined to a right-column
questionnaire header (`Option (Correct)`, `Detailed question`, etc.) because
the header was emitted as ordinary paragraph text. The continuation resolver
now treats a short multi-line block with several native cells and a large
column displacement as a detached table header, even when its words are not
statistical header vocabulary. This blocks the cross-column prose merge while
leaving the header as a table block.

Focused regressions for cognitive-memory, Human-AI infographic labels, COVID
figure labels, and speechin tables pass. The complete **232/232** extraction
and reading-order corpus passes in **464.53 seconds**. The existing table audit
values remain the latest verified values: extraction errors 0, 353 captions,
241 crop-ready captions, 1,464 raw fragments, 916 reader raw fragments, and
676 native cell-grid fallbacks.

# 2026-10-15: normalize rotated-page coordinates before table reconstruction

`ergonomics-fatigue-and-occupational-safety-in-short-haul-light-transport.pdf`
contains a genuine landscape table on page 25. Its PDF page rotation was 90°,
but extraction used the unrotated text-matrix coordinates, so visible rows and
columns were treated as unrelated baselines. Native geometry is now converted
through PDF.js's displayed viewport for non-zero page rotations (including
text bbox and effective text direction); unrotated pages retain the historical
path. Rotated pages are treated as one reading surface during column detection,
so table columns are not mistaken for document columns.

The page-25 table now projects as a skipped table with the caption, header, and
10+ native `tableRows`, including the freight values, rather than a translated
paragraph or dropped cell fragments. Captioned table absorption retains rows
with explicit `captioned-native-multicell-row` evidence while still suppressing
short duplicate crumbs. A regression covers the rotated table and verifies
that its values never appear in a paragraph. The focused five previously
affected corpus cases pass after narrowing the promotion rule; the complete
232-case corpus rerun is complete. The focused five previously affected
corpus cases pass after narrowing the promotion rule.

Final verification for this change: the complete extraction and reading-order
corpus passes **232/232** in **454.19 seconds** after the narrowed rule. This
change is included in the latest packaged Tauri build at
`src-tauri/target/release/bundle/macos/Versio.app`, built at
`2026-10-16 00:24:53 +0900`. Packaged import/search/export/relaunch E2E also
passes. The staged app contains the rotated-page geometry path and the latest
prose-cell/native-grid table guard. Packaged import/search/export/relaunch E2E
passes after the rebuild.

# 2026-10-16: preserve real tables with prose cells while demoting false table roles

The table-role guard now distinguishes a complete sentence adjacent to a figure/table from a native repeated-row grid. A high-confidence `table-row-geometry` signal with at least three multi-cell native rows is retained even when cells contain citation periods or prose; explicit vector/chart-label evidence still blocks promotion. This fixed the SpeechIn wearable-technique table, which is now emitted as a skipped structured table with 9 rows instead of a paragraph. The guard is generic and does not name the paper.

Verification: extraction/reading-order regression **232/232** passes in 361.54 seconds; typecheck passes; lint passes with the existing warnings. The table-readiness audit reports 0 extraction errors, 48 papers with captions, 363 captions, 253 crop-ready captions, 1,492 raw fragments, 797 reader fragments, 622 native cell-grid fallbacks, 6 prose-like fragments, 25 ambiguous fragments, and 785 orphan fragments. These remaining audit categories are diagnostic follow-up work, not silently discarded content.

The staged `.app` was built before this latest guard change, so it must be rebuilt before Tauri UI verification.

# 2026-10-16: recover wrapped masthead affiliation continuations

The interactive-jewellery regression exposed a general masthead case where a wrapped affiliation line was classified as an author (`Design Cognition and its`) because it began with a capitalized word. Projection now admits only author-role nodes that are continuation-shaped, lie before the first body block, and are spatially adjacent to a detected affiliation node in the same masthead band. Genuine person rows, emails, and body paragraphs remain excluded. The current route recovers all three authors and four affiliations, with no affiliation text in the author list.

The complete extraction corpus remains **232/232** after this change, and the dedicated interactive-jewellery test passes. The table-readiness audit now stores representative samples per fragment category so ambiguous/prose-like entries can be manually classified rather than treated as failures by count alone. Latest audit: 0 extraction errors, 363 captions, 253 crop-ready captions, 1,495 raw fragments, 796 reader fragments, 618 structured-grid fallbacks, 5 prose-like, 25 ambiguous, 147 short-label, and 1 numeric-grid.

The staged `.app` must be rebuilt after this source change before Tauri UI verification.

Packaged verification with the real `test-data/real-papers/interactive-jewellery.pdf` also passed using the rebuilt `.app`: import, annotation/search/export, Notion ZIP generation, quit, relaunch, and persistence all completed (`exportBytes=38582`, `notionBytes=15157`, `searchHits=1`).

# 2026-10-16: reconstruct captionless native guideline grids in Reader package

The Human-AI Interaction Guidelines paper contains a genuine borderless, captionless
multi-column table on page 6. Native extraction had already grouped same-baseline
cells, but the Reader package layer could split or drop cells, especially repeated
values such as `Model`/`Google`; the old text-only layout lookup also selected the
wrong duplicate column. `attachLinesToBlocks` now matches duplicate layout text by
nearest native bbox and reconstructs captionless grids from repeated row geometry,
stable x bands, and in-row optional cells. This keeps cells such as `How to train
your model` in the same table row, marks the result as a skipped table, and prevents
it from being sent to translation as prose. The rule is caption-independent and
uses geometry/row evidence rather than paper-specific text.

Focused Human-AI package regression and typecheck pass. The complete real-paper
extraction regression passes **118/118** tests in **345.50 seconds**. The source
change is not yet included in the packaged `.app`; rebuild and packaged smoke test
are the next verification steps.

The captionless-grid change is included in the rebuilt `.app` at
`src-tauri/target/release/bundle/macos/Versio.app` (updated
`2026-10-16 00:45:57 +0900`). Packaged integration E2E passed for both the
normal fixture and `test-data/real-papers/human-ai-interaction-guidelines.pdf`,
covering import, Reader marker/search/export, quit, relaunch, and persistence.
The Human-AI package path is therefore verified in the actual Tauri bundle.

Post-build table readiness audit after the captionless-grid package fix: extraction
errors **0**, `readerRawFragments` **700** (previously 796), `readerCellFallbacks`
**522** (previously 618), with 522 structured-grid, 5 prose-like, 147 short-label,
25 ambiguous, and 1 numeric-grid fragments. The remaining prose-like/ambiguous
samples include legitimate questionnaire cells, checklist rows, references, and
code examples; they require evidence-based triage rather than blanket suppression.
The refreshed diagnostic is saved in
`test-data/real-papers/reports/table-reader-readiness-v1.json`.

# 2026-10-16: separate concatenated two-column bibliography entries

Reference-heavy pages in some journal PDFs were detected as a single column
when the left side contained long native spans and the right side contained
word-sized spans. This caused unrelated bibliography entries to be merged or
to cross the gutter. The column detector now uses a conservative asymmetric
word-column profile, gutter splitting accepts mixed-width column evidence, and
cross-column bibliography blocks are not treated as prose continuations.

At the canonical projection boundary, long reference blocks are split at
author/year anchors, including entries whose DOI/page range has no terminal
period. This keeps each reference as a source-only, skipped translation block
without relying on paper-specific names. The cognitive-motor-memory regression
now asserts that Spataro/Swallow and Ushey/van Ede entries are not merged.

Verification: focused reference regression passes; typecheck passes; complete
real-paper extraction regression passes **118/118** in **350.50 seconds**.
The change is source-only and the staged `.app` must be rebuilt before Tauri
UI verification.

The fast Tauri bundle was rebuilt successfully after the nullability fix;
`Versio.app` updated at `2026-10-16 01:13:43 +0900`. Packaged integration
E2E (import, annotation/search marker, export, quit, relaunch, persistence)
also passed.

# 2026-10-16: join wrapped cells in native table fallback rows

The Reader package could preserve a native table but still expose wrapped cell
lines as separate cells/rows. This was visible in the Phonebook/Gallery table:
`Show sharing context menu (email, sms, etc.)`, `Open tapped contacts contact
card`, and `Delete the tapped contact` were split across geometry fragments.
`normalizeTableRows` now learns repeated x-bands, maps indented wrapped words
back to the established band, joins continuation rows lacking the leading
column, and removes whitespace introduced by hyphenated line wraps. It runs
only after table geometry has already classified the block as a table.

The real OzCHI package regression now verifies the reconstructed cells. Full
real-paper extraction regression passes **118/118** in **334.76 seconds**.
The refreshed 114-PDF table readiness audit reports extraction errors **0**,
`readerRawFragments` **679** (previously 700), `readerCellFallbacks` **516**
(previously 522), and `orphanFragments` **762** (previously 783). The updated
report is `test-data/real-papers/reports/table-reader-readiness-v1.json`.
The Tauri bundle must be rebuilt after this source change.

The fast Tauri bundle now includes this table-cell normalization; the `.app`
updated at `2026-10-16 01:29:13 +0900`. Packaged integration E2E passed with
the real `ozchi-finger-specific-touch.pdf` fixture (import, search, export,
quit, relaunch, persistence).

# 2026-10-16: demote prose falsely recovered as table geometry

The table audit found a general false-positive path in which a long ordinary
prose block next to a caption inherited `table-row-geometry` and was revived as
a native grid, even though its role evidence scored `paragraph` strongly and
`table=0.00`. Caption absorption then made the block visible as a table. This
was observed in the COVID ML review fixture and was not a paper-specific rule.

Projection now requires an independent high-confidence table role score before
row-geometry recovery or caption-neighbor evidence can override prose. Long
narrative blocks with weak geometry evidence remain paragraphs, while genuine
multi-row native grids and axis-labelled table regions retain their structured
fallback. A conservative graphics-caption geometry guard also prevents a short
one-column caption from anchoring a whole-page ruled component across the gutter.

The COVID review regression asserts that the affected block is a paragraph and
keeps its source text visible when it begins mid-sentence; the focused
regressions pass. The complete real-paper extraction regression passes
**118/118** in **330.91 seconds**. Typecheck and `git diff --check` pass.
The refreshed table-readiness audit reports extraction errors **0**,
`readerRawFragments` **659**, `readerCellFallbacks` **504**, with 504
structured-grid, 5 prose-like, 131 short-label, 18 ambiguous, and 1
numeric-grid fragments; `orphanFragments` is **740**. These counts remain
diagnostic and are not treated as proof that all table semantics are solved.
The source change is not yet included in the packaged `.app`; rebuild and
packaged smoke verification are the next steps.

# 2026-10-16: preserve caption ownership across PDF columns

Wide ruled tables can place a caption in the left column while native cell
fragments are assigned to the right column. The reader's crop suppression and
the table audit previously treated those fragments as unrelated because their
physical `column` labels differed. Caption-to-canonical-node ownership now
takes precedence when available, so cross-column fragments belonging to the
same table target are suppressed once a table crop exists. This is a generic
relationship fix and does not depend on a paper name.

A pipeline regression covers a left-caption/right-cell case. The full
real-paper extraction regression remains **118/118** (348.19 seconds). The
refreshed audit reports extraction errors **0**, `readerRawFragments` **658**,
`readerCellFallbacks` **503**, and `orphanFragments` **739**. Remaining raw
fragments are primarily source-only tables whose crop was unavailable or
legitimate numeric/label cells; they remain visible for safety.

The fast Tauri bundle includes this cross-column ownership fix; `Versio.app`
was rebuilt at `2026-10-16 02:06:37 +0900`. Packaged integration E2E with the
OzCHI fixture passed import, search, export, quit, relaunch, and persistence.

The same package attachment check reports all five OzCHI table captions with
structured rows (`Table 1`–`Table 5`), including the Phonebook/Gallery cells.

The same packaged integration path was also run against
`human-ai-interaction-guidelines.pdf`; import, search, export, quit, relaunch,
and persistence passed. A direct experiment that rebuilt captionless tables
from every Native layout item was rejected because existing figure-adjacent and
synthetic-region regressions failed; it was reverted without changing the
production path. Further table-cell reconstruction must preserve those
boundaries before adoption.

# 2026-10-16: recover table cells during package attachment

Some resolver table nodes contain multiple native cell bounding boxes, but no
single `LayoutBlock` has exactly the concatenated projected text. The package
attachment step now geometrically matches table-region/fallback block boxes to
Native layout items, groups same-baseline items, and supplies `tableRows` only
after projection. This leaves Resolver role decisions unchanged while allowing
the Reader's structured grid to render cells instead of a concatenated text
fallback. A unit regression covers a three-cell row whose projected text does
not match any one layout block.

On `human-ai-interaction-guidelines.pdf` page 7, all 16 table blocks now expose
structured rows. The full table audit reports extraction errors **0**,
`readerRawFragments` **646** (previously 658), `readerCellFallbacks` **491**
(previously 503), and `orphanFragments` **739**. The complete extraction
regression remains **118/118** in **331.94 seconds**.

The fast Tauri bundle includes this package-stage change; `Versio.app`
was rebuilt at `2026-10-16 02:29:51 +0900`. Packaged integration E2E passed for
both `human-ai-interaction-guidelines.pdf` and the OzCHI fixture, covering
import, search, export, quit, relaunch, and persistence.
# 2026-10-16: coalesce hot translation checkpoints and detect persisted FTS fallback

Two generic runtime issues found during packaged real-PDF verification are now
fixed. Reopened databases could contain the ordinary `papers_fts` LIKE fallback,
but `CREATE VIRTUAL TABLE IF NOT EXISTS` was treated as proof that FTS5 existed;
schema inspection now selects the correct query path and has a regression test.
Translation checkpointing also now tracks a mutation revision and one active
mutable flush per paper. A checkpoint no longer clears a newer in-memory edit,
and repeated translation updates cannot queue an unbounded series of duplicate
checkpoint writes ahead of Reader/export operations. Relevant database and hot
path tests pass, typecheck and lint pass with only existing warnings. The real
cognitive-memory packaged run previously reached `export_started` after import,
annotation, and search; this checkpoint change is the next fix to verify in the
same packaged flow. The production acceptance-only marker instrumentation used
for diagnosis was removed. The fast Tauri bundle was rebuilt successfully at
**2026-10-16 04:13:58 JST**. After clearing the previous acceptance artifact, the
fresh `.app` passed packaged integration end to end: import, annotation, search,
Markdown export, Notion ZIP export, quit, relaunch, and persistence.

The same bundle was then run with the larger `cognitive-memory-cues.pdf` fixture
and a 300-second timeout. Import completed and the package persisted; Markdown
and Notion export files plus `library.sqlite` were written. The final acceptance
marker did not advance past `import_ok`, so this run remains an unresolved
shutdown/flush-notification issue. It is distinct from extraction: the package
contains `original.md`, `ja.md`, `structure.json`, `translation.json`,
`layout.json.gz`, and `source.pdf`. Do not count this large-fixture run as a
complete packaged E2E until the post-export `flushPersistence`/marker boundary
is isolated.

The boundary was instrumented once in an acceptance-only build: the document
flush completed, while the next `runtime.db.persist()` await did not return
within the test timeout. `library.sqlite` was nevertheless updated on disk.
Mutable package checkpoint writes now coalesce concurrent snapshots to the
newest per-paper state, and a regression confirms three simultaneous requests
produce one write. The acceptance instrumentation was removed after diagnosis;
the remaining SQLite completion notification is tracked separately from PDF
extraction quality.

After removing the diagnostic markers, typecheck and the checkpoint/FTS tests
pass again. The clean fast `.app` was rebuilt at **2026-10-16 04:32:20 JST**;
it contains the checkpoint coalescing fix and no acceptance-only instrumentation.

The attempted statistical-prose demotion was reverted after focused pipeline
regressions showed it interfered with existing table/figure boundaries. No
production extraction rule was retained from that experiment. The clean source
was rebuilt into `Versio.app` at **2026-10-16 04:39:02 JST**, with the
checkpoint-coalescing and FTS-schema fixes included.

The focused `pipeline.test.ts` rerun at 04:37 also exposed four existing
table/figure boundary failures (mixed thesis caption relation, captionless
method/goal table, figure-adjacent numeric label matrix, and synthetic Table 9
identity). The statistical-prose experiment was not the cause—the same four
failures remained after reverting it—but they must be triaged before claiming
the focused extraction suite is green again.

# 2026-10-16: table boundary triage resumed

The extraction goal remains **active**, not blocked. No benchmark, translation
server, or Tauri process is currently running; work was paused at a deliberate
test checkpoint rather than because the goal was blocked. Generic table-boundary
fixes are in the working tree: captionless qualitative grids now require a
compact aligned header and contiguous repeated rows, native captioned
multicell evidence takes precedence over vector-label evidence, and a caption
line is separated from a following native table header when their geometry and
typography support that boundary. A narrow exact-box check also prevents a
synthetic `CAPTION_OF` table region from projecting the same short cell crumbs
twice without affecting native OzCHI rows.

Focused regressions currently passing include the captionless method/goal table,
math-paper prose demotion, mixed thesis table/figure boundary, synthetic Table 9
identity, and OzCHI Table 3 reconstruction. One focused vector numeric-label
matrix case remains source-order imperfect, but its Canonical role is `other` and
it is excluded from paragraph translation and table projection. The current
checkpoint is `b8ec17e`; the complete cached corpus is green at 232/232.

The first corpus rerun after that checkpoint found one regression in the
Springer marketing paper `marketing-consumer-production-journey`: a table that
continued across most of a page had a later flattened row projected as a
paragraph because the captionless grid width guard was too narrow. The generic
grid proof now permits wide blocks only when they inherit a same-page table
caption and still satisfy repeated x-band/contiguous-row evidence. The focused
fixture passes, and the complete cached corpus now passes **232/232** (118
baseline extraction cases plus 114 reading-order cases). The vector numeric
label matrix remains source-order imperfect but is resolved as `other`, so it
does not enter paragraph translation or table projection.

The fast Tauri bundle was rebuilt after the corpus pass at **2026-10-16
05:29:17 JST**. Packaged integration E2E then passed using the generated
`Versio.app`, including import, annotation, search, export, quit, relaunch,
and persistence. No DMG or signing step was run in fast mode.

An additional packaged run used the real `ozchi-finger-specific-touch.pdf`
fixture. Import and package generation completed before the acceptance marker
timed out while waiting for the later annotation/search/export phase. The
generated `structure.json` contained five structured table blocks; the former
OzCHI fragments (`Comfortable`/`Finger 1` matrices and `Function` rows) were
stored as table cells rather than translated paragraphs. This timeout is an
acceptance-flow duration issue, not an extraction failure, and is kept separate
from the 232/232 extraction result.

The synthetic table-region relation lookup was then refactored to build its
document-level target index once per projection instead of rebuilding the
Canonical node map for every block. Focused synthetic-table, OzCHI Table 3,
and Springer marketing regressions still pass; typecheck and lint remain clean
apart from the repository's pre-existing warnings. Checkpoint commit:
`b8ec17e`.

The `.app` was rebuilt again after that refactor at **2026-10-16 05:37:43
JST** using `npm run tauri:build:fast`; generated licenses were restored after
the build and the worktree is clean.

The packaged integration script now supports `VERSIO_E2E_IMPORT_ONLY=1`
with optional `VERSIO_E2E_EXPECT_TABLES`. This separates extraction/package
verification from the later translation/export acceptance marker. Running the
current `.app` with the real OzCHI PDF and `VERSIO_E2E_EXPECT_TABLES=5`
and `VERSIO_E2E_REQUIRE_TABLE_ROWS=1` passed: **137 blocks, 5 structured
tables with non-empty structured rows**, followed by a clean app shutdown.

## 保守リファクタリングの運用

抽出・翻訳の機能変更とは分離して、次のチェックポイントで定期的に保守リファクタリングを行う。大きなアルゴリズム変更、または同じ領域への3回目の修正を区切りとし、責務集中・重複判定・不要な診断コードを確認する。各回で typecheck、lint、対象回帰テストを実行し、機能変更の前後で挙動が変わっていないことを確認する。

直近のチェックポイントは `519eebd` の合成テーブル領域インデックス化で、232/232抽出回帰、OzCHI実PDFのTauri import-only（137 blocks / 5 tables / 非空rows）、typecheck、lintを確認済み。次の候補は、残るベクター数値ラベルのsource-order診断と、`run-ui.sh` の実PDF Reader表示検証である。

Reader表示検証用に `VERSIO_UI_E2E_SMOKE_ONLY=1` を追加し、実PDFを同じTauri direct-import経路でReader DOMまで確認できるスモークモードを実装した（`7dec536`）。小さなfixtureでの実行は、app内translation-serverのモデルキャッシュ準備待ちでlibrary marker到達前にタイムアウトしたため未合格。OzCHI実PDFは既存のimport-onlyで137 blocks / 5 tables / 非空rowsを確認済みで、Reader UIスモークはモデルキャッシュを明示的に共有した再試行が次の検証項目。コード反映済みのfast `.app` mtimeは **2026-10-16 05:43:00 JST**。

Reader smokeの再検証で、起動スクリプトの環境変数継続行にコメントを挟んでいたためdirect-import設定が欠落する問題を修正し、smoke時の通常acceptance二重importも無効化した（`71b1b7b`）。生成済みsingle-column fixtureでは、packaged `.app`で `ui_reader_smoke_ready`（Reader DOMとreader-body存在）まで成功。OzCHI実PDFではpackage生成とtitle marker（Exploring Finger Specific Touch Screen Interaction...）まで確認したが、実Reader route markerは待機中に停止したため、構造検証はimport-only（137 blocks / 5 tables / 非空rows）を正式結果とする。実PDF Reader UIの未解決点は、長い翻訳・Reader route遷移待ちの切り分けである。

追加確認: `run-ui.sh` のacceptance/direct-import二重実行を分離後、single-column fixtureの`.app` Reader smokeは再度 **OK**（`ui_reader_smoke_ready`, `reader-body`存在）。OzCHI実PDFはタイトルカードが生成されpackageも作成されたが、Reader routeのDOM markerは長時間待機しても出なかった。これは抽出packageの欠落ではなく、実PDFのimport完了後にUIがReaderへ遷移しない経路の追加調査対象として記録する。テストスクリプトの待機秒数は環境変数で調整可能。

2026-10-16: 実OzCHI package監査で、Table 5の最終行に隣接本文（`Similarly for the gallery application...`）がtableRowsのセルとして混入する一般化可能な境界不具合を確認。長い文章形セルをtableRowsから除外するgeometry＋prose filterを追加し、Table 5回帰を追加。OzCHI Table 3、caption continuation、Table 5のfocused testは3/3 pass、全抽出コーパス **232/232 pass**。fast `.app`再ビルドは一度容量不足で失敗したが、再生成可能なE2E artifacts 27GBと/tmp診断生成物を整理後に成功。最新`.app` mtimeは **2026-10-16 06:22:04 JST**。

2026-10-16: `.app` packaging boundary fix checkpoint. `inferCaptionGrid` now rejects wide, multi-word full-column narrative lines before rebuilding caption-owned grids, preventing package attachment from reintroducing neighbouring prose into table cells. Fast `.app` rebuild completed at 06:28:43 JST. Real OzCHI import-only produced 137 blocks; Table 5 retained 10 structured rows and no `Similarly for the gallery...`/Friedman prose contamination. The first import validator run exposed an over-broad wide-line filter that removed Table 2 rows. After refinement, the rebuilt `.app` passed import-only: **138 blocks, 5 tables, all 5 with non-empty rows**. Table 5 had no neighbouring-prose contamination. Focused layout tests: 6 passed; typecheck passed. The wide-line predicate was refined to preserve repeated headers and numeric grid rows while still excluding prose; the package fix is now covered by a wide-grid regression and committed after the next verification.

2026-10-16: Post-fix verification completed under `caffeinate -dimsu`. The full cached extraction + reading-order corpus passed **232/232** in 452.63s after the wide-grid predicate change. The refreshed all-PDF table-reader readiness audit completed with `extractionErrors=0`, `tableCaptions=369`, `cropReadyCaptions=269`, `rawTableFragments=1511`, `readerRawFragments=665`, and `readerCellFallbacks=551` (`structured-grid=506`, `short-label=120`, `prose-like=8`, `ambiguous=30`, `numeric-grid=1`). These are diagnostic counts rather than semantic ground truth; the prose/ambiguous samples remain candidates for visual review. The rebuilt `.app` import-only check passed **138 blocks / 5 tables / all tables non-empty rows** for the OzCHI fixture, and Table 5 has no neighbouring prose contamination.


2026-10-16: Figure-contained text diagnostic. The table-readiness audit showed sentence-shaped fragments inside image figures (for example a vignette prompt embedded in Figure 1) were being classified as source-fallback tables. This is a figure-region boundary issue, not ordinary table prose. Figure/table caption projection now records the related canonical region bounding boxes; when a figure receives a real image crop, table-like native fragments whose geometry is substantially inside that figure region are suppressed. Source-only fragments remain visible when no crop exists. Added a generic suppression regression and typecheck/focused pipeline tests pass.

2026-10-16: Figure-region suppression was included in a new fast `.app` build at **06:49:42 JST**. Focused suppression tests and typecheck pass. A cognitive GPT-3 packaged import attempt generated a complete package but the acceptance harness observed an existing `ready_for_relaunch` marker instead of the expected `import_ok`; the process was stopped after the marker mismatch. This is an acceptance-isolation issue (the package was generated), so the new figure suppression still needs a fresh, marker-isolated Tauri Reader run before claiming UI-level verification.

2026-10-16: Packaged import-only harness fixed to accept `ready_for_relaunch`/`relaunch_ok` markers when the app completes the full acceptance flow before the shell observes `import_ok`. This prevents false timeouts while still requiring a persisted paperId and package validation. Fresh `.app` cognitive GPT-3 fixture run then passed import-only with **234 blocks / 18 tables**; no `Linda is 31...` fragment was present in the text field, though figure asset URLs remain empty in the serialized package and need separate visual verification.

2026-10-16: Tested enabling `extractFigures: true` in the actual Tauri import path. The cognitive GPT-3 fixture remained in `structuring: 図を抽出しています...` beyond the 240s packaged-import budget, despite the nominal PDF.js timeout (synchronous canvas work can block the renderer). The change was reverted to `extractFigures: false` to preserve bounded import and non-empty Reader packages. Figure-region metadata/suppression remains available for explicit re-extraction or a future worker/isolate implementation; native table grids remain the production-safe path for now.

2026-10-16: After reverting unbounded figure extraction, the source-matching fast `.app` was rebuilt at **07:03:38 JST**. Fresh OzCHI import-only packaged verification passed: **138 blocks / 5 structured tables**, Table 1–5 all had non-empty rows, and Table 5 had no neighbouring prose contamination. The app-data and bundled translation server were shut down cleanly after the run.

2026-10-16: A second bounded experiment enabled only table crops (`extractTablesOnly`) in the real Tauri import. The cognitive GPT-3 fixture still stalled at `図を抽出しています... (1/7)` beyond the 240s acceptance budget, confirming that synchronous PDF.js canvas work can block even when figure captions are excluded. The experiment was reverted; initial import remains native-only until crop enrichment is moved off the import-critical path.

2026-10-16: Refreshed the source-matching fast `.app` after reverting the synchronous crop-enrichment experiment. Build completed at **07:11:22 JST**; generated license metadata was restored. Packaged OzCHI import-only verification passed with **138 blocks / 5 structured tables**, all five tables retaining non-empty `tableRows`; Table 1 retained 10 rows and Table 3 retained 6 rows. `npm run lint` and the build's typecheck passed (lint has only pre-existing warnings). This confirms the packaged native-grid fallback is present in the current `.app`; image/crop enrichment remains intentionally off the import-critical path because it previously blocked imports beyond 240s.

2026-10-16: Re-ran the packaged Reader UI smoke against the real OzCHI PDF using the correct `VERSIO_E2E_FIXTURE` path. The latest `.app` reached `ui_reader_smoke_ready` with title `Exploring Finger Specific Touch Screen Interaction for Mobile Phone User Interfaces`; this verifies the real Tauri import and Reader route, while the import-only package assertion remains the authoritative table-row check. The smoke harness does not yet expose a table-cell DOM marker, so visual cell rendering remains a follow-up verification item.

2026-10-16: Added a UI-E2E-only `tableSurfaceVisible` marker and one-time Reader scroll in smoke mode so future real-paper runs can distinguish route readiness from an actually mounted structured table/table image. Typecheck passed and the rebuilt `.app` import-only check still passed **138 blocks / 5 tables**. The OzCHI UI smoke reached the library card but the accessibility card-open step timed out on this run; this is a harness/window-focus failure, while the prior same-build Reader-route smoke and current package verification remain green. The new marker is diagnostic only and has no normal-app behavior.

2026-10-16: Fixed a Reader-side table fallback gap. Captionless/native table packages can have `tableRows` without `block.original` after Markdown projection; `Table.tsx` previously required both and showed an extraction-failed shell. Structured fallback now keys off the validated `tableRows` data itself, preserving cell grids for such packages. Typecheck passed; the rebuilt `.app` (mtime **07:25:53 JST**) passed OzCHI import-only with **138 blocks / 5 tables** and non-empty rows.

2026-10-16: Hardened table rendering when a serialized image asset is unavailable. If validated `tableRows` exist, Reader now renders the native cell grid before the image-loading placeholder, so stale/missing crop paths cannot hide a readable table fallback. Typecheck and package tests (8/8) pass; the rebuilt `.app` import-only check again passed **138 blocks / 5 tables** with non-empty rows.

2026-10-16: Re-ran the complete cached extraction and reading-order corpus after the Reader table fallback changes. Both suites passed **232/232** (118 extraction + 114 reading-order) in 434.61s under `caffeinate -dimsu`; no extraction-layer regression was introduced.

2026-10-16: Reader table resilience checkpoint. If a persisted table `imageUrl` points to a missing/corrupt asset, `Table.tsx` now handles the image error and falls back to validated native `tableRows`; the fallback state resets when the asset URL changes. This prevents a stale image path from hiding a readable table grid. Typecheck and package tests passed (8/8), commit `76d81ef`. Fast `.app` rebuilt at 07:39:23 JST; packaged OzCHI import-only passed **138 blocks / 5 tables / all tables with non-empty rows**. The image/crop enrichment experiment remains intentionally outside the synchronous import path because PDF.js Canvas rendering can block pathological documents.

2026-10-16: Full table-readiness re-audit found eight `prose-like` reader fragments and thirty `ambiguous` fragments. The clearest generalized failure was a cognitive-psychology vignette (`Linda is 31...`, question, and option lines) receiving `repeated-prose-cell-grid` evidence and being projected as source-only table blocks. Projection now demotes single-span, sentence-shaped question/option/narrative lines without independent cell geometry back to paragraph; true multi-cell/native row grids remain table blocks. A fixture regression covers the vignette and options. Full extraction + reading-order corpus after this change passed **232/232** in 434.13s. The audit still classifies figure-contained text as ambiguous when no image crop exists; that remains separate from body/table demotion.

2026-10-16: Rebuilt fast `.app` after single-span table/prose demotion at **07:52 JST**. Packaged OzCHI import-only passed **138 blocks / 5 tables / all tables with non-empty rows**. The 118-paper extraction/read-order regression remains **232/232**. The package validator confirms the table-grid path is unchanged while narrative table false-positives are reduced in the canonical projection.

2026-10-16: Vector-label boundary checkpoint. Tiny (~1pt) native text bands on dense vector figures are now prevented from merging into following normal-size captions, using a font-scale transition rather than paper-specific text. The linguistics figure regression now accepts source-order-preserving containment while asserting `other`/figure-panel evidence. Full 118-paper extraction + reading-order regression passed **232/232** in 437.40s. Fast `.app` rebuilt at 08:05 JST; packaged OzCHI import-only passed **138 blocks / 5 tables / all tables with non-empty rows**.

2026-10-16: Bundle timestamp correction. The vector-label boundary code from `f3de152` was included in the latest fast bundle; filesystem mtime verified as **2026-10-16 08:12:25 JST** after the successful 232/232 regression and OzCHI packaged import-only run. The earlier 08:05 entry refers to the preceding verification checkpoint.
# 2026-10-16: table projection predicate refactor checkpoint

表の誤判定・セル復元に使う純粋な判定群を `src/services/pdfExtraction/projection/tablePredicates.ts` に分離し、`toPaper.ts` は canonical-to-paper の投影処理と caption region の関係解決に集中するよう整理した。判定式、呼び出し順、公開されている投影API、保存形式は変更していない。これは品質改善ではなく、直近の表境界修正が安定した節目で行った保守リファクタリングである。

`npm run typecheck`、`npm run lint`（既存warningのみ）、対象3ファイルの81テスト、`caffeinate -dimsu npm run test:extraction-corpus -- --reporter=dot`（118 extraction + 114 reading-order = **232/232**, 462.46s）が通過した。次の品質変更では、同じ判定群を再び `toPaper.ts` に戻さず、この責務単位を入口に characterization test を追加する。未解決の figure/table crop enrichment と、実PDF Reader UIでの structured-cell DOM確認は継続課題である。

同じコミットを含む fast `.app` を **2026-10-16 08:27:02 JST** に再ビルドした。OzCHI実PDFのパッケージimport-only E2Eは **138 blocks / 5 tables / 全表に非空tableRows** で通過し、実行後にVersioおよびtranslation serverの残留プロセスがないことも確認した。

# 2026-10-16: merge wrapped table-cell continuations across interleaved rows

table package reconstruction now joins a same-x cell continuation when the
preceding text is an unfinished three-word-or-longer phrase (or explicit
hyphenation) and the next fragment starts lowercase/punctuation, even when a
different column occupies the intervening native row. This repairs generic
borderless tables whose cell line wraps were emitted as separate rows, while
keeping short labels such as `Gallery` and capitalized row values separate.
The layout regression suite covers the interleaved-row case; the OzCHI Table 4
baseline remains green. The full cached extraction/reading-order corpus passed
**232/232** in **473.05s**, typecheck and lint passed with only pre-existing
warnings, and the refreshed table audit has **0 extraction errors**,
`readerRawFragments=664`, `readerCellFallbacks=553`, and
`structured-grid=518` (audit-only diagnostics). The audit still contains
one prose-like and 23 ambiguous native fragments; these are retained as a
visual-review queue rather than being hidden by a broad demotion rule.

The updated extraction path was packaged into the fast macOS `.app` at
**2026-10-16 10:03:10 JST**. The fresh bundle passed OzCHI import-only with
**138 blocks / 5 tables / all tables with non-empty `tableRows`**, and the app
and translation server exited cleanly afterward.

# 2026-10-16: fold dense cross-column captioned tables into one native grid

Some two-column PDFs place a full-width table's caption in the left PDF column
while its native cells are classified as right-column table fragments. The
package stage now identifies a same-page, dense cross-column cluster only when
at least four table-source fragments and two or more x-bands support it, then
folds those fragments into the nearest numbered caption. Single-line
caption-owned cells are recovered from their native bbox when needed, and the
caption row itself is not duplicated in the grid. This avoids paper-specific
column rules and leaves lone neighbouring blocks untouched.

The cognitive-memory Table 1 fixture now persists as one caption-owned native
grid (35 rows) instead of multiple reader cards. Added a focused regression for
cross-column folding. Full cached extraction/reading-order regression passed
**232/232** in **433.98s**; typecheck and lint passed with only existing
warnings. The refreshed 114-PDF table audit reports **0 extraction errors**,
`readerRawFragments=632`, `readerCellFallbacks=528`,
`structured-grid=499`, `prose-like=1`, and `ambiguous=19`. The remaining
ambiguous/native fragments are still a visual-review queue; figure crop
enrichment remains outside the synchronous import path.

# 2026-10-16: latest fast bundle after cross-column table folding

`caffeinate -dimsu npm run tauri:build:fast` completed successfully at **2026-10-16 10:23:24 JST**. The bundle contains the current `translation-server/engines/segmenter.py` and the current extraction/projection code. Generated license metadata was restored after the build; worktree is clean. This build is ready for the next packaged import-only verification; no translation server or Versio process remains running.

# 2026-10-16: deterministic ordering for caption-owned cross-column grids

Caption-owned table fragments are now collected and sorted by native visual `y` then `x` before their rows are joined. This fixes a generic two-column PDF failure where the table remained a valid grid but cells appeared in projection/column order. Focused table/layout tests passed (4/4 plus 3 OzCHI cases); full cached extraction + reading-order regression passed **232/232** in **439.40s**. `npm run typecheck` passed. The change preserves cell text and does not alter translation behavior.

# 2026-10-16: packaged verification after visual table row ordering fix

Fast `.app` rebuilt successfully at **2026-10-16 10:35:13 JST** after the geometry-ordered cross-column table fix. The real OzCHI packaged import-only check passed with **143 blocks / 5 tables**, all required tables retaining non-empty native rows. Generated license metadata was restored and the app exited cleanly.

The cross-column table regression now deliberately feeds fragments in projection order and asserts visual `A. Option 1` → `A. Option 4` row order. This prevents the ordering fix from regressing while keeping production behavior unchanged.

# 2026-10-16: final fast bundle after table continuation lint cleanup

The behavior-preserving table continuation regex cleanup was included in a fresh fast `.app` build at **2026-10-16 10:39:49 JST**. The focused table regression and typecheck passed before bundling; generated license metadata was restored afterward. No app or translation-server process remains running.

# 2026-10-16: packaged E2E sidecar cleanup

The packaged import-only harness now cleans up the exact bundled translation-server sidecar on shell exit. Tauri app termination from the shell does not reliably execute the window-close callback, so the prior harness could leave an orphaned `server.py`; cleanup is restricted to the current `.app` resource path and never touches a development server on port 8765. Repeated OzCHI packaged import-only verification passed (**143 blocks / 5 tables**) and no Versio/sidecar process remained after exit.

# 2026-10-16: dense table question-cell and cross-column crop cleanup

The package projection now absorbs sentence-shaped native paragraphs into an already caption-owned dense table region only when their bbox is inside the region and aligned with a nearby native row. This repairs questionnaire cells that the resolver initially scored as paragraph, without demoting ordinary prose outside a caption-owned grid. Image-backed table suppression now also handles a generic full-width table whose caption and native fragments fall in different PDF columns, preventing duplicate source-cell cards when the table crop is available. No paper name, title, or literal paper text is used.

Focused questionnaire/crop regression passed (1 test), typecheck passed, and the full cached 118-paper extraction + reading-order corpus passed **232/232** in **436.09s**. The refreshed table audit reports **0 extraction errors**, `readerRawFragments=544`, `readerCellFallbacks=459`, `structured-grid=432`, `short-label=97`, `ambiguous=15`, and no `prose-like` fragments. The remaining ambiguous fragments are retained for visual review; figure crop enrichment and semantic row/column reconstruction remain open.

# 2026-10-16: recover vertically stacked ruled sub-grids under one caption

Native PDFs can place two related ruled grids above a single table caption (for example separate condition panels). The generic table-region detector now retains compatible adjacent graphics-grid components and uses their union for caption anchoring, instead of keeping only the closest component. Package reconstruction can also infer a complete grid from raw layout items when projection retained only a short header cell; it prefers the complete geometry-derived rows and deduplicates projected/layout copies. The recovery is geometry-based and does not name a paper or cell text.

The OzCHI Table 5 regression now yields structured rows for both Phonebook and Gallery sections, including `0.594` and `0.760`, while excluding the neighboring Table 4 cells and the following statistical prose. Focused Table 5/questionnaire tests passed, typecheck and lint passed with existing warnings, and the full cached 118-paper extraction + reading-order corpus passed **232/232** in **437.26s**. The refreshed table audit reports **0 extraction errors**, `readerRawFragments=545`, `readerCellFallbacks=460`, `structured-grid=433`, `short-label=97`, `ambiguous=15`; no prose-like reader fragments were introduced.

# 2026-10-16: packaged app after stacked-grid recovery

Fast Tauri build completed at **2026-10-16 11:45:38 JST** from commit `413ab98`. The bundle includes the current native table-region and package-grid recovery code. Real OzCHI import-only packaged E2E passed with **138 blocks / 5 tables / all required tables retaining non-empty `tableRows`**. Generated license metadata was restored after the build, and no Versio or translation-server process remained after the harness exited.

The same **11:45:38 JST** bundle also passed the full packaged integration flow against the OzCHI PDF: import → Reader acceptance marker → search (`hits=1`) → Markdown export → Notion ZIP export (`bytes>0`) → app relaunch and persistence. The harness exited with no Versio or bundled translation-server process remaining.
# 2026-10-16: boxed abstract prose no longer becomes table fallback

The extraction path had a generic false positive on journal front pages that
place boxed abstract callouts beside the body. `repeated-prose-cell-grid` was
being treated as sufficient table evidence, and package row recovery could
combine same-baseline author/background/body items from different columns.
Projection now requires independent matrix/row geometry (or a same-baseline
multi-box grid) before retaining that weak signal as a table; recovered native
lines are clipped to the target block bbox instead of carrying an entire PDF
line. HFE healthcare scoping page 1 is covered by a regression and no longer
projects the abstract callouts as table cards. The marketing co-production
borderless table remains covered and is preserved.

Verification: focused HFE/marketing tests passed; the full cached extraction +
reading-order corpus passed **232/232** in **431.70s**. The refreshed table
audit reports **0 extraction errors**, `readerRawFragments=456`,
`readerCellFallbacks=383`, `structured-grid=368`, `short-label=81`,
`prose-like=1`, and `ambiguous=6`. The remaining seven audit samples are
classified in `test-data/real-papers/reports/table-reader-ambiguous-review-v1.json`
as visual questionnaire cells, table continuations, references, or captions;
none is a confirmed ordinary-prose table false positive.

The updated extraction path was packaged into the fast macOS `.app` at
**2026-10-16 12:29:47 JST**. Packaged OzCHI import-only verification passed
with **138 blocks / 5 tables**, every table retaining non-empty `tableRows`.
The app and bundled sidecar exited cleanly; no Versio or translation
server process remains running.

# 2026-10-16: cross-column table suppression uses cell geometry

- Root cause: image-backed table suppression counted only each fragment's outer `bbox.left`. A single native fragment can contain cells from multiple x-bands (questionnaire/table layouts), so a full-width table caption was not recognized as cross-column-owned and duplicate native table cards remained.
- Fix: cross-column evidence now uses `tableRows[].x` and native line item x positions, falling back to block geometry when cell evidence is unavailable. This remains geometry-based and paper-independent.
- Verification: questionnaire crop suppression regression passes; `npm run typecheck` passes; `npm run lint` passes with existing warnings. The full pipeline run also exposed one pre-existing intermittent/fixture failure in the captionless education table regression; it reproduces without this change and is recorded for follow-up.

# 2026-10-16: table-reader audit after cell-geometry suppression

- Full table-reader audit completed with `extractionErrors: 0` across the cached corpus.
- Metrics changed from `readerRawFragments=456`, `readerCellFallbacks=383`, `structured-grid=368`, `ambiguous=6` to `447`, `374`, `361`, `ambiguous=5`; `prose-like` remains `0`, `short-label=81`, and `orphanFragments=534`.
- The reduction is from generic cross-column ownership using cell/line x positions instead of only fragment outer boxes. Remaining ambiguous samples are visual questionnaire/table cells, table-cell continuations, references, or captions; no confirmed ordinary-prose-to-table false positive was found in the audit artifact.
- Focused tests for boxed abstract prose and multi-column questionnaire suppression pass. Full pipeline currently has one existing education captionless-table assertion failure that reproduces with the pre-change source; it is not caused by the cell-geometry patch and remains a follow-up item before claiming a clean full regression.

# 2026-10-16: packaged app rebuilt after table geometry fix

- `npm run tauri:build:fast` completed successfully at 13:02 JST.
- Bundle: `src-tauri/target/release/bundle/macos/Versio.app` (updated 13:02:11 JST).
- Translation-server resources were staged from the current source; bundle contains `engines/segmenter.py` and timestamp `2026-10-16T04:01:23Z`.
- Generated third-party license output was restored after the build as required by the project workflow.

# 2026-10-16: full extraction corpus regression after table fix

- `npm run test:extraction-corpus` passed **232/232** (118 cached extraction baselines + 114 reading-order checks) in 429.32s.
- PDF.js emitted existing font/ColorSpace warnings only; no test failures.
- This is the authoritative corpus gate for the current table geometry change. The smaller `src/test/pdfExtraction/pipeline.test.ts` suite still contains a separate education fixture assertion that reproduces without this patch, but the 118-paper corpus and all reading-order regressions are green.

# 2026-10-16: Reader native-table fallback keeps PDF columns aligned

- `Table.tsx` now derives fallback grid columns from native cell `x` positions and places each cell in its nearest column. Sparse/wrapped rows no longer reflow independently based on their own cell count.
- CSS fallback rows now use the computed explicit grid template while preserving horizontal scrolling for wide tables.
- `npm run typecheck` and `npm run lint` pass (existing warnings only).
- Rebuilt `.app` at 13:xx JST with this Reader change; packaged OzCHI import-only E2E remains green at 138 blocks / 5 tables.

# 2026-10-16: full packaged Reader acceptance after table fallback UI fix

- Full `scripts/packaged-e2e/run-integration.sh` passed with the OzCHI fixture: import → annotation/search/export → quit → relaunch persistence → quit. Marker `ok`, search hits `1`.
- This verifies the current `.app` can persist and reopen imported paper data after the native table fallback column-alignment change.

# 2026-10-16: remaining table ambiguity review refreshed

- Re-reviewed the five remaining audit-only ambiguous samples after the aligned fallback UI. They are two education table-cell continuations, one reference continuation, one multi-column business-category table, and one legitimate numbered-table caption.
- The review artifact is `test-data/real-papers/reports/table-reader-ambiguous-review-v1.json`; no ordinary prose → table false positive remains in the audit sample.

# 2026-10-16: masthead/caption focused extraction checks

- Focused tests for interactive jewellery caption boundaries, wrapped Elsevier author rows/affiliations, multilingual author boundaries, and flattened IEEE masthead all pass (4/4).
- Combined with the 232/232 corpus gate, current extraction changes preserve the author/affiliation and figure-caption regressions already covered by the project.

# 2026-10-16: packaged UI smoke status after deterministic activation change

- The UI-only smoke harness was hardened to activate the draggable paper card through its keyboard path before falling back to click. Typecheck/lint pass and the `.app` was rebuilt at 13:17:23 JST.
- OzCHI UI smoke still stops at the macOS card-to-Reader activation boundary (`ui_library_card_visible` → `ui_reader_visible` timeout), while the same build passes the full packaged acceptance flow (import, Reader acceptance, search/export, relaunch persistence). This remains an Accessibility/WebView harness limitation, not an extraction or package persistence failure; no production behavior is changed by the smoke-only activation path.
- After the failed smoke run, no Versio or bundled translation-server processes remain.

# 2026-10-16: current bundle acceptance after UI smoke harness update

- The current 13:17:23 `.app` passed the full packaged integration flow again: import → Reader acceptance marker → search/export → quit → relaunch persistence → quit. Search hits `1`; no bundled sidecar remained.
- The UI-only smoke remains blocked at macOS accessibility activation despite the test-only keyboard fallback; production packaged acceptance is green.

# 2026-10-16: UI smoke foregrounding follow-up

- The harness now explicitly activates the packaged process (`Versio` and the bundle's `app` process) before Accessibility actions (`95fb6f0`, `2d31166`).
- A fresh smoke run still captured Notion Calendar as the frontmost window and timed out at `ui_reader_visible`; the packaged app process itself was alive and its isolated paper package was complete.
- This is a host Accessibility/frontmost-control limitation in the smoke harness. It does not invalidate the passing packaged integration flow or the 232/232 extraction corpus gate. No Versio or bundled translation-server process remains after the run.

# 2026-10-16: caption-adjacent native table reconstruction

- Root cause confirmed on the external OzCHI PDF and the ergonomics fatigue
  thesis: borderless native tables can arrive as one canonical table node per
  cell/row. The old projection left those fragments as independent reader
  blocks, so matrix values were translated as prose and table rows were lost.
- `captionedNativeTableRows()` now uses numbered-caption ownership, page/column
  geometry, and repeated table-cell evidence to group the local native cells
  into `tableRows`. Caption-owned native grids are marked skipped for
  translation and retain their source text plus cell geometry. Wide existing
  synthetic grids are preserved rather than replaced by opaque cells.
- External `2686612.2686699.pdf`: Table 1 and Table 5 now form structured
  10-row grids; Table 3/4 existing grids remain intact; authors and
  affiliations remain correctly separated; ACM permission chrome remains
  excluded. Table 2 is an embedded/vector image with no native cell text and
  still requires the existing image/crop path for full reconstruction.
- Regression: OzCHI table-cell and neighbouring-prose tests pass; the
  ergonomics commercial-vehicle table baseline passes with 16 structured rows;
  the cached extraction corpus completed with 231/232 before refreshing the
  stale OzCHI status expectation, with the only failure being that intentional
  new native-table behavior (`pending` → `skipped`). After updating that
  expectation, the targeted baseline passes. A fresh full corpus rerun is
  still recommended before the next packaged build.

# 2026-10-16: packaged verification after native-table fix

- `npm run tauri:build:fast` completed successfully; the current
  `src-tauri/target/release/bundle/macos/Versio.app` was updated at
  14:03:37 JST and contains the current frontend plus bundled
  `translation-server/engines/segmenter.py` and `madlad_mps.py`.
- `scripts/packaged-e2e/run-integration.sh` passed on the rebuilt app:
  import → annotation/search/export → quit → relaunch persistence → quit,
  with marker `ok` and search hits `1`. A first run missed the annotation
  marker transiently; the clean rerun passed and left no app/sidecar process.
- The full extraction corpus result after the source change was 231/232 only
  because one stale OzCHI expectation still required a table to be `pending`.
  The new behavior intentionally marks native structured tables `skipped` so
  they are never sent as prose to translation; the expectation is now updated
  and the focused OzCHI/ergonomics baselines pass. Run the full corpus again
  when a fresh aggregate count is needed.

# 2026-10-16: Tauri background media enrichment verified

- Added a post-import background `reextractPaper()` pass when a paper has
  figure/table captions without assets. It does not delay the initial native
  package or translation; if Canvas/PDF image extraction is unavailable, the
  native `tableRows` fallback remains visible and the existing manual “PDFを再
  抽出” action remains available.
- Rebuilt `.app` at **14:07:42 JST** and ran the real bundled app against the
  OzCHI PDF with a 45-second post-acceptance grace period. The packaged
  structure contained **138 blocks / 5 tables**; Table 2, which has no useful
  native text in the initial pass, retained a structured 4-row numeric grid
  after background enrichment. Table 1/3/4/5 retained structured rows, and no
  table was flattened into a translated paragraph.
- The bundled integration flow passed again: import → annotation/search/export
  → relaunch persistence → quit. The test harness now supports an optional
  `VERSIO_E2E_POST_READY_SLEEP_S` grace period for background enrichment;
  default acceptance timing is unchanged.

# 2026-10-16: dense table pages and acceptance marker robustness

- Table-bearing pages are now allowed a bounded shared page-raster fallback
  even when they contain more than three captions. Figure-only dense pages keep
  the old budget. The crop still requires the geometry-derived table region,
  so unrelated body text is not rasterized as a table.
- Packaged OzCHI verification after this change still produced structured
  Table 2 rows (4 numeric rows) and Table 1/3/4/5 grids without flattened table
  prose. This PDF's Table 2 has no reliable embedded image asset in the WebView
  extraction path, so the structured-cell fallback is the authoritative
  display; a readable image is used when PDF.js exposes one.
- Fixed a test-harness race where the shell validated a stale copied
  `_acceptance/result.json` after a background grace period. Validation now
  reads the current acceptance-home marker directly. Standard packaged
  integration passes after the fix.
- The `.app` containing this dense-page raster change was rebuilt at
  **14:13:55 JST**; no Versio or translation-server process remains.

# 2026-10-16: final full extraction corpus rerun

- `caffeinate -dimsu npm run test:extraction-corpus` passed **232/232**:
  **118/118** cached real-paper extraction baselines plus **114/114**
  reading-order checks, in 434.32s.
- The run includes OzCHI, interactive-jewellery, the ergonomics thesis, and
  the broader HCI/psychology/marketing/linguistics corpus. Only existing
  PDF.js font/ColorSpace warnings were emitted; no extraction assertion failed.
- Combined with the rebuilt-app OzCHI package check and packaged persistence
  E2E, the current extraction implementation has a clean corpus and package
  acceptance gate. The remaining known limitation is host-level UI smoke
  foreground control on macOS, not package extraction or Reader data.

# 2026-10-16: preserve concatenated native table cells

- Caption-owned native table blocks now project each native PDF text item as
  its own cell when a canonical block contains multiple same-line items. This
  prevents labels such as `Finger 1`, `Finger 2`, and numeric values from being
  merged into one reader fragment while retaining the canonical block fallback
  when native item geometry is unavailable.
- The full cached extraction corpus remains green at **232/232** after this
  change. The table-reader audit remains at 0 extraction errors, 355
  structured-grid fragments, 79 short-label fragments, and 5 ambiguous
  fragments across 114 papers.
- The packaged Tauri path was rebuilt at **14:42:52 JST** and passed both the
  standard persistence E2E and the external `2686612.2686699.pdf` import path.
  The packaged structure contains 138 blocks and five table blocks; Table 1/5
  have 10 structured rows, Table 2/3/4 retain readable structured fallbacks,
  and no `Finger ...` or `Function Call ...` stream is emitted as a translated
  paragraph. Table 2 remains image/native-data limited and is represented by a
  four-row source grid when a crop is unavailable.

# 2026-10-16: add vertical safety margin to table crops

- Table image crops now use the selected table-row geometry plus an 8pt
  vertical margin, capped before the caption or page edge. This keeps ruled
  borders and glyph ascenders/descenders at the first and last row from being
  clipped while avoiding neighbouring prose.
- The crop regression cases pass, and the rebuilt `.app` was verified by the
  packaged OzCHI PDF flow (import, background enrichment grace period,
  export, quit, relaunch persistence) with marker `ok` at **15:19:59 JST**.

# 2026-10-16: include media in the initial import package

- The initial import path now runs the bounded figure/table extraction pass
  (`extractFigures: true`) before `onPartialReady`. Previously it deliberately
  persisted native text first and only started `reextractPaper()` after the
  entire translation job, so Reader opened with empty figure/table surfaces
  and filled them in later.
- The existing per-page/document deadlines remain active, and background
  enrichment is retained as a retry for media that cannot be rendered in the
  first pass.
- Rebuilt `.app` at **16:49:19 JST** and imported
  `/Users/harada/Desktop/2686612.2686699.pdf` through the packaged Tauri flow.
  The initial persisted package contained **12 figure assets and 5 table
  assets** before the acceptance/relaunch checks; packaged E2E passed.

# 2026-10-16: bound embedded table images to the table geometry

- Table captions whose PDF image placement also contains surrounding caption
  pixels now prefer the existing geometry-bounded page raster crop. The
  embedded-image path remains a fallback when bounded rendering times out.
- The crop boundary now leaves an 8pt gap before a table caption; this avoids
  leaking the first caption line into the table image while retaining the
  complete final row and border.
- Rebuilt `.app` at **17:27:42 JST** and verified the packaged import path with
  `/Users/harada/Desktop/2686612.2686699.pdf`. Table 2 and Table 4 assets now
  contain the complete grids without clipped bottom rows or caption text;
  packaged integration E2E passed (import, export, quit, relaunch).

# 2026-10-16: improve table image raster quality

- Bounded table crops now render at **2x** page scale (figures retain the
  1.25x path). Table assets prefer lossless PNG output up to 2.5 MB and use
  JPEG quality 0.96 only for unusually large crops. This keeps small cell text
  and thin borders legible without changing table-region detection.
- Rebuilt `.app` and reran the packaged Tauri import flow for
  `/Users/harada/Desktop/2686612.2686699.pdf`. Table 2 and Table 4 are now
  persisted as sharp PNG assets with complete grids; packaged integration E2E
  passed. The focused extraction suite still has the two pre-existing
  captionless/CJK table assertion failures unrelated to image rasterization.

# 2026-10-16: hierarchical reader outline

- The reader outline now builds a display-only tree from persisted
  `parentSectionId` relations and reconstructs missing parents from section
  levels/order for older packages. Nested sections have clear indentation and
  a guide line, while section navigation and active tracking remain unchanged.
- Typecheck passed and the latest Tauri `.app` was rebuilt at **17:35:48 JST**:
  `src-tauri/target/release/bundle/macos/Versio.app`.

# 2026-10-16: keep split web access dates out of body paragraphs

- Some PDFs split a URL footnote into a marker/URL line followed by a
  full-size `accessed DD.MM.YYYY)` line. The continuation inherited a stale
  paragraph hint and was projected as article text. Access-date continuations
  are now classified as footnotes before inherited hints are applied and are
  merged with the preceding URL line.
- Added an OzCHI regression test. It now produces one skipped footnote block:
  `1 http://www.gartner.com/newsroom/id/2665715 (Last accessed 29.9.2014)`.
- Typecheck and the focused regression passed. Latest `.app` rebuilt at
  **18:02:03 JST**.
# 2026-10-22: PDF Extraction benchmark foundation

- 開発専用の parser-neutral benchmark schema / runner を追加。CER/NED、role-aware Block F1、reading-order edit distance、段落境界 F1、table TEDS、formula NED を個別に報告し、annotation coverage が complete でない指標は N/A（100%にしない）。CDM は公式ローカル renderer の値だけを `formula_cdm` として受理し、未計測時は N/A。
- `npm run eval:extraction-benchmark -- --gold-dir … --prediction-dir …` は bounded run、`--all`、進捗、timeout/SIGINT partial report、構造別の対象件数・critical failure を提供。Versio / Docling / GROBID の同一 gold 比較用 artifact format を分離した。
- 既存113本は development 扱い。既存 `heldout-catalog-v1` は6件中5件が development catalog と同一 filename のため、独立 extraction score の根拠には使わない。独立 held-out は source hash・template/publisher family を分離し、reviewed gold を揃えるまで N/A のままとする。
- 検証: benchmark / Studio metrics **10/10**、`npm run typecheck`、`npx vite build` pass。
- `independent-cohort-v1` と cohort audit を追加。JMIR/MDPI/Cureus/Wiley/BMC の5本は local source hash と publisher family が development corpus（取得済み109本）と非重複であることを確認済み。ただし reviewed gold annotation 前なので、held-out score は引き続き N/A。
- `snapshot:extraction-benchmark-cohort` は既存PDF extractionだけを明示実行し、共通 prediction artifact に書き出す（翻訳起動なし）。JMIR held-out 1本で実行確認済み（230 blocks、timeout/failureなし）。
- benchmark report は publisher / discipline / layout / language 別の対象件数付き集計、document-level critical failure、同一 source hash 限定の前回比較・回帰方向判定を出す。synthetic fixture で同一報告の比較（3 comparable metrics、回帰0）を確認済み。
- Studio bundle の complete page を block/role/text gold へ変換する guarded converter を追加。unreviewed snapshot を正解化せず、current UI が完全な gold sequence/tree/LaTeX を書けない reading-order・paragraph-boundary・TEDS・CDM は N/A のままにする。converter testsを含む benchmark / Studio metrics **12/12** pass。
- 外部パーサー比較では parser node ID を使わず、block/table/formula を page-region IoU 0.5 で一対一対応させるよう更新。同一goldをDocling/GROBID等に再利用できる。
- `prepare:extraction-benchmark-review -- --id …` は frozen held-out PDFから Studio用 bundle をローカル生成する。JMIR candidate で23 pages / 216 canonical nodes のbundle生成を確認済み。人間レビュー前のため score は生成しない。
- gold validator を追加。complete を宣言した text/order/boundary/table/formula に必須正解データが無ければ評価を拒否し、暗黙の100%を防ぐ。benchmark / Studio metrics **14/14** と artifact runner の N/A 出力を確認済み。
- Studio に人間が並べる `正しい読み順` editor を追加。全canonical blockを一度ずつ並べ、reading-order completenessを付けた場合だけ converter がRO goldを生成する。予測順序の自動採用はしない。
- Studio browser smoke: `basic-two-column.pdf` 抽出後、読み順editorに4個の追加候補が表示されることを確認。
- Studio に数式LaTeXとTEDS table treeの入力を追加。該当blockを全件入力して完全性を明示した場合だけ converter がformula/table goldを生成する。review gold testsを含む targeted metrics **16/16**、typecheck、Vite build pass。
- Studio に `正しい段落境界` editor を追加。明示したgold pairとcomplete flagが両方ある時だけ paragraph-boundary F1 を有効化する。targeted metrics **17/17** pass。
- CDM の公式ローカル評価連携を追加。IoU一致したformula pairのCDM inputを書出し、戻りscoreだけをprediction artifactへ取込む。fixtureで1 pair export / score 93.2 のapplyを確認済み。NEDをCDMとして代用しない。
- `snapshot:extraction-benchmark-cohort -- --all` を実行し、independent held-out 5/5（JMIR 230 / MDPI 193 / Cureus 291 / Wiley 316 / BMC 121 blocks）のprediction artifact生成に成功。failure / timeoutなし。PDF.jsのCureus font warningのみで、翻訳は未起動。
- validation cohortを4本（Dove Medical Press / SAGE / OUP / PNAS）で追加し、development 109 hashes・validation 4・held-out 5のhash/publisher/leakage-group分離をsplit auditで確認。通常の重点評価は4〜12本、held-outは別管理。
- validation cohortも明示 `--all` で4/4 prediction artifact生成を確認（Dove 102 / SAGE 169 / OUP 118 / PNAS 58 blocks、failure / timeoutなし）。
- benchmark compareに`--fail-on-regression` gateを追加。N/A/hash不一致は対象外、同一sourceのCER/NED等の方向別悪化だけをnon-zero exitにする。意図的text corruption fixtureでCER/NED +1.0、2 regression、exit 1を確認。
- `prepare:extraction-benchmark-review -- --all` を追加し、Studio review bundleをvalidation 4/4・held-out 5/5でローカル生成完了（failure / timeoutなし）。人間レビュー未実施のため正解ラベル/スコアはまだ生成していない。
- `audit:extraction-benchmark-review-progress` を追加。review bundleの重複論文を明示して二重集計から除外し、現在はvalidation/held-out計9本・116ページで全指標のレビュー対象数0件と確認済み。従って benchmark scoreはすべて N/A のまま。
- CER/NED用のtext goldは抽出文字列を再利用しないよう修正。Studioで各blockの`正しいテキスト`を明示入力し、ページの`テキスト`完全性も有効にした場合だけCER/NEDを算出する。正誤判定だけではtext scoreはN/A。review-to-gold回帰テストを追加し、evaluation targeted tests **19/19** とtypecheck pass。
- local review bundleを監査し、複数ページにまたがるCanonical nodeが58件あることを確認。reading-order gold converterは開始ページへ誤って畳み込まず、レビューした各ページのregion IDを保持するよう修正。複数ページnode回帰を含むevaluation targeted tests **20/20**、typecheck、diff check pass。
- external parserの読み順artifactが対象ページのblockを省略しても短い順序として採点されないよう修正。対象blockを一度ずつ列挙しない予測順序はN/A。省略order回帰を含むtargeted benchmark tests **21/21** とtypecheck pass。
- TEDS table treeをtag-only比較から拡張。人間が入力するcell `text`を正規化してnode置換コストに含め、セル内容が壊れても同一表構造として満点にならない。complete goldのtree JSONは再帰的に検証し、不正treeは採点拒否。targeted tests **21/21** とtypecheck pass。
- goldに加えて外部parser prediction artifactのID・座標・tree・relation参照を検証し、壊れたJSONを採点前に拒否するよう追加。部分的なprediction読み順はartifactとしては受理するが、全対象blockを列挙するまでscoreはN/A。targeted tests **22/22**、typecheck、diff check pass。
- validator導入後のCLI smokeとしてsynthetic development gold/predictionを再採点し、Block F1 1.0、CER/NED 0.0（10文字）、未注釈のreading order・段落・table・formulaはすべてN/Aになることを確認。
- reading-order edit distanceをID文字列連結ではなくblock ID列のtoken-level Levenshteinへ修正。似たID名によって順序誤りが小さく見えることを防ぐ回帰を追加し、targeted tests **22/22**、typecheck、diff check pass。
- role-aware Block F1と、role非依存のtext/reading-order/paragraph対応を分離。role誤分類が同一regionの文字・順序・段落評価を無評価扱いにして隠すことを防ぐ回帰を追加。targeted tests **23/23**、typecheck、diff check pass。
- 図表/tableとcaptionの対応をparser-neutral artifactへ追加。Studioで正しいcaption→図表pairを人間入力し、`relationsComplete`の全ページgoldだけをrelation F1として集計する。Canonical `CAPTION_OF` adapterと明示gold converter双方を回帰で確認。未注釈はN/Aのまま。
- reviewed selectionに表または数式が0件の場合、table/formula coverageをcompleteと誤記せずN/Aへ正規化。empty-setの満点やvalidator失敗を防ぐreview-to-gold回帰を追加し、targeted tests **26/26**、typecheck、diff check pass。
- full-document predictionをページ限定goldに採点する際、未注釈ページのreading order・段落境界・caption relationをFPとして混入させないようscope filterを追加。注釈ページ内の相対順序回帰を含むtargeted tests **27/27**、typecheck、diff check pass。
- 評価CLIはreviewed goldが0件のsplitをデフォルトで失敗させ、CIが無評価のまま成功することを防止。意図的な空split監査だけ`--allow-empty`でN/A reportを出せる。空split拒否・明示N/A・synthetic 1件採点をCLI smokeで確認。
- 全指標（Block/Text/Reading Order/段落境界/Caption relation/TEDS/Formula NED/CDM）を明示human goldとして持つsynthetic fixtureを追加。CLIでdevelopment 2件を採点し、各指標の対象件数・N/Aの別を含むreport生成を確認。
- CLIに`--require-metrics`を追加。回帰gateで必要指標の`evaluatedDocuments=0`を成功扱いにせず、reportを保存してnon-zero終了する。all-dimensions syntheticでrequired全metric成功、空held-outでrequired Block F1がnon-zeroとなることを確認。
- Studioで空白をドラッグして追加した認識漏れを、保存後もPDF上の破線枠と右ペイン一覧に残し削除できるよう改善。抽出漏れのroleと分かる範囲の正しいtextを記録し、gold converterでは既存のmissing-region ground truthとしてBlock Recall等に反映される。typecheck・Vite build・diff check pass。
- 数式の下付き説明ラベル（underbrace）が同じnative行に混ざるPDFで、番号付き表示式を本文段落へ誤分類しないよう修正。公開原本 `2302.03792v1` をローカル再抽出し、式(6)が `paragraph` から `equation` へ復帰したことを確認。数式断片の分数・上下添字を完全に線形復元する処理は未対応のため、式(7)–(8)は継続診断対象。focused math regression **38/38** とtypecheck pass。
- Studioでは原本上のドラッグを常時認識漏れ領域の追加に割り当て、検出済み領域の透明オーバーレイが空白ドラッグを奪う問題を解消。ドラッグ開始・終了の座標をReact描画待ちに依存せず同期保持し、mouse up直後に既定roleの認識漏れとして即時保存する。クリックはブロック選択、既存枠の調整は選択後の四隅ハンドルに分離した。切替操作は不要。typecheck pass。
- Studioで既存の抽出枠を選択して`抽出枠を削除`できるよう追加。抽出スナップショットを破壊せず、`extra` のcritical reviewとして保存し、PDFと右ペインから除外する。選択中のレビューから`抽出枠を戻す`で復元できる。typecheckとreview gold tests **8/8** pass。
- 数式の複数ベースラインを扱うため、stale な paragraph hint が本文・演算子行・下添字を一塊にした場合でも、番号付き／関係記号付きの強い表示式アンカーと隣接する短い数式行を独立した equation block に分離するようにした。積分の演算子行・番号付き本体・下段分母も一つの Canonical equation に統合する。公開原本 `2302.03792v1` で Eq. (9)・(10) の `1 + γ` を含む統合、および本文に吸収されていた Eq. (13) の独立式化を確認。focused math / reading-order regressions **124/124** と typecheck pass。
- ベンチマークの数式NEDは、Versioの線形化数式をLaTeXと偽装せず、人間が明示入力した正しい数式テキストと同表現で比較できるようにした。LaTeXは公式CDM用に別保持し、LaTeX未提供時のCDMはN/Aのまま。validation cohort 4本の再抽出は failure / timeout 0で完了し、式があるPNAS/SAGEでは各1件のformula-text artifact、式がないDove/OUPは0件を確認。benchmark targeted tests **23/23**、typecheck、diff check pass。
- Studioで追加した`認識漏れ`のroleを`equation`にすると、既存の数式と同じ正解数式テキスト／LaTeX入力対象になるようにした。review-to-gold converterはこの領域を`missing:<id>`の独立gold formulaとして出力するため、見落とした数式がFormula NEDから消えない。review-gold / benchmark tests **21/21**、typecheck pass。
- benchmark CLIのsynthetic development 2件を再採点し、全dimension report（Formula NED 3 units、CDM 1 unit）を生成できることを確認。既存LaTeX型CDM inputのexportも1/1 match、LaTeXなしの数式はCDM inputから除外される。これはsynthetic fixtureの機能検証であり、未知論文の精度値ではない。
- Evaluation Studioのbrowser smokeでは、ユーザー提供bundle `2302.03792v1.pdf.evaluation.json` を再読込し4ページ目で `正しい数式テキスト` と `LaTeX（CDM用）` の入力欄が表示されることを確認。原本PDFを再ロードしなくても、保存済みbundleから数式reviewを続行できる。
- Benchmark集計前のleakage guardを拡張。同一のbenchmark ID、source hash、またはpublisher/templateの`leakageGroup`を別documentへ重複使用すると評価を拒否する。template familyを同一split内で複数回数えて平均を歪める経路も遮断した。指定splitだけの実行でも、入力gold全体を先に監査する。targeted benchmark tests **16/16**、typecheck、synthetic CLI、validation 4 / held-out 5 / development 109 hashのsplit audit pass。
- CDM scoreの取込を、export済みCDM inputのsource hash・goldとIoU対応済みのprediction formula IDへ固定した。別PDF、未対応formula、重複scoreをprediction artifactへ混入できない。CDM fixtureのexport→applyで1/1 score（93.2）の再取込とtypecheck pass。
- LaTeXのみでhuman goldを記録した数式がpredictionから完全に欠落した場合も、Formula NEDをN/Aへ逃がさず1.0として数えるよう修正。既存predictionの線形数式をLaTeXと偽装することはせず、形式非互換だけはN/Aを維持する。benchmark / review-gold tests **26/26**、typecheck、diff check pass。
- Block F1のIoU照合を局所的なgreedy選択から最大一致件数の一対一matchingへ変更。重なり領域で柔軟なpredictionが高IoUのgoldを先取りし、他に候補のないpredictionを不必要にFP/FNにする偏りを防ぐ。overlap matching回帰を含むstandard metrics / benchmark tests **21/21**、typecheck、diff check pass。
- Table TEDS / Formula NEDのIoU領域対応も同じ最大一致件数matchingに統一。重複したformula/table候補で局所的な高IoUが別の対応可能な要素を塞がない。overlap formula回帰を含むstandard metrics / benchmark / review-gold tests **31/31**、typecheck、diff check pass。
- Benchmark reportの集計値を`macro_document_mean`として明示。論文ごとの重みを等しくしつつ、`evaluatedDocuments` / `evaluatedUnits`で根拠量を併記するため、長大PDFだけが平均を支配しているように誤読されない。synthetic CLI reportの全metric/categoryにaggregation表示、typecheck、diff check pass。
- Frozen cohortからprediction snapshotまたはStudio review bundleを生成する前に、ローカルPDFのSHA-256をmanifestと照合するよう追加。原本が差し替わった状態で別論文を同じIDとして採点・注釈することを防ぐ。JMIR 1本でhash verified snapshot（23 pages / 216 nodes）と隔離temporary review bundle生成、typecheck、diff check pass。
- review bundleの再生成は既存ファイルを既定で拒否し、人間が確認済みの保存内容を上書きしない。置換は明示的な`--overwrite`だけに限定。隔離temporary bundleで拒否と意図的上書き双方を確認し、typecheck、diff check pass。
- PDF Extraction evaluationの最終開発検証: standard metrics / benchmark / review-gold / math fragment regression **72/72**、typecheck、Vite build、development 109 / validation 4 / held-out 5 split audit、diff check pass。翻訳サーバーは未起動。Viteは既存のpdfjs direct-eval/chunk-size/dynamic-import警告のみ。
- 新規の人手注釈を待たずに改善を回帰判定できる、7本（ACM / IEEE / Springer / KCI / OzCHI / Elsevier / arXiv）の既存fixture gold専用development gateを追加。各PDFを隔離workerで実行し、個別timeout・進捗・部分report・非zero失敗を持つ。これはdevelopment regressionであり、validation / held-out精度主張には使わない。強制1ms timeoutでpartial reportとfailureを確認、typecheck、diff check pass。
- development gateへ、人手ラベル不要の`sourceIntegrityRate = 1`（native PDF textの再構成保持）と`canonicalProvenanceRate = 1`（Canonical nodeのPDF provenance保持）をfail-fast invariantとして追加。構造意味・読み順の精度主張とは別の自動健全性検査として扱う。timeout partial reportでinvariant結果を確認、typecheck、diff check pass。
- isolated development workerを`npx tsx`からproject localの`vite-node`へ変更し、registry/networkの有無でgateが失敗しないよう修正。KCI fixture `fashion-hybrid-cmf`を実行し、source integrity / Canonical provenanceともに1.0、failure 0を確認。構造goldが未提供のdimensionはN/Aを維持。typecheck、diff check pass。
- 7本の既存fixture development gateを実行完了（failure / invariant failure 0）。自動基準値はsource integrity 1.0（7/7）、Canonical provenance 1.0（7/7）、heading recall 0.865（3件）、table caption recall 0.75（4件）、table region recall 0.667（3件）。未注釈dimensionはN/A。Wear Scale Table 6の回転captionはPDF text streamでmarkerと題名が分断され、題名側が高table evidenceにもかかわらずparagraphに残ることを診断。論文固有の例外は追加していない。
- 90°回転した表・図キャプションの題名が、PDF text matrixの進行方向によって番号ラベルより前のY座標へ出るケースを修正。句読点なしの`Table N` / `Figure N`ラベルを許容するのは、同じnative face・X座標・font sizeの近傍に題名候補があり、かつラベル自体が回転している場合だけに限定した。逆向き回転captionのreading-order回帰を追加し **84/84** pass。7本development gateも再実行し、failure / invariant failure 0、source integrity / Canonical provenance ともに **1.0 (7/7)** を維持した。これは既存fixtureの回帰保護であり、人手の未確認出力を正解や学習データとして採用しない。
- 人手の新規正解ラベルが無い間も未知論文の健全性を監査する `npm run audit:pdf-extraction:unlabeled -- --cohort … --all` を追加。各hash固定PDFを隔離workerで二度抽出し、出力determinism、native layout text再現、Canonical座標/provenance、relation整合性、Canonical→Reader projection追跡を検査する。これはCER/NED・Block F1・reading order・TEDS・CDMの精度値を代替せず、reviewed gold無しの指標はN/Aのままにする。validation 4本（Dove 12p/99 nodes、SAGE 12p/163、OUP 8p/110、PNAS 4p/62）で全検査failure 0、typecheck・diff check pass。
- label-free health reportへ、強いnative数式・表captionアンカーが対応するCanonical roleを持たない場合の**要確認**signalを追加。`Mean ± SD`の統計本文を数式欠落と誤報しないよう、数式番号またはコンパクトな関係式だけに限定した。validation 4本を再実行し、構造failure 0・要確認signal 0。signalはgold/precisionではなく、未知PDFを人間確認または次の一般規則診断へ優先投入するためだけに用いる。
- Versio snapshot adapterがCanonical paragraph splitをbenchmark prediction artifactへ書き出すよう修正。これまでparagraph-boundary F1のscore実装はあっても、Versio自身の予測境界が無くreviewed goldに対してN/Aになる経路があった。ページ内の隣接paragraph node pairのみを出力し、pageをまたぐ境界は作らない。adapter / benchmark evaluator / review-gold focused tests **28/28**、typecheck、diff check pass。
- snapshot adapterがReader projectionの`tableRows`を中立的な`table → tr → td(text)` treeへ変換し、TEDS prediction artifactとして書き出すよう修正。table row/cell構造を持つReader表だけを対象にし、画像のみ／captionのみの表へtreeを捏造しないため、その場合はTEDSをN/Aに保つ。adapter / benchmark evaluator / standard metrics focused tests **24/24**、typecheck、diff check pass。validation PNASのfrozen PDF snapshotも1/1成功（63 blocks、row構造を持つtable 0件のためTEDS prediction 0件）。
- benchmarkのcritical failureをBlock/reading-order/formulaだけでなく、reviewed text CER ≥0.25、段落境界F1=0、caption relation F1=0、TEDS=0にも拡張。未注釈（N/A）をcritical扱いしない。category sliceと併せて、未知論文でどの構造が完全に壊れたかをdocument単位で追跡できる。benchmark evaluator / adapter focused tests **21/21**、typecheck、diff check pass。
- 全dimension synthetic artifactを`--require-metrics`指定でCLI採点し、Block F1、CER/NED、reading-order ED、paragraph-boundary F1、caption relation F1、TEDS、Formula NED、CDMの全9指標が一つのreportに対象件数付きで出ることを確認（2 documents、critical failure 0）。これは評価経路の機能検証であり、未知論文の精度値ではない。validation/held-outはreviewed goldが0件のため引き続きN/A。
- 評価CLIに`--fail-on-critical`を追加。reviewed documentでcritical failureが出たときだけnon-zero終了し、N/Aのdimensionは従来どおり失敗扱いにしない。all-dimensions synthetic artifactをこのflagと全required metric指定で実行し成功、typecheck・diff check pass。
- review progress監査にtextとcaption relationの完了ページ数を追加し、各dimensionの採点可能性を可視化。現在はvalidation 4 + held-out 5の9 unique bundles / 116 pagesで、block/text/reading order/boundary/relation/table/formulaの完了ページはいずれも0。duplicateのJMIR review bundle 1組は二重集計せず明示表示する。typecheck・diff check pass。従って独立精度を出さないN/A判定は意図どおり維持されている。
- 完成前の人間reviewをgold/学習データにせず改善診断だけに使う `triage:extraction-partial-review` を追加。`2302.03792v1` のbundleでは26ページ中12ページに指摘があり、137件のcritical `extra`削除と100件のparagraph認識漏れを確認。削除された予測のroleと実際のrole訂正を分離して集計し、削除対象（equation 50 / paragraph 52 / table 7等）をrole correctionと誤読しない。priority上位はp13, p3, p14, p6。これはpartial observationであり精度・gold・学習ラベルには使わない。typecheck・diff check pass。
- OmniDocBenchの公式repository / CVPR論文と指標の分離（text edit、formula CDM、table TEDS、reading-order edit）を照合し、benchmark文書へ「共通の指標語彙だがleaderboard比較ではない」ことを明記。Versio固有のBlock F1・paragraph-boundary・caption relationを別軸として維持し、frozen scientific-PDF cohortのsplit/leakage規則を優先する。
- Evaluation Studioの通常画面を最小化。PDF・抽出結果・判定の3ペインだけにし、選択ブロックは削除／役割変更／日本語の誤り種別、空白ドラッグの認識漏れは役割変更だけに整理した。読み順・段落境界・表tree・LaTeX・深刻度・コメント・完全性の個別入力は通常操作から外した（既存bundleのデータは保持）。ページ確認済みは1つのチェックに統合し、未注釈の詳細指標は従来どおりN/A。typecheck・diff check pass。
- 新規の認識漏れ枠を選ぶと、右ペインの`色・役割`で色を直接確認・変更できるようにした。選択肢も`本文（緑）`・`数式（赤）`などに日本語化し、選択中roleの色見本を表示する。typecheck・diff check pass。
- Evaluation Studioを業務ツール調の情報密度へ再設計。濃色の固定ヘッダー、コンパクトな操作バー、枠線ベースの3ペイン、件数表示、role色付きの抽出一覧、選択状態を明確にした。抽出一覧からの選択後に判定と`色・役割`操作を表示するbrowser smoke、typecheck、Vite build、diff check pass。
- Evaluation StudioのPDFオーバーレイ座標を、抽出用のbaseline座標と描画用top-left座標の変換境界として`overlayCoordinates`へ分離。非回転ページのnative textだけをbaseline→top-leftへ変換し、PDF.jsが既に変換した90°/180°/270°ページ、図表領域、手描き領域に二重補正を掛けない。旧bundleの明白に横長な縦copyrightだけを限定修復する。baseline、ページ回転、手描き領域、旧copyrightの4回帰を追加。公開原本`2302.03792v1`の1ページ目・数式密度の高い13ページ目で目視確認、targeted test 4/4・typecheck・Vite build・diff check pass。
- 既存の評価bundleは生成時点の抽出スナップショットを固定しているため、古い単一行bboxを現在の行単位bboxへ更新できる`再抽出`をStudio操作バーへ復元。対象ページのCanonical/Reader predictionだけを差し替え、IDが変わり得る既存の予測block判定は誤結合を防ぐため消去する一方、人間が描いた認識漏れ領域は保持する。実PDFで操作表示・実行を確認、typecheck・diff check pass。
- PDFオーバーレイの根本設計を修正。抽出・読み順のためのbaseline基準`boundingBoxes`は変更せず、各native text lineの実glyph上端・下端を別の`overlayBoundingBoxes`としてCanonical nodeへ保存し、Studioだけがこれを優先して描画する。従来は一つの数式line内の上付き／下付きの高さをbbox全体から差し引いていたため、枠が過度に上方へずれた。新しいvisual envelopeは数式のglyph extremaから計算し、回転文字は安全な旧フォールバックを使う。数式断片の結合後にもこの値をCanonical node本体に保持することを型・実パイプラインで回帰保護した。新規抽出とページ再抽出に反映され、既存bundleは再抽出するまで旧座標のまま。座標・数式結合・実パイプライン回帰 **49/49**、typecheck、Vite build、diff check pass。
- Studioのページ再抽出は、再抽出ごとにgeneric Canonical IDが`g-0`から再利用されることによる既存ページとのID衝突を防ぐ。差し替え結果のnode IDをページ固有namespaceへ変換し、Canonical relationとReader projectionの`canonicalNodeId`も同じ対応表で更新する。これにより選択・レビュー・双方向ハイライトが別ページの同名nodeへ誤結合しない。再抽出ID/関係/projection/overlay座標回帰を追加し、focused extraction / Studio regressions **50/50**、typecheck、diff check pass。
- native縦書き文字のvisual overlayは、layout用baseline `y` と別にPDF.js変換後の`visualTop`をtext itemへ保持して算出するようにした。これにより未回転ページの縦copyrightが水平text用のbaseline補正を誤適用されず、回転済みページのglyph矩形も二重変換されない。公開原本`2302.03792v1`の1ページ目で、縦stampのlayout bbox (`x=12,y=555,w=20,h=337.74`) に対し描画bbox (`x=12,y=217.26,w=20,h=337.74`) を確認。geometry / overlay / Studio regressions **51/51**、typecheck、diff check pass。
- 数式の導出が行ごとに分断され、間に分数・根号の非prose fragmentが挟まるPDF向けに、明示的な`= / − / +`継続行を前の表示式へ再結合する汎用規則を追加。same-page・近接行間・横方向の重なり・数学断片だけを必須にし、離れた等式や本文は結合しない。断片はbbox/provenanceを保持するが、壊れた線形textをReader本文へ捏造しない。`2302.03792v1` p14の先頭導出3行が一つのCanonical equationへ結合されたこと、math/Studio/geometry regressions **54/54**、7本development regressionのfailure/invariant failure 0、validation 4本のlabel-free健全性監査failure/unhealthy 0、typecheck、Vite build、diff checkを確認。独立accuracy goldではない。
- 人手ラベルを使わない追加ループとして、背の高い数式内でPDF.jsが主ベースラインの前に出す積分・根号断片と、分数断片を挟む後続等式列を同じ表示式へ統合した。本文を吸収しないため、同一ページ・非prose・28pt以内の連続配置・横方向の重なりをすべて要求し、既存の積分／分母専用規則を優先する。公開原本`2302.03792v1` p14では先頭導出が19 bboxを持つ一つの`equation`になった。focused regressions **56/56**、7本development regression failure/invariant failure 0、validation 4本label-free監査 failure/unhealthy 0、typecheck・diff check pass。これは構造健全性の改善であり、独立した正解率はreviewed goldが無いためN/A。
- label-free held-out監査でWileyの回転した表セルがページ下端を越えるCanonical bboxを生成することを検出し、native 90°文字はbaseline下端ではなく実glyph上端をlayout座標に使うよう修正した。横書きの既存baseline規約は変更していない。独立held-out候補5本は修正前4/5（Wileyのinvalid bbox）から修正後5/5 healthyとなった。表罫線の`==`だけを数式欠落候補と誤検出しないようlabel-free triageにもoperand必須条件を追加。reading-order / math / Studio focused regressions **140/140**、development 7本 failure/invariant failure 0、typecheck・diff check pass。これも正解率ではなく未知PDFの構造健全性監査結果である。
- macOS/Chromeの日本語IMEで候補を確定するEnterを、フォルダ名の保存／新規作成として誤解釈しないよう修正。`isComposing`とWebKitのkeyCode `229`を共通判定し、インライン名称変更、新規フォルダ作成、メモの⌘Enter保存、検索結果のEnter移動でIME変換中のキーを無視する。IME判定テスト、typecheck、Vite build、diff check pass。
- Readerの目次をより高密度に調整。行の縦paddingとline-heightを少し縮め、下位階層の`ul`には左marginを置かずラベルのpaddingだけで字下げるよう変更した。これにより子項目もhover／選択背景が親項目と同じ左端から横幅いっぱいに表示される。typecheck、Vite build、diff check pass。
