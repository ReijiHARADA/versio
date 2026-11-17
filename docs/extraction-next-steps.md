---
type: Playbook
title: 抽出改善の次の手順（2026-11-17 時点）
description: 要素正解で測った抽出器の現状値、残りの改善候補の優先順、測り方と作業上の注意
tags: [extraction, evaluation, handoff]
status: draft
---

# 抽出改善の次の手順

2026-11-17 の作業（PR #42〜#46）の引き継ぎ。測り方の詳細は [ELEMENT_GOLD.md](./ELEMENT_GOLD.md)。

## 現状値（main fdf1f59、dev）

| 指標 | Europe PMC 868 本 | ACL 20 本 | arXiv 20 本 |
|---|---|---|---|
| タイトル | 79.5% | 100% | 70.0% |
| 著者 | 86.2% | 78.2% | 58.6% |
| 誌名/学会名 | 88.6% | 90.0% | 0%（ACM 形式は未対応） |
| 本文段落（intact） | 88.3% | 73.5% | 55.2% |
| 脚注 | 23.9% | 68.1% | 83.3% |
| 表 | 87.1% | 69.7% | 88.9% |
| 参考文献 | 95.1% | 96.2% | 79.4% |
| 本文への混入 | 13.5% | 7.2% | 7.2% |

## 次にやること（効果の大きい順）

1. **ACL・arXiv の段落の読み順**：段の続きが段の頭より前に並ぶ（例 `acl-2023.emnlp-main.479` の "With the availability of large-scale datasets…"）。原因は `pdfLayout.ts` 側。別セッションが layout-regions（表/図の中の文字を読み順から外す、`pdfExtraction/layout/pageRegions.ts`）を進めていたので、着手前にその進み具合を確認して重ねないこと。
2. **ACL の段落の区切りの検出漏れ**：2 つの正解段落が 1 ブロックになる（ACL で約 70 件）。字下げによる段落区切りの判定を見る。
3. **ACL の表の検出漏れ（69.7%）**：未調査。
4. **arXiv の著者（58.6%）**：上付きの所属番号付きの byline、`and` でつながる名前、ORCID の残りなど。arXiv のタイトル行がレイアウトの段階で丸ごと落ちる論文（2509.03774）もある。
5. **Europe PMC の脚注（23.9%）**：正解の多くは JATS の fn-group（Author contributions など、紙面では節）。抽出器より先に、正解からそれらを外すか、見出し付きの節として数えるかを決める（採点側の修正、Codex 向き）。
6. 後回し：表のセル、正解データの追加（計画どおり）。

## 測り方

```
npx vite-node --script scripts/extraction-audit.ts -- --corpus elementgold --out <run>     # 40 本、約 30 秒
npx vite-node --script scripts/extraction-audit.ts -- --corpus paragold --out <run>        # 1,277 本、約 40 分
npx vite-node --script scripts/element-gold-score.ts -- --run <run> --split dev
```

- 試行は Europe PMC の dev から 106 本だけ `--ids` で流すと数分で済む。最後に全件を 1 回流す。
- 基準 run：`f10-elementgold` / `t4-paragold`（ローカルの `test-data/extraction-audit/`、gitignore）。
- 段落の採点は 5 語の連なりで照合するので、1 語の誤り（行末ハイフンなど）でも段落が不一致になる。行末ハイフンの結合を強める変更は、ACL の段落が 72.4% から 70.9% に下がったので戻した。

## 作業上の注意

- 出版社名（PLOS、Frontiers、BMC、ACM、Nature など）を `pdfExtraction/formats/` の外のコードに書くと `src/test/policy/publisherSpecialCases.test.ts` が落ちる。一般的な語と形で判定する。
- 改善は dev だけで行い、test は最後の確認だけに使う（`auditSplit`）。
- Codex に任せる作業：採点や正解データの修正、テスト、長い監査の実行。Codex の worktree には `ln -s <app>/test-data test-data` で正解データを渡す。worktree を消す前に `unlink` して、リンク先を消さないこと。
