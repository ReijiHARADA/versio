---
type: Playbook
title: PLaMo 3 Translate 翻訳エンジン実装計画
description: 設計書（2026-11-16-plamo-translation-engine-design）を実装するためのタスク分解。
tags: [translation, plamo, llama-cpp, tauri, plan]
status: draft
sources: [/docs/superpowers/specs/2026-11-16-plamo-translation-engine-design.md]
---

# PLaMo 3 Translate Translation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PLaMo 3 Translate 2B, served by a bundled `llama-server` sidecar, the default EN→JA engine. Keep MADLAD as a selectable legacy engine for one release.

**Architecture:**
- Rust manages the sidecar. It downloads the GGUF on first use (resumable, SHA-256 pinned), starts `llama-server` lazily on 127.0.0.1:8766 with a per-launch API key, and stops it on window close.
- On the frontend, a new `PlamoEngine` implements `TranslationEngine` over the OpenAI-compatible API.
- Every translation is now accepted or rejected by a new deterministic check ported from the benchmark's `checks.py`, instead of the legacy `isPlausibleJaTranslation`.

**Tech Stack:** Tauri v2 (Rust), TypeScript/React, vitest, llama.cpp `llama-server` (static Metal build), `/usr/bin/curl`, Rust `sha2` crate.

**Spec:** `docs/superpowers/specs/2026-11-16-plamo-translation-engine-design.md`

## Global Constraints

- **Model:** HF repo `pfnet/plamo-3-translate-2b-GGUF`, revision `4f672106b847200bfdc0f6af6c321cd94eba1aed`, file `plamo-3-translate-2b-Q4_K_M.gguf`, size `1807203040` bytes, SHA-256 `1ffd9073afcc70e35ccc942428aa2b73d7aa2b9ea779bf504b775369e0276c13`.
  - Download URL: `https://huggingface.co/pfnet/plamo-3-translate-2b-GGUF/resolve/<revision>/<file>`.
  - Stored at `<app_data_dir>/models/<file>`. Partial downloads go to `<file>.part`.
- **llama.cpp:** tag `b12110` (commit `cd959bae99ff4bed22bef2604f45241c09bbb8c8`). Build statically: no Homebrew dylibs, Metal library embedded.
- **Server args:** `-m <gguf> --host 127.0.0.1 --port 8766 --api-key <token> --jinja -c 65536 -np 8 -ngl 99`.
- **Request:** `POST /v1/chat/completions` with body:
  - `messages: [{role:"user", content:<text>}]`
  - `temperature: 0`, `max_tokens: 4096`
  - `chat_template_kwargs: {source_lang:"en", target_lang:"ja"}`
  - `stop: ["<|plamo:tag|>", "<|plamo:bos|>"]`
  - The response text is `choices[0].message.content.trim()`.
- **Identity:**
  - Engine `name` is `"plamo"`.
  - `TranslationResult.model` is `"plamo-3-translate-2b"`.
  - `modelVersion` is `"q4_k_m-1ffd9073"`.
- **Concurrency:** Frontend translation concurrency stays 8, matching `-np 8`.
- **Logs:** `~/Library/Logs/com.harada.versio/plamo-server.log`, using the same directory helper as `prepare_server_log`.
- **Licensing:**
  - Do not invent SPDX ids. PLaMo's license id is the literal string `"PLaMo Community License"`.
  - Show "Built with PLaMo" in Settings → ライセンス.
- **Sidecar choice:** No Python for the PLaMo path. Do not change the MADLAD server spawn in this plan (removal is next release).
- **Repo hygiene:** Do not commit binaries (`src-tauri/binaries/` is gitignored), GGUF files, or real-paper text.

## Review Focus

1. **Short titles:** "Acknowledgements"→"謝辞" (ratio 0.125) must pass the check. The length-ratio band applies only when the source is ≥ 40 chars. Test in Task 1.
2. **Interrupted download:** Quitting the app or losing the network mid-download must resume from `.part` on the next attempt. A corrupted finished file (hash mismatch) must be deleted and reported, never served. Test in Task 3.
3. **Sidecar crash:** If `llama-server` dies (OOM or killed), the next `ensure_plamo_server` call must respawn it rather than return a dead port. Test in Task 3.
4. **Stale token:** After a sidecar restart, the engine's cached token gets a 401. The engine must refetch server info once and retry. Test in Task 4.
5. **Untranslatable echo:** A block that is mostly code or proper nouns makes the output mostly Latin. This must fail as `not_japanese` only by the same ratio rule as the benchmark. It must not loop: the engine retries once, then returns, and the pipeline marks the block `needs_attention`. Test in Task 4.

---

### Task 1: Deterministic translation check

**Files:**
- Create: `src/services/translation/translationCheck.ts`
- Test: `src/test/translationCheck.test.ts`

**Interfaces:**
- Produces:
  - `checkTranslation(source: string, output: string): { ok: boolean; breakdown: string[]; lostFacts: string[] }`
  - `isAcceptableTranslation(output: string, source: string): boolean`, which returns `checkTranslation(source, output).ok`. The argument order matches `isPlausibleJaTranslation` so call sites swap 1:1.

Port `translation-server/scripts/local_llm_bench/checks.py` (`facts`, `kept`, `check`) faithfully, with NFKC via `String.prototype.normalize("NFKC")`. The only intentional difference is that the length-ratio rule applies only when `source.trim().length >= 40`. `ok` means both `breakdown` and `lostFacts` are empty.

- [ ] **Step 1: Write failing tests**

```ts
it("accepts unit-converted numbers", () => expect(checkTranslation("about 20 million users", "約2000万人のユーザー").lostFacts).toEqual([]));
it("keeps thousands separators", () => expect(checkTranslation("n = 2,431 participants were enrolled in total", "合計2431人の参加者が登録された").ok).toBe(true));
it("does not split citation groups", () => expect(checkTranslation("as shown before [8,10–13] in prior work on this", "先行研究[8,10–13]で示された").lostFacts).toEqual([]));
it("flags a lost number", () => expect(checkTranslation("accuracy improved by 4.7% over the baseline model", "精度がベースラインより向上した").lostFacts).toEqual(["num:4.7"]));
it("flags English echo", () => expect(checkTranslation(src60, src60).breakdown).toContain("not_japanese"));
it("flags meta preamble", () => expect(checkTranslation(src60, "以下は翻訳です：" + ja60).breakdown).toContain("meta_preamble"));
it("flags empty output", () => expect(checkTranslation("Hello world.", "  ").breakdown).toEqual(["empty"]));
it("lets short titles through", () => expect(isAcceptableTranslation("謝辞", "Acknowledgements")).toBe(true));
it("flags runaway length on long sources", () => expect(checkTranslation(src60, ja60.repeat(3)).breakdown.some(r => r.startsWith("length_ratio:"))).toBe(true));
```

(`src60`: any English sentence of 60+ chars. `ja60`: a plausible Japanese translation of it.)

- [ ] **Step 2:** Run `npx vitest run src/test/translationCheck.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the two functions as specified above.
- [ ] **Step 4:** Run the same command. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(translation): deterministic breakdown + fact-retention check`.

### Task 2: Route pipeline acceptance through the new check

**Files:**
- Modify:
  - `src/services/import/helpers.ts:45`
  - `src/services/import/resume.ts:80,93,170`
  - `src/services/translation/partialProjection.ts:37`
- Test: existing `src/test/*` suites that cover these files, plus one new case in `src/test/translationCheck.test.ts`.

**Interfaces:**
- Consumes: `isAcceptableTranslation` (Task 1).

The legacy check stays inside `madladEngine.ts`, `appleTranslationEngine.ts`, and `appleShortPack.ts`. Those are engine-internal MADLAD/Apple heuristics; leave them. Extraction-side imports from `quality.ts` (`stitchParagraphs`, `titleResolver`, `citationAlignment`) are untouched.

- [ ] **Step 1:** Replace `isPlausibleJaTranslation` with `isAcceptableTranslation` at the five listed call sites and adjust the imports.
- [ ] **Step 2:** Run `npx vitest run src/test 2>&1 | tail -15`. Some legacy-gate expectations may now fail.
  - For each failure, decide whether the test asserted a MADLAD-specific heuristic. If so, update its expectation to the new check and note it in the commit body.
  - If a failure shows a real correctness loss (a fact dropped and still accepted), stop and report it.
- [ ] **Step 3:** Run `npm run typecheck`. Expected: no errors.
- [ ] **Step 4:** Commit `refactor(translation): accept translations by deterministic check, not legacy gate`.

### Task 3: llama-server sidecar build, model download, and lifecycle (Rust)

**Files:**
- Create:
  - `scripts/build-llama-server.sh`
  - `src-tauri/src/plamo.rs`
- Modify:
  - `src-tauri/tauri.conf.json` (`bundle.externalBin: ["binaries/llama-server"]`)
  - `src-tauri/Cargo.toml` (add `sha2`)
  - `src-tauri/src/lib.rs` (manage `PlamoState`, register commands, kill on `WindowEvent::Destroyed` next to the existing kill)
  - `.gitignore` (`src-tauri/binaries/`)
  - `scripts/tauri-build.sh` (call the build script before bundling; skip if the binary exists and `binaries/.llama-tag` equals `b12110`)
  - `package.json` (`"build:llama-server": "bash scripts/build-llama-server.sh"`)
- Test: `#[cfg(test)]` module in `plamo.rs`

**Build script:**
- Shallow-clone tag `b12110` into `.cache/llama.cpp` and verify `HEAD` equals the pinned commit.
- Configure with:
  ```
  cmake -B build -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release
  ```
- Run `cmake --build build --target llama-server -j`.
- Copy the result to `src-tauri/binaries/llama-server-aarch64-apple-darwin` and write `.llama-tag`.
- Verify: `otool -L` lists only `/usr/lib` and `/System` entries.

**Interfaces (Tauri commands, serde camelCase):**
- `plamo_model_status(app) -> PlamoModelStatus { present: bool, downloadedBytes: u64, totalBytes: u64 }`
- `download_plamo_model(app) -> Result<(), String>`
  - Runs `/usr/bin/curl -fL -C - --retry 5 --retry-all-errors -o <part> <url>` on a blocking thread.
  - Every 500 ms, emits event `plamo-model-progress` with `{ downloadedBytes, totalBytes }`.
  - On completion, checks size and SHA-256. On match it renames to the final file. On mismatch it deletes `.part` and returns `Err("checksum_mismatch")`.
  - Concurrent calls wait on one in-flight download (Mutex flag).
- `ensure_plamo_server(app, state) -> Result<PlamoServerInfo { baseUrl: String, token: String }, String>`
  - Returns `Err("model_not_downloaded")` if the model is absent.
  - If the child exists and `try_wait()` is `Ok(None)`, returns its info.
  - Otherwise spawns with the Global Constraints args (token from `random_api_token()`, stdout/stderr to the log) and polls `GET /health` until it returns 200, timeout 60 s. On timeout it kills the child and returns `Err("server_start_timeout")`.
- Sidecar path: `std::env::current_exe()?.parent()/llama-server`. This works for both `tauri dev` and `.app`.
- Pure helpers (unit-tested):
  - `fn server_args(model: &Path, port: u16, token: &str) -> Vec<String>`
  - `fn verify_file(path: &Path, size: u64, sha256_hex: &str) -> Result<(), String>`

- [ ] **Step 1: Write failing Rust tests**
  - `server_args_match_spec`: asserts the exact arg vector.
  - `verify_file_rejects_wrong_hash`: tempfile containing `b"abc"` with the sha of `"abd"` gives `Err("checksum_mismatch")`.
  - `verify_file_rejects_wrong_size`: gives `Err("size_mismatch")`.
  - `verify_file_accepts_match`.
  - `dead_child_is_respawned`: spawn `/bin/sleep 0`, wait, then assert `child_alive(&mut child) == false` (helper `fn child_alive(c: &mut Child) -> bool`).
- [ ] **Step 2:** Run `cd src-tauri && cargo test plamo 2>&1 | tail -5`. Expected: FAIL.
- [ ] **Step 3:** Implement `plamo.rs` and the build script, and register in `lib.rs`.
- [ ] **Step 4:** Run `cargo test plamo 2>&1 | tail -5`. Expected: PASS.
- [ ] **Step 5:** Run `npm run build:llama-server && otool -L src-tauri/binaries/llama-server-aarch64-apple-darwin`. Expected: system libs only.
- [ ] **Step 6:** Manual check under `npm run tauri:dev`, from the devtools console:
  - `invoke("download_plamo_model")`. Quit mid-way, relaunch, and invoke again. It must resume (log shows `.part` size growing from its previous value).
  - Then run `invoke("ensure_plamo_server")`, `kill -9` the `llama-server` PID, and call it again. It must return a working server.
- [ ] **Step 7:** Commit `feat(tauri): llama-server sidecar with pinned PLaMo model download`.

### Task 4: PlamoEngine

**Files:**
- Create: `src/services/translation/plamoEngine.ts`
- Test: `src/test/plamoEngine.test.ts`

**Interfaces:**
- Consumes:
  - `checkTranslation` (Task 1)
  - the Tauri commands from Task 3, via the `invoke` wrapper `madladEngine.ts` already uses
- Produces:
  - `class PlamoEngine implements TranslationEngine`
  - `constructor(deps?: { getServer?: () => Promise<{ baseUrl: string; token: string }>; fetchImpl?: typeof fetch })`. The defaults call `invoke("ensure_plamo_server")` and global `fetch`.
  - `PLAMO_MODEL = "plamo-3-translate-2b"` and `PLAMO_MODEL_VERSION = "q4_k_m-1ffd9073"`.

**Behaviour:**
- `translate` sends the Global Constraints request with `Authorization: Bearer <token>`.
  - Server info is cached. On 401 or a network error it is refetched once and the request retried once.
  - If `checkTranslation(text, out).ok` is false, it re-requests once and returns the second output either way. The pipeline's `isAcceptableTranslation` (Task 2) then decides.
  - `inputTokens`/`outputTokens` come from `usage`. `charsPerSec` and `translationTimeMs` are measured.
- `translateBatch` runs `Promise.all` over `translate`.
- `loadModel`:
  - If `plamo_model_status().present` is false, it calls `download_plamo_model`.
  - It then calls `ensure_plamo_server`.
- `getStatus`:
  - `{ available, modelLoaded, modelName: PLAMO_MODEL, modelVersion: PLAMO_MODEL_VERSION, device: "metal" }`.
  - When the model is absent: `available: false, error: "model_not_downloaded"`.
- `unloadModel` is a no-op (the sidecar stops with the app).

- [ ] **Step 1: Write failing tests** with a mocked `fetchImpl` and `getServer`:
  - `sends plamo request body`: asserts URL `/v1/chat/completions`, `chat_template_kwargs`, `stop`, `temperature: 0`, and the bearer header.
  - `retries once on 401 with refreshed server info`: `getServer` called twice, result OK.
  - `re-requests once when check fails`: first reply is English echo, second is Japanese. Exactly 2 fetches, Japanese returned.
  - `does not loop on persistent echo`: always echo. Exactly 2 fetches, echo returned.
  - `result identity`: `model === "plamo-3-translate-2b"`, `modelVersion === "q4_k_m-1ffd9073"`.
- [ ] **Step 2:** Run `npx vitest run src/test/plamoEngine.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(translation): PlamoEngine over llama-server`.

### Task 5: Engine selection, wiring, and Settings UI

**Files:**
- Modify:
  - `src/utils/translationSettings.ts`
  - `src/services/translation/createTranslationEngine.ts`
  - every `createTranslationEngine(` caller (`importServiceV2.ts`, `import/helpers.ts`, `import/resume.ts`, `SettingsScreen.tsx`, `DiagnosticsSettingsSection.tsx`), passing the new field
  - `src/components/settings/TranslationSettingsSection.tsx`
- Test:
  - `src/test/settings.test.ts`
  - new `src/test/createTranslationEngine.test.ts`

**Interfaces:**
- `TranslationSettingsV2.translationEngine: "plamo" | "madlad"`. The default is `"plamo"`. `mergeTranslationSettingsV2` fills it for saved settings that lack it.
- `TranslationEngineConfig.translationEngine: "plamo" | "madlad"`.
- `TranslationEngineBundle` gains `primaryEngine: TranslationEngine` and keeps `madladEngine` for MADLAD-specific callers.
- When `"plamo"`:
  - the base engine is `PlamoEngine`
  - `appleRouter` is `null` (the Apple short-item router existed to speed up MADLAD)
  - the Ollama cascade still wraps it when `enableSelectiveCascade`
- When `"madlad"`, behaviour is unchanged.

**Settings UI:** Add a `SettingsSelect` "翻訳エンジン" with these options:
- "PLaMo 3 Translate 2B（推奨）"
- "MADLAD-400 3B（旧エンジン・次版で削除）"

Below it:
- If the model is absent: "モデルをダウンロード（1.8 GB）" button. During download, a progress bar fed by `plamo-model-progress`.
- If present: "ダウンロード済み".

The download errors `checksum_mismatch` and network failure show "ダウンロードに失敗しました。再試行してください。" with a retry button.

- [ ] **Step 1: Write failing tests**
  - `merge fills translationEngine=plamo for old saves`
  - `plamo config yields PlamoEngine without apple router`
  - `madlad config yields previous bundle shape`
- [ ] **Step 2:** Run `npx vitest run src/test/settings.test.ts src/test/createTranslationEngine.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the wiring and UI.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 5:** Run `npm run dev` + `npm run verify:browser`. Expected: Settings renders the new select. Download controls show as unavailable outside Tauri.
- [ ] **Step 6:** Commit `feat(settings): choose PLaMo (default) or legacy MADLAD engine`.

### Task 6: License notices

**Files:**
- Create:
  - `licenses/plamo-community-license.txt`, fetched from `https://huggingface.co/pfnet/plamo-3-translate-2b-GGUF/raw/4f672106b847200bfdc0f6af6c321cd94eba1aed/LICENSE/en`, verbatim
  - `licenses/llama-cpp-LICENSE.txt` (llama.cpp MIT LICENSE at tag `b12110`)
- Modify:
  - `scripts/generate-licenses.mjs` (next to the MADLAD entry near line 699)
  - `src/components/settings/LicensesSettingsSection.tsx`
  - `THIRD_PARTY_NOTICES.md`
  - `docs/MACOS_RELEASE.md`
- Test: `npm run generate:licenses` output

**Generator entries:**
- `id "model:pfnet/plamo-3-translate-2b-GGUF"`, `ecosystem "model"`, license `"PLaMo Community License"`, text from the file
- `id "binary:llama.cpp"`, ecosystem `"asset"`, license `"MIT"`

**Settings:** Add a fixed line "Built with PLaMo" above the list.

**MACOS_RELEASE.md:** Add one paragraph: commercial distribution requires PLaMo registration, and the licensee's annual revenue must be ≤ ¥1B.

- [ ] **Step 1:** Add the files and entries, then run `npm run generate:licenses && grep -c "plamo\|llama.cpp" src/generated/thirdPartyLicenses.json`. Expected: ≥ 2.
- [ ] **Step 2:** Run `npx vitest run src/test -t icense 2>&1 | tail -5`. Expected: PASS.
- [ ] **Step 3:** Commit `docs(licenses): PLaMo Community License and llama.cpp notices`.

### Task 7: Docs and packaged verification

**Files:**
- Modify:
  - `AGENTS.md` (Translation section)
  - `CURRENT_STATE.md`
  - `QUICKSTART.md`
  - `translation-server/scripts/local_llm_bench/paperbench.py` (add `--token` and `--port`, sending `Authorization: Bearer`)

**AGENTS.md Translation section — replace the MADLAD-production bullets with:**
- The production engine is PLaMo 3 Translate 2B Q4_K_M on a bundled static `llama-server` sidecar (port 8766, per-launch token, lazy start, `-np 8 -c 65536`).
- The model is downloaded on first use to `<AppData>/models/` with a pinned revision and SHA-256. It is not bundled.
- Translations are accepted by `translationCheck.ts`. Do not reintroduce `quality.ts` gates on the PLaMo path.
- MADLAD is legacy and selectable for one release. Its existing notes stay, marked legacy.
- Benchmark: `docs/research/local-llm-translation-bench-2026-11.md`.
- Log file: `plamo-server.log`.

**QUICKSTART.md:** Development needs `npm run build:llama-server` once. The model downloads from Settings.

- [ ] **Step 1:** Edit the docs. Keep the OKF frontmatter only on files that already use it; `AGENTS.md` is exempt.
- [ ] **Step 2:** Run `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer npm run tauri:build:fast 2>&1 | tail -5`. Expected: `.app` built.
  - Then run `codesign --verify --deep --strict` on `src-tauri/target/release/bundle/macos/Versio.app`. Expected: valid.
- [ ] **Step 3:** Packaged check on the `.app`:
  - Fresh `models/` → Settings download → import a test PDF via `open -a Versio.app <pdf>`.
  - Translation completes.
  - Quitting leaves no `llama-server` process (`pgrep llama-server` is empty).
- [ ] **Step 4:** Regression: run `paperbench.py --kind plamo --port 8766 --token <token from get_translation_server_token-equivalent ensure_plamo_server>` on the two benchmark papers. Expected: `wall_sec` within 1.5× of 56 s and 97 s.
- [ ] **Step 5:** Run the full `npm test 2>&1 | tail -5` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit `docs: PLaMo is the production translation engine`.
