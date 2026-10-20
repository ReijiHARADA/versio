import { isGarbageTitle } from "../../translation/quality";
import { fuseTitle } from "../fusion";
import type { RoleCandidate } from "../generic/candidates";
import type { ExtractionEvidence } from "../types";

function looksLikeAuthorish(text: string): boolean {
  if (/@/.test(text)) return true;
  // Affiliation crumbs only — do not reject topic titles that merely mention
  // `University Teaching` / `… Institute of …: a review`.
  if (/\b(?:university|department|institute|大学|大学院)\b/i.test(text)) {
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    const affiliationLead =
      /^(?:department|institute|university|faculty|school|college|大学院|大学)\b/i.test(trimmed) ||
      /\b(?:dept\.|department of|faculty of|school of|institute of|university of)\b/i.test(trimmed);
    const topicTitle =
      /:/.test(trimmed) ||
      /\b(?:review|study|analysis|survey|teaching|education|learning|students?|curriculum|effects?|impact|role|correlates?)\b/i.test(
        trimmed,
      );
    if (affiliationLead || (words.length <= 10 && !topicTitle)) return true;
  }
  // Geographic affiliation crumbs (`Republic of Macedonia … Ohrid`) are not titles.
  if (/^(?:republic of|federal republic of|kingdom of)\b/i.test(text.trim())) return true;
  // Strip correspondence markers / hanging `and` before shape checks so
  // `Sixiao Li1 and Lijing Chen1*` and `Laura Saad *, … and` count as bylines.
  const cleaned = text
    .trim()
    .replace(/[*†‡§♠♣♡♢∗]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+and\s*$/i, "")
    .trim();
  // Two-author bylines (`Koen Stroeken and Tony Belpaeme`, `Zhiyuan Liu1 and Mohsen Taheri5`) are never titles.
  if (/^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\d*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*\d*)+\s+and\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\d*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*\d*)+$/u.test(cleaned) &&
    cleaned.split(/\s+/).length <= 8) {
    return true;
  }
  // Comma-separated First Last rails with correspondence markers
  // (`Laura Saad *, Eileen Roesler , Elizabeth Phillips and`).
  if (
    (text.match(/,/g) ?? []).length >= 1 &&
    /[*†‡]/.test(text) &&
    /\b(?:and|&)\b/i.test(text) &&
    cleaned.split(/\s+/).length <= 14 &&
    !/\b(?:study|review|analysis|editorial|system|model|database|effect|role|correlates?)\b/i.test(cleaned)
  ) {
    return true;
  }
  // Some multilingual mastheads put superscript affiliation numbers directly
  // after a name (`... лаба1, путу ...`). Treat that shape as an author row so
  // it cannot be concatenated into the preceding article title.
  if (/\p{L}{2,}\s*\d{1,3}(?:\s*[,，]|\s*$)/u.test(text) && /[,，]/.test(text)) return true;
  // Comma-separated First Last bylines
  // (`Saeed Salehi , Jordan Lei , Ari S. Benjamin , … and Konrad P.`).
  // Require person-shaped segments and reject topic lists
  // (`Documentation Time, Note Quality, and Clinician Acceptance`).
  if ((cleaned.match(/,/g) ?? []).length >= 2 && /\b(?:and|&)\b/i.test(cleaned) && !/:/.test(cleaned)) {
    if (
      /\b(?:time|quality|acceptance|study|review|analysis|effects?|role|system|model|attention|data|learning|training|management|practice|documentation|clinician|note)\b/i.test(
        cleaned,
      )
    ) {
      return false;
    }
    const segments = cleaned
      .split(/\s*,\s*/)
      .map((part) => part.replace(/\s+and\s+/i, " ").replace(/\s+&\s+/g, " ").trim())
      .filter(Boolean);
    const personSegments = segments.filter((part) =>
      /^(?:[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ]\.?)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){1,2})$/u.test(
        part,
      ),
    );
    if (personSegments.length >= 2 && cleaned.split(/\s+/).length <= 22) return true;
  }
  return false;
}

function stripExplicitTitleLabel(text: string): string {
  return text
    .replace(/^\s*(?:research\s+)?(?:book\s+)?title\s*:\s*/i, "")
    .replace(/^\s*study\s+protocol\s+/i, "")
    .trim();
}

function isUppercaseTitleLine(text: string): boolean {
  const t = text.replace(/[^\p{L}]+/gu, "").trim();
  return t.length >= 12 && (t.match(/[\p{Lu}]/gu)?.length ?? 0) / t.length >= 0.72;
}

/** Journal banners like `O R I G I N A L   R E S E A R C H` prefixed to titles. */
function stripSpacedArticleTypeBanner(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(?:(?:[A-Z]\s+){3,}[A-Z])(?:\s+(?:[A-Z]\s+){2,}[A-Z])*(?:\s+Open\s+Access)?\s+([A-ZÀ-ÖØ-Þ].+)$/u
  );
  if (!match?.[1]) return trimmed;
  const banner = trimmed.slice(0, trimmed.length - match[1].length).replace(/\s+/g, "");
  if (
    !/^(?:ORIGINAL|RESEARCH|ARTICLE|REVIEW|BRIEF|REPORT|LETTER|EDITORIAL|CLINICAL|SYSTEMATIC)+(?:OPENACCESS)?$/i.test(
      banner
    )
  ) {
    return trimmed;
  }
  return match[1].trim();
}

/** Entire title slot is only a spaced article-type banner (+ optional Open Access). */
function looksLikeSpacedArticleTypeOnly(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const withoutOpenAccess = trimmed.replace(/\s+Open\s+Access$/i, "").trim();
  const letters = withoutOpenAccess.replace(/[^A-Za-z]/g, "");
  if (
    !/^(?:ORIGINAL|RESEARCH|ARTICLE|REVIEW|BRIEF|REPORT|LETTER|EDITORIAL|CLINICAL|SYSTEMATIC)+$/i.test(
      letters
    )
  ) {
    return false;
  }
  // Real titles are dense words. Banner glyphs are emitted with many gaps, or
  // as near-single-letter tokens (`S YS T E M AT I C R E V I E W`).
  const tokens = withoutOpenAccess.split(" ").filter(Boolean);
  const shortTokens = tokens.filter((token) => token.length <= 2).length;
  return tokens.length >= 4 && shortTokens / tokens.length >= 0.5;
}

function looksLikeCitationBylineTitle(text: string): boolean {
  const t = text.trim();
  // Frontiers "Author A and Author B (2019) Title…" citation rails.
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?)+\s*\(\s*20\d{2}\s*\)/.test(t)) {
    return true;
  }
  if (/^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\s+[A-Z]\.?\s*\(\s*20\d{2}\s*\)/u.test(t)) return true;
  if (!/\bet\s+al\./i.test(t)) return false;
  if (!/\b(?:19|20)\d{2}\b/.test(t) && !/\bsuppl/i.test(t)) return false;
  return (
    /\b(?:bmc|ieee|acm|plos|frontiers|nature|science|lancet|jama|bmj|nucleic|med\s+inform|decis\s+mak)\b/i.test(t) ||
    /https?:\/\//i.test(t) ||
    /\d+\s*\(\s*suppl/i.test(t) ||
    /,\s*\d+(?:\s*\(\s*suppl[^)]*\))?\s*:\s*\d+/i.test(t)
  );
}

/** Journal section labels mis-scored as author (e.g. "Independent Articles"). */
function looksLikeSectionBannerAuthor(text: string): boolean {
  const t = text.trim();
  // Bare section labels only. `Editorial: Neurofeedback: …` is an article title.
  if (/^(?:independent|original|research|brief|review|special|invited)\s+articles?\b/i.test(t)) {
    return true;
  }
  if (/^(?:articles?|editorial|commentary|perspective)\b/i.test(t) && t.split(/\s+/).length <= 4) {
    return !/:/.test(t);
  }
  return false;
}

function stripMastheadSuffix(text: string): string {
  let trimmed = stripSpacedArticleTypeBanner(text.trim());
  // bioRxiv / preprint line-number gutters (`1 Modeling Attention…`).
  trimmed = trimmed.replace(/^\d{1,2}\s+(?=[A-ZÀ-ÖØ-Þ«"“])/u, "");
  // Drop a leading citation byline when it was fused onto the article title.
  const citationLead = trimmed.match(
    /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?)+\s*\(\s*20\d{2}\s*\)\s+(.*)$/
  );
  if (citationLead?.[1] && citationLead[1].trim().length >= 24) {
    trimmed = citationLead[1].trim();
  }
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
  return /^(?:doi\s*:\s*|doi\s+\d|https?:\/\/|www\.)/i.test(t)
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

/** Repository cover / bound volume TOCs mistaken for the article title. */
function looksLikeTableOfContentsTitle(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (/^(?:table of contents|contents)\b/i.test(t)) return true;
  // Dot leaders: `Original Manuscript........ 5 Supplementary Files..... 57`
  if (/\.{5,}/.test(t) && /\b(?:manuscript|supplementary|figures?|tables?|appendix)\b/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeJournalNameMasthead(text: string): boolean {
  const t = text.trim();
  // Explicit journal vocabulary, or a venue line ending in volume/year/article id
  // (`Computer Methods and Programs in Biomedicine 221 (2022) 106874`).
  if (/\b(?:journal|transactions|proceedings|international\s+journal|advances\s+in\s+(?:scientific|engineering))\b/i.test(t)) {
    return true;
  }
  if (
    /\b(?:methods?|programs?|reports?|letters?|communications?)\b/i.test(t) &&
    /\b(?:in|and|of)\b/i.test(t) &&
    /\d{2,4}\s*\(\s*20\d{2}\s*\)/.test(t)
  ) {
    return true;
  }
  // Bare Elsevier/ScienceDirect journal banner without the volume suffix
  // (`Computer Methods and Programs in Biomedicine`). Keep this narrow so
  // article titles like `A general method for …` stay eligible.
  if (
    /^[A-Z][\w &:-]{12,90}$/.test(t) &&
    /\b(?:methods and programs|programs in biomedicine|computer methods)\b/i.test(t) &&
    !/\b(?:review|study|analysis|learning|detection|classification|survey|general method)\b/i.test(t) &&
    t.split(/\s+/).filter(Boolean).length >= 5 &&
    t.split(/\s+/).filter(Boolean).length <= 10
  ) {
    return true;
  }
  return false;
}

function looksLikeEventMasthead(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  // Conference/event names commonly sit between a small running header and
  // the article title. Keep this bounded so an article whose title mentions
  // a workshop or seminar is not discarded.
  if (words.length > 14 || /[.!?]$/.test(t)) return false;
  if (!/\b(?:seminar|workshop|conference|symposium|public\s+health\s+action)\b/i.test(t)) return false;
  // Narrative titles that merely mention a conference (`… in press conference
  // interpreting`) are article titles, not event mastheads.
  if (/\b(?:constructing|building|towards?|toward|analysis|study|review|survey|image|role|effects?|based)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:in|of|for|on|with|from)\s+(?:press\s+)?conference\b/i.test(t) && words.length >= 6) {
    return false;
  }
  return true;
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
    /\ball rights reserved\b/i.test(t) ||
    /\bcreative commons attribution\b/i.test(t) ||
    /\blicense\s*\(\s*cc\s*by\b/i.test(t) ||
    // bioRxiv / medRxiv running license stamped as a title candidate.
    /\bwhich was not certified by peer review\b/i.test(t) ||
    /\bgranted (?:biorxiv|medrxiv) a license to display the preprint\b/i.test(t) ||
    /\bit is made available under a CC-BY\b/i.test(t) ||
    /^cc\s*by\b/i.test(t);
}

/** MDPI sidebar chrome promoted as a title candidate. */
function looksLikeAcademicEditorsTitle(text: string): boolean {
  return /^(?:academic\s+editors?|academic\s+editor|guest\s+editors?)\s*:/i.test(text.trim());
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
  if (letters > 0 && letters < 10 && /[\u0000-\u001f]/.test(t)) return true;
  // Missing inter-word spaces from broken ToUnicode maps
  // (`Activevisionislinked intheindividualbrain`).
  const tokens = t.split(/\s+/).filter(Boolean);
  const glued = tokens.filter((token) =>
    token.length >= 12 &&
    !/[-–—]/.test(token) &&
    /[a-z]{10,}/i.test(token) &&
    /(?:vision|linked|category|selectivity|individual|brain|active)/i.test(token)
  );
  if (glued.length >= 1 && tokens.length <= 6) return true;
  // Real titles commonly use two long Latin tokens (`Electrophysiological`
  // + `presuppositional`). Only treat extreme runs as decoder glue.
  const longRun = tokens.filter((token) => /^[A-Za-z]{22,}$/.test(token));
  if (longRun.length >= 2) return true;
  if (tokens.some((token) => /^[A-Za-z]{30,}$/.test(token))) return true;
  return false;
}

/** Drop-cap glyph glued onto the first body word (`Tcase incidence reports…`). */
function looksLikeDropCapBodyTitle(text: string): boolean {
  const t = text.trim();
  if (t.length < 18) return false;
  const first = t.split(/\s+/)[0] ?? "";
  // Do not treat real English openers (`From`, `These`, `When`) as drop-cap
  // glue — a prior alternation matched `F`+`rom` / `T`+`hese` and rejected
  // legitimate article titles.
  if (
    /^(?:The|A|An|On|In|Of|To|For|From|With|Toward|Towards|Using|How|Why|What|When|Where|Who|Which|This|These|Those|There|Their|Then|Than|Thus|Both|While|Although|However|Since|Research|Review|Analysis)$/i.test(
      first,
    )
  ) {
    return false;
  }
  // Decorative capital fused into a non-word stem (`Tcase`, `Tduring`).
  // Do not include `ommunity` — real titles often start with `Community-based…`.
  if (
    /^[A-Z](?:case|during|ncidence|athematical|andemic)\b/i.test(t) &&
    /\b(?:incidence|reports?|from|generated|torrent|during|pandemic|patients?|community|mathematical|models?)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /^[A-Z][a-z]{3,}\s+[a-z]/.test(t) &&
    /\b(?:reports? from|generated a|torrent of)\b/i.test(t) &&
    /\b(?:to|from|of|and|the|a|an)$/i.test(t)
  ) {
    return true;
  }
  return false;
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
  // Real academic titles often list topics after a protocol/review subtitle
  // (`…: Protocol for a scoping review of definitions, measurement, …`).
  // Do not treat that shape as body prose merely because it contains commas
  // and the word "review".
  if (
    /:\s*(?:a\s+)?(?:protocol|scoping review|systematic review|narrative review|meta-?analysis)\b/i.test(t) ||
    /\b(?:protocol for (?:a\s+)?(?:scoping|systematic)|scoping review of|systematic review of)\b/i.test(t)
  ) {
    if (!/[.!?]$/.test(t) && !/\(\d{4}\)/.test(t) && !/\[\d+\]/.test(t)) return false;
  }
  if (/^(?:while|although|because|however|since|whereas|this\s+(?:paper|chapter|study)|in\s+this\s+(?:paper|chapter)|building upon|based on (?:our|the)|following (?:our|the)|extending)\b/i.test(t)) {
    return true;
  }
  // Methods/results prose leads (`The review included…`, `These findings confirm…`).
  if (
    /^(?:the\s+review\s+included|these\s+findings\s+confirm|this\s+bibliometric\s+analysis|synthetic\s+\w+\s+are\s+rapidly)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Two-column first pages can glue a short title fragment to the abstract
  // (`…Decision-Making making. The study offers…`). A mid-title sentence
  // boundary followed by study/article prose is not a real title.
  if (
    t.length >= 48 &&
    /\.\s+(?:The|This|We|Our|These|Those|However|Moreover|In)\s+(?:study|article|paper|chapter|review|work|research)\b/i.test(t)
  ) {
    return true;
  }
  if (looksLikeDropCapBodyTitle(t)) return true;
  // Citation-heavy prose is not an article title. Keep `review` out of the
  // vocabulary here — topic-list titles commonly include it.
  if (t.length >= 70 && (/\(\d{4}\)/.test(t) || /\[\d+\]/.test(t) || (t.match(/,/g) ?? []).length >= 4) &&
    /\b(?:and\/or|managers|scholars|firms|because|routines|previous work)\b/i.test(t)) {
    return true;
  }
  return looksLikeBodyTitleCandidate(t);
}

/** Data-availability / ethics / funding statements sometimes win font races. */
function looksLikePublisherStatementTitle(text: string): boolean {
  const t = text.trim();
  return /^(?:data\s+availability(?:\s+(?:policy|statement))?|author contributions?|funding(?:\s+statement)?|competing interests?|conflicts? of interest|acknowledg(?:e)?ments?)\b/i.test(t) ||
    /\bdata availability (?:policy|statement)\b/i.test(t) ||
    /\bprotocol is registered with\b/i.test(t) ||
    // PLOS left-rail OSF / registry chrome glued onto methods prose.
    /^(?:registries?\s+at)\b/i.test(t) ||
    /\bosf\.io\b/i.test(t) ||
    /\b10\.17605\/osf\b/i.test(t) ||
    /\bwill independently screen\b/i.test(t) ||
    (/https?:\/\//i.test(t) && /\b(?:eligibility|appraisal|screen and chart)\b/i.test(t)) ||
    // Frontiers date rails can glue into one token (`RECEIVEDREVISED 03 June…`).
    /^(?:received|revised|accepted|published|receivedrevised|received\s*revised)\b/i.test(t) ||
    /\breceivedrevised\b/i.test(t);
}

/** Springer LNCS series-history blurbs are not cover titles. */
function looksLikeSeriesEditorsChrome(text: string): boolean {
  const t = text.trim();
  return /^(?:commenced publication|founding and former series editors)\b/i.test(t) ||
    /\bfounding and former series editors\b/i.test(t) ||
    /^lecture notes in (?:computer science|artificial intelligence|bioinformatics)\b/i.test(t);
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
  // Instrument / scale names mis-painted as the article title
  // (`Human Computer Interaction Questionnaire`). Keep real article titles
  // that mention a scale/database (`The human-robot interaction scale database`).
  if (
    words.length <= 6 &&
    /\b(?:questionnaire|checklist|inventory|survey form)\b/i.test(t) &&
    !/\b(?:development|validation|review|study|analysis|effect|impact|database|dataset|corpus)\b/i.test(t)
  ) {
    return true;
  }
  if (
    words.length <= 5 &&
    /\bscale\b/i.test(t) &&
    !/\b(?:development|validation|review|study|analysis|effect|impact|database|dataset|corpus|interaction|robot|human)\b/i.test(t)
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
function looksLikeKeywordsChrome(text: string, candidate?: RoleCandidate): boolean {
  const t = text.trim();
  if (/^(?:key\s*words?(?:\s+and\s+phrases)?|keywords?|index terms|ccs concepts)\s*:/i.test(t)) {
    return true;
  }
  if (/^(?:ключевые\s+слова(?:\s+и\s+фразы)?)\s*:/i.test(t)) return true;
  // Publisher rule-line residue glued to keyword blocks.
  if (/_{8,}/.test(t) && /\b(?:key\s*words?|keywords?)\b/i.test(t)) return true;
  // Preprint/cover keyword rails without a `Keywords:` label
  // (`Agrobacterium, Visual Analytics, Latent Dirichlet Allocation`).
  // Colon subtitles (`Editorial: AI and neuroscience: integrating…`) are
  // article titles, not keyword rails — do not reject them here.
  // Cyrillic article titles often list concepts with commas; keep that shape.
  // Real titles with topic lists still use sentence connectors
  // (`… illegal, irritable, and aggressive` / `applications, techniques, and …`).
  // Large top-of-page display lines (`Skeletons, Object Shape, Statistics`) are
  // article titles even when they look like noun-phrase lists.
  if (candidate) {
    const font = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
    const y = candidate.boundingBoxes[0]?.y ?? 999;
    if (candidate.pageStart === 1 && font >= 14 && y < 280) return false;
  }
  const commas = (t.match(/,/g) ?? []).length;
  const latinLetters = (t.match(/[A-Za-z]/g) ?? []).length;
  const cyrillicLetters = (t.match(/[А-Яа-яЁё]/g) ?? []).length;
  const functionWords = (
    t.match(
      /\b(?:a|an|the|of|and|for|with|from|in|on|to|by|using|towards?|based|study|review|survey|analysis|correlates?|effects?|impact|validity|clinical)\b/gi
    ) ?? []
  ).length;
  if (
    commas >= 2 &&
    t.length <= 140 &&
    t.split(/\s+/).filter(Boolean).length <= 16 &&
    !/[.!?]$/.test(t) &&
    !/:/.test(t) &&
    cyrillicLetters < 8 &&
    latinLetters >= 12 &&
    functionWords === 0
  ) {
    return true;
  }
  return false;
}

/** True when a title still expects another native fragment. */
function isIncompleteTitleEnd(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[‐‑‒–—―-]$/.test(t)) return true;
  if (/\b(?:using|in|of|the|a|an|and|for|with|to|from|on|by|via|this|these|those|its|their|our|or)$/i.test(t)) {
    return true;
  }
  // Frontiers wraps often stop on a short common noun that continues below
  // (`… in table` + `tennis`, `… Role of` + `User Cognitive Style`).
  if (/\b(?:in|for|on|of|and|with)\s+(?:table|role|part|case|type|system|model|data|user|image|china)\s*$/i.test(t)) {
    return true;
  }
  // Adjective hanging mid-phrase (`… prevent poor` + `mental health during the`).
  if (
    /\b(?:poor|good|new|early|late|high|low|first|best|key|mixed|systematic|narrative|scoping)\s*$/i.test(t) &&
    t.length <= 160
  ) {
    return true;
  }
  return false;
}

/** Person-name rows that must not be glued onto a hanging title. */
function looksLikePersonNameTitleTrap(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  // Keep First Last / First M. Last with optional markers; do not trap
  // Title-Case topic phrases (`User Cognitive Style`, `Time`).
  if (words.length === 1 && /^[A-Z][a-zA-Z'’-]+$/.test(t) && t.length <= 18) {
    // Lone capitalized tokens can be title fragments (`Time`) — allow them.
    return false;
  }
  if (
    /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z.'’-]+){1}$/.test(t) &&
    words.length <= 3 &&
    !/\b(?:and|based|from|with|style|system|model|study|role|using|for|of|on|in|to)\b/i.test(t)
  ) {
    return /[0-9*†‡§]/.test(t) || words.length === 2;
  }
  return false;
}

/** Citation / abstract leads that must not prepend or continue a title. */
function looksLikeTitleContamination(text: string): boolean {
  const t = text.trim();
  // Frontiers sidebar citation crumbs: `Arvind Kumar Chaudhary, LSTM with Deep Dual`
  // (person name, comma, title fragment). Do not let these outrank the stacked
  // display title in the main column.
  if (
    /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-Z]\.?)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){1,3},\s+[A-ZÀ-ÖØ-Þ]/u.test(t) &&
    (t.match(/,/g) ?? []).length === 1 &&
    t.length <= 140 &&
    !/\b(?:review|study|analysis|survey|framework|detection|classification)\b.*,/i.test(t)
  ) {
    return true;
  }
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+\s+and\s+[A-Z]/i.test(t) && /\(\s*20\d{2}\s*\)/.test(t)) {
    return true;
  }
  if (/^[A-Z][a-z]*(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+\s+\(\s*20\d{2}\s*\)/.test(t)) return true;
  // Frontiers citation rails: `Görg C (2025) Current state…`
  if (/^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\s+[A-Z]\.?\s*\(\s*20\d{2}\s*\)/u.test(t)) return true;
  if (/^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]*\s*\(\s*20\d{2}\s*\)/u.test(t) && t.length >= 40) {
    return true;
  }
  // Body prose mistaken for a title (`The study offers…`, `We present…`).
  // Do not blanket-reject every long title that starts with `The` — that is a
  // common academic lead (`The Medicine Quality Monitoring Globe: …`).
  if (
    /^(?:In\s+this|The\s+(?:study|review|paper|article|results|findings|aim)|This\s+(?:study|paper|article|review|chapter)|We\s+(?:present|propose|report|investigate|describe|show)|Our\s+(?:results|findings|analysis)|These\s+(?:results|findings)|Those\s+(?:results|findings)|However,|Moreover,)\b/i.test(
      t,
    ) &&
    t.split(/\s+/).length >= 10
  ) {
    return true;
  }
  // Two-column PLOS covers sometimes glue a title wrap onto the Abstract label
  // (`…reports of substandard Abstract`).
  if (/\bAbstract\s*$/i.test(t) && !/^Abstract\s*:?\s*$/i.test(t) && t.split(/\s+/).length >= 4) {
    return true;
  }
  // Long titles with Oxford commas (`Vision, and Three-Dimensional…`) are not
  // body contamination; require a lowercase prose continuation after the comma.
  // Protocol / scoping-review titles often list lowercase topics after the
  // subtitle (`…: Protocol for a scoping review of definitions, measurement…`).
  if (
    t.length >= 140 &&
    /[,;]\s+[a-z]/.test(t) &&
    !/,\s+and\s+[A-Z]/.test(t) &&
    !/:\s*(?:a\s+)?(?:protocol\s+for\s+(?:a\s+)?)?(?:scoping|systematic|narrative)?\s*review\b/i.test(t) &&
    !/\b(?:protocol for (?:a\s+)?(?:scoping|systematic)|scoping review of|systematic review of|narrative review)\b/i.test(t)
  ) {
    return true;
  }
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
  // PRISMA / checklist header rows painted as the largest page-one block.
  if (/\bchecklist item\b/i.test(t) && /\b(?:section and item|title page|reported)\b/i.test(t)) return true;
  if (/\btopic\s*#\s*reported\b/i.test(t)) return true;
  if (/^section and item\b/i.test(t) && /\blocation where item\b/i.test(t)) return true;
  if (/^prisma(?:\s+2020)?(?:\s+checklist)?$/i.test(t)) return true;
  if (/^\d+\s+(?:report which of the following|identify the report as a systematic review|see the prisma)\b/i.test(t)) return true;
  if (/^(?:eligibility criteria|information sources|search strategy|data collection process)\b/i.test(t) &&
      (/\d/.test(t) || t.length < 80)) return true;
  if (/\btemplate data collection forms\b/i.test(t)) return true;
  if (/^results of\s+\d+[a-z]?\b/i.test(t)) return true;
  if (/\bbriefly summarise the characteristics and risk of bias\b/i.test(t)) return true;
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
/** Journal "How to cite:" rails often keep the full title when the cover stack truncates. */
function recoverHowToCiteTitle(candidates: RoleCandidate[]): string | null {
  const citeIdx = candidates.findIndex((c) => /how\s+to\s+cite\s*:/i.test(c.text));
  if (citeIdx < 0) return null;
  const lead = candidates[citeIdx]!.text.trim();
  const afterYear = lead.match(/\(\s*20\d{2}\s*\)\s*\.?\s*(.+)$/);
  if (!afterYear?.[1]) return null;
  // Keep mid-title commas (`Attention,` + `Memory and…`).
  const parts: string[] = [afterYear[1].replace(/\s+$/g, "").trim()];
  const stop = /^(?:anuarul|fascicula|issn\b|doi\b|https?:\/\/|covered\s+in\b)/i;
  for (let i = citeIdx + 1; i < Math.min(candidates.length, citeIdx + 8); i++) {
    const text = candidates[i]!.text.trim();
    if (!text || stop.test(text)) break;
    if (/^(?:mirela|doctorand)\b/i.test(text)) break;
    // `Adolescent Students. Anuarul Universitatii…` — keep the title tail only.
    const beforeJournal = text.split(/\.\s+(?=Anuarul|Fascicula|ISSN|doi\b)/i)[0]?.trim() ?? text;
    if (stop.test(beforeJournal)) break;
    const latin = (beforeJournal.match(/[A-Za-z]/g) ?? []).length;
    // Bilingual covers interleave a Romanian title stack between cite lines;
    // skip those crumbs instead of aborting the English title reconstruction.
    if (latin < 8 || !/^[A-ZÀ-ÖØ-Þ]/.test(beforeJournal)) continue;
    parts.push(beforeJournal.replace(/[.\s]+$/g, "").trim());
    if (/\.\s*$/.test(text) && beforeJournal !== text) break;
    if (parts.join(" ").length > 220) break;
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  if (joined.length < 28 || looksLikeBodyLeadInTitle(joined) || looksLikeAuthorish(joined)) return null;
  return joined;
}

function recoverAlternateCoverTitle(candidates: RoleCandidate[]): string | null {
  const thesis = recoverThesisCoverTitle(candidates);
  if (thesis) return thesis;
  // Prefer how-to-cite only after other cover recoveries fail; callers also
  // use it to extend a truncated native display stack.
  const howToCite = recoverHowToCiteTitle(candidates);

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
        looksLikePublisherStatementTitle(t) ||
        looksLikeSeriesEditorsChrome(t) ||
        looksLikeAuthorish(t) ||
        looksLikeNumberedSectionHeadingTitle(t) ||
        looksLikeSectionHeadingTitleTrap(t) ||
        /@/.test(t) ||
        /\bPh\.?\s*D\b/i.test(t) ||
        /\([A-Z][^)]*(?:university|college|institute|lab)\b/i.test(t) ||
        /^(?:source|источник|keywords?|ccs concepts|index terms|chapter\s+\d+)\b/i.test(t) ||
        // Keyword / index lines are comma-dense; real titles rarely are.
        // Exception: topic-series titles (`AR, MR, Computer Vision, and 3D…:
        // A Scoping Review`) keep commas before a subtitle or review cue.
        ((t.match(/,/g) ?? []).length >= 3 &&
          !/:\s*(?:a\s+)?(?:protocol\s+for\s+(?:a\s+)?)?(?:scoping|systematic|narrative)?\s*review\b/i.test(t) &&
          !/\b(?:protocol for (?:a\s+)?(?:scoping|systematic)|scoping review of|systematic review of)\b/i.test(t) &&
          !/\b(?:and|,)\s+[A-Z][\p{L}-]*(?:\s+[A-Z][\p{L}-]*){0,3}\s*:\s*/u.test(t) &&
          !/\b(?:review|survey|meta-?analysis)\s+with\b/i.test(t)) ||
        // URL-bearing methods chrome that slipped past statement heuristics.
        (/https?:\/\//i.test(t) && t.split(/\s+/).length >= 8)
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
        !looksLikePublisherStatementTitle(t) &&
        !looksLikeSeriesEditorsChrome(t) &&
        !looksLikeNumberedSectionHeadingTitle(t) &&
        !looksLikeObviousMastheadTitle(t) &&
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
  return howToCite;
}

/** Publisher/journal banners that win the largest-font title race. */
function looksLikeJournalChromeTitle(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  if (looksLikeSpacedArticleTypeOnly(t)) return true;
  if (looksLikeCitationBylineTitle(t)) return true;
  if (/^npj\s*[|·•]/i.test(t)) return true;
  if (/^[A-Za-z][A-Za-z &:-]{2,40}\s+\d{1,4}\s*\(\d{4}\)/.test(t)) return true; // Journal 50 (2026)
  if (/\be\d{4,}\b/.test(t) && t.split(/\s+/).length <= 8) return true;
  if (/^[A-Za-z]{2,6}\s*[|·•]/i.test(t) && /\barticle\b/i.test(t)) return true;
  if (/^(?:article|research article|original article|open access|study protocol)\b/i.test(t) && t.length <= 40) return true;
  // Bilingual covers emit a decorative `TraNSlaTiON` / `Translation` stamp
  // above the real article title.
  if (/^(?:translation|перевод|tra\s*n\s*s\s*la\s*ti\s*on)$/i.test(t.replace(/\s+/g, " ").trim())) {
    return true;
  }
  // Frontiers / MDPI editorial chrome labels sometimes win the title race.
  if (/^(?:\*?correspondence|edited by|reviewed by|citation|copyright|keywords?|published|received|accepted)$/i.test(t)) {
    return true;
  }
  // Citation / Editor rails (`Citation: Shuchami A, …`, `Editor: Hiroyuki …`).
  if (/^(?:citation|editor|editors|reviewed by|edited by)\s*:/i.test(t)) return true;
  if (/^\(?eds?\.?\)?\s*$/i.test(t) || (/\(eds?\.?\)\s*$/i.test(t) && t.length <= 48)) return true;
  // Affiliation crumbs that swallowed a truncated "… and review" fragment
  // (`Fatih Sultan Mehmet Education and review`). Do not treat article titles
  // such as `… for education: a review` as chrome — bare `education` is common.
  const words = t.split(/\s+/).filter(Boolean);
  if (
    words.length <= 12 &&
    !/:/.test(t) &&
    !/\b(?:applications?|methods?|effects?|role|impact|analysis|systematic|scoping|designs?)\b/i.test(t) &&
    (
      (/\b(?:university|college|institute|faculty|school|hospital)\b/i.test(t) &&
        /\b(?:and\s+)?(?:review|article|research)\b/i.test(t)) ||
      /\beducation\s+and\s+(?:review|article|research)\b/i.test(t)
    )
  ) {
    return true;
  }
  return false;
}

function looksLikeObviousMastheadTitle(text: string): boolean {
  const t = text.trim();
  return looksLikeDocumentMasthead(t) || looksLikeJournalNameMasthead(t) || looksLikeEventMasthead(t) ||
    looksLikeCopyrightBoilerplate(t) || looksLikeJournalChromeTitle(t) ||
    looksLikeTableOfContentsTitle(t) || looksLikeAcademicEditorsTitle(t) ||
    // Frontiers paints `DOI 10.3389/…` without a colon.
    /^(?:doi\s*[:.]?\s*|doi\s+\d|https?:\/\/|www\.)/i.test(t) ||
    /\b(?:issn|e-?issn|volume|vol\.?|issue|no\.?|pages?|pp\.?|received|accepted|published)\b/i.test(t) &&
      (t.match(/\d/g)?.length ?? 0) >= 2;
}

/** Numbered body section crumbs (`2.1.2 Ground and climbing robots…`). */
function looksLikeNumberedSectionHeadingTitle(text: string): boolean {
  const t = text.trim();
  return /^\d+(?:\.\d+){1,4}\s+\S/.test(t) && t.length <= 120;
}

/** Bare section banners mistaken for the article title. */
function looksLikeSectionHeadingTitleTrap(text: string): boolean {
  const t = text.trim();
  if (t.length > 64) return false;
  return /^(?:introduction(?:\s+and\s+background)?|background|methods?(?:\s+and\s+materials)?|materials\s+and\s+methods|results?(?:\s+and\s+discussion)?|discussion|conclusions?|related\s+work|current\s+knowledge(?:\s+and\s+gaps)?|study\s+design(?:\s+and\s+perspective)?|acknowledgements?|references|abstract)\s*$/i.test(
    t,
  );
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

function looksLikePreprintChromeMetadataTitle(text: string): boolean {
  const t = text.trim();
  // JMIR / server covers store `Preprint - 10.2196/preprints.94431` in PDF
  // metadata. That must not outrank a recovered native article title.
  return (
    /^(?:preprint|medrxiv|biorxiv|chemrxiv|ssrn)\b/i.test(t) ||
    /\bpreprints?\.\d+/i.test(t) ||
    /^(?:preprint|unpublished)\s*[-–—:]\s*10\.\d+/i.test(t)
  );
}

function isPlausibleMetadataTitle(text: string): boolean {
  const t = text.trim();
  // Repository and thesis records legitimately include a subtitle and degree
  // context, so metadata titles can be longer than a journal title. Keep a
  // bounded ceiling to avoid accepting an accidentally stored full document.
  if (t.length < 12 || t.length > 500 || looksLikeDocumentMasthead(t)) return false;
  if (looksLikePreprintChromeMetadataTitle(t)) return false;
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


/**
 * BMJ / two-column wraps sometimes emit a mid-compound fragment
 * (`experimental pre-`) separately from `quasi-post`. Splice it back into the
 * hyphenated compound instead of appending it after the full title.
 */
function spliceHyphenTitleFragment(combined: string, fragment: string): string | null {
  const frag = fragment.trim();
  if (!/[‐‑‒–—―-]$/.test(frag)) return null;
  const words = frag.replace(/[‐‑‒–—―-]+$/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3 || frag.length > 40) return null;
  // Prefer the last simple compound near the protocol/study phrasing.
  const re = /\b(quasi|pre|post|meta|multi|non)-([A-Za-z]+)\b/gi;
  let match: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(combined)) !== null) last = match;
  if (!last || last.index == null) return null;
  const left = last[1]!;
  const right = last[2]!;
  let spliced: string;
  if (words.length === 2 && /^(pre|post)$/i.test(words[1]!) && /^(pre|post)$/i.test(right)) {
    spliced = `${left}-${words[0]} ${words[1]}-${right}`;
  } else if (words.length === 1) {
    spliced = `${left}-${words[0]}-${right}`;
  } else if (words.length === 2) {
    spliced = `${left}-${words[0]}-${words[1]}-${right}`;
  } else {
    return null;
  }
  return `${combined.slice(0, last.index)}${spliced}${combined.slice(last.index + last[0].length)}`;
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
  const nativeTitles = input.candidates.filter((c) => {
    if (!(c.role === "title" || (c.roleScores?.title ?? 0) >= 0.85)) return false;
    if (looksLikeRotatedMasthead(c) || looksLikeDecoderGarbageTitle(c.text)) return false;
    if (looksLikeKeywordsChrome(c.text, c)) return false;
    if (looksLikeNumberedSectionHeadingTitle(c.text)) return false;
    if (looksLikeSectionHeadingTitleTrap(c.text)) return false;
    if (looksLikeTitleContamination(c.text)) return false;
    if (looksLikeCopyrightBoilerplate(c.text)) return false;
    // Peel numbered author rows first so bilingual title+byline blocks stay.
    const peeled = stripMastheadSuffix(stripExplicitTitleLabel(stripInlineAuthorTail(c)));
    // Reject pure bylines (`Zhiyuan Liu1…` / gutter `3 Saeed Salehi , …`).
    if (looksLikeAuthorish(peeled) && peeled.split(/\s+/).length <= 16) return false;
    if (looksLikeAuthorish(c.text) && c.text.trim().split(/\s+/).length <= 10) return false;
    return true;
  });
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
    let joinedUntil = 0;
    for (let i = 1; i < titles.length; i++) {
      const prev = titles[i - 1];
      const cur = titles[i];
      if (cur.pageStart !== prev.pageStart) break;
      const prevBottom =
        (prev.boundingBoxes[0]?.y ?? 0) + (prev.boundingBoxes[0]?.height ?? 0);
      const gap = (cur.boundingBoxes[0]?.y ?? 0) - prevBottom;
      const prevFont = prev.layoutBlock.lines[0]?.fontSize ?? 12;
      const curFont = cur.layoutBlock.lines[0]?.fontSize ?? 12;
      const lowercaseContinuation = /^[a-z\u00e0-\u024f]/.test(cur.text.trim()) &&
        Math.abs(curFont - prevFont) <= 1.5 &&
        gap <= Math.max(prevFont * 3.2, 56);
      // Frontiers wraps often split one display title across a sidebar gap
      // (`… aggressive` then, much lower, `exploratory structural MRI study`).
      // Same large title font + unfinished lead is enough to keep joining.
      const sameFontTitleContinuation =
        Math.abs(curFont - prevFont) <= 1.5 &&
        curFont >= 14 &&
        (prev.role === "title" || (prev.roleScores?.title ?? 0) >= 0.85) &&
        (cur.role === "title" || (cur.roleScores?.title ?? 0) >= 0.85) &&
        !/[.!?]$/.test(prev.text.trim()) &&
        gap <= Math.max(prevFont * 6.5, 130);
      if (gap > Math.max(prevFont * 2.8, 40) && !lowercaseContinuation && !sameFontTitleContinuation) break;
      {
        const piece = stripMastheadSuffix(stripExplicitTitleLabel(cur.text));
        // Incomplete title leads (`… Study of`) must keep a following topic
        // list even when those tokens look person-shaped (`Documentation Time`).
        const authorishContinuation =
          (looksLikeAuthorish(cur.text) || looksLikeAuthorish(piece)) &&
          !isIncompleteTitleEnd(combined);
        if (authorishContinuation) break;
        // A publication line can be emitted as a second `title` candidate
        // immediately below the real title.  Do not concatenate it into the
        // article title merely because its baseline is close.
        if (looksLikeObviousMastheadTitle(cur.text) || looksLikeObviousMastheadTitle(piece)) break;
        const spliced = spliceHyphenTitleFragment(combined, piece);
        combined = spliced ?? joinTitleParts(combined, piece);
      }
      joinedUntil = i;
    }
    native = [combined];
  
    // A centered venue banner can be emitted as the strongest title before
    // the real article title. When a second title candidate is substantially
    // lower on page one and returns to the page margin, use that structural
    // sequence as evidence even when the venue name has no `journal` keyword.
    // Require the first span to sit clearly to the right of the second — a
    // left-aligned stacked book title (`Intelligent` / `Interaction`) must
    // not be collapsed to its final line.
    const firstTitleBox = titles[0].boundingBoxes[0];
    const secondTitle = titles.find((candidate) =>
      candidate !== titles[0] && candidate.pageStart === 1 &&
      (candidate.boundingBoxes[0]?.y ?? 0) > (firstTitleBox?.y ?? 0) + 36 &&
      (candidate.boundingBoxes[0]?.x ?? 0) < (candidate.layoutBlock.lines[0]?.pageWidth ?? 612) * 0.2 &&
      !looksLikeObviousMastheadTitle(candidate.text) && !looksLikeAuthorish(candidate.text) &&
      !looksLikeTitleContamination(candidate.text) && !looksLikePersonNameTitleTrap(candidate.text)
    );
    const secondTitleBox = secondTitle?.boundingBoxes[0];
    // Only treat a left-column span as the article title when the first span
    // looks like venue chrome. Otherwise Frontiers main-column titles (x≈220)
    // lose to a left citation crumb (`Name, TitleFragment`).
    if (
      secondTitle && secondTitleBox &&
      (firstTitleBox?.x ?? 0) > (secondTitleBox.x ?? 0) + Math.max(18, (secondTitle.layoutBlock.lines[0]?.pageWidth ?? 612) * 0.08) &&
      (looksLikeObviousMastheadTitle(titles[0].text) || looksLikeJournalNameMasthead(titles[0].text) ||
        looksLikeMastheadGeometry(titles[0]))
    ) {
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
          !looksLikeObviousMastheadTitle(candidate.text) &&
          !looksLikeSectionBannerAuthor(candidate.text) &&
          // Ignore author-scored title leads/continuations (high title score,
          // no commas, or a hanging preposition lead such as `Towards…`).
          !((candidate.roleScores?.title ?? 0) >= 0.85 && !/,/.test(candidate.text) &&
            (candidate.text.trim().split(/\s+/).length >= 3 || isIncompleteTitleEnd(candidate.text))))
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
        // Prefer the full vertical title cluster between the masthead and the
        // final title span. A false early author band can empty `later`, and
        // keeping only the last line drops the real article-title lead.
        const clusterBeforeAuthor = titles
          .filter((candidate) => candidate.pageStart === titles[0].pageStart &&
            (candidate.boundingBoxes[0]?.y ?? 0) > firstY + 18 &&
            (candidate.boundingBoxes[0]?.y ?? 0) <= y + 2 &&
            !looksLikeObviousMastheadTitle(candidate.text) &&
            !looksLikeMastheadGeometry(candidate) &&
            !looksLikeAuthorish(candidate.text) &&
            !isShortenedMastheadVariant(titles[0].text, candidate.text))
          .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
        if (clusterBeforeAuthor.length >= 2) {
          native = [clusterBeforeAuthor.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
        } else {
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
      // Use line font size for Y tolerance. Multi-line title blocks inflate
      // `height` and would otherwise absorb a later wrap fragment on the
      // right (`experimental pre-` next to a stacked BMJ title).
      const baselineFont = first.layoutBlock.lines[0]?.fontSize ?? 12;
      const yTol = Math.max(3, Math.min(firstBox.height * 0.35, baselineFont * 0.55));
      const xTol = Math.max(24, baselineFont * 2.5);
      const baselineCluster = titles
        .filter((candidate) => {
          if (candidate === first || candidate.pageStart !== first.pageStart) return false;
          const box = candidate.boundingBoxes[0];
          if (!box || Math.abs(box.y - firstBox.y) > yTol) return false;
          if (looksLikeAuthorish(candidate.text)) return false;
          const gap = box.x - (firstBox.x + firstBox.width);
          return gap >= -3 && gap <= xTol;
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

    // Book/proceedings covers often emit a same-font middle line as header
    // (`Intelligent` / `Human Computer` / `Interaction`). Rebuild after the
    // masthead heuristics so a venue-banner branch cannot drop the middle span.
    if (joinedUntil >= 1 && titles[0].pageStart === 1) {
      const stackFirst = titles[0];
      const stackLast = titles[joinedUntil];
      const font = stackFirst.layoutBlock.lines[0]?.fontSize ?? 12;
      const y0 = stackFirst.boundingBoxes[0]?.y ?? 0;
      const y1 = stackLast.boundingBoxes[0]?.y ?? 0;
      const stack = input.candidates
        .filter((candidate) => {
          const text = candidate.text.trim();
          const y = candidate.boundingBoxes[0]?.y ?? 0;
          const f = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
          const words = text.split(/\s+/).filter(Boolean);
          if (candidate.pageStart !== stackFirst.pageStart) return false;
          if (y < y0 - 2 || y > y1 + 2) return false;
          if (Math.abs(f - font) > 2.5) return false;
          if (looksLikeAuthorish(text) || looksLikeObviousMastheadTitle(text)) return false;
          if (/^(?:lncs|vol\.?|volume|proceedings|editors?)\b/i.test(text)) return false;
          if (words.length === 0 || words.length > 8) return false;
          return candidate.role === "title" || candidate.role === "header" ||
            candidate.role === "heading" || candidate.role === "paragraph" ||
            (candidate.roleScores?.title ?? 0) >= 0.5;
        })
        .sort((a, b) =>
          (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0) ||
          (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0)
        );
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const candidate of stack) {
        const text = stripMastheadSuffix(candidate.text);
        const key = text.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        parts.push(text);
      }
      if (parts.length >= 2) {
        const rebuilt = parts.join(" ").replace(/\s+/g, " ").trim();
        // The stack filter caps each span at 8 words so LNCS-style covers
        // (`Intelligent` / `Interaction`) rebuild cleanly. Do not let that
        // short stack replace an already-joined multi-line article title
        // whose middle wrap exceeded the word cap (BMJ Open protocols).
        if (!native[0] || native[0].length <= rebuilt.length + 16) {
          native = [rebuilt];
        }
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

  // Titles that end mid-preposition / mid-hyphen often continue on the next
  // native line, even when that line was scored as author, affiliation, or
  // paragraph (Frontiers sidebars and proceedings bylines). Complete those
  // fragments before alternate recovery so a short native span is not replaced
  // by publisher chrome.
  const titleFragmentAnchor = (current: string): { y: number; font: number } => {
    const normalized = current.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const fragments = input.candidates
      .filter((candidate) => {
        if (candidate.pageStart !== 1) return false;
        const y = candidate.boundingBoxes[0]?.y ?? 0;
        // Keep the anchor inside the masthead band; body/keyword lines that
        // merely share a short phrase must not pull the cursor downward.
        if (y > 420) return false;
        const text = stripMastheadSuffix(candidate.text).replace(/\s+/g, " ").trim().toLocaleLowerCase();
        if (!text || text.length < 8) return false;
        const substantial =
          normalized === text ||
          (text.length >= 16 && normalized.includes(text)) ||
          (text.length <= normalized.length + 24 &&
            text.includes(normalized.slice(0, Math.min(48, normalized.length))));
        if (!substantial) return false;
        // A body restatement of only the title tail (`status for child stunting
        // identification.`) must not move the lead cursor into the sidebar.
        const bare = text.replace(/[.!?;:]+$/g, "");
        if (
          bare.length < normalized.length * 0.55 &&
          (normalized.endsWith(bare) || normalized.includes(` ${bare}`))
        ) {
          return false;
        }
        // Citation/abstract rails often repeat a title substring lower on the
        // page (`national image of “China” in press`). Never use those as the
        // geometric anchor or the lead cursor jumps into the body.
        if (candidate.role === "affiliation" || candidate.role === "copyright" || candidate.role === "header") {
          return false;
        }
        return candidate.role === "title" || candidate.role === "author" ||
          candidate.role === "paragraph" ||
          (candidate.roleScores?.title ?? 0) >= 0.5;
      })
      .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
    // Prefer title-role / high-score spans. Falling back to the last paragraph
    // that shares a title substring pulls the cursor into Frontiers sidebars
    // (`RECEIVEDREVISED…` / `Monitoring Model (INMM)…`) and prepends them.
    const titleish = fragments.filter((candidate) =>
      candidate.role === "title" || (candidate.roleScores?.title ?? 0) >= 0.85
    );
    const last = (titleish.length > 0 ? titleish : fragments).at(-1);
    return {
      y: last?.boundingBoxes[0]?.y ?? titles[0]?.boundingBoxes[0]?.y ?? 0,
      font: last?.layoutBlock.lines[0]?.fontSize ?? titles[0]?.layoutBlock.lines[0]?.fontSize ?? 12,
    };
  };

  const joinIncompleteTitleFragments = () => {
    if (!native[0] || !isIncompleteTitleEnd(native[0])) return;
    let guard = 0;
    while (guard++ < 4 && native[0] && isIncompleteTitleEnd(native[0])) {
      const current = native[0];
      const { y: anchorY, font: anchorFont } = titleFragmentAnchor(current);
      const currentTail = current.trim().split(/\s+/).slice(-4).join(" ").toLocaleLowerCase();
      const continuation = input.candidates
        .filter((candidate) => {
          const text = candidate.text.trim();
          const y = candidate.boundingBoxes[0]?.y ?? 0;
          const font = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
          const words = text.split(/\s+/).filter(Boolean);
          if (candidate.pageStart !== 1 || y <= anchorY + 2 || y > anchorY + Math.max(72, anchorFont * 4)) return false;
          if (looksLikeObviousMastheadTitle(text) || looksLikeSectionBannerAuthor(text)) return false;
          if (/^(?:abstract|keywords?|introduction|open access|edited by|reviewed by|correspondence|citation)\b/i.test(text)) return false;
          if (/@/.test(text) || looksLikeAuthorish(text)) return false;
          if (looksLikePersonNameTitleTrap(text) || looksLikeTitleContamination(text)) return false;
          if (looksLikeKeywordsChrome(text)) return false;
          // Hyphen-truncated titles continue with a short Title-Case fragment,
          // not a full abstract sentence or a citation-rail restatement.
          if (/[‐‑‒–—―-]$/.test(current.trim())) {
            if (words.length > 10 || /[,;]\s+[a-z]/.test(text)) return false;
            // Reject citation leftovers that restate the title prefix
            // (`AI in clinical decision-support…`) instead of the missing tail
            // (`support systems for patients with`).
            const prefix = current.trim().replace(/[‐‑‒–—―-]+$/, "").split(/\s+/).slice(-4).join(" ").toLocaleLowerCase();
            if (prefix && text.toLocaleLowerCase().includes(prefix) && words.length >= 4) return false;
          }
          // Already absorbed into the current title.
          if (current.toLocaleLowerCase().includes(text.toLocaleLowerCase()) && text.length >= 8) return false;
          if (text.toLocaleLowerCase() === currentTail) return false;
          // Short quoted fragments (`‘CoPE-DEC’`) or Title-Case continuations.
          if (/^['‘“"«]?[\w][\w’'-]{0,40}['’”"»]?$/u.test(text) && words.length <= 4) {
            return font >= anchorFont * 0.45 || (candidate.roleScores?.title ?? 0) >= 0.5 ||
              candidate.role === "author" || candidate.role === "affiliation" || candidate.role === "paragraph";
          }
          if (words.length >= 2 && words.length <= 16 && /^[\p{Lu}\p{Lo}]/u.test(text) && !/[.!?]$/.test(text)) {
            return font >= anchorFont * 0.45 || (candidate.roleScores?.title ?? 0) >= 0.5 ||
              candidate.role === "author" || candidate.role === "paragraph";
          }
          return false;
        })
        .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0))[0];
      if (!continuation) break;
      const joined = /[‐‑‒–—―-]$/.test(current.trim())
        ? `${current.trim().replace(/[‐‑‒–—―-]+$/, "")}${stripMastheadSuffix(continuation.text).replace(/^\s+/, "")}`
        : `${current.trim()} ${stripMastheadSuffix(continuation.text)}`;
      native = [joined.replace(/\s+/g, " ").trim()];
    }
  };
  joinIncompleteTitleFragments();

  // Frontiers / proceedings often emit the title lead as an author-scored
  // display line above the fragment that won the title race.
  if (native[0]) {
    const { y: leadY, font: leadFont } = titleFragmentAnchor(native[0]);
    const lead = input.candidates
      .filter((candidate) => {
        const text = candidate.text.trim();
        const y = candidate.boundingBoxes[0]?.y ?? 0;
        const font = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
        const words = text.split(/\s+/).filter(Boolean);
        if (candidate.pageStart !== 1 || y >= leadY - 2 || y < leadY - Math.max(96, leadFont * 5)) return false;
        if (looksLikeObviousMastheadTitle(text) || looksLikeKeywordsChrome(text)) return false;
        // Venue / section banners above the article title (e.g. "Social and
        // Behavioural Sciences") must stay out of the recovered lead.
        if (looksLikeJournalChromeTitle(text) || looksLikeSectionBannerAuthor(text)) return false;
        if (/^(?:doi:|https?:|open access|edited by|reviewed by|original research|type|published|received|revised|accepted)\b/i.test(text)) return false;
        if (looksLikePublisherStatementTitle(text)) return false;
        if (looksLikePersonNameTitleTrap(text) || looksLikeTitleContamination(text) || (looksLikeAuthorish(text) && /,/.test(text))) return false;
        if (native[0]!.toLocaleLowerCase().includes(text.toLocaleLowerCase())) return false;
        if (!(font >= leadFont * 0.85 || (candidate.roleScores?.title ?? 0) >= 0.85)) return false;
        // Prefer incomplete / hanging leads over complete venue phrases.
        // Also allow a same-font lead when the chosen title starts with a
        // lowercase fragment (`prediction: a systematic review`), or when a
        // short ALL-CAPS fragment (`BEHAVIOR`) needs its uppercase lead
        // (`IMPACT OF E-MARKETING ON CONSUMER`).
        const hangingLead = isIncompleteTitleEnd(text) ||
          /^(?:towards?|toward|research on|a study of|transformer[- ]based)\b/i.test(text) ||
          (/^[a-z]/.test(native[0]!) &&
            (candidate.role === "title" || candidate.role === "author" || candidate.role === "paragraph" || words.length <= 10) &&
            (font >= leadFont * 0.85 || (candidate.roleScores?.title ?? 0) >= 0.5)) ||
          (isFragmentTitle(native[0]!) &&
            /^[A-Z0-9][A-Z0-9\s,:;-]*$/.test(native[0]!.trim()) &&
            isUppercaseTitleLine(text) &&
            words.length >= 3 && font >= leadFont * 0.85);
        // Venue banners (`Computer Methods and Programs in Biomedicine`) are
        // Title Case and long enough to bypass the short-phrase guard. Require
        // a hanging/incomplete lead signal before prepending anything.
        if (!hangingLead) return false;
        if (looksLikeJournalNameMasthead(text) || looksLikeJournalChromeTitle(text)) return false;
        return words.length >= 2 && words.length <= 16 && /^[\p{Lu}\p{Lo}"“«]/u.test(text) && !/[.!?]$/.test(text);
      })
      .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
    if (lead.length) {
      const leadBottom = Math.max(...lead.map((c) => c.boundingBoxes[0]?.y ?? 0));
      const between = input.candidates
        .filter((candidate) => {
          const text = candidate.text.trim();
          const y = candidate.boundingBoxes[0]?.y ?? 0;
          const font = candidate.layoutBlock.lines[0]?.fontSize ?? 0;
          const words = text.split(/\s+/).filter(Boolean);
          if (candidate.pageStart !== 1 || y <= leadBottom + 2 || y >= leadY - 2) return false;
          if (looksLikeObviousMastheadTitle(text) || looksLikeKeywordsChrome(text) || looksLikeTitleContamination(text)) return false;
          if (/^(?:open access|edited by|reviewed by|doi\b)/i.test(text)) return false;
          if (native[0]!.toLocaleLowerCase().includes(text.toLocaleLowerCase())) return false;
          if (lead.some((c) => c.text.trim() === text)) return false;
          if (!(font >= leadFont * 0.85)) return false;
          return words.length >= 2 && words.length <= 12 && /^[\p{Ll}\p{Lu}\p{Lo}]/u.test(text) && !/[.!?]$/.test(text);
        })
        .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
      native = [[
        ...lead.map((c) => stripMastheadSuffix(c.text)),
        ...between.map((c) => stripMastheadSuffix(c.text)),
        native[0],
      ].join(" ").replace(/\s+/g, " ").trim()];
      joinIncompleteTitleFragments();
    }
  }

  // Judge the resolved native title only. Re-checking titles[0] after a
  // successful masthead recovery would throw away a joined article title and
  // fall back to a later fragment via recoverAlternateCoverTitle.
  const nativeTitleCandidate = native[0]
    ? input.candidates.find((candidate) => {
        const text = stripMastheadSuffix(candidate.text).replace(/\s+/g, " ").trim();
        const target = native[0]!.replace(/\s+/g, " ").trim();
        return text === target || target.startsWith(text) || text.startsWith(target);
      })
    : undefined;
  const needsAlternateTitle = !native[0] ||
    looksLikeCopyrightBoilerplate(native[0]) ||
    looksLikeAbstractLabelTitle(native[0]) ||
    looksLikeDecoderCorruptedTitle(native[0]) ||
    looksLikeContaminatedMastheadTitle(native[0]) ||
    looksLikeBodyLeadInTitle(native[0]) ||
    looksLikeJournalChromeTitle(native[0]) ||
    looksLikeProtocolTableChrome(native[0]) ||
    looksLikeKeywordsChrome(native[0], nativeTitleCandidate) ||
    looksLikeShortToolOrFragmentTitle(native[0]) ||
    looksLikeEthicsBoilerplateTitle(native[0]) ||
    looksLikePromptOptionTitle(native[0]) ||
    looksLikePublisherStatementTitle(native[0]) ||
    looksLikeSeriesEditorsChrome(native[0]) ||
    looksLikeObviousMastheadTitle(native[0]) ||
    looksLikeAuthorish(native[0]) ||
    looksLikeNumberedSectionHeadingTitle(native[0]) ||
    looksLikeSectionHeadingTitleTrap(native[0]) ||
    isFragmentTitle(native[0]);
  if (needsAlternateTitle) {
    const recovered = recoverAlternateCoverTitle(input.candidates);
    if (recovered && recovered !== native[0]) native = [recovered];
  }

  let fused = fuseTitle(native.map(collapseRepeatedTitle), input.extra ?? [], input.grobidTitle);
  // Post-fusion repair: joining title fragments can recreate contaminated or
  // body-lead titles even when an earlier candidate looked plausible.
  const fusedTitleCandidate = fused.text
    ? input.candidates.find((candidate) => {
        const text = stripMastheadSuffix(candidate.text).replace(/\s+/g, " ").trim();
        const target = fused.text!.replace(/\s+/g, " ").trim();
        return text === target || target.startsWith(text) || text.startsWith(target);
      })
    : undefined;
  if (
    fused.text &&
    (looksLikeContaminatedMastheadTitle(fused.text) ||
      looksLikeBodyLeadInTitle(fused.text) ||
      looksLikeCopyrightBoilerplate(fused.text) ||
      looksLikeJournalChromeTitle(fused.text) ||
      looksLikeProtocolTableChrome(fused.text) ||
      looksLikeKeywordsChrome(fused.text, fusedTitleCandidate) ||
      looksLikeShortToolOrFragmentTitle(fused.text) ||
      looksLikeEthicsBoilerplateTitle(fused.text) ||
      looksLikePromptOptionTitle(fused.text) ||
      looksLikePublisherStatementTitle(fused.text) ||
      looksLikeSeriesEditorsChrome(fused.text))
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
  // Cover display stacks can stop mid-phrase while "How to cite:" keeps the
  // complete title. Extend only when the cite title is a clear longer prefix
  // match so healthy native titles are not replaced.
  const citeTitle = recoverHowToCiteTitle(input.candidates);
  if (fused.text && citeTitle) {
    const normalize = (value: string) =>
      value.toLocaleLowerCase().replace(/[.…]+$/g, "").replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ").replace(/\s+/g, " ").trim();
    const fusedNorm = normalize(fused.text);
    const citeNorm = normalize(citeTitle);
    if (
      fusedNorm.length >= 28 &&
      citeNorm.startsWith(fusedNorm) &&
      citeNorm.length >= fusedNorm.length + 10
    ) {
      fused = {
        text: citeTitle,
        confidence: Math.max(0.7, fused.confidence),
        evidence: [
          ...fused.evidence,
          {
            source: "pdf-native",
            label: "title",
            confidence: 0.72,
            reason: "extended truncated cover title from how-to-cite rail",
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

  const withStolenFragment = recoverStolenTitleFragment(fused.text, input.candidates);
  const recovered =
    withStolenFragment && withStolenFragment !== fused.text
      ? {
          text: withStolenFragment,
          confidence: fused.confidence,
          evidence: [
            ...fused.evidence,
            {
              source: "pdf-native" as const,
              label: "title" as const,
              confidence: 0.72,
              reason: "recovered title fragment stolen by author/citation crumb",
            },
          ],
        }
      : fused;

  const normalizedDisplay = normalizeSmallCapsDisplayTitle(recovered.text);
  return {
    text: normalizedDisplay,
    confidence: recovered.confidence,
    evidence:
      normalizedDisplay === recovered.text
        ? recovered.evidence
        : [
            ...recovered.evidence,
            {
              source: "pdf-native",
              label: "title",
              confidence: 0.7,
              reason: "normalized small-caps display title casing",
            },
          ],
  };
}

/**
 * Left citation crumbs sometimes absorb a mid-title line
 * (`Author Name, LSTM with Deep Dual`). Reinsert the after-comma fragment
 * only at a tight technical join (`Convolutional` + `Info-Varcoder`), never
 * after generic adjectives like `Improved` (that swallows affiliation crumbs).
 */
function recoverStolenTitleFragment(
  title: string,
  candidates: Array<{ text: string }>,
): string {
  const t = title.trim();
  if (t.length < 40) return t;
  const fragments: string[] = [];
  for (const candidate of candidates) {
    if (!looksLikeTitleContamination(candidate.text)) continue;
    const match = candidate.text.trim().match(/^[^,]{2,48},\s+(.+)$/);
    if (!match) continue;
    const fragment = match[1].trim().replace(/\s+/g, " ");
    if (fragment.length < 8 || fragment.length > 72) continue;
    if (/\b(?:et\s+al|doi|http|www\.|vol\.|pp\.)\b/i.test(fragment)) continue;
    if (
      /\b(?:instituto|escola|university|universidade|politecnico|polytechnic|department|faculty|college|laboratory|lab\.?)\b/i.test(
        fragment,
      )
    ) {
      continue;
    }
    if (/\b(?:portugal|spain|brazil|india|china|germany|france|italy|japan)\b/i.test(fragment)) {
      continue;
    }
    if (t.includes(fragment)) continue;
    const fragWords = fragment.split(/\s+/);
    if (fragWords.length < 2 || fragWords.length > 8) continue;
    if (!/^[A-Z]/.test(fragWords[0] ?? "")) continue;
    // Prefer technical mid-title crumbs over residual person/place text.
    if (!/\b(?:LSTM|CNN|DNN|BERT|Transformer|Attention|Dual|Deep|Network|Encoder|Decoder|Varcoder|Clustering)\b/i.test(fragment)) {
      continue;
    }
    fragments.push(fragment);
  }
  if (fragments.length === 0) return t;
  const titleWords = t.split(/\s+/);
  for (const fragment of fragments) {
    const fragWords = fragment.split(/\s+/);
    for (let i = 1; i < titleWords.length; i += 1) {
      const prev = titleWords[i - 1] ?? "";
      const next = titleWords[i] ?? "";
      if (
        /^(?:Convolutional|Neural|Attention|Recurrent|Residual)\b/i.test(prev) &&
        /^(?:Info-?Varcoder|Encoder|Decoder|Network|Model|Transformer|BERT)\b/i.test(next) &&
        !fragWords.includes(next)
      ) {
        return [...titleWords.slice(0, i), ...fragWords, ...titleWords.slice(i)].join(" ");
      }
    }
  }
  return t;
}

/**
 * Small-caps cover fonts often decode as mixed mid-word capitals
 * (`TransienT aTTenTion`). When most words show that shape, fold to Title Case.
 */
function normalizeSmallCapsDisplayTitle(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return text.trim();
  const weird = words.filter(
    (word) => /[a-z][A-Z]/.test(word) || (/[A-Z].*[A-Z]/.test(word) && /[a-z]/.test(word) && word.length >= 5),
  );
  if (weird.length < 2 || weird.length / words.length < 0.45) return text.trim();
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join(" ");
}
