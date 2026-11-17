import type { LayoutBlock } from "../../pdfLayout";
import type { Paper } from "../../../types/paper";
import { reconcileBlockIds } from "../../../data/package/reconcile";
import type { BodyProjection, FrontMatterProjection, PaperProjection, ProjectCanonicalToPaperInput } from "./toPaper";

export type FinalizeProjectionHelpers = {
  splitReviewAffiliationStream: (name: string) => string[];
  splitNumberedAffiliationParts: (name: string) => string[];
  removeReviewerInstitutionPrefix: (name: string) => string;
  affiliationKey: (text: string) => string;
  recoverInitialedAuthorRow: (text: string) => string[];
  isNonAuthorMastheadLine: (text: string) => boolean;
  looksLikeFrontiersReviewerCredit: (text: string) => boolean;
  expandAuthorLine: (text: string) => string[];
  stripLetterspacedTitleBanner: (title: string) => string;
  pickPaperTitle: (metadataTitle: string | undefined, extractedTitle: string | undefined) => string | null;
  pickPublication: (metadataTitle: string | undefined) => string | null;
};

function projectTitleForFinalization(
  input: ProjectCanonicalToPaperInput,
  titleNode: FrontMatterProjection["titleNode"],
  stripLetterspacedTitleBanner: FinalizeProjectionHelpers["stripLetterspacedTitleBanner"],
): string {
  const { canonical } = input;
  // Nature "Article in Press" covers often emit a short title on page 1 while
  // the manuscript title lives on page 2. Prefer the later heading when the
  // cover is clearly an early-access wrapper.
  const inPressCover = canonical.nodes.some(
    (node) =>
      node.pageStart === 1 &&
      /article in press/i.test(node.text ?? ""),
  );
  const page2Title = inPressCover
    ? canonical.nodes.find(
        (node) =>
          node.pageStart === 2 &&
          (node.role === "heading" || node.role === "title") &&
          (node.text?.length ?? 0) >= 24 &&
          !/^(?:abstract|introduction|keywords?)\b/i.test(node.text!.trim()),
      )
    : undefined;
  const extractedTitleText = (
    page2Title
      ? [
          page2Title.text,
          ...canonical.nodes
            .filter(
              (node) =>
                node.pageStart === 2 &&
                node !== page2Title &&
                (node.role === "heading" || node.role === "paragraph") &&
                (node.boundingBoxes[0]?.y ?? 0) > (page2Title.boundingBoxes[0]?.y ?? 0) &&
                (node.boundingBoxes[0]?.y ?? 0) < (page2Title.boundingBoxes[0]?.y ?? 0) + 80 &&
                (node.text?.length ?? 0) <= 80 &&
                !/^\d/.test(node.text!.trim()) &&
                !/\b(?:university|department|correspondence)\b/i.test(node.text!),
            )
            .map((node) => node.text),
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      : titleNode?.text?.trim() ?? ""
  );
  // Broken ToUnicode maps can produce repeated short glyph runs such as
  // `АПФАПФ` while still looking like a plausible title to generic scoring.
  // Treat that pattern as unusable so a trusted metadata title (or a later
  // OCR pass) can win instead of exposing the corrupted glyph stream.
  const repeatedGlyphRun = /([\p{L}]{2,6})\1(?:\1)?/iu.test(extractedTitleText) &&
    !/[\s-]{2,}/.test(extractedTitleText);
  const titleHasFlattenedAuthorTail = extractedTitleText.length > 100 &&
    /\d/.test(extractedTitleText) && /,/.test(extractedTitleText) &&
    (/(?:\b(?:and|the|of|in|with|for)\b).+\d[,\s]/i.test(extractedTitleText) ||
      ((extractedTitleText.match(/[\u0400-\u04ff]/g)?.length ?? 0) / extractedTitleText.length > 0.35));
  // Bilingual journal PDFs may expose a native Cyrillic title while their
  // nearby `For citation:` record contains the stable English article title.
  // Prefer that explicit bibliographic identity when available; otherwise
  // preserve the native-language title.
  const hasCitationHeading = canonical.nodes.some((node) =>
    node.pageStart <= 2 && /^for\s+citation\s*:/i.test(node.text?.trim() ?? ""));
  const bilingualTitleWithCitation = hasCitationHeading &&
    (extractedTitleText.match(/[\u0400-\u04ff]/g)?.length ?? 0) / Math.max(extractedTitleText.length, 1) > 0.35;
  const titleLooksCorrupt = repeatedGlyphRun || titleHasFlattenedAuthorTail || bilingualTitleWithCitation;
  const citationTitleFallback = titleLooksCorrupt
    ? (() => {
        const citationHeading = canonical.nodes.find((node) =>
          node.pageStart <= 2 && /^for\s+citation\s*:/i.test(node.text?.trim() ?? "")
        );
        if (!citationHeading) return undefined;
        const headingBox = citationHeading.boundingBoxes[0];
        const citationCandidates = canonical.nodes
          .filter((node) => {
            const box = node.boundingBoxes[0];
            return node.pageStart === citationHeading.pageStart && node.role === "paragraph" &&
              Math.abs((box?.y ?? Infinity) - (headingBox?.y ?? -Infinity)) <= 14 &&
              (box?.x ?? -Infinity) > (headingBox?.x ?? Infinity);
          })
          .sort((a, b) => (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
        const citation = citationCandidates.find((node) => /https?:\/\/|doi\.org/i.test(node.text ?? ""))?.text ?? citationCandidates[0]?.text ?? "";
        const sentences = citation.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
        return sentences.find((sentence) =>
          sentence.split(/\s+/).length >= 6 &&
          /\b(?:the|of|in|and|for|analysis|language|teaching|interaction|system)\b/i.test(sentence) &&
          !/https?:\/\/|\b(?:19|20)\d{2}\b|\b(?:university|journal|volume|issue|doi)\b/i.test(sentence)
        )?.replace(/[.!?]\s*$/, "");
      })()
    : undefined;
  // If the citation line is not bilingual or cannot be parsed, retain the
  // native title rather than dropping it and falling back to an unrelated
  // document metadata string.
  return stripLetterspacedTitleBanner(
    titleLooksCorrupt
      ? (citationTitleFallback ?? extractedTitleText)
      : extractedTitleText,
  );
}

function finalizeBlocks(
  input: ProjectCanonicalToPaperInput,
  paper: Paper,
  sections: BodyProjection["sections"],
  splitReferenceEntries: BodyProjection["blocks"],
): PaperProjection {
  const reconciled = input.previousBlocks?.length
    ? reconcileBlockIds(input.previousBlocks, splitReferenceEntries).blocks
    : splitReferenceEntries;
  const annotatedBlocks = reconciled.map((block) =>
    block.translationStatus === "skipped"
      ? { ...block, metadata: { ...block.metadata, translationOutcome: "structural_skip" } }
      : block
  );

  return { paper, sections, blocks: annotatedBlocks };
}

function recoverEditorReviewerNames(
  layoutBlocks: ProjectCanonicalToPaperInput["layoutBlocks"],
  firstBodyY: number,
  authorNames: string[],
  isNonAuthorMastheadLine: FinalizeProjectionHelpers["isNonAuthorMastheadLine"],
): string[] {
  if (layoutBlocks.some((block) => block.pageStart === 1 && /\b(?:edited|reviewed)\s+by\b/i.test(block.text))) {
    const lines = layoutBlocks.filter((block) => block.pageStart === 1).flatMap((block) => block.lines ?? [])
      .filter((line) => line.y >= 315 && line.y < Math.min(firstBodyY, 415) && line.fontSize >= 7.5 && line.fontSize <= 10.5)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const runs: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      let text = line.text;
      const next = lines[i + 1];
      const words = text.replace(/^\s*\d{1,2}\s*[*†‡§]?\s*[,;]?\s*/u, "").trim().split(/\s+/).filter(Boolean);
      // A two-column native stream can place a trailing first name at the
      // right edge and wrap its surname/continuation into the next visual row
      // on the left. The editor/reviewer gate above keeps this cross-column
      // join isolated from ordinary body text.
      if (words.length <= 1 && next && next.y - line.y <= 16) text += ` ${next.text}`;
      text = text.split(/\b(?:edited|reviewed)\s+by\b\s*:?/i)[0].replace(/\d+[*†‡§]?/gu, " ");
      const matches = text.match(/[A-ZÀ-ÖØ-Þ][\p{Ll}'’-]*(?:(?:\s+(?:van|von|de|den|der|di|da|la|le)\s+)?\s+[A-ZÀ-ÖØ-Þ][\p{Ll}'’-]*){1,5}/gu) ?? [];
      runs.push(...matches.filter((name) => name.split(/\s+/).length >= 2 &&
        !isNonAuthorMastheadLine(name) &&
        !/\b(?:university|department|school|laboratory|center|centre|hospital|faculty|institute|edited|reviewed|language|processing|learning)\b/i.test(name)));
    }
    for (const run of runs) {
      const normalized = run.replace(/\s+/g, " ").trim();
      if (normalized.split(/\s+/).length < 3 || isNonAuthorMastheadLine(normalized)) continue;
      // Only promote 3+ token runs that look like particle / initialed people
      // (`Sofia de la Fuente Garcia`), not topic phrases.
      if (
        !/\b(?:van|von|de|den|der|di|da|la|le|mac|mc)\b/i.test(normalized) &&
        !/(?:\s+[A-Z]\.){1,3}\s+/.test(normalized)
      ) {
        continue;
      }
      authorNames = authorNames.filter((existing) => !(normalized.toLocaleLowerCase().includes(existing.toLocaleLowerCase()) && normalized.length > existing.length + 2));
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === normalized.toLocaleLowerCase())) authorNames.push(normalized);
    }
  }
  return authorNames;
}

/**
 * The page-one title as printed: the topmost run of lines set in the largest
 * body-area type (≥ 1.3× body size), whatever role each line was given. A
 * wrapped title's last line is often labelled author (`Rheumatoid Arthritis`)
 * or paragraph (`anomaly`), which cuts the title and pollutes the byline.
 */
export function largestTypeTitle(layoutBlocks: LayoutBlock[], baseFontSize: number): string | null {
  const lines = layoutBlocks
    .filter((b) => b.pageStart === 1 && b.role !== "chrome" && b.role !== "header" && b.role !== "footer" && !b.rotation)
    .flatMap((b) => b.lines)
    .filter((l) => !l.rotation && l.y < (l.pageHeight ?? 792) * 0.45 && l.fontSize >= baseFontSize * 1.3 && /\p{L}{2,}/u.test(l.text));
  if (!lines.length) return null;
  const max = Math.max(...lines.map((l) => l.fontSize));
  const run = lines.filter((l) => l.fontSize >= max * 0.97).sort((a, b) => a.y - b.y);
  const title = [run[0]];
  for (const line of run.slice(1)) {
    if (line.y - title.at(-1)!.y > max * 2) break;
    if (Math.abs(line.y - title.at(-1)!.y) > 1) title.push(line);
  }
  const text = title.map((l) => l.text.trim()).join(" ").replace(/\s+/g, " ");
  return text.length >= 10 && text.length <= 300 ? text : null;
}

export function finalizePaperProjection(
  input: ProjectCanonicalToPaperInput,
  frontMatter: FrontMatterProjection,
  body: BodyProjection,
  helpers: FinalizeProjectionHelpers,
): PaperProjection {
  const { splitReviewAffiliationStream, splitNumberedAffiliationParts, removeReviewerInstitutionPrefix, affiliationKey, recoverInitialedAuthorRow, isNonAuthorMastheadLine, looksLikeFrontiersReviewerCredit, expandAuthorLine, stripLetterspacedTitleBanner, pickPaperTitle, pickPublication } = helpers;
  const { canonical, layoutBlocks, paperId } = input;
  const { titleNode, firstBodyY, hasSidebarBody, authorsStructured, doiMatch } = frontMatter;
  let { authorNames, affiliations } = frontMatter;
  const { sections, blocks: splitReferenceEntries } = body;
  const titleForProjection = projectTitleForFinalization(input, titleNode, stripLetterspacedTitleBanner);
  authorNames = recoverEditorReviewerNames(layoutBlocks, firstBodyY, authorNames, isNonAuthorMastheadLine);
  // A numbered affiliation stream can still survive geometry grouping as one
  // long value. Split only at explicit institution markers and deduplicate
  // exact/contained repeats (for example one research center emitted once per
  // author). Canonical source nodes remain unchanged.
  const normalizedAffiliations = affiliations.flatMap((affiliation) =>
    (canonical.nodes.some((node) => node.pageStart === 1 && /^(?:edited|reviewed)\s+by\s*:/i.test(node.text?.trim() ?? ""))
      ? splitReviewAffiliationStream(affiliation.name).flatMap((part) => splitNumberedAffiliationParts(part))
      : splitNumberedAffiliationParts(affiliation.name)).map((name) => ({
      ...affiliation,
      name: canonical.nodes.some((node) => node.pageStart === 1 && /^(?:edited|reviewed)\s+by\s*:/i.test(node.text?.trim() ?? ""))
        ? removeReviewerInstitutionPrefix(name)
        : name,
    })).filter((candidate) => candidate.name.length > 0)
  );
  affiliations = normalizedAffiliations.filter((affiliation, index, all) => {
    const key = affiliationKey(affiliation.name);
    const name = affiliation.name.trim();
    // Author-only bylines recovered into authors must not linger as
    // affiliation rows (`I D Sabukunze*1, A Arakaza2`).
    if (recoverInitialedAuthorRow(name).length > 0) return false;
    // Correspondence names / equal-contribution notes are not institutions.
    if (/^(?:these authors|all authors|the authors|equal contributors?)\b/i.test(name)) {
      return false;
    }
    // Bare person-shaped rows (`Dana N. Reinemann`) — keep short faculty names
    // like `Industrial Design` / `Interactive Computing`.
    if (
      /^[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][\p{L}'’-]+){1,3}$/u.test(name) &&
      !/\b(?:university|department|institute|school|faculty|college|hospital|laboratory|center|centre|design|computing|engineering|science|program|studies|management)\b/i.test(
        name,
      )
    ) {
      return false;
    }
    // Frontiers left-rail editor/reviewer schools. Keep this narrow: short
    // `University of …, Country` / trailing-comma university lines without a
    // department band. Broader `X University, Country` rows are often real
    // author institutions and must survive numbered masthead recovery.
    if (
      hasSidebarBody &&
      name.length <= 70 &&
      !/^\d/.test(name) &&
      !/\b(?:department|laboratory|school of|faculty of|research center|research centre|college of)\b/i.test(
        name,
      ) &&
      (/^University of [^,]{2,45},\s*(?:Portugal|United Kingdom|United States|Canada|Australia|Brazil|Germany|France|Italy|Spain|Netherlands|Japan|China)\s*$/i.test(
        name,
      ) ||
        /^University of [^,]{2,50},\s*$/i.test(name) ||
        /^[A-Z][^,]{2,40} University,\s*(?:Portugal|United Kingdom|United States)\s*$/i.test(name))
    ) {
      return false;
    }
    if (
      /^(?:keywords?|key words?|index terms?|kata kunci)\s*:/i.test(name) ||
      /^:\s*[a-z]/i.test(name)
    ) {
      return false;
    }
    const aggregate = canonical.nodes.some((node) => node.pageStart === 1 && /^(?:edited|reviewed)\s+by\s*:/i.test(node.text?.trim() ?? "")) &&
      affiliation.name.length > 180 &&
      all.filter((candidate) => candidate !== affiliation && candidate.name.length >= 24 &&
        key.includes(affiliationKey(candidate.name))).length >= 2;
    return key.length > 0 && !aggregate && all.findIndex((candidate) => {
      const candidateKey = affiliationKey(candidate.name);
      return candidateKey === key || candidateKey.startsWith(key) || key.startsWith(candidateKey);
    }) === index;
  });
  // Late recoveries can reintroduce consortium / campus tails — strip then
  // re-apply the masthead chrome gate before the public author list ships.
  authorNames = authorNames
    .map((name) =>
      name
        .replace(/,?\s+for the\b.*$/i, "")
        .replace(/\s+of\s+(?:the\s+)?(?:university|college|institute|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b.*$/u, "")
        // PDF wrap can paint the same person twice (`Dario A. Protti Dario A. Protti`).
        .replace(
          /^([A-ZÀ-Ö][\p{L}'’.-]+(?:\s+[A-ZÀ-Ö][\p{L}'’.-]+){1,4})\s+\1\b/u,
          "$1",
        )
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((name) => {
      // Glyph-spaced CJK mastheads collapse to a single token (`河合隆史`);
      // still accept those while requiring multi-token Latin bylines.
      const parts = name.split(/\s+/).filter(Boolean);
      const cjkCompact = /^[\u3040-\u30ff\u4e00-\u9fff·・]{2,}$/u.test(name.replace(/\s+/g, ""));
      return (parts.length >= 2 || cjkCompact) && !isNonAuthorMastheadLine(name);
    });
  // Drop abbreviated how-to-cite crumbs once the full masthead names exist
  // (`Tasneem N` beside `Nanziba Tasneem`, `Fres´an-Orellana A` beside
  // `Ana Fres´an-Orellana`). Allow acute accents in the surname token.
  authorNames = authorNames.filter((name) => {
    const cleaned = name.replace(/[☯*†‡§]/gu, " ").replace(/\s+/g, " ").trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length !== 2) return true;
    const [left, right] = parts;
    if (!/^[A-Z][\p{L}'’´-]+$/u.test(left!) || !/^[A-Z]\.?$/u.test(right!)) return true;
    const needle = left!.toLocaleLowerCase();
    return !authorNames.some((other) => {
      if (other === name) return false;
      const otherClean = other.replace(/[☯*†‡§]/gu, " ").replace(/\s+/g, " ").trim();
      if (otherClean.toLocaleLowerCase().includes(needle)) return true;
      const otherParts = otherClean.split(/\s+/);
      return otherParts.length >= 2 &&
        otherParts.some((part) => part.toLocaleLowerCase() === needle);
    });
  });
  // Final scrub: sidebar reviewer crumbs can be reintroduced by late copyright
  // / affiliation recovery after the earlier demote pass. Do not drop
  // correspondence names (`Filip Stefanovic,` under *CORRESPONDENCE).
  const reviewEditLabelYs = canonical.nodes
    .filter(
      (node) =>
        node.pageStart === 1 &&
        /^(?:edited|reviewed)\s+by\b/i.test((node.text ?? "").trim()),
    )
    .map((node) => node.boundingBoxes[0]?.y ?? -Infinity);
  const correspondenceLabelYs = canonical.nodes
    .filter(
      (node) =>
        node.pageStart === 1 &&
        /^\*?correspondence\b/i.test((node.text ?? "").trim()),
    )
    .map((node) => node.boundingBoxes[0]?.y ?? -Infinity);
  authorNames = authorNames.filter((name) => {
    const head = name.replace(/,.*/, "").trim().toLocaleLowerCase();
    if (!head || head.length < 5) return true;
    return !canonical.nodes.some((node) => {
      if (node.pageStart !== 1 || !node.text) return false;
      const text = node.text.replace(/\s+/g, " ").trim();
      if (looksLikeFrontiersReviewerCredit(text)) {
        return text.toLocaleLowerCase().startsWith(head);
      }
      const y = node.boundingBoxes[0]?.y ?? Infinity;
      const underCorrespondence = correspondenceLabelYs.some(
        (labelY) => labelY < y && y - labelY < 45,
      );
      if (underCorrespondence) return false;
      const underReviewEdit = reviewEditLabelYs.some(
        (labelY) => labelY < y && y - labelY < 55,
      );
      return (
        underReviewEdit &&
        (node.role === "copyright" || node.role === "paragraph") &&
        text.length <= 48 &&
        /,\s*$/.test(text) &&
        text.toLocaleLowerCase().startsWith(head) &&
        !/\band\b/i.test(text) &&
        (node.boundingBoxes[0]?.x ?? 999) < 160
      );
    });
  });
  // Abstract lead with correspondence star
  // (`Areej Alhothali* Department of Computer Science…`).
  if (authorNames.length === 0) {
    for (const node of canonical.nodes) {
      if (node.role !== "abstract" || node.pageStart !== 1 || !node.text) continue;
      const match = node.text
        .replace(/\s+/g, " ")
        .trim()
        .match(
          /^([A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){1,4})\s*\*\s+(?:Department|School|Faculty|College|University|Institute)\b/u,
        );
      if (!match) continue;
      const name = match[1]!.trim();
      if (!isNonAuthorMastheadLine(name)) {
        authorNames = [name];
        break;
      }
    }
  }
  // Body affiliation row that is only a glued starred name
  // (`PlamenkaNanova*` / `Yong-SeokJang*`).
  if (authorNames.length === 0) {
    for (const node of canonical.nodes) {
      if (node.pageStart !== 1 || !node.text) continue;
      if (node.role !== "affiliation" && node.role !== "author") continue;
      const text = node.text.replace(/\s+/g, " ").trim();
      if (
        !/^[A-ZÀ-Ö](?:[a-zà-öø-ÿ]+|[a-zà-öø-ÿ]*-[A-ZÀ-Ö][a-zà-öø-ÿ]+)[A-ZÀ-Ö][a-zà-öø-ÿ]+\s*\*$/u.test(
          text,
        )
      ) {
        continue;
      }
      const recovered = expandAuthorLine(text)
        .map((name) => name.replace(/[*]+$/g, "").trim())
        .filter(
          (name) =>
            name.split(/\s+/).length >= 2 &&
            !isNonAuthorMastheadLine(name),
        );
      if (recovered.length >= 1) {
        authorNames = recovered;
        break;
      }
    }
  }
  // Affiliation location tails painted as authors
  // (`Jilin Changchun` from `… University, Jilin Changchun 130024`).
  // Prefer projected affiliations, but also consult page-1 affiliation nodes
  // when the public affiliation list stayed empty.
  const affiliationTextsForAuthorFilter = [
    ...affiliations.map((aff) => aff.name),
    ...canonical.nodes
      .filter(
        (node) =>
          node.role === "affiliation" &&
          node.pageStart === 1 &&
          Boolean(node.text),
      )
      .map((node) => node.text ?? ""),
  ];
  authorNames = authorNames.filter((name) => {
    const needle = name.replace(/\s+/g, " ").trim();
    if (needle.split(/\s+/).length < 2 || needle.split(/\s+/).length > 3) return true;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only comma-delimited location tails (`… University, Jilin Changchun 130024`).
    // Do not match author names that open a parenthetical affiliation
    // (`Yoshinori HORIE (College…)`).
    const locationTail = new RegExp(
      `,\\s*${escaped}(?:\\s+\\d{5,6})?\\b`,
      "i",
    );
    return !affiliationTextsForAuthorFilter.some((raw) => {
      const affText = raw.replace(/\s+/g, " ");
      if (!locationTail.test(affText)) return false;
      // Require the affiliation to still look institutional so real authors
      // who share a campus city name are not dropped.
      return /\b(?:university|college|institute|hospital|school|faculty|department|laboratory)\b/i.test(
        affText,
      );
    });
  });
  // Extend a title cut at its first line(s) with the rest of its largest-type run.
  const printedTitle = largestTypeTitle(layoutBlocks, input.baseFontSize);
  const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  let finalTitle = titleForProjection;
  const currentKey = titleKey(titleForProjection ?? "").slice(0, 24);
  const currentLine = currentKey ? layoutBlocks.flatMap((b) => (b.pageStart === 1 ? b.lines : [])).find((l) => titleKey(l.text).startsWith(currentKey.slice(0, 12))) : undefined;
  const printedSize = printedTitle ? Math.max(...layoutBlocks.flatMap((b) => (b.pageStart === 1 ? b.lines : [])).filter((l) => printedTitle.includes(l.text.trim())).map((l) => l.fontSize)) : 0;
  // A journal banner repeats on later pages; a title does not.
  const repeatsLater = printedTitle ? layoutBlocks.some((b) => b.pageStart >= 2 && titleKey(b.text).includes(titleKey(printedTitle))) : true;
  const extendsCurrent = Boolean(printedTitle && titleForProjection && titleKey(printedTitle).startsWith(titleKey(titleForProjection)) && printedTitle.length > titleForProjection.length);
  // The chosen title is not set in the title type at all (an affiliation, a body line).
  const replacesSmaller = Boolean(printedTitle && !repeatsLater && printedTitle.split(/\s+/).length >= 4 && (!currentLine || currentLine.fontSize < printedSize * 0.9));
  if (printedTitle && (extendsCurrent || replacesSmaller)) {
    finalTitle = printedTitle;
    authorNames = authorNames.filter((name) => !titleKey(printedTitle).includes(titleKey(name)));
  }
  // Institution names and submission notes are not people (`Lane Department`, `Submitted to ApJ`).
  authorNames = authorNames
    .map((name) => name.replace(/\s*\(ORC[^)]*\)?\s*$/i, "").trim())
    .filter((name) => name && !/\b(?:departamento|department|universit\w*|institut\w*|[eé]cole|polytechnique|laborator\w*|school|college|faculty|cent(?:er|re)|submitted to)\b/i.test(name));
  const paper: Paper = {
    id: paperId,
    sourceFilePath: input.filePath,
    sourceFileName: input.filePath,
    sourceStoredPath: null,
    sourceFileHash: input.fileHash,
    titleOriginal: pickPaperTitle(input.metadata.title, finalTitle),
    titleTranslated: null,
    authors:
      authorNames.length > 0
        ? authorNames.map(titleCaseAllCapsName)
        : input.metadata.author
          ? [input.metadata.author]
          : [],
    authorsStructured,
    affiliations,
    doi: doiMatch ?? null,
    publication: pickPublication(input.metadata.title),
    year: null,
    pageCount: input.metadata.pageCount,
    processingStatus: "structuring",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return finalizeBlocks(input, paper, sections, splitReferenceEntries);
}

/**
 * `EDOARDO BALLICO` → `Edoardo Ballico`; names with any lowercase stay as they are.
 * shortcut: `MCDONALD` becomes `Mcdonald`; add a casing table if it matters.
 */
export function titleCaseAllCapsName(name: string): string {
  if (/\p{Ll}/u.test(name)) return name;
  return name.replace(/\p{L}+/gu, (word) => word.length > 1 ? word[0] + word.slice(1).toLowerCase() : word);
}
