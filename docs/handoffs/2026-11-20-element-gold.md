---
type: Handoff
title: 引き継ぎ：要素ごとの抽出（要素正解）
description: タイトル・著者・見出し・脚注・図・表を要素正解で改善する作業の途中の状態（基準 run と ID 一覧）
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：要素ごとの抽出（要素正解）

最終更新 2026-11-21 夕（`docs/extraction-next-steps.md` から途中の状態だけを分けたもの。担当のセッションが更新する）。現状値・次の候補・測り方は [extraction-next-steps.md](../extraction-next-steps.md)（要素正解の節）。

## 今の状態

- 2026-11-21：小文字で続く見出しを段落・脚注に戻す変更は #177 でマージ。アルゴリズムの囲みの題は #178。段の境目で切れたキャプションは #183。大文字で始まるキャプションは #186。共同筆頭著者の注記は #201。DOI は #212。裏の所属一覧を脚注にする変更はブランチ `fix/body-leaks`（Europe PMC 全件の基準 `zk0-paragold-all`、変更後 `zk1-paragold-all`。監査の出力名はこのセッションは `zk` 接頭辞）。別のセッションが worktree `element-notes`（`fix/footnote-notes`）で脚注を扱っているので、脚注は避ける。キャプションが段落・脚注に入る残りは 1 本ずつ原因が違う（ラベルとフローチャートの語の結合など）。
- 2026-11-21 夜：段の起点をまたぐ本文の行頭を余白の側欄として切らない変更は #211 でマージ（main f20b2c7）。基準 run は `fn1-elementgold` / `fn1-paragold106`（main edb2ce5）、変更後 `fn2-*`、worktree `../app-worktrees/element-notes`（`element-authors` は別のセッションが `fix/doi-recovery` で使用中）。監査の出力名は他のセッションと重ならない接頭辞にする（`d1-` は衝突した）。
- 2026-11-22：段抜きの表をまたぐ段落の続きは #216 でマージ（main 949f0b2）。基準 run `fn3-*`（main d458d9f）、変更後 `fn4-*`。このセッションは arXiv・ACL の段落（3 番）を扱う。
- 2026-11-22：図のラベルで読む順序の鎖が切れる件を fix/arxiv-paragraphs-2 で直した。基準 run `fn4-*`、変更後 `fn7-*`。監査の分割番号は 0〜4。
- 2026-11-22：ページ番号・上部の表を飛ばしたページ間の続きを fix/arxiv-paragraphs-3 で。基準 run `fn9base-*`（main、他のセッションのマージ後）、変更後 `fn8-*`。
- 比べる基準 run: `b0-elementgold` / `b0-paragold106`（main 2175dfd、worktree `../app-worktrees/element-authors`。`test-data/extraction-audit` は main へのリンク）。変更後 `h3-*`、段落正解 dev `h3-dev`。
- Europe PMC 106 本の ID は `/tmp/claude-501/ids106.txt`。消えていたら `b0-paragold106` の docs のファイル名から作り直す。
- Europe PMC の脚注の取りこぼしは 10 件まで減り、大半は Frontiers（段落正解のセッションの担当）。残りは Cambridge の左の側欄の連絡先（`PMC12094662`、側欄全体が 1 ブロック）など 1 本ずつ。

## 次の一手

[extraction-next-steps.md](../extraction-next-steps.md) の「次にやること・要素正解」の 3 番（arXiv・ACL の段落の分断）か 4 番（arXiv の見出しの精度の残り）。脚注は Frontiers 以外がほぼ 1 本ずつになった。
