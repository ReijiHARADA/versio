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

function isPlausibleMetadataTitle(text: string): boolean {
  const t = text.trim();
  // Repository and thesis records legitimately include a subtitle and degree
  // context, so metadata titles can be longer than a journal title. Keep a
  // bounded ceiling to avoid accepting an accidentally stored full document.
  if (t.length < 12 || t.length > 500 || looksLikeDocumentMasthead(t)) return false;
  if (/\.(?:pdf|docx?)$/i.test(t) || /^(?:[/\\]|https?:\/\/)/i.test(t)) return false;
  return (t.match(/\S+/g) ?? []).length >= 3;
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
    const hasJournalChrome = input.candidates.some((candidate) =>
      candidate.pageStart === 1 && /^(?:contents\s+lists|journal\s+homepage|available\s+at\s+sciencedirect)\b/i.test(candidate.text.trim())
    );
    const firstTitle = titles[0];
    const firstTitleWords = firstTitle.text.trim().split(/\s+/).length;
    if (hasJournalChrome && firstTitleWords <= 4) {
      const laterTitles = titles.filter((candidate) =>
        candidate.pageStart === firstTitle.pageStart &&
        (candidate.boundingBoxes[0]?.y ?? 0) > (firstTitle.boundingBoxes[0]?.y ?? 0) + 32
      );
      const anchor = laterTitles.sort((a, b) =>
        (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0) ||
        (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0)
      )[0];
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
  if (fused.text && meta && isPlausibleMetadataTitle(meta) && (looksLikeDocumentMasthead(fused.text) || looksLikeTruncatedTitle(fused.text) || looksLikeBodyTitleCandidate(fused.text) || metadataMatchesNativePrefix || nativeMatchesMetadataPrefix || nativePrefixRepair || weakSectionTitle)) {
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
