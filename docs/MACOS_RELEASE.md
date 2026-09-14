# macOS Developer ID signing & notarization

Paper Reader is distributed outside the Mac App Store (Developer ID).
This document covers **clean release** signing only. Fast development builds
(`npm run tauri:build:fast`) stay unsigned on purpose.

## Flow

```text
npm run tauri:build:clean
↓
codesign (hardened runtime + entitlements)
↓
notarytool submit + wait
↓
stapler staple
↓
codesign --verify / spctl --assess / stapler validate
↓
npm run packaged:e2e   # real .app acceptance
↓
ship .app + .dmg
```

Helper script:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_TEAM_ID="TEAMID1234"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# or: export APPLE_NOTARY_PROFILE="paper-reader-notary"

npm run tauri:build:clean
npm run macos:sign
# optional one-shot:
# PAPER_READER_SIGN=1 npm run tauri:build:clean
```

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
| `APPLE_NOTARY_PROFILE` | Optional keychain profile name (local/CI with unlocked keychain) |

CI sketch (not wired as required PR check):

1. Decode `APPLE_CERTIFICATE_P12` into a temporary keychain
2. `npm run tauri:build:clean`
3. `npm run macos:sign`
4. Upload stapled `.app` / `.dmg` artifacts
5. `npm run packaged:e2e`

## Verification (required)

Notarization success alone is not enough. After staple:

```bash
codesign --verify --deep --strict --verbose=2 "Paper Reader.app"
spctl --assess --type execute --verbose=4 "Paper Reader.app"
xcrun stapler validate "Paper Reader.app"
```

## Current macOS capabilities vs distribution

| Capability | Status | Notes |
| --- | --- | --- |
| `macOSPrivateApi: true` | Used | Needed for some window / WebView behaviors. **Conflicts with Mac App Store** sandbox rules — record only; do not change for this release. |
| Apple Vision OCR | Used | Works with Developer ID; no special entitlement beyond hardened runtime. |
| Python translation sidecar | Bundled resource | Nested binaries must be signed (script walks Mach-O under `.app`). |
| Preview page jump | Best-effort | Accessibility / Preview automation — keep on **manual** acceptance. |
| Filesystem app-data | Used | Standard Application Support path. |
| Entitlements | `src-tauri/entitlements.plist` | JIT / unsigned executable memory for WebView + wasm; library validation disabled for sidecar; network client/server; user-selected files. |

App Store submission is **out of scope**. Keep `macOSPrivateApi` as-is for Developer ID builds.

## Local vs CI

- Local: use the env vars above, or `xcrun notarytool store-credentials` → `APPLE_NOTARY_PROFILE`.
- CI: import the `.p12` into a temporary keychain each job; never cache the keychain across forks.

## Failure modes this flow prevents

- Shipping an ad-hoc / unsigned `.app` that Gatekeeper blocks for third parties
- Claiming “notarized” without staple / `spctl` verification
- Accidentally signing the fast daily build path (slowing iteration)
- Committing Apple credentials into the repository
