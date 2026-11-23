---
type: Playbook
title: 初回起動イントロ（ホチキス）実装計画
description: Blender でホチキス綴じアニメーションをレンダーし、初回起動オーバーレイとして表示する手順
tags: [onboarding, animation, blender]
status: stable
---

# 初回起動イントロ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** 初回起動時に「紙の裏から見たホチキス綴じ」動画を全面表示し、最終フレームに綴じ跡ロゴ + 「Versioを使い始める」CTA を出す。

**Architecture:** Blender スクリプトで動画と最終フレーム PNG を生成して `src/assets/intro/` に同梱。React の `IntroOverlay` が App ルートで全面オーバーレイとして再生し、`localStorage` で既読管理。

**Tech Stack:** Blender (`/Applications/Blender.app`) + ffmpeg、React 19、CSS Modules、vitest。

**Spec:** `docs/superpowers/specs/2026-11-20-stapler-intro-design.md`

## Global Constraints
- 綴じ跡の形状・鋼材は `design/icon/staple_icon.py` と同じ定義（見た目をアイコンに一致）。
- 動画は H.264 MP4（yuv420p, faststart）、約 2.5 秒、目安 1MB 前後。
- 紙は明暗どちらでも白。ルートは増やさない。
- 既読キー `versio.introSeen`。CTA / スキップで記録、途中終了は未記録。
- 音は Web Audio 合成（後でユーザー録音ファイルに差し替え可能な 1 関数に閉じる）。

## Review Focus
- 動画が読み込めない / 再生失敗 → 最終フレーム PNG + CTA を即表示（Task 2 のテスト）。
- `prefers-reduced-motion` → 動画を出さず静止画 + CTA（Task 2 のテスト）。
- localStorage が throw する → イントロを出さずアプリを使える（Task 2 のテスト）。
- 小さいウィンドウ / 縦長 → 綴じ跡が中央・CTA が画面内（ブラウザ確認）。
- 自動再生で音がブロックされる → 無音で続行、例外を出さない（実装で try/catch）。

---

### Task 1: Blender アニメーション生成

**Files:**
- Create: `design/intro/stapler_intro.py`, `design/intro/render.sh`
- Create (生成物): `src/assets/intro/intro.mp4`, `src/assets/intro/final.png`

- [ ] `staple_icon.py` から綴じ跡ジオメトリ・鋼材を流用（関数を import できない構造ならコピー元を明記して複製）。
- [ ] シーン：カメラは紙の裏側正面（16:10, 1600×1000）。白い紙の平面。下あご（受け皿：溝付きの鋼板 + 黒い樹脂ベース）が画面外の手前から迫り、画面を覆って紙に押し当てる → 0.1 秒で紙が微小にたわむ（綴じる瞬間 = フレーム番号を `render.sh` に出力）→ 受け皿が引いて綴じ跡が残る。30fps、約 75 フレーム。
- [ ] 最終フレームを `final.png` に、全フレームを ffmpeg で `intro.mp4` に。
- [ ] 確認：中間フレーム 2 枚と最終フレームを縮小してチェック。サイズ `ls -l` で 2MB 未満。
- [ ] Commit。

### Task 2: IntroOverlay

**Files:**
- Create: `src/components/intro/IntroOverlay.tsx`, `IntroOverlay.module.css`, `introSeen.ts`, `stapleSound.ts`
- Modify: `src/App.tsx`（`<HashRouter>` 直下に `<IntroOverlay />`）
- Test: `src/components/intro/introSeen.test.ts`

**Interfaces:** `hasSeenIntro(storage?: Storage): boolean`（throw 時 true）、`markIntroSeen(storage?: Storage): void`、`playStapleSound(): void`、定数 `CLINCH_TIME_S`（Task 1 の綴じフレーム / 30）。

- [ ] テスト：未設定→false、mark 後→true、getItem が throw→true、setItem が throw→例外なし。
- [ ] 実装。オーバーレイ：白背景の全面 `<video muted playsInline autoPlay>`（object-fit: cover, 中央）。`timeupdate` で `CLINCH_TIME_S` を越えた初回に `playStapleSound()`。`ended` / `error` / reduced-motion で `final.png` 表示状態へ → CTA フェードイン。右上「スキップ」と Esc は最終状態へではなく即閉じ + 記録。CTA で記録 + 0.4s フェードアウト。
- [ ] `vitest run src/components/intro` PASS、`tsc --noEmit` PASS。
- [ ] Commit。

### Task 3: 確認と記録
- [ ] `npm run dev` で localStorage を消してイントロ → 中盤・最終をスクリーンショット確認（縮小）。
- [ ] `npm run tauri:build:fast` の `.app` で再生・音・2 回目起動で出ないことを確認。
- [ ] `CURRENT_STATE.md` に初回イントロを追記。PR → マージ。
