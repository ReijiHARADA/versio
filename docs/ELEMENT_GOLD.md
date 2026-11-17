---
type: Playbook
title: 要素正解（element gold）の作り方と使い方
description: 見出し・脚注・図表・数式・参考文献・リンク・ライセンス文・誌名/学会名までの正解データを、JATS と arXiv/ACL の LaTeX + Claude レビューで作る手順
tags: [extraction, evaluation, gold]
status: draft
---

# 要素正解（element gold）

段落正解（`paragraphGold.ts`）は本文段落だけを採点する。要素正解は論文の目に見える要素すべてを採点する：
タイトル・著者・所属・メール・誌名/学会名・DOI・ライセンス文・見出し（階層つき）・本文段落・脚注・図キャプション・表（キャプションとセル）・数式の数・参考文献・リンク。型は `src/evaluation/elementGold/types.ts`。

## 出どころ

| コーパス | 作り方 | provenance | 置き場所 |
|---|---|---|---|
| Europe PMC 1,277 本 | 出版社 JATS からその場で生成（モデル不使用） | `jats` | `test-data/field-gold/_cache/epmc/`（既存） |
| arXiv CC BY 4.0 20 本（9 分野） | 著者の LaTeX から下書き → PDF の印字語に合わせ込み → Claude が紙面画像と照合して修正 | `latex+claude` | `test-data/element-gold/<id>/` |
| ACL Anthology 20 本（ACL/EMNLP/NAACL/EACL、CC BY 4.0） | 同上。PDF は Anthology の camera-ready、下書きは同じ論文の arXiv LaTeX | `latex+claude` | 同上 |

PDF・LaTeX・正解は gitignore（再配布しない）。リポジトリにはスクリプトと手順だけを置く。

## 作成手順

1. `npx vite-node --script scripts/fetch-element-gold.ts -- --arxiv 20 --acl 20`
   - arXiv の OAI-PMH でライセンスが CC BY 4.0 と明記されたものだけ。ACL は 2016 年以降の Anthology（CC BY 4.0）。
   - 下書き（`draft.json`）は LaTeX から機械的に作り、`snap.ts` で PDF に印字された語へ合わせ込む（`\cite` や `\ref` が出力した番号・著者名を補う）。段落の中央一致率が 0.9 未満の論文（版違い）は除外。
   - 下書きの生成処理を変えたら `--redraft`（キャッシュから作り直す）。
2. Claude レビュー（下の手順）で `gold.json` を作る。下書きのままでは採点しない。
3. `npx vite-node --script scripts/check-element-gold.ts`：正解のすべての文字列が PDF のテキスト層に印字されているかを機械的に検査する。Claude の読み間違いや捏造をここで検出する。0 件になるまで直すか、例外を `review.notes` に書く。

## Claude レビュー手順（1 本ずつ）

- 紙面を `pdftoppm -r 110 -png source.pdf pages/p` で画像にし、全ページを 1 回ずつ見る。
- 確認して直す項目：タイトル、著者（印字順）、所属（印字どおり、機関ごと）、メール、誌名/学会名（紙面に印字された文字列。無ければ null）、DOI、ライセンス文、見出し（Abstract・References・付録を含む印字されたすべての見出し。番号も印字どおり。level は 1〜3）、脚注（所属・同等貢献の脚注を含む）、図と表のラベル（"Figure 3" など）とキャプション、表の数、ディスプレイ数式の数、印字された URL。
- 段落は打ち直さない（本文は PDF の印字語に合わせ込み済み）。印字されていない段落の削除と、明らかに誤った段落の区切り（結合・分割）だけ直す。
- 正解は「紙面に見えるもの」。LaTeX にあっても印字されていないものは消し、印字されていても LaTeX に無いものは足す。
- `gold.json` には `provenance: "latex+claude"` と `review: { by, date, corrections, notes }` を入れ、`check` は消す。

## 採点

```
npx vite-node --script scripts/extraction-audit.ts -- --corpus elementgold --out <run>
npx vite-node --script scripts/element-gold-score.ts -- --run <run> [--split dev|test]
```

Europe PMC は `--corpus paragold` の run をそのまま採点できる（paper メタデータ入りの run が必要）。PDF のテキスト層に無い正解は採点から外す（版違い・JATS だけにある注記）。指標の意味は `src/evaluation/elementGold/score.ts` の型コメント。

## 基準値（2026-11-17、main 6176f36 相当の抽出器）

| 指標 | Europe PMC dev 868 本 | ACL 20 本 | arXiv 20 本 |
|---|---|---|---|
| タイトル | 78.2% | 80.0% | 55.0% |
| 著者 | 86.2% | 78.2% | 55.2% |
| 誌名/学会名 | 0%（未抽出） | 0% | 0% |
| 見出し（再現 / 適合） | 85.2% / 69.7% | 93.2% / 83.8% | 93.7% / 77.8% |
| 本文段落（intact） | 88.2% | 71.1% | 51.5% |
| 脚注 | 2.8% | 44.0% | 70.0% |
| 図 / 表 | 79.4% / 87.1% | 82.7% / 69.7% | 62.4% / 88.9% |
| 表セル | 13.8% | 19.9% | 41.9% |
| 数式（数の一致） | 78.1% | 71.8% | 77.4% |
| 参考文献 | 95.1% | 96.2% | 75.5% |
| リンク | 93.8% | 94.2% | 100% |
| 本文への混入（所属・ライセンス・脚注） | 25.1% | 13.4% | 14.5% |

arXiv/ACL の 40 本は id のハッシュで dev 28 本 / test 12 本に分かれる（`auditSplit`）。調整は dev だけで行う。

## 既知の限界

- 数式の添字トークンは要素正解の段落採点時に `Mirregn` と `M irreg n` を同一視する。
- ディスプレイ数式をはさむ段落を 1 段落とするか 2 段落とするかはレビュアーで揺れる。
- 表セルは文字の再構成を測る。Reader は表を画像で見せ、セルは代替表示なので、この値は Reader での見え方とは別。
- 段落テキストは合わせ込みの都合で句読点を落としている（採点は語単位なので影響なし）。
- `check-element-gold` で残る 5 件はテキスト層側の崩れ（アクセント分解・スモールキャップス・© の欠落）で、正解は紙面画像どおり。
- 参考文献はレビュアーが紙面と突き合わせていない（LaTeX の bbl そのまま）。arXiv で 2 本は参考文献が空。
