/** App loader: fetches the bundled assets lazily, once, and caches the runtime. */
import { buildCrfRuntime, crfRuntime, hasCrfRuntime, setCrfRuntime, type CrfAssetName, type CrfRuntime } from "./runtime";

const ASSET_URLS = import.meta.glob("./assets/*.json.gz", { query: "?url", import: "default", eager: true }) as Record<string, string>;

async function gunzipIfNeeded(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  // Some servers decode gzip transparently; only decompress when the magic bytes remain.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

let loading: Promise<CrfRuntime> | null = null;

export function loadBundledCrfRuntime(): Promise<CrfRuntime> {
  if (hasCrfRuntime()) return Promise.resolve(crfRuntime());
  loading ??= buildCrfRuntime(async (name: CrfAssetName) => {
    const url = ASSET_URLS[`./assets/${name}.json.gz`];
    if (!url) throw new Error(`missing CRF asset ${name}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CRF asset ${name}: ${response.status}`);
    return gunzipIfNeeded(new Uint8Array(await response.arrayBuffer()));
  }).then((runtime) => {
    setCrfRuntime(runtime);
    return runtime;
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
