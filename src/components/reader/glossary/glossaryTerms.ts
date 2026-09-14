import type { GlossaryEntry } from "../../../services/llm/types";

export type GlossaryTermMatch = {
  start: number;
  end: number;
  entry: GlossaryEntry;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find glossary terms inside display text. Longer terms win on overlap.
 * Matching is case-insensitive for Latin; Japanese terms match literally.
 */
export function findGlossaryTermMatches(
  text: string,
  entries: GlossaryEntry[]
): GlossaryTermMatch[] {
  if (!text || entries.length === 0) return [];

  const candidates = entries
    .map((entry) => ({
      entry,
      term: entry.term?.trim() || "",
    }))
    .filter((item) => item.term.length >= 2)
    .sort((a, b) => b.term.length - a.term.length);

  const occupied: Array<{ start: number; end: number }> = [];
  const matches: GlossaryTermMatch[] = [];

  const overlaps = (start: number, end: number) =>
    occupied.some((span) => start < span.end && end > span.start);

  for (const { entry, term } of candidates) {
    const latin = /^[\x00-\x7F]+$/.test(term);
    const pattern = latin
      ? new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi")
      : new RegExp(escapeRegExp(term), "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (overlaps(start, end)) continue;
      occupied.push({ start, end });
      matches.push({ start, end, entry });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; entry: GlossaryEntry };

export function segmentTextWithGlossary(
  text: string,
  entries: GlossaryEntry[]
): TextSegment[] {
  const matches = findGlossaryTermMatches(text, entries);
  if (matches.length === 0) return [{ kind: "text", text }];
  const parts: TextSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, match.start) });
    }
    parts.push({
      kind: "term",
      text: text.slice(match.start, match.end),
      entry: match.entry,
    });
    cursor = match.end;
  }
  if (cursor < text.length) {
    parts.push({ kind: "text", text: text.slice(cursor) });
  }
  return parts;
}
