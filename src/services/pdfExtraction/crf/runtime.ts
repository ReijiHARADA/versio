/**
 * Loaded CRF models and lexicons. Pure: the caller supplies the decompressed
 * asset texts (Node reads files, the app fetches bundled assets).
 */
import { buildLexicons, type Lexicons } from "./lexicon";
import type { CrfModel, CrfPattern } from "./wapiti";

export type CrfRuntime = { citation: CrfModel; segmenter: CrfModel; lexicons: Lexicons };

export const CRF_MODEL_ASSETS = ["citation-model", "reference-segmenter-model"] as const;
export const CRF_LEXICON_ASSETS = [
  "journals", "abbrev_journals", "proceedings", "publishers", "inspire_collaborations", "location",
  "english_words", "firstname_5k", "lastname_5k", "names_family", "names_female", "names_male",
] as const;
export type CrfAssetName = (typeof CRF_MODEL_ASSETS)[number] | (typeof CRF_LEXICON_ASSETS)[number];

type PackedModel = { labels: string[]; patterns: CrfPattern[]; unigram: Record<string, number[]>; bigram: Record<string, number[]> };

export function parsePackedModel(json: string): CrfModel {
  const packed = JSON.parse(json) as PackedModel;
  return {
    labels: packed.labels,
    patterns: packed.patterns,
    unigram: new Map(Object.entries(packed.unigram).map(([key, value]) => [key, Float64Array.from(value)])),
    bigram: new Map(Object.entries(packed.bigram).map(([key, value]) => [key, Float64Array.from(value)])),
  };
}

export async function buildCrfRuntime(readText: (asset: CrfAssetName) => Promise<string>): Promise<CrfRuntime> {
  const lists = new Map<string, string[]>();
  await Promise.all(CRF_LEXICON_ASSETS.map(async (name) => lists.set(name, JSON.parse(await readText(name)) as string[])));
  const [citation, segmenter] = await Promise.all(CRF_MODEL_ASSETS.map(async (name) => parsePackedModel(await readText(name))));
  return { citation, segmenter, lexicons: buildLexicons((name) => lists.get(name) ?? []) };
}

let active: CrfRuntime | null = null;

export function setCrfRuntime(runtime: CrfRuntime | null): void {
  active = runtime;
}

export function crfRuntime(): CrfRuntime {
  if (!active) throw new Error("CRF runtime is not loaded");
  return active;
}

export function hasCrfRuntime(): boolean {
  return active !== null;
}
