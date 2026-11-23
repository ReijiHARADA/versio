import { isDegenerateTranslation, toHalfwidthAscii } from "./degeneration";



const DATE_STAMP = /\d{4}-\d{2}-\d{2}/;
const CCS_CODE = /[A-K]\.\d+(?:\.\d+)*(?:\.[a-z])?/i;

/** Publication labels that are structure/metadata rather than body prose. */
export function looksLikeFrontMatterLabel(text: string): boolean {
  return /^(?:(?:\d+[.)]\s*)?(?:author\s+keywords?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?|index\s+terms?|categories?(?:\s+and\s+subject\s+descriptors?)?))\s*$/i.test(
    text.trim()
  );
}

/** ACM/IEEE subject classification lines should remain structural text. */
export function looksLikeSubjectClassification(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 320) return false;
  if (/[→⟶]/.test(t) && /(?:^|[•·‣∙*])/.test(t)) return true;
  if (/^(?:index\s+terms?|keywords?|ccs\s+concepts?|acm\s+classification\s+keywords?)\s*[—–:-]\s*\S/i.test(t)) return true;
  const start = t.match(new RegExp(`^(${CCS_CODE.source})\\b`, "i"));
  if (!start) return false;
  const codes = t.match(new RegExp(CCS_CODE.source, "gi")) ?? [];
  if (codes.length >= 2) return true;
  const after = t.slice(start[0].length).replace(/^[.\s]+/, "");
  if (!after) return true;
  if (!/^[A-Z(]/.test(after)) return false;
  return after.split(/\s+/).length <= 24;
}

/** High-confidence title candidates that are publisher chrome or decoder garbage. */
export function isGarbageTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (DATE_STAMP.test(t) && t.length < 80) return true;
  if (/proceedings of/i.test(t)) return true;
  if (/^(acm|ieee|tei|chi)\s+\d{4}/i.test(t)) return true;
  if (/没留下|请联系/.test(t)) return true;
  // Broken ToUnicode maps can duplicate short uppercase glyph runs and join
  // them with symbols (for example `АПФАПФ&ПЛ&ПЛ`). Treat this as decoder
  // garbage so a later article-title candidate or metadata fallback wins.
  if (/[&∧]/u.test(t) && /([\p{Lu}]{2,8})\1/u.test(t)) return true;
  return isDegenerateTranslation(t);
}

export function looksLikeNamedWorkHeading(text: string): boolean {
  return /^(?:\d+(?:\.\d+)*[.)]\s+)?.{1,80}?\s+by\s+[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,5}\s*$/.test(
    text.trim()
  );
}

export function formatNamedWorkHeading(text: string): string {
  const match = text
    .trim()
    .match(
      /^(?:(\d+(?:\.\d+)*)[.)]\s+)?(.+?)\s+by\s+(.+)$/i
    );
  if (!match) return text.trim();
  const num = match[1];
  const title = match[2].trim();
  const author = match[3].trim().replace(/[.:;]+$/, "");
  const body = `${title} (${author})`;
  return num ? `${num}. ${body}` : body;
}

export function isReferencesHeading(text: string): boolean {
  return /^(?:\d+[.)]\s*)?(references|bibliography|works cited|literature cited|参考文献|引用文献)\s*$/i.test(
    toHalfwidthAscii(text).trim()
  );
}

export function looksLikeBibliographyEntry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\[\d+\]/.test(t)) return true;
  // Author–year styles can omit a numeric reference label. Require the
  // distinctive all-caps surname/byline pattern, a second author connector,
  // and a parenthesized year so ordinary prose about people is not hidden.
  if (
    /^[A-Z][A-Z'’-]+,\s*(?:[A-Z]\.|[A-Z][a-z]+).*?\b(?:and|&)\s+[A-Z][A-Z'’-]+,.*?\((?:19|20)\d{2}\)\./.test(t)
  ) return true;
  // APA byline: `Chen, L. et al. (2018). …`, `Gupta, M., & Ito, K. (2017). …`.
  if (/^\p{Lu}[\p{L}'’-]+,\s(?:\p{Lu}\.\s?)+(?:,?\s(?:&|and)\s\p{Lu}[\p{L}'’-]+,\s(?:\p{Lu}\.\s?)+)*(?:\s?et al\.)?\s\((?:19|20)\d{2}[a-z]?\)\.\s/u.test(t)) return true;
  if (/^\d+\.\s+[A-Z]/.test(t)) {
    if (/\b(19|20)\d{2}\b/.test(t)) return true;
    if (/\b[A-Z]\.\s+[A-Z]/.test(t)) return true;
    if (/\band\b/.test(t) && /[A-Z][a-z]+\s+[A-Z]/.test(t)) return true;
  }
  if (
    /\b(in proceedings|proc\.|extended abstracts|journal of|transactions on|doi:\s*10\.|https?:\/\/doi|retrieved .{0,24} from|acm conference|ieee )/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(19|20)\d{2}\.\s+\S/.test(t) &&
    /\b(in proceedings|proc\.|journal|conference|acm|ieee|doi|isbn|pp\.|vol\.)/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(arnoldsche|springer|elsevier|wiley|lark jewelry|black dog publishing|010 publishers)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\bIn [A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,6},/.test(t) &&
    (/\(eds?\.\)/.test(t) || /,\s+[A-Z]\.\s/.test(t))
  ) {
    return true;
  }
  return false;
}
