import type { LayoutBlock } from "../../pdfLayout";
import type { CanonicalNode } from "../canonical/types";

/** Region membership can paint chart-adjacent prose with role=table. */
export function looksLikeProseMistakenForTable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(?:table|表)\s*\d+/i.test(trimmed)) return false;
  if (/[√✓☑☒\u3400-\u9fff]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const digitRatio = digits / Math.max(letters + digits, 1);
  if (digits === 0 && letters >= 3 && words.length <= 4 && /^[a-z]/.test(trimmed)) return true;
  if (digits === 0 && /[.!?;]\s+[A-Z]/.test(trimmed) && words.length >= 5 && words.length <= 20) return true;
  if (digits === 0 && words.length === 1 && /ly$/i.test(trimmed) && letters >= 6) return true;
  if (words.length <= 10 && digitRatio < 0.08 &&
      (/^(?:of|and|the|bolded)\b/i.test(trimmed) || /\bbolded\.?$/.test(trimmed))) return true;
  if (words.length >= 6 && /[.!?](?:\s|$)/.test(trimmed) && digitRatio < 0.25 &&
      /^(?:Q\s*:|[-•]\s*Option\b|what\b|which\b|how\b|who\b)/i.test(trimmed)) return true;
  if (words.length >= 10 && /[.!?](?:\s|$)/.test(trimmed) && digitRatio < 0.2) return true;
  if (words.length >= 12 && digitRatio < 0.12) {
    const narrativeOpener = /^(?:When|Altogether|However|Therefore|In this|We |This |To investigate|To provide)\b/.test(trimmed);
    const midSentenceGlue = /[.!?]\s+(?:[A-Z]|Thus|However|Therefore)\b/.test(trimmed);
    if (narrativeOpener || (midSentenceGlue && words.length >= 12)) return true;
  }
  // Some journal front pages use boxed callouts beside the abstract. PDF.js
  // emits each wrapped line as a one-item row, which can look like a
  // repeated prose-cell grid even though it is ordinary readable prose. A
  // long, mostly alphabetic fragment with normal function words is safer as
  // a paragraph; genuine tables retain independent multi-cell geometry or
  // strong numeric evidence and are handled by the table resolver.
  if (words.length >= 14 && digitRatio < 0.12 &&
      /\b(?:the|of|to|in|a|an|and|for|with|from|that|is|are|there|this|as)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** Chart-axis crumbs should leave the document entirely — not become paragraphs. */
export function isChartDebrisFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (digits === 0 && letters >= 2 && words.length <= 4 && /^[a-z]/.test(trimmed)) return true;
  if (digits === 0 && words.length === 1 && /ly$/i.test(trimmed) && letters >= 6) return true;
  if (words.length <= 10 && digits / Math.max(letters + digits, 1) < 0.08 &&
      // Lower-case only: a capitalised `The …` is a sentence, not a chart label.
      (/^(?:of|and|the)\b/.test(trimmed) || /^(?:bolded|pairs except)\b/i.test(trimmed) || /\bbolded\.?$/.test(trimmed))) return true;
  return false;
}

export function hasStrongTableMatrixEvidence(node: CanonicalNode): boolean {
  const hasRepeatedProseGrid = node.evidence.some((entry) => entry.label === "repeated-prose-cell-grid");
  const scoredTable = node.evidence.some((entry) =>
    entry.label === "role-scores" && /table=0\.(?:9[4-9]|[1-9]\d)/.test(entry.reason ?? "")
  );
  const hasIndependentGridEvidence = node.evidence.some((entry) =>
    entry.label === "matrix-axis-label-neighbor" ||
    entry.label === "table-row-geometry" ||
    (entry.label === "captioned-neighbor-cell-rows" && scoredTable) ||
    (entry.label === "captioned-native-multicell-row" && scoredTable)
  );
  // `repeated-prose-cell-grid` is deliberately weak evidence: boxed abstract
  // callouts and multi-column prose can produce the same repeated anchors.
  // A high aggregate role score cannot make that signal a strong matrix on
  // its own; require independent row/axis evidence before preserving it as
  // a table.
  return hasIndependentGridEvidence || (scoredTable && !hasRepeatedProseGrid);
}

/** Recover a native grid only when repeated multi-cell row geometry is strong. */
export function hasStrongNativeTableRows(node: CanonicalNode, layout: LayoutBlock | undefined): boolean {
  if (!layout || layout.lines.length < 3) return false;
  if (node.evidence.some((entry) => entry.label === "vector-figure-label-cluster" || entry.label === "repeated-numeric-chart-label")) {
    return false;
  }
  const geometry = node.evidence.find((entry) => entry.label === "table-row-geometry" && entry.confidence >= 0.9);
  if (!geometry) return false;
  if (looksLikeRunningProse(node.text ?? "", layout.lines)) return false;
  return layout.lines.filter((line) => line.items.length >= 2).length >= 3;
}

export function isNumberedTableCaption(text: string | null | undefined): boolean {
  return /^(?:table|表)\s*\d+/i.test((text ?? "").trim());
}

/** Cell/header crumbs that belong under a numbered table caption. */
export function looksLikeCaptionedTableCellFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isNumberedTableCaption(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (/^[\d.<>=≤≥\s,.\-+eE]+$/.test(trimmed)) return true;
  if (/^(?:Thumb|Finger\s*\d)\b/i.test(trimmed) && words.length <= 24) return true;
  if (/^(?:Finger\s*\d\s*)+$/i.test(trimmed)) return true;
  if (digits >= 3 && digits / Math.max(letters + digits, 1) >= 0.25 && words.length <= 36) return true;
  if (words.length <= 4 && !/[.!?]\s*$/.test(trimmed) && letters <= 40) return true;
  return false;
}

/** Numbered prose items are lists even when an upstream role heuristic called them references. */
export function isNumberedProseListItem(text: string): boolean {
  return /^(?:[1-9]|1[0-9]|20)[.)]\s+/.test(text) && !/\b(?:19|20)\d{2}\b/.test(text.slice(0, 180));
}

export function isLikelyNarrativeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 12 && /[.!?](?:\s|$)/.test(trimmed);
}

/**
 * A whole body paragraph swept into a table region: several finished
 * sentences, few numbers, and (when the lines are known) one left-aligned
 * text column without cell gaps. Table cells never read like this.
 */
/**
 * Prose whose inline citations and statistics, e.g. `China (1, 3, 17, 18)`,
 * defeat the digit-ratio test of looksLikeRunningProse. Header rows open with
 * capitalised labels, so a sentence must show a lower-case word early.
 */
/** A finished sentence carried by function words (`… were observed for … when predicting …`): running text, not cells. */
export function readsAsNarrative(text: string): boolean {
  const t = text.trim();
  const functionWords = t.match(/\b(?:the|of|and|in|to|for|with|was|were|is|are|by|that|from|on|as|when|which)\b/g)?.length ?? 0;
  return /^\p{Lu}\p{Ll}*\s+\p{Ll}/u.test(t) && /[.!?][)\]”"’]*$/.test(t) && functionWords >= 6 && t.split(/\s+/).length >= 30;
}

export function looksLikeCitedProse(text: string): boolean {
  const trimmed = text.trim();
  if (/[•▪]/.test(trimmed) || /^(?:table|fig(?:ure)?\.?|表|図)\s*\d*/i.test(trimmed)) return false;
  const words = trimmed.replace(/\([^()]*\)|\[[^\]]*\]/g, " ").split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 20 || !words.slice(0, 3).some((w) => /^[a-z]/.test(w))) return false;
  const functionShare = words.filter((w) => /^(?:the|of|and|to|in|a|an|is|are|was|were|for|with|that|this|by|on|as|from|than)$/.test(w)).length / words.length;
  return functionShare >= 0.25 ||
    (functionShare >= 0.15 && words.some((w) => /^(?:was|were|is|are|has|have|had|found|showed|revealed|reported)$/.test(w)));
}

export function looksLikeRunningProse(text: string, lines?: LayoutBlock["lines"]): boolean {
  const trimmed = text.trim();
  if (/^(?:table|fig(?:ure)?\.?|表|図)\s*\d*/i.test(trimmed)) return false;
  // Cell text keeps its row breaks; a paragraph's lines are joined.
  if (trimmed.includes("\n")) return false;
  if (!/[.!?][”"’')\]]*$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 30) return false;
  if ((trimmed.match(/[a-z)\]][.!?]\s+[A-Z]/g) ?? []).length < 1) return false;
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (digits / Math.max(1, letters + digits) >= 0.12) return false;
  const functionWords = words.filter((w) => /^(?:the|of|and|to|in|a|is|are|was|were|for|with|that|this|by|on|as)$/i.test(w)).length;
  if (functionWords / words.length < 0.1) return false;
  if (!lines || lines.length < 2) return true;
  const xs = lines.map((l) => Math.round(l.x / 4));
  const mode = [...new Set(xs)].map((x) => xs.filter((y) => Math.abs(y - x) <= 1).length).sort((a, b) => b - a)[0];
  return mode / lines.length >= 0.7;
}
