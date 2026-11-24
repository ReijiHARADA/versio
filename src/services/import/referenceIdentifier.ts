import {
  parseBibliographicIdentifier,
  type BibliographicIdentifier,
} from "../bibliography/identifiers";
import type { Paper } from "../../types/paper";

const ARXIV_MENTION_RE =
  /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv\s*:\s*|corr\s*,?\s*abs\/|\babs\/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;
const DOI_IN_TEXT_RE = /(?:doi\.org\/|doi\s*:\s*|\b)(10\.\d{4,9}\/[^\s"<>]+)/i;

function stripVersion(arxivId: string): string {
  return arxivId.replace(/v\d+$/i, "").toLowerCase();
}

function sameIdentifier(a: BibliographicIdentifier, b: BibliographicIdentifier): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "arxiv"
    ? stripVersion(a.id) === stripVersion(b.id)
    : a.id.toLowerCase() === b.id.toLowerCase();
}

/**
 * Identifiers a bibliography entry names, in download order: arXiv first
 * (always open access), then the DOI (open access only through OpenAlex).
 */
export function referenceIdentifiers(rawText: string): BibliographicIdentifier[] {
  const text = rawText.replace(/\s+/g, " ");
  const found: BibliographicIdentifier[] = [];
  const push = (identifier: BibliographicIdentifier | null) => {
    if (identifier && !found.some((item) => sameIdentifier(item, identifier))) found.push(identifier);
  };
  const arxiv = text.match(ARXIV_MENTION_RE);
  if (arxiv) push({ kind: "arxiv", id: arxiv[1] });
  const doi = text.match(DOI_IN_TEXT_RE);
  if (doi) push(parseBibliographicIdentifier(doi[1]));
  return found.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "arxiv" ? -1 : 1));
}

function paperIdentifiers(paper: Paper): BibliographicIdentifier[] {
  const ids: BibliographicIdentifier[] = [];
  const doi = paper.doi ? parseBibliographicIdentifier(paper.doi) : null;
  if (doi) ids.push(doi);
  if (paper.doi && doi?.kind === "arxiv") ids.push({ kind: "doi", id: paper.doi });
  if (paper.bibliography?.arxivId) ids.push({ kind: "arxiv", id: paper.bibliography.arxivId });
  return ids;
}

/** A non-trashed library paper with one of the given identifiers. */
export function findPaperByIdentifiers(
  papers: Paper[],
  identifiers: BibliographicIdentifier[]
): Paper | undefined {
  if (identifiers.length === 0) return undefined;
  return papers.find(
    (paper) =>
      !paper.trashedAt &&
      paperIdentifiers(paper).some((own) => identifiers.some((want) => sameIdentifier(own, want)))
  );
}
