/**
 * Publisher and venue-specific PDF chrome predicates.
 *
 * These predicates deliberately remain unconditional: callers use them at the
 * same point as the former inline checks, independent of Format Profile score.
 */

export function isJournalRunningHeader(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 72) return false;
  if (/^(?:\d{1,3}\s+)?frontiersin\.org$/i.test(t)) return true;
  if (/^ieee\s+xplore$/i.test(t)) return true;
  if (/^journal of the association of chartered\b/i.test(t)) return true;
  if (/^frontiers(?:\s+in)?(?:\s+[A-Za-z][A-Za-z'’-]*){1,6}(?:\s+\d{1,3}\s+frontiersin\.org)?$/i.test(t) &&
      !/\b(?:introduction|methods?|results?|discussion|conclusion|abstract|references)\b/i.test(t)) return true;
  return /^frontiers(?:\s+in)?(?:\s+[A-Z][a-zA-Z'’-]*){1,4}$/i.test(t) &&
    t.split(/\s+/).length <= 6;
}

export const isInstitutionalAuthorLine = (text: string) =>
  /\b(?:university|department|institute|laboratory|hospital|consortium|faculty|school|center|centre)\b/i.test(text);

export const isBmcStructuredAbstractLead = (text: string) =>
  /^(?:introduction|background)\s*:?\s*$/i.test(text) && !/^\d+(?:\.\d+)*\s/.test(text);

export const isBmjCiteRail = (text: string) => /\b(?:bmj\s*open|doi:|10\.\d{4,}\/)/i.test(text);

export const isFrontiersCitationLead = (text: string) =>
  /^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3})?(?:\s+(?:and|&)\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3})?){0,6}\s*\(\d{4}\)/u.exec(text);

export const isNatureEarlyAccessNotice = (text: string) =>
  /^we are providing an unedited version of this manuscript/i.test(text.trim());

export const isNatureUpdateButton = (text: string) => /^check for updates$/i.test(text.trim());

export const isJurnalMasthead = (text: string) => {
  const t = text.trim();
  return /^jurnal\s+\S+/i.test(t) && t.split(/\s+/).length <= 5;
};

export const isArxivIdentifier = (text: string) => /^arXiv:\s*\d{4}\.\d{4,}/i.test(text.trim());

export const isArxivOverlayText = (text: string) =>
  /^arXiv:\s*\d{4}\.\d{4,}(?:v\d+)?(?:\s*\[[^\]]+\])?(?:\s+(?:\d{1,4}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,4}))?$/i.test(text.trim());

export const isArxivChrome = (text: string) => /^arxiv\b/i.test(text.trim());

export const isPublisherCopyrightNotice = (text: string) =>
  /copyright\s+\d{4}[^.]{0,100}\b(?:acm|ieee|springer|elsevier)\b/i.test(text);

export const publisherCopyrightMarker = /(?:this(?:nationalwork)?license\.?is\s+licensed|(?:©\s*(?:acm|ieee|springer|elsevier))|copyright\s+\d{4})/i;

export const isAcmClassificationKeywords = (text: string) => /^acm classification keywords?$/i.test(text.trim());

export const isPublisherCitationByline = (text: string) =>
  /\b(?:bmc|ieee|acm|plos|frontiers|nature|science|lancet|jama|bmj|nucleic|med\s+inform|decis\s+mak)\b/i.test(text);

/** A fragment of the bioRxiv / medRxiv license band printed in the top margin
 * of every page (the band is often split into overlapping runs). */
export const isPreprintBandFragment = (text: string) =>
  /\b(?:was not certified by peer review|copyright holder for this preprint|this version posted [A-Z][a-z]+ \d{1,2}, \d{4}|granted (?:biorxiv|medrxiv) a license|(?:bio|med)rxiv preprint)/i.test(text) ||
  /^doi:\s*https?:\/\/doi\.org\/\S+;?$/i.test(text.trim());

export const isPreprintLicenseGrant = (text: string) =>
  /\bgranted (?:biorxiv|medrxiv) a license to display the preprint\b/i.test(text);

export const isPreprintMarker = (text: string) =>
  /^(?:preprint|medrxiv|biorxiv|chemrxiv|ssrn)\b/i.test(text.trim());

export const isPublisherMasthead = (text: string) =>
  /^arxiv\s*:/i.test(text.trim()) || /^(?:www\.)?nature\.com\b/i.test(text.trim());

export const isFrontiersFooter = (text: string) => /^(?:\d{1,3}\s+)?frontiersin\.org$/i.test(text.trim());
export const isFrontiersCiteChrome = (text: string) =>
  /^(?:\d{4}\)|frontiersin\.org|front\.\s*[a-z]|doi:\s*10\.|https?:\/\/)/i.test(text) ||
  (/\(\d{4}\)\s+[A-Z]/.test(text) && /\b(?:front\.|doi:|https?:)/i.test(text)) ||
  /^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3}){1,3}(?:,\s*[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3}){0,3})*\s+and\s+[A-Z]/u.test(text);

export const isBmjAbstractCitation = (text: string) =>
  text.length <= 260 && /\bbmj\s*open\b/i.test(text) && (/\bdoi:\s*10\./i.test(text) || /^[a-z]/.test(text));

export const isBmjAbstractContinuation = (text: string) =>
  /\bbmj\s*open\b/i.test(text) ||
  (/\bdoi:\s*10\./i.test(text) && text.length <= 180) ||
  (/^[a-z]/.test(text) && /\b(?:protocol|review|bmj|doi:)\b/i.test(text));

export const isBmjAbstractChrome = (text: string) =>
  (text.length <= 280 &&
    (/\bbmjopen-\d/i.test(text) ||
      (/\bbmj\s*open\b/i.test(text) && /\b(?:doi:|e\d{5,})\b/i.test(text)) ||
      /\badditional supplemental material\b/i.test(text) ||
      (/^[a-z]/.test(text) && /\b(?:bmj|doi:|protocol on|diverse population)\b/i.test(text) &&
        text.split(/\s+/).length <= 24))) ||
  (/^introduction\b/i.test(text) && /\bbmjopen-/i.test(text));
