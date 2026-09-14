# Packaged `.app` release acceptance

PR CI covers TypeScript / Rust / lightweight Python / browser smoke and must not skip important Reader tests for missing fixtures.

Automated pre-steps: `npm run release:acceptance`.

Browser Playwright smoke alone is **not** packaged acceptance.

## Release flow

```text
unit/integration checks
↓
clean .app build
↓
packaged integration E2E (Layer A)
↓
sign/notarize .app          (skip if no Apple credentials — label as unsigned)
↓
DMG from finalized .app
↓
sign/notarize DMG           (same credential gate)
↓
packaged UI E2E (Layer B) / Gatekeeper verification
↓
release artifact
```

When credentials are absent:

```text
unsigned acceptance passed
signed acceptance not executed
```

Do not mark the run as a signed release.

## Layer A — packaged integration (`npm run packaged:e2e:integration`)

Real `.app`, isolated `HOME`, offline fixture, no MADLAD.

Exercises app-data / import pipeline / annotation persistence / search backend /
export backend / relaunch. Service-assisted bootstrap is allowed here.

**Required:** `searchHits > 0` in `_acceptance/result.json`.

## Layer B — packaged UI E2E (`npm run packaged:e2e:ui`)

Accessibility / System Events drive the real UI:

import (Open panel) → Library card → Reader → memo Save → search UI hits →
export → quit → relaunch → paper still present.

DOM watcher records `_acceptance/ui-result.json`. Failure artifacts include
screenshot, step, app log, AX process dump, app-data summary.

`npm run packaged:e2e` runs Layer A then Layer B.

## Must pass

1. PDF import → Library card _(A + B)_
2. Reader original text _(A + B)_
3. Annotation create _(A backend; B via memo UI)_
4. Library / in-reader search with visible results _(A: searchHits>0; B: search UI hits)_
5. Source PDF open _(manual — Preview / Accessibility)_
6. Export _(A + B)_
7. Restart recovery _(A + B)_

Signing: [MACOS_RELEASE.md](./MACOS_RELEASE.md)

## Out of scope for PR CI

- Full MADLAD download / MPS warmup
- Notarization without configured secrets
