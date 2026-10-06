import { isGarbageTitle } from "../../translation/quality";
import { fuseTitle } from "../fusion";
import type { RoleCandidate } from "../generic/candidates";
import type { ExtractionEvidence } from "../types";

function looksLikeAuthorish(text: string): boolean {
  if (/@/.test(text)) return true;
  if (/(university|department|institute|大学|大学院)/i.test(text)) return true;
  return false;
}

function stripMastheadSuffix(text: string): string {
  const trimmed = text.trim();
  // ORCID/URL and email tokens are unambiguous masthead metadata when they
  // occur after a substantial title prefix. Keep URLs that make up the whole
  // candidate out of this rule so a metadata fallback is not truncated.
  const boundary = trimmed.search(/\s+(?:<https?:\/\/|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i);
  if (boundary >= 32) return trimmed.slice(0, boundary).trim();

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
    || /\b(?:original\s+paper|research\s+article|journal\s+of|volume\s+\d+|\d{4}\s*\)\s*\d{1,4}\s*[:–-])\b/i.test(t)
    || /^(?:www\.)?nature\.com\b/i.test(t)
    || /^(?:contents\s+lists|journal\s+homepage|available\s+at\s+sciencedirect)\b/i.test(t)
    || /^\d{1,4}\s*\([^)]{0,32}\)\s*\d{4}/.test(t)
    // Repository cover sheets and event headers often put the venue/event
    // before the actual article title. Their slash/date pattern is stable
    // across publishers and should be treated as masthead evidence.
    || /\b(?:seminar|conference|proceedings|journal)\b[\s\S]{0,100}\b20\d{2}\b/i.test(t)
    || /\b\d{4}\b[\s\S]*\b\d{3,6}\s*$/.test(t);
}

function looksLikeJournalNameMasthead(text: string): boolean {
  const t = text.trim();
  return /\b(?:journal|transactions|proceedings|international\s+journal|advances\s+in\s+(?:scientific|engineering))\b/i.test(t);
}

/**
 * A page-one title candidate can be promoted from a publisher's running
 * masthead (DOI, URL, volume/date, event name) before the actual article
 * title.  Treat these as navigation metadata when a later title candidate is
 * available.  This is intentionally vocabulary/geometry based rather than
 * publisher-specific so PDFs without embedded metadata still resolve a real
 * article title.
 */
function looksLikeObviousMastheadTitle(text: string): boolean {
  const t = text.trim();
  return looksLikeDocumentMasthead(t) || looksLikeJournalNameMasthead(t) ||
    /^(?:doi\s*:\s*|https?:\/\/|www\.)/i.test(t) ||
    /\b(?:issn|e-?issn|volume|vol\.?|issue|no\.?|pages?|pp\.?|received|accepted|published)\b/i.test(t) &&
      (t.match(/\d/g)?.length ?? 0) >= 2;
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
  if (t.length < 240) return false;
  const sentenceBoundaries = t.match(/[.!?](?:\s|$)/g)?.length ?? 0;
  return sentenceBoundaries >= 2 || /^(?:copyright|permission is given|this (?:paper|thesis)\b)/i.test(t);
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
  const titles = input.candidates.filter(
    (c) => (c.role === "title" || (c.roleScores?.title ?? 0) >= 0.85) && !looksLikeRotatedMasthead(c)
  );
  const titleDebug = typeof process !== "undefined" && process.env.PDF_TITLE_DEBUG === "1";
  if (titleDebug) console.info("[title-debug] candidates", titles.map((c) => ({ role: c.role, text: c.text, y: c.boundingBoxes[0]?.y, x: c.boundingBoxes[0]?.x, font: c.layoutBlock.lines[0]?.fontSize })));
  let native: string[] = [];

  if (titles.length > 0) {
    let combined = stripMastheadSuffix(titles[0].text);
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
      combined = joinTitleParts(combined, stripMastheadSuffix(cur.text));
    }
    native = [combined];

    // If the first title candidate is clearly publisher furniture, prefer a
    // later article-title candidate before falling back to external metadata.
    // This matters in production imports where `metadataTitle` is commonly
    // absent; the prior implementation only repaired journal-name cases.
    if (looksLikeObviousMastheadTitle(titles[0].text) || looksLikeMastheadGeometry(titles[0])) {
      if (titleDebug) console.info("[title-debug] masthead branch", looksLikeObviousMastheadTitle(titles[0].text), looksLikeMastheadGeometry(titles[0]));
      const firstY = titles[0].boundingBoxes[0]?.y ?? 0;
      const authorY = input.candidates
        .filter((candidate) => candidate.pageStart === 1 && candidate.role === "author")
        .map((candidate) => candidate.boundingBoxes[0]?.y ?? Number.POSITIVE_INFINITY)
        .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
      if (titleDebug) console.info("[title-debug] authorY", authorY);
      const later = titles
        .filter((candidate) => candidate.pageStart === titles[0].pageStart &&
          (candidate.boundingBoxes[0]?.y ?? 0) > firstY + 18 &&
          (candidate.boundingBoxes[0]?.y ?? 0) < authorY - 3 &&
          !looksLikeObviousMastheadTitle(candidate.text) &&
          !looksLikeMastheadGeometry(candidate) &&
          !looksLikeAuthorish(candidate.text))
        .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
      if (titleDebug) console.info("[title-debug] later", later.map((c) => c.text));
      const lastTitle = titles.at(-1);
      if (titleDebug) console.info("[title-debug] last", lastTitle?.text, lastTitle?.boundingBoxes[0]?.y);
      if (lastTitle && lastTitle !== titles[0] && (lastTitle.boundingBoxes[0]?.y ?? 0) > firstY + 24) {
        const y = lastTitle.boundingBoxes[0]?.y ?? 0;
        // Keep the final title-role span as a safe fallback even if a nearby
        // prefix was conservatively classified as affiliation.
        native = [lastTitle.text.trim()];
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
    const firstTitleWords = firstTitle.text.trim().split(/\s+/).length;
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
        if (cluster.length >= 2) native = [cluster.map((candidate) => stripMastheadSuffix(candidate.text)).join(" ").replace(/\s+/g, " ").trim()];
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

  if (native.length === 0) {
    const pageOne = input.candidates.filter(
      (c) =>
        c.pageStart === 1 &&
        c.role !== "header" &&
        c.role !== "footer" &&
        c.role !== "copyright" &&
        c.text.trim().length >= 8 &&
        c.text.trim().length <= 180 &&
        !looksLikeAuthorish(c.text)
    );
    const fallback = pageOne
      .filter((c) => c.layoutBlock.lines[0]?.fontSize)
      .sort(
        (a, b) =>
          (b.layoutBlock.lines[0]?.fontSize ?? 0) -
          (a.layoutBlock.lines[0]?.fontSize ?? 0)
      )[0];
    if (fallback && !isGarbageTitle(fallback.text)) {
      native = [fallback.text.trim()];
    }
  }

  const fused = fuseTitle(native.map(collapseRepeatedTitle), input.extra ?? [], input.grobidTitle);
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
