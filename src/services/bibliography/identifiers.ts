export type BibliographicIdentifier =
  | { kind: "doi"; id: string }
  | { kind: "arxiv"; id: string };

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
const ARXIV_NEW_RE = /\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/;
const ARXIV_OLD_RE = /\b([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)\b/;
const ARXIV_DOI_RE = /^10\.48550\/arxiv\.(.+)$/i;

function cleanDoi(doi: string): string {
  return doi.replace(/[.,;)\]]+$/, "");
}

/**
 * Accepts a raw DOI / arXiv id, a `doi:` / `arXiv:` prefix, or a doi.org /
 * arxiv.org URL, and returns the identifier to look up. arXiv DOIs
 * (10.48550/arXiv.*) are routed to arXiv because Crossref does not hold them.
 */
export function parseBibliographicIdentifier(input: string): BibliographicIdentifier | null {
  const text = input.trim();
  if (!text) return null;
  if (/arxiv\.org\/(abs|pdf)\//i.test(text) || /^arxiv:/i.test(text)) {
    const rest = text.replace(/^arxiv:/i, "").replace(/\.pdf$/i, "");
    const match = rest.match(ARXIV_NEW_RE) ?? rest.match(ARXIV_OLD_RE);
    return match ? { kind: "arxiv", id: match[1] } : null;
  }
  const doi = text.match(DOI_RE);
  if (doi) {
    const id = cleanDoi(decodeURIComponent(doi[1]));
    const arxiv = id.match(ARXIV_DOI_RE);
    return arxiv ? { kind: "arxiv", id: arxiv[1] } : { kind: "doi", id };
  }
  const arxiv = text.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/) ?? text.match(/^([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/);
  return arxiv ? { kind: "arxiv", id: arxiv[1] } : null;
}
