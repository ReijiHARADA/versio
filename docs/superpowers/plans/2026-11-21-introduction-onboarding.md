---
type: Playbook
title: Introduction オンボーディング実装計画
description: 同梱 Introduction 論文の初回投入、設定のサンプル追加削除、動画後の PLaMo 導入ステップ
tags: [onboarding, plan]
status: draft
---

# Introduction Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初回起動でライブラリに英日対訳の Introduction 論文が入り、動画の後に PLaMo のダウンロードを案内する。

**Architecture:** 既存の sample paper 経路（`src/data/samplePaper.ts` + `src/services/samplePaper.ts` → `savePaper`/`saveSections`/`saveBlocks`）を Introduction に置き換え、`AppShell` の起動時ロード直後に一度だけ投入する。PLaMo ステップは `IntroOverlay` の CTA 後に同じオーバーレイ内で出す。

**Tech Stack:** React + TS, Vitest, Tauri v2, SQLite settings (`saveSetting`/`getSetting`)

**Spec:** `docs/superpowers/specs/2026-11-21-introduction-onboarding-design.md`

## Global Constraints

- 論文 id: `versio-introduction`。投入済みフラグの setting key: `onboarding.introductionSeeded`（値 `true`）。
- 投入条件: フラグ未設定 **かつ** `getAllPapers()` が 0 件。投入したら（成否に関わらず試行後でなく、成功後に）フラグを立てる。
- 新しい route を作らない。PLaMo は `download_plamo_model` / `plamo_model_status` の既存コマンドだけを使う。
- PLaMo ステップの文言: 見出し「翻訳モデルを入れる」、本文「英語論文を日本語で読むために、翻訳モデル（約 1.8 GB）をダウンロードします。あとで設定からも入れられます。」、ボタン「ダウンロード」「あとで」。

## Review Focus

1. 動画後に「ダウンロード」を押した後、設定を開くと「ダウンロード」ボタンが再び出て二重ダウンロードになる → 設定側も downloading を表示すること（Task 3 でダウンロード状態をモジュール共有にしテスト）。
2. Introduction をゴミ箱に入れて再起動 → 戻ってこないこと（Task 2 のフラグテスト）。
3. 既存ユーザー（論文 1 本以上）でアップデート → Introduction が増えないこと（Task 2）。
4. ブラウザ版（非 Tauri）で CTA を押す → PLaMo ステップを出さずに閉じること（Task 3）。
5. 対訳ブロックの片側欠落（original だけ、translated 空）→ Reader で訳文が空表示にならないこと（Task 1 のデータ整合テスト）。

---

### Task 1: Introduction 論文データ

**Files:**
- Modify (全面置換): `src/data/samplePaper.ts` → rename to `src/data/introductionPaper.ts`、export を `introductionPaper` / `introductionSections` / `introductionBlocks` に。
- Test: `src/data/introductionPaper.test.ts`

**Interfaces:**
- Produces: `introductionPaper: Paper`（id `versio-introduction`, titleOriginal `"Versio: Reading Papers Across Languages"`, titleTranslated `"Versio：言語を越えて論文を読む"`）、`introductionSections: Section[]`、`introductionBlocks: PaperBlock[]`。型は既存 samplePaper と同じ（`src/types/paper`）。

- [ ] Step 1: テスト `introductionPaper.test.ts`: 全 block の `paperId === "versio-introduction"`、全 paragraph/heading block に非空の original と translated、section id の参照が全部 `introductionSections` に存在、block id 重複なし、章見出しに `Importing`, `Translation`, `Notes`, `Glossary`, `Search`, `Workspace`, `Export`, `PLaMo` を含む。
- [ ] Step 2: `npx vitest run src/data/introductionPaper.test.ts` → FAIL（module なし）
- [ ] Step 3: データを書く。章: Abstract / 1 Introduction / 2 Importing Papers（ウィンドウへ PDF ドロップ、カードの準備状態）/ 3 Reading and Translation（原文⇄訳文の切り替え）/ 4 Notes and Glossary（テキスト選択→メモ、用語登録）/ 5 Search（⌘K ライブラリ、⌘F 論文内）/ 6 Organizing with Workspaces（行をサイドバーへドラッグ、Inbox へ戻す）/ 7 Exporting / 8 Translation Model (PLaMo)（初回ダウンロード、設定から再取得）/ References。各章に「Try it: …」段落を 1 つ。既存 sample の figure/equation/reference block の形を流用し 1 つずつ入れる。図アセットは既存 sample が使うものだけ（新規画像なし）。英日とも本文は自然な文で、操作名は実 UI のラベルと一致させる（ラベルは grep で確認）。
- [ ] Step 4: テスト PASS
- [ ] Step 5: commit `feat(onboarding): add bundled Introduction paper data`

### Task 2: 初回投入 + 設定のサンプル追加削除

**Files:**
- Modify: `src/services/samplePaper.ts` → rename `src/services/introductionPaper.ts`
- Modify: `src/components/shell/AppShell.tsx:76-83`（`setPapers(dbPapers)` の直後）
- Modify: `src/components/settings/SettingsScreen.tsx`（sample の import / state / `handleAddSample` / ボタン削除）、`src/components/settings/DiagnosticsSettingsSection.tsx`（参照があれば削除）
- Modify: `scripts/verify-browser.mjs:158,281-290`（設定ボタンを押す代わりに Library の Introduction カードを待つ）、`scripts/bench-translation-ui.ts`（import 先の追従）
- Test: `src/services/introductionPaper.test.ts`

**Interfaces:**
- Consumes: Task 1 の exports。
- Produces: `seedIntroductionPaper(existingPaperCount: number): Promise<"added" | "skipped">`。

- [ ] Step 1: テスト（`database` を vi.mock）: (a) count 0・フラグなし → savePaper/saveSections/saveBlocks 呼ばれ `saveSetting("onboarding.introductionSeeded", true)`、戻り `"added"`、libraryCache に追加。(b) フラグ true・count 0 → `"skipped"`、savePaper 呼ばれない。(c) フラグなし・count 1 → `"skipped"` かつフラグを立てる（既存ユーザーには今後も入れない）。(d) savePaper が throw → フラグを立てない、例外は呼び出し側へ。
- [ ] Step 2: FAIL 確認 `npx vitest run src/services/introductionPaper.test.ts`
- [ ] Step 3: 実装。AppShell では `void seedIntroductionPaper(dbPapers.length).catch((e) => console.warn("Failed to seed Introduction:", e))`。presentation demo 分岐では呼ばない。
- [ ] Step 4: PASS、`npx tsc --noEmit -p .` クリーン、`grep -rn "samplePaper\|addSamplePaper\|サンプル論文" src scripts | grep -v test/data` が 0 件。
- [ ] Step 5: commit `feat(onboarding): seed Introduction once on empty first launch; drop settings sample button`

### Task 3: 動画後の PLaMo ステップ

**Files:**
- Modify: `src/components/settings/usePlamoModel.ts`（ダウンロード中 promise をモジュール変数で共有）
- Modify: `src/components/intro/IntroOverlay.tsx`, `IntroOverlay.module.css`
- Test: `src/components/settings/usePlamoModel.test.ts`, `src/components/intro/IntroOverlay.test.tsx`

**Interfaces:**
- Consumes: 既存 `usePlamoModel(): { state, percent, error, download }`。
- Produces: 変更なしの同シグネチャ。新たに、別インスタンスがマウントされたときダウンロード中なら `state === "downloading"` で始まる。

- [ ] Step 1: テスト（`@tauri-apps/api/core` / `event` を mock、Tauri 判定を true）: `usePlamoModel` インスタンス A で `download()`（invoke を未解決 promise に）→ 新規インスタンス B の state が `"downloading"`、B で `download()` を呼んでも invoke("download_plamo_model") は 1 回だけ。IntroOverlay: CTA クリック時、state `absent` → 「翻訳モデルを入れる」表示、「ダウンロード」で download 呼び出し＋閉じる、「あとで」で閉じるだけ。state `present` / `unavailable` → CTA で即閉じる（ステップ非表示）。
- [ ] Step 2: FAIL 確認
- [ ] Step 3: 実装。`usePlamoModel` に `let inflight: Promise<void> | null` を置き、download は inflight を再利用、初期 state は inflight があれば `"downloading"`。IntroOverlay は `step: "intro" | "plamo"`、CTA の `close` 前に `state === "absent"` なら step を `"plamo"` に。ステップの見た目は既存 `.cta` の pill トーンに合わせ、Global Constraints の文言をそのまま使う。`role="dialog"` を維持し、ステップ表示時に「ダウンロード」へ focus。
- [ ] Step 4: PASS
- [ ] Step 5: commit `feat(onboarding): offer PLaMo download after the intro`

### Task 4: 確認と文書

- [ ] Step 1: `npm run dev` + `npm run verify:browser` → 全 check PASS（Introduction が自動で入り Reader suite が通る）。Library と Reader のスクショ 1 枚ずつ確認（縮小して読む）。
- [ ] Step 2: `npm run tauri:build:fast` の `.app` を新しい AppData で起動 → 動画 → PLaMo ステップ表示 → ライブラリに Introduction。可能なら既存 AppData の `/Applications/Versio.app` で Introduction が増えないことも確認。
- [ ] Step 3: CURRENT_STATE.md の機能一覧に「初回起動で Introduction 論文を投入、動画後に PLaMo 導入案内。設定のサンプル論文追加は廃止」を追記。spec / plan を `status: stable` に。
- [ ] Step 4: `npx vitest run` 全体を 1 回（サマリ行のみ）。commit、PR。
