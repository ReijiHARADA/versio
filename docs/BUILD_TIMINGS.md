# Build timings

Paper Reader packaged builds use `scripts/tauri-build.sh` and write `.build-timings` at the repo root.

## Commands

| Command | Python | Artifacts | Use |
| --- | --- | --- | --- |
| `npm run tauri:build:fast` | content-hash cache | `.app` only | daily check |
| `npm run tauri:build:clean` / `tauri:build` | always rebuild from lock | `.app` + `.dmg` | release / CI acceptance |

## Phases

1. Python runtime prep (`scripts/bundle-python.sh`)
2. Stage resources (`scripts/stage-translation-bundle.sh`)
   - lite `bundled-resources/translation-server/` (no venv) for Tauri
   - `bundled-resources/translation-venv/` injected after bundle
3. Frontend (`npm run build`)
4. Rust compile + Tauri `.app` bundle（**単一** `tauri build --bundles app`）
5. Venv inject (`scripts/inject-translation-venv.sh`, APFS clonefile when possible)
6. DMG generation（clean only）

## Before（2026-09-14, prior pipeline）

Observed local packaged build ≈ **7 minutes** wall clock when `beforeBuildCommand` always wiped `translation-server/venv` and Tauri bundled the entire `translation-server/` tree.

Resource contamination measured on that `.app`:

| Path in `.app` Resources | Size |
| --- | ---: |
| `translation-server/` total | ~8.4 GB |
| `models/` (not required at runtime; HF cache used) | ~5.5 GB |
| developer `.venv*` copies | ~2.1 GB |
| release `venv/` | ~0.8 GB |

DMG conversion of the oversized tree dominated end-of-build time.

## After（2026-09-14, Apple Silicon local）

### Warm `npm run tauri:build:fast`（cached Python + reuse staged venv）

| Phase | Time |
| --- | ---: |
| Python runtime prep | 3.5s |
| Stage resources | 0.5s |
| Frontend build | 5.4s |
| Rust compile (`--no-bundle`) | 39.4s |
| Tauri `.app` bundle | 9.0s |
| DMG generation | skipped |
| Wall clock | **58.3s** |
| `.app` size | **~778 MB**（no `models/` / developer `.venv*`） |

### Cold-ish first run after the change（full Rust dependency rebuild once）

| Phase | Time |
| --- | ---: |
| Python runtime prep | 2.5s |
| Stage resources | 6.8s |
| Frontend build | 5.0s |
| Rust compile | 69.3s |
| Tauri `.app` bundle | 74.1s |
| Wall clock | **157.9s (~2.6 min)** |

Relative to the prior ~7 min / ~8.4 GB tree: warm daily `.app` builds are about **7× faster**; artifact size is ~**10× smaller** for the translation-server payload.

### Safe venv trim（measured）

After install, `bundle-python.sh` removes `__pycache__` / `*.pyc` / package `tests/` trees / `share/man` / some dist-info install metadata. Do **not** remove `torch.testing`（public module）. Larger packaging changes（torch include strip, alternate wheels）were not applied without further runtime measurement.

## After（2026-10-19, single tauri + external venv inject）

Warm `tauri:build:fast` used to pay twice for release compile/link (`--no-bundle` then `--bundles app`) and re-copy ~700MB venv into `.app` on every bundle. Changes:

- one `tauri build --bundles app`
- Tauri resources = lite tree only; `inject-translation-venv.sh` APFS-clones venv afterward
- `CARGO_INCREMENTAL=1` on the fast path

### Warm remeasure（2026-10-19, Apple Silicon）

| Phase | Time |
| --- | ---: |
| Python runtime prep | 3.9s |
| Stage resources | 0.2s |
| Frontend build | 6.5s |
| Rust + .app bundle | 9.6s |
| Venv inject | 4.0s |
| Wall clock | **24.5s** |

Previous warm baseline on this machine（dual tauri + inline venv）: **wall ≈ 61.6s**（rust 31.8s + bundle 22.3s）.約 **2.5×** 短縮。

### Clean release

`npm run tauri:build:clean` still rebuilds Python from lock and builds `.dmg`. Record `.build-timings` from the next clean run below.

| Phase | clean (rebuild Python, app+dmg) |
| --- | ---: |
| Python runtime prep | _measure on next clean_ |
| Stage resources | _TBD_ |
| Frontend build | _TBD_ |
| Rust + .app bundle | _TBD_ |
| Venv inject | _TBD_ |
| DMG generation | _TBD_（input ~0.8 GB vs former ~8 GB） |
| Wall clock | _TBD_ |
