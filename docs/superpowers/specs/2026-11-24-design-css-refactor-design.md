---
type: Spec
title: Design CSS refactor (no visual change)
description: Tokenize font sizes, delete unused CSS, split oversized CSS modules without changing pixels.
tags: [design, css, refactor]
status: draft
---

# Design CSS refactor (no visual change)

## Intent
Make the CSS easier to maintain. The rendered UI must stay pixel-identical.

## Goals
- Replace font-size literals that equal an existing token (`--font-size-title/heading/body/small/caption`) with `var(...)`.
- Add a guard (in `tokenGuard.test.ts` style) that fails on new font-size literals; keep the non-token values (e.g. `0.6875rem`, `1rem`, `11px`) via an explicit allow comment, or add tokens only where a value repeats.
- Delete class rules no TS/TSX file references.
- Split `AppSidebar.module.css` (950 lines) by sub-component.

## Non-goals / anti-goals
- No spacing scale, no value rounding, no color or layout changes. Any pixel diff is a failure.

## Approaches
1. Font-size tokens + dead CSS removal + file split (chosen).
2. Also tokenize exact-match spacing: rejected, adds names without an enforceable scale.
3. Unify spacing to a scale: rejected, changes visuals.

## Verification
Before/after Playwright screenshots of Library, Reader, Settings, sidebar; pixel compare must be zero diff. Unit tests + typecheck.
