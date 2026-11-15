import type { Paper } from "../../../../types/paper";
import type { LayoutBlock } from "../../../pdfLayout";
import type { CanonicalDocument, CanonicalNode } from "../../canonical/types";

export type FrontMatterState = {
  authorNames: string[];
  affiliations: NonNullable<Paper["affiliations"]>;
};

type AuthorRecoveryContext = {
  canonical: CanonicalDocument;
  layoutBlocks: LayoutBlock[];
  firstBodyY: number;
  authorBandY: number;
  affiliationNodes: CanonicalNode[];
  isSidebarChromeNode: (node: CanonicalNode) => boolean;
  mastheadExcludedByLabel: (node: CanonicalNode) => boolean;
};

type AuthorRecoveryHelpers = {
  expandAuthorLine: (text: string) => string[];
  isNonAuthorMastheadLine: (text: string) => boolean;
  recoverColumnMasthead: (layoutBlocks: LayoutBlock[], firstBodyY: number) =>
    { authors: string[]; affiliations: string[] } | undefined;
  splitAffiliationNamePrefix: (text: string) => Array<{ author: string }>;
  recoverInitialedAuthorRow: (text: string) => string[];
  recoverCyrillicInitialedAuthor: (text: string) => string[];
  recoverCyrillicTitleCaseAuthor: (text: string) => string[];
  recoverNumberedTitleCaseAuthorRow: (text: string) => string[];
  recoverParenAffiliationAuthor: (text: string) => string[];
  recoverAllCapsAuthorFragment: (text: string) => string | null;
};

export function recoverEarlyMastheadAuthors(
  state: FrontMatterState,
  context: AuthorRecoveryContext,
  helpers: AuthorRecoveryHelpers,
): void {
  const { canonical, layoutBlocks, firstBodyY, authorBandY, affiliationNodes, isSidebarChromeNode, mastheadExcludedByLabel } = context;
  const {
    expandAuthorLine,
    isNonAuthorMastheadLine,
    recoverColumnMasthead,
    splitAffiliationNamePrefix,
    recoverInitialedAuthorRow,
    recoverCyrillicInitialedAuthor,
    recoverCyrillicTitleCaseAuthor,
    recoverNumberedTitleCaseAuthorRow,
    recoverParenAffiliationAuthor,
    recoverAllCapsAuthorFragment,
  } = helpers;
  // Chapter books sometimes put the byline below the first body band
  // (`D. A. Shepherd, H. Patzelt, Entrepreneurial Cognition,`) or glue it
  // onto the copyright footer (`© The Author(s) 2018 105 D. A. Shepherd…`).
  // Recover only when the masthead projection found no authors.
  if (state.authorNames.length === 0) {
    const chapterFooterText = (text: string): string =>
      text
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^©\s*the author\(s\)\s*\d{4}\s*(?:\d+\s+)?/i, "")
        .replace(/^\d{2,4}\s+(?=[A-Z]\.)/, "")
        .trim();
    const footerBylines = canonical.nodes
      .filter(
        (n) =>
          (n.role === "author" || n.role === "copyright") &&
          n.pageStart === 1 &&
          n.text &&
          (() => {
            const cleaned = chapterFooterText(n.text);
            return (
              /^[A-Z]\.(?:\s*[A-Z]\.)*\s+[A-Z][\p{L}'’-]+/u.test(cleaned) &&
              ((cleaned.match(/,/g) ?? []).length >= 1 || /\band\b/i.test(cleaned)) &&
              // Running headers are ALL-CAPS surnames; real footers keep Title Case.
              !/\b[A-Z]{4,}\s+AND\s+[A-Z]\./.test(cleaned)
            );
          })(),
      )
      .flatMap((n) => expandAuthorLine(chapterFooterText(n.text!)))
      .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
      .filter(
        (name) =>
          name.split(/\s+/).length >= 2 &&
          name.split(/\s+/).length <= 5 &&
          !isNonAuthorMastheadLine(name) &&
          !/^[A-Z]{3,}(?:\s+[A-Z]{2,})+$/.test(name) &&
          !/\b(?:cognition|entrepreneurial|chapter|volume)\b/i.test(name),
      );
    if (footerBylines.length) state.authorNames = [...new Set(footerBylines)];
  }
  const recoveredMasthead = recoverColumnMasthead(layoutBlocks, firstBodyY);
  const contaminatedAuthor = state.authorNames.some((name) =>
    /@|\b(?:university|department|school|institute|design|engineering|seattle|washington),?\b/i.test(name));
  // Replace only when the author projection is empty or contaminated.
  // Do not overwrite a successful lettered/numbered affiliation split merely
  // because it has more rows than the geometric recovery (`a`/`b`/`c` bands
  // often yield 5–6 clean institutions).
  if (
    recoveredMasthead &&
    recoveredMasthead.affiliations.length >= 2 &&
    (state.authorNames.length === 0 ||
      (contaminatedAuthor && recoveredMasthead.authors.length >= state.authorNames.length))
  ) {
    if (state.authorNames.length === 0 || contaminatedAuthor) state.authorNames = recoveredMasthead.authors;
    state.affiliations.splice(0, state.affiliations.length, ...recoveredMasthead.affiliations.map((name, index) => ({
      id: `recovered-column-affiliation-${index}`,
      name,
    })));
  }
  // ACM papers often repeat a clean, comma-delimited author list in their
  // reference-format paragraph. Use it only when the geometry projection is
  // visibly contaminated (locations, emails, or institution fragments); the
  // native masthead remains the primary source otherwise.
  const acmReferenceText = canonical.nodes
    .map((node) => node.text ?? "")
    .find((text) => /^ACM Reference Format\s*:/i.test(text.trim()));
  if (acmReferenceText && state.authorNames.some((name) =>
    /@|\b(?:usa|university|department|engineering|seattle|washington)\b/i.test(name) ||
    /[&]/.test(name))) {
    const authorPrefix = acmReferenceText.replace(/^ACM Reference Format\s*:\s*/i, "");
    const beforeYear = authorPrefix.split(/\b20\d{2}\b/)[0] ?? authorPrefix;
    const recoveredAuthors = beforeYear
      .replace(/\s+and\s+/gi, ",")
      .split(",")
      .map((name) => name.replace(/[.]+(?=\s*$)/g, "").replace(/\s+/g, " ").trim())
      .filter((name) => name.split(/\s+/).length >= 2 && name.split(/\s+/).length <= 6 && /^[\p{L} .()'’’-]+$/u.test(name));
    if (recoveredAuthors.length >= 2) {
      state.authorNames.splice(0, state.authorNames.length, ...recoveredAuthors);
    }
  }
  // Some publisher templates label individual `NAME, institution` rows as
  // affiliation even when the neighboring rows are author-labelled. Recover
  // only the same strict uppercase name-prefix pattern and merge it with the
  // author projection, preserving the canonical role assignment.
  const affiliationAuthorNames = affiliationNodes
    .flatMap((node) => {
      const text = node.text ?? "";
      if (/^(?:keywords?|key words?)\s*:/i.test(text.trim())) return [];
      const recovered = splitAffiliationNamePrefix(text).map((pair) => pair.author);
      const initialed = recoverInitialedAuthorRow(text);
      const cyrillic = [
        ...recoverCyrillicInitialedAuthor(text),
        ...recoverCyrillicTitleCaseAuthor(text),
      ];
      const numbered = recoverNumberedTitleCaseAuthorRow(text);
      const paren = recoverParenAffiliationAuthor(text);
      const nameOnly = !/^[a-z]/.test(text.trim()) &&
        !/(?:university|department|institute|school|college|hospital|laboratory|center|centre|japan|china|israel|sweden)/i.test(text) &&
        text.length <= 180 && /\b(?:and|,)\b/.test(text) ? expandAuthorLine(text) : [];
      return [...recovered, ...initialed, ...cyrillic, ...numbered, ...paren, ...nameOnly];
    })
    .filter((name) => !/(?:[{}@]|\[|\])/.test(name) &&
      !isNonAuthorMastheadLine(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      // A malformed affiliation node can otherwise be mistaken for an
      // author row (e.g. `Research Director ...` or `Industrial Design`).
      !/\b(?:research director|education services|human factors|ergonomics|industrial design|interactive computing|comprehensive interdisciplinary)\b/i.test(name));
  // IEEE ACCESS sometimes emits trailing authors as `, AND NAME` headings
  // after the first author was glued onto the institution line.
  const allCapsAuthorFragments = canonical.nodes
    .filter((node) =>
      node.pageStart === 1 &&
      (node.role === "heading" || node.role === "paragraph" || node.role === "other") &&
      (node.boundingBoxes[0]?.y ?? 9999) < firstBodyY)
    .map((node) => recoverAllCapsAuthorFragment(node.text ?? ""))
    .filter((name): name is string => Boolean(name));
  // Frontiers corrections / short notes sometimes paint the byline as copyright.
  const copyrightAuthorNames =
    state.authorNames.length === 0
      ? canonical.nodes
          .filter(
            (node) =>
              node.role === "copyright" &&
              node.pageStart === 1 &&
              node.text &&
              (node.boundingBoxes[0]?.y ?? 0) < authorBandY &&
              !isSidebarChromeNode(node) &&
              !mastheadExcludedByLabel(node) &&
              /\d[*†‡]?/.test(node.text) &&
              /(?:\band\b|,)/i.test(node.text) &&
              !isNonAuthorMastheadLine(node.text) &&
              (node.text.match(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][\p{L}'’-]+)+/gu)?.length ?? 0) >= 2,
          )
          .flatMap((node) => expandAuthorLine(node.text!))
          .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
          .filter(
            (name) =>
              name.split(/\s+/).length >= 2 &&
              name.split(/\s+/).length <= 6 &&
              !isNonAuthorMastheadLine(name) &&
              !/\b(?:university|frontiers|editorial|production|office|switzerland|canada|united states)\b/i.test(
                name,
              ),
          )
      : [];
  for (const name of [...affiliationAuthorNames, ...allCapsAuthorFragments, ...copyrightAuthorNames]) {
    const normalizedName = name.replace(/^and\s+/i, "").trim();
    if (
      !isNonAuthorMastheadLine(normalizedName) &&
      normalizedName.split(/\s+/).length <= 6 &&
      !/\b(?:university|institute|department|faculty|laboratory|hospital|research|united states|united kingdom)\b/i.test(normalizedName) &&
      !state.authorNames.some((existing) => existing.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())
    ) {
      state.authorNames.push(normalizedName);
    }
  }}
