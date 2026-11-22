---
type: Handoff
title: 引き継ぎ：抽出・翻訳の残りを続けて直す（2026-11-22〜）
description: 段落正解の目標（intact 98% / 警告 500 / 誤警告 50）に向けて、確認なしで PR を回している作業の途中の状態
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：抽出・翻訳の残りを続けて直す

最終更新 2026-11-23。作業内容（現状値・見送ったこと・測り方）は [extraction-next-steps.md](../extraction-next-steps.md)。

## 依頼

残っている抽出・翻訳の修正を確認なしで回し、段落正解の目標に近づける。

## 今の状態

- マージ済み（2026-11-23）: #271 ページ枠の罫線、#272 参考文献の後の back matter、#273 数式ブロックになった本文の行・`et al.`、#274 括弧で始まる続き、#275 行頭の `Table 6.`、#276 数字で始まる続き、#277 懸垂ハイフン、#278 箇条書き記号・混在大文字、#281 プレプリントの行番号、#283 完結した段落を越える小文字の続き、#284 小さい字を越えて `joinFullLineBreaks`、#285 図のラベルを越えて同、#286 1 行の前半・続きを段の行で測る、#289 機能語の直後の用語で始まる段落。11-22 分は git log。
- 評価用 split（main fb4daea7、run `m3-test`）: intact 90.1→91.2%、警告 2,179→1,813、誤警告 357→306（11-23 の朝からの変化）。評価用を使ったのは #281・#284 の変更ごとと、この区切りの計 4 回。
- dev（run `m3-dev`）: intact 91.1→92.2%、警告 1,310→1,114、誤警告 260→199。
- 比べる基準 run は同じ worktree で HEAD~1 と HEAD を流す（スクラッチの `ab.sh`）。worktree は `../app-worktrees/element-notes`。

## 次の一手

1. `joinFullLineBreaks`（`pdfLayout.ts`）が効く型がまだ残る：間に図の中の文（2 語以上）や別の段の本文が入るページ。`interrupt.ts`（`BLOCK=1`）の `A-terminal none`（dev 約 80）を 1 本ずつ見て、どの条件で止まるかを調べる。
2. split-column の `A-terminal same`（dev 約 100）の多くは PDF では字下げのある別段落で、正解の JATS がまとめているもの（採点側）。本物だけを拾う。
3. キャプションの 2 行目以降が字の大きさの違いで本文に回り、前ページの段落の続きとして取られる（`PMC12612131` p13 の Fig. 11）。
4. bioRxiv の重ね書き（`… was not certified by peer review …`）が本文段落・表に入る（dev 5 本、どれも採点外）。`isPreprintOverlayBlock` が分割された行に効いていない。

## 判断待ち・未確認

- `.app` での確認はしていない（抽出の変更のみ）。
