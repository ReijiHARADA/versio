/** Generated GROBID model asset loader for Node-side tests and evaluation. */
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import fs from "node:fs";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import path from "node:path";
// @ts-ignore Node-only evaluator helper; browser loading belongs to stage 3a-2.
import { gunzipSync } from "node:zlib";
import type { CrfModel, CrfPattern } from "./wapiti";

type PackedModel = { labels: string[]; patterns: CrfPattern[]; unigram: Record<string, number[]>; bigram: Record<string, number[]> };
const cache = new Map<"citation" | "reference-segmenter", CrfModel>();

/** Synchronously load one generated pruned model. Browser loading is intentionally deferred to stage 3a-2. */
export function loadCrfModel(name: "citation" | "reference-segmenter"): CrfModel {
  const existing = cache.get(name); if (existing) return existing;
  const file = path.resolve((import.meta as ImportMeta & { dirname: string }).dirname, "assets", `${name}-model.json.gz`);
  const packed = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) as PackedModel;
  const model = {
    labels: packed.labels,
    patterns: packed.patterns,
    unigram: new Map(Object.entries(packed.unigram).map(([key, value]) => [key, Float64Array.from(value)])),
    bigram: new Map(Object.entries(packed.bigram).map(([key, value]) => [key, Float64Array.from(value)])),
  };
  cache.set(name, model); return model;
}
