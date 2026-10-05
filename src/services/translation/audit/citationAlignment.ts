import { diagnoseIncompleteSource } from "../quality";

export function citationTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/\[\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*\s*\]/g)) {
    tokens.push(...(match[0].match(/\d{1,3}(?:\s*[-–—]\s*\d{1,3})?/g) ?? []).map((value) => value.replace(/\s+/g, "")));
  }
  for (const match of text.matchAll(/(?<=[A-Za-z\p{L}])\s*(\d{1,2})(?=\s*[,;:.、。)）]|$)/gu)) {
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
    if (/(?:Figure|Fig\.?|Table|Tbl\.?)\s*$/i.test(prefix)) continue;
    tokens.push(match[1]);
  }
  return tokens;
}

export function diagnoseCitationAlignment(source: string, translation: string) {
  const sourceTokens = citationTokens(source);
  const outputTokens = citationTokens(translation);
  const sourceCounts = new Map<string, number>();
  const outputCounts = new Map<string, number>();
  for (const token of sourceTokens) sourceCounts.set(token, (sourceCounts.get(token) ?? 0) + 1);
  for (const token of outputTokens) outputCounts.set(token, (outputCounts.get(token) ?? 0) + 1);
  const missing = [...sourceCounts.entries()]
    .filter(([token, count]) => (outputCounts.get(token) ?? 0) < count)
    .map(([token]) => token);
  const sourceCompleteness = diagnoseIncompleteSource(source);
  return {
    sourceCitationTokens: sourceTokens,
    outputCitationTokens: outputTokens,
    missingCitationOccurrences: missing,
    sourceCompleteness,
    eligible: !sourceCompleteness.incomplete,
    flagged: !sourceCompleteness.incomplete && missing.length > 0,
  };
}
