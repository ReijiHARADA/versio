# Packaged `.app` release acceptance

PR CI covers TypeScript / Rust / lightweight Python / browser smoke and must not skip important Reader tests for missing fixtures.

Automated pre-steps: `npm run release:acceptance` (lint, test, build, Rust, Python, bench 100, and packaged E2E when a `.app` is already built).

This gate is for a built macOS `.app` (local `npm run tauri:build:clean` or notarized artifact).

Daily local checks may use `npm run tauri:build:fast` (cached Python, `.app` only). Release / CI acceptance must use **clean** so the Python runtime is rebuilt from `requirements.lock` + pinned patch Python and `.dmg` is produced.

Browser Playwright smoke alone is **not** packaged acceptance.

## Automated packaged E2E

```bash
npm run tauri:build:clean
npm run packaged:e2e
```

Harness: `scripts/packaged-e2e/run.sh`

- Launches the real `.app` with an isolated `HOME`
- Imports a tiny offline fixture (`PAPER_READER_ACCEPTANCE=1`, no MADLAD download)
- Creates an annotation, runs library search, writes an export marker
- Quits and relaunches; verifies paper + annotation persistence
- On failure: step log, screenshot, app log, app-data file summary under `scripts/packaged-e2e/artifacts/`

Signing / notarization (optional, secrets required): [MACOS_RELEASE.md](./MACOS_RELEASE.md)

## Must pass

1. PDF import → Library card _(automated via packaged E2E)_
2. Reader opens with original text (model may still be loading) _(body blocks + export from original)_
3. Annotation create / update / delete _(create + relaunch restore automated; update/delete remain manual)_
4. Library search (⌘K) and in-reader search (⌘F) _(library search automated; ⌘F UI manual)_
5. Source PDF open _(manual — Preview / Accessibility)_
6. Export (Markdown or verification package) _(markdown marker automated)_
7. App restart → state recovery (position, annotations, paper list) _(paper + annotation automated)_

## Out of scope for PR CI

- Full MADLAD-400 model download / MPS warmup
- Notarization / App Store upload (see [MACOS_RELEASE.md](./MACOS_RELEASE.md))

Those belong to nightly or human release acceptance. Translation quality audits stay on the existing audit scripts.
