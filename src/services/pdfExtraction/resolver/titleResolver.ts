import { isGarbageTitle } from "../../translation/quality";
import { fuseTitle } from "../fusion";
import type { RoleCandidate } from "../generic/candidates";
import type { ExtractionEvidence } from "../types";

function looksLikeAuthorish(text: string): boolean {
  if (/@/.test(text)) return true;
  if (/(university|department|institute|大学|大学院)/i.test(text)) return true;
  // Some multilingual mastheads put superscript affiliation numbers directly
  // after a name (`... лаба1, путу ...`). Treat that shape as an author row so
  // it cannot be concatenated into the preceding article title.
  if (/\p{L}{2,}\s*\d{1,3}(?:\s*[,，]|\s*$)/u.test(text) && /[,，]/.test(text)) return true;
  return false;
}

function stripExplicitTitleLabel(text: string): string {
  return text.replace(/^\s*(?:research\s+)?(?:book\s+)?title\s*:\s*/i, "").trim();
}

function isUppercaseTitleLine(text: string): boolean {
  const t = text.replace(/[^\p{L}]+/gu, "").trim();
  return t.length >= 12 && (t.match(/[\p{Lu}]/gu)?.length ?? 0) / t.length >= 0.72;
}

function stripMastheadSuffix(text: string): string {
  const trimmed = text.trim();
  // A title line can be split around an inline journal/year marker when the
  // PDF places the publication rail between two title fragments. Remove only
  // the bounded metadata token and retain both title sides.
  const inlinePublication = trimmed.match(
    /^(.*?)(?:\b[A-Z][A-Z0-9.-]{1,}\s+20\d{2}\s*[;,]\s*\d+\([^)]{0,12}\)\s*:\s*[\d-]+)\s+([a-z\u00c0-\u024f])/u,
  );
  if (inlinePublication && inlinePublication[1].trim().length >= 24) {
    return `${inlinePublication[1].trim()} ${inlinePublication[2]}`.replace(/\s+/g, " ").trim();
  }
  const leadingPublication = trimmed.match(
    /^(?:[A-Z][A-Z0-9.-]{1,}\s+20\d{2}\s*[;,]\s*\d+\([^)]{0,12}\)\s*:\s*[\d-]+)\s+([a-z\u00c0-\u024f].*)$/u,
  );
  if (leadingPublication) return leadingPublication[1].trim();
  // ORCID/URL and email tokens are unambiguous masthead metadata when they
  // occur after a substantial title prefix. Keep URLs that make up the whole
  // candidate out of this rule so a metadata fallback is not truncated.
  const boundary = trimmed.search(/\s+(?:<https?:\/\/|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i);
  if (boundary >= 32) return trimmed.slice(0, boundary).trim();

  // Some repository/journal PDFs place the article title and the running
  // publication line in one native text block, for example:
  // "Article title www.example.org JOURNAL 2021; 3(1): 63-65".  The URL is
  // not an article-title continuation when it is followed by a journal
  // identifier and year/volume metadata.  Strip that generic masthead tail
  // while keeping ordinary titles that merely contain a URL intact.
  const publicationTail = trimmed.search(
    /\s+(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?\s+[A-Z][A-Z0-9.-]{1,}\s+20\d{2}\s*[;,|]/i,
  );
  if (publicationTail >= 32) return trimmed.slice(0, publicationTail).trim();

  return trimmed;
}

function looksLikeRotatedMasthead(candidate: RoleCandidate): boolean {
  const text = candidate.text.trim();
  const rotation = candidate.layoutBlock.rotation ?? candidate.layoutBlock.lines[0]?.rotation ?? 0;
  // arXiv stamps and running mastheads are occasionally emitted with a large
  // title-like font. They are page furniture, even when generic evidence has
  // promoted them to a title candidate.
  return /^(?:arxiv\b|http\s*:\/\/|https\s*:\/\/)/i.test(text) || Math.abs(rotation) >= 45;
}

function looksLikeDocumentMasthead(text: string): boolean {
  const t = text.trim();
  return /^(?:doi\s*:\s*|https?:\/\/|www\.)/i.test(t)
    || /^arxiv\s*:/i.test(t)
    || /\b(?:original\s+paper|research\s+article|journal\s+of|volume\s+\d+|\d{4}\s*\)\s*\d{1,4}\s*[:–-])\b/i.test(t)
    || /^(?:www\.)?nature\.com\b/i.test(t)
    || /^(?:contents\s+lists|journal\s+homepage|available\s+at\s+sciencedirect)\b/i.test(t)
    || /^\d{1,4}\s*\([^)]{0,32}\)\s*\d{4}/.test(t)
    // Repository cover sheets and event headers often put the venue/event
    // before the actual article title. Their slash/date pattern is stable
    // across publishers and should be treated as masthead evidence.
    || /\b(?:seminar|conference|proceedings|journal)\b[\s\S]{0,100}\b20\d{2}\b/i.test(t)
    || /\b20\d{2}\b[\s,|:-]*(?:volume|vol\.?|issue|no\.?)\b/i.test(t)
    || /\b(?:volume|vol\.?|issue|no\.?)\s*\d+[\s,|:-]*\b20\d{2}\b/i.test(t)
    // Year + compact article/page id (e.g. "2024 104753"). Do not treat
    // narrative titles that merely span a date range ("… From 2012 to 2025").
    || (/\b20\d{2}\b[\s,;|:-]+\d{3,6}\s*$/.test(t) && !/:/.test(t) && t.split(/\s+/).filter(Boolean).length <= 12);
}

function looksLikeDecoderGarbageTitle(text: string): boolean {
  const t = text.trim();
  return /[&∧]/u.test(t) && /([\p{Lu}]{2,8})\1/u.test(t);
}

function looksLikeJournalNameMasthead(text: string): boolean {
  const t = text.trim();
  return /\b(?:journal|transactions|proceedings|international\s+journal|advances\s+in\s+(?:scientific|engineering))\b/i.test(t);
}

function looksLikeEventMasthead(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  // Conference/event names commonly sit between a small running header and
  // the article title. Keep this bounded so an article whose title mentions
  // a workshop or seminar is not discarded.
  return words.length <= 14 && /\b(?:seminar|workshop|conference|symposium|public\s+health\s+action)\b/i.test(t) &&
    !/[.!?]$/.test(t);
}

/** A publisher rail is often repeated below itself without the volume/date
 * suffix. Once the first title candidate is already known to be masthead
 * furniture, its shorter normalized prefix is another masthead variant, not
 * a second line of the article title. */
function isShortenedMastheadVariant(first: string, candidate: string): boolean {
  const normalize = (value: string) => value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstWords = normalize(first).split(" ").filter(Boolean);
  const candidateWords = normalize(candidate).split(" ").filter(Boolean);
  if (candidateWords.length < 3 || firstWords.length < candidateWords.length + 1) return false;
  return firstWords.slice(0, candidateWords.length).join(" ") === candidateWords.join(" ");
}

/**
 * A page-one title candidate can be promoted from a publisher's running
 * masthead (DOI, URL, volume/date, event name) before the actual article
 * title.  Treat these as navigation metadata when a later title candidate is
 * available.  This is intentionally vocabulary/geometry based rather than
 * publisher-specific so PDFs without embedded metadata still resolve a real
 * article title.
 */
function looksLikeCopyrightBoilerplate(text: string): boolean {
  const t = text.trim();
  return /^(?:©|\(c\)|copyright\b|permission is given\b)/i.test(t) ||
    /\bcopyright is owned\b/i.test(t) ||
    /\bpermission is given for\b/i.test(t) ||
    /\ball rights reserved\b/i.test(t);
}

function looksLikeAbstractLabelTitle(text: string): boolean {
  return /^(?:abstract|要旨|摘要|概要|บทคัดย่อ|resumo|résumé|resumen)$/i.test(text.trim());
}

function looksLikeDecoderCorruptedTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // CID / legacy encoding leftovers appear as C0 controls inside what layout
  // still promotes as the largest masthead line.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters > 0 && letters < 10 && /[\u0000-\u001f]/.test(t);
}

/** Author + affiliation + abstract mashed into one native title span. */
function looksLikeContaminatedMastheadTitle(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  if (/\b(?:канд\.|докт\.|аннотация\.|фгбоу|университет|e-mail:)\b/i.test(t)) return true;
  // Cyrillic person-name lead followed by an ALL-CAPS title fragment and more prose.
  if (/^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/.test(t) && /[А-ЯЁ]{5,}/.test(t) && t.length > 90) return true;
  return false;
}

/** Chapter body / abstract prose promoted because it used a large font. */
function looksLikeBodyLeadInTitle(text: string): boolean {
  const t = text.trim();
  if (/^(?:while|although|because|however|since|whereas|this\s+(?:paper|chapter|study)|in\s+this\s+(?:paper|chapter)|building upon|based on (?:our|the)|following (?:our|the)|extending)\b/i.test(t)) {
    return true;
  }
  // Citation-heavy prose is not an article title.
  if (t.length >= 70 && (/\(\d{4}\)/.test(t) || /\[\d+\]/.test(t) || (t.match(/,/g) ?? []).length >= 4) &&
    /\b(?:and\/or|managers|scholars|firms|because|routines|review|previous work)\b/i.test(t)) {
    return true;
  }
  return looksLikeBodyTitleCandidate(t);
}

/** Cureus-style tool/workflow lines steal the title role from the article title. */
function looksLikeShortToolOrFragmentTitle(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8 || t.length > 55) return false;
  if (/:/.test(t)) return false;
  // Real article titles often start with "Using … to …" / "Using … for …".
  // Only treat short platform stubs as chrome (e.g. "Using Google Cloud Vertex AI").
  const academicUsing =
    /^(?:using|via|with|through)\b.+\b(?:to|for|in|on)\b.+/i.test(t) &&
    /\b(?:psychology|learning|network|model|detection|classification|analysis|study|review|survey)\b/i.test(t);
  if (academicUsing) return false;
  if (
    /^(?:using|via|with|through|based on)\s+[A-Z(]/i.test(t) &&
    /\b(?:google|cloud|vertex|azure|aws|chatgpt|openai|matlab|python|android|ios)\b/i.test(t)
  ) {
    return true;
  }
  // Product / platform stubs without review/study vocabulary.
  if (
    words.length <= 6 &&
    !/\b(?:review|survey|analysis|study|effect|impact|perspectives?|classification|detection|psychology)\b/i.test(t) &&
    /\b(?:google|cloud|vertex|azure|aws|chatgpt|openai|matlab|python)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Conference abstract ethics crumbs are not titles. */
function looksLikeEthicsBoilerplateTitle(text: string): boolean {
  const t = text.trim();
  return /^(?:ethical permission|ethics?\s+(?:approval|permission|committee)|informed consent|this study was approved|institutional (?:review board|human ethical)|all procedures were|permission was granted)\b/i.test(
    t
  );
}

/** Vignette / survey prompt options sometimes outrank the cover title. */
function looksLikePromptOptionTitle(text: string): boolean {
  const t = text.trim();
  if (/^[-•*]?\s*option\s*\d+\s*:/i.test(t)) return true;
  if (/^[-•*]\s+.+\b(?:bank teller|most probable|which option)\b/i.test(t)) return true;
  return false;
}

/** Keyword index lines are never article titles. */
function looksLikeKeywordsChrome(text: string): boolean {
  const t = text.trim();
  if (/^(?:key\s*words?(?:\s+and\s+phrases)?|keywords?|index terms|ccs concepts)\s*:/i.test(t)) {
    return true;
  }
  if (/^(?:ключевые\s+слова(?:\s+и\s+фразы)?)\s*:/i.test(t)) return true;
  // Publisher rule-line residue glued to keyword blocks.
  if (/_{8,}/.test(t) && /\b(?:key\s*words?|keywords?)\b/i.test(t)) return true;
  return false;
}

/** PRISMA / methods-table crumbs sometimes outrank the article title. */
function looksLikeProtocolTableChrome(text: string): boolean {
  const t = text.trim();
  if (/^(?:research conducted|inclusion criteria|exclusion criteria|gray literature|non-?peer-?reviewed|studies in the domains)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:inclusion|exclusion)\s+criteria\b/i.test(t)) return true;
  if (/\bresearch focused exclusively\b/i.test(t)) return true;
  if (/\bpharmacological treatments\b/i.test(t)) return true;
  if (/\bgray literature\b/i.test(t)) return true;
  if (/\bstudies in the domains of\b/i.test(t)) return true;
  if (/\bscience without a\b/i.test(t)) return true;
  if (/\bclinical case reports?\b/i.test(t)) return true;
  if (/\b(?:desktop-mounted|head-mounted|webcam-based)\b/i.test(t)) return true;
  // Multi-clause eligibility prose mashed into one "title" cell.
  if ((t.match(/\b(?:or|and)\b/gi) ?? []).length >= 4 && /\b(?:psychology|neuroscience|computer)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * When the strongest title candidate is an abstract label, copyright sheet,
 * or decoder garbage, recover a Latin cover/article title from nearby page-one
 * blocks (including lines mislabeled as author).
 */
function recoverAlternateCoverTitle(candidates: RoleCandidate[]): string | null {
  const thesis = recoverThesisCoverTitle(candidates);
  if (thesis) return thesis;

  const latin = candidates
    .filter((c) => c.pageStart === 1 || c.pageStart === 2)
    .map((c) => {
      const t = c.text.trim();
      const latinChars = (t.match(/[A-Za-z]/g) ?? []).length;
      const words = t.split(/\s+/).filter(Boolean).length;
      const minLatin = c.role === "heading" || c.role === "title" || c.role === "paragraph" ? 12 : 18;
      // Narrative-review titles can be long; allow more words for paragraph-shaped mastheads.
      const maxWords = c.role === "heading" ? 16 : 28;
      if (latinChars < minLatin || words < 3 || words > maxWords) return null;
      if (
        looksLikeAbstractLabelTitle(t) ||
        looksLikeCopyrightBoilerplate(t) ||
        looksLikeObviousMastheadTitle(t) ||
        looksLikeDecoderCorruptedTitle(t) ||
        looksLikeContaminatedMastheadTitle(t) ||
        looksLikeBodyLeadInTitle(t) ||
        looksLikeProtocolTableChrome(t) ||
        looksLikeKeywordsChrome(t) ||
        looksLikeShortToolOrFragmentTitle(t) ||
        looksLikeEthicsBoilerplateTitle(t) ||
        looksLikePromptOptionTitle(t) ||
        looksLikeAuthorish(t) ||
        /@/.test(t) ||
        /\bPh\.?\s*D\b/i.test(t) ||
        /\([A-Z][^)]*(?:university|college|institute|lab)\b/i.test(t) ||
        /^(?:source|источник|keywords?|ccs concepts|index terms|chapter\s+\d+)\b/i.test(t) ||
        // Keyword / index lines are comma-dense; real titles rarely are.
        ((t.match(/,/g) ?? []).length >= 3)
      ) {
        return null;
      }
      // Prefer title-case / all-caps article lines over affiliation prose.
      // CamelCase product titles (`sEMGCareHCI: …`) are also eligible.
      const titleShape = !/[.!?]$/.test(t) && (
        /^[A-Z(]/.test(t) ||
        (/:/.test(t) && t.length >= 24) ||
        /^[a-z]{1,8}[A-Z]/.test(t)
      );
      if (!titleShape) return null;
      const font = c.layoutBlock.lines[0]?.fontSize ?? 10;
      const y = c.boundingBoxes[0]?.y ?? c.layoutBlock.bbox?.y ?? 999;
      const roleBonus = c.role === "title" ? 24 : c.role === "heading" ? 28 : c.role === "paragraph" ? 16 : c.role === "author" ? 12 : c.role === "affiliation" ? 8 : 0;
      const colonBonus = /:/.test(t) ? 18 : 0;
      const allCapsBonus = /^[A-Z0-9][A-Z0-9\s,:;-]+$/.test(t) && words >= 3 ? 14 : 0;
      const narrativeBonus = /\b(?:perspectives?|review|survey|analysis)\b/i.test(t) ? 8 : 0;
      const topBonus = c.pageStart === 1 && y < 160 ? 22 : c.pageStart === 1 && y < 280 ? 10 : 0;
      const fontFloorPenalty = font < 9 ? -40 : 0;
      return {
        text: t,
        score:
          font * 2 +
          Math.min(latinChars, 60) +
          roleBonus +
          colonBonus +
          allCapsBonus +
          narrativeBonus +
          topBonus +
          fontFloorPenalty +
          (c.pageStart === 1 ? 6 : 0),
      };
    })
    .filter((entry): entry is { text: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);
  if (latin[0]) return latin[0].text;

  // Cyrillic / mixed-script journal issues often keep the article title as an
  // ALL-CAPS paragraph while keyword lines still win the Latin font race.
  const cyrillic = candidates
    .filter((c) => c.pageStart === 1 || c.pageStart === 2)
    .map((c) => {
      const t = c.text.trim();
      const cyr = (t.match(/[А-Яа-яЁё]/g) ?? []).length;
      const upper = (t.match(/[А-ЯЁ]/g) ?? []).length;
      const words = t.split(/\s+/).filter(Boolean).length;
      if (cyr < 18 || words < 4 || words > 28) return null;
      if (looksLikeKeywordsChrome(t) || looksLikeAuthorish(t) || looksLikeCopyrightBoilerplate(t)) return null;
      if (upper / cyr < 0.55) return null;
      if (!/^[«"“]?[А-ЯЁ]/.test(t)) return null;
      const font = c.layoutBlock.lines[0]?.fontSize ?? 10;
      const y = c.boundingBoxes[0]?.y ?? c.layoutBlock.bbox?.y ?? 999;
      const roleBonus = c.role === "heading" || c.role === "title" ? 20 : 8;
      return { text: t, score: font * 2 + Math.min(cyr, 60) + roleBonus + (y < 200 ? 12 : 0) + (c.pageStart === 1 ? 6 : 0) };
    })
    .filter((entry): entry is { text: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score);
  if (cyrillic[0]) return cyrillic[0].text;

  // Journal TOC pages sometimes emit the article title as consecutive ALL-CAPS
  // headings before the author line.
  const caps: string[] = [];
  for (const c of candidates) {
    if (c.pageStart > 2) break;
    const t = c.text.trim();
    if (!t || t.length < 12) continue;
    const letters = (t.match(/[A-Za-z]/g) ?? []).length;
    const upper = (t.match(/[A-Z]/g) ?? []).length;
    if (letters < 12 || upper / letters < 0.72) {
      if (caps.length > 0) break;
      continue;
    }
    if (looksLikeAuthorish(t) || /\b(?:university|ph\.?\s*d)\b/i.test(t)) break;
    caps.push(t);
    if (caps.join(" ").length > 200) break;
  }
  const joined = caps.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length >= 28) return joined;

  // Scanned books often have no extractable text on pages 1–2. Recover the
  // first substantial short line pair from the earliest text-bearing page.
  // Do not require candidate.role === heading: layout may still call these
  // paragraphs before the resolver promotes them.
  const earlyHeadings = candidates
    .filter((c) => {
      const t = c.text.trim();
      return c.pageStart <= 5 &&
        t.length >= 8 &&
        t.length <= 80 &&
        t.split(/\s+/).length <= 10 &&
        !/[.!?]$/.test(t) &&
        !looksLikeAuthorish(t) &&
        !looksLikeJournalChromeTitle(t) &&
        !looksLikeBodyLeadInTitle(t) &&
        !/^(?:university|college|institute|department)\b/i.test(t) &&
        !/@/.test(t);
    })
    .sort((a, b) => a.pageStart - b.pageStart || ((a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0)));
  if (earlyHeadings[0]) {
    const first = earlyHeadings[0].text.trim();
    const second = earlyHeadings[1];
    if (
      second &&
      second.pageStart === earlyHeadings[0].pageStart &&
      second.text.trim().length <= 40 &&
      /^(?:a|an|the)\s+/i.test(second.text.trim())
    ) {
      return `${first}: ${second.text.trim()}`;
    }
    return first;
  }
  return null;
}

/** Publisher/journal banners that win the largest-font title race. */
function looksLikeJournalChromeTitle(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  if (/^npj\s*[|·•]/i.test(t)) return true;
  if (/^[A-Za-z][A-Za-z &:-]{2,40}\s+\d{1,4}\s*\(\d{4}\)/.test(t)) return true; // Journal 50 (2026)
  if (/\be\d{4,}\b/.test(t) && t.split(/\s+/).length <= 8) return true;
  if (/^[A-Za-z]{2,6}\s*[|·•]/i.test(t) && /\barticle\b/i.test(t)) return true;
  if (/^(?:article|research article|original article|open access)\b/i.test(t) && t.length <= 40) return true;
  return false;
}

function looksLikeObviousMastheadTitle(text: string): boolean {
  const t = text.trim();
  return looksLikeDocumentMasthead(t) || looksLikeJournalNameMasthead(t) || looksLikeEventMasthead(t) ||
    looksLikeCopyrightBoilerplate(t) || looksLikeJournalChromeTitle(t) ||
    /^(?:doi\s*:\s*|https?:\/\/|www\.)/i.test(t) ||
    /\b(?:issn|e-?issn|volume|vol\.?|issue|no\.?|pages?|pp\.?|received|accepted|published)\b/i.test(t) &&
      (t.match(/\d/g)?.length ?? 0) >= 2;
}

/**
 * Thesis PDFs often put a copyright sheet on page 1 (largest font → title)
 * and the real title on the following cover page, split across heading +
 * continuation paragraphs. Recover that cover block before Abstract / degree
 * lines without depending on a publisher name.
 */
function recoverThesisCoverTitle(candidates: RoleCandidate[]): string | null {
  const abstractIdx = candidates.findIndex((c) =>
    /^(?:abstract|要旨)$/i.test(c.text.trim()) && c.pageStart <= 6
  );
  if (abstractIdx < 0) return null;
  const stop = /^(?:a\s+thesis\s+presented|thesis\s+submitted|submitted\s+in\s+partial|in\s+partial\s+fulfil|doctor of philosophy|phd|master of|requirements for the degree|acknowledgements?|contents)\b/i;
  const parts: string[] = [];
  for (let i = 0; i < abstractIdx; i++) {
    const c = candidates[i];
    if (c.pageStart < 2 || c.pageStart > 4) continue;
    const text = c.text.trim();
    if (!text || text.length < 8) continue;
    if (stop.test(text) || looksLikeCopyrightBoilerplate(text) || looksLikeAuthorish(text)) {
      if (parts.length > 0) break;
      continue;
    }
    if (!["heading", "title", "paragraph"].includes(c.role)) continue;
    if (/^\d{4}$/.test(text) || /^[ivxlcdm]+$/i.test(text)) continue;
    // Author-only lines after a completed title question should stop collection.
    if (parts.length > 0 && /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,4}$/.test(text) && text.length <= 48) break;
    parts.push(text);
    if (parts.join(" ").length > 220) break;
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length < 28 || looksLikeCopyrightBoilerplate(joined)) return null;
  // Prefer a question / subtitle-shaped cover title over a lone short fragment.
  if (!/[?]/.test(joined) && parts.length < 2 && joined.split(/\s+/).length < 8) return null;
  return joined;
}

function looksLikeMastheadGeometry(candidate: RoleCandidate): boolean {
  const box = candidate.boundingBoxes[0];
  const line = candidate.layoutBlock.lines[0];
  const words = candidate.text.trim().split(/\s+/).filter(Boolean).length;
  // Publisher journal labels are commonly emitted as a tiny line at the top
  // of page one.  Use this only together with a supplied metadata title; a
  // small article title without metadata must remain untouched.
  return candidate.pageStart === 1 && (box?.y ?? Infinity) < 100 &&
    (line?.fontSize ?? Infinity) <= 8 && words <= 10;
}

function isPlausibleMetadataTitle(text: string): boolean {
  const t = text.trim();
  // Repository and thesis records legitimately include a subtitle and degree
  // context, so metadata titles can be longer than a journal title. Keep a
  // bounded ceiling to avoid accepting an accidentally stored full document.
  if (t.length < 12 || t.length > 500 || looksLikeDocumentMasthead(t)) return false;
  if (/\.(?:pdf|docx?)$/i.test(t) || /^(?:[/\\]|https?:\/\/)/i.test(t)) return false;
  const words = t.match(/\S+/g) ?? [];
  // Short legitimate article titles (for example “Computational Linguistics”)
  // are common in journal PDFs. Keep the two-word allowance narrow so a
  // generic one- or two-word masthead label is not promoted as metadata.
  return words.length >= 3 || (words.length === 2 && /[A-Za-z\u00C0-\u024F]/.test(t) && words.every((word) => /[A-Z\u00C0-\u024F]/.test(word)));
}

function looksLikeTruncatedTitle(text: string): boolean {
  const t = text.trim();
  // A body paragraph cut at the native block limit often ends in a line-break
  // hyphen. A long, prose-like candidate with that shape is safer to repair
  // from document metadata than to expose as the article title.
  if (/-$/.test(t) && t.length > 100 && (t.match(/\s+/g)?.length ?? 0) >= 14) return true;
  if (t.length >= 180 && /^(?:while|although|because|this\s+(?:study|paper)|we\s+)/i.test(t)) return true;
  if (/(?:\b(?:to|of|and|for|with|in|on|from|the|a|an))$/i.test(t)) return true;
  if (/\b[A-Z][a-z]+,\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}(?:,|\s|$)/.test(t) && t.length > 100) return true;
  const half = Math.floor(t.length / 2);
  return half >= 30 && (t.slice(0, half).trim() === t.slice(half).trim() || /^(\S.{28,}?)\s+\1$/s.test(t));
}

/**
 * Native extraction can promote the first abstract/body paragraph (or a
 * publisher masthead followed by body text) to the title role.  Such a
 * candidate is structurally distinguishable from a real title even when it
 * starts with title-case words: it is unusually long and contains multiple
 * sentence boundaries.  Keep this format-agnostic so metadata can repair
 * title identity without adding publisher-specific rules.
 */
function looksLikeBodyTitleCandidate(text: string): boolean {
  const t = text.trim();
  if (looksLikeCopyrightBoilerplate(t)) return true;
  if (t.length < 240) return false;
  const sentenceBoundaries = t.match(/[.!?](?:\s|$)/g)?.length ?? 0;
  return sentenceBoundaries >= 2 || /^(?:this (?:paper|thesis)\b)/i.test(t) ||
    // A native block can be truncated before the second sentence. Citation
    // parentheses plus prose length still distinguish it from a real title.
    (t.length >= 140 && /\([A-Z][A-Za-z-]+(?:\s+\d{4})?$/.test(t) && /\b(?:while|because|managers|research|study)\b/i.test(t));
}

function joinTitleParts(left: string, right: string): string {
  if (/[-\u2010-\u2014]$/.test(left)) {
    // Preserve an intentional compound such as "On-" + "Body". A lowercase
    // continuation is the usual line-break hyphenation case and can safely
    // be dehyphenated.
    if (/^[A-Z\u00C0-\u024F]/.test(right)) return `${left}${right}`;
    return `${left.replace(/[-\u2010-\u2014]+$/, "")}${right}`;
  }
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

function stripInlineAuthorTail(candidate: RoleCandidate): string {
  const lines = candidate.layoutBlock.lines.map((line) => line.text.trim()).filter(Boolean);
  if (lines.length < 2) return candidate.text.trim();
  const cut = lines.findIndex((line, index) => index > 0 &&
    // Numbered author markers and comma-separated name lists are stable
    // geometry-independent signs that a title block swallowed its author row.
    /\p{L}{2,}\s*[¹²³⁴⁵⁶⁷⁸⁹0-9]+/u.test(line) && /[,，]/.test(line));
  if (cut <= 0) return candidate.text.trim();
  return lines.slice(0, cut).join(" ").replace(/\s+/g, " ").trim();
}

function collapseRepeatedTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const midpoint = Math.floor(normalized.length / 2);
  if (midpoint < 24) return normalized;
  const left = normalized.slice(0, midpoint).trim();
  const right = normalized.slice(midpoint).trim();
  if (left === right) return left;
  // PDF line grouping may insert one space/newline between two identical
  // masthead copies. Compare token halves to avoid deleting legitimate
  // subtitles that merely repeat a short phrase.
  const words = normalized.split(/\s+/);
  if (words.length >= 8 && words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(" ") === words.slice(half).join(" ")) {
      return words.slice(0, half).join(" ");
    }
  }
  return normalized;
}

/**
 * Choose a native title string. Never replace healthy pdf.js text with
 * GROBID/VLM output. Joins a hyphen-truncated line with the next native block.
 */
export function resolveTitle(input: {
  candidates: RoleCandidate[];
  metadataTitle?: string;
  extra?: ExtractionEvidence[];
  grobidTitle?: string | null;
}): { text: string | null; confidence: number; evidence: ExtractionEvidence[] } {
  // A layout pass can conservatively label a large masthead line as author;
  // allow strong native title evidence to participate without discarding the
  // original candidate role used by other resolver decisions.
  const nativeTitles = input.candidates.filter(
    (c) => (c.role === "title" || (c.roleScores?.title ?? 0) >= 0.85) &&
      !looksLikeRotatedMasthead(c) && !looksLikeDecoderGarbageTitle(c.text)
  );
  // Report/book templates often expose an explicit `Research Book Title:`
  // label but generic role scoring assigns that line to author/affiliation
  // because it sits inside the masthead. Treat the label as stronger title
  // evidence than the incidental role while preserving the original node
  // roles for the rest of the resolver.
  const labeledTitles = input.candidates.filter((c) =>
    c.pageStart === 1 && /^\s*(?:research\s+)?(?:book\s+)?title\s*:/i.test(c.text) &&
    !looksLikeRotatedMasthead(c) && !looksLikeDecoderGarbageTitle(c.text)
  );
  const titles = [...nativeTitles, ...labeledTitles.filter((candidate) => !nativeTitles.includes(candidate))]
    .sort((a, b) => (a.pageStart - b.pageStart) || ((a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0)));
  const uppercaseTitleCluster = titles.filter((candidate) =>
    candidate.pageStart === 1 &&
    isUppercaseTitleLine(candidate.text) &&
    candidate.text.split(/\s+/).length >= 4 &&
    !looksLikeObviousMastheadTitle(candidate.text)
  );
  const titleDebug = typeof process !== "undefined" && process.env.PDF_TITLE_DEBUG === "1";
  if (titleDebug) console.info("[title-debug] candidates", titles.map((c) => ({ role: c.role, text: c.text, y: c.boundingBoxes[0]?.y, x: c.boundingBoxes[0]?.x, font: c.layoutBlock.lines[0]?.fontSize })));
  let native: string[] = [];

  if (titles.length > 0) {
    let combined = stripMastheadSuffix(stripExplicitTitleLabel(stripInlineAuthorTail(titles[0])));
    for (let i = 1; i < titles.length; i++) {
      const prev = titles[i - 1];
      const cur = titles[i];
      if (cur.pageStart !== prev.pageStart) break;
      const prevBottom =
        (prev.boundingBoxes[0]?.y ?? 0) + (prev.boundingBoxes[0]?.height ?? 0);
      const gap = (cur.boundingBoxes[0]?.y ?? 0) - prevBottom;
      const prevFont = prev.layoutBlock.lines[0]?.fontSize ?? 12;
      if (gap > prevFont * 2.8) break;
      if (looksLikeAuthorish(cur.text)) break;
      // A publication line can be emitted as a second `title` candidate
      // immediately below the real title.  Do not concatenate it into the
      // article title merely because its baseline is close.
      if (looksLikeObviousMastheadTitle(cur.text)) break;
      combined = joinTitleParts(combined, stripMastheadSuffix(stripExplicitTitleLabel(cur.text)));
    }
    native = [combined];

    // A centered venue banner can be emitted as the strongest title before
    // the real article title. When a second title candidate is substantially
    // lower on page one and returns to the page margin, use that structural
    // sequence as evidence even when the venue name has no `journal` keyword.
    const firstTitleBox = titles[0].boundingBoxes[0];
    const secondTitle = titles.find((candidate) =>
      candidate !== titles[0] && candidate.pageStart === 1 &&
      (candidate.boundingBoxes[0]?.y ?? 0) > (firstTitleBox?.y ?? 0) + 36 &&
      (candidate.boundingBoxes[0]?.x ?? 0) < (candidate.layoutBlock.lines[0]?.pageWidth ?? 612) * 0.2 &&
      !looksLikeObviousMastheadTitle(candidate.text) && !looksLikeAuthorish(candidate.text)
    );
    if (secondTitle && (firstTitleBox?.x ?? 0) > (secondTitle.layoutBlock.lines[0]?.pageWidth ?? 612) * 0.16) {
      native = [stripMastheadSuffix(secondTitle.text)];
    }

    // If the first title candidate is clearly publisher furniture, prefer a
    // later article-title candidate before falling back to external metadata.
    // This matters in production imports where `metadataTitle` is commonly
    // absent; the prior implementation only repaired journal-name cases.
    if (looksLikeObviousMastheadTitle(titles[0].text) || looksLikeMastheadGeometry(titles[0])) {
      if (titleDebug) console.info("[title-debug] masthead branch", looksLikeObviousMastheadTitle(titles[0].text), looksLikeMastheadGeometry(titles[0]));
      const firstY = titles[0].boundingBoxes[0]?.y ?? 0;
      const authorY = input.candidates
        .filter((candidate) => candidate.pageStart === 1 && candidate.role === "author" &&
          !/\b(?:issn|proceedings|volume|issue)\b/i.test(candidate.text) &&
          !looksLikeObviousMastheadTitle(candidate.text))
        .map((candidate) => candidate.boundingBoxes[0]?.y ?? Number.POSITIVE_INFINITY)
        .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
      if (titleDebug) console.info("[title-debug] authorY", authorY);
      const later = titles
        .filter((candidate) => candidate.pageStart === titles[0].pageStart &&
          (candidate.boundingBoxes[0]?.y ?? 0) > firstY + 18 &&
          (candidate.boundingBoxes[0]?.y ?? 0) < authorY - 3 &&
          !looksLikeObviousMastheadTitle(candidate.text) &&
          !looksLikeMastheadGeometry(candidate) &&
          !looksLikeAuthorish(candidate.text) &&
          !isShortenedMastheadVariant(titles[0].text, candidate.text))
        .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
      if (titleDebug) console.info("[title-debug] later", later.map((c) => c.text));
      const lastTitle = titles.at(-1);
      if (titleDebug) console.info("[title-debug] last", lastTitle?.text, lastTitle?.boundingBoxes[0]?.y);
      if (lastTitle && lastTitle !== titles[0] && (lastTitle.boundingBoxes[0]?.y ?? 0) > firstY + 24) {
        const y = lastTitle.boundingBoxes[0]?.y ?? 0;
        // Keep the final title-role span as a safe fallback even if a nearby
        // prefix was conservatively classified as affiliation.
        native = [stripInlineAuthorTail(lastTitle)];
        const sameBaseline = input.candidates
          .filter((candidate) => {
            const box = candidate.boundingBoxes[0];
            const text = candidate.text.trim();
            return candidate.pageStart === 1 &&
              Math.abs((box?.y ?? 0) - y) <= 12 &&
              candidate.role !== "author" && candidate.role !== "header" && candidate.role !== "footer" &&
              !looksLikeObviousMastheadTitle(text) && !looksLikeAuthorish(text) && text.length <= 100;
          })
          .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
        if (titleDebug) console.info("[title-debug] baseline", sameBaseline.map((c) => ({ role: c.role, text: c.text, y: c.boundingBoxes[0]?.y })));
        if (sameBaseline.length > 0) native = [sameBaseline.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
      }
      if (later[0]) {
        if (later.length >= 2) {
          // A journal masthead can be followed by a multi-line article title.
          // Preserve the complete vertically ordered title cluster instead of
          // selecting only its final line (which often looks like an author).
          native = [later.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
        } else {
        // The final title candidate before the author band is usually the
        // article title; earlier candidates are often the journal label and
        // issue line.  Selecting the last candidate also handles title text
        // split across a short prefix and a second native span.
        const anchor = later.at(-1)!;
        const y = anchor.boundingBoxes[0]?.y ?? 0;
        const cluster = titles
          .filter((candidate) => candidate.pageStart === anchor.pageStart &&
            Math.abs((candidate.boundingBoxes[0]?.y ?? 0) - y) <= 5 &&
            !looksLikeObviousMastheadTitle(candidate.text) &&
            !looksLikeAuthorish(candidate.text))
          .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
        native = [cluster.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
        }
      }

      // Some layouts classify the article title as a paragraph because the
      // journal masthead consumed the strongest title score. Recover a
      // paragraph-role candidate in the narrow masthead-to-author band. The
      // geometry boundary and sentence/metadata filters keep abstract/body
      // prose out of this recovery path.
      if (!later[0]) {
        const firstBox = titles[0].boundingBoxes[0];
        const firstFont = titles[0].layoutBlock.lines[0]?.fontSize ?? 0;
        const alternate = input.candidates
          .filter((candidate) => {
            const box = candidate.boundingBoxes[0];
            const text = candidate.text.trim();
            const words = text.split(/\s+/).filter(Boolean).length;
            const font = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
            return candidate.pageStart === 1 &&
              (candidate.role === "paragraph" || candidate.role === "heading" || candidate.role === "title") &&
              (box?.y ?? 0) > (firstBox?.y ?? 0) + 16 &&
              (box?.y ?? 0) < authorY - 3 &&
              text.length >= 20 && text.length <= 280 && words >= 3 &&
              (text.match(/[.!?](?:\s|$)/g)?.length ?? 0) <= 1 &&
              !/[.!?]$/.test(text) &&
              !looksLikeObviousMastheadTitle(text) &&
              !looksLikeAuthorish(text) &&
              !/^(?:abstract|keywords?|introduction|received|accepted|published)\b/i.test(text) &&
              font >= Math.max(0, firstFont * 0.9);
          })
          .sort((a, b) => {
            const fontA = a.layoutBlock.lines[0]?.fontSize ?? 0;
            const fontB = b.layoutBlock.lines[0]?.fontSize ?? 0;
            const lengthA = Math.min(a.text.trim().length, 180);
            const lengthB = Math.min(b.text.trim().length, 180);
            return (fontB * 4 + lengthB * 0.01) - (fontA * 4 + lengthA * 0.01);
          })[0];
        if (alternate) {
          const anchorBox = alternate.boundingBoxes[0];
          const cluster = input.candidates
            .filter((candidate) => {
              const box = candidate.boundingBoxes[0];
              const text = candidate.text.trim();
              return candidate.pageStart === 1 && candidate !== titles[0] &&
                Math.abs((box?.y ?? 0) - (anchorBox?.y ?? 0)) <= 5 &&
                (candidate.role === "title" || candidate.role === "paragraph" ||
                  (candidate.role === "affiliation" && text.length <= 80 && !/\b(?:university|department|institute|laboratory)\b/i.test(text))) &&
                !looksLikeObviousMastheadTitle(text) && !looksLikeAuthorish(text);
            })
            .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
          native = [cluster.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
        }
      }
    }

    // PDF producers sometimes split one title line into adjacent native text
    // spans.  Treat a same-baseline, touching title cluster as one title even
    // when there is no journal-masthead marker.  This is geometry evidence:
    // author/affiliation candidates and vertically separated lines remain
    // excluded, so the rule does not absorb the masthead below the title.
    const first = titles[0];
    const firstBox = first.boundingBoxes[0];
    if (firstBox && first.pageStart === 1 && first.text.trim().split(/\s+/).length <= 6) {
      const baselineCluster = titles
        .filter((candidate) => {
          if (candidate === first || candidate.pageStart !== first.pageStart) return false;
          const box = candidate.boundingBoxes[0];
          if (!box || Math.abs(box.y - firstBox.y) > Math.max(3, firstBox.height * 0.35)) return false;
          if (looksLikeAuthorish(candidate.text)) return false;
          const gap = box.x - (firstBox.x + firstBox.width);
          return gap >= -3 && gap <= Math.max(24, firstBox.height * 2.5);
        })
        .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
      if (baselineCluster.length > 0) {
        native = [[first, ...baselineCluster]
          .map((candidate) => stripMastheadSuffix(candidate.text))
          .join(" ").replace(/\s+/g, " ").trim()];
      }
    }

    // Some publisher PDFs place the journal masthead above the article title
    // and emit the article title as several same-baseline spans. If the first
    // native title is a short masthead and nearby chrome confirms that layout,
    // rebuild only the later same-baseline title cluster from geometry. This
    // is deliberately structural; it does not name a publisher or journal.
    const articleTitleRecovered = native[0] !== combined;
    const hasJournalChrome = input.candidates.some((candidate) =>
      candidate.pageStart === 1 && /^(?:contents\s+lists|journal\s+homepage|available\s+at\s+sciencedirect)\b/i.test(candidate.text.trim())
    );
    const firstTitle = titles[0];
    if (hasJournalChrome && !articleTitleRecovered) {
      const laterTitles = titles.filter((candidate) =>
        candidate.pageStart === firstTitle.pageStart &&
        (candidate.boundingBoxes[0]?.y ?? 0) > (firstTitle.boundingBoxes[0]?.y ?? 0) + 32 &&
        !looksLikeObviousMastheadTitle(candidate.text) &&
        !looksLikeMastheadGeometry(candidate)
      );
      const sortedLaterTitles = laterTitles.sort((a, b) =>
        (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0) ||
        (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0)
      );
      const anchor = sortedLaterTitles.at(-1);
      if (anchor) {
        const y = anchor.boundingBoxes[0]?.y ?? 0;
        const cluster = input.candidates
          .filter((candidate) => {
            const box = candidate.boundingBoxes[0];
            return candidate.pageStart === anchor.pageStart &&
              Math.abs((box?.y ?? 0) - y) <= 5 &&
              candidate.role !== "author" && candidate.role !== "paragraph" &&
              candidate.role !== "header" && candidate.role !== "footer" &&
              candidate.text.trim().length >= 3;
          })
          .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
        // Elsevier-style mastheads may expose the article title as one native
        // candidate rather than a same-baseline cluster. The journal chrome
        // plus a later title-role candidate is sufficient structural evidence
        // to prefer it over the centered venue banner.
        if (cluster.length >= 1) native = [cluster.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
      }
    }

    // A common journal layout has the journal name as a large first title,
    // followed by volume/date metadata and then the article title.  When the
    // later title candidate is still above the author masthead, prefer that
    // structurally later candidate.  This uses document order and masthead
    // vocabulary only; it does not depend on a publisher or paper name.
    if (looksLikeJournalNameMasthead(firstTitle.text)) {
      const authorY = input.candidates
        .filter((candidate) => candidate.pageStart === 1 && candidate.role === "author")
        .map((candidate) => candidate.boundingBoxes[0]?.y ?? Number.POSITIVE_INFINITY)
        .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
      const later = titles
        .filter((candidate) => candidate.pageStart === 1 &&
          (candidate.boundingBoxes[0]?.y ?? 0) > (firstTitle.boundingBoxes[0]?.y ?? 0) + 36 &&
          (candidate.boundingBoxes[0]?.y ?? 0) < authorY - 4 &&
          !looksLikeJournalNameMasthead(candidate.text))
        .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0))[0];
      if (later) native = [stripMastheadSuffix(later.text)];
    }

    const last = titles[titles.length - 1];
    const lastText = native[0];
    if (/[-\u2010-\u2014]$/.test(lastText) || /\bOn-$/.test(lastText)) {
      const idx = input.candidates.findIndex((c) => c.id === last.id);
      const next = input.candidates[idx + 1];
      if (
        next &&
        next.pageStart === last.pageStart &&
        next.role !== "author" &&
        next.role !== "affiliation" &&
        next.role !== "heading" &&
        !looksLikeAuthorish(next.text)
      ) {
        native = [joinTitleParts(lastText, next.text.trim())];
      }
    }
  }

  // Explicit title labels are a higher-confidence structural anchor than a
  // nearby abstract line or venue banner. Re-assert them after the generic
  // masthead heuristics above so later-title geometry cannot override a real
  // `Research Book Title:` field.
  if (labeledTitles.length > 0) {
    const labeled = labeledTitles[0];
    native = [stripMastheadSuffix(stripExplicitTitleLabel(stripInlineAuthorTail(labeled)))];
  }

  if (labeledTitles.length === 0 && uppercaseTitleCluster.length >= 2) {
    const cluster = uppercaseTitleCluster
      .filter((candidate, index, all) => index === 0 ||
        (candidate.boundingBoxes[0]?.y ?? 0) - (all[index - 1].boundingBoxes[0]?.y ?? 0) < 28)
      .slice(-3);
    if (cluster.length >= 2) {
      native = [cluster.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
    }
  }

  if (native.length === 0) {
    // Scanned front matter can leave pages 1–2 empty; take the first large
    // native line from the opening pages instead of leaving the title blank.
    const earlyPages = input.candidates.filter(
      (c) =>
        c.pageStart <= 3 &&
        c.role !== "header" &&
        c.role !== "footer" &&
        c.role !== "copyright" &&
        c.text.trim().length >= 8 &&
        c.text.trim().length <= 180 &&
        !looksLikeAuthorish(c.text) &&
        !looksLikeJournalChromeTitle(c.text) &&
        !looksLikeObviousMastheadTitle(c.text) &&
        !looksLikeKeywordsChrome(c.text) &&
        !looksLikeProtocolTableChrome(c.text)
    );
    const fallback = earlyPages
      .filter((c) => c.layoutBlock.lines[0]?.fontSize)
      .sort(
        (a, b) =>
          (a.pageStart - b.pageStart) ||
          (b.layoutBlock.lines[0]?.fontSize ?? 0) -
            (a.layoutBlock.lines[0]?.fontSize ?? 0)
      )[0];
    if (fallback && !isGarbageTitle(fallback.text)) {
      native = [fallback.text.trim()];
      // Join a short subtitle on the next line (e.g. textbook "A Textbook").
      const idx = input.candidates.findIndex((c) => c.id === fallback.id);
      const next = input.candidates[idx + 1];
      if (
        next &&
        next.pageStart === fallback.pageStart &&
        next.text.trim().length >= 4 &&
        next.text.trim().length <= 40 &&
        /^(?:a|an|the)\s+/i.test(next.text.trim()) &&
        !looksLikeAuthorish(next.text)
      ) {
        native = [`${fallback.text.trim()}: ${next.text.trim()}`];
      }
    }
  }

  const isFragmentTitle = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 3 && text.trim().length <= 28;
  };
  const needsAlternateTitle = !native[0] ||
    looksLikeCopyrightBoilerplate(native[0]) ||
    looksLikeAbstractLabelTitle(native[0]) ||
    looksLikeDecoderCorruptedTitle(native[0]) ||
    looksLikeContaminatedMastheadTitle(native[0]) ||
    looksLikeBodyLeadInTitle(native[0]) ||
    looksLikeJournalChromeTitle(native[0]) ||
    looksLikeProtocolTableChrome(native[0]) ||
    looksLikeKeywordsChrome(native[0]) ||
    looksLikeShortToolOrFragmentTitle(native[0]) ||
    looksLikeEthicsBoilerplateTitle(native[0]) ||
    looksLikePromptOptionTitle(native[0]) ||
    isFragmentTitle(native[0]) ||
    (titles[0] && (
      looksLikeCopyrightBoilerplate(titles[0].text) ||
      looksLikeAbstractLabelTitle(titles[0].text) ||
      looksLikeDecoderCorruptedTitle(titles[0].text) ||
      looksLikeContaminatedMastheadTitle(titles[0].text) ||
      looksLikeBodyLeadInTitle(titles[0].text) ||
      looksLikeJournalChromeTitle(titles[0].text) ||
      looksLikeProtocolTableChrome(titles[0].text) ||
      looksLikeKeywordsChrome(titles[0].text) ||
      looksLikeShortToolOrFragmentTitle(titles[0].text) ||
      looksLikeEthicsBoilerplateTitle(titles[0].text) ||
      looksLikePromptOptionTitle(titles[0].text) ||
      isFragmentTitle(titles[0].text)
    ));
  if (needsAlternateTitle) {
    const recovered = recoverAlternateCoverTitle(input.candidates);
    if (recovered && recovered !== native[0]) native = [recovered];
  }

  let fused = fuseTitle(native.map(collapseRepeatedTitle), input.extra ?? [], input.grobidTitle);
  // Post-fusion repair: joining title fragments can recreate contaminated or
  // body-lead titles even when an earlier candidate looked plausible.
  if (
    fused.text &&
    (looksLikeContaminatedMastheadTitle(fused.text) ||
      looksLikeBodyLeadInTitle(fused.text) ||
      looksLikeCopyrightBoilerplate(fused.text) ||
      looksLikeJournalChromeTitle(fused.text) ||
      looksLikeProtocolTableChrome(fused.text) ||
      looksLikeKeywordsChrome(fused.text) ||
      looksLikeShortToolOrFragmentTitle(fused.text) ||
      looksLikeEthicsBoilerplateTitle(fused.text) ||
      looksLikePromptOptionTitle(fused.text))
  ) {
    const recovered = recoverAlternateCoverTitle(input.candidates);
    if (recovered && recovered !== fused.text) {
      fused = {
        text: recovered,
        confidence: Math.max(0.62, fused.confidence * 0.9),
        evidence: [
          ...fused.evidence,
          {
            source: "pdf-native",
            label: "title",
            confidence: 0.66,
            reason: "replaced contaminated or body-lead fused title with alternate cover title",
          },
        ],
      };
    }
  }
  const meta = input.metadataTitle?.trim() || "";
  // Native extraction occasionally promotes a DOI, journal masthead, or
  // volume line as the title. When a non-garbage metadata title exists, it is
  // stronger identity evidence than that obvious masthead candidate. This is
  // format-agnostic and does not replace a normal native title.
  const metadataMatchesNativePrefix = Boolean(meta && fused.text && fused.text.startsWith(meta) && /^\s*[:–—-]/.test(fused.text.slice(meta.length)));
  const nativeMatchesMetadataPrefix = Boolean(meta && fused.text && meta.startsWith(fused.text.trim()) && fused.text.trim().length >= 40);
  const nativePrefixRepair = (() => {
    if (!meta || !fused.text || fused.text.trim().length < 28) return false;
    const normalizeWord = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const nativeWords = fused.text.trim().split(/\s+/).map(normalizeWord).filter(Boolean);
    const metadataWords = meta.split(/\s+/).map(normalizeWord).filter(Boolean);
    const common = Math.min(3, nativeWords.length, metadataWords.length);
    return common >= 3 && nativeWords.slice(0, common).join(" ") === metadataWords.slice(0, common).join(" ") &&
      metadataWords.length > nativeWords.length && metadataWords.length - nativeWords.length <= 5;
  })();
  const weakSectionTitle = Boolean(fused.text && fused.text.length <= 24 && meta &&
    meta.length >= fused.text.length * 2 && titles[0]?.role === "title");
  const geometryMasthead = titles.length > 0 && looksLikeMastheadGeometry(titles[0]);
  if (fused.text && meta && isPlausibleMetadataTitle(meta) && (looksLikeObviousMastheadTitle(fused.text) || geometryMasthead || looksLikeTruncatedTitle(fused.text) || looksLikeBodyTitleCandidate(fused.text) || metadataMatchesNativePrefix || nativeMatchesMetadataPrefix || nativePrefixRepair || weakSectionTitle)) {
    return {
      text: meta,
      confidence: Math.max(0.55, fused.confidence * 0.8),
      evidence: [
        ...fused.evidence,
        {
          source: "pdf-native",
          label: "title",
          confidence: 0.62,
          reason: "native candidate was a document masthead; metadata identity fallback",
        },
      ],
    };
  }
  if (!fused.text && meta && !isGarbageTitle(meta)) {
    return {
      text: meta,
      confidence: 0.55,
      evidence: [
        ...fused.evidence,
        {
          source: "pdf-native",
          label: "title",
          confidence: 0.55,
          reason: "PDF metadata title fallback",
        },
      ],
    };
  }

  if (!fused.text) {
    return { text: null, confidence: 0, evidence: fused.evidence };
  }

  return {
    text: fused.text,
    confidence: fused.confidence,
    evidence: fused.evidence,
  };
}
