---
type: Handoff
title: 引き継ぎ：抽出・翻訳の残りを続けて直す（2026-11-22〜）
description: 段落正解の目標（intact 98% / 警告 500 / 誤警告 50）に向けて、確認なしで PR を回している作業の途中の状態
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：抽出・翻訳の残りを続けて直す

最終更新 2026-11-22。作業内容（現状値・見送ったこと・測り方）は [extraction-next-steps.md](../extraction-next-steps.md)。

## 依頼

残っている抽出・翻訳の修正を確認なしで回し、段落正解の目標に近づける。

## 今の状態

- マージ済み（2026-11-22）: #238 quality.ts の MADLAD 時代の export 削除（Codex）、#239 CRF の参考文献の間に挟まった続き、#240 段落になった式の後の where 句、#245 ページ番号フッターをまたぐ全ページ図表の先読み、#249 ページ 1 の重複した著者行、#254 Supporting information のファイル形式の札、#256 末尾のコンソーシアムの名前の一覧、#259 式ブロックになった本文の行をまたぐつなぎ、#261 採点：JATS の Abstract / Acknowledgements / References の題を正解の見出しに、#263 番号付き URL の脚注、#267 2 ページ目に続く PLOS の側欄。
- 評価用 split（main 6aeb68b、run `ft23-test`、このセッションで 2 回目）: intact 89.7→89.8%（11-21 は 89.4%）、警告 2,335→2,246（11-21 は 2,563）、誤警告 356→357（378）。
- dev（run `ft22-dev`）: intact 90.6→90.8%、警告 1,482→1,375、誤警告 278→261。
- 比べる基準 run は同じ worktree で HEAD~1 と HEAD を流す（スクラッチの `ab.sh`、接頭辞 `ft`）。worktree は `../app-worktrees/element-notes`。

## 次の一手

1. 表に飲み込まれた本文段落（dev 約 95）: `weakTableGeometryOnNarrative` を本文らしさの判定に置き換え、表のセルが減る表を 1 本ずつ見る（作業内容の文書の「見送ったこと」）。
2. 1 段と誤判定されて行が交互に混ざるページ（dev 13 ページ、表の多いページなど 1 本ずつ）。
3. 誤警告の残り（dev 261）の大半は本当に末尾・先頭が欠けている段落。採点の 85% を超えるだけなので、抽出側を直す。

## 判断待ち・未確認

- `.app` での確認はしていない（抽出の変更のみ）。
