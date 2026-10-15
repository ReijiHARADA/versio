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
  looksLikeAuthorsOnlyReferenceStub,
  looksLikeConferenceRunningHeader,
  looksLikeYearTitleReferenceContinuation,
} from "../../citations";
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

type ProjectedTableCell = { text: string; x: number; width: number };

type TableColumnCandidate = {
  block: PaperBlock;
  layout: LayoutBlock;
  top: number;
  bottom: number;
};

/**
 * Some PDFs emit a borderless table one visual column at a time: each column
 * is a multi-line native block with the same vertical span.  Leaving those
 * blocks independent makes the Reader show `Finger Thumb ...` and
 * `Function Call ...` as unrelated source cards.  This joins only the narrow
 * case where native geometry proves a shared row structure; ordinary
 * paragraphs and conventional multi-cell rows are deliberately excluded.
 */
function mergeParallelTableColumns(
  blocks: PaperBlock[],
  layoutBlocks: LayoutBlock[]
): PaperBlock[] {
  const layoutFor = (block: PaperBlock) => layoutBlocks.find((layout) =>
    layout.pageStart === block.pageStart && layout.text === (block.original ?? "")
  );
  const candidateFor = (block: PaperBlock): TableColumnCandidate | null => {
    const caption = String(block.metadata.captionOriginal ?? "").trim();
    // Caption-bearing blocks own a separate reader surface. Only merge
    // captionless native-grid columns; these are the blocks that otherwise
    // degrade into parallel flattened strings.
    if (block.type !== "table" || caption) return null;
    const layout = layoutFor(block);
    if (!layout || layout.lines.length < 3 || !layout.lines.every((line) => line.items.length === 1)) {
      return null;
    }
    const top = Math.min(...layout.lines.map((line) => line.bbox.y));
    const bottom = Math.max(...layout.lines.map((line) => line.bbox.y + line.bbox.height));
    return { block, layout, top, bottom };
  };
  const compatible = (left: TableColumnCandidate, right: TableColumnCandidate) => {
    if (left.block.pageStart !== right.block.pageStart ||
      left.block.pageEnd !== right.block.pageEnd ||
      left.block.metadata.column !== right.block.metadata.column ||
      left.layout.lines.length !== right.layout.lines.length) return false;
    const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
    const shorter = Math.min(left.bottom - left.top, right.bottom - right.top);
    if (overlap < shorter * 0.82) return false;
    const leftRight = left.layout.bbox.x + left.layout.bbox.width;
    const gap = right.layout.bbox.x - leftRight;
    if (gap < -2 || gap > 140) return false;
    return left.layout.lines.every((line, index) => {
      const peer = right.layout.lines[index];
      return Math.abs(line.bbox.y - peer.bbox.y) <= Math.max(line.bbox.height, peer.bbox.height) * 0.8 + 2;
    });
  };

  const merged: PaperBlock[] = [];
  for (let index = 0; index < blocks.length;) {
    const first = candidateFor(blocks[index]);
    if (!first) {
      merged.push(blocks[index++]);
      continue;
    }
    const columns = [first];
    let cursor = index + 1;
    while (cursor < blocks.length) {
      const next = candidateFor(blocks[cursor]);
      if (!next || !compatible(columns.at(-1)!, next)) break;
      columns.push(next);
      cursor += 1;
    }
    if (columns.length === 1) {
      merged.push(blocks[index++]);
      continue;
    }
    const rows: ProjectedTableCell[][] = columns[0].layout.lines.map((_, rowIndex) =>
      columns.flatMap((column) => column.layout.lines[rowIndex].items.map((item) => ({
        text: item.text.trim(),
        x: item.x,
        width: item.width,
      }))).filter((cell) => cell.text.length > 0).sort((a, b) => a.x - b.x)
    );
    const firstBlock = columns[0].block;
    merged.push({
      ...firstBlock,
      original: rows.map((row) => row.map((cell) => cell.text).join(" ")).join(" "),
      boundingBoxes: columns.flatMap((column) => column.block.boundingBoxes),
      metadata: {
        ...firstBlock.metadata,
        role: "table",
        tableSourceFallback: true,
        tableRows: rows,
        parallelColumnsMerged: columns.length,
      },
    });
    index = cursor;
  }
  return merged;
}

type TableRowCandidate = {
  block: PaperBlock;
  cells: ProjectedTableCell[];
  top: number;
  bottom: number;
};

/**
 * Borderless tables are frequently emitted as one canonical node per physical
 * row. Rendering each one independently creates a stack of tiny table cards,
 * although the repeated native x positions already prove a single grid. Merge
 * only consecutive same-page rows with at least two cells and repeated column
 * origins; prose, lists, captions, and standalone label fragments stay out.
 */
function mergeSequentialTableRows(blocks: PaperBlock[], layoutBlocks: LayoutBlock[]): PaperBlock[] {
  const layoutFor = (block: PaperBlock) => layoutBlocks.find((layout) =>
    layout.pageStart === block.pageStart && layout.text === (block.original ?? "")
  );
  const candidateFor = (block: PaperBlock): TableRowCandidate | null => {
    if (block.type !== "table" || String(block.metadata.captionOriginal ?? "").trim()) return null;
    const metadataRows = Array.isArray(block.metadata.tableRows)
      ? block.metadata.tableRows as ProjectedTableCell[][]
      : null;
    const layout = layoutFor(block);
    const rows = metadataRows?.filter((row) => Array.isArray(row) && row.length > 0) ??
      (layout?.lines.length === 1
        ? [layout.lines[0].items.map((item) => ({ text: item.text.trim(), x: item.x, width: item.width })).filter((cell) => cell.text)]
        : []);
    if (rows.length !== 1 || rows[0].length < 2) return null;
    const boxes = block.boundingBoxes;
    if (!boxes.length) return null;
    return {
      block,
      cells: [...rows[0]].sort((a, b) => a.x - b.x),
      top: Math.min(...boxes.map((box) => box.y)),
      bottom: Math.max(...boxes.map((box) => box.y + box.height)),
    };
  };
  const sameGrid = (rows: TableRowCandidate[]) => {
    if (rows.length < 3) return false;
    const xCounts = new Map<number, number>();
    for (const row of rows) {
      for (const x of new Set(row.cells.map((cell) => Math.round(cell.x / 12) * 12))) {
        xCounts.set(x, (xCounts.get(x) ?? 0) + 1);
      }
    }
    return [...xCounts.values()].filter((count) => count >= 2).length >= 2;
  };
  const compatible = (previous: TableRowCandidate, next: TableRowCandidate) =>
    previous.block.pageStart === next.block.pageStart &&
    previous.block.pageEnd === next.block.pageEnd &&
    previous.block.metadata.column === next.block.metadata.column &&
    next.top - previous.bottom >= -3 && next.top - previous.bottom <= 30;

  const merged: PaperBlock[] = [];
  for (let index = 0; index < blocks.length;) {
    const first = candidateFor(blocks[index]);
    if (!first) {
      merged.push(blocks[index++]);
      continue;
    }
    const rows = [first];
    let cursor = index + 1;
    while (cursor < blocks.length) {
      const next = candidateFor(blocks[cursor]);
      if (!next || !compatible(rows.at(-1)!, next)) break;
      rows.push(next);
      cursor += 1;
    }
    if (!sameGrid(rows)) {
      merged.push(...blocks.slice(index, cursor));
      index = cursor;
      continue;
    }
    const firstBlock = first.block;
    const tableRows = rows.map((row) => row.cells);
    merged.push({
      ...firstBlock,
      original: tableRows.map((row) => row.map((cell) => cell.text).join(" ")).join(" "),
      pageEnd: Math.max(...rows.map((row) => row.block.pageEnd)),
      boundingBoxes: rows.flatMap((row) => row.block.boundingBoxes),
      metadata: {
        ...firstBlock.metadata,
        role: "table",
        tableSourceFallback: true,
        tableRows,
        sequentialRowsMerged: rows.length,
      },
    });
    index = cursor;
  }
  return merged;
}

function separateSwallowedAffiliation(text: string): string {
  // Some IEEE layouts emit the author row and the institution as one native
  // line. Preserve an all-caps author suffix after the institution while
  // dropping the institution from author projection. This is deliberately
  // geometry-independent and only fires on an institution keyword followed
  // by a comma-bounded all-caps name run.
  const institution = text.search(/(?:faculty|department|school|university|institute|college|hospital|laboratory)/i);
  if (institution < 0) return text;
  const prefix = text.slice(0, institution).replace(/[\s,]+$/, "").trim();
  const suffixMatch = text.match(/,\s*((?:AND\s+)?[A-Z][A-Z'’.-]*(?:\s+[A-Z][A-Z'’.-]*){1,8})\s*$/);
  if (prefix && suffixMatch) return `${prefix}, ${suffixMatch[1]}`;
  return prefix || text;
}

function extractSwallowedAffiliation(text: string): string | undefined {
  const institution = text.search(/(?:faculty|department|school|university|institute|college|hospital|laboratory)/i);
  if (institution < 0) return undefined;
  const tail = text.slice(institution)
    .replace(/,\s*((?:AND\s+)?[A-Z][A-Z'’.-]*(?:\s+[A-Z][A-Z'’.-]*){1,8})\s*$/, "")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
  return tail.length >= 20 ? tail : undefined;
}

function extractAffiliationStatements(text: string): string[] {
  if (!/(?:\bare|\bis)\s+with\s+/i.test(text) ||
      !/\b(?:university|department|school|faculty|institute|hospital|laboratory|college)\b/i.test(text)) return [];
  // IEEE and similar publishers sometimes put several `X is/are with ...`
  // clauses in one native paragraph. Split only at a new person-shaped clause;
  // ordinary prose containing "is with" is left untouched by the institution
  // guard above and the minimum-length check below.
  const clauses = text.replace(/\s+/g, " ").trim().split(/\s+(?=[A-Z](?:\.?\s*[A-Z][\p{L}'’-]*){0,5}\s+(?:is|are)\s+with\b)/u);
  return clauses.map((clause) => {
    const start = clause.search(/(?:\bare|\bis)\s+with\s+/i);
    if (start < 0) return "";
    return clause.slice(start).replace(/^(?:are|is)\s+with\s+/i, "")
      .replace(/\s*\((?:corresponding author|e-?mail)[\s\S]*$/i, "")
      .replace(/\s+/g, " ").trim();
  }).filter((value) => value.length >= 30 && /\b(?:university|department|school|faculty|institute|hospital|laboratory|college)\b/i.test(value));
}

function expandAuthorLine(text: string): string[] {
  const separatedSource = separateSwallowedAffiliation(text);
  // Bilingual mastheads commonly encode `栗原 勇太 小竹 元基
  // Kurihara Yuta Shino Motoki`. Preserve the CJK token boundaries while a
  // Latin romanization is present; otherwise normalization turns four names
  // into two opaque strings and drops the Japanese author identities.
  // CJK-only rows keep the historical glyph-span normalization.
  const sourceWithoutAffiliation = /[A-Za-z]/.test(separatedSource)
    ? separatedSource
    : separatedSource.replace(/([\u3040-\u30ff\u4e00-\u9fff])\s+(?=[\u3040-\u30ff\u4e00-\u9fff])/g, "$1");
  const markedSource = sourceWithoutAffiliation.replace(/^\s*and\s+/i, "").replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ").replace(/\s+/g, " ").trim();
  const cleaned = sourceWithoutAffiliation
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
  const initialUppercaseNames = [...cleaned.matchAll(/\b[A-Z][A-Z'’-]+(?:\s+[A-Z]\.){1,3}\s+[A-Z][A-Z'’-]+/g)]
    .map((match) => match[0].trim());
  const uppercaseAuthorNames = [...new Set([...initialUppercaseNames, ...uppercaseNames])]
    .map((name) => name.replace(/^AND\s+/i, "").trim());
  if (uppercaseAuthorNames.length >= 2 || (uppercaseAuthorNames.length === 1 && /[,·]/.test(cleaned))) {
    return uppercaseAuthorNames;
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
    // Keep the institution text that follows an inline editor/reviewer label;
    // only the label itself is metadata. A later person-shaped-tail rule
    // removes reviewer names when they precede an institution.
    .replace(/\b(?:edited|reviewed)\s+by\s*:\s*/i, "")
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
    // A superscript marker can be flattened at the end of a wrapped
    // affiliation line. It is metadata, not part of the institution name.
    .replace(/[,;\s]+\d{1,2}\s*$/, "")
    // A marker can be emitted immediately before the second half of a
    // wrapped `Faculty of Arts and Science` line. Drop only that marker.
    .replace(/\b\d{1,2}\s+(?=and\s+Science\b)/gi, "")
    // Column interleaving can insert a country-only token between an
    // institution's `University of` and its city. Remove only this
    // country-shaped artifact; ordinary institution names remain untouched.
    .replace(/\bUniversity\s+of\s+(?:the\s+)?(?:United\s+States|Australia|Canada|Brazil|China|Japan|Germany|France|Italy|India|Netherlands)\s+(?=[A-Z][a-z])/i, "University of ")
    // Native PDF text sometimes loses spaces at font-run boundaries
    // (e.g. `IowaStateUniversity` or `ofEvents`). Restore only a lower-to-
    // upper transition; this cannot split ordinary all-caps institution names.
    .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/^[*†‡§☯\s]+/, "")
    .replace(/^the\s+/i, "")
    .trim());
}

function affiliationKey(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** Split numbered institutions that a native stream flattened into one
 * affiliation string. Restrict the boundary to an explicit superscript-like
 * number immediately before an institution phrase; ordinary street numbers
 * and years therefore remain part of the affiliation. */
function splitNumberedAffiliationParts(name: string): string[] {
  const normalized = normalizeAffiliationName(name);
  const parts = normalized
    .split(/(?=\b\d{1,2}\s*(?=(?:research|graduate|faculty|department|university|school|center|centre|institute|laboratory|national|college|hospital)\b))/giu)
    .map((part) => normalizeAffiliationName(part.replace(/^\d{1,2}\s*/, "")))
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => !/\b(?:research|graduate|faculty|department|university|school|center|centre|institute|laboratory|national|college|hospital)\b/i.test(part))) {
    return [normalized];
  }
  return parts;
}

function splitReviewAffiliationStream(name: string): string[] {
  if (name.length < 180) return [name];
  const parts = name.split(/(?=\b(?:NIH|Applied|National)\b|\d+\s*Laboratory\b|\bLaboratory\s+of\b)/i)
    .map((part) => part.replace(/^\s*[,;]\s*/, "").trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [name];
}

/**
 * Some journal mastheads flatten a reviewer/editor's institution in front of
 * the authors' numbered affiliations. When the next segment clearly starts
 * an organisational unit, the leading university/college segment is the
 * reviewer prefix rather than part of the author affiliation stream.
 */
function removeReviewerInstitutionPrefix(name: string): string {
  if (/^(?:University|College|Hospital|Institute)\s+[^,]{3,},\s*(?:United\s+States|United\s+Kingdom|Canada|Australia|Brazil|Japan|China|Germany|France|Italy|Spain|Netherlands)\s+[A-Z][\p{Ll}'’-]+(?:\s+[A-Z][\p{Ll}'’-]+){1,2},?$/u.test(name.trim())) return "";
  const reviewerTail = name.match(/^(?:University|College|Hospital|Institute)\s+[^,]{3,},\s*(?:United\s+States|United\s+Kingdom|Canada|Australia|Brazil|Japan|China|Germany|France|Italy|Spain|Netherlands)\s+[A-Z][\p{Ll}'’-]+(?:\s+[A-Z][\p{Ll}'’-]+){1,2},\s+(?=(?:NIH|Applied|Laboratory|Department|School|Faculty|National|Research|Center|Centre|Institute|University|College|Hospital)\b)(.+)$/u);
  if (reviewerTail?.[1]) return reviewerTail[1].trim();
  const match = name.match(/^(?:University|College|Hospital|Institute)\s+[^,]{3,},\s+(?=(?:applied|department|school|faculty|laboratory|lab|research|national|center|centre|institute|hospital|college|university)\b)(.+)$/i);
  return match?.[1]?.trim() || name;
}

function appendAffiliation(affiliations: Array<{ id: string; name: string }>, candidate: { id: string; name: string }): void {
  const candidateName = normalizeAffiliationName(candidate.name);
  if (candidateName.length < 20) return;
  const candidateKey = affiliationKey(candidateName);
  const existingIndex = affiliations.findIndex((item) => {
    const existingKey = affiliationKey(item.name);
    return existingKey === candidateKey || existingKey.startsWith(candidateKey) || candidateKey.startsWith(existingKey);
  });
  if (existingIndex < 0) {
    affiliations.push({ ...candidate, name: candidateName });
    return;
  }
  if (candidateName.length > affiliations[existingIndex].name.length) {
    affiliations[existingIndex] = { ...candidate, name: candidateName };
  }
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
  // A native stream can omit the separator before the institution
  // (`ABBASFaculty of Computing ...`). Insert a boundary only before a
  // known institution lead, then apply the same strict all-caps name rule.
  const normalized = text.replace(/([A-Z])(?=(?:Faculty|Department|School|University|Institute|College|Hospital|Laboratory)\b)/g, "$1, ");
  const match = normalized.match(/^\s*((?:[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+){1,4})(?:\s+and\s+(?:[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+){1,4}))?)\s*,\s*(.+)$/);
  if (!match || !/(?:university|institute|department|school|college|hospital|laboratory|research council|pisa|italy|usa)/i.test(match[2])) return [];
  const affiliation = match[2].replace(/,\s*((?:[A-Z][A-Z'’-]+\s+){1,6}[A-Z][A-Z'’-]+)\s*$/u, "").trim();
  const tailAuthor = match[2].match(/,\s*((?:[A-Z][A-Z'’-]+\s+){1,6}[A-Z][A-Z'’-]+)\s*$/u)?.[1];
  const names = [...match[1].split(/\s+and\s+/i).map((name) => name.trim()), ...(tailAuthor ? [tailAuthor.trim()] : [])].filter(Boolean);
  if (!names.length) return [];
  return names.map((author) => ({ author, affiliation }));
}

/** Recover title-case author names flattened into an affiliation row.
 * Legacy proceedings commonly emit `First Last and First M. Last
 * Institution/Research Center` as one native line. Require a complete
 * person-shaped prefix and an institution-shaped tail so ordinary prose or
 * a location-only masthead cannot become an author. */
function splitTitleCaseAffiliationPrefix(text: string): MastheadPair[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const person = `[A-Z][\\p{Ll}'’-]+(?:\\s+[A-Z]\\.)?\\s+[A-Z][\\p{Ll}'’-]+`;
  const match = normalized.match(new RegExp(`^((?:${person})(?:\\s+and\\s+(?:${person}))?)\\s+(.+\\b(?:research\\s+center|university|department|faculty|school|institute|college|hospital|laboratory|centre|center)\\b.*)$`, "iu"));
  if (!match) return [];
  const affiliation = match[2].trim();
  if (affiliation.length < 12) return [];
  return match[1].split(/\s+and\s+/i).map((author) => ({ author: author.trim(), affiliation }));
}

/** Split flattened bullet lists into independent canonical blocks. */
export function splitFlattenedList(text: string): string[] {
  // Academic PDFs often encode bullet lists as en/em dashes rather than a
  // dedicated bullet glyph. Repeated dash markers are treated as list
  // boundaries; a single inline dash remains ordinary prose.
  const markers = [...text.matchAll(/(?:^|\s)([•‣▪∙–—])\s+/g)].map((m) =>
    m.index === undefined ? -1 : (m.index + (m[0].startsWith(" ") ? 1 : 0))
  ).filter((i) => i >= 0);
  // Numbered markers inside a normal sentence (`... includes 1) and 2) ...`)
  // are inline text, not list boundaries. Only split markers at a physical
  // line start; this preserves prose and citation numbering.
  const numbered = [...text.matchAll(/(?:^|\n)\s*((?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\))\s+/g)]
    .map((m) => (m.index === undefined ? -1 : m.index + m[0].search(/(?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\)/)))
    .filter((i) => i >= 0);
  const starts = markers.length >= 2 ? markers : numbered;
  if (starts.length < 2) return [text];
  const first = starts[0];
  const prefix = text.slice(0, first).trim();
  // Paired en/em dashes inside a sentence (`... an – at first ... –
  // physical piece`) are parenthetical punctuation, not list markers. Only
  // treat dash runs as lists when they start after an explicit list lead-in.
  if (markers.length >= 2 && markers.every((index) => /[–—]/u.test(text[index])) &&
      first > 0 && !prefix.endsWith(":")) return [text];
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
    // A numbered checklist/principles paragraph can appear immediately before
    // the bibliography on the same page. It is not a reference merely because
    // the section state has already crossed a reordered heading.
    if (isNumberedProseListItem(trimmed) &&
        !/\b(?:19|20)\d{2}\b/.test(trimmed.slice(0, 180)) &&
        !/\b(?:doi\s*:|https?:\/\/|journal|proceedings|conference|in\s+proc\.)\b/i.test(trimmed)) {
      return false;
    }
    if (/^(?:acknowledg(?:e)?ments?|author contributions?|competing interests?|publisher(?:'|’)?s note|data availability|ethics statement|supplementary information|additional information|license(?:,|\s)|open access)(?:\b|\s|$)|^©/i.test(trimmed)) {
      return false;
    }
    const hasYear = /\b(?:19|20)\d{2}[a-z]?\b/.test(trimmed);
    // Author-year bibliographies commonly have no numeric prefix, DOI, or
    // literal "journal" token. Inside an explicit References section, the
    // author list + parenthesized year is strong entry evidence. Requiring
    // it at the start avoids hiding ordinary prose with an inline citation.
    const authorYearEntry =
      /^[A-ZÀ-ÖØ-Ý][^\n]{1,180}\((?:19|20)\d{2}[a-z]?\)[.,]?\s+\S/u.test(trimmed);
    const numberedEntry = /^(?:\[\d+\]|\d+[.)])\s+\S/.test(trimmed) &&
      trimmed.split(/\s+/).filter(Boolean).length >= 3;
    // A page/volume tail may be detached at a physical page/column boundary,
    // followed by one or more bibliography entries in the same native block.
    // Preserve it as reference material so the later coalescer can reattach
    // short tails without sending them to translation.
    const referenceContinuation =
      /^(?:\d+(?:\(\d+\))?,\s*)?\d+\s*[–—-]\s*\d+(?:\s*\((?:19|20)\d{2}[a-z]?\))?\.(?:\s|$)/.test(trimmed);
    const embeddedAuthorYear =
      /(?:^|[.!?]\s+)[A-ZÀ-ÖØ-Ý][^\n]{1,140}\((?:19|20)\d{2}[a-z]?\)[.,]?\s+\S/u.test(trimmed);
    const hasBibliographicShape =
      numberedEntry ||
      referenceContinuation ||
      authorYearEntry ||
      embeddedAuthorYear ||
      /\b(?:doi\s*:|https?:\/\/|journal|proceedings|conference|in\s+proc\.?|catalog(?:ue)?|university press|publisher|thesis|dissertation|出版社|大学紀要)\b/i.test(trimmed);
    // A long sentence containing an inline year is usually body prose with a
    // citation, not a bibliography record.  Keep it visible for translation.
    if (!numberedEntry && !referenceContinuation && !authorYearEntry && !embeddedAuthorYear &&
        trimmed.length > 180 && /[.!?]\s*$/.test(trimmed) && hasYear) return false;
    return hasBibliographicShape;
  }
  // A numbered list item is not a bibliography entry. Outside an explicit
  // References section, require citation-shaped evidence such as a year.
  return /^\[\d+\]/.test(text) ||
    (/^\d+\.\s+[A-Z][a-z]+,?\s+[A-Z]/.test(text) && /\b(?:19|20)\d{2}\b/.test(text));
}

function isPublicationLegalMetadata(text: string): boolean {
  const trimmed = text.trim();
  return /^©\s*(?:the\s+author|\d{4})/i.test(trimmed) ||
    /^publisher(?:'|’)?s note:\s+.*\bjurisdictional claims\b/i.test(trimmed) ||
    /^license,\s+which permits use,\s+sharing,\s+adaptation,\s+distribution\b/i.test(trimmed) ||
    /^(?:copyright|permission to make digital or hard copies)\b/i.test(trimmed);
}

/** Bibliography entries are rendered as one hanging-indent paragraph. Native
 * PDF line wraps are physical layout, so normalize them before persistence;
 * retain an intentional hyphen while joining a line-break hyphenation. */
function normalizeReferenceText(text: string): string {
  return text
    .replace(/([A-Za-z])[-‐‑]\s*\n\s*([a-z])/g, "$1$2")
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isStandaloneContactMetadata(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i.test(trimmed)) return false;
  const withoutEmails = trimmed.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi, " ");
  return /^[\s\d,*†‡§∗·,;:()[\]{}]+$/u.test(withoutEmails);
}

/**
 * Superscript affiliation markers can survive PDF extraction as a standalone
 * text run (for example `1,2,3,4`) between the masthead and ABSTRACT.  It is
 * metadata belonging to the author/affiliation projection, never readable
 * paper content, so it must not become a paragraph translation unit.
 */
function isStandaloneAffiliationMarkerRun(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/\d/.test(trimmed)) return false;
  const markers = trimmed.replace(/[\d,*†‡§∗·,;:()[\]{}\s]+/gu, "");
  return markers.length === 0 && (trimmed.match(/\d+/g)?.length ?? 0) >= 2;
}

/** A lone short number in an `other` node is a running page marker, not paper prose. */
function isStandalonePageNumber(text: string, role: CanonicalNode["role"]): boolean {
  // Native PDF resolvers disagree on whether a running footer is `other` or
  // a low-confidence paragraph.  A bare short number has no readable prose
  // value; preserve numeric tables/headings, but never expose this marker as
  // a translation unit.
  return role !== "table" && role !== "heading" && /^\d{1,3}$/.test(text.trim());
}

/** Region membership can paint chart-adjacent prose with role=table. */
function looksLikeProseMistakenForTable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(?:table|表)\s*\d+/i.test(trimmed)) return false;
  if (/[√✓☑☒\u3400-\u9fff]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const digitRatio = digits / Math.max(letters + digits, 1);
  // Lowercase letter-only fragments ("were", "perceived", "between") are
  // chart-adjacent prose, not cell headers like "Thumb" / "Finger 1".
  if (digits === 0 && letters >= 3 && words.length <= 4 && /^[a-z]/.test(trimmed)) {
    return true;
  }
  // Caption continuations glued after a mid-sentence period, without cells.
  if (
    digits === 0 &&
    /[.!?;]\s+[A-Z]/.test(trimmed) &&
    words.length >= 5 &&
    words.length <= 20
  ) {
    return true;
  }
  // Sentence adverbs mistaken for a one-cell row ("Similarly").
  if (digits === 0 && words.length === 1 && /ly$/i.test(trimmed) && letters >= 6) {
    return true;
  }
  // Broken caption crumbs next to a matrix ("bolded.", "of visual target…").
  if (
    words.length <= 10 &&
    digitRatio < 0.08 &&
    (/^(?:of|and|the|bolded)\b/i.test(trimmed) || /\bbolded\.?$/i.test(trimmed))
  ) {
    return true;
  }
  // A complete sentence outside a caption-owned table region is body prose
  // even when a neighbouring numeric band supplied table-row geometry.
  // Caption-owned narrative cells are protected by the caller's region check.
  if (words.length >= 10 && /[.!?](?:\s|$)/.test(trimmed) && digitRatio < 0.2) {
    return true;
  }
  // Long narrative sentences that only sit near a matrix. Keep short
  // goal/method cells (often "To find…") and dense numeric rows.
  if (words.length >= 12 && digitRatio < 0.12) {
    const narrativeOpener =
      /^(?:When|Altogether|However|Therefore|In this|We |This |To investigate|To provide)\b/.test(
        trimmed
      );
    const midSentenceGlue = /[.!?]\s+(?:[A-Z]|Thus|However|Therefore)\b/.test(trimmed);
    if (narrativeOpener || (midSentenceGlue && words.length >= 12)) {
      return true;
    }
  }
  return false;
}

/** Chart-axis crumbs should leave the document entirely — not become paragraphs. */
function isChartDebrisFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (digits === 0 && letters >= 2 && words.length <= 4 && /^[a-z]/.test(trimmed)) {
    return true;
  }
  if (digits === 0 && words.length === 1 && /ly$/i.test(trimmed) && letters >= 6) {
    return true;
  }
  if (
    words.length <= 10 &&
    digits / Math.max(letters + digits, 1) < 0.08 &&
    (/^(?:of|and|the|bolded|pairs except)\b/i.test(trimmed) || /\bbolded\.?$/i.test(trimmed))
  ) {
    return true;
  }
  return false;
}

function hasStrongTableMatrixEvidence(node: CanonicalNode): boolean {
  const scoredTable = node.evidence.some((entry) =>
    entry.label === "role-scores" && /table=0\.(?:9[4-9]|[1-9]\d)/.test(entry.reason ?? "")
  );
  // `captioned-neighbor-cell-rows` is emitted from nearby geometry and can
  // also land on a long prose column next to a table. Require an independent
  // high table role score before letting that signal override prose demotion.
  return scoredTable || node.evidence.some((entry) =>
    entry.label === "matrix-axis-label-neighbor" ||
    (entry.label === "captioned-neighbor-cell-rows" && scoredTable) ||
    (entry.label === "captioned-native-multicell-row" && scoredTable)
  );
}

/**
 * The resolver can conservatively settle a native grid as `paragraph` even
 * though the layout still proves a multi-row, multi-column table. Keep this
 * recovery narrow: require the geometry evidence emitted by the table
 * candidate scorer and several actual native rows with multiple cells. This
 * avoids reviving chart labels or ordinary prose that merely sits near a
 * table caption.
 */
function hasStrongNativeTableRows(node: CanonicalNode, layout: LayoutBlock | undefined): boolean {
  if (!layout || layout.lines.length < 3) return false;
  // Dense figure/plot labels can receive the same row geometry signal as a
  // table. Their explicit vector-label evidence takes precedence; keeping
  // them out prevents numeric chart annotations from becoming source-only
  // table cards.
  if (node.evidence.some((entry) => entry.label === "vector-figure-label-cluster" || entry.label === "repeated-numeric-chart-label")) {
    return false;
  }
  const geometry = node.evidence.find((entry) =>
    entry.label === "table-row-geometry" && entry.confidence >= 0.9
  );
  if (!geometry) return false;
  const multiCellRows = layout.lines.filter((line) => line.items.length >= 2).length;
  // A real table cell can contain complete prose (and citation periods), so
  // sentence-like punctuation must not override the native repeated-row
  // geometry.  Chart/axis fragments are excluded above by their explicit
  // vector evidence instead.
  return multiCellRows >= 3;
}

function isNumberedTableCaption(text: string | null | undefined): boolean {
  return /^(?:table|表)\s*\d+/i.test((text ?? "").trim());
}

/**
 * Native PDFs often emit one LayoutBlock per matrix cell. When a numbered
 * Table N caption already owns a CAPTION_OF region (image crop / grid target),
 * those cell crumbs must not also become standalone table blocks. Captionless
 * matrices (e.g. wear-scale) keep their row blocks — this only fires for
 * numbered Table/表 captions with a CAPTION_OF relation.
 */
function captionedTableAbsorption(canonical: CanonicalDocument): {
  keepIds: Set<string>;
  regions: Array<{ caption: CanonicalNode; target: CanonicalNode }>;
} {
  const keepIds = new Set<string>();
  const regions: Array<{ caption: CanonicalNode; target: CanonicalNode }> = [];
  const nodeById = new Map(canonical.nodes.map((node) => [node.id, node]));
  for (const rel of canonical.relations) {
    if (rel.kind !== "CAPTION_OF") continue;
    const caption = nodeById.get(rel.from);
    const target = nodeById.get(rel.to);
    if (!caption || !target || target.role !== "table") continue;
    if (!isNumberedTableCaption(caption.text)) continue;
    const targetHasHighTableScore = target.evidence.some((entry) =>
      entry.label === "role-scores" && /table=0\.(?:9[4-9]|[1-9]\d)/.test(entry.reason ?? "")
    );
    // Resolver region membership can paint an entire neighbouring prose
    // column as a table target. Do not let that weak target absorb the column
    // into a caption-owned table unless its own role evidence is strong.
    if (!targetHasHighTableScore && looksLikeProseMistakenForTable(target.text ?? "")) continue;
    // Keep only substantive CAPTION_OF targets (full rows / grids). A lone
    // cell that won the caption link is still a crumb — the caption block
    // (and image crop) already represent the table.
    if (shouldKeepCaptionedTableTarget(target)) {
      keepIds.add(target.id);
    }
    regions.push({ caption, target });
  }
  return { keepIds, regions };
}

/** A numbered caption only absorbs the cells in its own local visual region.
 * Several independent tables can coexist on a page (often one per column),
 * so page-level suppression drops valid captionless table streams. */
function belongsToCaptionedTableRegion(
  node: CanonicalNode,
  regions: Array<{ caption: CanonicalNode; target: CanonicalNode }>,
): boolean {
  const nodeBox = node.boundingBoxes[0];
  if (!nodeBox) return false;
  return regions.some(({ caption, target }) => {
    if (node.pageEnd < Math.min(caption.pageStart, target.pageStart) ||
        node.pageStart > Math.max(caption.pageEnd, target.pageEnd)) return false;
    if (node.column && target.column && node.column !== target.column) return false;
    const regionBoxes = [...caption.boundingBoxes, ...target.boundingBoxes]
      .filter((box) => box.page === nodeBox.page);
    if (regionBoxes.length === 0) return false;
    const left = Math.min(...regionBoxes.map((box) => box.x));
    const right = Math.max(...regionBoxes.map((box) => box.x + box.width));
    const top = Math.min(...regionBoxes.map((box) => box.y));
    const bottom = Math.max(...regionBoxes.map((box) => box.y + box.height));
    const horizontalOverlap = Math.max(0, Math.min(nodeBox.x + nodeBox.width, right) - Math.max(nodeBox.x, left));
    const verticalDistance = Math.max(top - (nodeBox.y + nodeBox.height), nodeBox.y - bottom, 0);
    return horizontalOverlap >= Math.min(nodeBox.width, right - left) * 0.2 && verticalDistance <= 150;
  });
}

function hasExactSyntheticCaptionRegion(
  node: CanonicalNode,
  canonical: CanonicalDocument,
): boolean {
  if (node.role !== "table" || node.text == null || node.boundingBoxes.length === 0) return false;
  const nodeById = new Map(canonical.nodes.map((candidate) => [candidate.id, candidate]));
  return canonical.relations.some((rel) => {
    if (rel.kind !== "CAPTION_OF") return false;
    const caption = nodeById.get(rel.from);
    const target = nodeById.get(rel.to);
    if (!caption || !target || target.text || !isNumberedTableCaption(caption.text)) return false;
    if (target.boundingBoxes.length !== node.boundingBoxes.length) return false;
    return target.boundingBoxes.every((targetBox) => node.boundingBoxes.some((nodeBox) =>
      nodeBox.page === targetBox.page &&
      Math.abs(nodeBox.x - targetBox.x) <= 1 &&
      Math.abs(nodeBox.y - targetBox.y) <= 1 &&
      Math.abs(nodeBox.width - targetBox.width) <= 1 &&
      Math.abs(nodeBox.height - targetBox.height) <= 1
    ));
  });
}

function shouldKeepCaptionedTableTarget(target: CanonicalNode): boolean {
  const text = (target.text ?? "").trim();
  if (!text) return false;
  // A caption relation can point at the first short header cell of a
  // borderless matrix. Its explicit matrix evidence is stronger than text
  // length: retain it for source-only projection, then let the actual image
  // extraction path replace the complete region when a crop is available.
  if (hasStrongTableMatrixEvidence(target)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 8) return true;
  if ((text.match(/\d/g) ?? []).length >= 6) return true;
  if (/\b(?:Phonebook|Gallery|Method|Goal|Mean|significance|functions?)\b/i.test(text)) {
    return true;
  }
  return false;
}

/** Cell / header crumbs that belong under a numbered table caption. */
function looksLikeCaptionedTableCellFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isNumberedTableCaption(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (/^[\d.<>=≤≥\s,.\-+eE]+$/.test(trimmed)) return true;
  if (/^(?:Thumb|Finger\s*\d)\b/i.test(trimmed) && words.length <= 24) return true;
  if (/^(?:Finger\s*\d\s*)+$/i.test(trimmed)) return true;
  if (digits >= 3 && digits / Math.max(letters + digits, 1) >= 0.25 && words.length <= 36) {
    return true;
  }
  if (words.length <= 4 && !/[.!?]\s*$/.test(trimmed) && letters <= 40) return true;
  return false;
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
  const continuationSourceByNode = new Map(
    canonical.relations
      .filter((relation) => relation.kind === "CONTINUES")
      .map((relation) => [relation.to, relation.from])
  );
  const orderedNodeIds = new Set(orderedNodes.map((node) => node.id));
  const consumed = new Set<string>();
  const projected: Array<{ node: CanonicalNode; layout: LayoutBlock | undefined }> = [];

  for (const sourceNode of orderedNodes) {
    if (consumed.has(sourceNode.id)) continue;
    // Reading-order topological sorting intentionally ignores CONTINUES
    // edges, so a right-column continuation can appear before its unfinished
    // left-column source by y-coordinate. Defer that target until the source
    // is visited; otherwise we would emit the continuation once and then emit
    // a second merged block later.
    const continuationSource = continuationSourceByNode.get(sourceNode.id);
    if (continuationSource && orderedNodeIds.has(continuationSource) && !consumed.has(sourceNode.id)) {
      const sourceAlreadyProjected = projected.some((item) => item.node.id === continuationSource);
      if (!sourceAlreadyProjected) continue;
    }
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
        /^(?:edited by|reviewed by)\b|^(?:specialty section|correspondence)\s*:?$/i.test(candidate.text?.trim() ?? ""))
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
  // Publisher mastheads often put the editor/reviewer credit and the person's
  // name on the same native line (for example `Edited by: ...`).  The label
  // based proximity check above only sees a separate heading node, so keep a
  // small, document-independent exclusion for same-line credits as well.
  const sameLineEditorCredit = (text: string): boolean =>
    /^\s*(?:edited|reviewed)\s+by\b/i.test(text.trim());
  const authorNodes = canonical.nodes.filter((n) => n.role === "author" && n.text &&
    n.pageStart === 1 && (n.boundingBoxes[0]?.y ?? 0) < firstBodyY &&
    !isSidebarChromeNode(n) &&
    !mastheadExcludedByLabel(n) &&
    !sameLineEditorCredit(n.text) &&
    // Long mastheads can contain many marker-separated authors. Keep them
    // eligible for expansion; the marker/separator checks in expandAuthorLine
    // still prevent ordinary prose from becoming an author list.
    n.text.trim().length <= 500 && !/:\s/.test(n.text) &&
    // Contact email is common on author rows; retain a name-shaped prefix
    // even though generic masthead filtering rejects standalone email lines.
    (!isNonAuthorMastheadLine(n.text) ||
      /^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4}\s*[,*]?\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(n.text.trim()) ||
      (/(?:\band|&)\s*$/i.test(n.text.trim()) &&
        (n.text.match(/\b[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 2)) &&
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
    (!isNonAuthorMastheadLine(n.text) ||
      (/(?:\band|&)\s*$/i.test(n.text.trim()) &&
        (n.text.match(/\b[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 2)) &&
      ((n.role === "heading" && n.text.trim().length <= 240 &&
      (n.text.match(/,/g)?.length ?? 0) >= 1 &&
      (n.text.match(/[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 2 &&
      /\d\s*[A-Z]/.test(n.text)) ||
      (/^\s*[·•]\s*[A-Z][^!?]{8,220}$/.test(n.text.trim()) &&
      (n.text.match(/[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+/g)?.length ?? 0) >= 2) ||
      ((n.boundingBoxes[0]?.y ?? 9999) < 390 && n.text.trim().length <= 400 &&
        !/^[a-z]/.test(n.text.trim()) &&
        (n.text.match(/,/g)?.length ?? 0) >= 2 &&
        (n.text.match(/[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?/gu)?.length ?? 0) >= 3 &&
        ((n.text.match(/[A-Z][\p{L}'’-]+/gu)?.length ?? 0) >= 6 ||
          (n.text.match(/,/g)?.length ?? 0) >= 4) &&
        !/[.!?]$/.test(n.text.trim())) ||
      (/\d[*†‡]?/.test(n.text) && n.text.trim().length <= 400 &&
        (n.text.match(/,/g)?.length ?? 0) >= 3 && !/[.!?]$/.test(n.text.trim())) ||
      // A two-column masthead can emit the second author as a same-line
      // paragraph beginning with `and`. Promote only a short name-shaped
      // continuation near the top of page one; ordinary prose is excluded by
      // the strict prefix, length, and punctuation checks.
      ((n.boundingBoxes[0]?.y ?? 9999) < 220 &&
        /^\s*and\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,3}\s*$/u.test(n.text.trim()))));
  // Some two-column journals classify the first half of an italic author row
  // as paragraph text and the next visual line as author. Recover the marked
  // prefix as a source node before projection; the strict marker/count/height
  // checks keep ordinary abstract prose out of this path.
  const markedAuthorParagraphs = canonical.nodes.filter((n) => n.role === "paragraph" && n.text &&
    n.pageStart === 1 && (n.boundingBoxes[0]?.y ?? Infinity) < 390 &&
    !/^(?:keywords?|key words?)\s*:/i.test(n.text.trim()) &&
    !isNonAuthorMastheadLine(n.text) &&
    !/\b(?:university|department|institute|laboratory|laboratories|hospital|consortium|faculty|school|center|centre)\b/i.test(n.text) &&
    n.text.trim().length <= 400 && /\d[*†‡]?/.test(n.text) &&
    (n.text.match(/,/g)?.length ?? 0) >= 3 && !/[.!?]$/.test(n.text.trim()));
  const authorSourceNodes = [...authorNodes, ...authorContinuationNodes, ...markedAuthorParagraphs];
  // Elsevier-like mastheads may split one wrapped author row into several
  // adjacent author nodes (`Jan Egger, Christina` / `Gsaxner, ...`). Merge
  // only contiguous page-1 author nodes in the masthead band; affiliation and
  // body nodes are never crossed.
  const mergedAuthorSources: typeof authorSourceNodes = [];
  for (const node of [...authorSourceNodes].sort((a, b) => {
    const ay = a.boundingBoxes[0]?.y ?? 0;
    const by = b.boundingBoxes[0]?.y ?? 0;
    // PDF floating-point coordinates often differ by tiny fractions despite
    // sharing a baseline; treat those as one visual row and read left-to-right.
    if (Math.abs(ay - by) <= 1) {
      return (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0);
    }
    return ay - by;
  })) {
    const previous = mergedAuthorSources.at(-1);
    const previousBox = previous?.boundingBoxes[0];
    const box = node.boundingBoxes[0];
    const canJoin = previous && previous.role === "author" && node.role === "author" &&
      previous.pageStart === 1 && node.pageStart === 1 &&
      (box?.y ?? Infinity) - (previousBox?.y ?? -Infinity) <= 28 &&
      (box?.y ?? Infinity) < firstBodyY &&
      Math.abs((box?.x ?? 0) - (previousBox?.x ?? 0)) <= 18;
    if (!canJoin) {
      mergedAuthorSources.push(node);
      continue;
    }
    const lines = [previous.text, node.text].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    mergedAuthorSources[mergedAuthorSources.length - 1] = {
      ...previous,
      text: lines,
      boundingBoxes: [...previous.boundingBoxes, ...node.boundingBoxes],
    };
  }
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
  // A narrow masthead column can classify a wrapped institution line as an
  // author because it starts with a capitalized word (for example
  // `Design Cognition and its`). Recover only continuation-shaped author
  // nodes that sit directly beside an already detected affiliation node. This
  // keeps genuine author rows and emails out while preserving the native
  // column geometry for affiliation reconstruction.
  const affiliationContinuationNodes = canonical.nodes.filter((n) => {
    if (n.role !== "author" || !n.text || n.pageStart !== 1 || n.text.length > 120) return false;
    const box = n.boundingBoxes[0];
    const y = box?.y ?? Infinity;
    const x = box?.x ?? Infinity;
    if (y >= firstBodyY || /@|\d/.test(n.text)) return false;
    const words = n.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 8 || !/[a-z]/.test(n.text)) return false;
    // A normal title-case person row has every token in name form; a wrapped
    // institution continuation usually contains a connector/lowercase tail.
    if (words.every((word) => /^[A-Z][\p{Ll}'’-]+$/u.test(word))) return false;
    return affiliationNodes.some((candidate) => {
      const candidateBox = candidate.boundingBoxes[0];
      return Math.abs((candidateBox?.y ?? Infinity) - y) <= 26 &&
        Math.abs((candidateBox?.x ?? Infinity) - x) <= 55;
    });
  });
  const affiliationSourceNodes = [...affiliationNodes, ...affiliationContinuationNodes];
  type AffiliationCandidate = {
    id: string;
    name: string;
    _x: number;
    _marker?: string;
    _page: number;
    _y: number;
  };
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
    const layout = layoutForNode(node, layoutBlocks);
    const lines = layout?.lines ?? [];
    // Some single-column journal mastheads flatten an author and its
    // location/affiliation continuation into one canonical author node. Keep
    // the short person-shaped line as the author and leave the surrounding
    // metadata available to affiliation projection. This is geometry-driven
    // and deliberately excludes institution/location vocabulary so ordinary
    // body paragraphs cannot be shortened by this path.
    if (lines.length >= 2 && lines.length <= 5) {
      const personLines = lines.filter((line) => {
        const text = line.text.replace(/\s+/g, " ").trim();
        const words = text.split(/\s+/).filter(Boolean);
        const cjkPersonLine = /^[\u3040-\u30ff\u4e00-\u9fff\s·・]{2,80}$/u.test(text) &&
          !/(?:大学|学部|研究科|研究所|病院|学校|学科|Department|University|Institute)/i.test(text);
        return words.length >= 2 && words.length <= 5 &&
          (cjkPersonLine || /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]*){1,4}$/u.test(text)) &&
          !/\b(?:republic|university|faculty|department|school|institute|college|hospital|city|street|road|usa|uk|canada|germany|france|italy|macedonia|ohrid|skopje)\b/i.test(text);
      });
      if (personLines.length === 1) return personLines[0].text.replace(/\s+/g, " ").trim();
    }
    return node.text ?? "";
  };
  const mergedMastheadPredecessors = new Set<string>();
  const authorsStructured = mergedAuthorSources.map((node) => {
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
    const rawName = `${predecessor ? `${predecessor.text} ` : ""}${projectionAuthorText(node)}`.trim();
    const expandedName = expandAuthorLine(rawName)
      .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
      .filter(Boolean);
    return {
    id: node.id,
    // Keep structured author metadata aligned with the display projection;
    // native lines often include an adjacent email or city column.
    name: expandedName.length > 0 ? expandedName.join(", ") : rawName,
    affiliationIds: affiliated.filter((rel) => rel.from === node.id).map((rel) => rel.to),
    predecessorId: predecessor?.id,
  };
  }).filter((author) => !mergedMastheadPredecessors.has(author.id));
  const affiliationCandidates: AffiliationCandidate[] = affiliationSourceNodes.flatMap((node): AffiliationCandidate[] => {
    const layout = layoutForNode(node, layoutBlocks);
    const lines = layout?.lines ?? [];
    const markerPositions = lines.flatMap((line) => line.items
      .filter((item) => item.fontSize < line.fontSize * 0.8 && /^\d{1,2}$/.test(item.text.trim()))
      .map((item) => ({ marker: item.text.trim(), x: item.x })));
    const base = { _page: node.pageStart, _y: node.boundingBoxes[0]?.y ?? 0 };
    const startsWithSidebarLabel = /^(?:open access|edited by|reviewed by|correspondence|specialty section|citation|received|accepted|published)\s*:/i.test((node.text ?? "").trim());
    const sidebarMixed = hasSidebarBody && startsWithSidebarLabel &&
      (node.boundingBoxes[0]?.x ?? Infinity) < sidebarRight &&
      (node.boundingBoxes[0]?.width ?? 0) > 180;
    // Native PDF extraction can flatten two masthead columns into one line.
    // Reconstruct those columns from span x positions before applying marker
    // association; otherwise institutions from adjacent columns are woven
    // together (e.g. `University ... Disorders Australia ...`). Only use
    // this when a line has a clear, repeated inter-column gap so ordinary
    // wrapped affiliations remain untouched.
    const geometryColumnSource = (() => {
      if (sidebarMixed || lines.length === 0) return undefined;
      const rows = lines.map((line) => line.items.sort((a, b) => a.x - b.x));
      const gaps = rows.flatMap((items) => items.slice(1).map((item, index) => item.x - (items[index]?.x ?? item.x)));
      const splitGap = Math.max(48, ...gaps.filter((gap) => Number.isFinite(gap))) > 48
        ? Math.max(48, ...gaps.filter((gap) => Number.isFinite(gap)))
        : 0;
      if (splitGap <= 48 || rows.filter((items) => items.length >= 2 && items.some((item, i) => i > 0 && item.x - items[i - 1].x >= 48)).length < 1) return undefined;
      const splitRows = rows.map((items) => {
        const pivot = items.findIndex((item, index) => index > 0 && item.x - items[index - 1].x >= 48);
        return pivot > 0 ? [items.slice(0, pivot), items.slice(pivot)] : [items];
      });
      const columns = [0, 1].map((column) => splitRows
        .map((parts) => parts[column]?.map((item) => item.text).join(" ") ?? "")
        .filter(Boolean)
        .join(" ")
        .trim());
      return columns.every(Boolean)
        ? columns.join(" ").replace(/\b(\d{1,2})\s+(?=[A-Z])/g, "$1")
        : undefined;
    })();
    const markerSource = sidebarMixed
      ? lines.map((line) => line.items
          .filter((item) => item.x > sidebarRight + 8)
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(" ")).join(" ")
      : (geometryColumnSource ?? node.text ?? "");
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
      return markerParts.flatMap((rawName, index) => {
        const leadingEditorialInstitution = index === 0 &&
          /\b(?:edited|reviewed)\s+by\s*:/i.test(node.text ?? "")
          ? rawName.replace(/^(?:University|Institute|College|Hospital)\b[^,]{3,80},\s+(?=(?:Applied|Laboratory|Department|School|Faculty|Center|Centre|Research)\b)/i, "")
          : rawName;
        const reviewerTail = leadingEditorialInstitution.match(/^(.*?),\s+[A-Z][a-zà-öø-ÿ'’-]+(?:\s+[A-Z][a-zà-öø-ÿ'’-]+){1,2},\s+(?=(?:NIH|University|Hospital|Institute|Center|Centre)\b)(.*)$/i);
        const names = reviewerTail
          ? [reviewerTail[1], reviewerTail[2]]
          : [leadingEditorialInstitution];
        return names.map((name, offset) => ({
          id: `${node.id}-numbered-${index + offset + 1}`,
          name: normalizeAffiliationName(name),
          _x: node.boundingBoxes[0]?.x ?? 0,
          _marker: String(index + offset + 1),
          ...base,
        }));
      });
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
      .map((line) => line.items.filter((item) => item.fontSize >= line.fontSize * 0.7 && !/^\d{1,2}$/.test(item.text.trim())))
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
  }).filter((affiliation) => (affiliation._marker &&
    /\b(?:university|department|institute|school|faculty|college|hospital|laboratory|center|centre|research|design|computing)\b/i.test(affiliation.name) &&
    !/^(?:edited|reviewed)\s+by\s*:/i.test(affiliation.name)) || (affiliation.name &&
    !/[{}@]/.test(affiliation.name) &&
    !/^(?:corresponding author|these authors contributed|author note|keywords?)\b/i.test(affiliation.name) &&
    !/^(?:this work was supported|funding|funded by|acknowledg(?:e?ments?)?)\b/i.test(affiliation.name) &&
    !/^(?:edited|reviewed)\s+by\s*:/i.test(affiliation.name) &&
    // Bibliographic bands often receive the affiliation role because they
    // share the same font/column as the masthead. They are never institutions
    // and must not be exposed as author affiliations.
    !/\b(?:vol\.?|volume|issue|issn|e-?issn|open\s+access|research\s+article|journal|accepted|published(?:\s+online)?)\b/i.test(affiliation.name) &&
    // Reviewer rows and leaked body fragments can be classified as
    // affiliations after a native stream interleave. A person-shaped prefix
    // followed by an institution, or a lowercase sentence fragment, is not an
    // institution candidate.
    !/^[A-Z][a-zà-öø-ÿ'’-]+(?:\s+[A-Z][a-zà-öø-ÿ'’-]+){1,3},\s+.*\b(?:university|institute|center|centre|laboratory|biomedical)\b/i.test(affiliation.name) &&
    !/^[a-z]/.test(affiliation.name) &&
    !/^available from .*\bat:\s*$/i.test(affiliation.name) &&
    !/^(?:contents|article history|lists available at)\b/i.test(affiliation.name) &&
    !/^\s*["“].*?["”]\s+by\s+/i.test(affiliation.name) &&
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
    (!/(?:\b(?:of|and|in|the|for|&))\s*[,;]?$/i.test(affiliation.name) ||
      /\b(?:college|centre|center|department|faculty|university|institute|research|design|cognition)\b/i.test(affiliation.name)) &&
    ((affiliation.name.match(/\b\S\b/g)?.length ?? 0) * 2 <= affiliation.name.split(/\s+/).length ||
      /\b(?:university|institute|department|school|faculty|college|hospital|laboratory|centre|center|research|design|computing)\b/i.test(affiliation.name) ||
      /^[A-Z0-9& -]{2,12}$/.test(affiliation.name))));
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
      return { ...first, name: normalizeAffiliationName(group.slice().sort((a, b) =>
        Math.abs(a._y - b._y) <= 1 ? a._x - b._x : a._y - b._y
      ).map((item) => item.name).join(" ")) };
    })
    : affiliationCandidates;
  const stitchedAffiliations: typeof groupedAffiliations = [];
  for (const candidate of groupedAffiliations.slice().sort((a, b) =>
    Math.abs(a._y - b._y) <= 1 ? a._x - b._x : a._y - b._y
  )) {
    const previous = stitchedAffiliations.at(-1);
    const canStitch = previous && previous._page === candidate._page &&
      candidate._y >= previous._y && candidate._y - previous._y <= 90 &&
      Math.abs(candidate._x - previous._x) <= 32 &&
      /[,;:]\s*$/.test(previous.name) &&
      /^[A-Z]/.test(candidate.name.trim());
    if (canStitch) {
      stitchedAffiliations[stitchedAffiliations.length - 1] = {
        ...previous,
        name: normalizeAffiliationName(`${previous.name} ${candidate.name}`),
        _y: candidate._y,
      };
    } else stitchedAffiliations.push(candidate);
  }
  let affiliations = stitchedAffiliations.filter((affiliation, index, all) =>
    all.findIndex((candidate) => candidate.name.toLocaleLowerCase() === affiliation.name.toLocaleLowerCase()) === index)
    .map(({ _page, _y, _x, _marker, ...affiliation }) => affiliation);
  // Reconstruct lettered affiliation records when two native columns are
  // interleaved. The source stream retains the marker at each institution
  // boundary, which is stronger evidence than the flattened column order.
  const titleY = titleNode?.boundingBoxes[0]?.y ?? 0;
  const letteredNodes = [
    ...affiliationNodes,
    ...canonical.nodes.filter((node) => node.role === "author" && node.pageStart === 1 &&
      /^\s*[a-z]\s+/i.test(node.text?.trim() ?? "")),
  ].filter((node) => {
    const y = node.boundingBoxes[0]?.y ?? Infinity;
    return y > titleY + 20 && y < firstBodyY && y < 320 && (node.text?.length ?? 0) <= 220;
  }).sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0) ||
    (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
  const letteredText = letteredNodes.map((node) => node.text?.replace(/\s+/g, " ").trim() ?? "")
    .filter((text) => text && !/^(?:[a-z](?:\s*,\s*[a-z])+|[a-z])$/i.test(text)).join(" ");
  const markerMatches = [...letteredText.matchAll(/(?:^|\s)([a-z])\s+(?=[A-Z])/g)];
  if (markerMatches.length >= 3) {
    const starts = markerMatches.map((match) => match.index ?? 0);
    const reconstructed = starts.map((start, index) => normalizeAffiliationName(
      letteredText.slice(start, starts[index + 1] ?? letteredText.length).replace(/^\s*[a-z]\s+/, "").trim()
    )).filter((name) => name.length >= 20 &&
      /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory|research|consortium|partner)\b/i.test(name) &&
      !/\b(?:article history|keywords?|abstract|contents lists available|journal homepage)\b/i.test(name));
    if (reconstructed.length >= 3 && reconstructed.length <= 8) {
      affiliations = reconstructed.map((name, index) => ({ id: `lettered-affiliation-${index}`, name }));
    }
  }
  // A few publisher streams attach the first institution directly to an
  // author node. Recover only the institution-shaped suffix; the author
  // projection above has already removed the same suffix from the name.
  for (const node of authorNodes) {
    const recovered = extractSwallowedAffiliation(node.text ?? "");
    if (recovered && !affiliations.some((item) => item.name.toLocaleLowerCase() === recovered.toLocaleLowerCase())) {
      affiliations.push({ id: `affiliation-swallowed-${node.id}`, name: normalizeAffiliationName(recovered) });
    }
  }
  for (const node of canonical.nodes) {
    for (const recovered of extractAffiliationStatements(node.text ?? "")) {
      appendAffiliation(affiliations, { id: `affiliation-statement-${node.id}-${affiliations.length}`, name: recovered });
    }
  }
  // PLOS-like layouts sometimes assign the institution line a valid
  // affiliation role but its leading footnote glyphs prevent the strict
  // candidate filter from retaining it. Recover the complete native line as
  // a conservative fallback when no affiliation survived at all.
  if (affiliations.length === 0) {
    affiliations = affiliationNodes
      .flatMap((node) => (node.text ?? "")
        .split(/(?=\b\d{1,2}\s+(?=[A-Z]))/)
        .map((part) => normalizeAffiliationName(part.replace(/^[\d☯*†‡\s]+/, "").trim())))
      .filter((name, index, all) => name.length >= 20 &&
        /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory)\b/i.test(name) &&
        !/\b(?:vol\.?|volume|issue|issn|open\s+access|research\s+article|journal|accepted|published(?:\s+online)?)\b/i.test(name) &&
        all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index)
      .map((name, index) => ({ id: `affiliation-fallback-${index}`, name }));
  }
  // When the native stream emits a wrapped institution as separate short
  // nodes, retain the adjacent same-column run as one affiliation. This
  // repairs narrow publisher mastheads without merging unrelated body text.
  const nativeAffiliationNodes = affiliations.length <= 1 ? affiliationNodes
    .filter((node) => /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory|management)\b/i.test(node.text ?? ""))
    .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0)) : [];
  const wrappedAffiliationNodes = nativeAffiliationNodes.length === 2 ? nativeAffiliationNodes : [];
  for (const node of wrappedAffiliationNodes) {
    const box = node.boundingBoxes[0];
    const prior = nativeAffiliationNodes
      .filter((candidate) => candidate !== node &&
        (candidate.boundingBoxes[0]?.y ?? 0) < (box?.y ?? 0) &&
        (box?.y ?? 0) - (candidate.boundingBoxes[0]?.y ?? 0) <= 24 &&
        Math.abs((candidate.boundingBoxes[0]?.x ?? 0) - (box?.x ?? 0)) <= 8)
      .sort((a, b) => (b.boundingBoxes[0]?.y ?? 0) - (a.boundingBoxes[0]?.y ?? 0))[0];
    const candidateName = normalizeAffiliationName(`${prior?.text ?? ""} ${node.text ?? ""}`.replace(/^[\d☯*†‡\s]+/, "").trim());
    if (candidateName.length >= 24) {
      const candidateLower = candidateName.toLocaleLowerCase();
      const contained = affiliations.findIndex((item) => {
        const existingLower = item.name.toLocaleLowerCase();
        return candidateLower.includes(existingLower) || existingLower.includes(candidateLower);
      });
      if (contained >= 0 && candidateLower.length > affiliations[contained].name.length) {
        affiliations[contained] = { id: `affiliation-adjacent-${node.id}`, name: candidateName };
      } else if (contained < 0) {
        affiliations.push({ id: `affiliation-adjacent-${node.id}`, name: candidateName });
      }
    }
  }
  const reviewLabel = canonical.nodes.filter((node) => node.pageStart === 1 &&
    /^(?:edited|reviewed)\s+by\s*:/i.test(node.text?.trim() ?? "")).at(-1);
  if (reviewLabel) {
    const reviewY = reviewLabel.boundingBoxes[0]?.y ?? Infinity;
    const reviewCandidates = canonical.nodes
      .filter((node) => {
        const box = node.boundingBoxes[0];
        const x = box?.x ?? Infinity;
        const y = box?.y ?? Infinity;
        const text = node.text ?? "";
        const likelyReviewerAffiliation = x < 100 && y > reviewY + 35 && text.length < 100 &&
          /,\s*(?:United States|United Kingdom|Canada|Australia|Brazil|Japan|China|Germany|France|Italy|Spain|Netherlands)\s*$/i.test(text.trim());
        return node.pageStart === 1 && node.role === "affiliation" && y < 430 &&
          !likelyReviewerAffiliation &&
          ((x >= 140 && x <= 310) || (x < 100 && y > reviewY)) &&
          /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory|research)\b/i.test(node.text ?? "");
      })
      .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0) ||
        (a.boundingBoxes[0]?.x ?? 0) - (b.boundingBoxes[0]?.x ?? 0));
    const existingLaboratoryCandidates = affiliations
      .filter((item) => /\blaboratory\b/i.test(item.name))
      .map((item) => removeReviewerInstitutionPrefix(item.name));
    const reviewerInstitutionFragments = [...existingLaboratoryCandidates, ...reviewCandidates.map((node) => node.text ?? "")].flatMap((name) => {
      const fragment = name.match(/\bNIH\b[\s\S]*?(?=\s+(?:Applied|Laboratory|National|Department|School|Faculty)\b|$)/i)?.[0]?.trim();
      return fragment ? [fragment] : [];
    });
    const normalizedCandidates = [...existingLaboratoryCandidates, ...reviewerInstitutionFragments, ...reviewCandidates.map((node) => {
      const raw = node.text ?? "";
      const start = raw.search(/\b(?:department|school|faculty|college|hospital|centre|center|institute|laboratory|research|university)\b/i);
      if (start <= 0) return normalizeAffiliationName(raw);
      const before = raw.slice(0, start);
      const afterComma = before.lastIndexOf(",");
      // A comma before the institution usually belongs to an interleaved
      // author row; discard that prefix. Without a comma, retain up to two
      // title-case words (for example `NIH Biomedical Research Center`).
      const prefix = afterComma >= 0 ? "" : before;
      const prefixWords = prefix.trim().split(/\s+/).filter(Boolean).slice(-2).join(" ");
      const normalized = normalizeAffiliationName(`${prefixWords} ${raw.slice(start)}`.trim());
      return removeReviewerInstitutionPrefix(normalized);
    })].filter((name) => name.length >= 20);
    const continuation = normalizedCandidates.find((name) => /^University\s+of\s+/i.test(name) && name.length < 100);
    const rebuilt = normalizedCandidates.filter((name) => name !== continuation);
    if (continuation) {
      for (let index = 0; index < rebuilt.length; index += 1) {
        if (/(?:\bUniversity of|\bPhysical)$/i.test(rebuilt[index])) {
          const tail = /\bUniversity\s+of$/i.test(rebuilt[index])
            ? continuation.replace(/^University\s+of\s+/i, "")
            : continuation;
          rebuilt[index] = normalizeAffiliationName(`${rebuilt[index]} ${tail}`);
        }
      }
    }
    const withoutAggregates = rebuilt.filter((name, _index, all) => {
      if (name.length <= 180) return true;
      const key = affiliationKey(name);
      return all.filter((candidate) => candidate !== name && candidate.length >= 24 &&
        key.includes(affiliationKey(candidate))).length < 2;
    });
    const unique = withoutAggregates.filter((name, index, all) =>
      all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase() ||
        candidate.toLocaleLowerCase().includes(name.toLocaleLowerCase()) && candidate.length >= name.length) === index);
    if (unique.length >= 3 && unique.length <= 6) {
      affiliations = unique.map((name, index) => ({ id: `review-masthead-affiliation-${index}`, name }));
    }
  }
  const editorReviewCreditNames = new Set(
    canonical.nodes
      .map((node) => node.text ?? "")
      .filter((text) => /^\s*(?:edited|reviewed)\s+by\b/i.test(text.trim()))
      .flatMap((text) => {
        const credit = text.replace(/^\s*(?:edited|reviewed)\s+by\b\s*:?[\s]*/i, "");
        return expandAuthorLine(credit).map((name) => name.replace(/[\d,*†‡§]+/gu, " ").replace(/\s+/g, " ").trim());
      })
      .filter((name) => name.length >= 3),
  );
  let authorNames = authorsStructured
    .flatMap((author) => expandAuthorLine(author.name))
    .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
    .filter((name) => !isNonAuthorMastheadLine(name) &&
      ![...editorReviewCreditNames].some((credit) => credit.toLocaleLowerCase() === name.toLocaleLowerCase() ||
        credit.toLocaleLowerCase().includes(name.toLocaleLowerCase()) || name.toLocaleLowerCase().includes(credit.toLocaleLowerCase())) &&
      name.split(/\s+/).length <= 6 && !/[!?]/.test(name) &&
      !/[@{}]/.test(name) &&
      !/(?:\[|\])/.test(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      !/\b(?:movement|science|sport|psychology|department|university|institute|research|council|resistance|training|edited|published)\b/i.test(name) &&
      !(/\s[A-Z]{1,3}$/.test(name) && !/^[A-Z][A-Z'’-]*(?:\s+[A-Z][A-Z'’-]*)+$/.test(name)) &&
      !/(?:^|,\s*)(?:usa|u\.s\.a?\.?|israel|italy|china|japan|uk|united kingdom|ny|california|new york|tel aviv|albany|palo alto|campinas|brazil|united states)(?:\s*,|$)/i.test(name) &&
      !/\b[A-Z]{2}\s+USA\b/i.test(name) &&
      !/^(?:palo alto|tel aviv|albany|new york|campinas|brazil|united states)$/i.test(name) &&
      !/\b(?:,\s*)?(?:ny|ca),\s*usa\b/i.test(name))
    .filter((name, index, all) => all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index)
    .filter((name) => !/^(?:correspondence|corresponding author|teaching assistant professor|assistant professor|associate professor|professor|research fellow)\s*:?[,.]?$/i.test(name.trim()))
    .filter(Boolean);
  const recoveredMasthead = recoverColumnMasthead(layoutBlocks, firstBodyY);
  const contaminatedAuthor = authorNames.some((name) =>
    /@|\b(?:university|department|school|institute|design|engineering|seattle|washington),?\b/i.test(name));
  if (recoveredMasthead && recoveredMasthead.affiliations.length >= 2 && (authorNames.length === 0 ||
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
      const nameOnly = !/^[a-z]/.test(text.trim()) &&
        !/(?:university|department|institute|school|college|hospital|laboratory|center|centre|japan|china|israel|sweden)/i.test(text) &&
        text.length <= 180 && /\b(?:and|,)\b/.test(text) ? expandAuthorLine(text) : [];
      return [...recovered, ...nameOnly];
    })
    .filter((name) => !/(?:[{}@]|\[|\])/.test(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      // A malformed affiliation node can otherwise be mistaken for an
      // author row (e.g. `Research Director ...` or `Industrial Design`).
      !/\b(?:research director|education services|human factors|ergonomics|industrial design|interactive computing|comprehensive interdisciplinary)\b/i.test(name));
  for (const name of affiliationAuthorNames) {
    const normalizedName = name.replace(/^and\s+/i, "").trim();
    if (!authorNames.some((existing) => existing.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      authorNames.push(normalizedName);
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
      ...splitTitleCaseAffiliationPrefix(node.text ?? ""),
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
  const figureCaptionPages = new Set(
    canonical.nodes
      .filter((node) => node.role === "caption" && /^(?:figure|fig\.)\s*\d+/i.test((node.text ?? "").trim()))
      .map((node) => node.pageStart)
  );
  const compactGraphicLabelCountByPage = new Map<number, number>();
  for (const node of canonical.nodes) {
    const compact = node.evidence.some((entry) => entry.label === "repeated-prose-cell-grid") &&
      node.boundingBoxes.length > 0 &&
      Math.max(...node.boundingBoxes.map((box) => box.height)) <= 9;
    if (compact) compactGraphicLabelCountByPage.set(node.pageStart, (compactGraphicLabelCountByPage.get(node.pageStart) ?? 0) + 1);
  }
  const isDenseGraphicLabel = (node: CanonicalNode) =>
    node.role === "table" &&
    figureCaptionPages.has(node.pageStart) &&
    (compactGraphicLabelCountByPage.get(node.pageStart) ?? 0) >= 12 &&
    node.evidence.some((entry) => entry.label === "repeated-prose-cell-grid") &&
    node.boundingBoxes.length > 0 &&
    Math.max(...node.boundingBoxes.map((box) => box.height)) <= 9;

  const readable = canonical.nodes.filter((n) => {
    // Radial diagrams and other dense infographics can be mistaken for a
    // captionless prose-cell grid. The figure caption is retained as the
    // readable representation; suppress only when page-level density and a
    // numbered figure caption corroborate the graphic interpretation.
    if (isDenseGraphicLabel(n)) return false;
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
  const nodeById = new Map(canonical.nodes.map((n) => [n.id, n]));
  const orderedIds =
    topologicalOrder(fallbackIds, canonical.relations, (id) => {
      const node = nodeById.get(id);
      const box = node?.boundingBoxes[0];
      return {
        page: node?.pageStart ?? Number.MAX_SAFE_INTEGER,
        y: box?.y ?? Number.MAX_SAFE_INTEGER,
        x: box?.x ?? Number.MAX_SAFE_INTEGER,
      };
    }) ?? fallbackIds;
  const orderedNodes = orderedIds
    .map((id) => nodeById.get(id))
    .filter((n): n is CanonicalNode => Boolean(n));
  const projectionNodes = projectionNodesWithContinuations(orderedNodes, canonical, layoutBlocks);
  const tableAbsorption = captionedTableAbsorption(canonical);

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
    const nodeText = (node.text ?? "").trim();
    if (isPublicationLegalMetadata(nodeText)) continue;

    // Resolver role errors inside an explicit References section must not
    // expose bibliography text as a translated paragraph or table. Use the
    // section plus strong textual bibliography evidence before role-specific
    // projection. This also recovers page-range tails that PDF producers emit
    // as footnotes. Captions/equations/headings retain their own semantics.
    const referenceSectionNode = currentKind === "references" &&
      node.role !== "heading" && node.role !== "caption" && node.role !== "equation" &&
      isReferenceText(nodeText, currentKind);
    if (referenceSectionNode) {
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "reference",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: normalizeReferenceText(nodeText),
        translated: null,
        translationStatus: "skipped",
        parentBlockId: null,
        metadata: { column, role: "reference", recoveredFromRole: node.role },
      });
      continue;
    }

    // Chart-adjacent prose can inherit a table role from region membership.
    // Drop axis crumbs; keep longer narrative as ordinary paragraphs.
    const tableLayout = layout ?? layoutBlocks.find((candidate) => candidate.pageStart === node.pageStart && candidate.text === node.text);
    const explicitHighTableScore = node.evidence.some((entry) =>
      entry.label === "role-scores" && /table=0\.(?:9[4-9]|[1-9]\d)/.test(entry.reason ?? "")
    );
    const strongNativeRowGrid = hasStrongNativeTableRows(node, tableLayout) ||
      (explicitHighTableScore && node.evidence.some((entry) =>
        entry.label === "table-row-geometry" && entry.confidence >= 0.9
      ) && (tableLayout?.lines.filter((line) => line.items.length >= 2).length ?? 0) >= 3);
    const weakTableGeometryOnNarrative = !explicitHighTableScore &&
      node.evidence.some((entry) => entry.label === "table-row-geometry") &&
      ((node.text ?? "").split(/\s+/).filter(Boolean).length >= 36 ||
        ((node.text ?? "").match(/[.!?]/g) ?? []).length >= 3);
    const exactSyntheticCaptionRegion = hasExactSyntheticCaptionRegion(node, canonical);
    if (node.role === "table" && node.text && !hasStrongTableMatrixEvidence(node) &&
        !strongNativeRowGrid &&
        !belongsToCaptionedTableRegion(node, tableAbsorption.regions) &&
        (looksLikeProseMistakenForTable(node.text) || weakTableGeometryOnNarrative)) {
      const text = node.text;
      if (isChartDebrisFragment(text)) {
        continue;
      }
      pushBlock(node, layout, {
        sectionId: currentSectionId,
        type: "paragraph",
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: text,
        translated: null,
        translationStatus: shouldTranslateParagraph(text) ? "pending" : "skipped",
        parentBlockId: null,
        metadata: { column, role: "paragraph", demotedFromTable: true },
      });
      continue;
    }

    // Numbered Table N already owns a synthetic CAPTION_OF region — skip
    // duplicate cell crumbs when that region has no native text of its own.
    // A native multicell row remains visible because it is the usable table
    // representation when no crop is available.
    // Numbered Table N already owns a CAPTION_OF region — skip duplicate cell crumbs.
    if (
      node.role === "table" &&
      node.text &&
      !tableAbsorption.keepIds.has(node.id) &&
      (exactSyntheticCaptionRegion || belongsToCaptionedTableRegion(node, tableAbsorption.regions)) &&
      looksLikeCaptionedTableCellFragment(node.text) &&
      // A synthetic region whose boxes exactly cover the native row already
      // owns the table identity. When the row has no independent captioned
      // multicell evidence, projecting it as a second source-only table
      // duplicates the same table (common with generated/test regions and
      // borderless grids). Keep genuinely captioned native grids below.
      (exactSyntheticCaptionRegion || !tableAbsorption.regions.some(({ target }) =>
        !target.text && target.boundingBoxes.length === node.boundingBoxes.length &&
        target.boundingBoxes.every((targetBox) => node.boundingBoxes.some((nodeBox) =>
          nodeBox.page === targetBox.page &&
          Math.abs(nodeBox.x - targetBox.x) <= 1 &&
          Math.abs(nodeBox.y - targetBox.y) <= 1 &&
          Math.abs(nodeBox.width - targetBox.width) <= 1 &&
          Math.abs(nodeBox.height - targetBox.height) <= 1
        ))
      ) || node.evidence.some((entry) => entry.label === "captioned-native-multicell-row")) &&
      // A resolver can attach the caption relation to a synthetic region
      // while the text-bearing multi-row grid remains a separate node. Its
      // repeated native lines are stronger evidence than the short-cell
      // heuristic, so retain the grid as a source-only table block.
      !(node.evidence.some((entry) => entry.label === "captioned-native-multicell-row") || (tableLayout && tableLayout.lines.some((line) => {
        const cells = line.items.filter((item) => item.text.trim().length > 0);
        if (cells.length < 3) return false;
        const span = Math.max(...cells.map((item) => item.x + item.width)) - Math.min(...cells.map((item) => item.x));
        return span >= (line.pageWidth ?? 612) * 0.28;
      })))
    ) {
      continue;
    }

    const recoveredNativeGrid = node.role !== "table" && !weakTableGeometryOnNarrative &&
      hasStrongNativeTableRows(node, tableLayout);
    const tableRole = node.role === "table" || recoveredNativeGrid;
    const nativeGrid = tableRole && node.text &&
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
    const candidateRows = tableLayout?.lines.reduce<Array<Array<{ text: string; x: number; width: number; y: number }>>>((rows, line) => {
      const cells = line.items
        .filter((item) => item.text.trim().length > 0)
        .map((item) => ({ text: item.text.trim(), x: item.x, width: item.width, y: item.y }))
        .sort((a, b) => a.x - b.x);
      if (cells.length === 0) return rows;
      const previous = rows.at(-1);
      const previousY = previous?.[0]?.y;
      if (previous && previousY !== undefined && Math.abs(line.y - previousY) <= 1.5) previous.push(...cells);
      else rows.push(cells);
      return rows;
    }, []);
    const hasRepeatedColumns = (candidateRows?.filter((row) => row.length >= 2).length ?? 0) >= 2 &&
      new Set((candidateRows ?? []).flat().map((cell) => Math.round(cell.x))).size >= 2;
    const tableRows = hasRepeatedColumns
      ? candidateRows?.map((row) => row.map(({ text, x, width }) => ({ text, x, width })))
      : undefined;
    if (nativeGrid) {
      const tableText = node.text ?? "";
      const match = tableText.match(/^(?:table|表)\s*(\S+)/i);
      const tableNumber = match
        ? /表/i.test(match[0]) ? `表 ${match[1]}` : `Table ${match[1]}`
        : "Table";
      pushBlock(node, tableLayout, {
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
          ...(tableRows ? { tableRows } : {}),
        } satisfies TableMetadata & { column: string; figureKey: string },
      });
      continue;
    }

    // A high-confidence table role can still lack enough native cells to
    // construct a grid or crop an image. Keep its extracted text visible as
    // source-only prose instead of silently dropping the node or translating
    // unrelated cells as a fabricated paragraph.
    if (tableRole && node.text) {
      pushBlock(node, tableLayout, {
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
          ...(tableRows ? { tableRows } : {}),
          translationInputWarning: "table-like text preserved in source because a reliable grid was unavailable",
        },
      });
      continue;
    }

    if (node.role === "heading") {
      const text = node.text ?? "";
      if (looksLikeConferenceRunningHeader(text)) continue;
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
            ...(layout?.detachedCaptionTitleRepaired ? { detachedCaptionTitleRepaired: true } : {}),
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
      // Running page indices are often labeled footnote by layout heuristics.
      if (isStandalonePageNumber(text, node.role)) continue;
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
      if (isStandaloneContactMetadata(text) ||
        isStandaloneAffiliationMarkerRun(text) ||
        isStandalonePageNumber(text, node.role) ||
        looksLikeConferenceRunningHeader(text) ||
        isChartDebrisFragment(text)) continue;
      const listParts = splitFlattenedList(text);
      const standaloneListItem = /^(?:[•‣▪∙]|(?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\))\s+/.test(text.trim());
      // Being inside a References section is context, not proof that every
      // numbered paragraph is a bibliography entry. Surveys often place a
      // numbered principles/checklist list immediately before the actual
      // REFERENCES heading. Let bibliographic evidence win while preserving
      // numeric entries that contain author/year or publisher signals.
      const refEvidence = node.role === "reference" || isReferenceText(text, currentKind);
      const isRef = refEvidence &&
        (!isNumberedProseListItem(text) ||
          /\b(?:19|20)\d{2}\b/.test(text.slice(0, 180)) ||
          /\b(?:doi\s*:|https?:\/\/|journal|proceedings|conference|in\s+proc\.)\b/i.test(text));
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
        const listRole =
          listParts.length > 1
            ? partIndex === 0
              ? "intro"
              : "item"
            : standaloneListItem
              ? "item"
              : undefined;
        const meaningfulListUnit =
          listRole === "intro" ||
          (listRole === "item" && (part.match(/[A-Za-z]{3,}/g)?.length ?? 0) >= 3);
        pushBlock(node, layout, {
          sectionId: currentSectionId,
          type: isRef ? "reference" : "paragraph",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: isRef ? normalizeReferenceText(part) : part,
          translated: null,
          translationStatus:
            isChartLabel || isRef || (!meaningfulListUnit && !shouldTranslateParagraph(part))
              ? "skipped"
              : "pending",
          parentBlockId: null,
          metadata: {
            column,
            role: isRef ? "reference" : node.role,
            translationInputWarning: translationInputWarning ?? undefined,
            flattenedListPart: listParts.length > 1,
            listRole,
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
    // Only malformed detached-title captions need a projection boundary here.
    // Normal same-baseline captions retain their established row aggregation
    // path, including CJK and compact journal tables.
    const captionBoundary = last?.metadata?.detachedCaptionTitleRepaired === true ||
      block.metadata?.detachedCaptionTitleRepaired === true;
    const sameRow = !captionBoundary && last?.type === "table" && block.type === "table" && lastBox && box &&
      lastBox.page === box.page && Math.abs(lastBox.y - box.y) <= Math.max(lastBox.height, box.height) * 0.55;
    if (sameRow) {
      const previousCells = Array.isArray(last.metadata?.tableRows)
        ? (last.metadata.tableRows as Array<Array<{ text: string; x: number; width: number }>>)
          .flat()
        : [{
            text: last.original ?? "",
            x: lastBox.x,
            width: lastBox.width,
          }];
      const rowCells = [...previousCells, {
        text: block.original ?? "",
        x: box.x,
        width: box.width,
      }]
        .filter((cell) => cell.text.trim().length > 0)
        .sort((a, b) => a.x - b.x);
      const merged = {
        ...last,
        original: `${last.original} ${block.original}`.replace(/\s+/g, " ").trim(),
        boundingBoxes: [...last.boundingBoxes, ...block.boundingBoxes],
        metadata: {
          ...last.metadata,
          role: "table",
          tableSourceFallback: true,
          // Preserve the visual row instead of collapsing same-baseline
          // native cells into a source-only sentence.  The Reader can then
          // render a deterministic grid even when a crop is unavailable.
          tableRows: [rowCells],
        },
      };
      acc[acc.length - 1] = merged;
    } else {
      acc.push(block);
    }
    return acc;
  }, []);

  const tableColumnMergedBlocks = mergeParallelTableColumns(rowAggregatedBlocks, layoutBlocks);
  const tableRowMergedBlocks = mergeSequentialTableRows(tableColumnMergedBlocks, layoutBlocks);

  // After a page-break header is dropped, rejoin "30. Authors." + "2007. Title…".
  const referenceCoalescedBlocks = tableRowMergedBlocks.reduce<PaperBlock[]>((acc, block) => {
    const last = acc.at(-1);
    const text = (block.original ?? "").trim();
    const lastText = (last?.original ?? "").trim();
    const lastIsRef =
      last?.type === "reference" || String(last?.metadata?.role ?? "") === "reference";
    const detachedPageRange =
      /^(?:\d+(?:\(\d+\))?,\s*)?\d+\s*[–—-]\s*\d+(?:\s*\((?:19|20)\d{2}[a-z]?\))?\.?$/i.test(text);
    if (last && lastIsRef && block.type === "reference" &&
        block.sectionId === last.sectionId && detachedPageRange) {
      acc[acc.length - 1] = {
        ...last,
        original: normalizeReferenceText(`${lastText} ${text}`),
        pageEnd: Math.max(last.pageEnd, block.pageEnd),
        boundingBoxes: [...last.boundingBoxes, ...block.boundingBoxes],
        metadata: { ...last.metadata, role: "reference", referenceContinuationRepaired: true },
      };
      return acc;
    }
    if (
      last &&
      lastIsRef &&
      looksLikeAuthorsOnlyReferenceStub(lastText) &&
      looksLikeYearTitleReferenceContinuation(text) &&
      (block.type === "paragraph" || block.type === "reference")
    ) {
      acc[acc.length - 1] = {
        ...last,
        type: "reference",
        original: normalizeReferenceText(`${lastText} ${text}`),
        pageEnd: Math.max(last.pageEnd, block.pageEnd),
        boundingBoxes: [...last.boundingBoxes, ...block.boundingBoxes],
        metadata: { ...last.metadata, role: "reference" },
      };
      return acc;
    }
    acc.push(block);
    return acc;
  }, []);

  // A two-column reference page can still yield one long native block after
  // column ordering. Split only at author/year anchors, keeping each entry as
  // its own source-only Reader block. This is deliberately conservative: a
  // candidate must begin at a sentence boundary, have a surname-like comma
  // anchor, and terminate at a bibliographic year marker.
  const splitConcatenatedReferences = (block: PaperBlock): PaperBlock[] => {
    const original = block.original ?? "";
    if (block.type !== "reference" || original.length < 240) return [block];
    const text = original.replace(/\s+/g, " ").trim();
    const starts: number[] = [0];
    let previousYearEnd = 0;
    for (const year of text.matchAll(/\((?:19|20)\d{2}[a-z]?\)\./gi)) {
      const yearIndex = year.index ?? 0;
      const yearEnd = yearIndex + year[0].length;
      // Bound the search by the previous bibliographic year. This handles
      // references whose DOI/page range has no terminal period in the native
      // text (a common two-column PDF extraction shape).
      const windowStart = Math.max(previousYearEnd, yearIndex - 220);
      const window = text.slice(windowStart, yearIndex);
      const candidates = [...window.matchAll(/(?:^|\s)((?:[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,40}|(?:van|de|der|den|von|ten)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,40}),)/g)]
        .map((match) => windowStart + (match.index ?? 0) + (match[0].startsWith(" ") ? 1 : 0))
        .filter((candidate) => candidate <= yearIndex && yearIndex - candidate <= 180);
      const candidate = candidates[0];
      if (candidate !== undefined && candidate > 0 && !starts.includes(candidate)) starts.push(candidate);
      previousYearEnd = yearEnd;
    }
    // Some publishers omit a final period after the DOI/page range, so the
    // next author starts immediately after a space (`...doi: X Swallow, K.`).
    // Accept that boundary only when the preceding window contains a DOI,
    // URL, or a page-range terminator; this avoids splitting ordinary author
    // lists inside one entry.
    for (const author of text.matchAll(/\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,40},\s*(?:[A-Z][A-Za-z.'’-]{0,12}|and\b)/g)) {
      const index = author.index ?? 0;
      if (index <= 0 || starts.includes(index)) continue;
      const previous = text.slice(Math.max(0, index - 90), index);
      if (/(?:doi\s*:|https?:\/\/|\d+\s*[–—-]\s*\d+\.?\s*)$/i.test(previous.trim())) starts.push(index);
    }
    starts.sort((a, b) => a - b);
    if (starts.length < 2) return [block];
    return starts.map((start, index) => {
      const part = text.slice(start, starts[index + 1]).trim();
      return {
        ...block,
        id: stableBlockId({ type: "reference", page: block.pageStart, text: part, bbox: block.boundingBoxes[0], order: index }),
        original: part,
        pageEnd: block.pageEnd,
        metadata: { ...block.metadata, role: "reference", referenceEntrySplit: true },
      };
    }).filter((part) => part.original.length > 20);
  };
  const splitReferenceEntries = referenceCoalescedBlocks.flatMap(splitConcatenatedReferences);

  // Preserve uncertain cross-column continuations as source-review units.
  // Do not concatenate them without stronger geometry evidence: a preceding
  // prose block ending without terminal punctuation followed by a connective
  // (`which`, `that`, `and`, ...) on the same page is a high-precision signal
  // that the first block is physically incomplete.
  for (let index = 0; index + 1 < splitReferenceEntries.length; index++) {
    const current = splitReferenceEntries[index];
    const next = splitReferenceEntries[index + 1];

    // Canonical continuation relations can be lost when a mixed native text
    // stream is split into separate x-bands. Rejoin an unfinished paragraph
    // with a same-column lowercase/dash continuation when geometry shows the
    // next line is immediately below it. This is intentionally stricter than
    // generic paragraph concatenation, so independent blocks remain separate.
    const continuationTailBox = current.boundingBoxes.at(-1);
    const continuationHeadBox = next.boundingBoxes[0];
    const currentContinuationText = (current.original ?? "").trim();
    const nextContinuationText = (next.original ?? "").trim();
    const endsWithContinuationCue = /(?:\b(?:a|an|the|of|to|in|on|at|by|for|from|with|and|or|but|as|than|like|such|which|that))$/i.test(currentContinuationText);
    const startsLikeContinuation = /^(?:[a-z(]|[–—-]\s*[a-z])/u.test(nextContinuationText);
    const startsWithProperContinuation = endsWithContinuationCue && /^[A-Z][A-Za-z'’-]*(?:\s|\(|\[)/u.test(nextContinuationText);
    const samePageGeometry = current.pageStart === current.pageEnd &&
      next.pageStart === next.pageEnd &&
      current.pageStart === next.pageStart &&
      current.metadata.column === next.metadata.column &&
      continuationTailBox && continuationHeadBox &&
      Math.abs(continuationTailBox.x - continuationHeadBox.x) <= 18 &&
      continuationHeadBox.y >= continuationTailBox.y + continuationTailBox.height - 2 &&
      continuationHeadBox.y - (continuationTailBox.y + continuationTailBox.height) <= 24;
    const crossPageGeometry = continuationTailBox && continuationHeadBox &&
      continuationHeadBox.page > continuationTailBox.page &&
      continuationTailBox.y > 620 && continuationHeadBox.y < 140;
    const sameColumnContinuation = current.type === "paragraph" &&
      next.type === "paragraph" &&
      (samePageGeometry || crossPageGeometry) &&
      !/[.!?:;]\s*$/.test(currentContinuationText) &&
      (startsLikeContinuation || startsWithProperContinuation);
    if (sameColumnContinuation) {
      splitReferenceEntries[index] = {
        ...current,
        original: `${current.original ?? ""} ${next.original ?? ""}`.replace(/\s+/g, " ").trim(),
        pageEnd: next.pageEnd,
        boundingBoxes: [...current.boundingBoxes, ...next.boundingBoxes],
        extractionConfidence: Math.min(current.extractionConfidence ?? 0, next.extractionConfidence ?? 0),
        metadata: { ...current.metadata, paragraphContinuationRepaired: true },
      };
      splitReferenceEntries.splice(index + 1, 1);
      index -= 1;
      continue;
    }

    // A complete lead-in sentence can intentionally end in a colon immediately
    // before a separately projected numbered/bulleted list.  The generic
    // incomplete-source guard treats every terminal colon as a damaged PDF
    // fragment, which unnecessarily sends these ordinary introductions to
    // source fallback.  Keep the list items separate, but allow the lead-in to
    // translate as its own grammatical unit when geometry and list evidence
    // agree.  This is document-structure evidence, not a paper-specific rule.
    const currentText = (current.original ?? "").trim();
    const listSuccessor = splitReferenceEntries.slice(index + 1, index + 6).find((candidate) =>
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
      splitReferenceEntries[index] = {
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
    splitReferenceEntries[index] = {
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
  const titleForProjection = titleLooksCorrupt
    ? (citationTitleFallback ?? extractedTitleText)
    : extractedTitleText;
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
      runs.push(...matches.filter((name) => name.split(/\s+/).length >= 2 && !/\b(?:university|department|school|laboratory|center|centre|hospital|faculty|institute|edited|reviewed)\b/i.test(name)));
    }
    for (const run of runs) {
      const normalized = run.replace(/\s+/g, " ").trim();
      if (normalized.split(/\s+/).length < 3) continue;
      authorNames = authorNames.filter((existing) => !(normalized.toLocaleLowerCase().includes(existing.toLocaleLowerCase()) && normalized.length > existing.length + 2));
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === normalized.toLocaleLowerCase())) authorNames.push(normalized);
    }
  }
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
    const aggregate = canonical.nodes.some((node) => node.pageStart === 1 && /^(?:edited|reviewed)\s+by\s*:/i.test(node.text?.trim() ?? "")) &&
      affiliation.name.length > 180 &&
      all.filter((candidate) => candidate !== affiliation && candidate.name.length >= 24 &&
        key.includes(affiliationKey(candidate.name))).length >= 2;
    return key.length > 0 && !aggregate && all.findIndex((candidate) => {
      const candidateKey = affiliationKey(candidate.name);
      return candidateKey === key || candidateKey.startsWith(key) || key.startsWith(candidateKey);
    }) === index;
  });
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
    ? reconcileBlockIds(input.previousBlocks, splitReferenceEntries).blocks
    : splitReferenceEntries;
  const annotatedBlocks = reconciled.map((block) =>
    block.translationStatus === "skipped"
      ? { ...block, metadata: { ...block.metadata, translationOutcome: "structural_skip" } }
      : block
  );

  return { paper, sections, blocks: annotatedBlocks };
}
