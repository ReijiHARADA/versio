---
type: Handoff
title: 引き継ぎ：段落の抽出品質（段落正解）
description: 段落正解で intact 98% / 警告 500 / 誤警告 50 を目指す作業の途中の状態（基準 run、worktree、次の一手、判断待ち）
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：段落の抽出品質（段落正解）

最終更新 2026-11-20。現状値・次の候補・見送ったこと・測り方は [extraction-next-steps.md](../extraction-next-steps.md)（段落正解の節）。

## 依頼

評価用 split（Europe PMC 405 本）で intact 98% 以上、警告ブロック 500 以下、誤警告 50 以下。ゲートを緩めて警告を外すのは禁止。今は intact 89.1%、警告 2,827、誤警告 385。

## 今の状態

- main b07ad3d（#138 まで）。作業中のブランチ・未マージの PR は無い。
- 比べる基準 run: dev `rl4`、評価用 `eval-rl4`（worktree `../app-worktrees/keywords` の `test-data/extraction-audit/`）。main が抽出の変更で進んだら、新しい worktree で取り直す。
- 評価用は #138 で 2 回使った。次の変更では新しく 1 回だけ測る。

## worktree（`/Users/harada/Desktop/MyProjects/projects/versio/app-worktrees/`）

- `keywords`: 基準 run（`kw1`、`rl1`〜`rl4`、`eval-kw`、`eval-rl2`、`eval-rl4`）。detached HEAD。
- `word-space`: 古い基準（`base117`、`cd1`、`sd1`、`oa2`、評価用 `eval-*`）。不要なら削除してよい。
- `figure-swallow`: 古い基準（`fs1`、`gb1`〜`gb3`、評価用）。不要なら削除してよい。

## 次の一手

1. Frontiers の 1 ページ目の側欄（評価用 +116 本・警告 −204 の見込み）は、著者投影の作り直しとテストの期待値の照合し直しが要る。**取り組むかはユーザーの判断待ち。**
2. 判断を待つ間は、2 ページ目以降の split-interrupted（dev 469）を `interrupt.ts rl4` で型分けする。

## 判断待ち・未確認

- 上の Frontiers の件。
- PR #118（タイトルバーを戻す）は、別のフロントエンドのセッション向けの作業を誤ってこのセッションで作ったもの。閉じるかどうかはユーザーの判断待ち。
- #114 以降の抽出の変更は、ビルドした `.app` で確認していない。
