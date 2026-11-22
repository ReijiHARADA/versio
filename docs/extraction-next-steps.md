---
type: Playbook
title: 抽出改善の作業内容
description: 要素正解と段落正解で測った抽出器の現状値、済んだこと、次の候補、見送ったこと、測り方と作業上の注意
tags: [extraction, evaluation]
status: draft
---

# 抽出改善の作業内容

抽出の改善で長く使う知識（現状値・次の候補・見送ったこと・測り方）をここに集める。セッションごとの途中の状態（ブランチ、worktree、基準 run、次の一手）は [handoffs/](./handoffs/index.md) に 1 作業 1 ファイルで書く。測り方の詳細は [ELEMENT_GOLD.md](./ELEMENT_GOLD.md) と [EXTRACTION_INTEGRITY_AUDIT.md](./EXTRACTION_INTEGRITY_AUDIT.md)。

評価は 2 系統ある。

- **要素正解**: タイトル・著者・見出し・脚注・図・表・参考文献などを要素ごとに採点する（ACL・arXiv 40 本、Europe PMC 106 本の dev）。
- **段落正解**: Europe PMC の JATS の段落を正解に、本文の段落が正しくまとまっているか（intact）と、翻訳前の警告の数を採点する（dev 287 本、評価用 test 405 本）。目標は評価用で intact 98% 以上、警告ブロック 500 以下、誤警告（正しい段落への警告）50 以下。ゲートを緩めて警告を外すのは禁止。

## 現状値

### 要素正解（main 2255382 + 段の境目で切れたキャプションの PR、2026-11-21、dev）

| 指標 | ACL 13 本 | arXiv 15 本 | Europe PMC 106 本 |
|---|---|---|---|
| タイトル | 100% | 100% | 94.3% |
| 著者 | 100% | 100% | 80.5% |
| 誌名/学会名 | 84.6% | 0%（0/2、ACM 形式は未対応） | 91.1% |
| 見出し | 94.3% | 93.5% | 93.8% |
| 見出しの精度 | 91.2% | 83.3% | 81.4% |
| 本文段落（intact） | 89.9% | 77.5% | 92.8% |
| 脚注 | 83.8% | 95.8% | 86.3% |
| 図 | 93.8% | 90.9% | 92.1% |
| 表 | 87.1% | 87.5% | 95.8% |
| 表のセル | 51.7% | 75.2% | 54.5% |
| 参考文献 | 94.4% | 89.7% | 97.9% |

Europe PMC の dev 全件（868 本、main 2a4649f + 共同筆頭著者の注記の PR、2026-11-21）：タイトル 95.9%、著者 90.9%、DOI 96.2%（DOI の PR 後。前は 72.1%）、誌名 88.6%、見出し 93.5%、見出しの精度 84.0%、本文段落 92.5%、脚注 85.4%、図 87.8%、表 95.6%、表のセル 62.7%、参考文献 95.1%、本文への漏れ 7.1%（324/4,593。裏の所属一覧の 2 つの PR で 618→450→324）。106 本の部分集合より脚注が低い（全件では共同筆頭著者の注記が多い）。本文への漏れが弱い。全件は 10 並列（`--shard k/10`）で約 15 分。test split は 11-17 以降まだ測っていない。

### 段落正解（main 582a123 + 見出しの行の PR、2026-11-21）

| 指標 | dev 287 本 | 評価用 405 本 | 目標（評価用） |
|---|---|---|---|
| intact | 90.4% | 89.4% | 98% |
| intact（PDF に印字された段落のみ） | 92.3% | 91.3% | — |
| 警告ブロック | 1,576 | 2,563 | 500 |
| うち fragment / complete（誤警告）/ merged / outside | 683 / 282 / 17 / 594 | 1,192 / 378 / 38 / 955 | complete 50 |

- 指標の天井は約 98%（版違い・JATS にしかない文が約 2%）。`scripts/paragraph-gold-coverage.ts` → `test-data/field-gold/_cache/coverage/`。
- 壊れた段落の原因（dev、側欄の段 PR 後の run `fr13`）: split-interrupted 467、lost-text 338、split-column 161、in-non-paragraph-block 125、merged-paragraphs 90（main 94）、interleaved-columns 77、split-page 19。
- 警告の約 4 割は正解に無いブロック（表・図の中の文字、著者列、所属、ライセンス）への警告。種類ごとにばらばらで、1 つの規則で減るのは数十件まで。

## 済んだこと

### 要素正解

- 著者：arXiv 40.7% → 100%（#49、#50）。ACL 71.1% → 100%（#56 上付き番号の位置にカンマ、#95 段の境目で割れた著者欄を結合・`{a, b}@lab.edu` をメール扱い、#107 略称だけの所属行 `USC USC` を名前にしない・Abstract より下の行を 1 人の著者行にしない）。Europe PMC：折り返した著者欄の最後の 1 人だけを残す近道を止めた（#140、74.2% → 75.3%）。採点：JATS の編集者グループ（`content-type="editor"`）を正解から外す（#144、→ 76.4%）。後ろに置かれたアクセント（PLOS `Schlo¨ gl`）を合成（#144、→ 76.6%）。カンマで区切られた 4 語の名前を 2 人に割る規則を削除、行末に折り返した名 `…, Md` / `Mozibur Rahman` を次の行と繋ぐ（#148、→ 77.2%）。
- タイトル：arXiv 73.3% → 100%（#120：ページ上端の帯にかかる REVTeX のタイトル、柱の 1 語と一致して消えたタイトル行 `MEASURE`、中央揃えの 2 行目、段の境目で割れた `SHERPA` | `: A…`）。
- 見出しの精度：ページ上部 14% までに置かれた柱（`2 Amirirad and Sayama`）を消す。下の帯では毎ページ同じ高さの文字列だけを柱とし、ページ 1 には使わない（#122）。数式・表の断片（`S∈[Y ]\k |S|`、`1 u(s, x, l)`、`46.29 dB / 90.62%`）を見出しにしない（#126、辞書の語が無く数式記号を含む等。resolver の最後でも戻す）。
- 本文への漏れ：2 ページ目以降の、どの文も「機関名と地名」だけの段落（Nature 系の末尾の所属一覧 `Department of …, City, Country. Centre for …`）を脚注にする（`looksLikeAffiliationList`、2026-11-22）。`affiliation` にすると 2 ページ目以降は本文にも `paper.affiliations` にも出ず文字が消えるので、注記として残す。Europe PMC 全件の漏れ 618→450（うち 235 件のコンソーシアム論文 `PMC12280214` が大半）、段落正解 docdiff +0/−1（著者紹介の 1 段落。`is` などの be 動詞を含む文は外して解消）。続けて、行頭にくっついた所属番号（`140Institute of …`）を外して判定し、機関の語に `Centro` / `Ospedale` / `Servicio` / `Unidad` / `Azienda` / `Univ.` などを足す（2026-11-22、450→324、ほかは変化なし、docdiff +0/−0）。残りの所属の漏れの大半はコンソーシアム論文 `PMC12280214` のページをまたいで割れた一覧。
- DOI：ページ 1 の柱・フッターにだけ印字された DOI（`PLOS Computational Biology | https://doi.org/…`、Nature の `Article https://doi.org/…`）を、生のページの文字から拾う（`findDoi`、論文誌名の `findVenue` と同じ後付け）。折り返しで割れた DOI（`10.1371/journal. pone…`、`10.1371/ journal…`）をつなぐ、くっついた `Received` を外す、データ・プレプリントの DOI（figshare、Dryad、Zenodo、OSF、Research Square）より論文の DOI を選ぶ（2026-11-21）。Europe PMC 全件の DOI 72.1→96.2%、ほかは変化なし。
- 脚注：共同筆頭著者の注記（`†These authors have contributed equally…`、`☯ These authors…`）を、マストヘッドの所属の列や側欄のライセンスの続きの中でも脚注にし、小文字で始まる折り返し行も同じ脚注に入れる（`pdfLayout.ts` の `EQUAL_CONTRIBUTION_NOTE`、2026-11-21）。Europe PMC 全件の脚注 78.2→85.4%（+38）、ほかは変化なし、段落正解 docdiff +0/−0。`∗Equal contribution` まで含めると ACL の脚注の分かれ方が変わり表になるものが出たので、`These / Both … authors` の形だけにした。
- 脚注：宣言系の注記はどちらの印刷形でも正解（#51、採点）。責任著者の連絡先を脚注に（#54）。URL だけの脚注（#77）。右端そろえのサイドバーの `Correspondence:` / 名前 / メールを 1 つの脚注に（#139、Europe PMC 69.9% → 75.3%）。2 ページ目に続く側欄（PLOS の `Competing interests:` / `Funding:`、Frontiers の `Abbreviations`）を注記にして折り返しを繋ぐ（#162、→ 79.5%）。
- 図：キャプションの採点を空白・記号に強く（#60、採点）。小さい文字のキャプション直下の「式」に見える行をキャプションの続きに（#135、arXiv 83.3% → 87.9%）。
- 図・表：2 段組のページで全幅のキャプションの行が段の境目で切れ、右半分（`) Walk straight, U shape…`）が右の段の段落になるもの。同じベースライン・同じ文字サイズで、キャプションの行の右端から始まる行をキャプションに戻す（`pdfLayout.ts` の `reconstructDocument`、2026-11-21）。図 ACL 92.2→93.8%、arXiv 87.9→90.9%、Europe PMC 88.6→91.6%、表 arXiv 81.3→87.5%、Europe PMC 95.2→95.8%。段落正解 dev は docdiff +12/−0、警告 1,576→1,549。
- 図：本文の参照（`Figure 5 maps the…`）を段落に戻す規則が、大文字で始まるキャプション（`Fig. 4 Map showing…`）まで段落にしていた。番号の後が小文字のときだけ戻す（2026-11-21、Europe PMC 91.6→91.9%、変わったブロックはこの 1 つだけ）。
- 表：キャプションだけの表と隣の格子を 1 つに（#89）。本文と同じ大きさのキャプションの折り返し行を続きに（#137、表が隣にあり文の途中で切れているときだけ。ACL 81.2% → 87.1%）。
- 行末ハイフン：結合した語が英語の辞書（SCOWL 10–60、`wordlist-english`、`src/services/englishWords.ts`）にあればハイフンを取る。接頭辞（`non-` `pre-` など）はサイズ 35 までの一般語のときだけ（#115）。残ったハイフン A：ACL 649 → 351、arXiv 291 → 242、Europe PMC 858 → 251。
- 段落：スモールキャップの本文行の抜け（#67）、ページ下端のページ番号（#72）。採点：分かち書きの違いに強く（#63）。
- 見出しの精度：4 語以上の見出しで、すぐ下に左端をそろえて始まる 4 語以上の段落・脚注が小文字で続くもの（`6 Splatter Images, which … while` + `maintaining …`、脚注の 1 行目 `1 The typical … between 6.1`）を段落・脚注に戻して次とつなぐ。`4.1.2 …` のような多段の番号の見出しは除く（2026-11-21）。見出しの精度 ACL 90.8→91.2%、arXiv 81.3→82.3%、Europe PMC 80.2→81.5%、本文段落 Europe PMC 92.6→92.8%。段落正解 dev は docdiff +0/−0。アルゴリズムの囲みの題（`Algorithm fpGreed` の直下が `Input:` / `Require:`）を見出しにしない（arXiv 82.3→83.3%）。
- 採点：`Keywords` / `Index Terms` は論文の情報（paper.keywords）が正解なので、正解の見出しから外す（#136）。

### 段落正解（PR #45〜#138 のうち段落の分）

- 図のキャプションに本文サイズの段の本文を吸わせない（#99）。見出しの 2 行目を見出しにつなぐ（#94）。表の見出しのあるページの小さい字を表扱い（#58）。
- 全幅の表・図で段組判定に失敗したページの 2 段の帯を、文書の段組で読む（#114、`dominantColumnLayout` / `orderDocumentGutterBand`）。段の交互混入 dev 117→85。
- 本文を黙って捨てていたフィルタ: 「The / Of / And」で始まる 10 語以下の段落を図の断片として消していた（#121、dev 175 ブロック復元）。図ラベル扱いで消える短い完結した文を残す（#123）。本文サイズの「open-access …」で始まる行をライセンス扱いしない（#124）。
- Keywords をメタデータ `paper.keywords` に移して Reader に表示（#128、`frontMatter/keywords.ts`。JATS の kwd と語の 96% 一致）。
- PLOS の 1 ページ目の側欄を独立した段として読む（#138、`asymmetricRail` を `Citation:` + `Editor:` に拡張）。評価用 docdiff +58/−0。
- カンマ・ダッシュで終わる見出し（CRediT の `MG: Formal analysis, Methodology, Writing –` など）を段落に戻し、前の開いた段落・次の段落とつなぐ。行末の空白つきダッシュ（`Writing –`）をハイフンとして消さない（2026-11-21）。dev +3/−0、評価用 +2/−1（1 本は崩れた順の 1 ブロックが正しい順の 2 ブロックに分かれたもの）。見出しの精度 ACL 90.5→90.8%、arXiv 80.8→81.3%、Europe PMC 79.6→80.2%。
- `EDITED BY` / `REVIEWED BY`（`Edited by:` の旧形も）の 1 ページ目の側欄を独立した段として読む（2026-11-21）。側欄はタイトルの横から始まるので、マストヘッドも 2 段で読む（`isMastheadRail`）。本文の段の始まりは 3 行以上が始まる x（側欄のはみ出しを本文の始まりにしない）。著者投影は側欄の段のノードを側欄として外す（`railColumn`）。あわせて：上付き番号が自分の行より上の行に付く誤り（番号はベースラインより上にある）、番号付き所属の流し組みの結合と分割、`, ` で終わる著者行の次の名前行、推奨引用（`Surname A and Surname B (2026)`）を本文・抄録にしない。さらに側欄ページで：番号の付いた著者行を表示タイトルにしない、同じ大きさの表示行に挟まれた行をタイトルに含める、連絡先の注記（ラベルが所属・名前が見出しに振られた場合、名前の下の行だけのメール）。dev docdiff +51/−0（main 7f1dfbb 比）、評価用は途中版で 1 回 +71/−1（1 本は行末ハイフン `Work-Related` の除去）。Europe PMC 106 本：タイトル 84.0→94.3%、著者 77.2→80.5%、脚注 79.5→86.3%、本文段落 92.1→92.6%。ACL・arXiv は変化なし。残り：小文字で始まるタイトルの中間行が段落になる 1 本（`PMC12963332`）。

## 次にやること（効果の大きい順）

### 要素正解

1. **Europe PMC の著者の残り**（80.5%、126 人）：113 人は `PMC12280214` の 1 本（「著者は論文の末尾」のコンソーシアム論文。末尾の一覧を取るのは専用の処理が要る。本文の `Gradient Boosting Machines (GBMs)` が著者になる誤りもある）。側欄の段 PR で `PMC11557553` は 9/9 になった。`PMC12484009` 8/13 などは残り。一覧は `tools/authmiss.ts <run>`。
1b. **2 ページ目の側欄の残り**：`PMC12742791` は側欄の行が本文の行と同じ行に混ざる（段検出の段階。#162 の投影側の処理では直らない）。
2. **Europe PMC の脚注の残り**（全件で 77 件。`Competing interests:`、`Current address:`、`This article…` など）：古い Frontiers の形の連絡先（`PMC10817773`、`PMC12660074`）、利益相反の 1 文が段落になる。一覧は `tools/footmiss.ts <run>`（採点と同じ照合）。
3. **arXiv・ACL の段落の分断**（arXiv 77.1%、ACL 88.4%。ACL の残りの大半は partial で、行内の数式の記号や正解側の分かち書き（`W IKI`）の差）：arXiv の残りの約半分は数式の多い 3 本（`2508.21814`、`2501.17623`、`2412.11278`）で正解側が式をまたいで 1 段落にしているもの。ACL：段の継ぎ目で箇条書きの続きが継がれない（`naacl-long.104` p13）、ページ上部の段抜きの表をまたぐ左の段から右の段への続き（`2509.00272` p8）は #216 で直した（`floatedTableContinuationRelations` が表を右の段にあるものに限っていた）。同じ行の 2 つの文字列で段落が割れる件（`emnlp-main.479` p1）は #211 で直した（字下げした要旨で左の段の起点が x=88 になり、x=71 から始まる本文の行頭が余白の側欄として切られていた。ACL の段落 88.4→89.2%、Europe PMC 段落・図 +1）。図の中の文字ラベル（`vector-figure-label-cluster` の `other`）が本文から除かれると READS_BEFORE の鎖が切れ、そのページが y 順に並び左右の段が混ざる件（`2509.03774` p1）は、`topologicalOrder` で除いたノードを飛び越して鎖をつなぐようにした（つなぐ元が本文の段落か、つなぐ先が図のキャプションのときだけ。グラフの断片どうしや表のキャプションまでつなぐと、`2509.00272` p9 のグラフ表や `eacl-long.174` p7 の表が崩れた）。ACL・arXiv の段落 +1 ずつ。ページをまたぐ続きが、前のページの末尾に残るページ番号の段落（`4342`）・図・表のノードや、次のページ上部の表（行が `equation` になるものを含む）で隣り合わずにつながらない件（`naacl-long.244` p5→p6 など）は、`pageBoundaryContinuationRelations` でそれらを飛ばすようにした（表を飛ばすときは続きの行頭を表より下、ページの 6 割より上に限る。ACL の段落 +3）。`acl-long.497` p5→p6 は表のノードが右の段の本文までページ下端まで飲み込んでいて残る。前のページ末尾の脚注も飛ばすようにした。ページ番号以外を飛ばしたときは続きが小文字で始まるときだけつなぐ（行頭の判定が大文字小文字を区別しないため、表の行 `BCWI 83.4 ±0.1…`・図の中の文 `Contexts:…`・`Algorithm 1`・`XSum Test` までつながっていた）。ACL +1（`acl-long.497` の脚注をまたぐ続き）。
4. **arXiv の見出しの精度の残り**（83.3%）：目次 `Contents` とその項目（採点は目次の項目も正解の見出しに当てるので、目次を外しても精度は変わらない。試して見送り）、`Facilities:`。PRL の `Introduction` / `Conclusions` は正解側に無い（正解は `End Matter` だけ）。Europe PMC の誤見出しの多くは JATS に無い後付けの見出し（`References`、`Declarations`、`Ethics statement`、`Author details`）で、採点側の差。一覧は `tools/falseheads.ts <run> <prefix>`。
5. **図の残り**（Europe PMC の残りは、JATS の方が長い版違いのキャプションと、キャプションが段落・脚注に入るもの約 12 件。本文サイズの行頭 `Figure 5e. For example…` がキャプションになる誤りもある（`PMC12850517` p10）。一覧は Europe PMC 用に `figmiss.ts` を JATS の正解に書き換えたもの）：`2501.17623` の FIG. 8・9（図の多いページが 1 段と判定され、`of 𝜙.` と `FIG. 6:` が同じ行につながる）、`2509.01026` の 2 件、`2509.00272` の 1 件。一覧は `tools/figmiss.ts <run> <prefix>`。
6. **表の残り**：`eacl-long.174` p6（表の最後の行とキャプションの続きが同じ行につながる）、`naacl-long.304` p14（付録の数式断片と見出し「A.6」が 1 つの表）。一覧は `tools/tabmiss.ts <run> <prefix>`。
7. 後回し：表のセル、正解データの追加（計画どおり）。arXiv の誌名/学会名（ACM 形式、正解 2 件のみ）。行末ハイフンの残り（参考文献の人名 `Christo-pher`、辞書に無い専門語 `tokeni-zation`。`tools/hyphens.ts <run>`）。

### 段落正解

1. **2 ページ目以降の split-interrupted**（dev 467 のうち）: 間に図・表・脚注・見出しが入る型。`interrupt.ts <run>` で型を分けてから。
2. **split-column**（dev 161）: 段の切れ目での分断。
3. 側欄ページの残り: 側欄の下半分（RECEIVED〜COPYRIGHT）が抄録の途中に別の帯として入るページ（`PMC13454063`、抄録が 69%/31% で割れる）。
4. 小さい規則（1 本あたり +0.1pt 前後）: `(a)` 始まりのサブパネル説明（正解外警告 34 / 正解 11）、Abbreviations 一覧、崩れた数式の段落（種類を変えると Reader の表示が変わるので方針判断が要る）。

## 試して見送ったこと（段落正解。繰り返さない）

- ページをまたぐ段落の結合で、間の図・キャプション・脚注（・表）を飛び越える（2026-11-21）: dev +2/−1 だけ。2 ページ目以降の split-interrupted（dev 467）のうちページをまたぐ 181 件は、前半が文末で終わるもの（図の 24 件中 17 件）が多く、文の続きでは判定できない。表を飛び越えると、表の中身の行（まだ段落ノード）を取り合って表のセルが壊れる。既存の「小文字で始まる」判定は `i` フラグで大文字も通すので、条件を足すときは注意。

- 関数語（`the` / `at` / `of` など）で切れた段落を、図・表の後の大文字で始まる段落につなぐ（2026-11-22）: dev +28/−15、誤結合 +8。表の注記（`Not all questions were required, …`）を吸う。表を除いても +8/−2・誤結合 +6（`shown in` の後の `Figure 8a–d.` が図に取られ、次の段落とつながる）。

- 脇の囲み記事の領域化: 枠をまたぐ分断は厳しい条件で 22 段落だけ（`tools/sidebar.ts`）。
- 行の位置・段落間の縦の余白による、文末で分かれた段落の結合: 余白が狭く字下げなしでも同じ段落は約 34%（`tools/geom.ts`、`VG=1`）。精度 9 割に届かない。
- 段組判定で「左右に段がある高さだけで gutter を判定」: 表が中心のページを 2 段組と誤判定する。ページ全体ではなく帯だけを 2 段にする #114 で代替。
- 「同じ文字サイズなら本文外でも結合」: 囲み記事が抄録に、表のセルの文が本文に結合する。
- Frontiers のライセンス断片を段落に戻さない（`demotePageOneProseCopyrights` の除外追加）: 評価用で intact が下がり見送り。抄録とライセンスが行ごとに交互に混ざるブロックが原因。
- Frontiers の 1 ページ目を側欄として読む（2026-11-20 の 1 回目。11-21 に著者投影ごと直して採用、上の「済んだこと」）: (1) `EDITED BY` + `REVIEWED BY` を引き金にすると著者テスト 8 件失敗。うち 1 件（marketing-neuroconsumer）はテストの期待値の誤り（Aurelija Burinskiene は査読者）。残りは編集者・査読者名が著者・所属に流入。(2) 側欄の編集者・査読者の行を落とすと 5 件まで減るが、所属の分割と抄録の検出が崩れる。(3) RECEIVED / CITATION / COPYRIGHT / KEYWORDS より上を 1 段のまま読むと 14 件失敗。Frontiers の著者テストの多くが旧来の崩れた読み順を前提にしている。
- lost-text の「途中が消えた」型の大半は採点側の差（版違いの言い回し、引用の書式、行内数式が JATS に無い、引用番号の範囲展開）。本物は 2 割程度で原因はばらばら。

## 測り方

### 要素正解

```
npx vite-node --script scripts/extraction-audit.ts --corpus elementgold --out <run>        # 40 本、約 1 分
npx vite-node --script scripts/extraction-audit.ts --corpus paragold --ids $(cat /tmp/claude-501/ids106.txt) --out <run>   # 106 本、約 10 分
npx vite-node --script scripts/element-gold-score.ts --run <run> --split dev [--json out.json]   # 引数の前に -- を付けない
```

- 基準 run：`b0-elementgold` / `b0-paragold106`（main 2175dfd）、変更後 `h3-*`。
- ローカルの道具（`test-data/extraction-audit/tools/`、gitignore）：`lines.ts` / `lines70.ts`（ページのブロックと行）、`falseheads.ts`、`figmiss.ts`、`tabmiss.ts`、`footmiss.ts`、`hyphens.ts`（行末ハイフンの A/B）、`pverdict.ts <runA> <runB> <epmc-id>`（段落の判定が変わった正解段落）、`egmiss.ts`、`authmiss.ts`（著者の取りこぼしと余分）、`egsplit.ts`、`egpartial.ts`。どれも main の `src` を読むので、ワークツリーの変更を見るときは `scripts/` に一時コピーして import を `../src/` に書き換える（コミット前に消す）。
- 段落の採点は 5 語の連なり＋空白を無視した 20 文字の連なり（#63）。脚注・見出し等の照合は 3 語の連なり（`containment`）。

### 段落正解

```
zsh test-data/extraction-audit/tools/run-wt.sh <run> <abs>/dev300.txt [行数]              # dev 287 本を 10 並列（約 3.5 分）
SPLIT=test zsh test-data/extraction-audit/tools/run-wt.sh <run> <abs>/test-ids.txt          # 評価用 405 本（約 5 分）
npx vite-node --script scripts/extraction-audit-score.ts -- --run <run> --split dev         # 採点（--cause <cause> --n 10 で例）
```

- `run-wt.sh` の ID ファイルは絶対パスで渡す。zsh では `set -- $var` で単語に分かれない（`${=var}`）。
- 道具（`test-data/extraction-audit/tools/`、gitignore）: `docdiff.ts A B`（論文ごとの intact の増減、`SPLIT=test`）、`pdiff.ts A B <docId>`（判定の変わった正解段落）、`interrupt.ts <run>`（分断の間にあるもの。`RAIL=1` 側欄、`WHY=1`、`BLOCK=1`、`SEC=1`）、`outside.ts <run>`（正解外警告。`JATS=1`、`SHOW=`）、`lostkind.ts <run>`（lost-text の型。`TOK=1`、`DIFF=1 SHOW=`）、`dropped.ts`（出力に届かない canonical ノード）、`kw.ts`（キーワードと JATS kwd）、`pat.ts`、`geom.ts`、`trace.ts <docId> <page>`（`NODES=1`、`W=`）、`lines.ts <docId|pdf> <page> [文字列]`、`cols.ts <docId|pdf>`（ページの段組判定）。
- 採否の基準: intact が上がり、docdiff の改善が悪化より多く、悪化した論文を 1 本ずつ目で確かめる。merged-paragraphs（誤結合）が増えていないことも見る。評価用は調整に使わず、変更ごとに最後に 1 回だけ測る（使った回数は PR に書く）。

## 作業上の注意

- 出版社名（PLOS、Frontiers、BMC、ACM、Nature など）を `pdfExtraction/formats/` の外のコードに書くと `src/test/policy/publisherSpecialCases.test.ts` が落ちる。一般的な語と形で判定する。
- 改善は dev だけで行い、test は最後の確認だけに使う（`auditSplit`）。`pdfLayout.ts` の段の左→右の順は書き換えない。pdfjs-dist は上げない。
- 変更ごとに elementgold 40 本と Europe PMC 106 本の両方を流し、下がった指標が無いことを確かめてから PR にする。
- **比べる基準は同じワークツリーで取る**：main は別セッションの抽出の変更で頻繁に動く（11-20 だけで #123、#124、keywords）。ワークツリーで `git stash` して基準を流し、`stash pop` して変更ありを流すと、差が自分の変更だけになる。
- **裏で監査を流している間は、そのワークツリーのファイルを触らない**（テストの確認の `git stash -- <file>` も含む）。途中で読むコードが変わり、数値が壊れる。
- 下がった指標は 1 件ずつ中身を見る。今回、採点が正しくなっただけのもの（元から分かれていた段落が見えるようになった、表の列見出しが正解の見出しと同名だった）が何度かあった。
- ワークツリーで監査するときは、`test-data/` の各サブフォルダ・`test-data/real-papers/*.pdf`・`test-fixtures/real-papers/pending-pdfs/*.pdf` を 1 つずつ main からリンクし、`node_modules` も main へリンクする（pending-pdfs が無いと paragold は 0 本で終わる）。
- CI（Rust / TypeScript）は PR ごとに動くが、抽出の監査は CI に入っていないので、マージ前に自分で監査とテストを回す。`gh pr merge` の直後は GitHub の再計算で「mergeable でない」と返ることがあるので、失敗したら状態を見てから再実行し、成功を確かめてからワークツリーとブランチを消す。
- テストの既知の失敗: `pipeline.test.ts` の 5 件（diagram annotation、OzCHI Table 3、fragmented review table、compact left-column table、figure-adjacent numeric label matrix）。`npm run test:extraction-corpus` は main で 15 件失敗する（失敗の一覧で比べる。全体で 15 分以上、重い処理と並べると 60 秒の時間切れが出るので単独で再実行して確かめる）。
- worktree の `test-data/real-papers/` には追跡ファイル（`audit-progress.json`、`reports/`）があるので、PDF だけを 1 本ずつリンクする（ディレクトリごと上書きしない）。
