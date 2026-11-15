import { normalizeName, normalizeText, similarity, tokenJaccard } from "./normalize";
import type { FieldGold, FieldName, FieldPrediction, FieldRecord, FieldScores, PRF } from "./types";

/** Thresholds are evaluation choices (spec §6), not extractor tuning knobs. */
export const CAPTION_MATCH = 0.8;
export const CAPTION_PREFIX = 200;
export const REFERENCE_MATCH = 0.6;
export const REFERENCE_TITLE_OK = 0.9;
export const AFFILIATION_MATCH = 0.5;

/** Greedy one-to-one matching; returns matched [goldIndex, predIndex] pairs. */
function greedyMatch<G, P>(gold: G[], pred: P[], score: (g: G, p: P) => number, min: number): Array<[number, number]> {
  const candidates: Array<[number, number, number]> = [];
  gold.forEach((g, i) => pred.forEach((p, j) => {
    const s = score(g, p);
    if (s >= min) candidates.push([s, i, j]);
  }));
  candidates.sort((a, b) => b[0] - a[0]);
  const usedG = new Set<number>();
  const usedP = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const [, i, j] of candidates) {
    if (usedG.has(i) || usedP.has(j)) continue;
    usedG.add(i);
    usedP.add(j);
    pairs.push([i, j]);
  }
  return pairs;
}

function prf(matched: number, gold: number, predicted: number): PRF {
  const precision = predicted === 0 ? (gold === 0 ? 1 : 0) : matched / predicted;
  const recall = gold === 0 ? (predicted === 0 ? 1 : 0) : matched / gold;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, gold, predicted };
}

function ratio(hits: number, total: number): number | null {
  return total === 0 ? null : hits / total;
}

function authorAffiliationPairs(record: FieldRecord, language: "en" | "ja"): Array<{ author: string; aff: string }> {
  const byKey = new Map(record.affiliations.map((a) => [a.key, a.text]));
  return record.authors.flatMap((a) => a.affiliationKeys
    .map((k) => byKey.get(k))
    .filter((t): t is string => Boolean(t))
    .map((aff) => ({ author: normalizeName(a.name, language), aff })));
}

function captionPrefix(text: string): string {
  return normalizeText(text).slice(0, CAPTION_PREFIX);
}

function normalizeLabel(label: string | null): string | null {
  if (!label) return null;
  const m = normalizeText(label).match(/(fig|figure|table|図|表)\D*([0-9]+[a-z]?)/u);
  if (!m) return normalizeText(label);
  const kind = m[1].startsWith("fig") || m[1] === "図" ? "figure" : "table";
  return `${kind} ${m[2]}`;
}

function isEmpty(record: FieldRecord, field: FieldName): boolean {
  switch (field) {
    case "title": return !record.title;
    case "authors": return record.authors.length === 0;
    case "authorAffiliation": return !record.authors.some((a) => a.affiliationKeys.length > 0);
    case "emails": return record.emails.length === 0;
    case "captions": return record.captions.length === 0;
    case "references": return record.references.length === 0;
  }
}

export function scoreFields(gold: FieldGold, pred: FieldPrediction): FieldScores {
  const scores: FieldScores = {};
  const g = gold.fields;
  const p = pred.fields;
  const lang = gold.language;
  const scorable = (field: FieldName) =>
    gold.trustedFields.includes(field) && !pred.unavailableFields.includes(field) && !(isEmpty(g, field) && isEmpty(p, field));

  if (scorable("title")) {
    const sim = g.title && p.title ? similarity(g.title, p.title) : 0;
    scores.title = { exact: g.title && p.title && normalizeText(g.title) === normalizeText(p.title) ? 1 : 0, similarity: sim };
  }

  if (scorable("authors")) {
    const gk = g.authors.map((a) => normalizeName(a.name, lang));
    const pk = p.authors.map((a) => normalizeName(a.name, lang));
    const pairs = greedyMatch(gk, pk, (x, y) => (x === y ? 1 : 0), 1);
    scores.authors = prf(pairs.length, gk.length, pk.length);
  }

  if (scorable("authorAffiliation")) {
    const gp = authorAffiliationPairs(g, lang);
    const pp = authorAffiliationPairs(p, lang);
    const pairs = greedyMatch(gp, pp, (x, y) => (x.author === y.author ? tokenJaccard(x.aff, y.aff) : 0), AFFILIATION_MATCH);
    scores.authorAffiliation = prf(pairs.length, gp.length, pp.length);
  }

  if (scorable("emails")) {
    const ge = [...new Set(g.emails.map((e) => e.trim().toLowerCase()))];
    const pe = [...new Set(p.emails.map((e) => e.trim().toLowerCase()))];
    const pairs = greedyMatch(ge, pe, (x, y) => (x === y ? 1 : 0), 1);
    scores.emails = prf(pairs.length, ge.length, pe.length);
  }

  if (scorable("captions")) {
    const pairs = greedyMatch(g.captions, p.captions, (x, y) => similarity(captionPrefix(x.text), captionPrefix(y.text)), CAPTION_MATCH);
    const labelled = pairs.filter(([i]) => g.captions[i].label);
    const labelHits = labelled.filter(([i, j]) =>
      g.captions[i].kind === p.captions[j].kind && normalizeLabel(g.captions[i].label) === normalizeLabel(p.captions[j].label)).length;
    scores.captions = { ...prf(pairs.length, g.captions.length, p.captions.length), labelAccuracy: ratio(labelHits, labelled.length) };
  }

  if (scorable("references")) {
    const pairs = greedyMatch(g.references, p.references, (x, y) =>
      Math.max(similarity(x.raw, y.raw), x.title && y.title ? similarity(x.title, y.title) : 0), REFERENCE_MATCH);
    const withTitle = pairs.filter(([i]) => g.references[i].title);
    const withYear = pairs.filter(([i]) => g.references[i].year);
    const withDoi = pairs.filter(([i]) => g.references[i].doi);
    const titleHits = withTitle.filter(([i, j]) => {
      const pt = p.references[j].title ?? p.references[j].raw;
      return similarity(g.references[i].title!, pt) >= REFERENCE_TITLE_OK || normalizeText(pt).includes(normalizeText(g.references[i].title!));
    }).length;
    const yearHits = withYear.filter(([i, j]) => (p.references[j].year ?? p.references[j].raw).includes(g.references[i].year!)).length;
    const doiHits = withDoi.filter(([i, j]) => (p.references[j].doi ?? p.references[j].raw).toLowerCase().includes(g.references[i].doi!.toLowerCase())).length;
    scores.references = {
      ...prf(pairs.length, g.references.length, p.references.length),
      countRatio: g.references.length === 0 ? (p.references.length === 0 ? 1 : 0) : p.references.length / g.references.length,
      titleAccuracy: ratio(titleHits, withTitle.length),
      yearAccuracy: ratio(yearHits, withYear.length),
      doiAccuracy: ratio(doiHits, withDoi.length),
    };
  }

  return scores;
}
