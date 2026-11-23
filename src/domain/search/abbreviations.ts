export type AbbreviationDefinition = { abbr: string; longForm: string };

const PARENS = /[（(]([^()（）]{1,240})[)）]/g;
const WORD = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g;
const JAPANESE_CHAR = /[\p{Script=Han}\p{Script=Katakana}ー・]/u;
const LATIN_PHRASE = /^[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,4}$/;

function trimLongForm(value: string): string {
  return value.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
}

function isShortForm(value: string): boolean {
  const words = value.trim().split(/\s+/);
  const compact = value.replace(/[^A-Za-z0-9]/g, "");
  return words.length <= 2
    && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value)
    && compact.length >= 2
    && compact.length <= 10
    && /[A-Za-z]/.test(compact)
    && /[A-Z]/.test(compact);
}

function matchedLongForm(shortForm: string, candidate: string): string | undefined {
  const longForm = trimLongForm(candidate);
  const chars = shortForm.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (longForm.length < shortForm.length || longForm.toLowerCase() === shortForm.toLowerCase()) return;
  if (new RegExp(`(^|[^A-Za-z0-9])${shortForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z0-9])`, "i").test(longForm)) return;

  let cursor = longForm.length - 1;
  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i];
    while (cursor >= 0 && (longForm[cursor].toLowerCase() !== char || (i === 0 && cursor > 0 && /[A-Za-z0-9]/.test(longForm[cursor - 1])))) cursor--;
    if (cursor < 0) return;
    if (i === 0 && cursor > 0 && /[A-Za-z0-9]/.test(longForm[cursor - 1])) return;
    cursor--;
  }
  return longForm;
}

function definitionBefore(text: string, end: number, sentenceStart: number, shortForm: string): string | undefined {
  const maxWords = Math.min(shortForm.replace(/[^A-Za-z0-9]/g, "").length + 5, shortForm.replace(/[^A-Za-z0-9]/g, "").length * 2);
  let start = end;
  let cursor = end - 1;
  for (let count = 0; cursor >= sentenceStart && count < maxWords;) {
    while (cursor >= sentenceStart && !/[A-Za-z0-9'-]/.test(text[cursor])) cursor--;
    if (cursor < sentenceStart) break;
    while (cursor >= sentenceStart && /[A-Za-z0-9'-]/.test(text[cursor])) cursor--;
    start = cursor + 1;
    count++;
  }
  const words = [...text.slice(start, end).matchAll(WORD)];
  for (let i = words.length - 1; i >= Math.max(0, words.length - maxWords); i--) {
    const wordStart = start + (words[i].index ?? 0);
    const longForm = matchedLongForm(shortForm, text.slice(wordStart, end));
    if (longForm) return longForm;
  }
}

function shortFormBefore(text: string, end: number): string | undefined {
  const match = /([A-Za-z0-9][A-Za-z0-9-]*)\s*$/.exec(text.slice(Math.max(0, end - 24), end));
  return match && isShortForm(match[1]) ? match[1] : undefined;
}

function japaneseTermBefore(text: string, end: number): string | undefined {
  let start = end;
  while (start > 0 && JAPANESE_CHAR.test(text[start - 1])) start--;
  return start < end ? text.slice(start, end) : undefined;
}

/** Definitions found in `text`, deduped by (abbr, longForm) case-insensitively, first occurrence order. */
export function extractAbbreviations(text: string): AbbreviationDefinition[] {
  const definitions: AbbreviationDefinition[] = [];
  const seen = new Set<string>();
  const add = (abbr: string, longForm: string | undefined) => {
    if (!longForm) return;
    const key = `${abbr}\0${longForm}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    definitions.push({ abbr, longForm });
  };

  let sentenceStart = 0;
  let scannedTo = 0;
  for (const match of text.matchAll(PARENS)) {
    const inner = match[1].trim();
    const open = match.index ?? 0;
    for (; scannedTo < open; scannedTo++) if (/[.!?。！？\n]/.test(text[scannedTo])) sentenceStart = scannedTo + 1;
    const japanese = japaneseTermBefore(text, open);
    if (japanese && japanese.length >= 2 && (isShortForm(inner) || LATIN_PHRASE.test(inner))) {
      add(inner, japanese);
      continue;
    }
    if (isShortForm(inner)) add(inner, definitionBefore(text, open, sentenceStart, inner));
    else {
      const outer = shortFormBefore(text, open);
      if (outer) add(outer, matchedLongForm(outer, inner));
    }
  }
  return definitions;
}
