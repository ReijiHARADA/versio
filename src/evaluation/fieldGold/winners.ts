import type { ReportJson, ScoredDocument } from "./report";
import type { FieldName, FieldScores, ParserId } from "./types";

export type WinnerProposal = { field: FieldName; language: "en" | "ja"; winner: ParserId; margin: number; paired: number; reason: string };

const FIELDS: FieldName[] = ["title", "authors", "authorAffiliation", "emails", "captions", "references"];

/** Primary metric for the decision: exact title match, otherwise F1. */
function primary(scores: FieldScores, field: FieldName): number | null {
  if (field === "title") return scores.title ? scores.title.exact : null;
  return scores[field]?.f1 ?? null;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Mean of (candidate − versio) over documents both parsers scored. */
function pairedMargin(docs: ScoredDocument[], field: FieldName, language: string, candidate: ParserId): { margin: number; paired: number } {
  const base = new Map(docs.filter((d) => d.parser === "versio" && d.language === language).map((d) => [d.id, primary(d.scores, field)]));
  const diffs: number[] = [];
  for (const d of docs) {
    if (d.parser !== candidate || d.language !== language) continue;
    const c = primary(d.scores, field);
    const v = base.get(d.id);
    if (c === null || v === null || v === undefined) continue;
    diffs.push(c - v);
  }
  return { margin: diffs.length ? round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0, paired: diffs.length };
}

/**
 * Per field and language, the parser that beats the current extractor by at
 * least `minMargin` on paired documents; otherwise "versio". A parser that wins
 * in English is never adopted for Japanese when it is worse there.
 */
export function proposeWinners(report: ReportJson, opts: { minMargin: number }): WinnerProposal[] {
  const docs = report.documents;
  const parsers = [...new Set(docs.map((d) => d.parser))].filter((p) => p !== "versio");
  const out: WinnerProposal[] = [];
  for (const field of FIELDS) {
    const byLanguage = new Map<"en" | "ja", Array<{ parser: ParserId; margin: number; paired: number }>>();
    for (const language of ["en", "ja"] as const) {
      byLanguage.set(language, parsers.map((parser) => ({ parser, ...pairedMargin(docs, field, language, parser) })).filter((c) => c.paired > 0));
    }
    let enWinner: ParserId = "versio";
    for (const language of ["en", "ja"] as const) {
      const candidates = byLanguage.get(language)!;
      const pairedBase = docs.filter((d) => d.parser === "versio" && d.language === language && primary(d.scores, field) !== null).length;
      if (pairedBase === 0) continue;
      const best = [...candidates].sort((a, b) => b.margin - a.margin)[0];
      let winner: ParserId = "versio";
      let margin = 0;
      let paired = pairedBase;
      let reason: string;
      if (!best) {
        reason = "比較できる方式なし（他方式は未実行）";
      } else if (best.margin >= opts.minMargin) {
        winner = best.parser;
        margin = best.margin;
        paired = best.paired;
        reason = `${best.parser} が現行より +${best.margin.toFixed(3)}（対 ${best.paired} 本）`;
      } else {
        margin = best.margin;
        paired = best.paired;
        reason = `最良の ${best.parser} でも差 ${best.margin >= 0 ? "+" : ""}${best.margin.toFixed(3)} < ${opts.minMargin}（対 ${best.paired} 本）`;
      }
      if (language === "en") enWinner = winner;
      if (language === "ja" && enWinner !== "versio" && winner !== enWinner) {
        const enOnJa = candidates.find((c) => c.parser === enWinner);
        if (enOnJa && enOnJa.margin < 0) reason += `。英語の勝者 ${enWinner} は日本語で現行より ${enOnJa.margin.toFixed(3)} 悪化するため不採用`;
      }
      out.push({ field, language, winner, margin, paired, reason });
    }
  }
  return out;
}
