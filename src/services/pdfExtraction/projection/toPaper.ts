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
  const cleaned = text
    .replace(/[*,†‡§]/g, " ")
    .replace(/(\p{L})\d+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const cjkTokens = cleaned.match(/[\u3040-\u30ff\u4e00-\u9fff]{1,4}/g) ?? [];
  const latin = cleaned
    .replace(/[\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const names: string[] = [];
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
  if (currentKind === "references") return true;
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
  const authorNodes = canonical.nodes.filter((n) => n.role === "author" && n.text && !/@/.test(n.text));
  const affiliationNodes = canonical.nodes.filter((n) => n.role === "affiliation" && n.text);
  const affiliated = canonical.relations.filter((r) => r.kind === "AFFILIATED_WITH");
  const authorsStructured = authorNodes.map((node) => ({
    id: node.id,
    name: (node.text ?? "").trim(),
    affiliationIds: affiliated.filter((rel) => rel.from === node.id).map((rel) => rel.to),
  }));
  const affiliations = affiliationNodes.map((node) => ({
    id: node.id,
    name: (node.text ?? "").trim(),
  }));
  const authorNames = authorsStructured
    .flatMap((author) => expandAuthorLine(author.name))
    .filter(Boolean);
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

  const readable = canonical.nodes.filter((n) => !skip.has(n.role) || (n.role === "table" && Boolean(n.text)));
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
          role: "table",
          tableSourceFallback: true,
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
      if (layoutRole === "table_caption" || /^(?:table|表)\s/i.test(text)) {
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
          translationStatus: "pending",
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
        metadata: { ...last.metadata, tableSourceFallback: true },
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
    if (
      current.type !== "paragraph" ||
      next.type !== "paragraph" ||
      current.pageEnd !== next.pageStart ||
      current.metadata.translationInputWarning ||
      /[.!?。！？:]\s*$/.test(current.original.trim()) ||
      !/^(?:which|that|and|or|but|where|while|because|although|including)\b/i.test(next.original.trim()) &&
      !/^[a-z]/.test(next.original.trim())
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

  const paper: Paper = {
    id: paperId,
    sourceFilePath: input.filePath,
    sourceFileName: input.filePath,
    sourceStoredPath: null,
    sourceFileHash: input.fileHash,
    titleOriginal: pickPaperTitle(input.metadata.title, titleNode?.text ?? undefined),
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
