---
type: Playbook
title: 抽出改善の次の手順（2026-11-20 時点）
description: 要素正解で測った抽出器の現状値、残りの改善候補の優先順、測り方と作業上の注意
tags: [extraction, evaluation, handoff]
status: draft
---

# 抽出改善の次の手順

2026-11-17〜20 の作業（PR #42〜#140 のうち抽出・採点の分）の引き継ぎ。測り方の詳細は [ELEMENT_GOLD.md](./ELEMENT_GOLD.md)。

## 現状値（main 30b75d9、2026-11-20、dev）

ACL・arXiv は要素正解 40 本の dev、Europe PMC は dev から 106 本（`/tmp/claude-501/ids106.txt` の id。消えていたら `m0-paragold106` の docs のファイル名から作り直す）。run は `t1-elementgold` / `t1-paragold106`。

| 指標 | ACL 13 本 | arXiv 15 本 | Europe PMC 106 本 |
|---|---|---|---|
| タイトル | 100% | 100% | 84.0% |
| 著者 | 100% | 100% | 75.3% |
| 誌名/学会名 | 84.6% | 0%（0/2、ACM 形式は未対応） | 91.1% |
| 見出し | 94.3% | 93.5% | 93.7% |
| 見出しの精度 | 90.5% | 80.8% | 79.5% |
| 本文段落（intact） | 88.4% | 77.1% | 92.0% |
| 脚注 | 83.8% | 95.8% | 75.3% |
| 図 | 92.2% | 87.9% | 88.6% |
| 表 | 87.1% | 81.3% | 95.2% |
| 表のセル | 51.7% | 75.2% | 54.5% |
| 参考文献 | 94.4% | 89.7% | 97.9% |

Europe PMC の dev 全件（868 本）と test split は、11-17 以降まだ測っていない。

## 済んだこと（要点）

- 著者：arXiv 40.7% → 100%（#49、#50）。ACL 71.1% → 100%（#56 上付き番号の位置にカンマ、#95 段の境目で割れた著者欄を結合・`{a, b}@lab.edu` をメール扱い、#107 略称だけの所属行 `USC USC` を名前にしない・Abstract より下の行を 1 人の著者行にしない）。Europe PMC：折り返した著者欄の最後の 1 人だけを残す近道を止めた（#140、74.2% → 75.3%）。
- タイトル：arXiv 73.3% → 100%（#120：ページ上端の帯にかかる REVTeX のタイトル、柱の 1 語と一致して消えたタイトル行 `MEASURE`、中央揃えの 2 行目、段の境目で割れた `SHERPA` | `: A…`）。
- 見出しの精度：ページ上部 14% までに置かれた柱（`2 Amirirad and Sayama`）を消す。下の帯では毎ページ同じ高さの文字列だけを柱とし、ページ 1 には使わない（#122）。数式・表の断片（`S∈[Y ]\k |S|`、`1 u(s, x, l)`、`46.29 dB / 90.62%`）を見出しにしない（#126、辞書の語が無く数式記号を含む等。resolver の最後でも戻す）。
- 脚注：宣言系の注記はどちらの印刷形でも正解（#51、採点）。責任著者の連絡先を脚注に（#54）。URL だけの脚注（#77）。右端そろえのサイドバーの `Correspondence:` / 名前 / メールを 1 つの脚注に（#139、Europe PMC 69.9% → 75.3%）。
- 図：キャプションの採点を空白・記号に強く（#60、採点）。小さい文字のキャプション直下の「式」に見える行をキャプションの続きに（#135、arXiv 83.3% → 87.9%）。
- 表：キャプションだけの表と隣の格子を 1 つに（#89）。本文と同じ大きさのキャプションの折り返し行を続きに（#137、表が隣にあり文の途中で切れているときだけ。ACL 81.2% → 87.1%）。
- 行末ハイフン：結合した語が英語の辞書（SCOWL 10–60、`wordlist-english`、`src/services/englishWords.ts`）にあればハイフンを取る。接頭辞（`non-` `pre-` など）はサイズ 35 までの一般語のときだけ（#115）。残ったハイフン A：ACL 649 → 351、arXiv 291 → 242、Europe PMC 858 → 251。
- 段落：スモールキャップの本文行の抜け（#67）、ページ下端のページ番号（#72）。採点：分かち書きの違いに強く（#63）。
- 採点：`Keywords` / `Index Terms` は論文の情報（paper.keywords）が正解なので、正解の見出しから外す（#136）。
- 別セッション：折り返し見出し（#94）、図キャプションが本文を吸わない（#99）、#123・#124（図ラベルの落とし方、`open-access` で始まる本文）、Keywords を本文から外す（`frontMatter/keywords.ts`）。

## 次にやること（効果の大きい順）

1. **Europe PMC の著者の残り**（75.3%、162 人）：113 人は `PMC12280214` の 1 本（「著者は論文の末尾」のコンソーシアム論文。末尾の一覧を取るのは専用の処理が要る）。この論文では本文の `Gradient Boosting Machines (GBMs)` が著者になる誤りもある。残り約 50 人は 30 本ほどに散らばる（`PMC11557553` 4/9、`PMC12484009` 8/13 など、1 本ずつ原因が違う）。
2. **Europe PMC の脚注の残り**（18 件）：共同筆頭著者の注記（`These authors have contributed equally…`）が本文の段落に入る、古い Frontiers の形の連絡先（`PMC10817773`、`PMC12660074`）、利益相反の 1 文が段落になる。一覧は `tools/footmiss.ts <run>`（採点と同じ照合）。
3. **arXiv・ACL の段落の分断**（arXiv 77.1%、ACL 88.4%）：arXiv の残りの約半分は数式の多い 3 本（`2508.21814`、`2501.17623`、`2412.11278`）で正解側が式をまたいで 1 段落にしているもの。ACL：段の継ぎ目で箇条書きの続きが継がれない（`naacl-long.104` p13）、同じ行の 2 つの文字列で段落が割れる（`emnlp-main.479` p1）。
4. **arXiv の見出しの精度の残り**（80.8%）：`Algorithm fpGreed`、目次 `Contents`、本文の行（`6 Splatter Images, which…`）、`Facilities:`。一覧は `tools/falseheads.ts <run> <prefix>`。
5. **図の残り**：`2501.17623` の FIG. 8・9（図の多いページが 1 段と判定され、`of 𝜙.` と `FIG. 6:` が同じ行につながる）、`2509.01026` の 2 件、`2509.00272` の 1 件。一覧は `tools/figmiss.ts <run> <prefix>`。
6. **表の残り**：`eacl-long.174` p6（表の最後の行とキャプションの続きが同じ行につながる）、`naacl-long.304` p14（付録の数式断片と見出し「A.6」が 1 つの表）。一覧は `tools/tabmiss.ts <run> <prefix>`。
7. 後回し：表のセル、正解データの追加（計画どおり）。arXiv の誌名/学会名（ACM 形式、正解 2 件のみ）。行末ハイフンの残り（参考文献の人名 `Christo-pher`、辞書に無い専門語 `tokeni-zation`。`tools/hyphens.ts <run>`）。

## 測り方

```
npx vite-node --script scripts/extraction-audit.ts --corpus elementgold --out <run>        # 40 本、約 1 分
npx vite-node --script scripts/extraction-audit.ts --corpus paragold --ids $(cat /tmp/claude-501/ids106.txt) --out <run>   # 106 本、約 10 分
npx vite-node --script scripts/element-gold-score.ts --run <run> --split dev [--json out.json]   # 引数の前に -- を付けない
```

- 基準 run：`t1-elementgold` / `t1-paragold106`（main 30b75d9 相当）。
- ローカルの道具（`test-data/extraction-audit/tools/`、gitignore）：`lines.ts` / `lines70.ts`（ページのブロックと行）、`falseheads.ts`、`figmiss.ts`、`tabmiss.ts`、`footmiss.ts`、`hyphens.ts`（行末ハイフンの A/B）、`pverdict.ts <runA> <runB> <epmc-id>`（段落の判定が変わった正解段落）、`egmiss.ts`、`egsplit.ts`、`egpartial.ts`。どれも main の `src` を読むので、ワークツリーの変更を見るときは `scripts/` に一時コピーして import を `../src/` に書き換える（コミット前に消す）。
- 段落の採点は 5 語の連なり＋空白を無視した 20 文字の連なり（#63）。脚注・見出し等の照合は 3 語の連なり（`containment`）。

## 作業上の注意

- 出版社名（PLOS、Frontiers、BMC、ACM、Nature など）を `pdfExtraction/formats/` の外のコードに書くと `src/test/policy/publisherSpecialCases.test.ts` が落ちる。一般的な語と形で判定する。
- 改善は dev だけで行い、test は最後の確認だけに使う（`auditSplit`）。`pdfLayout.ts` の段の左→右の順は書き換えない。pdfjs-dist は上げない。
- 変更ごとに elementgold 40 本と Europe PMC 106 本の両方を流し、下がった指標が無いことを確かめてから PR にする。
- **比べる基準は同じワークツリーで取る**：main は別セッションの抽出の変更で頻繁に動く（11-20 だけで #123、#124、keywords）。ワークツリーで `git stash` して基準を流し、`stash pop` して変更ありを流すと、差が自分の変更だけになる。
- **裏で監査を流している間は、そのワークツリーのファイルを触らない**（テストの確認の `git stash -- <file>` も含む）。途中で読むコードが変わり、数値が壊れる。
- 下がった指標は 1 件ずつ中身を見る。今回、採点が正しくなっただけのもの（元から分かれていた段落が見えるようになった、表の列見出しが正解の見出しと同名だった）が何度かあった。
- ワークツリーで監査するときは、`test-data/` の各サブフォルダ・`test-data/real-papers/*.pdf`・`test-fixtures/real-papers/pending-pdfs/*.pdf` を 1 つずつ main からリンクし、`node_modules` も main へリンクする（pending-pdfs が無いと paragold は 0 本で終わる）。
- テストの既知の失敗は `pipeline.test.ts` の 5 件（diagram annotation、OzCHI Table 3、fragmented review table、compact left-column table、figure-adjacent numeric label matrix）。全体を流すと 60 秒を超えて時間切れになるテストが 1〜2 件出ることがあり、単体では通る。
- PR は CI が無いので、マージ前に自分で監査とテストを回す。`gh pr merge` の直後は GitHub の再計算で「mergeable でない」と返ることがあるので、失敗したら状態を見てから再実行し、成功を確かめてからワークツリーとブランチを消す。
