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

評価用 split（Europe PMC 405 本）で intact 98% 以上、警告ブロック 500 以下、誤警告 50 以下。ゲートを緩めて警告を外すのは禁止。今は intact 89.4%、警告 2,563、誤警告 378（評価用、2026-11-21）。

## 今の状態

- 側欄の段は #165 でマージ済み。ブランチ `fix/cross-page-float`（名前は最初の試みのまま。中身はカンマ・ダッシュで終わる見出しを段落に戻す変更）。
- 比べる基準 run（worktree `../app-worktrees/keywords` の `test-data/extraction-audit/`）: main 582a123 の dev `fr13` / 要素正解 `eg13`・`pg13`、変更後 `fr16` / `eg16` / `pg16`。評価用 `eval-hd0` → `eval-hd1`（この変更で 1 回）。
- 評価用はこの変更で 1 回使った。

## worktree（`/Users/harada/Desktop/MyProjects/projects/versio/app-worktrees/`）

- `keywords`: 上の基準 run と古い run（`fr*`、`kw1`、`rl1`〜`rl4`、`eval-*`）。`test-data/element-gold` を main へリンク済み。
- `word-space` / `figure-swallow`: 古い基準。不要なら削除してよい。

## 次の一手

1. 同じページの split-interrupted（dev 159）: 正解外の段落（表の略語の注、図のラベル、`Although` だけの断片）が間に入る型。1 つずつ原因が違う。
2. 側欄の下半分が抄録の途中に入るページ（`PMC13454063`）。
3. ページをまたぐ分断で前半が文末で終わる型は、字下げ・余白の手がかりが要る（見送ったことを参照）。

## 判断待ち・未確認

- PR #118（タイトルバーを戻す）は、別のフロントエンドのセッション向けの作業を誤ってこのセッションで作ったもの。閉じるかどうかはユーザーの判断待ち。
- #114 以降の抽出の変更は、ビルドした `.app` で確認していない。
