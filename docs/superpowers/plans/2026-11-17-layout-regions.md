---
type: Playbook
title: ページ領域分割 第 1 段（表/図領域）実装計画
description: pageRegions.ts の追加、buildPageLines への組み込み、回帰計測までのタスク
tags: [extraction, layout, plan]
status: stable
---

# ページ領域分割 第 1 段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 表/図の領域内の行を段組の読み順から外し、キャプション直後に表ブロック（図は chrome）として差し込む。

**Architecture:** 純関数 `detectPageRegions` が罫線・画像・ベクター図形とキャプションから矩形を返す。`buildPageLines` が `orderPageLines` を呼ぶ直前に行を領域内外に分け、外側だけを従来ロジックで並べ、領域内の行を差し込む。`orderPageLines` 本体は変更しない。

**Tech Stack:** TypeScript, vitest, pdfjs-dist 3.11 legacy（既存の `ExtractedPage.imagePlacements` / `graphicsPrimitives` を使う）

**Spec:** `docs/superpowers/specs/2026-11-17-layout-regions-design.md`

## Global Constraints
- pdfjs-dist を上げない。`orderPageLines` / `detectPageColumns` の左→右ロジックを書き換えない。APPLY_MIN=0.75 / APPLY_MARGIN=0.12 を変えない。
- 新しい `LayoutRole` を足さない。表は `"table"`、図の中の文字は `"chrome"`。
- 調整は dev 部分集合（`test-data/extraction-audit/tools/dev300.txt`）だけ。評価用 405 本は Task 5 で 1 回だけ。
- 警告を消すためにゲート・閾値を緩めない。
- 有料サービス不可。PDF/JATS をコミットしない。

## Review Focus
1. 本文段落の上に重なった画像（背景・透かし・ページ全面画像）→ 本文は領域に入らず従来どおり。Task 1 のテスト `ignores full-page and tiny images` と `drops region that swallows prose`。
2. 2 段組で片段だけの表（段幅の表）→ 反対側の段の本文は領域外のまま、読み順が変わらない。Task 2 のテスト `column-width table keeps the other column order`。
3. キャプションが表の下にある（図は下、表は上が多いが逆もある）→ どちらでも領域が見つかる。Task 1 のテスト `caption below grid`。
4. 1 ページに表が 2 つ → 各表の行がそれぞれのキャプション直後に入り、混ざらない。Task 2 のテスト `two tables on one page`。
5. 1 ページ目の masthead 分岐（`pdfLayout.ts:2536-2541`）→ masthead 側・本文側の両方で領域処理が効く。Task 2 で両方の呼び出しを通す。

---

### Task 1: `detectPageRegions`（Codex: gpt-5.6-terra + medium）

**Files:**
- Create: `src/services/pdfExtraction/layout/pageRegions.ts`
- Modify: `src/services/pdfExtraction/generic/tableRegions.ts:15`（`captionAnchoredGraphicsGrids` を export するだけ。挙動不変）
- Test: `src/test/pdfExtraction/pageRegions.test.ts`

**Interfaces:**
- Consumes: `ExtractedPage`（`pdfService.ts:312`）、`LayoutLine` / `LayoutRect` / `isTableCaption` / `isFigureCaption`（`pdfLayout.ts`）、`captionAnchoredGraphicsGrids(page, captionBox): Rect[]`
- Produces:
  ```ts
  export type PageRegion = { kind: "table" | "figure"; rect: LayoutRect; evidence: "ruled-grid" | "image" | "vector"; captionLine?: LayoutLine };
  export function detectPageRegions(page: ExtractedPage, lines: LayoutLine[], bodyFontSize: number): PageRegion[];
  export function lineInRegion(line: LayoutLine, region: PageRegion): boolean; // bbox 中心が rect 内
  ```

- [ ] **Step 1: 失敗するテストを書く**（合成 `ExtractedPage` + `LayoutLine` をテスト内ヘルパで作る）
  - `ruled grid with table caption above → one table region`: 細い矩形 4 本以上の格子と、その上 12pt 以内の `Table 1. ...` 行 → `[{kind:"table", evidence:"ruled-grid"}]`、rect は格子を含む。
  - `caption below grid`: 同じ格子でキャプションが下 → table region 1 つ。
  - `grid without caption → none`。
  - `image with figure caption below → figure region`: `imagePlacements` にページ面積 10% の矩形、下に `Figure 2: ...` → `kind:"figure", evidence:"image"`。
  - `ignores full-page and tiny images`: ページ面積 95% の画像と 1% の画像 → `[]`。
  - `vector cluster with figure caption → figure region`: 罫線でない primitive が 20 個以上密集 + `Fig. 3` → `evidence:"vector"`。
  - `drops region that swallows prose`: 画像矩形の中に本文フォント（`bodyFontSize`）で 40 字超の行が 3 行連続 → `[]`。
  - `caption line itself is outside the region`: 返った region について `lineInRegion(captionLine, region) === false`。
- [ ] **Step 2: 失敗を確認** — `npx vitest run src/test/pdfExtraction/pageRegions.test.ts` → FAIL（モジュールが無い）
- [ ] **Step 3: 実装。** 画像の除外閾値はページ面積 2% 未満 / 90% 超。キャプション探索は rect の上下 `max(24, bodyFontSize*3)`pt 以内かつ x 範囲が重なる行。ベクター密集は罫線条件（`tableRegions.ts` と同じ）に当たらない primitive の連結成分（3pt 以内で接続）で 20 個以上。rect はキャプション行を含まないようにクリップ。本文らしい行の判定 = `|fontSize - bodyFontSize| <= 0.5` かつ `text.length > 40` が y 順で 3 行連続。
- [ ] **Step 4: 通過を確認** — 同コマンド → PASS。`npx vitest run src/test/pdfExtraction/tableRegionResolver.test.ts` も PASS（export 追加の影響なし）。
- [ ] **Step 5: Commit** `feat(extraction): detect table/figure page regions from grids, images, vectors`

### Task 2: `buildPageLines` に組み込む（Codex: gpt-5.6-terra + medium）

**Files:**
- Modify: `src/services/pdfLayout.ts:2530-2543`（`buildPageLines` の末尾）
- Test: `src/test/pdfExtraction/pageRegionsLayout.test.ts`

**Interfaces:**
- Consumes: Task 1 の `detectPageRegions` / `lineInRegion`
- Produces: `function orderWithRegions(lines: LayoutLine[], layout: PageColumnLayout, regions: PageRegion[]): LayoutLine[]`（`pdfLayout.ts` 内の非 export 関数）。`orderPageLines` の呼び出し 3 か所をこれに置き換える。

- [ ] **Step 1: 失敗するテストを書く**（`reconstructDocument([page])` を合成ページで呼ぶ）
  - `table rows leave the body flow`: 2 段組、左段に本文段落が表を挟んで続く（表の上に 3 行・下に 3 行、文は途中で切れている）、表は罫線格子 + `Table 1` キャプション → 本文は 1 つの `paragraph` ブロックに結合され、表の行は `role:"table"` ブロックとしてキャプションブロックの直後に来る。
  - `figure text becomes chrome`: 画像領域内のラベル行（`(a)`, `Accuracy`）→ 本文ブロックにも paragraph にも含まれない。
  - `column-width table keeps the other column order`: 左段に表、右段は本文のみ → 右段のブロックの順序が領域処理なしのとき（regions を空にした場合）と同一。
  - `two tables on one page`: 表 2 つ → 各 `table` ブロックが対応するキャプションの直後、テキストが混ざらない。
  - `no regions → identical output`: 罫線も画像も無いページ → 結果のブロック列が変更前と同一（スナップショットではなく text/role 配列で比較）。
- [ ] **Step 2: 失敗を確認** — `npx vitest run src/test/pdfExtraction/pageRegionsLayout.test.ts` → FAIL
- [ ] **Step 3: 実装。** `buildPageLines` 冒頭付近で `bodyFontSize` を行の本文中央値から求め（既存 `median` を使う）、`detectPageRegions(page, visible, bodyFont)` を 1 回呼ぶ。`orderWithRegions`: 領域外の行で `orderPageLines` → 各 region の行を y→x でソートし、表は `roleHint:"table"`、図は `roleHint:"chrome"` を付けて `captionLine` の直後に挿入（`captionLine` が無い/外側列に無ければ、rect 上端より上で最も近い外側行の直後。それも無ければ先頭）。masthead 分岐でも同じ regions を使う。
- [ ] **Step 4: 通過を確認** — 同コマンド PASS、続けて `npx vitest run` 全緑（失敗があれば出力の要約を報告し、勝手にテスト期待値を書き換えない）。
- [ ] **Step 5: Commit** `feat(extraction): order table/figure region lines after their caption`

### Task 3: 既知バグの再現（Claude）

**Files:**
- Test: `src/test/pdfExtraction/pageRegionsLayout.test.ts`（追記）
- Modify（再現したときだけ）: `src/services/pdfExtraction/projection/toPaper.ts` の表処理

- [ ] **Step 1:** covid-ml-review p5 を Task 2 後のコードで抽出し、表ブロックの文字が projection 後の Paper に残るか確認（`tools/lines.ts covid-ml-review 5`）。
- [ ] **Step 2:** 消えるなら、合成ページで「`role:"table"` ブロックの文字が `toPaper` 出力に残る」失敗テストを書き、根本原因を直す。消えないなら所見を CURRENT_STATE の記録に書くだけ。
- [ ] **Step 3: Commit**（変更があれば）`fix(extraction): keep table-region text through projection`

### Task 4: dev 部分集合で計測（Codex: gpt-5.6-terra + high）

**Files:**
- Modify: `test-data/extraction-audit/tools/*.sh|*.ts` の絶対パス（scratchpad 前提 → `test-data/extraction-audit/` 基準。tools はローカルのみ、コミットしない）

- [ ] **Step 1:** tools の絶対パスを直し、worktree から `tools/run.sh sub-r1 tools/dev300.txt` を実行（重い処理を並行させない）。
- [ ] **Step 2:** `docdiff.ts sub-c1 sub-r1` で論文ごとの intact 差を出し、悪化上位 10 本を `lost1.ts` で段落単位に出す。
- [ ] **Step 3:** `npm run test:extraction-corpus` を main（sub-c1 相当）と比較し、失敗が既存 15 件から増えていないか diff。
- [ ] **Step 4:** 報告は短く: intact / 印字 intact / 警告（fragment・complete・outside）の sub-c1 比、悪化 10 本の一覧（論文 ID・段落数・一行理由）、corpus 失敗の差分のみ。全ログは貼らない。

合格: intact が sub-c1（86.9%）以上、かつ outside 警告が 1059 未満。不合格なら Claude が悪化例を調べて Task 1 の閾値を調整し、Task 4 を再実行（最大 3 回。超えたらユーザーに相談）。

### Task 5: 評価用再計測・記録・PR（測定は Codex high、記録と PR は Claude）

- [ ] **Step 1:** 評価用 405 本を 1 回だけ再計測し、fix14 との比較表を作る。
- [ ] **Step 2:** `docs/EXTRACTION_INTEGRITY_AUDIT.md` に第 6 回として記録、`CURRENT_STATE.md` を更新、`HANDOFF.md`（ローカル）を更新。
- [ ] **Step 3:** `.app` を `npm run tauri:build:fast` でビルドし、表のある論文を 1 本 `open -a` で取り込み Reader で表と本文の順序を確認。
- [ ] **Step 4:** push（`HEAD:refs/heads/feat/layout-regions`）→ PR → CI 緑で自動マージ。
