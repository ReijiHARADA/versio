# Packaged `.app` release acceptance

PR CI covers TypeScript / Rust / lightweight Python / browser smoke and must not skip important Reader tests for missing fixtures.

Automated pre-steps: `npm run release:acceptance` (lint, test, build, Rust, Python, bench 100).

This gate is for a built macOS `.app` (local `npm run tauri:build:clean` or notarized artifact).

Daily local checks may use `npm run tauri:build:fast` (cached Python, `.app` only). Release / CI acceptance must use **clean** so the Python runtime is rebuilt from `requirements.lock` + pinned patch Python and `.dmg` is produced.

## Must pass

1. PDF import → Library card
2. Reader opens with original text (model may still be loading)
3. Annotation create / update / delete
4. Library search (⌘K) and in-reader search (⌘F)
5. Source PDF open
6. Export (Markdown or verification package)
7. App restart → state recovery (position, annotations, paper list)

## Out of scope for PR CI

- Full MADLAD-400 model download / MPS warmup
- Notarization / App Store upload

Those belong to nightly or human release acceptance. Translation quality audits stay on the existing audit scripts.
