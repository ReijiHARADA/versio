---
type: Playbook
title: オンボーディング「使い方」2 ページ 実装計画
description: イントロ後に録画で使い方を見せる 2 ページを足す手順
tags: [onboarding, intro, plan]
status: draft
---

# Onboarding How-To Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イントロ（と PLaMo 画面）の後に「集める」「読む」の録画 2 ページを出し、ホームでそのまま真似できるようにする。

**Architecture:** `IntroOverlay` の step を `intro → plamo? → howto-collect → howto-read → close` に延ばす。ページは `HowToScreen`（動画・見出し・一文・次へ・スキップ）。動画は既存の撮影用デモモード（`npm run dev:demo`、`VITE_VERSIO_DEMO=1`、`src/services/presentationDemo.ts` の seed）を Playwright で台本どおりに操作して録り、ffmpeg で HEVC にする（既存 `scripts/record-presentation-demo.mjs` の偽カーソル方式を流用）。

**Tech Stack:** React + CSS Modules、Vitest、Playwright（`playwright` パッケージ）、ffmpeg（`/opt/homebrew/bin/ffmpeg`）。

**Spec:** `docs/superpowers/specs/2026-11-24-onboarding-howto-pages-design.md`

## Global Constraints

- 動画は `.app` 同梱。2 本合計 2 MB 以下（目安 1〜2 MB）、約 1280px 幅、HEVC（WKWebView 再生のため `-tag:v hvc1`）、音なし、各 10 秒前後。
- 文字は各ページ「見出し 1 行＋短い一文」だけ。吹き出し・コーチマークは作らない。
- PLaMo 導入済み／ダウンロード選択／「あとで」のどれでも 2 ページを表示する。ダウンロードは背景で続行。
- reduced-motion か動画エラー時はポスター静止画。
- 角丸は squircle ルール（`src/styles/squircle.module.css`、`squircleGuard.test.ts`）。新 UI は `UI_INTERACTION_PRINCIPLES.md` に従う。
- 録画のサンプルは demo seed（合成・撮影専用）だけ。実論文 PDF を repo に入れない。
- Introduction 論文は変更しない。

## Review Focus

- PLaMo 画面で「ダウンロード」を押した直後に howto へ進んでもダウンロードが止まらない（今は `close()` と同時に `download()`）。→ Task 1 のテスト。
- `plamo.state` が `"checking"` 等の未確定のまま CTA を押した場合も howto に進み、PLaMo 画面を誤って出さない。→ Task 1 のテスト。
- スキップ／はじめるのどちらで抜けても `markIntroSeen()` が呼ばれ、次回起動で再表示されない。→ Task 3 のテスト。
- 動画が読み込めない（壊れた asset・CSP）とき、ボタンが押せるまま静止画になる。→ Task 3 のテスト。
- 前ページの動画が裏で再生され続けない（ページ遷移でアンマウント）。→ Task 3 の実装注意＋実機確認。

---

### Task 1: step 遷移を純関数にする

**Files:**
- Modify: `src/components/intro/introSteps.ts`
- Create: `src/components/intro/introSteps.test.ts`

**Interfaces:**
- Produces: `type IntroStep = "intro" | "plamo" | "howto-collect" | "howto-read"`、`introStepAfterCta(state: PlamoModelState, preview?: boolean): "plamo" | "howto-collect"`、`nextIntroStep(step: IntroStep): IntroStep | "close"`（plamo→howto-collect、howto-collect→howto-read、howto-read→close）。

- [ ] **Step 1: 失敗するテストを書く**
  - `introStepAfterCta("absent")` → `"plamo"`、`("present")` → `"howto-collect"`、`("present", true)` → `"plamo"`、`("checking")` → `"howto-collect"`（PlamoModelState の未確定値を `usePlamoModel.ts` で確認して全部並べる）。
  - `nextIntroStep("plamo")` → `"howto-collect"`、`("howto-collect")` → `"howto-read"`、`("howto-read")` → `"close"`。
- [ ] **Step 2:** `npx vitest run src/components/intro/introSteps.test.ts` → FAIL
- [ ] **Step 3:** 実装（`"close"` を返していた箇所を `"howto-collect"` へ）。
- [ ] **Step 4:** 同コマンド → PASS
- [ ] **Step 5:** コミット `feat(intro): add how-to steps to onboarding flow`

### Task 2: 録画スクリプトと動画 asset

**Files:**
- Create: `scripts/record-howto.mjs`
- Modify: `package.json`（`"record:howto": "node scripts/record-howto.mjs"`）
- Create: `src/assets/intro/howto-collect.mp4`, `howto-read.mp4`, `howto-collect.jpg`, `howto-read.jpg`

**Interfaces:**
- Produces: 上記 4 ファイル（Task 3 が import）。

- [ ] **Step 1:** スクリプトは `npm run dev:demo` を子プロセスで起動（ポートは vite の出力から取る）→ Playwright で 1280×800、`recordVideo`、偽カーソル（`record-presentation-demo.mjs` の init script をそのまま流用）。オーバーレイは `navigator.webdriver` で出ないので気にしなくてよい。
  - 撮影 1「集める」: PDF を数本ウィンドウにドロップ（ブラウザ版は HTML5 drop。`page.dispatchEvent` に DataTransfer を渡す。demo build では `isPresentationDemoPdf` が fixture 化する）→ カードが「準備中 → 読める」になるまで待つ → カードをサイドバーのプロジェクトへドラッグ（pointer 追跡なので `mouse.down/move/up`）。
  - 撮影 2「読む」: 論文を開く → 日本語を少しスクロール → 段落の原文を開いて閉じる → テキストを選択してマーカー → ⌘K で検索語を打つ。
  - 各本を ffmpeg で切り出し、`-c:v libx265 -tag:v hvc1 -crf 30 -preset slow -an -vf scale=1280:-2,fps=30`、最後のフレームを jpg（品質 4 前後）で書き出す。
- [ ] **Step 2:** `npm run record:howto` を実行 → 4 ファイルができる。`ls -l src/assets/intro/howto-*` で mp4 合計が 2 MB 以下。
- [ ] **Step 3:** 各 mp4 から 3 フレームを抜いて縮小表示し、操作が読み取れるか目視（CLAUDE.md の画像縮小ルールに従う）。
- [ ] **Step 4:** コミット `feat(intro): record how-to clips from demo build`

### Task 3: HowToScreen と IntroOverlay 配線

**Files:**
- Create: `src/components/intro/HowToScreen.tsx`, `HowToScreen.module.css`, `HowToScreen.test.tsx`
- Modify: `src/components/intro/IntroOverlay.tsx`

**Interfaces:**
- Consumes: Task 1 の `IntroStep` / `introStepAfterCta` / `nextIntroStep`、Task 2 の 4 asset。
- Produces: `HowToScreen({ page: 1 | 2; total: 2; title: string; body: string; video: string; poster: string; still: boolean; primaryLabel: string; onNext(): void; onSkip(): void })`。

文言（確定）:
- 1: 見出し「PDF を落として、集める」／一文「ウィンドウに PDF をドロップすると読める状態になります。プロジェクトへドラッグして整理します。」／「次へ」
- 2: 見出し「日本語で読み、原文で確かめる」／一文「気になる段落は原文を開き、マーカーを引いて、⌘K でライブラリ全体から探せます。」／「はじめる」
- 両ページ共通の「スキップ」、ページ表示 `1 / 2`。

- [ ] **Step 1: 失敗するテストを書く**（Testing Library が未導入なら導入せず、`IntroOverlay` 経由ではなく `HowToScreen` を `react-dom/client` で描画して確認）
  - `still: true` なら `<img src={poster}>` があり `<video>` がない。
  - `<video>` の `error` を発火すると `<img>` に切り替わり、主ボタンは押せる。
  - 主ボタンで `onNext`、「スキップ」で `onSkip` が 1 回呼ばれる。
- [ ] **Step 2:** `npx vitest run src/components/intro/HowToScreen.test.tsx` → FAIL
- [ ] **Step 3:** 実装。`<video muted autoPlay loop playsInline>`、主ボタンにフォーカス。`PlamoSetupScreen` と同じ全面レイヤー（`data-tauri-drag-region`）、角丸は squircle。ページ遷移は `key` でアンマウントし、前の動画を止める。
- [ ] **Step 4:** `IntroOverlay` を `step: IntroStep` にする。CTA は `setStep(introStepAfterCta(plamo.state))`。PLaMo の「ダウンロード」は `void plamo.download(); setStep("howto-collect")`、「あとで」は `setStep("howto-collect")`。howto の onNext は `nextIntroStep`（`"close"` なら `close()`）、onSkip は `close()`。
- [ ] **Step 5:** `npx vitest run src/components/intro src/styles/squircleGuard.test.ts` と `npx tsc --noEmit` → PASS
- [ ] **Step 6:** コミット `feat(intro): show how-to pages after intro`

### Task 4: 実機確認と文書

**Files:**
- Modify: `CURRENT_STATE.md`（オンボーディングの項に 2 ページを追記）、`AGENTS.md`（オンボーディング行に `npm run record:howto` を追記）

- [ ] **Step 1:** `npm run onboarding:test -- build` → イントロ → PLaMo（preview）→「ダウンロード」→ 2 ページ → ホーム。下部の擬似進捗がページ表示中も進むこと、各ページのスクショ（縮小）を撮る。
- [ ] **Step 2:** 同じ app で「あとで」経路も 1 回確認。
- [ ] **Step 3:** 文書を更新してコミット `docs: onboarding how-to pages`
- [ ] **Step 4:** 見た目の変更なので before/after を見せて OK をもらってから PR をマージする。
