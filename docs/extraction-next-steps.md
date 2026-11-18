---
type: Playbook
title: 抽出改善の次の手順（2026-11-18 時点）
description: 要素正解で測った抽出器の現状値、残りの改善候補の優先順、測り方と作業上の注意
tags: [extraction, evaluation, handoff]
status: draft
---

# 抽出改善の次の手順

2026-11-17〜18 の作業（PR #42〜#46、#49〜#51、#54、#56、#59、#60）の引き継ぎ。測り方の詳細は [ELEMENT_GOLD.md](./ELEMENT_GOLD.md)。

## 現状値（main、2026-11-18、dev）

ACL・arXiv は要素正解 40 本の dev、Europe PMC は dev から 106 本（`m0-paragold106` の id）。#60 で図・表キャプションの採点を空白の違いに強くした後の値。

| 指標 | ACL 13 本 | arXiv 15 本 | Europe PMC 106 本 |
|---|---|---|---|
| タイトル | 100% | 73.3% | 83.0% |
| 著者 | 82.9% | 100% | 73.7% |
| 誌名/学会名 | 84.6% | 0%（0/2、ACM 形式は未対応） | 91.1% |
| 見出し | 93.7% | 93.0% | 86.7% |
| 本文段落（intact） | 74.5% | 52.8% | 89.9% |
| 脚注 | 69.1% | 95.8% | 68.5% |
| 図 | 92.2% | 83.3% | 88.6% |
| 表 | 81.2% | 75.0% | 92.4% |
| 表のセル | 16.1% | 45.0% | 9.4% |
| 参考文献 | 94.4% | 89.7% | 97.9% |

Europe PMC の dev 全件（868 本）と test split は、11-17 以降まだ測っていない。

## 済んだこと（要点）

- arXiv の著者 40.7% → 100%（#49、#50）、ACL の著者 71.1% → 82.9%（#56、行の中の上付き所属番号の位置にカンマを補う）。
- 脚注：宣言系の注記はどちらの印刷形でも正解（#51、採点）。責任著者の連絡先を脚注として残す（#54、106 本 31.5% → 68.5%）。
- 図：太字のキャプション番号がページ幅のキャプションから左の段に残る不具合（#59）。キャプションの採点を空白・記号・アクセントの違いに強くした（#60、採点）。
- ACL の段落の区切りの検出漏れは、正解側の問題と判断（抽出器は直さない）。

## 次にやること（効果の大きい順）

1. **arXiv・ACL の段落の読み順**（arXiv 52.8%、ACL 74.5%）：段の続きが段の頭より前に並ぶ（例 `acl-2023.emnlp-main.479`）。`pdfLayout.ts` の段の扱いは別セッション（feat/layout-columns、#53 マージ済み）の担当だったので、着手前にその状況を確認して重ねないこと。
2. **ACL の著者の残り 5 本 13 人**：原因は 1 本ずつ違う。`naacl-long.73` は著者行全体が表と判定、`naacl-long.244` は著者・所属・メールが行の中で交互に混在、`eacl-long.154` は著者の 2 行目が段落と判定、`naacl-long.104` は著者行が断片化、`acl-long.419` は名前に所属がくっつく（`Duygu Nur Yaldiz USC USC`）。
3. **キャプションの行末ハイフン**：`cate-gories`、`segmenta-tion` のようにキャプション内の行末ハイフンが残る。#60 以降は図の採点に効かないので、テキストを見て直す。
4. **arXiv のタイトル**（73.3%、残り 4 本）と **arXiv の見出しの精度**（75.0%）。
5. **arXiv の図の残り**：2501.17623 で 1 つの図のブロックに別の図のキャプションが入る（FIG. 3 に FIG. 6 の文）。2509.01026 で付録の図のキャプションが参考文献にも重複して入る。
6. **ACL の表**：付録ページの数式断片と見出し「A.6」が 1 つの表になる（`acl-2024.naacl-long.304` p14、`captionedRepeatedCellRow` 以外の経路）。
7. **Europe PMC の脚注の残り**：PDF のテキスト層に無い語（PLOS の `E-mail:`）、名前が別の段落に吸われたもの（古い Frontiers の形）。
8. 後回し：表のセル、正解データの追加（計画どおり）。arXiv の誌名/学会名（ACM 形式、正解 2 件のみ）。

## 測り方

```
npx vite-node --script scripts/extraction-audit.ts --corpus elementgold --out <run>        # 40 本、約 1 分
npx vite-node --script scripts/extraction-audit.ts --corpus paragold [--ids a,b] --out <run>   # 全 1,277 本は約 40 分
npx vite-node --script scripts/element-gold-score.ts --run <run> --split dev [--json out.json]   # 引数の前に -- を付けない
```

- 試行は Europe PMC の dev から 106 本だけ `--ids` で流すと数分で済む。最後に全件を 1 回流す。
- 基準 run：`g1-elementgold` / `g1-paragold106`（main e2e8a39 相当、#60 の採点で比べる）。古い run：`m1-elementgold`（e03de03）、`m0-paragold106`（6909889）、`t4-paragold`（全件）。`f10-*` は layout-regions（#45）より前なので比べない（ローカルの `test-data/extraction-audit/`、gitignore）。
- 段落の採点は 5 語の連なりで照合するので、1 語の誤り（行末ハイフンなど）でも段落が不一致になる。行末ハイフンの結合を強める変更は、ACL の段落が 72.4% から 70.9% に下がったので戻した。

## 作業上の注意

- 出版社名（PLOS、Frontiers、BMC、ACM、Nature など）を `pdfExtraction/formats/` の外のコードに書くと `src/test/policy/publisherSpecialCases.test.ts` が落ちる。一般的な語と形で判定する。
- 改善は dev だけで行い、test は最後の確認だけに使う（`auditSplit`）。
- `pdfLayout.ts` の段の左→右の順は書き換えない。
- 変更ごとに elementgold 全 40 本と Europe PMC 106 本の両方を流し、`diff` で下がった指標が無いことを確かめてから PR にする。
- 単体テストは `src/test/pdfExtraction/pipeline.test.ts` の 5 件が main でも落ちる（既知）。全体実行の負荷でタイムアウトが出ることがあり、単独で通れば問題ない。
- 調べるときの道具：`test-data/extraction-audit/tools/lines.ts <id か pdf の絶対パス> <page> [文字列]`（ブロックと行の座標）。
- Codex に任せる作業：採点や正解データの修正、テスト、長い監査の実行。Codex の worktree には `ln -s <app>/test-data test-data` で正解データを渡す。worktree を消す前に `unlink` して、リンク先を消さないこと。
