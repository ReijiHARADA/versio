---
type: Playbook
title: macOS Developer ID signing & notarization
description: Versio のクリーンリリースの署名・公証手順と配布条件。
tags: [release, macos, signing]
---

# macOS Developer ID signing & notarization

Versio is distributed outside the Mac App Store (Developer ID).
This document covers **clean release** signing only. Fast development builds
(`npm run tauri:build:fast`) stay unsigned on purpose.

## PLaMo license condition (commercial distribution)

The translation model is PLaMo 3 Translate (PLaMo Community License). Commercial distribution requires registering with Preferred Networks, and the licensee's annual revenue must be ≤ ¥1B (10億円). Ship the license text (`licenses/plamo-community-license.txt`, shown in Settings → ライセンス) and keep the "Built with PLaMo" notice. The `llama-server` sidecar (`src-tauri/binaries/`) is signed as part of the `.app`.

## Correct order

```text
clean build → unsigned .app only
↓
sign nested Mach-O (failure = release failure; no `|| true`)
↓
sign .app bundle
↓
codesign --verify --deep --strict
↓
notarize .app → staple → spctl assess
↓
build DMG from the signed/stapled .app   (never from a pre-sign snapshot)
↓
sign / notarize / staple DMG
↓
verify DMG (+ mount and verify inner .app)
↓
packaged E2E / ship artifacts
```

Scripts:

| Script | Role |
| --- | --- |
| `scripts/tauri-build.sh clean` | Build unsigned `.app`; if `VERSIO_SIGN=1`, sign then DMG; else unsigned DMG |
| `scripts/macos-sign-notarize.sh` | Sign/notarize `.app`, then `macos-build-dmg.sh`, then sign DMG |
| `scripts/macos-build-dmg.sh` | Create `.dmg` from an existing `.app` (no Tauri rebuild) |

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_TEAM_ID="TEAMID1234"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# or: export APPLE_NOTARY_PROFILE="versio-notary"

VERSIO_SIGN=1 npm run tauri:build:clean
# equivalent split:
#   npm run tauri:build:clean          # without SIGN → unsigned .app + unsigned DMG
#   npm run macos:sign                 # signs existing .app and rebuilds DMG from it
```

Without Apple credentials:

```text
unsigned acceptance passed
signed acceptance not executed
```

Do **not** treat unsigned artifacts as a signed release.

## In-app updates (GitHub Releases)

The app checks `https://github.com/ReijiHARADA/versio/releases/latest/download/latest.json` on launch (silent) and from Versio → アップデートを確認…. Updates are verified with the updater key, separate from the Apple signature.

- Private key: `~/.tauri/versio-updater.key` (outside the repo, empty password). Public key: `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Losing the private key means existing installs can no longer update; back it up.
- Release: bump `version` in `src-tauri/tauri.conf.json` → `VERSIO_SIGN=1 npm run tauri:build:clean` → `bash scripts/macos-publish-update.sh --publish`. The archive is made from the final (notarized) `.app`, so it must run after signing.
- Without `--publish` the script only writes `src-tauri/target/release/bundle/updater/` (archive, `.sig`, `latest.json`).

## GitHub Actions secrets (recommended names)

Store credentials in repository / org secrets — never in git.

| Secret | Purpose |
| --- | --- |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: … (TEAMID)` |
| `APPLE_CERTIFICATE_P12` | Base64-encoded `.p12` Developer ID certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email for notarytool |
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_NOTARY_PROFILE` | Optional keychain profile name |

## Verification (required)

```bash
codesign --verify --deep --strict --verbose=2 "Versio.app"
spctl --assess --type execute --verbose=4 "Versio.app"
xcrun stapler validate "Versio.app"

codesign --verify --verbose=2 "Versio_….dmg"
xcrun stapler validate "Versio_….dmg"
# mount DMG and re-run codesign/spctl on the inner .app (done by macos-sign-notarize.sh)
```

## Current macOS capabilities vs distribution

| Capability | Status | Notes |
| --- | --- | --- |
| `macOSPrivateApi: true` | Used | **Conflicts with Mac App Store** sandbox — recorded only; unchanged for Developer ID. |
| Apple Vision OCR | Used | Developer ID OK |
| Python translation sidecar | Bundled | Nested Mach-O must sign successfully |
| Preview page jump | Best-effort | Keep on **manual** acceptance |
| Entitlements | `src-tauri/entitlements.plist` | Hardened runtime |

## Failure modes this flow prevents

- DMG shipping an unsigned / pre-sign `.app`
- Nested signing failures swallowed by `|| true`
- Claiming notarized without staple / `spctl`
- Signing the fast daily build path
- Committing Apple credentials
