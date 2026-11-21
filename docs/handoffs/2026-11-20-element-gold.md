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

- 2026-11-21：小文字で続く見出しを段落・脚注に戻す変更は #177 でマージ。アルゴリズムの囲みの題は #178。段の境目で切れたキャプションは #183。大文字で始まるキャプションは #186。共同筆頭著者の注記を脚注にする変更はブランチ `fix/equal-contribution-note`。Europe PMC 全件の基準 run は `f0-paragold-all`（main ddff25b）、変更後 `e2-paragold-all`、要素正解は `n1-elementgold` → `e2-elementgold`。キャプションが段落・脚注に入る残りは 1 本ずつ原因が違う（ラベルとフローチャートの語の結合など）。
- 比べる基準 run: `b0-elementgold` / `b0-paragold106`（main 2175dfd、worktree `../app-worktrees/element-authors`。`test-data/extraction-audit` は main へのリンク）。変更後 `h3-*`、段落正解 dev `h3-dev`。
- Europe PMC 106 本の ID は `/tmp/claude-501/ids106.txt`。消えていたら `b0-paragold106` の docs のファイル名から作り直す。
- Europe PMC の脚注の取りこぼしは 10 件まで減り、大半は Frontiers（段落正解のセッションの担当）。残りは Cambridge の左の側欄の連絡先（`PMC12094662`、側欄全体が 1 ブロック）など 1 本ずつ。

## 次の一手

[extraction-next-steps.md](../extraction-next-steps.md) の「次にやること・要素正解」の 3 番（arXiv・ACL の段落の分断）か 4 番（arXiv の見出しの精度の残り）。脚注は Frontiers 以外がほぼ 1 本ずつになった。
