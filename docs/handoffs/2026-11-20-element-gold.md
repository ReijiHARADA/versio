---
type: Handoff
title: 引き継ぎ：要素ごとの抽出（要素正解）
description: タイトル・著者・見出し・脚注・図・表を要素正解で改善する作業の途中の状態（基準 run と ID 一覧）
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：要素ごとの抽出（要素正解）

最終更新 2026-11-21（`docs/extraction-next-steps.md` から途中の状態だけを分けたもの。担当のセッションが更新する）。現状値・次の候補・測り方は [extraction-next-steps.md](../extraction-next-steps.md)（要素正解の節）。

## 今の状態

- 2026-11-17〜21 の作業（PR #42〜#162 のうち抽出・採点の分）まで。main d15abe0。作業中のブランチ・PR は無い。
- 比べる基準 run: `c1-elementgold` / `c1-paragold106`（main d15abe0 相当、worktree `../app-worktrees/element-authors` で取ったもの。`test-data/extraction-audit` は main へのリンク）。
- Europe PMC 106 本の ID は `/tmp/claude-501/ids106.txt`。消えていたら `m0-paragold106` の docs のファイル名から作り直す。
- Europe PMC の dev 全件（868 本）と test split は、11-17 以降まだ測っていない。

## 次の一手

[extraction-next-steps.md](../extraction-next-steps.md) の「次にやること・要素正解」の 1 番（Europe PMC の著者の残り）。Frontiers の側欄は段落正解のセッションの担当なので避ける。著者の残りは大物（`PMC12280214`）だけなので、次は 2 番（脚注の残りのうち Frontiers 以外：共同筆頭著者の注記、利益相反の 1 文）か 3 番（arXiv・ACL の段落の分断）。
