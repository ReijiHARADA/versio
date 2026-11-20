---
type: Handoff
title: 引き継ぎ：段落の抽出品質（段落正解）
description: 段落正解で intact 98% / 警告 500 / 誤警告 50 を目指す作業の途中の状態（基準 run、worktree、次の一手、判断待ち）
tags: [extraction, evaluation, handoff]
status: draft
---

# 引き継ぎ：段落の抽出品質（段落正解）

最終更新 2026-11-21。現状値・次の候補・見送ったこと・測り方は [extraction-next-steps.md](../extraction-next-steps.md)（段落正解の節）。

## 依頼

評価用 split（Europe PMC 405 本）で intact 98% 以上、警告ブロック 500 以下、誤警告 50 以下。ゲートを緩めて警告を外すのは禁止。今は intact 89.4%、警告 2,644、誤警告 382。

## 今の状態

- ブランチ `fix/frontiers-rail`（`EDITED BY` / `REVIEWED BY` の側欄を独立した段として読む）。ユーザーの判断「取り組む」（2026-11-21）を受けた作業。マージ後は main で基準を取り直す。
- 比べる基準 run（worktree `../app-worktrees/keywords` の `test-data/extraction-audit/`）: 変更前 dev `fr0` / 評価用 `eval-fr0` / 要素正解 `eg0`・`pg0`。変更後 dev `fr8` / 評価用 `eval-fr1` / `eg8`・`pg8`。
- 評価用はこの変更で 1 回使った。

## worktree（`/Users/harada/Desktop/MyProjects/projects/versio/app-worktrees/`）

- `keywords`: 上の基準 run と古い run（`kw1`、`rl1`〜`rl4`、`eval-*`）。`test-data/element-gold` を main へリンク済み。
- `word-space` / `figure-swallow`: 古い基準。不要なら削除してよい。

## 次の一手

1. 2 ページ目以降の split-interrupted を `interrupt.ts fr8` で型分けする。
2. 側欄の下半分が抄録の途中に入るページ（`PMC13454063`）。

## 判断待ち・未確認

- PR #118（タイトルバーを戻す）は、別のフロントエンドのセッション向けの作業を誤ってこのセッションで作ったもの。閉じるかどうかはユーザーの判断待ち。
- #114 以降の抽出の変更は、ビルドした `.app` で確認していない。
