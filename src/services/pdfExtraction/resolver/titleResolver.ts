import { isGarbageTitle } from "../../translation/quality";
import { fuseTitle } from "../fusion";
import type { RoleCandidate } from "../generic/candidates";
import type { ExtractionEvidence } from "../types";

function looksLikeAuthorish(text: string): boolean {
  if (/@/.test(text)) return true;
  if (/(university|department|institute|大学|大学院)/i.test(text)) return true;
  return false;
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
    (c) => c.role === "title" || (c.roleScores?.title ?? 0) >= 0.85
  );
  let native: string[] = [];

  if (titles.length > 0) {
    const titleStart = titles.reduce((best, candidate, index) => {
      const following = input.candidates.slice(input.candidates.indexOf(candidate) + 1, input.candidates.indexOf(candidate) + 5);
      const hasAuthorAnchor = following.some((next) => {
        if (next.pageStart !== candidate.pageStart || !["author", "affiliation"].includes(next.role)) return false;
        const gap = (next.boundingBoxes[0]?.y ?? 0) - ((candidate.boundingBoxes[0]?.y ?? 0) + (candidate.boundingBoxes[0]?.height ?? 0));
        return gap >= 0 && gap <= 180;
      });
      const bestFollowing = titles[best];
      const bestAnchor = input.candidates.slice(input.candidates.indexOf(bestFollowing) + 1, input.candidates.indexOf(bestFollowing) + 5).some((next) =>
        next.pageStart === bestFollowing.pageStart && ["author", "affiliation"].includes(next.role)
      );
      return hasAuthorAnchor && !bestAnchor ? index : best;
    }, 0);
    const selectedTitles = titleStart > 0 ? titles.slice(titleStart) : titles;
    let combined = selectedTitles[0].text.trim();
    for (let i = 1; i < selectedTitles.length; i++) {
      const prev = selectedTitles[i - 1];
      const cur = selectedTitles[i];
      if (cur.pageStart !== prev.pageStart) break;
      const prevBottom =
        (prev.boundingBoxes[0]?.y ?? 0) + (prev.boundingBoxes[0]?.height ?? 0);
      const gap = (cur.boundingBoxes[0]?.y ?? 0) - prevBottom;
      const prevFont = prev.layoutBlock.lines[0]?.fontSize ?? 12;
      if (gap > prevFont * 2.8) break;
      if (looksLikeAuthorish(cur.text)) break;
      combined = joinTitleParts(combined, cur.text.trim());
    }
    native = [combined];

    const last = selectedTitles[selectedTitles.length - 1];
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

  const fused = fuseTitle(native, input.extra ?? [], input.grobidTitle);
  const meta = input.metadataTitle?.trim() || "";
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
