---
type: Playbook
title: ページ領域分割 第 2 段 実装計画
description: 1 行飛びの読み順修正（B）と脇欄領域（A）の実装手順
tags: [extraction, layout, plan]
status: draft
---

# ページ領域分割 第 2 段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 段組の行割り当ての誤り（1 行飛び）と脇欄の混在を直し、dev 部分集合の lost-text / split-column / interleaved を減らす。

**Architecture:** B は `pdfLayout.ts` の行の段割り当て（`column` を付ける段階）か `orderPageLines` の切断候補の条件だけを直し、並べ順のロジックは変えない。A は `pageRegions.ts` に `"sidebar"` を足し、第 1 段の regionId 経路で 1 ブロックにまとめる。

**Tech Stack:** TypeScript, pdfjs-dist 3.11 legacy, vitest, vite-node（監査スクリプト）。

**Spec:** `docs/superpowers/specs/2026-11-17-layout-columns-design.md`

## Global Constraints

- `pdfLayout.ts` の「段組は左→右」の順序ロジックを書き換えない（AGENTS.md）。
- 調整は dev のみ。評価用 405 本は最後に 1 回。
- ゲート・警告条件を緩めない。本文を本文外へ捨てない。
- 有料依存・ML モデル・新しい依存を足さない。
- `test-data/extraction-audit/` はコミットしない（ローカルの監査出力）。

## Review Focus

1. 本当の 2 段組ページで、段をまたぐ見出し・キャプション・抄録が spanning のまま残ること（B が spanning を減らしすぎない）。→ Task 2 のテスト `keeps a real spanning heading as a cut`。
2. 枠で囲まれた表（罫線グリッド）が sidebar でなく table のままであること。→ Task 3 のテスト `ruled table stays a table region`。
3. ページ全体の枠や背景色のあるページで、本文が sidebar にならないこと。→ Task 3 のテスト `page-wide frame is not a sidebar`。
4. 1 段組ページ（`isMultiColumn = false`）の順序が変わらないこと。→ 既存の `pdfLayout` テストと extraction-corpus の差分なし。
5. 脇欄の中が本文と同じ書式の長い文章（本文に囲み線があるだけ）の場合、領域を捨てること。→ Task 3 のテスト `body-like boxed prose is not a sidebar`。

---

### Task 0: 基準 run と自動分類

**Files:**
- Create: `test-data/extraction-audit/tools/classify.ts`（コミットしない）

- [ ] **Step 1:** 基準 run `sub-d0` を取る: `test-data/extraction-audit/tools/run-wt.sh sub-d0 test-data/extraction-audit/tools/dev300.txt`。期待: intact と原因内訳が出る。
- [ ] **Step 2:** `classify.ts <run>` を書く。score と同じ整列（`alignParagraphs` / `paragraphCause`）で lost-text・split-column・interleaved-columns の段落ごとに、欠けた shingle を含むブロックを探し、`displaced-line`（欠けが正解の 25% 以下で、別ブロックの 1〜2 行に収まる）/ `sidebar`（混ざった相手のブロックが塗り・枠の矩形内のページ位置にある）/ `other` に分ける。出力: 種類ごとの件数と各 5 例（論文 ID・ページ）。
- [ ] **Step 3:** 件数を見て B → A の順を確定する。A が B より多ければユーザーに報告して順序を確認する。

### Task 1: 1 行飛びの原因特定

- [ ] **Step 1:** `displaced-line` の例 10 件について `tools/lines.ts <doc> <page>` で飛んだ行の `column` と座標を確認し、原因の型ごとに件数を表にする（候補: gutter をまたいで spanning、引用上付きで行が割れる、その他）。
- [ ] **Step 2:** 原因の型と件数を `docs/EXTRACTION_INTEGRITY_AUDIT.md` 第 6 回の下書きに書く。最多の型から Task 2 で直す。

### Task 2: 1 行飛びの修正（型ごとに繰り返す）

**Files:**
- Modify: `src/services/pdfLayout.ts`（段割り当て、または `orderPageLines` の `spanningMid` の条件）
- Test: `src/services/pdfLayout.test.ts`（既存の行データ組み立てヘルパーに合わせる）

**Interfaces:**
- Produces: `orderPageLines` / `detectPageColumns` の公開シグネチャは変えない。

- [ ] **Step 1:** 型の再現テストを書く（実例から行座標を写した合成行データ）。名前は `keeps <型> line in its column`。期待: 飛んだ行が同じ段の前後の行の間に出る。
- [ ] **Step 2:** `npx vitest run src/services/pdfLayout.test.ts` で失敗を確認。
- [ ] **Step 3:** 修正。Review Focus 1 のテスト `keeps a real spanning heading as a cut` も同じファイルに足す（段をまたぐ見出しの前後で左→右が切れること）。
- [ ] **Step 4:** テスト緑を確認。
- [ ] **Step 5:** dev 部分集合を回して `sub-d0` と比べる（`docdiff.ts sub-d0 <run>`）。悪化した論文は目で見て、悪化が改善より多い修正は戻す。
- [ ] **Step 6:** コミット `fix(extraction): keep <型> lines in their column`。

### Task 3: 脇欄領域

**Files:**
- Modify: `src/services/pdfExtraction/layout/pageRegions.ts`（`PageRegion.kind` に `"sidebar"`、証拠 `"frame" | "fill"`）
- Modify: `src/services/pdfLayout.ts`（`detectPageColumns` に渡す行から領域内を除く、sidebar の差し込み位置）
- Test: `src/services/pdfExtraction/layout/pageRegions.test.ts`

**Interfaces:**
- Consumes: 既存 `detectPageRegions(page, lines, bodyFontSize): PageRegion[]`、`lineInRegion`。
- Produces: `PageRegion.kind: "table" | "figure" | "sidebar"`。sidebar の行は regionId 付きで 1 ブロック、`roleHint` は付けない（段落のまま）。

- [ ] **Step 1:** テストを書く:
  - `detects a framed sidebar`: 枠矩形の中に 4 行 → `kind: "sidebar"`。
  - `ruled table stays a table region`（Review Focus 2）。
  - `page-wide frame is not a sidebar`（Review Focus 3、矩形がページ幅の 80% 超）。
  - `body-like boxed prose is not a sidebar`（Review Focus 5、本文フォントで 40 字超の行が 3 行以上かつ矩形が段幅以上）。
- [ ] **Step 2:** 失敗を確認。
- [ ] **Step 3:** 実装。sidebar ブロックは領域上端に最も近い外側の行の直後に置き、本文段落と結合しない。
- [ ] **Step 4:** テスト緑。`detectPageColumns` を領域外の行で判定する変更を同じタスクで入れ、`npx vitest run src/services` 緑。
- [ ] **Step 5:** dev 部分集合で比較（Task 2 と同じ手順）。
- [ ] **Step 6:** コミット `feat(extraction): split framed sidebars into their own region`。

### Task 4: 回帰と記録

- [ ] **Step 1:** `npx vitest run` 全緑（サマリー行のみ確認）。
- [ ] **Step 2:** `npm run test:extraction-corpus` の失敗集合が main と同じ（diff で確認、Codex に任せてよい）。
- [ ] **Step 3:** 評価用 405 本を 1 回計測（Codex 可）。
- [ ] **Step 4:** `docs/EXTRACTION_INTEGRITY_AUDIT.md` 第 6 回、`CURRENT_STATE.md`（user-visible な抽出品質の変化）、`test-data/extraction-audit/HANDOFF.md` を更新。
- [ ] **Step 5:** PR 作成、CI 緑で自動マージ。
