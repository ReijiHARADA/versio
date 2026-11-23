---
type: Plan
title: Design CSS refactor implementation plan
description: Task list for the no-visual-change CSS cleanup.
tags: [design, css, refactor]
status: stable
---

# Design CSS refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tokenize font sizes, delete unused CSS rules, split `AppSidebar.module.css`, with zero pixel diff.
**Architecture:** CSS Modules + `src/styles/variables.css` tokens; guards are vitest file scans like `tokenGuard.test.ts`.
**Tech Stack:** Vite, React, CSS Modules, vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-11-24-design-css-refactor-design.md`

## Global Constraints
- Rendered UI pixel-identical (root `html { font-size: 16px }`, so `Npx` == `N/16 rem`).
- `em` sizes, `var(--content-font-size)` and `calc()` stay as they are.
- Do not touch color / z-index / radius rules (already guarded).

## Review Focus
- `composes:` from another module that references a "dead" class → not dead; keep.
- Class names built dynamically (`styles[variant]`, template strings) → treat any class whose name appears as a string in TS/TSX as used.
- Split files: selector order changes cascade → keep the original order inside each new file and only move self-contained blocks.
- Media / `:global` / `@container` blocks wrapping moved rules must move with them.

---

### Task 1: Screenshot baseline
- [ ] Write `scratchpad/shots.mjs` (Playwright, 1280x800, light + dark): Library, sample paper Reader, Settings sections, sidebar expanded. Save PNGs into a given dir.
- [ ] Run on unchanged branch → `baseline/`. Run twice to confirm determinism (byte- or pixel-equal).

### Task 2: Font-size tokens + guard
**Files:** `src/styles/variables.css`, `src/styles/fontSizeGuard.test.ts` (new), component `*.module.css`.
- [ ] Test `fontSizeOffenders(css)`: flags `font-size: 1rem` / `12px`; passes `var(--font-size-*)`, `inherit`, `em` values, `calc(`, and lines with `font-size-literal-ok:`. Repo scan expects `[]`.
- [ ] Add tokens `--font-size-micro: 0.6875rem`, `--font-size-lead: 1rem`.
- [ ] Replace exact matches (rem or px equivalent) with tokens; annotate the remaining one-offs with `/* font-size-literal-ok: <reason> */`.
- [ ] Test + typecheck pass; screenshots equal baseline. Commit.

### Task 3: Delete unused class rules
- [ ] Script lists, per module, classes not referenced as `styles.x`, `styles["x"]`, string `"x"` in the importing TS/TSX, or `composes`.
- [ ] Remove only rules whose every selector is unused; screenshots equal baseline. Commit.

### Task 4: Split AppSidebar.module.css (dropped: 6 selectors cross sidebar state and tree classes; CSS Modules hash per file)
- [ ] Move sub-component blocks into `AppSidebar*.module.css` imported by the sub-component that uses them (order preserved).
- [ ] Tests, typecheck, lint, screenshots equal baseline. Commit, PR, merge, CURRENT_STATE note.
