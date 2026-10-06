import type {
  Paper,
  Section,
  PaperBlock,
  NormalizedSectionKind,
  FigureMetadata,
  TableMetadata,
  EquationMetadata,
} from "../../../types/paper";
import { fingerprintText, stableBlockId, uniqueId } from "../../../data/package/ids";
import { reconcileBlockIds } from "../../../data/package/reconcile";
import {
  displayHeadingText,
  figureLookupKey,
  joinHyphenated,
  type LayoutBlock,
  type PageColumnLayout,
} from "../../pdfLayout";
import {
  pickPaperTitle,
  pickPublication,
  isReferencesHeading,
  isExpectedNonProseParagraph,
  shouldTranslateParagraph,
  unsafeParagraphStructureReason,
} from "../../translation/quality";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type { CanonicalDocument, CanonicalNode } from "../canonical/types";
import { topologicalOrder } from "../resolver/relationResolver";

function normalizeSection(title: string): NormalizedSectionKind {
  const lower = title.toLowerCase();
  if (/abstract|要旨/i.test(lower)) return "abstract";
  if (/introduction|はじめに|序論|序言|まえがき/i.test(lower)) {
    return "introduction";
  }
  if (
    /related\s*work|background|literature|prior|関連研究|先行研究|背景/i.test(
      lower
    )
  ) {
    return "related_work";
  }
  if (/method|approach|model|architecture|system|design/i.test(lower)) {
    return "method";
  }
  if (/result|experiment|evaluation|finding|分析結果/i.test(lower)) {
    return "results";
  }
  if (/discussion|考察/i.test(lower)) return "discussion";
  if (/conclusion|summary|future|まとめ|結論|おわりに/i.test(lower)) {
    return "conclusion";
  }
  if (/reference|bibliography|参考文献|引用文献/i.test(lower)) {
    return "references";
  }
  if (/acknowledge|謝辞/i.test(lower)) return "other";
  return "other";
}

function expandAuthorLine(text: string): string[] {
  const markedSource = text.replace(/^\s*and\s+/i, "").replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ").replace(/\s+/g, " ").trim();
  const cleaned = text
    .replace(/^\s*and\s+/i, "")
    .replace(/[*†‡§]/g, " ")
    .replace(/\d+/g, "")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/\d+[*†‡§]/g, "")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(?:^|[\s,])\d{1,2}(?=$|[\s,])/gu, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ")
    .replace(/^[,;·\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const withoutLocation = cleaned.replace(/^(?:Tel\s+Aviv,?\s+Israel|Albany,?\s+NY,?\s+USA|New\s+York,?\s+NY,?\s+USA)\s+/i, "").trim();
  if (withoutLocation !== cleaned) return expandAuthorLine(withoutLocation);

  const cjkTokens = cleaned.match(/[\u3040-\u30ff\u4e00-\u9fff]{1,4}/g) ?? [];
  const latin = cleaned
    .replace(/[\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const names: string[] = [];
  const uppercaseNames = [...cleaned.matchAll(/\b[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+){1,3}\b/g)]
    .map((match) => match[0].trim())
    .filter((name) => !/^(?:FACEBOOK|GOOGLE|MICROSOFT|AMAZON|APPLE|STANFORD|UNIVERSITY|DEPARTMENT|SCHOOL|INSTITUTE|COLLEGE)$/i.test(name));
  if (uppercaseNames.length >= 2 || (uppercaseNames.length === 1 && /[,·]/.test(cleaned))) {
    return uppercaseNames;
  }
  const spacedNameTokens = cleaned.split(/\s+/).filter(Boolean);
  // Native mastheads sometimes lose the delimiter between two adjacent
  // two-token names while retaining commas around the run, e.g.
  // `..., James Clawson Thad Starner3, Jim Budd`. Split only a comma-bounded
  // run of exactly four ordinary title-case tokens; this is conservative and
  // avoids guessing inside compound surnames or prose.
  const commaBoundedNames = cleaned
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const tokens = part.split(/\s+/).filter(Boolean);
      return tokens.length === 4 && tokens.every((token) => /^[A-Z][\p{Ll}’'’-]+$/u.test(token))
        ? [tokens.slice(0, 2).join(" "), tokens.slice(2).join(" ")]
        : [part];
    });
  if (commaBoundedNames.length > 1 && commaBoundedNames.every((part) =>
    /^(?:[A-Z][\p{Ll}’'’-]+\s+){1,3}[A-Z][\p{Ll}’'’-]+$/u.test(part)
  ) && commaBoundedNames.some((part) => part.split(/\s+/).length === 2)) {
    return commaBoundedNames;
  }
  if (spacedNameTokens.length === 4 && spacedNameTokens.every((token) => /^[A-Z][\p{Ll}’'’-]+$/u.test(token))) {
    return [spacedNameTokens.slice(0, 2).join(" "), spacedNameTokens.slice(2).join(" ")];
  }
  if (spacedNameTokens.length >= 5 && /^[A-Z][\p{Ll}’'’-]+$/u.test(spacedNameTokens[0]) &&
      /^[A-Z][\p{Ll}’'’-]+$/u.test(spacedNameTokens[1]) &&
      /^[A-Z][\p{Ll}’'’-]+$/u.test(spacedNameTokens[2]) &&
      /^(?:van|von|de|den|der|di|da|la|le)$/i.test(spacedNameTokens[3]) &&
      /^[A-Z][\p{Ll}’'’-]+$/u.test(spacedNameTokens[4])) {
    return [spacedNameTokens.slice(0, 2).join(" "), spacedNameTokens.slice(2).join(" ")];
  }
  // Multi-author rows can contain a compound surname (for example
  // `First Last Second van den Surname`). Keep the particle sequence with
  // the second author instead of treating the whole row as one name.
  if (spacedNameTokens.length >= 6 &&
      spacedNameTokens.slice(0, 3).every((token) => /^[A-Z][\p{Ll}’'’-]+$/u.test(token)) &&
      /^(?:van|von|de|den|der|di|da|la|le)$/i.test(spacedNameTokens[3]) &&
      /^(?:van|von|de|den|der|di|da|la|le)$/i.test(spacedNameTokens[4]) &&
      /^[A-Z][\p{Ll}’'’-]+$/u.test(spacedNameTokens[5])) {
    return [spacedNameTokens.slice(0, 2).join(" "), spacedNameTokens.slice(2).join(" ")];
  }
  const markerParts = markedSource
    .split(/(?<=[♠♣♡♢∗†‡§])\s*/u)
    .map((part) => part.replace(/[♠♣♡♢∗†‡§*]/gu, "").replace(/\d+/g, "").replace(/^\s*and\s+/i, "").replace(/^[,;·\s]+/, "").replace(/\s+/g, " ").trim())
    .filter((part) => part && /\p{L}/u.test(part));
  if (markerParts.length >= 2) {
    return markerParts;
  }
  const commaParts = cleaned
    .split(/\s*(?:,|;|·|\band\b|&)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length >= 2 && !/@/.test(part));
  if (commaParts.length >= 2 && commaParts.every((part) => part.split(/\s+/).length <= 5) &&
      commaParts.every((part) => !/(?:university|department|institute|school|faculty|hospital|laboratory)/i.test(part))) {
    return commaParts;
  }
  if (cjkTokens.length >= 2 && cjkTokens.length % 2 === 0) {
    for (let i = 0; i < cjkTokens.length; i += 2) {
      names.push(`${cjkTokens[i]} ${cjkTokens[i + 1]}`);
    }
  } else if (cjkTokens.length > 0 && !latin) {
    names.push(cjkTokens.join(" "));
  }
  if (latin) names.push(latin);
  return names.length > 0 ? names : [cleaned];
}

/** Reject metadata lines that a publisher sometimes labels as author rows. */
function isNonAuthorMastheadLine(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return true;
  const locationPart = /^[A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*){0,3},\s*(?:[A-Z]{2,}|(?:Australia|Austria|Belgium|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States|The Netherlands))(?:,\s*(?:[A-Z]{2,}|(?:Australia|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States)))?$/u;
  if (locationPart.test(value) || value.split(/\s{2,}/).filter(Boolean).every((part) => locationPart.test(part)) || /\b([A-Z][\p{L}'’-]+),\s*(USA|Australia|Canada|China|Japan|UK)\s+\1,\s*\2\b/iu.test(value)) return true;
  if (/https?:\/\/|\b(?:19|20)\d{2}\b|\b(?:article|journal|proceedings|volume|issue)\b/i.test(value)) return true;
  if (/@[\w.-]+\.[A-Za-z]{2,}/.test(value)) return true;
  if (/\b(?:and|or|the|its|of|at|in|from|to)\s*$/i.test(value) && value.split(/\s+/).length >= 3) return true;
  return false;
}

type MastheadPair = { author: string; affiliation: string };

function normalizeAffiliationName(text: string): string {
  const collapseExactRepeat = (value: string): string => {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const left = words.slice(0, half).join(" ");
      const right = words.slice(half).join(" ");
      if (left.toLocaleLowerCase() === right.toLocaleLowerCase()) return left;
    }
    return value;
  };
  return collapseExactRepeat(text
    // Reviewer/editor metadata can share the native block with the final
    // affiliation row in journal mastheads. It is a hard boundary, not part
    // of an institution name.
    .replace(/\s+(?:edited|reviewed)\s+by\s*:\s*[\s\S]*$/i, "")
    // Some publishers omit the label but leave `Reviewer Name, NIH ...`
    // inline after the final institution. Cut that person-shaped tail.
    .replace(/,\s+[A-Z][\p{Ll}'’-]+(?:\s+[A-Z][\p{Ll}'’-]+){1,2},\s+(?=(?:NIH|University|Hospital|Institute|Center|Centre)\b)[\s\S]*$/u, "")
    // Contact aliases can follow the final institution in braces; they are
    // not part of the affiliation label.
    .replace(/\s*\{[\s\S]*$/, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "")
    // Superscript affiliation markers can be flattened as repeated `1 1`
    // before a continuation line. Remove only that duplicated-marker shape;
    // ordinary street numbers remain intact.
    .replace(/\b(\d{1,2})\s+\1(?=\s*[A-Z])/g, "")
    // Native PDF text sometimes loses spaces at font-run boundaries
    // (e.g. `IowaStateUniversity` or `ofEvents`). Restore only a lower-to-
    // upper transition; this cannot split ordinary all-caps institution names.
    .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/^[*†‡§☯\s]+/, "")
    .trim());
}

/**
 * Recover the common publisher layout where an all-caps author and their
 * institution are flattened into one affiliation block. This deliberately
 * accepts only name-shaped all-caps runs followed by a comma and an
 * institution-shaped tail; ordinary prose and title-case names stay on the
 * canonical path.
 */
function splitFlattenedMasthead(text: string): MastheadPair[] {
  const name = `[A-Z][A-Z'’-]+(?:\\s+\\([A-Z][^)]+\\))?(?:\\s+[A-Z][A-Z'’-]+){1,3}`;
  const starts = [...text.matchAll(new RegExp(`(${name})\\s*,`, "g"))]
    .map((match) => ({
      index: match.index ?? 0,
      name: match[1].trim().replace(/^(?:USA|UK|China|Japan|Canada|Australia)\\s+/i, ""),
      end: (match.index ?? 0) + match[0].length,
    }));
  if (starts.length < 2) return [];
  return starts.map((entry, index) => {
    const end = starts[index + 1]?.index ?? text.length;
    return { author: entry.name, affiliation: text.slice(entry.end, end).replace(/^[,;\s]+|[,;\s]+$/g, "").trim() };
  }).filter((pair) => pair.affiliation.length >= 12 && /(?:university|school|department|engineering|medicine|institute|college|laboratory|\busa\b)/i.test(pair.affiliation));
}

/** Recover title-page names when a publisher flattens `NAME, institution`
 * rows into affiliation nodes. This is deliberately limited to an
 * institution-shaped tail and uppercase name-shaped prefixes. */
function splitAffiliationNamePrefix(text: string): MastheadPair[] {
  const match = text.match(/^\s*((?:[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+){1,4})(?:\s+and\s+(?:[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+){1,4}))?)\s*,\s*(.+)$/);
  if (!match || !/(?:university|institute|department|school|college|hospital|laboratory|research council|pisa|italy|usa)/i.test(match[2])) return [];
  const names = match[1].split(/\s+and\s+/i).map((name) => name.trim()).filter(Boolean);
  if (!names.length) return [];
  return names.map((author) => ({ author, affiliation: match[2].trim() }));
}

/** Split flattened bullet lists into independent canonical blocks. */
export function splitFlattenedList(text: string): string[] {
  // Academic PDFs often encode bullet lists as en/em dashes rather than a
  // dedicated bullet glyph. Repeated dash markers are treated as list
  // boundaries; a single inline dash remains ordinary prose.
  const markers = [...text.matchAll(/(?:^|\s)([•‣▪∙–—])\s+/g)].map((m) =>
    m.index === undefined ? -1 : (m.index + (m[0].startsWith(" ") ? 1 : 0))
  ).filter((i) => i >= 0);
  const numbered = [...text.matchAll(/(?:^|\s)((?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\))\s+/g)]
    .map((m) => (m.index === undefined ? -1 : m.index + (m[0].startsWith(" ") ? 1 : 0)))
    .filter((i) => i >= 0);
  const starts = markers.length >= 2 ? markers : numbered;
  if (starts.length < 2) return [text];
  const first = starts[0];
  const prefix = text.slice(0, first).trim();
  // Keep a sentence-shaped lead-in separate when the native stream clearly
  // marks the list introduction with a colon. Requiring the colon avoids
  // splitting ordinary prose that happens to contain two bullet glyphs.
  const bounds = prefix.endsWith(":")
    ? [0, first, ...starts.slice(1), text.length]
    : [0, ...starts, text.length];
  return bounds.slice(0, -1).map((start, i) => text.slice(start, bounds[i + 1]).trim()).filter(Boolean);
}

function detectHeadingLevel(text: string, fontSize: number, baseFontSize: number): number {
  const match = text.match(/^(\d+)(\.(\d+))?(\.(\d+))?/);
  if (match) {
    if (match[5]) return 3;
    if (match[3]) return 2;
    return 1;
  }
  if (fontSize > baseFontSize * 1.3) return 1;
  if (fontSize > baseFontSize * 1.15) return 2;
  return 1;
}

function isReferenceText(text: string, currentKind: NormalizedSectionKind | null): boolean {
  // A column/page reorder can leave an in-text author-year citation at the
  // start of a paragraph after the resolver has entered the references
  // section.  The closing citation followed by a finite sentence is strong
  // evidence of body prose; do not hide it as a bibliography entry.
  if (currentKind === "references" && /^\([^)]{2,100}\)\.\s+[A-Z][a-z]+\b/.test(text.trim())) return false;
  if (currentKind === "references") {
    // Section state can leak across a reordered column or a floating figure.
    // Do not hide every following paragraph as a bibliography entry.  Native
    // reference candidates are still preserved by their canonical `reference`
    // role; this fallback only classifies paragraph-shaped nodes when they
    // contain bibliographic evidence.
    const trimmed = text.trim();
    const hasYear = /\b(?:19|20)\d{2}[a-z]?\b/.test(trimmed);
    const hasBibliographicShape =
      /^(?:\[\d+\]|\d+[.)])\s+[^.!?]{2,140}\b(?:19|20)\d{2}[a-z]?\b/.test(trimmed) ||
      /\b(?:doi\s*:|https?:\/\/|journal|proceedings|conference|出版社|大学紀要)\b/i.test(trimmed);
    // A long sentence containing an inline year is usually body prose with a
    // citation, not a bibliography record.  Keep it visible for translation.
    if (trimmed.length > 180 && /[.!?]\s*$/.test(trimmed) && hasYear) return false;
    return hasBibliographicShape;
  }
  // A numbered list item is not a bibliography entry. Outside an explicit
  // References section, require citation-shaped evidence such as a year.
  return /^\[\d+\]/.test(text) ||
    (/^\d+\.\s+[A-Z][a-z]+,?\s+[A-Z]/.test(text) && /\b(?:19|20)\d{2}\b/.test(text));
}

/** Numbered prose items are lists even when an upstream role heuristic called
 * them references. Bibliography entries have author/year evidence; ordinary
 * list items do not. */
function isNumberedProseListItem(text: string): boolean {
  return /^(?:[1-9]|1[0-9]|20)[.)]\s+/.test(text) &&
    !/\b(?:19|20)\d{2}\b/.test(text.slice(0, 180));
}

function isLikelyNarrativeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 12 && /[.!?](?:\s|$)/.test(trimmed);
}

function layoutForNode(
  node: CanonicalNode,
  blocks: LayoutBlock[]
): LayoutBlock | undefined {
  return blocks.find(
    (b) =>
      b.pageStart === node.pageStart &&
      b.text === node.text &&
      (b.role === node.role ||
        (node.role === "caption" &&
          (b.role === "figure_caption" || b.role === "table_caption")) ||
        (node.role === "abstract" && b.role === "paragraph"))
  );
}

type RecoveredColumnMasthead = {
  authors: string[];
  affiliations: string[];
};

/**
 * Recover publisher mastheads whose native text stream interleaves columns at
 * the same baseline.  This is deliberately conservative and only activates
 * when at least two stable author-sized column anchors can be inferred.
 */
function recoverColumnMasthead(
  layoutBlocks: LayoutBlock[],
  firstBodyY: number,
): RecoveredColumnMasthead | undefined {
  const lines = layoutBlocks
    .filter((block) => block.pageStart === 1)
    .flatMap((block) => block.lines ?? [])
    // The title itself is often the largest text on page 1 and must not become
    // a masthead column anchor.
    .filter((line) => line.y < Math.min(firstBodyY, 360) && line.y > 110);
  const items = lines.flatMap((line) => line.items.map((item) => ({
    ...item,
    y: line.y,
    lineFontSize: line.fontSize,
  }))).filter((item) => item.x >= 70);
  if (items.length < 8) return undefined;
  const likelyAuthorItems = items.filter((item) => item.fontSize >= 10.5);
  const xs = [...new Set(likelyAuthorItems.map((item) => item.x).sort((a, b) => a - b))];
  const anchors: number[] = [];
  for (const x of xs) {
    const previous = anchors.at(-1);
    if (previous === undefined || x - previous > 90) anchors.push(x);
  }
  if (anchors.length < 2 || anchors.length > 5) return undefined;

  const records = items.map((item) => ({
    ...item,
    column: anchors.reduce((best, anchor, index) =>
      Math.abs(anchor - item.x) < Math.abs(anchors[best] - item.x) ? index : best, 0),
  }));
  const groups: Array<{ column: number; y: number; text: string; fontSize: number }> = [];
  for (const record of records.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = groups.find((group) => group.column === record.column && Math.abs(group.y - record.y) < 2);
    if (previous) {
      previous.text = `${previous.text} ${record.text}`.replace(/\s+/g, " ").trim();
      previous.fontSize = Math.max(previous.fontSize, record.fontSize);
    } else {
      groups.push({ column: record.column, y: record.y, text: record.text.trim(), fontSize: record.fontSize });
    }
  }
  const bodyFont = groups
    .map((group) => group.fontSize)
    .sort((a, b) => a - b)[Math.floor(groups.length / 2)] ?? 10;
  const institution = /\b(?:university|department|school|faculty|college|institute|laboratory|hospital|center|centre|exchange|engineering|computer|design)\b|@[\w.-]+\.[A-Za-z]{2,}|,\s*(?:USA|UK|Canada|Australia)\b/i;
  const nameLike = (text: string, fontSize: number) => {
    const value = text.replace(/[\d,*†‡§]/g, " ").replace(/\s+/g, " ").trim();
    const words = value.split(/\s+/).filter(Boolean);
    const capitalizedWords = words.filter((word) => /^[A-Z(]/.test(word)).length;
    return words.length >= 1 && words.length <= 5 && !institution.test(value) &&
      fontSize >= bodyFont + 0.6 && capitalizedWords >= Math.min(2, words.length);
  };
  const authorGroups = groups.filter((group) => nameLike(group.text, group.fontSize));
  if (authorGroups.length < 3) return undefined;
  const authors: string[] = [];
  const affiliations: string[] = [];
  for (const author of authorGroups) {
    const following = groups
      .filter((group) => group.column === author.column && group.y > author.y)
      .sort((a, b) => a.y - b.y);
    const nextAuthorY = following.find((group) => nameLike(group.text, group.fontSize))?.y ?? Infinity;
    const affiliation = following
      .filter((group) => group.y < nextAuthorY && !/@[\w.-]+\.[A-Za-z]{2,}/.test(group.text))
      .map((group) => group.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    authors.push(author.text.replace(/[\d,*†‡§]/g, " ").replace(/\s+/g, " ").trim());
    if (affiliation) affiliations.push(normalizeAffiliationName(affiliation));
  }
  const uniqueAuthors = authors.filter((name, index) => authors.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index);
  const affiliationKey = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
  const uniqueAffiliations = affiliations.filter((name, index) => affiliations.findIndex((other) => affiliationKey(other) === affiliationKey(name)) === index);
  return uniqueAuthors.length >= 3 && uniqueAffiliations.length >= 2
    ? { authors: uniqueAuthors, affiliations: uniqueAffiliations }
    : undefined;
}

function projectionNodesWithContinuations(
  orderedNodes: CanonicalNode[],
  canonical: CanonicalDocument,
  layoutBlocks: LayoutBlock[]
): Array<{ node: CanonicalNode; layout: LayoutBlock | undefined }> {
  const nodeById = new Map(canonical.nodes.map((node) => [node.id, node]));
  const continuationByNode = new Map(
    canonical.relations
      .filter((relation) => relation.kind === "CONTINUES")
      .map((relation) => [relation.from, relation.to])
  );
  const consumed = new Set<string>();
  const projected: Array<{ node: CanonicalNode; layout: LayoutBlock | undefined }> = [];

  for (const sourceNode of orderedNodes) {
    if (consumed.has(sourceNode.id)) continue;
    let node = sourceNode;
    let layout = layoutForNode(node, layoutBlocks);
    let nextId = continuationByNode.get(node.id);
    while (nextId) {
      const next = nodeById.get(nextId);
      if (!next || node.role !== "paragraph" || next.role !== "paragraph" || !node.text || !next.text) break;
      const nextLayout = layoutForNode(next, layoutBlocks);
      const text = joinHyphenated(node.text, next.text).replace(/\s+/g, " ").trim();
      const boxes = [...node.boundingBoxes, ...next.boundingBoxes];
      const lines = [...(layout?.lines ?? []), ...(nextLayout?.lines ?? [])];
      const x = Math.min(...boxes.map((box) => box.x));
      const y = Math.min(...boxes.map((box) => box.y));
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      node = {
        ...node,
        text,
        pageEnd: next.pageEnd,
        boundingBoxes: boxes,
        confidence: Math.min(node.confidence, next.confidence),
        evidence: [...node.evidence, ...next.evidence],
        sourceAnchor: { ...node.sourceAnchor, boundingBoxes: boxes },
      };
      if (layout && nextLayout) {
        layout = {
          ...layout,
          text,
          lines,
          pageEnd: next.pageEnd,
          column: "spanning",
          bbox: { page: node.pageStart, x, y, width: right - x, height: bottom - y },
        };
      }
      consumed.add(next.id);
      nextId = continuationByNode.get(next.id);
    }
    projected.push({ node, layout });
  }
  return projected;
}

export type PaperProjection = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
};

/**
 * CanonicalDocument → Paper / Section / PaperBlock.
 * Import and the reader consume only this projection.
 */
export function projectCanonicalToPaper(input: {
  canonical: CanonicalDocument;
  paperId: string;
  filePath: string;
  fileHash: string;
  metadata: { title?: string; author?: string; pageCount: number };
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  baseFontSize: number;
  previousBlocks?: PaperBlock[];
}): PaperProjection {
  const { canonical, paperId, layoutBlocks, layouts, baseFontSize } = input;
  const titleNode = canonical.nodes.find((n) => n.role === "title");
  const firstBodyY = canonical.nodes
    .filter((n) => n.pageStart === 1 && n.text &&
      ((n.role === "heading" && /^abstract$/i.test(n.text.trim())) ||
       (n.role === "abstract") || (n.role === "paragraph" && n.text.length > 260)))
    .map((n) => n.boundingBoxes[0]?.y ?? Infinity)
    .sort((a, b) => a - b)[0] ?? Infinity;
  const pageOneNodesByY = canonical.nodes
    .filter((n) => n.pageStart === 1 && n.boundingBoxes[0]?.y != null)
    .slice()
    .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
  const sidebarLabels = pageOneNodesByY.filter((n) =>
    /^(?:open access|edited by|reviewed by|correspondence|specialty section|citation|received|accepted|published)\s*:?$/i.test(n.text?.trim() ?? "")
  );
  const sidebarRight = sidebarLabels.length > 0
    ? Math.max(...sidebarLabels.map((n) => {
      const box = n.boundingBoxes[0];
      return (box?.x ?? 0) + (box?.width ?? 0);
    }))
    : 0;
  const hasSidebarBody = sidebarLabels.length >= 2 && canonical.nodes.some((n) => {
    const box = n.boundingBoxes[0];
    return n.pageStart === 1 && (n.role === "paragraph" || n.role === "author" || n.role === "title") &&
      (box?.x ?? 0) > sidebarRight + 12 && (box?.width ?? 0) >= 180;
  });
  const isSidebarChromeNode = (node: (typeof canonical.nodes)[number]): boolean => {
    const box = node.boundingBoxes[0];
    return hasSidebarBody && node.pageStart === 1 && (box?.x ?? 0) + (box?.width ?? 0) <= sidebarRight + 18;
  };
  const mastheadExcludedByLabel = (node: (typeof canonical.nodes)[number]): boolean => {
    const y = node.boundingBoxes[0]?.y ?? Infinity;
    const previousHeadingNode = pageOneNodesByY
      .filter((candidate) => (candidate.boundingBoxes[0]?.y ?? Infinity) < y &&
        /^(?:edited by|reviewed by|specialty section|correspondence)\s*:?$/i.test(candidate.text?.trim() ?? ""))
      .at(-1);
    const previousHeading = previousHeadingNode?.text?.trim() ?? "";
    const nodeX = node.boundingBoxes[0]?.x ?? Infinity;
    const headingX = previousHeadingNode?.boundingBoxes[0]?.x ?? -Infinity;
    const hasRecentAuthor = pageOneNodesByY.some((candidate) =>
      candidate.role === "author" && candidate !== node &&
      (candidate.boundingBoxes[0]?.y ?? Infinity) < y &&
      y - (candidate.boundingBoxes[0]?.y ?? 0) < 55);
    const labelMatch = /^(?:edited by|reviewed by|specialty section|correspondence)\b/i.test(previousHeading);
    const closeToLabel = y - (previousHeadingNode?.boundingBoxes[0]?.y ?? y) < 25;
    return Math.abs(nodeX - headingX) < 120 && labelMatch && (closeToLabel || !hasRecentAuthor);
  };
  const authorNodes = canonical.nodes.filter((n) => n.role === "author" && n.text &&
    n.pageStart === 1 && (n.boundingBoxes[0]?.y ?? 0) < firstBodyY &&
    !isSidebarChromeNode(n) &&
    !mastheadExcludedByLabel(n) &&
    // Long mastheads can contain many marker-separated authors. Keep them
    // eligible for expansion; the marker/separator checks in expandAuthorLine
    // still prevent ordinary prose from becoming an author list.
    n.text.trim().length <= 500 && !/:\s/.test(n.text) &&
    !isNonAuthorMastheadLine(n.text) &&
    (!input.metadata.title || (n.text.trim().toLocaleLowerCase() !== input.metadata.title.trim().toLocaleLowerCase() &&
      !n.text.trim().toLocaleLowerCase().startsWith(input.metadata.title.trim().toLocaleLowerCase().slice(0, 28)))) &&
    !/^(?:original article|research article|conceptual\/theoretical paper|additional key words?|phrases?|keywords?|acm reference format|©|the author\(s\))/i.test(n.text.trim()));
  // Two-column publisher mastheads can place the continuation of an author
  // row in a paragraph-role node at the same baseline. Treat only a leading
  // middle-dot marker plus multiple name-shaped tokens as continuation.
  const authorContinuationNodes = canonical.nodes.filter((n) =>
    (n.role === "paragraph" || n.role === "heading") && n.text && n.pageStart === 1 &&
    !isSidebarChromeNode(n) &&
    (n.boundingBoxes[0]?.y ?? 9999) < 520 &&
    !/^\s*(?:keywords?|key words?)\s*:/i.test(n.text.trim()) &&
    !isNonAuthorMastheadLine(n.text) &&
    ((n.role === "heading" && n.text.trim().length <= 240 &&
      (n.text.match(/,/g)?.length ?? 0) >= 1 &&
      (n.text.match(/[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 2 &&
      /\d\s*[A-Z]/.test(n.text)) ||
      (/^\s*[·•]\s*[A-Z][^!?]{8,220}$/.test(n.text.trim()) &&
      (n.text.match(/[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+/g)?.length ?? 0) >= 2) ||
      ((n.boundingBoxes[0]?.y ?? 9999) < 390 && n.text.trim().length <= 400 &&
        (n.text.match(/,/g)?.length ?? 0) >= 2 &&
        (n.text.match(/[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?/gu)?.length ?? 0) >= 3 &&
        ((n.text.match(/[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 6 ||
          (n.text.match(/,/g)?.length ?? 0) >= 4) &&
        !/[.!?]$/.test(n.text.trim())) ||
      (/\d[*†‡]?/.test(n.text) && n.text.trim().length <= 400 &&
        (n.text.match(/,/g)?.length ?? 0) >= 3 && !/[.!?]$/.test(n.text.trim()))));
  // Some two-column journals classify the first half of an italic author row
  // as paragraph text and the next visual line as author. Recover the marked
  // prefix as a source node before projection; the strict marker/count/height
  // checks keep ordinary abstract prose out of this path.
  const markedAuthorParagraphs = canonical.nodes.filter((n) => n.role === "paragraph" && n.text &&
    n.pageStart === 1 && (n.boundingBoxes[0]?.y ?? Infinity) < 390 &&
    !/^(?:keywords?|key words?)\s*:/i.test(n.text.trim()) &&
    !isNonAuthorMastheadLine(n.text) &&
    n.text.trim().length <= 400 && /\d[*†‡]?/.test(n.text) &&
    (n.text.match(/,/g)?.length ?? 0) >= 3 && !/[.!?]$/.test(n.text.trim()));
  const authorSourceNodes = [...authorNodes, ...authorContinuationNodes, ...markedAuthorParagraphs];
  // Some journal templates emit wrapped institution lines as ordinary
  // paragraphs.  Recover only metadata-shaped lines on page 1, before the
  // body starts; ordinary prose must remain a paragraph.
  const affiliationNodes = canonical.nodes.filter((n) => {
    if (!n.text || isSidebarChromeNode(n) || n.pageStart !== 1) return false;
    if (n.role === "affiliation") return true;
    if (n.role !== "paragraph") return false;
    const y = n.boundingBoxes[0]?.y ?? Infinity;
    if (y >= firstBodyY || n.text.length > 320 || /[.!?。！？]$/.test(n.text.trim())) return false;
    return /\b(?:department|faculty|school|college|university|institute|laboratory|laboratories|hospital|center|centre|management)\b/i.test(n.text);
  });
  const affiliated = canonical.relations.filter((r) => r.kind === "AFFILIATED_WITH");
  const projectionAuthorText = (node: (typeof canonical.nodes)[number]): string => {
    const box = node.boundingBoxes[0];
    // A native line can span the sidebar/body gutter. When its left edge is
    // inside the sidebar and it contains comma-separated names, discard only
    // the leftmost sidebar segment when it is immediately below a sidebar
    // label; farther-down mixed lines may contain a genuine article author.
    if (hasSidebarBody && (box?.x ?? Infinity) < sidebarRight && (box?.width ?? 0) > 180) {
      const y = box?.y ?? Infinity;
      const nearestLabelY = sidebarLabels
        .map((label) => label.boundingBoxes[0]?.y ?? -Infinity)
        .filter((labelY) => labelY < y)
        .sort((a, b) => b - a)[0] ?? -Infinity;
      if (y - nearestLabelY < 30) return (node.text ?? "").replace(/^[^,]+,\s*/, "");
    }
    return node.text ?? "";
  };
  const mergedMastheadPredecessors = new Set<string>();
  const authorsStructured = authorSourceNodes.map((node) => {
    const box = node.boundingBoxes[0];
    const predecessor = node.role === "author"
      ? canonical.nodes
        .filter((candidate) => candidate.role === "paragraph" && candidate.pageStart === 1 && candidate.text &&
          Math.abs((candidate.boundingBoxes[0]?.x ?? Infinity) - (box?.x ?? -Infinity)) <= 2 &&
          (box?.y ?? Infinity) > (candidate.boundingBoxes[0]?.y ?? -Infinity) &&
          (box?.y ?? Infinity) - (candidate.boundingBoxes[0]?.y ?? 0) < 28 &&
          (candidate.boundingBoxes[0]?.y ?? Infinity) < 390 &&
          (candidate.text.match(/,/g)?.length ?? 0) >= 3 &&
          /\d[*†‡]?/.test(candidate.text))
        .sort((a, b) => (b.boundingBoxes[0]?.y ?? 0) - (a.boundingBoxes[0]?.y ?? 0))[0]
      : undefined;
    if (predecessor) mergedMastheadPredecessors.add(predecessor.id);
    return {
    id: node.id,
    name: `${predecessor ? `${predecessor.text} ` : ""}${projectionAuthorText(node)}`.trim(),
    affiliationIds: affiliated.filter((rel) => rel.from === node.id).map((rel) => rel.to),
    predecessorId: predecessor?.id,
  };
  }).filter((author) => !mergedMastheadPredecessors.has(author.id));
  const affiliationCandidates = affiliationNodes.flatMap((node) => {
    const layout = layoutForNode(node, layoutBlocks);
    const lines = layout?.lines ?? [];
    const markerPositions = lines.flatMap((line) => line.items
      .filter((item) => item.fontSize < line.fontSize * 0.8 && /^\d{1,2}$/.test(item.text.trim()))
      .map((item) => ({ marker: item.text.trim(), x: item.x })));
    const base = { _page: node.pageStart, _y: node.boundingBoxes[0]?.y ?? 0 };
    const sidebarMixed = hasSidebarBody &&
      (node.boundingBoxes[0]?.x ?? Infinity) < sidebarRight &&
      (node.boundingBoxes[0]?.width ?? 0) > 180;
    const markerSource = sidebarMixed
      ? lines.map((line) => line.items
          .filter((item) => item.x > sidebarRight + 8)
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(" ")).join(" ")
      : (node.text ?? "");
    // Some journal templates place all numbered affiliations in one native
    // line/block. Split only when each segment starts with a short superscript
    // marker immediately followed by an institution-shaped capitalized token.
    const numberedParts = markerSource
      .trim()
      .split(/(?=\b\d{1,2}(?=[A-Z]))/)
      .map((part) => part.replace(/^\d{1,2}\s*/, "").trim())
      .filter(Boolean);
    const letteredParts = markerSource
      .trim()
      .split(/(?=\b[a-z]\s+(?=[A-Z]))/)
      .map((part) => part.replace(/^[a-z]\s+/, "").trim())
      .filter(Boolean);
    // A full-width affiliation node can include a left sidebar. In that
    // layout the flattened text loses column ownership, so defer to the
    // geometry path below instead of splitting the contaminated string by
    // superscript markers.
    const markerParts = sidebarMixed ? [] : (numberedParts.length >= 2 ? numberedParts : letteredParts);
    const institutionPhraseParts = [...markerSource.matchAll(/(?:^|\d|\s)([A-Z][A-Za-z-]+\s+(?:Design|Computing))\b/g)]
      .map((match) => match[1].trim())
      .filter((part, index, all) => all.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index);
    if (institutionPhraseParts.length >= 2 && /\d/.test(markerSource)) {
      return institutionPhraseParts.map((name, index) => ({
        id: `${node.id}-institution-phrase-${index + 1}`,
        name: normalizeAffiliationName(name),
        _x: node.boundingBoxes[0]?.x ?? 0,
        _marker: undefined,
        ...base,
      }));
    }
    if (markerParts.length >= 2 && markerParts.every((part) =>
      part.split(/\s+/).length >= 3 &&
      /\b(?:university|department|institute|school|faculty|college|hospital|laboratory|center|centre|consortium)\b/i.test(part))) {
      return markerParts.map((name, index) => ({
        id: `${node.id}-numbered-${index + 1}`,
        name: normalizeAffiliationName(name),
        _x: node.boundingBoxes[0]?.x ?? 0,
        _marker: String(index + 1),
        ...base,
      }));
    }
    const multiColumnLineCount = lines.filter((line) =>
      line.items.filter((item) => item.fontSize >= line.fontSize * 0.7).length >= 2).length;
    const candidateLines = hasSidebarBody &&
      (node.boundingBoxes[0]?.x ?? Infinity) < sidebarRight &&
      (node.boundingBoxes[0]?.width ?? 0) > 180
      ? lines.map((line) => ({
          ...line,
          items: line.items.filter((item) => item.x > sidebarRight + 8),
        }))
      : lines;
    if (sidebarMixed) {
      const ordered = candidateLines
        .flatMap((line) => line.items.map((item) => ({ item, y: line.y })))
        .sort((a, b) => a.y - b.y);
      const parts: string[][] = [[]];
      for (const { item } of ordered) {
        const marker = item.text.trim();
        const isMarker = item.fontSize < 8 && /^\d{1,2}$/.test(marker);
        if (isMarker && Number(marker) >= 2) parts.push([]);
        else if (!isMarker && item.text.trim()) parts.at(-1)?.push(item.text.trim());
      }
      const sequentialParts = parts.map((part) => part.join(" ").trim()).filter(Boolean);
      if (sequentialParts.length >= 2 && sequentialParts.every((part) => part.split(/\s+/).length >= 3)) {
        return sequentialParts.map((name, index) => ({
          id: `${node.id}-ordered-${index + 1}`,
          name: normalizeAffiliationName(name),
          _x: node.boundingBoxes[0]?.x ?? 0,
          _marker: String(index + 1),
          ...base,
        }));
      }
    }
    const multiColumn = multiColumnLineCount > 0 &&
      (candidateLines.length <= 2 || multiColumnLineCount / candidateLines.length >= 0.5);
    if (!multiColumn) {
      const x = node.boundingBoxes[0]?.x ?? 0;
      const marker = markerPositions.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]?.marker;
      return [{ id: node.id, name: normalizeAffiliationName(node.text ?? ""), _x: x, _marker: marker, ...base }];
    }
    const substantive = candidateLines.flatMap((line) => line.items.filter((item) => item.fontSize >= line.fontSize * 0.7));
    const xs = [...new Set(substantive.map((item) => item.x).sort((a, b) => a - b))];
    // A wrapped cell can start farther to the right than the first row (for
    // example a short country name). Treat the first multi-item row as the
    // column geometry anchor, then assign later items to the nearest anchor.
    // Clustering every observed x independently incorrectly creates a third
    // column and mixes the two institutions.
    const anchorRow = candidateLines
      .map((line) => line.items.filter((item) => item.fontSize >= line.fontSize * 0.7))
      .find((items) => items.length >= 2);
    const clusterXs: number[] = anchorRow && anchorRow.length >= 2
      ? anchorRow.map((item) => item.x).slice(0, 2).sort((a, b) => a - b)
      : (() => {
          const clusters: number[] = [];
          for (const x of xs) {
            const previous = clusters.at(-1);
            if (previous === undefined || x - previous > 50) clusters.push(x);
          }
          return clusters;
        })();
    const columns: string[][] = clusterXs.map(() => []);
    for (const line of candidateLines) {
      const rowItems = line.items.filter((candidate) => candidate.fontSize >= line.fontSize * 0.7);
      for (const [rowIndex, item] of rowItems.entries()) {
        let index = clusterXs.reduce((best, x, candidate) => Math.abs(x - item.x) < Math.abs(clusterXs[best] - item.x) ? candidate : best, 0);
        const text = item.text.replace(/^\d+\s*/, "").trim();
        // A short country token can be visually pulled into the preceding
        // column when it continues the institution in the next column. Only
        // shift it when the following item is substantive; if both items are
        // countries they represent independent affiliation continuations.
        const countryOnly = /^(?:Australia|Austria|Belgium|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States|The Netherlands)$/i.test(text);
        const nextText = rowItems[rowIndex + 1]?.text.replace(/^\d+\s*/, "").trim() ?? "";
        const nextIsCountry = /^(?:Australia|Austria|Belgium|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States|The Netherlands)$/i.test(nextText);
        if (countryOnly && rowIndex < rowItems.length - 1 && !nextIsCountry) index = Math.min(index + 1, columns.length - 1);
        columns[index].push(text);
      }
    }
    return columns.filter((parts) => parts.length > 0).map((parts, index) => ({
      id: index === 0 ? node.id : `${node.id}-column-${index}`,
      name: normalizeAffiliationName(parts.join(" ")),
      _x: clusterXs[index] ?? node.boundingBoxes[0]?.x ?? 0,
      _marker: markerPositions.slice().sort((a, b) => Math.abs(a.x - (clusterXs[index] ?? 0)) - Math.abs(b.x - (clusterXs[index] ?? 0)))[0]?.marker,
      ...base,
    }));
  }).filter((affiliation) => affiliation.name &&
    !/[{}@]/.test(affiliation.name) &&
    !/^(?:corresponding author|these authors contributed|author note|keywords?)\b/i.test(affiliation.name) &&
    !/^(?:edited|reviewed)\s+by\s*:/i.test(affiliation.name) &&
    // Reviewer rows and leaked body fragments can be classified as
    // affiliations after a native stream interleave. A person-shaped prefix
    // followed by an institution, or a lowercase sentence fragment, is not an
    // institution candidate.
    !/^[A-Z][\p{Ll}'’-]+(?:\s+[A-Z][\p{Ll}'’-]+){1,3},\s+.*\b(?:university|institute|center|centre|laboratory|biomedical)\b/i.test(affiliation.name) &&
    !/^[a-z]/.test(affiliation.name) &&
    !/^available from .*\bat:\s*$/i.test(affiliation.name) &&
    !/^(?:contents|article history|lists available at)\b/i.test(affiliation.name) &&
    (affiliation.name.match(/\b[a-z]\b/g)?.length ?? 0) < 3 &&
    (affiliation.name.split(/\s+/).length > 2 ||
      /\b(?:university|institute|department|school|faculty|college|hospital|laboratory|centre|center|research|design|computing)\b/i.test(affiliation.name) ||
      /^[A-Z0-9& -]{2,12}$/.test(affiliation.name)) &&
    // Do not expose fragments created by a column boundary as institutions.
    // Keep short acronym-only affiliations, but reject unfinished connector
    // phrases, rule lines, and glyph-spaced text that cannot identify a body.
    !/^[_\s.,-]+$/.test(affiliation.name) &&
    // Isolated initials are usually a leaked author marker rather than an
    // institution. Keep acronym-like institutions (MIT, IBM) and any row
    // carrying an explicit institution term.
    !(/^[A-Z](?:\s+[A-Z]){1,3}$/.test(affiliation.name) &&
      !/\b(?:university|institute|department|school|faculty|college|hospital|laboratory|centre|center|research|design|computing)\b/i.test(affiliation.name)) &&
    !/(?:\b(?:of|and|in|the|for|&))\s*[,;]?$/i.test(affiliation.name) &&
    ((affiliation.name.match(/\b\S\b/g)?.length ?? 0) * 2 <= affiliation.name.split(/\s+/).length ||
      /\b(?:university|institute|department|school|faculty|college|hospital|laboratory|centre|center|research|design|computing)\b/i.test(affiliation.name) ||
      /^[A-Z0-9& -]{2,12}$/.test(affiliation.name)));
  const markedCandidates = affiliationCandidates.filter((candidate) => candidate._marker);
  // Wrapped rows usually carry the superscript only on the first row. Propagate
  // that marker to later rows using the same page/x band before grouping.
  for (const candidate of affiliationCandidates) {
    if (candidate._marker) continue;
    const nearest = markedCandidates
      .filter((marked) => marked._page === candidate._page && marked._y <= candidate._y &&
        candidate._y - marked._y <= 180 && Math.abs(marked._x - candidate._x) <= 55)
      .sort((a, b) => (candidate._y - a._y) - (candidate._y - b._y))[0];
    if (nearest) candidate._marker = nearest._marker;
  }
  const groupedAffiliations = markedCandidates.length >= 2
    ? affiliationCandidates.reduce((groups, candidate) => {
      const marker = candidate._marker;
      const group = marker ? groups.find((items) => items[0]._marker === marker) : undefined;
      if (group) group.push(candidate);
      else groups.push([candidate]);
      return groups;
    }, [] as Array<typeof affiliationCandidates>).map((group) => {
      if (group.length === 1) return group[0];
      const first = group[0];
      return { ...first, name: normalizeAffiliationName(group.slice().sort((a, b) => a._y - b._y).map((item) => item.name).join(" ")) };
    })
    : affiliationCandidates;
  const affiliations = groupedAffiliations.filter((affiliation, index, all) =>
    all.findIndex((candidate) => candidate.name.toLocaleLowerCase() === affiliation.name.toLocaleLowerCase()) === index)
    .map(({ _page, _y, _x, _marker, ...affiliation }) => affiliation);
  let authorNames = authorsStructured
    .flatMap((author) => expandAuthorLine(author.name))
    .map((name) => name.replace(/[,;]+$/, "").trim())
    .filter((name) => !isNonAuthorMastheadLine(name) && name.split(/\s+/).length <= 6 && !/[!?]/.test(name) &&
      !/[@{}]/.test(name) &&
      !/[\[\]]/.test(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      !/\b(?:movement|science|sport|psychology|department|university|institute|research|council|resistance|training|edited|published)\b/i.test(name) &&
      !(/\s[A-Z]{1,3}$/.test(name) && !/^[A-Z][A-Z'’-]*(?:\s+[A-Z][A-Z'’-]*)+$/.test(name)) &&
      !/(?:^|,\s*)(?:usa|u\.s\.a?\.?|israel|italy|china|japan|uk|united kingdom|ny|california|new york|tel aviv|albany|palo alto)(?:\s*,|$)/i.test(name) &&
      !/^(?:palo alto|tel aviv|albany|new york)$/i.test(name) &&
      !/\b(?:,\s*)?(?:ny|ca),\s*usa\b/i.test(name))
    .filter((name, index, all) => all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index)
    .filter((name) => !/^(?:correspondence|corresponding author|teaching assistant professor|assistant professor|associate professor|professor|research fellow)\s*:?[,.]?$/i.test(name.trim()))
    .filter(Boolean);
  const recoveredMasthead = recoverColumnMasthead(layoutBlocks, firstBodyY);
  const contaminatedAuthor = authorNames.some((name) =>
    /@|\b(?:university|department|school|institute|design|engineering|seattle|washington),?\b/i.test(name));
  if (recoveredMasthead && (authorNames.length === 0 ||
      (contaminatedAuthor && recoveredMasthead.authors.length >= authorNames.length) ||
      affiliations.length > recoveredMasthead.affiliations.length + 1)) {
    if (authorNames.length === 0 || contaminatedAuthor) authorNames = recoveredMasthead.authors;
    affiliations.splice(0, affiliations.length, ...recoveredMasthead.affiliations.map((name, index) => ({
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
  if (acmReferenceText && authorNames.some((name) =>
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
      authorNames.splice(0, authorNames.length, ...recoveredAuthors);
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
      const nameOnly = !/(?:university|department|institute|school|college|hospital|laboratory|center|centre|japan|china|israel|sweden)/i.test(text) &&
        text.length <= 180 && /\b(?:and|,)\b/.test(text) ? expandAuthorLine(text) : [];
      return [...recovered, ...nameOnly];
    })
    .filter((name) => !/[{}@\[\]]/.test(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      // A malformed affiliation node can otherwise be mistaken for an
      // author row (e.g. `Research Director ...` or `Industrial Design`).
      !/\b(?:research director|education services|human factors|ergonomics|industrial design|interactive computing|comprehensive interdisciplinary)\b/i.test(name));
  for (const name of affiliationAuthorNames) {
    if (!authorNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      authorNames.push(name);
    }
  }
  // When the native PDF flattened a complete author/affiliation masthead into
  // affiliation nodes, recover the names and clean institution tails for the
  // public projection. Keep canonical nodes untouched so resolver evidence and
  // source traceability remain available.
  if (authorNames.length === 0) {
    // A few report/book templates flatten a single author, role, and
    // institution into one affiliation node (for example
    // `1Murali Krishna Pasupuleti 1Research Director 1National Education
    // Services`). Recover the person only when a role marker and an
    // institution-shaped tail are both present; this keeps ordinary
    // affiliation prose from becoming an author.
    const flattenedSingleAuthor = affiliationNodes.flatMap((node) => {
      const text = (node.text ?? "").replace(/\s+/g, " ").trim();
      const match = text.match(/^\d?\s*([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4})\s+\d?\s*(?:research director|professor|associate professor|assistant professor|researcher|author)\s+\d?\s*(.+)$/iu);
      if (!match || !/\b(?:university|institute|department|school|services|college|laboratory|center|centre|hospital)\b/i.test(match[2])) return [];
      return [{ author: match[1].trim(), affiliation: match[2].trim() }];
    });
    if (flattenedSingleAuthor.length > 0) {
      authorNames.push(flattenedSingleAuthor[0].author);
      affiliations.splice(0, affiliations.length, ...flattenedSingleAuthor.map((pair, index) => ({
        id: `recovered-single-author-affiliation-${index}`,
        name: normalizeAffiliationName(pair.affiliation),
      })));
    }
    const recovered = affiliationNodes.flatMap((node) => [
      ...splitFlattenedMasthead(node.text ?? ""),
      ...splitAffiliationNamePrefix(node.text ?? ""),
    ]);
    if (authorNames.length === 0 && recovered.length >= 2) {
      authorNames.push(...recovered.map((pair) => pair.author));
      affiliations.splice(0, affiliations.length, ...recovered.map((pair, index) => ({
        id: `recovered-affiliation-${index}`,
        name: normalizeAffiliationName(pair.affiliation),
      })));
    }
  }
  const doiMatch = canonical.nodes
    .map((node) => node.text ?? "")
    .join("\n")
    .match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];

  const childOf = canonical.relations.filter((r) => r.kind === "CHILD_OF");
  const parentByHeading = new Map<string, string>();
  for (const rel of childOf) {
    parentByHeading.set(rel.from, rel.to);
  }

  const sectionIdByHeading = new Map<string, string>();
  const sections: Section[] = [];
  const blocks: PaperBlock[] = [];
  let currentSectionId: string | null = null;
  let currentKind: NormalizedSectionKind | null = null;
  let blockOrder = 0;
  let sectionOrder = 0;

  const usedIds = new Set<string>();
  // Synthetic figure/table region nodes have no source text and are represented
  // by their caption block.  Text-bearing table candidates, however, are
  // native aligned grids (including captionless tables) and must remain
  // visible as table blocks instead of being sent through paragraph logic.
  const skip = new Set(["header", "footer", "title", "copyright", "author", "affiliation", "figure", "table"]);

  const readable = canonical.nodes.filter((n) => {
    if (skip.has(n.role)) return n.role === "table" && Boolean(n.text);
    // `other` is normally retained because it may contain useful native text,
    // but a resolver-selected vector/chart label cluster is text painted inside
    // a figure. Sending that flattened label stream to translation creates a
    // guaranteed model-quality failure; the figure/caption projection carries
    // the visible region instead.
    if (n.role === "other" && n.evidence.some((entry) =>
      entry.label === "vector-figure-label-cluster" || entry.label === "repeated-numeric-chart-label" ||
      entry.label === "image-overlap-label-cluster"
    ) && !isLikelyNarrativeText(n.text ?? "")) return false;
    return true;
  });
  const fallbackIds = readable.map((n) => n.id);
  const orderedIds =
    topologicalOrder(fallbackIds, canonical.relations) ?? fallbackIds;
  const nodeById = new Map(canonical.nodes.map((n) => [n.id, n]));
  const orderedNodes = orderedIds
    .map((id) => nodeById.get(id))
    .filter((n): n is CanonicalNode => Boolean(n));
  const projectionNodes = projectionNodesWithContinuations(orderedNodes, canonical, layoutBlocks);

  const pushBlock = (
    node: CanonicalNode,
    layout: LayoutBlock | undefined,
    partial: Omit<PaperBlock, "id" | "paperId" | "order" | "extractionConfidence">
  ) => {
    const pageLayout = layouts.find((l) => l.page === node.pageStart);
    const scored = layout
      ? scoreLayoutBlock(layout, pageLayout)
      : { score: node.confidence, diagnostics: canonical.diagnostics };
    blocks.push({
      id: uniqueId(
        stableBlockId({
          type: partial.type,
          page: node.pageStart,
          text: node.text ?? "",
          bbox: node.boundingBoxes[0],
        }),
        usedIds
      ),
      paperId,
      order: blockOrder++,
      extractionConfidence: scored.score,
      ...partial,
      metadata: {
        ...partial.metadata,
        extractionDiagnostics: {
          columnConfidence: scored.diagnostics.columnConfidence,
          readingOrderConfidence: scored.diagnostics.readingOrderConfidence,
          unicodeConfidence: scored.diagnostics.unicodeConfidence,
          paragraphConfidence: scored.diagnostics.paragraphConfidence,
          layoutConfidence: canonical.diagnostics.layoutConfidence,
          textIntegrityConfidence: canonical.diagnostics.textIntegrityConfidence,
          semanticConfidence: canonical.diagnostics.semanticConfidence,
          formatConfidence: canonical.diagnostics.formatConfidence,
          relationConfidence: canonical.diagnostics.relationConfidence,
        },
        evidence: node.evidence,
        sourceAnchor: node.sourceAnchor,
        canonicalNodeId: node.id,
      },
    });
  };

  for (const { node, layout } of projectionNodes) {
    const boxes =
      node.boundingBoxes.length > 0
        ? node.boundingBoxes
        : layout
          ? layout.lines.map((line) => line.bbox)
          : [];
    const column = node.column ?? layout?.column ?? "single";

    const nativeGrid = node.role === "table" && node.text &&
      !/[!?;]|[.]\s*(?:[A-Za-z]|$)/.test(node.text) &&
      !/^[\s]*(?:algorithm|require)\b/i.test(node.text) &&
      !/[∑∫√≤≥≈‖αβγδθλμσΩˆ]/u.test(node.text) &&
      ((layout && layout.lines.length >= 3 &&
        layout.lines.filter((line) => line.items.length >= 2).length >= 3) ||
        // Rotated tables are commonly emitted as one native line per visual
        // row, so each candidate has fewer layout lines than a horizontal
        // grid. Require several rotated items and numeric density before
        // projecting it as a skipped table block.
        (layout && layout.lines.length >= 1 &&
          layout.lines.flatMap((line) => line.items)
            .filter((item) => Math.abs(item.rotation ?? 0) >= 45).length >= 6 &&
          ((node.text.match(/\d/g) ?? []).length / Math.max(node.text.length, 1)) >= 0.35 &&
          node.boundingBoxes.length >= 2) ||
        // Resolver-selected table nodes may not have a layout lookup after
        // enrichment; retain the same numeric/provenance safeguards using
        // canonical boxes alone.
        (!layout && node.boundingBoxes.length >= 2 &&
          ((node.text.match(/\d/g) ?? []).length / Math.max(node.text.length, 1)) >= 0.35) ||
        // Candidate-to-layout lookup can be unavailable after resolver
        // enrichment; multiple native line boxes remain a conservative grid
        // provenance signal in that case.
        node.boundingBoxes.length >= 3 ||
        (layout && layout.lines.length === 1 && layout.lines[0].items.length >= 3 &&
          layout.lines[0].text.trim().split(/\s+/).filter(Boolean).length <= 10 &&
          !/[.!?]\s*$/.test(layout.lines[0].text.trim())) ||
        (node.confidence >= 0.94 && node.boundingBoxes.length === 1 &&
          node.text.trim().split(/\s+/).filter(Boolean).length <= 10 &&
          !/[.!?]\s*$/.test(node.text.trim())));
    if (nativeGrid) {
      const tableText = node.text ?? "";
      const match = tableText.match(/^(?:table|表)\s*(\S+)/i);
      const tableNumber = match
        ? /表/i.test(match[0]) ? `表 ${match[1]}` : `Table ${match[1]}`
        : "Table";
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "table",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: tableText,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: {
          imageUrl: "",
          tableNumber,
          captionOriginal: "",
          captionTranslated: null,
          column,
          figureKey: `table-region-${node.id}`,
        } satisfies TableMetadata & { column: string; figureKey: string },
      });
      continue;
    }

    // A high-confidence table role can still lack enough native cells to
    // construct a grid or crop an image. Keep its extracted text visible as
    // source-only prose instead of silently dropping the node or translating
    // unrelated cells as a fabricated paragraph.
    if (node.role === "table" && node.text) {
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "table",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: node.text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: {
          column,
          role: "table",
          tableSourceFallback: true,
          translationInputWarning: "table-like text preserved in source because a reliable grid was unavailable",
        },
      });
      continue;
    }

    if (node.role === "heading") {
      const text = node.text ?? "";
      if (currentKind === "references" && !isReferencesHeading(text)) {
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: "reference",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: text,
          translated: null,
          translationStatus: "skipped",
          parentBlockId: null,
          metadata: { column, role: "reference" },
        });
        continue;
      }
      const headingText = displayHeadingText(text);
      const level = detectHeadingLevel(
        headingText,
        layout?.lines[0]?.fontSize ?? baseFontSize,
        baseFontSize
      );
      const sectionId = uniqueId(
        `s-${fingerprintText(`${headingText}|${node.pageStart}|${sectionOrder}`)}`,
        usedIds
      );
      const kind = normalizeSection(headingText);
      const parentHeadingId = parentByHeading.get(node.id);
      const parentSectionId = parentHeadingId
        ? (sectionIdByHeading.get(parentHeadingId) ?? null)
        : null;
      const section: Section = {
        id: sectionId,
        paperId,
        parentSectionId,
        order: sectionOrder++,
        level,
        originalTitle: headingText,
        translatedTitle: null,
        normalizedKind: kind,
      };
      sections.push(section);
      sectionIdByHeading.set(node.id, sectionId);
      currentSectionId = sectionId;
      currentKind = kind;
      pushBlock(node, layout, {
        sectionId,
        type: "heading",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: { column, role: "heading" },
      });
      continue;
    }

    if (node.role === "caption") {
      const text = node.text ?? "";
      const layoutRole = layout?.role;
      // Rotated statistical tables may emit the caption title without its
      // `Table N` prefix. The generic resolver records this geometry as
      // rotation-aware-table-caption evidence; preserve it as a table block
      // instead of projecting it as a figure and sending it through image
      // translation.
      const rotationTableCaption = node.evidence.some((evidence) =>
        evidence.label === "rotation-aware-table-caption"
      );
      if (layoutRole === "table_caption" || rotationTableCaption || /^(?:table|表)\s/i.test(text)) {
        const match = text.match(/^(table|表)\s*(\S+)/i);
        const tableNumber = match
          ? /表/.test(match[1])
            ? `表 ${match[2]}`
            : `Table ${match[2]}`
          : "Table";
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: "table",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: text,
          translated: null,
          translationStatus: rotationTableCaption ? "skipped" : "pending",
          parentBlockId: null,
          metadata: {
            imageUrl: "",
            tableNumber,
            captionOriginal: text,
            captionTranslated: null,
            column,
            figureKey: figureLookupKey(text, node.pageStart),
            captionOf: canonical.relations.find(
              (r) => r.kind === "CAPTION_OF" && r.from === node.id
            )?.to,
          } satisfies TableMetadata & {
            column: string;
            figureKey: string;
            captionOf?: string;
          },
        });
        continue;
      }
      const match = text.match(/^(figure|fig\.?|図)\s*(\d+)/i);
      const figureNumber = match
        ? /図/.test(match[1])
          ? `図 ${match[2]}`
          : `Figure ${match[2]}`
        : "Figure";
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "figure",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "pending",
        parentBlockId: null,
        metadata: {
          imageUrl: "",
          captionOriginal: text,
          captionTranslated: null,
          figureNumber,
          column,
          figureKey: figureLookupKey(text, node.pageStart),
          captionOf: canonical.relations.find(
            (r) => r.kind === "CAPTION_OF" && r.from === node.id
          )?.to,
        } satisfies FigureMetadata & {
          column: string;
          figureKey: string;
          captionOf?: string;
        },
      });
      continue;
    }

    if (node.role === "equation") {
      const text = node.text ?? "";
      const num = text.match(/\(\s*(\d{1,2}[a-z]?)\s*\)\s*$/);
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "equation",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: {
          equationNumber: num ? `(${num[1]})` : undefined,
          column,
        } satisfies EquationMetadata & { column: string },
      });
      continue;
    }

    if (node.role === "footnote") {
      const text = node.text ?? "";
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "footnote",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: shouldTranslateParagraph(text) ? "pending" : "skipped",
        parentBlockId: null,
        metadata: { column, role: "footnote" },
      });
      continue;
    }

    if (
      node.role === "paragraph" ||
      node.role === "abstract" ||
      node.role === "reference" ||
      node.role === "other"
    ) {
      const text = node.text ?? "";
      const listParts = splitFlattenedList(text);
      const standaloneListItem = /^(?:[•‣▪∙]|(?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\))\s+/.test(text.trim());
      const isRef = !isNumberedProseListItem(text) &&
        (node.role === "reference" || isReferenceText(text, currentKind));
      const isChartLabel = node.evidence.some(
        (evidence) => evidence.label === "repeated-numeric-chart-label"
      );
      const translationInputWarning =
        isChartLabel
          ? "repeated numeric chart label; kept as source text"
          : isRef || isExpectedNonProseParagraph(text)
          ? null
          : unsafeParagraphStructureReason(text);
      for (const [partIndex, part] of listParts.entries()) {
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: isRef ? "reference" : "paragraph",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: part,
          translated: null,
          translationStatus:
            isChartLabel || isRef || !shouldTranslateParagraph(part) ? "skipped" : "pending",
          parentBlockId: null,
          metadata: {
            column,
            role: node.role,
            translationInputWarning: translationInputWarning ?? undefined,
            flattenedListPart: listParts.length > 1,
            listRole:
              listParts.length > 1
                ? partIndex === 0
                  ? "intro"
                  : "item"
                : standaloneListItem
                  ? "item"
                  : undefined,
          },
        });
      }
    }
  }

  // Native table cells can arrive as separate high-confidence table blocks
  // on one visual baseline. Reconstruct the logical row before exposing
  // PaperBlocks, while leaving sidebar-grid cells (which use distinct
  // vertical baselines or non-table roles) untouched.
  const rowAggregatedBlocks = blocks.reduce<PaperBlock[]>((acc, block) => {
    const last = acc.at(-1);
    const lastBox = last?.boundingBoxes.at(-1);
    const box = block.boundingBoxes[0];
    const sameRow = last?.type === "table" && block.type === "table" && lastBox && box &&
      lastBox.page === box.page && Math.abs(lastBox.y - box.y) <= Math.max(lastBox.height, box.height) * 0.55;
    if (sameRow) {
      const merged = {
        ...last,
        original: `${last.original} ${block.original}`.replace(/\s+/g, " ").trim(),
        boundingBoxes: [...last.boundingBoxes, ...block.boundingBoxes],
        metadata: { ...last.metadata, role: "table", tableSourceFallback: true },
      };
      acc[acc.length - 1] = merged;
    } else {
      acc.push(block);
    }
    return acc;
  }, []);

  // Preserve uncertain cross-column continuations as source-review units.
  // Do not concatenate them without stronger geometry evidence: a preceding
  // prose block ending without terminal punctuation followed by a connective
  // (`which`, `that`, `and`, ...) on the same page is a high-precision signal
  // that the first block is physically incomplete.
  for (let index = 0; index + 1 < rowAggregatedBlocks.length; index++) {
    const current = rowAggregatedBlocks[index];
    const next = rowAggregatedBlocks[index + 1];

    // A complete lead-in sentence can intentionally end in a colon immediately
    // before a separately projected numbered/bulleted list.  The generic
    // incomplete-source guard treats every terminal colon as a damaged PDF
    // fragment, which unnecessarily sends these ordinary introductions to
    // source fallback.  Keep the list items separate, but allow the lead-in to
    // translate as its own grammatical unit when geometry and list evidence
    // agree.  This is document-structure evidence, not a paper-specific rule.
    const currentText = (current.original ?? "").trim();
    const listSuccessor = rowAggregatedBlocks.slice(index + 1, index + 6).find((candidate) =>
      candidate.type === "paragraph" && candidate.metadata.listRole === "item"
    );
    const followsListIntro = current.type === "paragraph" &&
      (next.type === "paragraph" || listSuccessor?.type === "paragraph") &&
      String(current.metadata.translationInputWarning ?? "").includes("末尾") &&
      /:\s*$/.test(currentText) &&
      (next.metadata.listRole === "item" || listSuccessor?.metadata.listRole === "item") &&
      current.pageEnd <= next.pageStart &&
      (listSuccessor?.pageStart ?? next.pageStart) - current.pageEnd <= 1 &&
      !current.metadata.flattenedListPart;
    if (followsListIntro) {
      rowAggregatedBlocks[index] = {
        ...current,
        translationStatus: "pending",
        metadata: { ...current.metadata, translationInputWarning: undefined, listRole: "intro" },
      };
      continue;
    }
    if (
      current.type !== "paragraph" ||
      next.type !== "paragraph" ||
      current.pageEnd !== next.pageStart ||
      current.metadata.translationInputWarning ||
      /[.!?。！？:]\s*$/.test((current.original ?? "").trim()) ||
      !/^(?:which|that|and|or|but|where|while|because|although|including)\b/i.test((next.original ?? "").trim()) &&
      !/^[a-z]/.test((next.original ?? "").trim())
    ) continue;
    const currentBox = current.boundingBoxes[0];
    const nextBox = next.boundingBoxes[0];
    const currentBottom = current.boundingBoxes.reduce((max, box) => Math.max(max, box.y + box.height), 0);
    const currentTop = current.boundingBoxes.reduce((min, box) => Math.min(min, box.y), Number.POSITIVE_INFINITY);
    const nextBottom = next.boundingBoxes.reduce((max, box) => Math.max(max, box.y + box.height), 0);
    const nextTop = next.boundingBoxes.reduce((min, box) => Math.min(min, box.y), Number.POSITIVE_INFINITY);
    const adjacentBand = currentBox && nextBox && nextBox.x > currentBox.x + currentBox.width + 12 &&
      currentTop <= nextBottom && nextTop <= currentBottom;
    if (!adjacentBand) continue;
    rowAggregatedBlocks[index] = {
      ...current,
      metadata: {
        ...current.metadata,
        translationInputWarning: "後続ブロックが前段の文を継続している可能性があります",
      },
    };
  }

  const extractedTitleText = titleNode?.text?.trim() ?? "";
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
  const titleLooksCorrupt = repeatedGlyphRun || titleHasFlattenedAuthorTail;
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
  const titleForProjection = titleLooksCorrupt ? citationTitleFallback : extractedTitleText;
  const paper: Paper = {
    id: paperId,
    sourceFilePath: input.filePath,
    sourceFileName: input.filePath,
    sourceStoredPath: null,
    sourceFileHash: input.fileHash,
    titleOriginal: pickPaperTitle(input.metadata.title, titleForProjection),
    titleTranslated: null,
    authors:
      authorNames.length > 0
        ? authorNames
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

  const reconciled = input.previousBlocks?.length
    ? reconcileBlockIds(input.previousBlocks, rowAggregatedBlocks).blocks
    : rowAggregatedBlocks;
  const annotatedBlocks = reconciled.map((block) =>
    block.translationStatus === "skipped"
      ? { ...block, metadata: { ...block.metadata, translationOutcome: "structural_skip" } }
      : block
  );

  return { paper, sections, blocks: annotatedBlocks };
}
