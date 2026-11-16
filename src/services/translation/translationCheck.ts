/**
 * Deterministic translation acceptance check (EN→JA).
 *
 * Port of translation-server/scripts/local_llm_bench/checks.py, the check used in
 * docs/research/local-llm-translation-bench-2026-11.md. It replaces the legacy
 * quality.ts gates on the pipeline path: only verifiable failures are rejected.
 *
 * 1. breakdown: empty / mostly non-Japanese / meta preamble / length ratio outside 0.2–1.0
 *    (ratio only for sources of 40+ chars, so short titles like "Acknowledgements"→"謝辞" pass)
 * 2. fact retention: numbers (million/billion → 万/億 aware), [n] citations, URLs/DOIs
 */

const JA = /[぀-ヿ一-鿿]/gu;
const META = /^(?:here is|translation|翻訳[:：]|以下(?:は|に).*翻訳|日本語訳[:：])/i;
const URL_OR_DOI = /https?:\/\/\S+|10\.\d{4,9}\/\S+/g;
const CITE_GROUP = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
const NUMBER =
  /(?<![\p{L}\p{N}_.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\p{L}\p{N}_])(?:\s+(million|billion|thousand))?/gu;
const UNIT = { thousand: 1e3, million: 1e6, billion: 1e9 } as const;
const RATIO_MIN_SOURCE_CHARS = 40;

export type TranslationCheck = { ok: boolean; breakdown: string[]; lostFacts: string[] };

const nfkc = (s: string) => s.normalize("NFKC");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function facts(source: string): Set<string> {
  const s = nfkc(source);
  const out = new Set<string>();
  for (const m of s.match(URL_OR_DOI) ?? []) out.add(m);
  let rest = s.replace(URL_OR_DOI, " ");
  for (const m of rest.matchAll(CITE_GROUP)) {
    for (const n of m[1].match(/\d+/g) ?? []) out.add(`cite:${n}`);
  }
  rest = rest.replace(CITE_GROUP, " ");
  for (const m of rest.matchAll(NUMBER)) {
    out.add(`num:${m[1].replace(/,/g, "")}${m[2] ? `:${m[2]}` : ""}`);
  }
  return out;
}

function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 1e4) / 1e4);
}

function kept(fact: string, output: string): boolean {
  let o = nfkc(output);
  if (fact.startsWith("cite:")) return new RegExp(`(?<!\\d)${fact.slice(5)}(?!\\d)`).test(o);
  if (fact.startsWith("num:")) {
    o = o.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
    const [n, unit] = fact.slice(4).split(":");
    const alts = [n];
    if (unit) {
      const v = Number(n) * UNIT[unit as keyof typeof UNIT];
      alts.push(fmt(v), `${fmt(v / 1e4)}万`, `${fmt(v / 1e8)}億`, `${fmt(v / 1e3)}千`);
    }
    return alts.some((x) => new RegExp(`(?<![\\d.])${escapeRe(x)}(?!\\d)`).test(o));
  }
  return o.includes(fact);
}

export function checkTranslation(source: string, output: string): TranslationCheck {
  const o = output.trim();
  const ja = (o.match(JA) ?? []).length;
  const letters = (o.match(/[A-Za-z]/g) ?? []).length;
  const breakdown: string[] = [];
  if (!o) breakdown.push("empty");
  else if (ja < 0.5 * (ja + letters / 2)) breakdown.push("not_japanese");
  if (META.test(o)) breakdown.push("meta_preamble");
  const ratio = o.length / Math.max(1, source.length);
  if (o && source.trim().length >= RATIO_MIN_SOURCE_CHARS && !(ratio >= 0.2 && ratio <= 1.0)) {
    breakdown.push(`length_ratio:${ratio.toFixed(2)}`);
  }
  const lostFacts = [...facts(source)].filter((f) => !kept(f, o)).sort();
  return { ok: breakdown.length === 0 && lostFacts.length === 0, breakdown, lostFacts };
}

/** Pipeline acceptance; argument order matches the legacy isPlausibleJaTranslation. */
export function isAcceptableTranslation(output: string, source: string): boolean {
  return checkTranslation(source, output).ok;
}
