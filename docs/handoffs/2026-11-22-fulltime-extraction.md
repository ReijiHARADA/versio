---
type: Handoff
title: 引き継ぎ：抽出・翻訳の残りを続けて直す（2026-11-22〜）
description: 段落正解の目標（intact 98% / 警告 500 / 誤警告 50）に向けて、確認なしで PR を回している作業の途中の状態
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：抽出・翻訳の残りを続けて直す

最終更新 2026-11-24。作業内容（現状値・見送ったこと・測り方）は [extraction-next-steps.md](../extraction-next-steps.md)。

## 依頼

残っている抽出・翻訳の修正を確認なしで回し、段落正解の目標に近づける。

## 今の状態

- マージ済み（2026-11-23）: #271 ページ枠の罫線、#272 参考文献の後の back matter、#273 数式ブロックになった本文の行・`et al.`、#274 括弧で始まる続き、#275 行頭の `Table 6.`、#276 数字で始まる続き、#277 懸垂ハイフン、#278 箇条書き記号・混在大文字、#281 プレプリントの行番号、#283 完結した段落を越える小文字の続き、#284 小さい字を越えて `joinFullLineBreaks`、#285 図のラベルを越えて同、#286 1 行の前半・続きを段の行で測る、#289 機能語の直後の用語で始まる段落。11-22 分は git log。
- 続き（2026-11-24）: #291 `joinFullLineBreaks` の本文の字の大きさを文字数で決める、#292 最初の並びが 1 行の複数行ブロックも測る、#293 字下げの論文で 80% 以上の最終行でも文が続けばつなぐ、#294 `Figure 1 contrasts …` を図のキャプションにしない（`isFigureCaption` の詰まり判定の誤り）。
- 評価用 split（main 5d60cf2、run `m4-test`）: 旧採点 intact 91.5%（11-23 朝 90.1%）、新採点 93.7%。警告 1,775、誤警告は新採点で 332。
- dev（run `m4-dev`）: intact 92.6%、警告 1,086、誤警告 195。
- 変更の A/B: worktree `../app-worktrees/element-notes` で 1 コミットにした変更を `zsh test-data/extraction-audit/tools/ab.sh <worktreeの絶対パス> <基準の接頭辞> <変更の接頭辞>`（HEAD~1 と HEAD で elementgold 40 本・Europe PMC 106 本・dev 287 本を流して差を出す。約 15 分、負荷が高いと 30 分超なので `timeout` を長く）。悪化した論文は `docdiff.ts` / `pdiff.ts` で 1 本ずつ見る。評価用は `run-wt.sh` の中身を worktree で直接流す（`SPLIT=test`）。
- 採点は #296 で新しくなった（独立数式で段落を分け、PDF に印字されていない段落を外す）。旧採点の数値とは比べない。

## 次の一手

1. `joinFullLineBreaks`（`pdfLayout.ts`）が効く型がまだ残る：間に図の中の文（2 語以上）や別の段の本文が入るページ。`interrupt.ts`（`BLOCK=1`）の `A-terminal none`（dev 約 80）を 1 本ずつ見て、どの条件で止まるかを調べる。
2. split-column の `A-terminal same`（dev 約 100）の多くは PDF では字下げのある別段落で、正解の JATS がまとめているもの（採点側）。本物だけを拾う。
3. キャプションの 2 行目以降が字の大きさの違いで本文に回り、前ページの段落の続きとして取られる（`PMC12612131` p13 の Fig. 11）。
4. bioRxiv の重ね書き（`… was not certified by peer review …`）が本文段落・表に入る（dev 5 本、どれも採点外）。`isPreprintOverlayBlock` が分割された行に効いていない。

## 判断待ち・未確認

- 採点の正解の扱いを直した（独立数式で段落を分ける、PDF に印字されていない段落を分母から外す）。新採点で評価用 intact 93.7%（旧 91.5%）。PDF で字下げのある別段落を JATS がまとめたものは未対応。

- `.app` での確認はしていない（抽出の変更のみ）。
