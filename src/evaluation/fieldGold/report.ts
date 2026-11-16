import { scoreFields } from "./score";
import type { FieldGold, FieldName, FieldPrediction, FieldRecord, FieldScores, ParserId } from "./types";

export const FIELDS: FieldName[] = ["title", "authors", "authorAffiliation", "emails", "captions", "references"];

export type ScoredDocument = { id: string; parser: ParserId; source: string; language: "en" | "ja"; scores: FieldScores; unavailable: FieldName[] };
export type GroupRow = { field: FieldName; parser: ParserId; source: string; language: string; n: number; mean: number; unavailable: number };
export type ReportJson = { documents: ScoredDocument[]; groups: GroupRow[] };

/** One headline number per field: title similarity, otherwise F1. */
export function headline(scores: FieldScores, field: FieldName): number | null {
  if (field === "title") return scores.title ? scores.title.similarity : null;
  const s = scores[field];
  return s ? s.f1 : null;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function excerpt(fields: FieldRecord, field: FieldName): string {
  switch (field) {
    case "title": return clip(fields.title ?? "∅");
    case "authors": return clip(fields.authors.map((a) => a.name).join("; ") || "∅");
    case "authorAffiliation": {
      const byKey = new Map(fields.affiliations.map((a) => [a.key, a.text]));
      return clip(fields.authors.map((a) => `${a.name} → ${a.affiliationKeys.map((k) => byKey.get(k) ?? k).join(" / ")}`).join("; ") || "∅");
    }
    case "emails": return clip(fields.emails.join(", ") || "∅");
    case "captions": return clip(`${fields.captions.length} 件: ${fields.captions.slice(0, 2).map((c) => `[${c.label ?? "-"}] ${c.text.slice(0, 40)}`).join(" | ")}`);
    case "references": return clip(`${fields.references.length} 件: ${fields.references.slice(0, 1).map((r) => r.raw.slice(0, 80)).join("")}`);
  }
}

/**
 * Field × parser × source × language means. Fields a parser could not run are
 * counted as "unavailable" and kept out of the mean. `excerpts: false` drops the
 * worst-case quotations so the markdown can be committed.
 */
export function buildReport(input: { golds: FieldGold[]; predictions: FieldPrediction[]; excerpts?: boolean }): { markdown: string; json: ReportJson } {
  const goldById = new Map(input.golds.map((g) => [g.id, g]));
  const documents: ScoredDocument[] = [];
  for (const pred of input.predictions) {
    const gold = goldById.get(pred.id);
    if (!gold) continue;
    documents.push({ id: pred.id, parser: pred.parser, source: gold.source, language: gold.language, scores: scoreFields(gold, pred), unavailable: pred.unavailableFields.filter((f) => gold.trustedFields.includes(f)) });
  }
  const groups: GroupRow[] = [];
  const parsers = [...new Set(documents.map((d) => d.parser))];
  const keys: Array<{ source: string; language: string }> = [{ source: "all", language: "all" }];
  for (const d of documents) {
    for (const k of [{ source: d.source, language: "all" }, { source: "all", language: d.language }]) {
      if (!keys.some((x) => x.source === k.source && x.language === k.language)) keys.push(k);
    }
  }
  for (const field of FIELDS) {
    for (const parser of parsers) {
      for (const k of keys) {
        const docs = documents.filter((d) => d.parser === parser && (k.source === "all" || d.source === k.source) && (k.language === "all" || d.language === k.language));
        const values = docs.map((d) => headline(d.scores, field)).filter((v): v is number => v !== null);
        const unavailable = docs.filter((d) => d.unavailable.includes(field)).length;
        if (values.length === 0 && unavailable === 0) continue;
        groups.push({ field, parser, ...k, n: values.length, mean: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : NaN, unavailable });
      }
    }
  }

  const lines: string[] = ["# Field eval report", "", "見出し値: title は文字類似度、その他は F1。未実行 = 方式がその項目を返せなかった文書数（平均に含めない）。", ""];
  for (const field of FIELDS) {
    const rows = groups.filter((g) => g.field === field);
    if (rows.length === 0) continue;
    lines.push(`## ${field}`, "", "| parser | source | language | n | mean | 未実行 |", "|---|---|---|---|---|---|");
    for (const r of rows) lines.push(`| ${r.parser} | ${r.source} | ${r.language} | ${r.n} | ${Number.isNaN(r.mean) ? "-" : r.mean.toFixed(3)} | ${r.unavailable} |`);
    lines.push("");
    for (const parser of parsers) {
      const worst = documents
        .filter((d) => d.parser === parser)
        .map((d) => ({ d, v: headline(d.scores, field) }))
        .filter((x): x is { d: ScoredDocument; v: number } => x.v !== null)
        .sort((a, b) => a.v - b.v || a.d.id.localeCompare(b.d.id))
        .slice(0, 5);
      if (worst.length === 0) continue;
      lines.push(`ワースト 5（${parser}）:`, "");
      for (const { d, v } of worst) {
        lines.push(`- ${d.id} (${d.source}/${d.language}) = ${v.toFixed(3)}`);
        if (input.excerpts !== false) {
          const pred = input.predictions.find((p) => p.id === d.id && p.parser === parser)!;
          lines.push(`  - 正解: ${excerpt(goldById.get(d.id)!.fields, field)}`, `  - 予測: ${excerpt(pred.fields, field)}`);
        }
      }
      lines.push("");
    }
  }
  return { markdown: lines.join("\n"), json: { documents, groups } };
}
