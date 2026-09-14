# macOS Developer ID signing & notarization

Paper Reader is distributed outside the Mac App Store (Developer ID).
This document covers **clean release** signing only. Fast development builds
(`npm run tauri:build:fast`) stay unsigned on purpose.

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
| `scripts/tauri-build.sh clean` | Build unsigned `.app`; if `PAPER_READER_SIGN=1`, sign then DMG; else unsigned DMG |
| `scripts/macos-sign-notarize.sh` | Sign/notarize `.app`, then `macos-build-dmg.sh`, then sign DMG |
| `scripts/macos-build-dmg.sh` | Create `.dmg` from an existing `.app` (no Tauri rebuild) |

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_TEAM_ID="TEAMID1234"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# or: export APPLE_NOTARY_PROFILE="paper-reader-notary"

PAPER_READER_SIGN=1 npm run tauri:build:clean
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
codesign --verify --deep --strict --verbose=2 "Paper Reader.app"
spctl --assess --type execute --verbose=4 "Paper Reader.app"
xcrun stapler validate "Paper Reader.app"

codesign --verify --verbose=2 "Paper Reader_….dmg"
xcrun stapler validate "Paper Reader_….dmg"
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
