/** Node-only loader for scripts and tests (never imported by app code). */
// @ts-ignore Node built-in, not part of the browser build.
import fs from "node:fs";
// @ts-ignore Node built-in, not part of the browser build.
import path from "node:path";
// @ts-ignore Node built-in, not part of the browser build.
import { gunzipSync } from "node:zlib";
import { buildCrfRuntime, crfRuntime, hasCrfRuntime, setCrfRuntime, type CrfRuntime } from "./runtime";

/** Load the generated assets from disk once and make them the active runtime. */
export async function loadNodeCrfRuntime(): Promise<CrfRuntime> {
  if (hasCrfRuntime()) return crfRuntime();
  const dir = path.resolve((import.meta as ImportMeta & { dirname: string }).dirname, "assets");
  const runtime = await buildCrfRuntime(async (name) => gunzipSync(fs.readFileSync(path.join(dir, `${name}.json.gz`))).toString("utf8"));
  setCrfRuntime(runtime);
  return runtime;
}
