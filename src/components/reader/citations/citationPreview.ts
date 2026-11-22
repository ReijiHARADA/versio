import type { PaperBlock } from "../../../types/paper";
import { parseReferenceLinks } from "../../../services/citations";

export type CitationPreviewModel = {
  key: string;
  targetId: string;
  rawText: string;
  title?: string;
  authors?: string;
  year?: string;
  doiUrl?: string;
  externalUrl?: string;
};

/**
 * Best-effort parse of a bibliography line into preview fields.
 * Does not change extraction — only formats already-stored raw text.
 */
export function buildCitationPreview(
  key: string,
  targetId: string,
  rawText: string
): CitationPreviewModel {
  const cleaned = rawText.replace(/\s+/g, " ").trim();
  const links = parseReferenceLinks(cleaned);
  const doiUrl = links.find((link) => /doi\.org/i.test(link.href))?.href;
  const externalUrl =
    links.find((link) => !/doi\.org/i.test(link.href))?.href ?? doiUrl;

  let body = cleaned.replace(/^\[(\d+)\]\s*/, "").replace(/^(\d+)\.\s+/, "");
  const yearMatch = body.match(/\(((?:19|20)\d{2}[a-z]?)\)/);
  const year = yearMatch?.[1];

  let authors: string | undefined;
  let title: string | undefined;

  // Author. Title. Venue (Year).
  const dotted = body.match(/^(.{2,120}?)\.\s+([A-Z“"].{8,200}?)\.\s+/);
  if (dotted) {
    authors = dotted[1].trim();
    title = dotted[2].replace(/^["“]|["”]$/g, "").trim();
  } else if (yearMatch && yearMatch.index != null && yearMatch.index > 0) {
    const beforeYear = body.slice(0, yearMatch.index).trim();
    const parts = beforeYear.split(/\.\s+/);
    if (parts.length >= 2) {
      authors = parts[0].trim();
      title = parts.slice(1).join(". ").replace(/\.$/, "").trim();
    } else {
      title = beforeYear.replace(/\.$/, "").trim();
    }
  }

  if (title && title.length > 180) title = `${title.slice(0, 177)}…`;
  if (authors && authors.length > 120) authors = `${authors.slice(0, 117)}…`;

  return {
    key,
    targetId,
    rawText: cleaned,
    title,
    authors,
    year,
    doiUrl,
    externalUrl,
  };
}

function referenceBlockForTarget(
  targetId: string,
  blocks: PaperBlock[]
): PaperBlock | undefined {
  return blocks.find((block) => {
    if (block.id === targetId) return true;
    const referenceId =
      typeof block.metadata?.referenceId === "string"
        ? block.metadata.referenceId
        : null;
    return referenceId === targetId;
  });
}

export function citationPreviewFromIndex(
  key: string,
  referenceIndex: Map<string, string>,
  blocks: PaperBlock[]
): CitationPreviewModel | null {
  const targetId = referenceIndex.get(key);
  if (!targetId) return null;
  const block = referenceBlockForTarget(targetId, blocks);
  if (!block) {
    return {
      key,
      targetId,
      rawText: `[${key}]`,
    };
  }
  return buildCitationPreview(key, targetId, block.original || "");
}
