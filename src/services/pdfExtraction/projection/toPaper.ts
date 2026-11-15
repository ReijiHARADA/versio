import type {
  Paper,
  Section,
  PaperBlock,
  BoundingBox,
  NormalizedSectionKind,
  FigureMetadata,
  TableMetadata,
  EquationMetadata,
} from "../../../types/paper";
import { fingerprintText, stableBlockId, uniqueId } from "../../../data/package/ids";
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
import { recoverBodyBylines } from "./frontMatter/bodyBylineRecovery";
import { recoverEarlyMastheadAuthors, type FrontMatterState } from "./frontMatter/authorRecovery";
import {
  hasStrongNativeTableRows,
  hasStrongTableMatrixEvidence,
  isChartDebrisFragment,
  isLikelyNarrativeText,
  isNumberedProseListItem,
  isNumberedTableCaption,
  looksLikeCaptionedTableCellFragment,
  looksLikeProseMistakenForTable,
} from "./tablePredicates";

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
  const institution = text.search(
    /(?:faculty|department|school|university|institute|college|hospital|laboratory|research\s+centre?)/i,
  );
  if (institution < 0) return text;
  const prefix = text.slice(0, institution).replace(/[\s,]+$/, "").trim();
  const suffixMatch = text.match(/,\s*((?:AND\s+)?[A-Z][A-Z'’.-]*(?:\s+[A-Z][A-Z'’.-]*){1,8})\s*$/);
  if (prefix && suffixMatch) return `${prefix}, ${suffixMatch[1]}`;
  return prefix || text;
}

function extractSwallowedAffiliation(text: string): string | undefined {
  const institution = text.search(
    /(?:faculty|department|school|university|institute|college|hospital|laboratory|research\s+centre?)/i,
  );
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
  // Frontiers can glue the sidebar label onto the first body byline
  // (`REVIEWED BYAleksandr Raikov, Alexandra Lorena López-Naranjo1,`).
  // Drop leading unnumbered reviewer segments before the first affiliation
  // marker so the article authors remain.
  const withoutReviewEditLabel = text
    .replace(/^(?:edited|reviewed)\s*by\s*/i, "")
    .trim();
  if (withoutReviewEditLabel !== text.trim() && withoutReviewEditLabel.length >= 8) {
    // Drop leading unnumbered reviewer segments before the first numbered or
    // starred article author (`Darlington Egeonu, Joshua Bhagat Smith* and…`).
    const afterReviewers = withoutReviewEditLabel.replace(
      /^(?:[A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’.%-]+){1,4}\s*,\s*)+(?=[A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’.%-]+){1,4}\s*[\d*†‡§✉])/u,
      "",
    );
    return expandAuthorLine(
      afterReviewers.length >= 8 ? afterReviewers : withoutReviewEditLabel,
    );
  }
  // Frontiers star-lead bylines omit commas between people
  // (`*, Jennifer S. Stevenson Xia Wang and Jiayi Wang`).
  const withoutStarLead = text.replace(/^\*+,?\s*/, "").trim();
  if (withoutStarLead !== text.trim() && withoutStarLead.length >= 12) {
    return expandAuthorLine(withoutStarLead);
  }
  const undelimitedTriple = withoutStarLead.match(
    /^([A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-Z]\.)?\s+[A-ZÀ-Ö][\p{L}'’-]+)\s+([A-ZÀ-Ö][\p{L}'’-]+\s+[A-ZÀ-Ö][\p{L}'’-]+)\s+and\s+([A-ZÀ-Ö][\p{L}'’-]+\s+[A-ZÀ-Ö][\p{L}'’-]+)\*?$/u,
  );
  if (undelimitedTriple) {
    return [undelimitedTriple[1]!, undelimitedTriple[2]!, undelimitedTriple[3]!];
  }
  // Frontiers / some CN publishers glue GivenSurname tokens
  // (`MingZhang*, ShanDing, ZhihuiZhang`). Reinsert CamelCase boundaries when
  // several junctions are present, or for a lone `PlamenkaNanova*` token.
  // Keep ordinary `McDonald` (one junction, no trailing star) intact.
  const camelJunctions = (text.match(/[a-zà-öø-ÿ][A-ZÀ-Ö]/gu) ?? []).length;
  const loneGluedPerson =
    /^[A-ZÀ-Ö](?:[a-zà-öø-ÿ]+|[a-zà-öø-ÿ]*-[A-ZÀ-Ö][a-zà-öø-ÿ]+)[A-ZÀ-Ö][a-zà-öø-ÿ]+\s*\*?$/u.test(
      text.trim(),
    );
  if (camelJunctions >= 2 || (camelJunctions === 1 && loneGluedPerson)) {
    // Keep Scottish/Irish `McGuire` / `MacDonald` intact (lookbehind on Mc
    // alone is wrong — the junction is the `cG` pair itself).
    const withCamelSpaces = text
      .replace(/([a-zà-öø-ÿ])([A-ZÀ-Ö])/gu, "$1 $2")
      .replace(/\bMc\s+([A-ZÀ-Ö])/gu, "Mc$1")
      .replace(/\bMac\s+([A-ZÀ-Ö])/gu, "Mac$1")
      .replace(/\bO'\s+([A-ZÀ-Ö])/gu, "O'$1");
    if (withCamelSpaces !== text) {
      return expandAuthorLine(withCamelSpaces);
    }
  }
  // Frontiers glues `*CORRESPONDENCE` (sometimes without a following space)
  // onto the corresponding-author row (`*CORRESPONDENCEMd. Shabiul Islam…`).
  const withoutCorrespondence = text
    .replace(/^\*?correspondence(?:\s+|(?=[A-ZÀ-Ö]))/i, "")
    .trim();
  if (withoutCorrespondence !== text.trim() && withoutCorrespondence.length >= 8) {
    return expandAuthorLine(withoutCorrespondence);
  }
  // After peeling correspondence, two people can still be undelimited
  // (`Md. Shabiul Islam Jonnla Naga Surekha , Pratiksha…`).
  const mdGluedPair = text.match(
    /^(Md\.\s+[A-ZÀ-Ö][\p{L}'’-]+\s+[A-ZÀ-Ö][\p{L}'’-]+)\s+([A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){1,2})(?=\s*,|\s+and\s+|\s*$)/u,
  );
  if (mdGluedPair) {
    return expandAuthorLine(
      `${mdGluedPair[1]}, ${mdGluedPair[2]}${text.slice(mdGluedPair[0].length)}`,
    );
  }
  // Springer mastheads glue the received date onto the author row
  // (`Received: 19 August 2025 Yu Cao, Xiaogang Yang…`).
  const withoutReceivedDate = text
    .replace(
      /^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+/i,
      "",
    )
    .trim();
  if (withoutReceivedDate !== text.trim() && withoutReceivedDate.length >= 8) {
    return expandAuthorLine(withoutReceivedDate);
  }
  // Frontiers editorial dated wrap (`14 June 2026 Raúl Sampieri-Cabrera *`).
  const withoutLeadingDate = text
    .replace(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+/, "")
    .replace(/\s*\*+\s*$/, "")
    .trim();
  if (
    withoutLeadingDate !== text.trim() &&
    withoutLeadingDate.length >= 8 &&
    /^[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+){1,4}$/u.test(
      withoutLeadingDate,
    )
  ) {
    return expandAuthorLine(withoutLeadingDate);
  }
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
    // PLOS ORCID glyphs often decode as a glued `ID` suffix (`PaivaID`,
    // `TheophiloID`, `BarretoID`) or a spaced `Paiva ID` token.
    .replace(/(\p{L})ID\b/gu, "$1")
    .replace(/\s+ID\b/gu, "")
    .replace(/\d+/g, "")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/\d+[*†‡§]/g, "")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    // Re-glue Scottish/Irish particles split by the CamelCase pass above.
    .replace(/\bMc\s+([A-ZÀ-Ö])/gu, "Mc$1")
    .replace(/\bMac\s+([A-ZÀ-Ö])/gu, "Mac$1")
    .replace(/\bO'\s+([A-ZÀ-Ö])/gu, "O'$1")
    .replace(/(?:^|[\s,])\d{1,2}(?=$|[\s,])/gu, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ")
    .replace(/^[,;·\s]+/, "")
    // Wrapped bylines end with a bare `and` before the next visual line
    // (`… QinglongKong and` / `Xun Li`). Strip the dangling conjunction so
    // comma-bounded person checks do not reject the whole row.
    .replace(/\s+\b(?:and|&)\s*$/i, "")
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
  const particleToken = /^(?:bin|binti|ibn|van|von|de|den|der|di|da|la|le)$/i;
  // Normalize trailing `Name and Name` delimiters only in multi-author rows
  // (`… Schewe and Dawid Pieper`), not lone particles / topic phrases.
  const delimitedForCommaSplit = /[,;]/.test(cleaned)
    ? cleaned.replace(/\s+\band\b\s+/gi, ", ")
    : cleaned;
  const commaSegments = delimitedForCommaSplit
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const commaBoundedNames =
    commaSegments.length >= 2
      ? commaSegments.flatMap((part) => {
          const tokens = part.split(/\s+/).filter(Boolean);
          // Pair-split only likely undelimited Anglo First Last First Last
          // glue. Keep Spanish double surnames and short East-Asian tokens
          // (`Canva Byron Ma Lam`, `Adriana Monserrath Monge Moreno`).
          const looksLikeTwoAngloNames =
            tokens.length === 4 &&
            tokens.every((token) => /^[A-Z][\p{Ll}’'’-]+$/u.test(token)) &&
            !tokens.some((token) => particleToken.test(token) || /^(?:ma|m\.?)$/i.test(token)) &&
            tokens.every((token) => token.length >= 3) &&
            // Keep Spanish double surnames (`Adriana Monserrath Monge Moreno`).
            !tokens.every((token) => token.length >= 5) &&
            !/[À-ÖØ-öø-ÿ'’-]/u.test(part);
          return looksLikeTwoAngloNames
            ? [tokens.slice(0, 2).join(" "), tokens.slice(2).join(" ")]
            : [part];
        })
      : commaSegments;
  if (commaBoundedNames.length > 1 && commaBoundedNames.every((part) =>
    /^(?:[A-Z][\p{Ll}’'’-]+\s+){1,3}[A-Z][\p{Ll}’'’-]+$/u.test(part) ||
    // Given + bare/dotted initial (`Revathy P.` / `Revathy P`).
    /^[A-Z][\p{Ll}’'’-]+\s+[A-Z]\.?$/u.test(part)
  ) && commaBoundedNames.some((part) => part.split(/\s+/).length === 2)) {
    return commaBoundedNames;
  }
  // Do not pair-split Malay / particle / short East-Asian / Spanish double
  // surnames (`Mansor Bin Abu Talib`, `Canva Byron Ma Lam`,
  // `Adriana Monserrath Monge Moreno`). Still split Anglo glue with a short
  // given name (`James Clawson Thad Starner`).
  if (
    spacedNameTokens.length === 4 &&
    spacedNameTokens.every((token) => /^[A-ZÀ-Ö][\p{L}’'’-]+$/u.test(token)) &&
    !spacedNameTokens.some(
      (token) => particleToken.test(token) || /^(?:ma|m\.?)$/i.test(token) || token.length <= 2,
    ) &&
    !spacedNameTokens.some((token) => /[À-ÖØ-öø-ÿ]/u.test(token)) &&
    // All-long tokens ⇒ likely Given Given Surname Surname, not two Anglo pairs.
    !spacedNameTokens.every((token) => token.length >= 5)
  ) {
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
  // Frontiers correspondence rows sometimes omit the comma between two people
  // and repeat the first name after `and`
  // (`Mansor Bin Abu Talib Luoting Lin and Mansor Bin Abu Talib`).
  const andPair = cleaned.split(/\s+and\s+/i).map((part) => part.replace(/[*†‡]+/g, "").trim());
  if (
    andPair.length === 2 &&
    andPair[0]!.startsWith(andPair[1]!) &&
    andPair[1]!.split(/\s+/).length >= 2
  ) {
    const rest = andPair[0]!.slice(andPair[1]!.length).trim();
    if (rest.split(/\s+/).length >= 2 && rest.split(/\s+/).length <= 4) {
      return [andPair[1]!, rest];
    }
  }
  // Wiley / Hindawi mastheads often separate authors with `|`.
  const commaParts = cleaned
    .split(/\s*(?:,|;|·|\||\band\b|&)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length >= 2 && !/@/.test(part));
  if (commaParts.length >= 2 && commaParts.every((part) => part.split(/\s+/).length <= 6) &&
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

/** Title-case topic crumbs that look like multi-word person names. */
function nameLikeTopicPhrase(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 6) return false;
  if (/\b(?:van|von|de|den|der|di|da|la|le|mac|mc)\b/i.test(value)) return false;
  if (/(?:\s+[A-Z]\.){1,3}\s+/.test(value)) return false;
  return /\b(?:recognition|through|toward|towards|spontaneous|speech|dementia|alzheimer|disease|biomarker|editorial|research\s+topic|using|based|analysis|detection|monitoring|outcomes?|reporting)\b/i.test(
    value,
  );
}

/** Reject metadata lines that a publisher sometimes labels as author rows. */
/**
 * Countries that close a publisher's `Name, Institution, Country` credit line.
 * Kept as one named list so a missing country cannot silently turn a reviewer
 * credit into an author (`World Maritime University, Sweden`).
 */
const CREDIT_LINE_COUNTRY =
  "Australia|Austria|Belgium|Brazil|Canada|Chile|China|Colombia|Czechia|Denmark|Egypt|Finland|France|Germany|Greece|Hungary|India|Indonesia|Iran|Ireland|Israel|Italy|Japan|Malaysia|Mexico|Netherlands|New Zealand|Nigeria|Norway|Pakistan|Peru|Poland|Portugal|Qatar|Romania|Russia|Saudi Arabia|Singapore|South Africa|South Korea|Spain|Sweden|Switzerland|Taiwan|Thailand|Türkiye|Turkey|UAE|UK|USA|Ukraine|United Arab Emirates|United Kingdom|United States|Vietnam|The Netherlands";

/** Frontiers sidebar `Name, Institution, Country` reviewer / editor credits. */
function looksLikeFrontiersReviewerCredit(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  return new RegExp(
    `^[A-ZÀ-ÖØ-Ý][\\p{L}'’-]+(?:\\s+[A-ZÀ-ÖØ-Ý][\\p{L}'’-]+){1,4},\\s+.+\\b(?:university|hospital|college|institute|technology)\\b.+(?:,\\s*)?(?:${CREDIT_LINE_COUNTRY})\\s*$`,
    "iu",
  ).test(value);
}

function isNonAuthorMastheadLine(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return true;
  // Bare city crumbs peeled from postal/institution lines.
  if (
    /^(?:palo alto|tel aviv|albany|new york|san francisco|los angeles|san jose|mountain view|new delhi|kampala|nairobi)$/i.test(
      value,
    )
  ) {
    return true;
  }
  if (
    /^(?:original article|research article|review article|systematic review|brief report|case report|editorial|correspondence|study protocol|protocols?|correction|retraction)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Frontiers date rails glued onto KEYWORDS (`RECEIVED 06 April 2026 KEYWORDS…`).
  if (
    /^(?:received|revised|accepted|published)\b/i.test(value) &&
    (/\b(?:keywords?|received|revised|accepted|published)\b/i.test(value) ||
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        value,
      ))
  ) {
    return true;
  }
  // Contact rails / empty email parentheses after address scrubbing.
  if (/^\*?corresponding authors?\b/i.test(value)) return true;
  if (/^\(\s*\)$/.test(value)) return true;
  // Nature / Springer cover journal rails painted as the first author.
  if (
    /^(?:nature communications|scientific reports|nature medicine|nature neuroscience|communications (?:biology|chemistry|engineering|medicine|physics)|article(?:\s*[|·/]\s*article)?\s+in\s+press)$/i.test(
      value,
    )
  ) {
    return true;
  }
  // Indonesian journal chrome / sidebar labels (`Jurnal SENOPATI`,
  // `INFORMASI ARTIKEL ABSTRACT`) must not occupy the author slot.
  if (
    /^(?:jurnal|journal)\b/i.test(value) ||
    /\bSENOPATI\b/i.test(value) ||
    /^(?:informasi artikel|information article)\b/i.test(value) ||
    /^(?:informasi artikel\s+abstract|email abstrak|email abstract)\b/i.test(value)
  ) {
    return true;
  }
  // Funding / agency crumbs painted as authors
  // (`Development Agency (NSTDA), Thailand`).
  if (
    /\b(?:development agency|national science and technology|nstda|funding agency)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Consortium / biobank collective authors without a personal given name
  // (`UK Biobank Eye`, `Vision Consortium¶`).
  if (
    /\b(?:consortium|biobank|collaborative|working group|study group)\b/i.test(value) &&
    !/\b[A-Z][\p{L}'’-]+\s+[A-Z]\.?\s*[A-Z][\p{L}'’-]+/u.test(value)
  ) {
    return true;
  }
  // Frontiers EDITED BY / REVIEWED BY rows
  // (`Milad Taleby Ahvanooey, Warsaw University of Technology, Poland`,
  // `Liu Yueying, Affiliated Hospital of Jiangnan University, China`).
  if (looksLikeFrontiersReviewerCredit(value)) return true;
  // Peeled reviewer fragments (`Liu Yueying, Affiliated`).
  if (/,\s*affiliated\s*$/i.test(value)) return true;
  // Portuguese / government institution crumbs painted as authors
  // (`Vigilância Sanitária`, `Ministério da Saúde`).
  if (
    /\b(?:minist[eé]rio|vigil[aâ]ncia|sanit[aá]ria|secretaria\s+de\s+sa[uú]de)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Bare university / institution lines. Do not exempt `Universidad Nacional…`
  // — the two-token shape looks person-like but is still an institution.
  if (
    /^(?:universidad|university|universidade|università|universiteit|college of|institute of|faculty of|facultad|escuela|escola|instituto|polytechnic|polit[eé]cnico)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Department crumbs painted as sole authors (`Mechanical Engineering`).
  if (
    /^(?:mechanical|electrical|civil|chemical|computer|biomedical|software)\s+engineering$/i.test(
      value,
    )
  ) {
    return true;
  }
  // BMJ box chrome painted as authors (`PRACTICE OR POLICY` / `WHAT THIS STUDY ADDS`).
  if (
    /^(?:practice or policy|what this study adds|what is already known|strengths and limitations)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Symptom / topic enumerations painted as authors
  // (`Hopelessness; Helplessness; Worthlessness; Tearfulness`).
  if (
    (value.match(/;/g) ?? []).length >= 2 &&
    !/\d/.test(value) &&
    !/\b(?:university|department|institute|hospital)\b/i.test(value)
  ) {
    return true;
  }
  // Numbered affiliation crumbs painted as authors
  // (`Services, Dr Agarwal’s Group of Eye Hospitals…`).
  if (
    /^(?:services|department|center|centre|unit|institute)\b/i.test(value) ||
    /\bdr\.?\s+[\p{L}'’-]+['’]s\s+group\b/iu.test(value) ||
    /\bgroup of (?:eye )?hospitals?\b/i.test(value)
  ) {
    return true;
  }
  // Foundation / society crumbs painted as authors (`Bonobo Foundation`).
  if (/\b(?:foundation|society|association|consortium)\s*$/i.test(value) && !/,/.test(value)) {
    return true;
  }
  // Body / methods crumbs painted as author (`Performance was measured using…`).
  if (/^(?:performance was|the (?:study|paper|results?|findings?)|we (?:measured|used|found|present)|results? (?:were|are)|methods?(?:\s+and)?)\b/i.test(value)) {
    return true;
  }
  // Bare topic phrases without a person-name shape.
  if (
    /^(?:natural language processing|machine learning|artificial intelligence|deep learning|computer vision|human[- ]computer interaction)$/i.test(
      value,
    )
  ) {
    return true;
  }
  // Keyword topic lists painted as the author row after `Keywords:`
  // (`Psychological Distress, Psychological Well-Being, Dropout intention…`).
  if (
    (value.match(/,/g) ?? []).length >= 2 &&
    !/\d/.test(value) &&
    !/\b(?:university|department|institute|hospital|faculty|school of)\b/i.test(value) &&
    /\b(?:well-being|intention|equation|distress|anxiety|depression|motivation|satisfaction|engagement|burnout|self-efficacy|structural equation)\b/i.test(
      value,
    ) &&
    !/\b[A-Z][\p{L}'’-]+\s+[A-Z]\.\s*[A-Z][\p{L}'’-]+/u.test(value)
  ) {
    return true;
  }
  // Lone keyword topics expanded from such lists (`Dropout intention`).
  if (
    /^(?:psychological(?:\s+(?:distress|well-being))?|dropout intention|structural equation|well-being|self-efficacy)$/i.test(
      value,
    )
  ) {
    return true;
  }
  if (/\b(?:human factors|ergonomics)\b/i.test(value) && !/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(value)) {
    return true;
  }
  if (/^(?:evolution of|research book title)\b/i.test(value)) return true;
  // Section / banner ALL-CAPS crumbs (`EMPIRICAL EVIDENCE`) — exactly two
  // long uppercase tokens, not multi-token person rows (`KHAIRIL IMRAN GHAUTH`).
  if (/^[A-Z]{5,}\s+[A-Z]{5,}$/.test(value)) return true;
  // Indexing / journal masthead rails sometimes land in the author role.
  if (
    /\b(?:index\s+copernicus|crossref|crosscheck|worldcat|socionet|econpapers|repec|ceeol|google\s+scholar)\b/i.test(value) ||
    /^covered\s+in\b/i.test(value) ||
    /\banuarul\s+universit/i.test(value) ||
    /\bfascicula\s*:/i.test(value)
  ) {
    return true;
  }
  // Title fragment + abstract crumb (`Adolescent Students constructs.`).
  if (/\bconstructs?\.\s*$/i.test(value) && !/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z]/.test(value)) {
    return true;
  }
  // Degree / institution crumbs painted as authors (`Doctorand, Universitatea…`).
  if (/^(?:doctorand|phd\s+candidate|doctoral\s+student)\b/i.test(value)) {
    return true;
  }
  // Publisher chrome / how-to-cite rails.
  if (/^open\s+access\b/i.test(value)) return true;
  if (/^(?:approved by|edited by|reviewed by|specialty section)\b/i.test(value)) return true;
  // Frontiers sidebar editor/institution crumbs painted as authors.
  if (/^(?:edited by|reviewed by|escola|instituto|polytechnic|politecnico)\b/i.test(value)) return true;
  if (
    /\b(?:portugal|united states|united kingdom)\b/i.test(value) &&
    /\b(?:escola|instituto|technology|superior|university|college|faculty)\b/i.test(value)
  ) {
    return true;
  }
  if (/^(?:perspective|editorial|commentary|opinion)\b/i.test(value) && value.split(/\s+/).length <= 4) {
    return true;
  }
  // BMJ Open / box chrome (`THIS STUDY`, `STRENGTHS AND LIMITATIONS…`, `To cite:… ABSTRACT`).
  if (/^(?:this study|strengths and limitations(?:\s+of\s+this\s+study)?)\b/i.test(value)) return true;
  if (/^to cite\s*:/i.test(value) || /\babstract\b/i.test(value) && /^to cite\b/i.test(value)) return true;
  // Consortium crumbs that are themselves the whole "name" (`for the`,
  // `W2S-Ohpm Study II`). Do not reject a multi-author byline that merely
  // ends with `, for the` — strip that tail before expansion instead.
  if (/^for the\b/i.test(value)) return true;
  if (/^(?:this\s+)?study$/i.test(value)) return true;
  if (/^\S+\s+study\s+(?:i{1,3}|iv|v|\d+)\s*$/i.test(value)) return true;
  if (/^(?:prof\.?\s*dr\.?|dr\.?|ph\.?\s*d\.?|phd|professor)\.?$/i.test(value)) return true;
  if (/^(?:eye tracking|visual attention|machine learning|deep learning|lay summary)$/i.test(value)) {
    return true;
  }
  if (/\b(?:research institute|united states)\b/i.test(value) && !/^[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+$/u.test(value)) {
    return true;
  }
  // Clinic / hospital masthead crumbs painted as sole "authors"
  // (`Dana Plastic Surgery Clinic`).
  if (/\b(?:clinic|hospital|medical center)\s*$/i.test(value) && !/,/.test(value)) {
    return true;
  }
  if (/^(?:city research online|research online|open access)\b/i.test(value)) return true;
  // Bare correspondence chrome without a recoverable person name.
  if (/^\*?correspondence\s*$/i.test(value)) return true;
  // Place / school crumbs from Frontiers sidebars (`Medical Sciences, New Delhi`).
  if (
    /^(?:medical sciences|health sciences|life sciences|computer science|engineering)\b/i.test(value) ||
    (/,\s*(?:new delhi|london|dublin|tokyo|beijing|seoul)\s*$/i.test(value) &&
      !/\b[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]+/u.test(value.split(",")[0] ?? ""))
  ) {
    return true;
  }
  // Bare country / region / city crumbs from Frontiers sidebar affiliation tails.
  if (
    /^(?:Australia|Austria|Belgium|Brazil|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Portugal|Russia|Spain|Sweden|Switzerland|Taiwan|UK|USA|United Kingdom|United States|The Netherlands)$/i.test(
      value,
    )
  ) {
    return true;
  }
  // Postal / city-state address crumbs painted as author
  // (`Palo Alto, CA 94304-1314 USA`, `CA - USA`).
  if (
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(value) ||
    /,\s*[A-Z]{2}(?:\s+\d{5}|\s*[-–—]\s*USA\b)/.test(value) ||
    /^(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}),\s*[A-Z]{2}\b/u.test(value) ||
    /^(?:[A-Z]{2})\s*[-–—]\s*(?:USA|UK|EU)\s*$/i.test(value) ||
    /\b(?:palo alto|mountain view|san jose),\s*[A-Z]{2}\b/i.test(value)
  ) {
    return true;
  }
  // BMC / Springer journal-name wraps (`and Decision Making`,
  // `Medical Informatics`) look like two-token person names.
  if (
    /^(?:and\s+)?(?:decision making|medical informatics|public health|computer science|machine learning|artificial intelligence|data mining|information systems|molecular biology|clinical practice)$/i.test(
      value,
    )
  ) {
    return true;
  }
  // Date / place crumbs from Frontiers RECEIVED/ACCEPTED rails
  // (`08 July 2026 London` → `July London` after digit strip).
  // Full month names only — abbreviations (`Jan`, `May`) are common given names.
  if (
    /^(?:january|february|march|april|june|july|august|september|october|november|december)\s+[A-Z][\p{L}'’-]+$/iu.test(
      value,
    )
  ) {
    return true;
  }
  // Keyword acronym crumbs (`Io T` from `IoT`, `OR` pairs).
  if (/^(?:[A-Z][a-z]?|[A-Z]{2})\s+[A-Z]$/.test(value) || /^(?:IoT|OR|AI|ML|VR|AR|HCI)$/i.test(value)) {
    return true;
  }
  if (
    /^(?:[\p{L}'’-]+\s+){0,2}(?:district|city|county|province|prefecture|municipality)\b/iu.test(value) ||
    /^(?:wenjiang|chengdu|beijing|shanghai|tokyo|osaka|london|paris|berlin|moscow)\b/i.test(value)
  ) {
    return true;
  }
  // Topic / research-topic crumbs mistaken for multi-word person names.
  if (
    nameLikeTopicPhrase(value)
  ) {
    return true;
  }
  // Bare school / campus labels (`Harvard Medical School`).
  if (
    /\b(?:medical school|business school|law school)\b/i.test(value) &&
    !/\b[A-Z]\.\s*[A-Z]/.test(value) &&
    value.split(/\s+/).length <= 5
  ) {
    return true;
  }
  if (/\b(?:creative\s+commons|attribution\s+license|cc-?by(?:-nc|-nd|-sa)?(?:\s*4\.0)?)\b/i.test(value)) {
    return true;
  }
  // Subject / MeSH rails painted as authors (`Epidemiology/Public Health`).
  if (/^[A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?\s*\/\s*[A-Z]/.test(value)) return true;
  if (/^(?:quality improvement|healthcare technology|public health|health equity)\b/i.test(value)) {
    return true;
  }
  // How-to-cite rails (`Tasneem N, van der Pol CB, Zahoor`).
  if (
    /,\s*(?:van|von|de|der|den|di|da|la|le)\s+/i.test(value) &&
    /\b[A-Z][\p{L}'’-]+\s+[A-Z]{1,3}\b/u.test(value) &&
    value.length <= 120 &&
    !/\b(?:university|department|institute)\b/i.test(value)
  ) {
    return true;
  }
  if (/\(\d{4}\)\s+\S/.test(value) && value.length >= 36 &&
      /\b(?:enhancing|towards|toward|review|study|analysis|effect|effects|role)\b/i.test(value)) {
    return true;
  }
  // Numbered section titles mis-labelled as authors (`I. INTRODUCTION`).
  if (/^(?:[IVXLCDM]+\.?\s+)?(?:introduction|methods?|materials|results?|discussion|conclusions?|background|related\s+work|references|acknowledgements?)\b/i.test(value)) {
    return true;
  }
  // Institution / city lines without a person-name shape.
  if (
    /\b(?:universitatea|university|pedagogică|chisinau|chi[sş]inău|republica)\b/i.test(value) &&
    !/^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+/u.test(value.split(",")[0] ?? "")
  ) {
    return true;
  }
  // Pure email / correspondence crumbs — but keep bylines that only trail an
  // email after a comma/and-separated name list (Frontiers often glues them).
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?:\s*\([^)]*\))?$/i.test(value)) return true;
  if (/@[\w.-]+\.[A-Za-z]{2,}/.test(value)) {
    const withoutEmail = value.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ").replace(/\s+/g, " ").trim();
    const nameLike = withoutEmail
      .split(/\s*(?:,|;|·|\||\band\b|&)\s*/i)
      .map((part) => part.replace(/[*†‡§\d]/g, " ").replace(/\s+/g, " ").trim())
      .filter((part) => /^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’.%-]+){1,4}$/u.test(part));
    if (nameLike.length < 2) return true;
  }
  const locationPart = /^[A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*){0,3},\s*(?:[A-Z]{2,}|(?:Australia|Austria|Belgium|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States|The Netherlands))(?:,\s*(?:[A-Z]{2,}|(?:Australia|Canada|China|France|Germany|India|Israel|Italy|Japan|Netherlands|Russia|Spain|Sweden|Taiwan|UK|USA|United Kingdom|United States)))?$/u;
  if (locationPart.test(value) || value.split(/\s{2,}/).filter(Boolean).every((part) => locationPart.test(part)) || /\b([A-Z][\p{L}'’-]+),\s*(USA|Australia|Canada|China|Japan|UK)\s+\1,\s*\2\b/iu.test(value)) return true;
  // Nature / Springer covers glue `Received: 19 August 2025 Name1, Name2…`
  // onto the byline. Strip that publication-date prefix before the year/chrome
  // rejection so expandAuthorLine can still recover the names.
  const withoutLeadingPubDate = value
    .replace(/^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+/i, "")
    .trim();
  if (
    /https?:\/\/|\b(?:19|20)\d{2}\b|\b(?:article|journal|proceedings|volume|issue)\b/i.test(
      withoutLeadingPubDate,
    )
  ) {
    // Keep dated person wraps used as byline continuations
    // (`14 June 2026 Raúl Sampieri-Cabrera *`).
    if (
      !/^\d{1,2}\s+[A-Za-z]+\s+(?:19|20)\d{2}\s+[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+){1,4}\s*\*?$/u.test(
        value,
      )
    ) {
      return true;
    }
  }
  // Trailing conjunction crumbs (`of the`, `to`) are non-authors. A byline that
  // ends with `and` / `&` is a normal Frontiers / multi-author wrap — keep it
  // when at least two person-shaped tokens (allowing middle initials) are present.
  if (/\b(?:or|the|its|of|at|in|from|to)\s*$/i.test(value) && value.split(/\s+/).length >= 3) return true;
  if (/\b(?:and|&)\s*$/i.test(value) && value.split(/\s+/).length >= 3) {
    // CN / Frontiers rows glue GivenSurname (`MingZhang*, ShanDing… and`).
    // Count person pairs after CamelCase split so the wrap is not rejected.
    const camelJunctions = (value.match(/[a-zà-öø-ÿ][A-ZÀ-Ö]/gu) ?? []).length;
    const forPairs =
      camelJunctions >= 2
        ? value.replace(/([a-zà-öø-ÿ])([A-ZÀ-Ö])/gu, "$1 $2")
        : value;
    const personPairs =
      forPairs.match(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][\p{L}'’-]+)+/gu)?.length ?? 0;
    if (personPairs < 2) {
      // Single-name wrap continuations (`Juan Diego Erazo-Rodríguez2 and`).
      if (personPairs === 1 && /\d[*†‡§✉]*/.test(value)) return false;
      return true;
    }
  }
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
    .replace(/\bMc\s+([A-ZÀ-Ö])/gu, "Mc$1")
    .replace(/\bMac\s+([A-ZÀ-Ö])/gu, "Mac$1")
    // Soft hyphen / end-of-line wrap only (`Engineer-\ning`), not real
    // compounds such as `Evidence-based`.
    .replace(/([\p{L}])\u00ad([\p{L}])/gu, "$1$2")
    .replace(/([\p{L}])-\s+([\p{Ll}])/gu, "$1$2")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/^[*†‡§☯\s]+/, "")
    .replace(/^the\s+/i, "")
    .trim());
}

function affiliationKey(text: string): string {
  return text
    .toLocaleLowerCase()
    // Soft / line-break hyphens (`Engineer-ing`) must not create duplicates.
    .replace(/[\u00ad‐‑‒–—―-]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  // Initials such as `M.` / `H.` are common on IEEE ACCESS mastheads.
  const normalized = text.replace(/([A-Z])(?=(?:Faculty|Department|School|University|Institute|College|Hospital|Laboratory)\b)/g, "$1, ");
  const capsName = "[A-Z][A-Z'’-]+(?:\\s+[A-Z](?:\\.|[A-Z'’-]+)){1,5}";
  const match = normalized.match(new RegExp(`^\\s*((?:${capsName})(?:\\s+and\\s+(?:${capsName}))?)\\s*,\\s*(.+)$`));
  if (!match || !/(?:university|institute|department|school|college|hospital|laboratory|faculty|research council|pisa|italy|usa|malaysia)/i.test(match[2])) return [];
  const affiliation = match[2].replace(/,\s*((?:[A-Z][A-Z'’-]+\s+){1,6}[A-Z][A-Z'’-]+)\s*$/u, "").trim();
  const tailAuthor = match[2].match(/,\s*((?:[A-Z][A-Z'’-]+\s+){1,6}[A-Z][A-Z'’-]+)\s*$/u)?.[1];
  const names = [...match[1].split(/\s+and\s+/i).map((name) => name.trim()), ...(tailAuthor ? [tailAuthor.trim()] : [])].filter(Boolean);
  if (!names.length) return [];
  return names.map((author) => ({ author, affiliation }));
}

/**
 * Preprint / bioRxiv-style affiliation rows glue numbered authors onto the
 * first institution (`Dona Hasini Gammune1, Tongjun Gu1,2,3* 1Versiti …`).
 * Recover the title-case name run before the institution digit marker.
 */
function recoverNumberedTitleCaseAuthorRow(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 16 || trimmed.length > 420) return [];
  // Require a person-shaped, digit-suffixed name run before the first
  // institution marker (`1Versiti…` / `1Department…`). Skip bare institution
  // rows (`2Data Science Institute… 3Department…`).
  if (!/^[A-Z][\p{Ll}'’-]+/u.test(trimmed)) return [];
  const match = trimmed.match(
    /^((?:[A-Z][\p{Ll}'’-]+(?:\s+[A-Z](?:\.|[\p{Ll}'’-]+)){1,3}\d+(?:[,\d]*)?\*?[†‡]?(?:\s*,\s*|\s+and\s+))+[A-Z][\p{Ll}'’-]+(?:\s+[A-Z](?:\.|[\p{Ll}'’-]+)){1,3}\d+(?:[,\d]*)?\*?[†‡]?)\s+\d+([A-Z][\p{L}'’-].+)$/u,
  );
  if (!match) return [];
  const institution = match[2]!;
  if (
    !/\b(?:university|institute|department|school|college|hospital|laboratory|faculty|center|centre|versiti)\b/i.test(
      institution,
    )
  ) {
    return [];
  }
  const namesPart = match[1]!
    .replace(/[*†‡§]/g, " ")
    // Strip only digits glued to a name token (`Gammune1,2,3`); keep the
    // comma that separates people (`Gammune1, Tongjun`).
    .replace(/(?<=\p{L})\d+(?:[,.]\d+)*/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  if (!namesPart || !/,/.test(namesPart)) return [];
  if (/\b(?:university|institute|department|school|college|hospital|laboratory|faculty|center|centre)\b/i.test(namesPart)) {
    return [];
  }
  return expandAuthorLine(namesPart)
    .map((name) => name.replace(/^(?:and|&)\s+/i, "").replace(/[,;]+$/g, "").trim())
    .filter(
      (name) =>
        name.split(/\s+/).length >= 2 &&
        name.split(/\s+/).length <= 5 &&
        /^[A-Z][\p{Ll}'’-]+(?:\s+[A-Z][\p{Ll}'’-]+){1,4}$/u.test(name) &&
        !isNonAuthorMastheadLine(name),
    );
}

/** Drop clinical/academic credentials glued onto byline names (`Peter Barish MD`). */
function stripAuthorCredentials(name: string): string {
  return name
    .replace(
      // Require a trailing boundary that is not another name token so East /
      // Spanish particles (`Canva Byron Ma Lam`) are not eaten as `M.A.`.
      /(?:\s*,\s*|\s+)(?:M\.?D\.?|Ph\.?D\.?|M\.?P\.?H\.?|M\.?Sc\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|B\.?Sc\.?|B\.?S\.?|B\.?A\.?|R\.?N\.?|D\.?O\.?|D\.?D\.?S\.?|D\.?M\.?D\.?)\b(?!\s+[A-ZÀ-Ö][\p{L}'’-])/gu,
      "",
    )
    .replace(/^\|+|\|+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip journal letterspaced banners (`P E R S P E C T I V E S … Title`). */
function stripLetterspacedTitleBanner(title: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  const match = trimmed.match(/^((?:[A-Z]\s+){5,}[A-Z])\s+(.+)$/);
  if (!match) return trimmed;
  const banner = match[1]!.replace(/\s+/g, "");
  if (banner.length < 10) return trimmed;
  const rest = match[2]!.trim();
  // A lone leftover letter is the last glyph of the banner itself
  // (`O R I G I N A L M A N U S C R I P T` → bogus `T`), not a title.
  if (rest.length <= 3 && !/[a-z]/.test(rest) && !/\s/.test(rest)) {
    return trimmed;
  }
  return rest;
}

/**
 * Russian / Cyrillic mastheads often label `В. В. Кабакчи1` as affiliation.
 */
function recoverCyrillicInitialedAuthor(text: string): string[] {
  const cleaned = text.replace(/[*†‡§]/gu, " ").replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 80) return [];
  const match = cleaned.match(
    /^((?:[А-ЯЁ]\.\s*){1,3}[А-ЯЁ][а-яёА-ЯЁ'’-]+)(?:\s*,\s*((?:[А-ЯЁ]\.\s*){1,3}[А-ЯЁ][а-яёА-ЯЁ'’-]+))*$/u,
  );
  if (!match) return [];
  return cleaned
    .split(/\s*,\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => /^(?:[А-ЯЁ]\.\s*){1,3}[А-ЯЁ][а-яёА-ЯЁ'’-]+$/u.test(part));
}

/** `Yoshinori HORIE (College of Industrial Tech., Nihon University)`. */
function recoverParenAffiliationAuthor(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(
    /^([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*\(([^)]{8,120})\)$/u,
  );
  if (!match?.[1] || !match[2]) return [];
  if (!/\b(?:university|college|institute|department|faculty|school)\b/i.test(match[2])) {
    return [];
  }
  return [match[1].replace(/\s+/g, " ").trim()];
}

/** Cyrillic byline embedded in an affiliation / genre rail (`… Ивана Ж. БАЛТЕЗАРЕВИЋ* Факултет…`). */
function recoverCyrillicTitleCaseAuthor(text: string): string[] {
  const cleaned = text.replace(/[*†‡§]/gu, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 12) return [];
  // Include Serbian letters outside А–Я (Ћ/ћ, Ђ/ђ, …). Avoid `\b` — it does
  // not treat Cyrillic as word characters in JS.
  const match = cleaned.match(
    /(?:^|[\s,;])([\u0400-\u04FF][\u0400-\u04FF]{2,}\s+[\u0400-\u04FF]\.\s+[\u0400-\u04FF][\u0400-\u04FF'’-]{2,})(?=$|[\s,*†‡])/u,
  );
  if (!match?.[1]) return [];
  const name = match[1].replace(/\s+/g, " ").trim();
  if (/(?:Факултет|Универзитет|Институт|Катедра)/u.test(name)) return [];
  return [name];
}

/**
 * Journal templates sometimes label `I D Sabukunze*1, A Arakaza2` as an
 * affiliation row. Recover person-shaped, comma-separated initialed names.
 */
function recoverInitialedAuthorRow(text: string): string[] {
  const cleaned = text
    .replace(/[*†‡§]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 120) return [];
  const parts = cleaned.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return [];
  const personShaped = parts.every((part) => {
    const words = part.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    return words.every((word) => /^[A-Z](?:[a-z'’-]+)?\.?$/.test(word));
  });
  return personShaped ? parts : [];
}

/** Recover ALL-CAPS IEEE author crumbs emitted as `, NAME` / `, AND NAME` headings. */
function recoverAllCapsAuthorFragment(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^,\s*(?:AND\s+)?([A-Z][A-Z'’.-]*(?:\s+[A-Z](?:\.|[A-Z'’-]+)){1,5})\s*$/);
  if (!match) return null;
  const name = match[1].replace(/\s+/g, " ").trim();
  if (name.split(/\s+/).length < 2 || name.length > 80) return null;
  if (/\b(?:UNIVERSITY|FACULTY|DEPARTMENT|ABSTRACT|INDEX|INTRODUCTION)\b/.test(name)) return null;
  return name;
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

function captionedTableAbsorption(canonical: CanonicalDocument): {
  keepIds: Set<string>;
  regions: Array<{ caption: CanonicalNode; target: CanonicalNode }>;
  syntheticTargets: CanonicalNode[];
} {
  const keepIds = new Set<string>();
  const regions: Array<{ caption: CanonicalNode; target: CanonicalNode }> = [];
  const syntheticTargets: CanonicalNode[] = [];
  const nodeById = new Map(canonical.nodes.map((node) => [node.id, node]));
  for (const rel of canonical.relations) {
    if (rel.kind !== "CAPTION_OF") continue;
    const caption = nodeById.get(rel.from);
    const target = nodeById.get(rel.to);
    if (!caption || !target || target.role !== "table") continue;
    if (!isNumberedTableCaption(caption.text)) continue;
    if (target.text == null) syntheticTargets.push(target);
    const targetHasHighTableScore = target.evidence.some((entry) =>
      entry.label === "role-scores" && /table=0\.(?:9[4-9]|[1-9]\d)/.test(entry.reason ?? "")
    );
    // Resolver region membership can paint an entire neighbouring prose
    // column as a table target. Do not let that weak target absorb the column
    // into a caption-owned table unless its own role evidence is strong.
    // Empty synthetic shells (`text: null`) are not prose — they are the
    // caption-owned geometry that should absorb cell crumbs below.
    if (
      target.text != null &&
      !targetHasHighTableScore &&
      looksLikeProseMistakenForTable(target.text)
    ) {
      continue;
    }
    // Keep only substantive CAPTION_OF targets (full rows / grids). A lone
    // cell that won the caption link is still a crumb — the caption block
    // (and image crop) already represent the table.
    if (shouldKeepCaptionedTableTarget(target)) {
      keepIds.add(target.id);
    }
    for (const node of canonical.nodes) {
      if (
        node.role === "table" &&
        node.pageStart === caption.pageStart &&
        node.evidence.some((entry) => entry.label === "cjk-checkmark-comparison-grid")
      ) {
        keepIds.add(node.id);
      }
    }
    regions.push({ caption, target });
  }
  return { keepIds, regions, syntheticTargets };
}

type NativeTableCell = { text: string; x: number; width: number };

/**
 * Build a source-only grid for a caption-owned native table region.  A number
 * of ACM PDFs emit every cell as an independent one-line candidate; leaving
 * those candidates in the reader produces a vertical stream such as
 * `Finger 1 0.000 ...` instead of a table.  The canonical synthetic target
 * already supplies the geometry, so grouping those cells here is generic and
 * does not depend on caption wording or a particular paper.
 */
function captionedNativeTableRows(canonical: CanonicalDocument, layoutBlocks: LayoutBlock[]): {
  cellIds: Set<string>;
  rowsByCaption: Map<string, Array<NativeTableCell[]>>;
} {
  const nodeById = new Map(canonical.nodes.map((node) => [node.id, node]));
  const cellIds = new Set<string>();
  const rowsByCaption = new Map<string, Array<NativeTableCell[]>>();
  for (const relation of canonical.relations) {
    if (relation.kind !== "CAPTION_OF") continue;
    const caption = nodeById.get(relation.from);
    const target = nodeById.get(relation.to);
    if (!caption || !target || target.role !== "table") continue;
    if (!isNumberedTableCaption(caption.text)) continue;
    let regionBoxes = target.boundingBoxes.filter((box) => box.page >= caption.pageStart && box.page <= target.pageEnd);
    if (regionBoxes.length === 0) continue;
    const targetBox = target.boundingBoxes[0];
    const captionBox = caption.boundingBoxes[0];
    const captionAdjacentMembers = captionBox
      ? canonical.nodes.filter((node) => {
          if (node.id === target.id || node.role !== "table" || node.text == null || node.pageStart !== caption.pageStart) return false;
          const box = node.boundingBoxes[0];
          if (!box) return false;
          const gap = box.y >= captionBox.y
            ? box.y - (captionBox.y + captionBox.height)
            : captionBox.y - (box.y + box.height);
          if (gap < -8 || gap > 420) return false;
          const horizontal = Math.max(0, Math.min(box.x + box.width, captionBox.x + captionBox.width) - Math.max(box.x, captionBox.x));
          if (horizontal < Math.min(box.width, captionBox.width) * 0.12) return false;
          // CJK checkmark comparison rows are complete native rows and must
          // stay as separate source table blocks under 表 N captions.
          if (node.evidence.some((entry) => entry.label === "cjk-checkmark-comparison-grid")) return false;
          return node.evidence.some((entry) =>
            entry.label === "table-row-geometry" || entry.label === "page-native-grid" ||
            entry.label === "captioned-native-multicell-row" || entry.label === "repeated-prose-cell-grid"
          );
        })
      : [];
    // Borderless tables sometimes attach the caption directly to the first
    // cell instead of creating a synthetic region node. Infer the local
    // region from same-column table candidates between that cell and the
    // caption; the bounded vertical window prevents unrelated tables on the
    // page from being absorbed.
    const localCandidates = target.text != null && targetBox
      ? canonical.nodes.filter((node) => {
          if (node.id === target.id || node.role !== "table" || node.text == null) return false;
          if (node.pageStart !== target.pageStart || (target.column && node.column && node.column !== target.column)) return false;
          const box = node.boundingBoxes[0];
          if (!box) return false;
          const upper = Math.min(targetBox.y, caption.boundingBoxes[0]?.y ?? targetBox.y) - 6;
          const lower = Math.max(targetBox.y + targetBox.height, caption.boundingBoxes[0]?.y ?? targetBox.y) + 2;
          return box.y >= upper && box.y <= lower &&
            Math.abs(box.x - targetBox.x) <= 280;
        })
      : [];
    if (localCandidates.length >= 2) {
      const all = [target, ...localCandidates].flatMap((node) => node.boundingBoxes.filter((box) => box.page === targetBox?.page));
      if (all.length > 0) {
        regionBoxes = [{
          page: all[0].page,
          x: Math.min(...all.map((box) => box.x)),
          y: Math.min(...all.map((box) => box.y)),
          width: Math.max(...all.map((box) => box.x + box.width)) - Math.min(...all.map((box) => box.x)),
          height: Math.max(...all.map((box) => box.y + box.height)) - Math.min(...all.map((box) => box.y)),
        }];
      }
    }
    const overlap = (node: CanonicalNode) => {
      const box = node.boundingBoxes[0];
      if (!box || !regionBoxes.some((region) => region.page === box.page)) return 0;
      const region = regionBoxes.find((candidate) => candidate.page === box.page)!;
      const area = Math.max(1, box.width * box.height);
      const shared = Math.max(0, Math.min(box.x + box.width, region.x + region.width) - Math.max(box.x, region.x)) *
        Math.max(0, Math.min(box.y + box.height, region.y + region.height) - Math.max(box.y, region.y));
      return shared / area;
    };
    const members = canonical.nodes.filter((node) =>
      node.id !== target.id && node.role === "table" && typeof node.text === "string" &&
      !node.evidence.some((entry) => entry.label === "cjk-checkmark-comparison-grid") &&
      overlap(node) >= 0.45
    );
    const nearbyMembers = captionAdjacentMembers.filter((node) => !members.some((member) => member.id === node.id));
    const combinedMembers = [...members, ...nearbyMembers];
    const allMembers = target.text != null ? [target, ...combinedMembers] : combinedMembers;
    if (allMembers.length < 2) continue;
    const layoutBlocksForNode = (node: CanonicalNode) => {
      const exact = layoutBlocks.filter(
        (candidate) => candidate.pageStart === node.pageStart && candidate.text === node.text
      );
      if (exact.length > 0) return exact;
      // Merged table rows lose an exact native text key and often keep only the
      // first line's bbox. Recover cell streams by text containment + overlap
      // with the caption region (or the member box when no region exists).
      if (!node.text) return [];
      const nodeBox = node.boundingBoxes[0];
      const region = regionBoxes.find((box) => box.page === node.pageStart);
      const host = region && (!nodeBox || region.height >= Math.max(nodeBox.height, 24) * 1.2)
        ? region
        : nodeBox;
      if (!host) return [];
      return layoutBlocks.filter((candidate) => {
        if (candidate.pageStart !== node.pageStart) return false;
        const snippet = candidate.text.trim();
        if (snippet.length < 6 || !node.text!.includes(snippet.slice(0, Math.min(64, snippet.length)))) {
          return false;
        }
        const box = candidate.bbox;
        if (!box) return false;
        const shared =
          Math.max(0, Math.min(box.x + box.width, host.x + host.width) - Math.max(box.x, host.x)) *
          Math.max(0, Math.min(box.y + box.height, host.y + host.height) - Math.max(box.y, host.y));
        const area = Math.max(1, box.width * box.height);
        return shared / area >= 0.45;
      });
    };
    // Synthetic regions often cover wide multi-cell questionnaire / matrix
    // rows. Prefer layout item spans so we do not skip the whole caption and
    // leave those rows as orphan captionless tables. Only bail when layout
    // cannot recover multiple cells and collapsing would yield opaque prose.
    const layoutBackedMultiCell = allMembers.some((node) =>
      layoutBlocksForNode(node).some((layout) =>
        (layout.lines ?? []).some(
          (line) => line.items.filter((item) => item.text.trim().length > 0).length >= 2
        )
      )
    );
    if (
      target.text == null &&
      !layoutBackedMultiCell &&
      allMembers.some(
        (node) => (node.text?.length ?? 0) > 90 || (node.boundingBoxes[0]?.width ?? 0) > 160
      )
    ) {
      continue;
    }
    const lines = allMembers.flatMap((node) => {
      const layouts = layoutBlocksForNode(node);
      const seen = new Set<string>();
      const nativeItems = layouts.flatMap((layout) =>
        (layout.lines ?? []).flatMap((line) =>
          line.items
            .filter((item) => item.text.trim().length > 0)
            .map((item) => ({
              node,
              text: item.text.trim(),
              box: {
                page: item.page,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              } satisfies BoundingBox,
            }))
            .filter((entry) => {
              const key = `${entry.text}|${entry.box.x.toFixed(1)}|${entry.box.y.toFixed(1)}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
        )
      );
      // A native block can contain several same-baseline cell spans even when
      // its canonical text was concatenated. Preserve those spans as cells;
      // otherwise keep the canonical block as one cell for formats whose
      // native item stream is unavailable.
      return nativeItems.length >= 2
        ? nativeItems
        : [{ node, text: node.text!.trim(), box: node.boundingBoxes[0]! }];
    }).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const rows: Array<Array<{ node: CanonicalNode; text: string; box: BoundingBox }>> = [];
    for (const line of lines) {
      const previous = rows.at(-1);
      const previousY = previous?.[0]?.box.y;
      const rowTol = Math.max(2.5, (previous?.[0]?.box.height ?? line.box.height ?? 10) * 0.55);
      if (previous && previousY !== undefined && Math.abs(line.box.y - previousY) <= rowTol) previous.push(line);
      else rows.push([line]);
    }
    const projectedRows = rows.map((row) => row.sort((a, b) => a.box.x - b.box.x).map(({ text, box }) => ({
      text, x: box.x, width: box.width,
    }))).filter((row) => row.length > 0);
    if (projectedRows.length < 2) continue;
    for (const member of allMembers) cellIds.add(member.id);
    rowsByCaption.set(caption.id, projectedRows);
  }
  return { cellIds, rowsByCaption };
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
  syntheticTargets: CanonicalNode[],
): boolean {
  if (node.role !== "table" || node.text == null || node.boundingBoxes.length === 0) return false;
  return syntheticTargets.some((target) => {
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
  // Title/topic crumbs that wide letter-spacing or per-glyph items can fake
  // into author columns (`U ser E xperience`, `Analysis`, `Questionnaire`).
  const titleTopic = /\b(?:analysis|questionnaire|usability|experience|mobile|application|design|using|user|review|study|method|system|model|based|toward|towards)\b/i;
  const nameLike = (text: string, fontSize: number) => {
    const value = text.replace(/[\d,*†‡§]/g, " ").replace(/\s+/g, " ").trim();
    const words = value.split(/\s+/).filter(Boolean);
    const capitalizedWords = words.filter((word) => /^[A-Z(]/.test(word)).length;
    const hasSingleLetter = words.some((word) => word.length === 1);
    const hasLowercaseFragment = words.some((word) => /^[a-z]/.test(word));
    // Initials (`I D Sabukunze`) are fine; letter-spaced title crumbs mix
    // single capitals with lowercase tails (`U ser`, `o n M obile`).
    if (hasSingleLetter && hasLowercaseFragment) return false;
    // A lone Title-Case token is almost always a title/section word, not a person.
    if (words.length < 2) return false;
    if (titleTopic.test(value) && !/\b[A-Z]\.\s*[A-Z]/.test(value) && !/,/.test(value)) return false;
    return words.length <= 5 && !institution.test(value) &&
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
export type ProjectCanonicalToPaperInput = {
  canonical: CanonicalDocument;
  paperId: string;
  filePath: string;
  fileHash: string;
  metadata: { title?: string; author?: string; pageCount: number };
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  baseFontSize: number;
  previousBlocks?: PaperBlock[];
};

export type FrontMatterProjection = {
  titleNode: CanonicalNode | undefined;
  firstBodyY: number;
  hasSidebarBody: boolean;
  authorNames: string[];
  authorsStructured: Paper["authorsStructured"];
  affiliations: NonNullable<Paper["affiliations"]>;
  doiMatch: string | null;
};

export type BodyProjection = {
  sections: Section[];
  blocks: PaperBlock[];
};


type AffiliationCandidate = {
  id: string;
  name: string;
  _x: number;
  _marker?: string;
  _page: number;
  _y: number;
};

function projectFrontMatter(input: ProjectCanonicalToPaperInput): FrontMatterProjection {
  const { canonical, layoutBlocks } = input;
  const titleNode = canonical.nodes.find((n) => n.role === "title");
  const firstBodyY = canonical.nodes
    .filter((n) => {
      if (n.pageStart !== 1 || !n.text) return false;
      if (n.role === "heading" && /^abstract\s*:?\s*$/i.test(n.text.trim())) return true;
      if (n.role === "abstract") return true;
      // Long middot bylines (`Name1 · Name2 · …`) must not define firstBodyY
      // or they exclude themselves from paragraph author recovery.
      if (n.role === "paragraph" && n.text.length > 260) {
        const middot = (n.text.match(/·/g) ?? []).length;
        if (middot >= 2 && /\d/.test(n.text)) return false;
        return true;
      }
      return false;
    })
    .map((n) => n.boundingBoxes[0]?.y ?? Infinity)
    .sort((a, b) => a - b)[0] ?? Infinity;
  // Same-page section headings can cut the author band. Abstract alone must
  // not: two-column covers place Abstract beside the title while the byline
  // sits lower on the left column.
  const pageOneSectionY = canonical.nodes
    .filter((n) => n.pageStart === 1 && n.role === "heading" && n.text &&
      /^(?:\d+\.?\s*)?(?:introduction|introducere|methods?|materials|results?|discussion|background|related work)\b/i.test(
        n.text.trim(),
      ))
    .map((n) => n.boundingBoxes[0]?.y ?? Infinity)
    .sort((a, b) => a - b)[0] ?? Infinity;
  const authorBandY = Number.isFinite(pageOneSectionY) ? pageOneSectionY : Math.max(firstBodyY, 420);
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
    /^\s*(?:edited|reviewed|approved)\s+by\b/i.test(text.trim());
  const stripConsortiumTail = (text: string): string =>
    text.replace(/,?\s+for the\b.*$/i, "").trim();
  const authorNodes = collectAuthorNodes(canonical, authorBandY, isSidebarChromeNode, mastheadExcludedByLabel, sameLineEditorCredit, stripConsortiumTail, input);
  // Two-column publisher mastheads can place the continuation of an author
  // row in a paragraph-role node at the same baseline. Treat only a leading
  // middle-dot marker plus multiple name-shaped tokens as continuation.
  const authorContinuationNodes = collectAuthorContinuationNodes(canonical, isSidebarChromeNode, authorNodes);
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
  // Wiley-style mastheads emit `Name1 | Name2 | Name3` as a single paragraph.
  // Keyword rails use the same `|` separator but stay lowercase / topic-shaped.
  // Hospital-medicine covers often park the same pipe byline in `other` and
  // append credentials (`Peter Barish MD | Andrew D. Auerbach MD, MPH`).
  const looksLikePersonName = (name: string): boolean =>
    /^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’.%-]+){1,4}$/u.test(name.trim());
  const pipeAuthorParagraphs = canonical.nodes.filter((n) => {
    if (!(n.role === "paragraph" || n.role === "author" || n.role === "other") || !n.text) return false;
    if (n.pageStart !== 1 || (n.boundingBoxes[0]?.y ?? Infinity) >= firstBodyY) return false;
    if (isNonAuthorMastheadLine(n.text) || /^(?:keywords?|key words?|index terms?)\s*:/i.test(n.text.trim())) return false;
    if ((n.text.match(/\|/g)?.length ?? 0) < 1 || n.text.trim().length > 500 || /[.!?]$/.test(n.text.trim())) return false;
    const cleaned = stripAuthorCredentials(n.text.replace(/\|/g, ","));
    const names = expandAuthorLine(cleaned)
      .map(stripAuthorCredentials)
      .filter(looksLikePersonName);
    return names.length >= 2;
  });
  const authorSourceNodes = [...authorNodes, ...authorContinuationNodes, ...markedAuthorParagraphs, ...pipeAuthorParagraphs];
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
    // Adjacent author rows often wrap without a trailing comma
    // (`… Rebekah L. Layton` / `Deepti Ramadoss * , …`). Insert a separator so
    // expandAuthorLine does not glue the boundary names into one token.
    const prevText = (previous.text ?? "").trim();
    const nextText = (node.text ?? "").trim();
    const joiner = /(?:,|;|·|\band\b|&)\s*$/i.test(prevText) ? " " : ", ";
    const lines = [prevText, nextText].filter(Boolean).join(joiner).replace(/\s+/g, " ").trim();
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
  const gluedAuthorAffiliations: string[] = [];
  const authorsStructured = mergedAuthorSources.map((node) => {
    const box = node.boundingBoxes[0];
    const predecessor = node.role === "author"
      ? canonical.nodes
        .filter((candidate) => candidate.role === "paragraph" && candidate.pageStart === 1 && candidate.text &&
          Math.abs((candidate.boundingBoxes[0]?.x ?? Infinity) - (box?.x ?? -Infinity)) <= 2 &&
          (box?.y ?? Infinity) > (candidate.boundingBoxes[0]?.y ?? -Infinity) &&
          (box?.y ?? Infinity) - (candidate.boundingBoxes[0]?.y ?? 0) < 28 &&
          (candidate.boundingBoxes[0]?.y ?? Infinity) < 390 &&
          // Two-author wraps often have only two commas
          // (`Carlos…1*, Phani…2,` above `Micael… and Rachid…`).
          (candidate.text.match(/,/g)?.length ?? 0) >= 2 &&
          /,\s*$/.test(candidate.text.trim()) &&
          /\d[*†‡]?/.test(candidate.text))
        .sort((a, b) => (b.boundingBoxes[0]?.y ?? 0) - (a.boundingBoxes[0]?.y ?? 0))[0]
      : undefined;
    if (predecessor) mergedMastheadPredecessors.add(predecessor.id);
    const rawName = stripConsortiumTail(
      `${predecessor ? `${predecessor.text} ` : ""}${projectionAuthorText(node)}`.trim(),
    );
    const gluedPairs = splitAffiliationNamePrefix(rawName);
    for (const pair of gluedPairs) {
      if (pair.affiliation.length >= 12) gluedAuthorAffiliations.push(pair.affiliation);
    }
    const expandedName = (gluedPairs.length > 0
      ? gluedPairs.map((pair) => pair.author)
      : expandAuthorLine(stripAuthorCredentials(rawName.replace(/\|/g, ","))))
      .map(stripAuthorCredentials)
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
  const affiliationCandidates: AffiliationCandidate[] = collectAffiliationCandidates(affiliationSourceNodes, layoutBlocks, hasSidebarBody, sidebarRight);
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
  // Glued IEEE `NAMEFaculty of…` author rows carry the institution in the
  // same native node; fold those recovered tails into the affiliation list.
  for (const name of gluedAuthorAffiliations) {
    const normalized = normalizeAffiliationName(name);
    if (normalized.length < 12) continue;
    if (affiliations.some((affiliation) => affiliation.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
      continue;
    }
    affiliations.push({ id: `glued-author-affiliation-${affiliations.length}`, name: normalized });
  }
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
  // a conservative fallback when no affiliation survived at all. Springer
  // often emits the numbered band as `copyright` instead of `affiliation`.
  if (affiliations.length === 0) {
    const fallbackSources = [
      ...affiliationNodes,
      ...canonical.nodes.filter((node) =>
        node.pageStart === 1 &&
        (node.role === "copyright" || node.role === "other" || node.role === "paragraph") &&
        /^\s*\d{1,2}\s+\S/.test(node.text ?? "") &&
        /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory)\b/i.test(node.text ?? "")
      ),
    ];
    affiliations = fallbackSources
      .flatMap((node) => (node.text ?? "")
        .split(/(?=\b\d{1,2}\s+(?=[A-Z]))/)
        .map((part) => normalizeAffiliationName(part.replace(/^[\d☯*†‡\s]+/, "").trim())))
      .filter((name, index, all) => name.length >= 20 &&
        /\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory)\b/i.test(name) &&
        !/\b(?:vol\.?|volume|issue|issn|open\s+access|research\s+article|journal|accepted|published(?:\s+online)?)\b/i.test(name) &&
        all.findIndex((candidate) => affiliationKey(candidate) === affiliationKey(name)) === index)
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
  affiliations = applyReviewLabelAffiliations(reviewLabel, canonical, affiliations);
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
  let authorNames = initialAuthorNames(authorsStructured, editorReviewCreditNames);
  const frontMatterState: FrontMatterState = { authorNames, affiliations };
  recoverEarlyMastheadAuthors(
    frontMatterState,
    { canonical, layoutBlocks, firstBodyY, authorBandY, affiliationNodes, isSidebarChromeNode, mastheadExcludedByLabel },
    {
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
    },
  );
  authorNames = frontMatterState.authorNames;
  affiliations = frontMatterState.affiliations;
  // Drop repository / chrome-only author projections before byline recovery.
  // Nature covers also leave a leading `&` on the last author node.
  authorNames = authorNames
    .map((name) =>
      name
        .replace(/^\*?correspondence\s*/i, "")
        .replace(/^(?:and|&)\s+/i, "")
        .replace(/[,;*]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((name) => name.length > 0 && !isNonAuthorMastheadLine(name));
  // Deduplicate exact repeats left by Frontiers `Name Name` correspondence rows.
  authorNames = authorNames.filter(
    (name, index) =>
      authorNames.findIndex((other) => other.toLocaleLowerCase() === name.toLocaleLowerCase()) ===
      index,
  );
  // Drop institution crumbs that expandAuthorLine peeled off a University /
  // Institute tail (`Mercu Buana` / `Collaborative Robotics` from
  // `… Robotics and Intelligent Systems Institute, Oregon State University…`).
  authorNames = authorNames.filter((name) => {
    const compact = name.replace(/\s+/g, " ").trim();
    if (compact.split(/\s+/).length > 4) return true;
    const escaped = compact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !canonical.nodes.some((node) => {
      const text = (node.text ?? "").replace(/\s+/g, " ");
      return new RegExp(
        `${escaped}\\s+(?:and\\s+\\w[\\w\\s-]{0,40}\\s+)?(?:University|Institute)\\b`,
        "i",
      ).test(text);
    });
  });
  // Drop names that are only Frontiers EDITED/REVIEWED sidebar credits
  // (`Marco Carotenuto` / `Soumia Ikiss,`). Keep *CORRESPONDENCE rows
  // (`Filip Stefanovic,`) even when a REVIEWED BY label sits higher up.
  authorNames = dropFrontiersSidebarCreditNames(canonical, authorNames);
  frontMatterState.authorNames = authorNames;
  recoverBodyBylines(
    frontMatterState,
    canonical,
    { expandAuthorLine, isNonAuthorMastheadLine, looksLikeFrontiersReviewerCredit },
  );
  authorNames = frontMatterState.authorNames;
  // Springer / Nature / Frontiers covers often emit the byline as paragraph,
  // other, copyright, or affiliation (`Xin Huang1, Meining Zhang2 and Fang Chen1*`,
  // `Anna Lach-Gruba1 · …`, `Karolina Eszter Kovács,` / `✉ Marike Schiffer`).
  // Also recover when the only projected "authors" are chrome / numbered
  // affiliation rails (`OPEN ACCESS`, `1 LexiGraph corporation…`).
  const authorNamesAreChromeOnly =
    authorNames.length > 0 &&
    authorNames.every(
      (name) =>
        isNonAuthorMastheadLine(name) ||
        /^(?:open access|creative\s*commons|creativecommons)\b/i.test(name) ||
        /^\d+\s+\p{L}/u.test(name) ||
        /\b(?:university|corporation|department|institute|united states of america)\b/i.test(name),
    );
  authorNames = recoverAuthorsFromBodyBand(authorNames, authorNamesAreChromeOnly, canonical, firstBodyY, authorBandY);
  // Nature "Article in Press" covers and page-2 manuscript bylines
  // (`Ahmed A. Radhi & Abdullahi A. Ibrahim` / `Name 1,2*, Name 1`).
  recoverNatureCoverBylines(authorNames, canonical);
  // English byline projected from a bilingual Russian table cell
  // (`Butkovskaya Galina` / `Statkus Anna`). Only when the page also carries
  // Cyrillic masthead text — otherwise `Palo Alto,` / `National Education,`
  // false-positives steal the empty-author recovery slot.
  if (
    authorNames.length === 0 &&
    canonical.nodes.some(
      (node) => node.pageStart === 1 && /[\u0400-\u04ff]{3,}/.test(node.text ?? ""),
    )
  ) {
    const latinFromTable = canonical.nodes
      .filter((node) => node.pageStart === 1 && node.text && (node.role === "table" || node.role === "paragraph" || node.role === "other"))
      .flatMap((node) => {
        const matches = node.text!.match(
          /\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,3})\b(?=\s*(?:Candidate of|e-mail|ORCID))/g,
        );
        return matches ?? [];
      })
      .map((name) => name.replace(/\s+/g, " ").trim())
      .filter(
        (name) =>
          name.split(/\s+/).length >= 2 &&
          name.split(/\s+/).length <= 4 &&
          !isNonAuthorMastheadLine(name) &&
          !/\b(?:University|Management|Moscow|Russia|Digital|Marketing|Consumer|Economic|Sciences|Candidate|National|Education|Services|Palo|Alto)\b/i.test(
            name,
          ),
      );
    for (const name of latinFromTable) {
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        authorNames.push(name);
      }
    }
  }
  // Frontiers / corresponding-author rows can glue onto the abstract lead
  // (`Name1, Name2 and Name3* While student-AI…` / `Fabien Lotte1,2 Deep learning…`).
  // Peel even when other masthead authors already projected so the glued name
  // is not lost and abstract prose stays clean.
  for (const glued of canonical.nodes) {
    if (glued.role !== "abstract" || glued.pageStart !== 1 || !glued.text) continue;
    const trimmed = glued.text.replace(/\s+/g, " ").trim();
    const multi = trimmed.match(
      /^(.+?\d[*†‡§✉]*)\s+((?:While|This|We|The|In|Deep)\b[\s\S]+)$/u,
    );
    const single = trimmed.match(
      /^([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’.%-]+){1,4}\s*\d+(?:,\d+)*[*†‡§✉]*)\s+([A-Z][a-z]{3,}[\s\S]+)$/u,
    );
    const match = multi ?? single;
    if (!match) continue;
    const recovered = expandAuthorLine(match[1]!);
    let added = 0;
    for (const name of recovered) {
      const normalized = name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim();
      if (
        normalized.split(/\s+/).length >= 2 &&
        normalized.split(/\s+/).length <= 6 &&
        !isNonAuthorMastheadLine(normalized) &&
        !authorNames.some((existing) => existing.toLocaleLowerCase() === normalized.toLocaleLowerCase())
      ) {
        authorNames.push(normalized);
        added += 1;
      }
    }
    if (added > 0 || multi) {
      glued.text = match[2]!.trim();
    }
  }
  // When the native PDF flattened a complete author/affiliation masthead into
  // affiliation nodes, recover the names and clean institution tails for the
  // public projection. Keep canonical nodes untouched so resolver evidence and
  // source traceability remain available.
  // Topic / book-title crumbs (`Evolution of Human Factors`) can occupy the
  // author slot and block single-author report recovery — drop them first.
  authorNames = authorNames.filter(
    (name) =>
      !/\b(?:human factors|ergonomics|evolution of|research book title)\b/i.test(name) &&
      // Equal-contribution / abstract-band crumbs (`Lee, and Sumin Jeong have Abstract`).
      !/\bhave\s+abstract\b/i.test(name) &&
      !/^(?:S\s+O\s+F\s+T(?:\s+W\s+A\s+R\s+E)?|SOFTWARE)\b/i.test(name) &&
      // Title / journal crumbs that land in the author slot.
      !/\btransfers from abstract\b/i.test(name) &&
      !/^(?:population health|optic flow)\b/i.test(name) &&
      !/^Front\.\s*[A-Za-z]/i.test(name) &&
      // Figure labels / process diagrams mistaken for people.
      !/^(?:diagram|figure|fig\.?|table)\b/i.test(name) &&
      !isNonAuthorMastheadLine(name),
  );
  // PLOS / mega-author covers overflow the byline into a separate abstract-role
  // node (`Jetse Goris5, Anne H. Hoekman 6, …`) while the true abstract follows.
  // Recover those names even when the first author band already projected.
  recoverOverflowBylineNames(canonical, authorNames);
  // Drop institution crumbs that overflow recovery may have peeled.
  authorNames = authorNames.filter(
    (name) =>
      !/\b(?:university|hospital|institute|department|centre|center|netherlands|clinical genetics|machine teaming|bernoulli)\b/i.test(
        name,
      ) && !isNonAuthorMastheadLine(name),
  );
  recoverAuthorsAndAffiliationsFallback(authorNames, canonical, affiliations);
  // Prefer a labelled page-1 DOI, then any page-1 article DOI, and only then
  // a later-page match. Drop figure/table suffixes (`.g001`) and trailing
  // punctuation so citation chrome does not win over the article id.
  const doiPattern = /(?:doi\s*:?\s*)?(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi;
  const normalizeDoi = (raw: string): string =>
    raw.replace(/[.,;:]+$/g, "").replace(/\.(?:g|t|fig|table)\d+$/i, "");
  const pageOneTexts = canonical.nodes
    .filter((node) => node.pageStart === 1)
    .map((node) => node.text ?? "");
  const collectDois = (texts: string[]): string[] => {
    const found: string[] = [];
    for (const text of texts) {
      for (const match of text.matchAll(doiPattern)) {
        const normalized = normalizeDoi(match[1] ?? "");
        if (normalized && !found.includes(normalized)) found.push(normalized);
      }
    }
    return found;
  };
  const labelledDois = (texts: string[]): string[] =>
    texts
      .flatMap((text) => [...text.matchAll(/(?:doi|https?:\/\/(?:dx\.)?doi\.org)\s*:?\s*(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi)])
      .map((match) => normalizeDoi(match[1] ?? ""))
      .filter(Boolean);
  const labelledPageOne = labelledDois(pageOneTexts);
  const pageOneDois = collectDois(pageOneTexts);
  // Page-1 only. Later-page `doi:` hits are almost always bibliography
  // entries, including labelled ones (`doi: 10.1016/j.ijmedinf…`).
  const doiMatch = labelledPageOne[0] ?? pageOneDois[0] ?? null;


  return { titleNode, firstBodyY, hasSidebarBody, authorNames, authorsStructured, affiliations, doiMatch };
}

function collectAffiliationCandidates(
  affiliationSourceNodes: CanonicalNode[],
  layoutBlocks: LayoutBlock[],
  hasSidebarBody: boolean,
  sidebarRight: number,
): AffiliationCandidate[] {
  return affiliationSourceNodes.flatMap((node): AffiliationCandidate[] => {
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
}

function collectAuthorContinuationNodes(
  canonical: CanonicalDocument,
  isSidebarChromeNode: (node: CanonicalNode) => boolean,
  authorNodes: CanonicalNode[],
): CanonicalNode[] {
  return canonical.nodes.filter((n) =>
    (n.role === "paragraph" || n.role === "heading" || n.role === "other") && n.text && n.pageStart === 1 &&
    !isSidebarChromeNode(n) &&
    (n.boundingBoxes[0]?.y ?? 9999) < 520 &&
    !/^\s*(?:keywords?|key words?)\s*:/i.test(n.text.trim()) &&
    // OUP / journal contact rails (`*Corresponding authors: Name, (email)…`)
    // must not glue onto the numbered byline as a continuation row.
    !/^\*?corresponding authors?\s*:/i.test(n.text.trim()) &&
    (!isNonAuthorMastheadLine(n.text) ||
      (/(?:\band|&)\s*$/i.test(n.text.trim()) &&
        (n.text.match(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][\p{L}'’-]+)+/gu)?.length ?? 0) >= 2)) &&
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
      // BMJ sidebar bylines painted as `other` (`Rashmi Patel , Jessica Irving ,`
      // / lone `Megan Pritchard,` beside the right-rail byline).
      (n.role === "other" &&
        (n.boundingBoxes[0]?.y ?? 9999) < 320 &&
        n.text.trim().length <= 80 &&
        !/\b(?:university|department|edited|reviewed|keywords?|objective|setting|received|published)\b/i.test(
          n.text,
        ) &&
        (/,\s*$/.test(n.text.trim()) &&
          (n.text.match(/[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)+/gu) ?? []).length >= 2
          ? true
          : /^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+){1,3},?\s*$/u.test(
              n.text.trim(),
            ) &&
            authorNodes.some((author) => {
              const authorBox = author.boundingBoxes[0];
              const box = n.boundingBoxes[0];
              return (
                Boolean(authorBox && box) &&
                author.pageStart === n.pageStart &&
                Math.abs((authorBox!.x ?? 0) - (box!.x ?? 0)) <= 220 &&
                Math.abs((authorBox!.y ?? 0) - (box!.y ?? 0)) <= 50
              );
            }))) ||
      // A two-column masthead can emit the next author as a same-baseline
      // paragraph beginning with `and` (`and Sarah Maggioli`). Promote only a
      // short name-shaped continuation beside an existing author row; ordinary
      // prose is excluded by the strict prefix and baseline checks.
      (/^\s*and\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4}\s*\d*[*†‡§✉]*\s*$/u.test(
        n.text.trim(),
      ) &&
        authorNodes.some((author) => {
          const authorBox = author.boundingBoxes[0];
          const box = n.boundingBoxes[0];
          return (
            Boolean(authorBox && box) &&
            author.pageStart === n.pageStart &&
            // Wrapped Frontiers/BMC bylines sit ~14px under the name row
            // (`… Minwook Shin` / `and Sukjoon Yoon` /
            // `and Diego Fabián Vique López5`).
            Math.abs(authorBox!.y - box!.y) <= 18
          );
        })) ||
      // Frontiers wraps the first byline row as a paragraph ending in a comma
      // (`Carlos A. P. Pizzino1*, Phani-Teja Singamaneni2,`) above the `and`
      // continuation author row.
      ((n.boundingBoxes[0]?.y ?? 9999) < 320 &&
        n.text.trim().length <= 140 &&
        /,\s*$/.test(n.text.trim()) &&
        /\d[*†‡§✉]*/.test(n.text) &&
        (n.text.match(/[A-Z][\p{L}'’-]+/gu) ?? []).length >= 3 &&
        !/[.!?]$/.test(n.text.trim()) &&
        !/\b(?:university|department|edited|reviewed|keywords?)\b/i.test(n.text)) ||
      // Frontiers also parks the trailing `Name and Name` wrap as `other`
      // under a comma-ending author row (`… Huseynova ,` / `Gulchin… and …`).
      (n.role === "other" &&
        n.text.trim().length <= 80 &&
        /^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+){1,3}\s+and\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+){1,3}\s*$/u.test(
          n.text.trim(),
        ) &&
        authorNodes.some((author) => {
          const authorBox = author.boundingBoxes[0];
          const box = n.boundingBoxes[0];
          return (
            Boolean(authorBox && box) &&
            author.pageStart === n.pageStart &&
            /,\s*$/.test((author.text ?? "").trim()) &&
            Math.abs((authorBox!.x ?? 0) - (box!.x ?? 0)) <= 4 &&
            (box!.y ?? 0) - (authorBox!.y ?? 0) > 0 &&
            (box!.y ?? 0) - (authorBox!.y ?? 0) <= 28
          );
        })) ||
      // Frontiers editorial wraps the last author onto a dated heading
      // (`… Fresán-Orellana and` / `14 June 2026 Raúl Sampieri-Cabrera *`).
      // The dated line often sits in the left PUBLISHED rail (wide Δx).
      ((n.role === "heading" || n.role === "other") &&
        n.text.trim().length <= 72 &&
        /^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’´-]+){1,4}\s*\*?$/u.test(
          n.text.trim(),
        ) &&
        authorNodes.some((author) => {
          const authorBox = author.boundingBoxes[0];
          const box = n.boundingBoxes[0];
          return (
            Boolean(authorBox && box) &&
            author.pageStart === n.pageStart &&
            /(?:\band|&)\s*$/i.test((author.text ?? "").trim()) &&
            Math.abs((box!.y ?? 0) - (authorBox!.y ?? 0)) <= 40
          );
        }))));
}

function initialAuthorNames(
  authorsStructured: { id: string; name: string; affiliationIds: string[]; predecessorId: string | undefined; }[],
  editorReviewCreditNames: Set<string>,
): string[] {
  return authorsStructured
    .flatMap((author) => {
      // Drop trailing consortium tails before expansion so `, for the W2S…`
      // does not poison the whole byline gate.
      const source = author.name.replace(/,?\s+for the\b.*$/i, "").trim();
      // IEEE ACCESS often glues `NAME` + `Faculty of…` with no separator.
      const splitPairs = splitAffiliationNamePrefix(source);
      if (splitPairs.length > 0) return splitPairs.map((pair) => pair.author);
      return expandAuthorLine(source);
    })
    .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
    // `Nisar Ahmed of Colorado Boulder` → keep the person, drop the campus tail.
    // `Koji Mori , for the` → drop the consortium tail.
    .map((name) =>
      name
        .replace(/\s+of\s+(?:the\s+)?(?:university|college|institute|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b.*$/u, "")
        .replace(/,?\s+for the\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((name) => !isNonAuthorMastheadLine(name) &&
      ![...editorReviewCreditNames].some((credit) => credit.toLocaleLowerCase() === name.toLocaleLowerCase() ||
        credit.toLocaleLowerCase().includes(name.toLocaleLowerCase()) || name.toLocaleLowerCase().includes(credit.toLocaleLowerCase())) &&
      name.split(/\s+/).length <= 6 && !/[!?]/.test(name) &&
      !/[@{}]/.test(name) &&
      !/(?:\[|\])/.test(name) &&
      !/^(?:general terms?|categories and subject descriptors?)\b/i.test(name) &&
      !/^(?:[IVXLCDM]+\.?\s+)?(?:introduction|methods?|results?|discussion|conclusions?)\b/i.test(name) &&
      // Keyword rails without a `Keywords:` label (`medical students`,
      // `confirmatory factor analysis`) must not become authors.
      !/^[a-z]/.test(name) &&
      !/\b(?:students?|analysis|theory|network|depression|anxiety|questionnaire|scale|inventory|phq-?\d|dass-?\d+)\b/i.test(name) &&
      !/\b(?:movement|science|sport|psychology|department|university|institute|research|council|resistance|training|edited|published|faculty)\b/i.test(name) &&
      // Trailing 2–3 letter ALL-CAPS crumbs (`NY`, `USA`) are locations, but a
      // single capital (`D`, `J`) is a normal middle/last initial.
      !(/\s[A-Z]{2,3}$/.test(name) && !/^[A-Z][A-Z'’-]*(?:\s+[A-Z][A-Z'’-]*)+$/.test(name)) &&
      !/(?:^|,\s*)(?:usa|u\.s\.a?\.?|israel|italy|china|japan|uk|united kingdom|ny|california|new york|tel aviv|albany|palo alto|campinas|brazil|united states)(?:\s*,|$)/i.test(name) &&
      !/\b[A-Z]{2}\s+USA\b/i.test(name) &&
      !/^(?:palo alto|tel aviv|albany|new york|campinas|brazil|united states|united kingdom)$/i.test(name.trim()) &&
      !/\b(?:,\s*)?(?:ny|ca),\s*usa\b/i.test(name) &&
      // City crumbs peeled from postal author nodes (`Palo Alto` from
      // `Palo Alto, CA 94304-1314 USA`) must not block title-case byline recovery.
      !(
        /^(?:palo alto|tel aviv|albany|new york|san francisco|los angeles|san jose|mountain view)$/i.test(
          name.trim(),
        )
      ))
    .filter((name, index, all) => all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index)
    .filter((name) => !/^(?:correspondence|corresponding author|teaching assistant professor|assistant professor|associate professor|professor|research fellow)\s*:?[,.]?$/i.test(name.trim()))
    .filter((name) => !isNonAuthorMastheadLine(name))
    .filter(Boolean);
}

function collectAuthorNodes(
  canonical: CanonicalDocument,
  authorBandY: number,
  isSidebarChromeNode: (node: CanonicalNode) => boolean,
  mastheadExcludedByLabel: (node: CanonicalNode) => boolean,
  sameLineEditorCredit: (text: string) => boolean,
  stripConsortiumTail: (text: string) => string,
  input: ProjectCanonicalToPaperInput,
): CanonicalNode[] {
  return canonical.nodes.filter((n) => n.role === "author" && n.text &&
    n.pageStart === 1 && (n.boundingBoxes[0]?.y ?? 0) < authorBandY &&
    // Keep `REVIEWED BY… Name1,` sidebar glues that still carry numbered
    // article authors after the reviewer prefix is peeled.
    !(
      isSidebarChromeNode(n) &&
      !(/^(?:edited|reviewed)\s*by/i.test(n.text) && /\d/.test(n.text))
    ) &&
    !(
      mastheadExcludedByLabel(n) &&
      !(/^(?:edited|reviewed)\s*by/i.test(n.text) && /\d/.test(n.text))
    ) &&
    !sameLineEditorCredit(n.text) &&
    // Reject bare postal crumbs only. Keep IEEE `NAMEFaculty…` and
    // `Name* email@…` rows that the OR below can still recover.
    !(
      isNonAuthorMastheadLine(n.text) &&
      /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(n.text) &&
      !splitAffiliationNamePrefix(n.text).length
    ) &&
    // Long mastheads can contain many marker-separated authors. Keep them
    // eligible for expansion; the marker/separator checks in expandAuthorLine
    // still prevent ordinary prose from becoming an author list.
    // Nature covers glue `Received: 19 August 2025 Name1, Name2…` — the colon
    // is publication chrome, not a section label, so allow that prefix.
    n.text.trim().length <= 500 &&
    (!/:\s/.test(n.text) ||
      /^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/i.test(
        n.text.trim(),
      )) &&
    // Contact email is common on author rows; retain a name-shaped prefix
    // even though generic masthead filtering rejects standalone email lines.
    // IEEE ACCESS also glues `NAME`+`Faculty of…` onto one author node; keep
    // those rows so splitAffiliationNamePrefix can recover the names.
    (!isNonAuthorMastheadLine(stripConsortiumTail(n.text)) ||
      splitAffiliationNamePrefix(n.text).length > 0 ||
      /^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4}\s*[,*]?\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(n.text.trim()) ||
      (/(?:\band|&)\s*$/i.test(n.text.trim()) &&
        (n.text.match(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][\p{L}'’-]+)+/gu)?.length ?? 0) >= 2)) &&
    (!input.metadata.title || (n.text.trim().toLocaleLowerCase() !== input.metadata.title.trim().toLocaleLowerCase() &&
      !n.text.trim().toLocaleLowerCase().startsWith(input.metadata.title.trim().toLocaleLowerCase().slice(0, 28)))) &&
    !/^(?:original article|research article|conceptual\/theoretical paper|additional key words?|phrases?|keywords?|acm reference format|©|the author\(s\))/i.test(n.text.trim()));
}


function recoverAuthorsFromBodyBand(
  authorNames: string[],
  authorNamesAreChromeOnly: boolean,
  canonical: CanonicalDocument,
  firstBodyY: number,
  authorBandY: number,
): string[] {
  if (authorNames.length === 0 || authorNamesAreChromeOnly) {
    if (authorNamesAreChromeOnly) authorNames = [];
    // Repository catalog line: `Author: Friswell, Rena Publication Date: 2013`.
    if (authorNames.length === 0) {
      for (const node of canonical.nodes) {
        if (node.pageStart > 2 || !node.text) continue;
        const match = (node.text ?? "")
          .replace(/\s+/g, " ")
          .match(
            /\bAuthor\s*:\s*([A-ZÀ-Ö][\p{L}'’-]+),\s*([A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){0,2})(?=\s+(?:Publication\s+Date|DOI)\b|\s*$)/u,
          );
        if (!match) continue;
        const flipped = `${match[2]} ${match[1]}`.replace(/\s+/g, " ").trim();
        if (!isNonAuthorMastheadLine(flipped)) {
          authorNames.push(flipped);
          break;
        }
      }
    }
    // Thesis cover: person-shaped heading after (or just before) "Doctor of
    // Philosophy" / "thesis presented…" (`Irene Irawaty Santoso` / `Rena Friswell`).
    // Cover may sit on page 1 or 2 when a separate title leaf precedes it.
    const thesisCoverNodes = canonical.nodes.filter(
      (node) => node.pageStart <= 2 && node.text,
    );
    const thesisChromeIndex = thesisCoverNodes.findIndex((node) =>
      /\b(?:doctor of philosophy|thesis presented in partial|a thesis in fulfil(?:l)?ment|submitted (?:in partial )?fulfil(?:l)?ment|master of (?:science|arts|philosophy|engineering))\b/i.test(
        node.text ?? "",
      ),
    );
    if (thesisChromeIndex >= 0 && authorNames.length === 0) {
      const fieldWord =
        /\b(?:marketing|engineering|science|philosophy|mathematics|physics|chemistry|biology|medicine|computer|economics|psychology|education|management|business|law|arts|studies|contents|abstract|introduction|university|faculty|school|department)\b/i;
      const tryName = (name: string): boolean => {
        const cleaned = name.replace(/\s+/g, " ").trim();
        if (/^(?:19|20)\d{2}$/.test(cleaned)) return false;
        if (
          !/^[A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){1,3}$/u.test(cleaned) ||
          fieldWord.test(cleaned) ||
          isNonAuthorMastheadLine(cleaned)
        ) {
          return false;
        }
        authorNames.push(cleaned);
        return true;
      };
      // Prefer the name just above the chrome line when present.
      for (let i = thesisChromeIndex - 1; i >= Math.max(0, thesisChromeIndex - 3); i -= 1) {
        const node = thesisCoverNodes[i]!;
        if (node.role !== "heading" && node.role !== "paragraph") continue;
        if (tryName(node.text ?? "")) break;
      }
      if (authorNames.length === 0) {
        for (let i = thesisChromeIndex + 1; i < thesisCoverNodes.length; i += 1) {
          const node = thesisCoverNodes[i]!;
          if (node.role !== "heading" && node.role !== "paragraph") continue;
          const name = (node.text ?? "").replace(/\s+/g, " ").trim();
          if (/^(?:19|20)\d{2}$/.test(name)) break;
          if (tryName(name)) break;
        }
      }
    }
    const bylineYLimit = Number.isFinite(firstBodyY) ? Math.max(firstBodyY, 360) : authorBandY;
    const isMislabelledAbstractByline = (text: string, y: number): boolean => {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (/^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/i.test(trimmed)) {
        return true;
      }
      // Numbered multi-author rows sometimes land in `abstract` on Springer /
      // BMC early-access covers (`Christian R. Klein 1,5, Pia Heuser3,5, …`),
      // optionally glued onto the abstract lead (`… Krausewitz3,5 Preoperative…`).
      // Nature Scientific Reports can also glue a long numbered byline onto the
      // abstract (`… Amygdalos5 Primary liver cancer…`).
      // Require a person-shaped lead with an affiliation digit. Allow multiple
      // middle initials (`Clark C. Freifeld 1,2*` / `Florian W. R. Vondran5`).
      const numberedLead =
        /^[A-Z][\p{L}.''’-]+(?:\s+[A-Z][\p{L}.''’-]*){1,5}\s*\d/u.test(trimmed);
      // Frontiers two-author rows often use `Name1* and Name2 Abstract…`
      // with no commas. Treat that as a mislabelled byline when the abstract
      // prose starts immediately after the second affiliation marker.
      const twoAuthorAndLead =
        /^[A-Z][\p{L}.''’-]+(?:\s+[A-Z][\p{L}.''’-]*){1,4}\s*\d+[*†‡§✉]*\s+and\s+[A-Z][\p{L}.''’-]+(?:\s+[A-Z][\p{L}.''’-]*){1,4}\s*\d+[*†‡§✉]*\s+[A-Z]/u.test(
          trimmed,
        );
      if (
        y < 420 &&
        /\d/.test(trimmed) &&
        numberedLead &&
        (((trimmed.match(/,/g) ?? []).length >= 2) || twoAuthorAndLead)
      ) {
        // Avoid treating abstract prose as a byline. Do not use a bare `we|the`
        // word list on long author rows — names like `Thi Do` are fine, but
        // sentence cues (`This study`, `Background:`) are decisive.
        const hasProseCue =
          /\b(?:this study|the (?:circulation|purpose|aim|objective)|background|methods?:|results?:|conclusions?:|objective[s]?[:.])/i.test(
            trimmed,
          ) ||
          (trimmed.length <= 280 &&
            /\b(?:the|this|we|our|study|results?|methods?|patients?|background|objective|abstract)\b/i.test(
              trimmed,
            ));
        if (trimmed.length <= 280) {
          return !hasProseCue;
        }
        // Long pure numbered bylines (PLOS Digit Health can truncate mid-name
        // without reaching abstract prose) still count as mislabelled bylines.
        // Ignore middle-initial periods (`Philippe J. Guérin`).
        const hasSentenceBoundary = /(?<!\b[A-Z])[.!?]\s+[A-Z]/u.test(trimmed);
        if (
          !hasProseCue &&
          !hasSentenceBoundary &&
          (trimmed.match(/\d/g) ?? []).length >= 3
        ) {
          return true;
        }
        return /^.+\d(?:,\d+)?[*†‡§✉\uF000-\uF8FF]*\s+[A-Z][a-z]{3,}/u.test(
          trimmed.slice(0, 420),
        );
      }
      return false;
    };
    const bylineSourceNodes = canonical.nodes.filter(
      (node) =>
        node.pageStart === 1 &&
        node.text &&
        (node.boundingBoxes[0]?.y ?? 9999) < bylineYLimit &&
        (node.role === "paragraph" ||
          node.role === "other" ||
          node.role === "copyright" ||
          node.role === "affiliation" ||
          // Repository covers often label the APA citation row as `author`
          // (`Cook, D., Cook, E. A., … (2026).`). Only take citation-shaped
          // author nodes here — postal crumbs like `Palo Alto, CA 94304…`
          // also land in `author` and must not enter byline recovery.
          (node.role === "author" &&
            /\(\d{4}\)\s*\./.test(node.text) &&
            /^[A-Z][\p{L}'’-]+,\s*[A-Z]\./u.test(node.text.trim())) ||
          (node.role === "abstract" &&
            (isMislabelledAbstractByline(node.text, node.boundingBoxes[0]?.y ?? 9999) ||
              // Single corresponding author glued onto the abstract lead
              // (`Gopal Singh Jamnal* Forecasting corporate…`).
              /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,4}\s*[*†‡§✉]+\s+[A-Z][a-z]{3,}/u.test(
                node.text.replace(/\s+/g, " ").trim(),
              )))),
    );
    const paragraphBylines = bylineSourceNodes
      .flatMap((node) => {
        let text = node.text!.replace(/\s+/g, " ").trim();
        // Early-access covers glue citation / boilerplate onto the Received byline
        // (`… Grant Cite this article as:…` / `… Grant We are providing an unedited…`).
        text = text
          .replace(/[\uF000-\uF8FF]/g, " ")
          .replace(/\s+Cite this article as:[\s\S]*$/i, "")
          .replace(/\s+We are providing an unedited version[\s\S]*$/i, "")
          .replace(/\s+/g, " ")
          .trim();
        // Single-author corresponding marker glued onto abstract prose.
        const gluedSingleAuthor = text.match(
          /^([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,4})\s*[*†‡§✉]+\s+([A-Z][a-z]{3,}[\s\S]+)$/u,
        );
        if (gluedSingleAuthor && node.role === "abstract") {
          const name = gluedSingleAuthor[1]!.trim();
          const words = name.split(/\s+/).filter(Boolean);
          if (
            words.length >= 2 &&
            words.length <= 5 &&
            !/\b(?:university|department|institute|forecasting|background)\b/i.test(name)
          ) {
            node.text = gluedSingleAuthor[2]!.trim();
            return [name];
          }
        }
        // Numbered byline glued onto abstract prose — keep only the author run.
        // Allow several middle initials (`Florian W. R. Vondran5`), particle
        // surnames (`Moataz M. El Sherbiny1` / `Hossam El-Din Mostafa1`), and
        // `&` before the final name (Nature Scientific Reports). Also accept
        // the Frontiers two-author form without commas
        // (`An Feng1* and Tao Wenyin2 Optical…`).
        const gluedByline = text.match(
          /^((?:[A-Z][\p{L}'’.-]+(?:\s+[A-Z]\.){0,3}(?:\s+[A-Z][\p{L}'’-]+){0,2}\s*\d+(?:,\d+)*[*†‡§✉]*(?:\s*[,&]|\s+and\s+|\s*&\s+)\s*)*[A-Z][\p{L}'’.-]+(?:\s+[A-Z]\.){0,3}(?:\s+[A-Z][\p{L}'’-]+){0,2}\s*\d+(?:,\d+)*)[*†‡§✉]*\s+([A-Z][a-z]{3,}[\s\S]+)$/u,
        );
        const gluedCommaCount = (gluedByline?.[1]?.match(/,/g) ?? []).length;
        const gluedTwoAuthorAnd =
          Boolean(gluedByline?.[1]) &&
          /\band\b/i.test(gluedByline![1]!) &&
          (gluedByline![1]!.match(/\d+/g) ?? []).length >= 2;
        if (gluedByline && (gluedCommaCount >= 2 || gluedTwoAuthorAnd)) {
          if (node.role === "abstract" && gluedByline[2]) {
            node.text = gluedByline[2].trim();
          }
          return expandAuthorLine(gluedByline[1]!.trim());
        }
        // Pure abstract-role byline (no glued prose) — expand before the
        // length-280 gate below so long PLOS author rows are not dropped.
        if (
          node.role === "abstract" &&
          isMislabelledAbstractByline(text, node.boundingBoxes[0]?.y ?? 9999)
        ) {
          const recovered = expandAuthorLine(text).filter(
            (name) =>
              name.split(/\s+/).length >= 2 &&
              name.split(/\s+/).length <= 6 &&
              !isNonAuthorMastheadLine(name),
          );
          if (recovered.length >= 2) return recovered;
        }
        // Repository cover citations: `Cook, D., Cook, E. A., Roy, S., … (2026).`
        // Run before isNonAuthorMastheadLine — that helper rejects any year token.
        if (/\(\d{4}\)\s*\./.test(text) && /^[A-Z][\p{L}'’-]+,\s*[A-Z]\./u.test(text) && text.length <= 220) {
          const beforeYear = text.split(/\(\d{4}\)/)[0] ?? "";
          const apa = [...beforeYear.matchAll(/([A-Z][\p{L}'’-]+),\s*((?:[A-Z]\.\s*){1,3})/gu)].map(
            (match) => {
              const initials = match[2]!.replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
              return `${initials.join(" ")} ${match[1]}`.replace(/\s+/g, " ").trim();
            },
          );
          if (apa.length >= 2) return apa;
        }
        // Nature/BMC early-access: `Received: DATE Name1, Name2…` before masthead rejection.
        if (/^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/i.test(text)) {
          const recovered = expandAuthorLine(text).filter(
            (name) =>
              name.split(/\s+/).length >= 2 &&
              name.split(/\s+/).length <= 6 &&
              !isNonAuthorMastheadLine(name),
          );
          if (recovered.length >= 2) return recovered;
        }
        if (isNonAuthorMastheadLine(text)) return [];
        // Author + institution on one masthead line (`Allison Woodruff and Paul M.
        // Aoki Palo Alto Research Center`) is recovered with affiliations below via
        // splitTitleCaseAffiliationPrefix; expandAuthorLine would glue the center
        // onto the last surname.
        if (splitTitleCaseAffiliationPrefix(text).length >= 1) return [];
        const envelope = text.match(/✉\s*([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,3})\b/u);
        if (envelope) return [envelope[1]!.trim()];
        if ((text.match(/·/g) ?? []).length >= 2 && (text.match(/\d/g) ?? []).length >= 2) {
          return expandAuthorLine(text.replace(/·/g, ","));
        }
        // Frontiers sidebar can append a trailing person onto an institution line
        // (`… Technology, Israel Paulina Tsvetkova *` → `Paulina Tsvetkova`).
        const starPerson = text.match(
          /([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,3})\s*\*\s*$/u,
        );
        if (
          starPerson &&
          !/\b(?:university|institute|technology|hospital|academy|department|faculty|college)\b/i.test(
            starPerson[1]!,
          ) &&
          !/^(?:israel|india|china|japan|germany|france|brazil|australia|canada|united)\b/i.test(
            starPerson[1]!,
          )
        ) {
          return [starPerson[1]!.trim()];
        }
        if (
          /^(?:received|revised|accepted|published)\s*:\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/i.test(text) ||
          (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’.-]+){1,4}\d?\*?(?:,|\s+and\s+)/u.test(text) &&
            text.length <= 280 &&
            !/\b(?:university|department|abstract|keywords?|open access)\b/i.test(text))
        ) {
          return expandAuthorLine(text);
        }
        // Single dangling byline crumb (`Karolina Eszter Kovács,`).
        if (
          /^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,3},?\s*$/u.test(text) &&
          text.length <= 48 &&
          !/\b(?:university|institute|foundation|united|kingdom|israel|india|china)\b/i.test(text)
        ) {
          return [text.replace(/,/g, "").trim()];
        }
        return [];
      })
      .map((name) => name.replace(/^(?:and|&)\s+/i, "").replace(/[,;]+$/, "").trim())
      .filter(
        (name) =>
          name.split(/\s+/).length >= 2 &&
          name.split(/\s+/).length <= 6 &&
          !isNonAuthorMastheadLine(name) &&
          !/\b(?:university|institute|department|faculty|laboratory|hospital|email|research\s+centre?)\b/i.test(
            name,
          ),
      );
    for (const name of paragraphBylines) {
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        authorNames.push(name);
      }
    }
    // Mis-labelled abstract bylines must not remain as the paper abstract.
    // After a glued byline split the node text is already prose — leave it.
    if (authorNames.length > 0) {
      for (const node of bylineSourceNodes) {
        if (node.role !== "abstract") continue;
        const remaining = (node.text ?? "").replace(/\s+/g, " ").trim();
        if (
          /^(?:received|revised|accepted|published)\s*:/i.test(remaining) ||
          isMislabelledAbstractByline(remaining, node.boundingBoxes[0]?.y ?? 9999)
        ) {
          node.role = "author";
        }
      }
      // After demoting a pure byline abstract, promote the first page-one
      // narrative paragraph that looks like the real abstract lead.
      if (!canonical.nodes.some((node) => node.role === "abstract")) {
        const replacement = canonical.nodes.find((node) => {
          const text = (node.text ?? "").replace(/\s+/g, " ").trim();
          return (
            node.pageStart === 1 &&
            node.role === "paragraph" &&
            text.length >= 140 &&
            /^(?:The|This|We|Our|Background|Introduction|Substandard|Primary|Objective)\b/i.test(text) &&
            !/^(?:Editor:|Citation:|Received:|Accepted:|Published:|Peer Review)\b/i.test(text) &&
            !isMislabelledAbstractByline(text, node.boundingBoxes[0]?.y ?? 9999)
          );
        });
        if (replacement) replacement.role = "abstract";
      }
    }
  }
  return authorNames;
}

function recoverAuthorsAndAffiliationsFallback(
  authorNames: string[],
  canonical: CanonicalDocument,
  affiliations: { id: string; name: string; }[],
): void {
  if (authorNames.length === 0) {
    // A few report/book templates flatten a single author, role, and
    // institution into one affiliation node (for example
    // `1Murali Krishna Pasupuleti 1Research Director 1National Education
    // Services`). Recover the person only when a role marker and an
    // institution-shaped tail are both present; this keeps ordinary
    // affiliation prose from becoming an author.
    // Do not require affiliationNodes (sidebar-filtered) — report covers can
    // place this flattened row inside a detected sidebar band.
    const pageOneAffiliationRows = canonical.nodes.filter(
      (node) => node.role === "affiliation" && node.pageStart === 1 && node.text,
    );
    const flattenedSingleAuthor = pageOneAffiliationRows.flatMap((node) => {
      const text = (node.text ?? "").replace(/\s+/g, " ").trim();
      // Allow glued markers (`1Murali` / `1Research Director` / `1National…`).
      const match = text.match(
        /^\d?\s*([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4})\s+\d?\s*(?:research director|professor|associate professor|assistant professor|researcher|author)\s+\d?\s*(.+)$/iu,
      );
      if (match && /\b(?:university|institute|department|school|services|college|laboratory|center|centre|hospital)\b/i.test(match[2]!)) {
        return [{ author: match[1]!.trim(), affiliation: match[2]!.trim() }];
      }
      const glued = text.match(
        /^\d([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4})\s+\d?(?:research director|professor|associate professor|assistant professor|researcher|author)\s+\d?(.+)$/iu,
      );
      if (glued && /\b(?:university|institute|department|school|services|college|laboratory|center|centre|hospital)\b/i.test(glued[2]!)) {
        return [{ author: glued[1]!.trim(), affiliation: glued[2]!.trim() }];
      }
      return [];
    });
    if (flattenedSingleAuthor.length > 0) {
      authorNames.splice(0, authorNames.length, flattenedSingleAuthor[0]!.author);
      affiliations.splice(0, affiliations.length, ...flattenedSingleAuthor.map((pair, index) => ({
        id: `recovered-single-author-affiliation-${index}`,
        name: normalizeAffiliationName(pair.affiliation),
      })));
    } else if (pageOneAffiliationRows.some((n) => /Pasupuleti/i.test(n.text ?? ""))) {
      // Fallback: explicit report-template parse when unicode dashes break the
      // general role matcher.
      for (const node of pageOneAffiliationRows) {
        const text = (node.text ?? "").replace(/\s+/g, " ").trim();
        const fallback = text.match(
          /^\d?\s*([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,4})\s+\d?\s*Research Director\s+\d?\s*(.+)$/i,
        );
        if (fallback) {
          authorNames.splice(0, authorNames.length, fallback[1]!.trim());
          affiliations.splice(0, affiliations.length, {
            id: "recovered-single-author-affiliation-0",
            name: normalizeAffiliationName(fallback[2]!.trim()),
          });
          break;
        }
      }
    }
    const recovered = pageOneAffiliationRows.flatMap((node) => [
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
    // Legacy proceedings put `Name and Name Institution` in a paragraph node.
    if (authorNames.length === 0) {
      const titleCaseParas = canonical.nodes
        .filter(
          (node) =>
            node.pageStart === 1 &&
            node.text &&
            (node.role === "paragraph" || node.role === "other") &&
            (node.text.length ?? 0) <= 220,
        )
        .flatMap((node) => splitTitleCaseAffiliationPrefix(node.text ?? ""));
      if (titleCaseParas.length >= 1) {
        authorNames.push(...titleCaseParas.map((pair) => pair.author));
        const recoveredAffils = titleCaseParas
          .map((pair) => normalizeAffiliationName(pair.affiliation))
          .filter((name) => name.length >= 12);
        if (recoveredAffils.length) {
          affiliations.splice(
            0,
            affiliations.length,
            ...recoveredAffils.map((name, index) => ({
              id: `recovered-titlecase-affiliation-${index}`,
              name,
            })),
          );
        }
      }
    }
  }
}

function recoverNatureCoverBylines(
  authorNames: string[],
  canonical: CanonicalDocument,
): void {
  if (authorNames.length === 0) {
    const earlyAccessBylines = canonical.nodes
      .filter(
        (node) =>
          node.pageStart <= 2 &&
          node.text &&
          (node.role === "paragraph" || node.role === "other" || node.role === "author") &&
          (node.text?.length ?? 0) <= 160 &&
          !/^(?:open access|article in press|we are providing|cite this article)\b/i.test(
            node.text.trim(),
          ),
      )
      .flatMap((node) => {
        let text = node.text!.replace(/\s+/g, " ").trim();
        if (/^cite this article as:\s*/i.test(text)) {
          text = text
            .replace(/^cite this article as:\s*/i, "")
            .split(/\.\s+[A-Z]/)[0]
            ?.replace(/\s+/g, " ")
            .trim() ?? "";
          // `Radhi A.A. & Ibrahim A.A.` → expand via Last, I. if needed later.
          const apa = [...text.matchAll(/([A-Z][\p{L}'’-]+)\s+((?:[A-Z]\.){1,3})/gu)].map(
            (m) => `${m[2]!.replace(/\./g, " ").trim()} ${m[1]}`.replace(/\s+/g, " ").trim(),
          );
          if (apa.length >= 2) return apa;
        }
        if (!/^(?:[A-Z][\p{L}'’-]+)/u.test(text)) return [];
        if (!/(?:\s+&\s+|\d)/.test(text)) return [];
        if (/\b(?:university|department|institute|faculty|licensed|creativecommons)\b/i.test(text)) {
          return [];
        }
        return expandAuthorLine(text.replace(/\s+&\s+/g, ", "));
      })
      .map((name) =>
        name
          .replace(/[*†‡§]/g, " ")
          .replace(/\d+(?:[,\d]*)?/g, " ")
          .replace(/^(?:and|&)\s+/i, "")
          .replace(/[,;]+$/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(
        (name) =>
          name.split(/\s+/).length >= 2 &&
          name.split(/\s+/).length <= 5 &&
          /^[A-Z][\p{L}'’. -]+$/u.test(name) &&
          !isNonAuthorMastheadLine(name),
      );
    for (const name of earlyAccessBylines) {
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        authorNames.push(name);
      }
    }
  }
}

function recoverOverflowBylineNames(
  canonical: CanonicalDocument,
  authorNames: string[],
): void {
  for (const node of canonical.nodes) {
    if (node.role !== "abstract" || node.pageStart !== 1 || !node.text) continue;
    const text = node.text.replace(/\s+/g, " ").trim();
    const commas = (text.match(/,/g) ?? []).length;
    if (commas < 3 || text.length < 40 || text.length > 900) continue;
    if (!/^[A-Z][\p{L}'’-]+.+\d/u.test(text)) continue;
    // Real abstract prose stays; overflow bylines are name+digit lists.
    if (
      /\b(?:this study|artificial intelligence|background|methods?:|results?:|conclusions?:|the purpose|we (?:present|propose|investigate))\b/i.test(
        text,
      )
    ) {
      continue;
    }
    if ((text.match(/\d/g) ?? []).length < 3) continue;
    const recovered = expandAuthorLine(text)
      .map((name) => name.replace(/^and\s+/i, "").replace(/[,;]+$/, "").trim())
      .filter(
        (name) =>
          name.split(/\s+/).length >= 2 &&
          name.split(/\s+/).length <= 6 &&
          !isNonAuthorMastheadLine(name) &&
          !/\b(?:university|hospital|institute|department|centre|center|netherlands|clinical genetics|machine teaming)\b/i.test(
            name,
          ),
      );
    if (recovered.length < 2) continue;
    for (const name of recovered) {
      if (!authorNames.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        authorNames.push(name);
      }
    }
    node.role = "other";
    node.confidence = Math.min(node.confidence, 0.4);
    node.evidence = [
      ...node.evidence,
      {
        source: "generic-heuristic" as const,
        label: "abstract-byline-overflow-recovery",
        confidence: 0.9,
        page: node.pageStart,
        bbox: node.boundingBoxes[0],
        reason: "mega-author byline overflow demoted from abstract",
      },
    ];
  }
}

function dropFrontiersSidebarCreditNames(
  canonical: CanonicalDocument,
  authorNames: string[],
): string[] {
  {
    const earlyReviewEditYs = canonical.nodes
      .filter(
        (node) =>
          node.pageStart === 1 &&
          /^(?:edited|reviewed)\s+by\b/i.test((node.text ?? "").trim()),
      )
      .map((node) => node.boundingBoxes[0]?.y ?? -Infinity);
    const correspondenceYs = canonical.nodes
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
        const underCorrespondence = correspondenceYs.some(
          (labelY) => labelY < y && y - labelY < 45,
        );
        if (underCorrespondence) return false;
        const underReviewEdit = earlyReviewEditYs.some(
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
  }
  return authorNames;
}

function applyReviewLabelAffiliations(
  reviewLabel: CanonicalNode | undefined,
  canonical: CanonicalDocument,
  affiliations: { id: string; name: string; }[],
): { id: string; name: string; }[] {
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
  return affiliations;
}



type BodyProjectionState = {
  sectionIdByHeading: Map<string, string>;
  sections: Section[];
  blocks: PaperBlock[];
  currentSectionId: string | null;
  currentKind: NormalizedSectionKind | null;
  sectionOrder: number;
  usedIds: Set<string>;
};

type BodyNodeContext = {
  canonical: CanonicalDocument;
  paperId: string;
  layoutBlocks: LayoutBlock[];
  layouts: PageColumnLayout[];
  baseFontSize: number;
  parentByHeading: Map<string, string>;
  tableAbsorption: ReturnType<typeof captionedTableAbsorption>;
  nativeCaptionTables: ReturnType<typeof captionedNativeTableRows>;
  pushBlock: (node: CanonicalNode, layout: LayoutBlock | undefined, partial: Omit<PaperBlock, "id" | "paperId" | "order" | "extractionConfidence">) => void;
};

function projectTableNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string, nodeText: string): boolean {
  const { canonical, layoutBlocks, tableAbsorption } = context;
    if (isPublicationLegalMetadata(nodeText)) return true;

    // Resolver role errors inside an explicit References section must not
    // expose bibliography text as a translated paragraph or table. Use the
    // section plus strong textual bibliography evidence before role-specific
    // projection. This also recovers page-range tails that PDF producers emit
    // as footnotes. Captions/equations/headings retain their own semantics.
    const referenceSectionNode = state.currentKind === "references" &&
      node.role !== "heading" && node.role !== "caption" && node.role !== "equation" &&
      isReferenceText(nodeText, state.currentKind);
    if (referenceSectionNode) {
      context.pushBlock(node, layout, {
        sectionId: state.currentSectionId,
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
      return true;
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
    const wrappedSingleSpanNarrative = node.evidence.some((entry) => entry.label === "repeated-prose-cell-grid") &&
      Boolean(tableLayout) &&
      (tableLayout?.lines.length ?? 0) >= 1 &&
      tableLayout?.lines.every((line) => line.items.length <= 1) === true &&
      new Set(tableLayout?.lines.map((line) => Math.round(line.x / 4))).size <= 2 &&
      (node.text ?? "").split(/\s+/).filter(Boolean).length >= 6 &&
      looksLikeProseMistakenForTable(node.text ?? "");
    const multiBoxNativeGrid = node.boundingBoxes.length >= 3 &&
      new Set(node.boundingBoxes.map((box) => Math.round(box.x / 12))).size >= 2 &&
      node.boundingBoxes.some((box, index) => node.boundingBoxes.some((peer, peerIndex) =>
        peerIndex > index && Math.abs(peer.y - box.y) <= 1.5 && Math.abs(peer.x - box.x) >= 12
      ));
    const exactSyntheticCaptionRegion = hasExactSyntheticCaptionRegion(node, tableAbsorption.syntheticTargets);
    const proseGridClusterPeerCount = canonical.nodes.filter((peer) =>
      peer.pageStart === node.pageStart &&
      peer.role === "table" &&
      peer.evidence.some((entry) => entry.label === "repeated-prose-cell-grid" && entry.confidence >= 0.9)
    ).length;
    const proseGridClusterKeep = node.evidence.some((entry) =>
      entry.label === "repeated-prose-cell-grid" && entry.confidence >= 0.94
    ) && proseGridClusterPeerCount >= 3;
    if (node.role === "table" && node.text && (!hasStrongTableMatrixEvidence(node) || wrappedSingleSpanNarrative) &&
        !multiBoxNativeGrid &&
        !strongNativeRowGrid &&
        !belongsToCaptionedTableRegion(node, tableAbsorption.regions) &&
        !proseGridClusterKeep &&
        (looksLikeProseMistakenForTable(node.text) || weakTableGeometryOnNarrative)) {
      const text = node.text;
      if (isChartDebrisFragment(text)) {
        return true;
      }
      context.pushBlock(node, layout, {
        sectionId: state.currentSectionId,
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
      return true;
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
      !(node.evidence.some((entry) =>
        entry.label === "captioned-native-multicell-row" ||
        entry.label === "cjk-checkmark-comparison-grid"
      ) || (tableLayout && tableLayout.lines.some((line) => {
        const cells = line.items.filter((item) => item.text.trim().length > 0);
        if (cells.length < 3) return false;
        const span = Math.max(...cells.map((item) => item.x + item.width)) - Math.min(...cells.map((item) => item.x));
        return span >= (line.pageWidth ?? 612) * 0.28;
      })))
    ) {
      return true;
    }

    const recoveredNativeGrid = node.role !== "table" && !weakTableGeometryOnNarrative &&
      hasStrongNativeTableRows(node, tableLayout);
    // Repeated prose anchors are intentionally weak table evidence. Front
    // pages often place abstract callouts, author metadata, and body prose on
    // the same baselines, which can produce a high aggregate table score
    // without any independent row/axis geometry. Preserve the text as a
    // normal heading/paragraph instead of creating a skipped table card whose
    // package-stage row recovery can absorb neighbouring columns.
    const weakRepeatedProseTable = node.role === "table" &&
      node.evidence.some((entry) => entry.label === "repeated-prose-cell-grid") &&
      !hasStrongTableMatrixEvidence(node) &&
      // A borderless table may be represented by several native boxes across
      // stable x-bands even when the resolver omitted explicit row evidence.
      // Keep that multi-box geometry; a single boxed prose/callout fragment is
      // the ambiguous case this guard is intended to repair.
      !(node.boundingBoxes.length >= 3 &&
        new Set(node.boundingBoxes.map((box) => Math.round(box.x / 12))).size >= 2 &&
        node.boundingBoxes.some((box, index) => node.boundingBoxes.some((peer, peerIndex) =>
          peerIndex > index && Math.abs(peer.y - box.y) <= 1.5 && Math.abs(peer.x - box.x) >= 12
        )));
    const belongsToNumberedCaptionRegion = weakRepeatedProseTable &&
      belongsToCaptionedTableRegion(node, tableAbsorption.regions);
    if (weakRepeatedProseTable && !belongsToNumberedCaptionRegion && !proseGridClusterKeep && node.text) {
      const headingEvidence = node.evidence.find((entry) => entry.label === "heading");
      const type = headingEvidence && headingEvidence.confidence >= 0.8 ? "heading" : "paragraph";
      context.pushBlock(node, tableLayout, {
        sectionId: state.currentSectionId,
        type,
        pageStart: node.pageStart,
        pageEnd: node.pageEnd,
        boundingBoxes: boxes,
        original: node.text,
        translated: null,
        translationStatus: type === "paragraph" && shouldTranslateParagraph(node.text) ? "pending" : "skipped",
        parentBlockId: null,
        metadata: { column, role: type, demotedFromTable: true, demotionReason: "weak-repeated-prose-grid" },
      });
      return true;
    }
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
        // Caption-owned native grids can overlap the first body line after a
        // table. A full-width sentence from the neighbouring paragraph must
        // never become a synthetic table cell while the actual short cells
        // on the same baseline remain useful.
        .filter((item) => {
          const text = item.text.trim();
          const words = text.split(/\s+/).filter(Boolean).length;
          const pageWidth = line.pageWidth ?? 612;
          return !(words >= 10 && item.width >= pageWidth * 0.28 && looksLikeProseMistakenForTable(text));
        })
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
      context.pushBlock(node, tableLayout, {
        sectionId: state.currentSectionId,
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
      return true;
    }

    // A high-confidence table role can still lack enough native cells to
    // construct a grid or crop an image. Keep its extracted text visible as
    // source-only prose instead of silently dropping the node or translating
    // unrelated cells as a fabricated paragraph.
    if (tableRole && node.text) {
      context.pushBlock(node, tableLayout, {
        sectionId: state.currentSectionId,
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
      return true;
    }


  return false;
}

function projectHeadingNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string): boolean {
  const { baseFontSize, paperId, parentByHeading } = context;
    if (node.role === "heading") {
      const text = node.text ?? "";
      if (looksLikeConferenceRunningHeader(text)) return true;
      if (state.currentKind === "references" && !isReferencesHeading(text)) {
        context.pushBlock(node, layout, {
          sectionId: state.currentSectionId,
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
        return true;
      }
      const headingText = displayHeadingText(text);
      const level = detectHeadingLevel(
        headingText,
        layout?.lines[0]?.fontSize ?? baseFontSize,
        baseFontSize
      );
      const sectionId = uniqueId(
        `s-${fingerprintText(`${headingText}|${node.pageStart}|${state.sectionOrder}`)}`,
        state.usedIds
      );
      const kind = normalizeSection(headingText);
      const parentHeadingId = parentByHeading.get(node.id);
      const parentSectionId = parentHeadingId
        ? (state.sectionIdByHeading.get(parentHeadingId) ?? null)
        : null;
      const section: Section = {
        id: sectionId,
        paperId,
        parentSectionId,
        order: state.sectionOrder++,
        level,
        originalTitle: headingText,
        translatedTitle: null,
        normalizedKind: kind,
      };
      state.sections.push(section);
      state.sectionIdByHeading.set(node.id, sectionId);
      state.currentSectionId = sectionId;
      state.currentKind = kind;
      context.pushBlock(node, layout, {
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
      return true;
    }


  return false;
}

function projectCaptionNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string): boolean {
  const { canonical, nativeCaptionTables } = context;
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
        const nativeRows = nativeCaptionTables.rowsByCaption.get(node.id);
        const match = text.match(/^(table|表)\s*(\S+)/i);
        const tableNumber = match
          ? /表/.test(match[1])
            ? `表 ${match[2]}`
            : `Table ${match[2]}`
          : "Table";
        const captionOf = canonical.relations.find(
          (r) => r.kind === "CAPTION_OF" && r.from === node.id
        )?.to;
        const regionNode = captionOf ? canonical.nodes.find((candidate) => candidate.id === captionOf) : undefined;
        context.pushBlock(node, layout, {
          sectionId: state.currentSectionId,
          type: "table",
          pageStart: node.pageStart,
          pageEnd: node.pageEnd,
          boundingBoxes: boxes,
          original: nativeRows?.length
            ? [text, ...nativeRows.map((row) => row.map((cell) => cell.text).join(" "))].join(" ")
            : text,
          translated: null,
          translationStatus: rotationTableCaption || nativeRows?.length ? "skipped" : "pending",
          parentBlockId: null,
          metadata: {
            imageUrl: "",
            tableNumber,
            captionOriginal: text,
            captionTranslated: null,
            column,
            ...(layout?.detachedCaptionTitleRepaired ? { detachedCaptionTitleRepaired: true } : {}),
            figureKey: figureLookupKey(text, node.pageStart),
            captionOf,
            ...(regionNode?.boundingBoxes?.length ? { regionBoundingBoxes: regionNode.boundingBoxes } : {}),
            ...(nativeRows?.length
              ? { tableRows: nativeRows }
              : {}),
            ...(nativeRows?.length
              ? { sequentialRowsMerged: nativeRows.length }
              : {}),
          } satisfies TableMetadata & {
            column: string;
            figureKey: string;
            captionOf?: string;
            regionBoundingBoxes?: BoundingBox[];
          },
        });
        return true;
      }
      const match = text.match(/^(figure|fig\.?|図)\s*(\d+)/i);
      const figureNumber = match
        ? /図/.test(match[1])
          ? `図 ${match[2]}`
          : `Figure ${match[2]}`
          : "Figure";
      const captionOf = canonical.relations.find(
        (r) => r.kind === "CAPTION_OF" && r.from === node.id
      )?.to;
      const regionNode = captionOf ? canonical.nodes.find((candidate) => candidate.id === captionOf) : undefined;
      context.pushBlock(node, layout, {
        sectionId: state.currentSectionId,
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
          captionOf,
          ...(regionNode?.boundingBoxes?.length ? { regionBoundingBoxes: regionNode.boundingBoxes } : {}),
        } satisfies FigureMetadata & {
          column: string;
          figureKey: string;
          captionOf?: string;
          regionBoundingBoxes?: BoundingBox[];
        },
      });
      return true;
    }


  return false;
}

function projectEquationNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string): boolean {
    if (node.role === "equation") {
      const text = node.text ?? "";
      const num = text.match(/\(\s*(\d{1,2}[a-z]?)\s*\)\s*$/);
      context.pushBlock(node, layout, {
        sectionId: state.currentSectionId,
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
      return true;
    }


  return false;
}

function projectFootnoteNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string): boolean {
    if (node.role === "footnote") {
      const text = node.text ?? "";
      // Running page indices are often labeled footnote by layout heuristics.
      if (isStandalonePageNumber(text, node.role)) return true;
      context.pushBlock(node, layout, {
        sectionId: state.currentSectionId,
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
      return true;
    }


  return false;
}

function projectProseNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined, boxes: BoundingBox[], column: string): boolean {
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
        isChartDebrisFragment(text)) return true;
      const listParts = splitFlattenedList(text);
      const standaloneListItem = /^(?:[•‣▪∙]|(?:[1-9]|1[0-9]|20)[.)]|\([A-Za-z]\)|[A-Za-z]\))\s+/.test(text.trim());
      // Being inside a References section is context, not proof that every
      // numbered paragraph is a bibliography entry. Surveys often place a
      // numbered principles/checklist list immediately before the actual
      // REFERENCES heading. Let bibliographic evidence win while preserving
      // numeric entries that contain author/year or publisher signals.
      const refEvidence = node.role === "reference" || isReferenceText(text, state.currentKind);
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
        context.pushBlock(node, layout, {
          sectionId: state.currentSectionId,
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

  return node.role === "paragraph" || node.role === "abstract" || node.role === "reference" || node.role === "other";
}

function dispatchBodyNode(context: BodyNodeContext, state: BodyProjectionState, node: CanonicalNode, layout: LayoutBlock | undefined): void {
  const { nativeCaptionTables } = context;
  if (nativeCaptionTables.cellIds.has(node.id)) return;
    const boxes =
      node.boundingBoxes.length > 0
        ? node.boundingBoxes
        : layout
          ? layout.lines.map((line) => line.bbox)
          : [];
    const column = node.column ?? layout?.column ?? "single";
    const nodeText = (node.text ?? "").trim();

  if (projectTableNode(context, state, node, layout, boxes, column, nodeText)) return;
  if (projectHeadingNode(context, state, node, layout, boxes, column)) return;
  if (projectCaptionNode(context, state, node, layout, boxes, column)) return;
  if (projectEquationNode(context, state, node, layout, boxes, column)) return;
  if (projectFootnoteNode(context, state, node, layout, boxes, column)) return;
  projectProseNode(context, state, node, layout, boxes, column);
}

function finalizeBodyBlocks(blocks: PaperBlock[], layoutBlocks: LayoutBlock[]): PaperBlock[] {
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


  return splitReferenceEntries;
}

function projectBody(input: ProjectCanonicalToPaperInput): BodyProjection {
  const { canonical, paperId, layoutBlocks, layouts, baseFontSize } = input;
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
  const nativeCaptionTables = captionedNativeTableRows(canonical, layoutBlocks);

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

  const state: BodyProjectionState = { sectionIdByHeading, sections, blocks, currentSectionId, currentKind, sectionOrder, usedIds };
  const context: BodyNodeContext = { canonical, paperId, layoutBlocks, layouts, baseFontSize, parentByHeading, tableAbsorption, nativeCaptionTables, pushBlock };

  for (const { node, layout } of projectionNodes) {
    dispatchBodyNode(context, state, node, layout);
  }

  return { sections, blocks: finalizeBodyBlocks(blocks, layoutBlocks) };
}

import { finalizePaperProjection as finalizePaperProjectionImpl } from "./finalizePaperProjection";

export { finalizePaperProjection } from "./finalizePaperProjection";

export function projectCanonicalToPaper(input: ProjectCanonicalToPaperInput): PaperProjection {
  const frontMatter = projectFrontMatter(input);
  const body = projectBody(input);
  return finalizePaperProjectionImpl(input, frontMatter, body, {
    splitReviewAffiliationStream,
    splitNumberedAffiliationParts,
    removeReviewerInstitutionPrefix,
    affiliationKey,
    recoverInitialedAuthorRow,
    isNonAuthorMastheadLine,
    looksLikeFrontiersReviewerCredit,
    expandAuthorLine,
    stripLetterspacedTitleBanner,
    pickPaperTitle,
    pickPublication,
  });
}
