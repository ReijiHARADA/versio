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

- マージ済み: #238（quality.ts の MADLAD 時代の export 削除、Codex）、#239（CRF の参考文献の間に挟まった続き）、#240（段落になった式の後の where 句）、#245（ページ番号フッターをまたぐ全ページ図表の先読み）、#247（表の点数の正規表現の記録）。#249（ページ 1 の重複した著者行）。
- 基準 run（`test-data/extraction-audit/`、接頭辞 `ft`）: main 703ac32 の `ft0-*`。最新の main 相当は `ft10-*`（dev / elementgold / pg106）。worktree は `../app-worktrees/element-notes`。
- dev の段落正解: intact 90.6→90.7%、警告 1,482→1,408（誤警告 278→261、outside 546→521）。

## 次の一手

1. 表に飲み込まれた本文段落（dev 約 95）: `weakTableGeometryOnNarrative` を本文らしさの判定に置き換え、表のセルが減る表を 1 本ずつ見る（見送ったことを参照）。
2. 表の後の略語の注（`TST, total sleep time; …`）を表の注記にする。
3. ページ 1 の側欄の日付・編集者（`RECEIVED`、`Academic Editors:`）が抄録の途中に入る型。

## 判断待ち・未確認

- 評価用 split はこのセッションでは未使用。
- `.app` での確認はしていない（抽出の変更のみ）。
