import { displayHeadingText, isSentenceContinuation, type PageColumnLayout } from "../../pdfLayout";
import type { CanonicalNode, CanonicalRelation } from "../canonical/types";
import type { RoleCandidate } from "../generic/candidates";
import type { StructuralRegionEvidence } from "../types";

function headingLevel(node: CanonicalNode): number {
  const text = node.text ?? "";
  const match = displayHeadingText(text).match(/^(\d+)(\.(\d+))?(\.(\d+))?/);
  if (match) {
    if (match[5]) return 3;
    if (match[3]) return 2;
    return 1;
  }
  const style = node.style;
  if (!style) return 1;
  if (style.fontSizeRatio > 1.22 || style.uppercaseRatio > 0.72) return 1;
  // A heading that is not the uppercase display style is normally a
  // subsection in conference templates, even when it intentionally uses the
  // same small heading face as body text.
  if (/[a-z]/.test(text) || style.fontSizeRatio > 1.08 || style.boldScore >= 0.35) return 2;
  return 1;
}

function numberingParts(text: string): number[] | null {
  const match = displayHeadingText(text).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [match[1], match[3], match[5]]
    .filter(Boolean)
    .map((n) => Number(n));
}

function prefixOf(child: number[], parent: number[]): boolean {
  if (parent.length >= child.length) return false;
  return parent.every((n, i) => n === child[i]);
}

export function childOfRelations(headingNodes: CanonicalNode[]): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  const numbered: { node: CanonicalNode; parts: number[] }[] = [];
  const stack: { id: string; level: number }[] = [];

  for (const node of headingNodes) {
    const level = headingLevel(node);
    const parts = numberingParts(node.text ?? "");
    if (parts) {
      const parent = [...numbered]
        .reverse()
        .find((prev) => prefixOf(parts, prev.parts));
      if (parent) {
        relations.push({
          kind: "CHILD_OF",
          from: node.id,
          to: parent.node.id,
          score: 0.9,
        });
      } else {
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        if (stack.length > 0) {
          relations.push({
            kind: "CHILD_OF",
            from: node.id,
            to: stack[stack.length - 1].id,
            score: 0.7,
          });
        }
      }
      numbered.push({ node, parts });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      if (stack.length > 0) {
        relations.push({
          kind: "CHILD_OF",
          from: node.id,
          to: stack[stack.length - 1].id,
          score: 0.65,
        });
      }
    }
    stack.push({ id: node.id, level });
  }
  return relations;
}

function markersFrom(text: string): string[] {
  const cleaned = text.trim();
  const found = new Set<string>();
  for (const match of cleaned.matchAll(/([A-Za-z\u3040-\u9fff][A-Za-z.\u3040-\u9fff'-]*)([*†‡§]|\d{1,2})\b/g)) {
    found.add(match[2]);
  }
  const leading = cleaned.match(/^([*†‡§]|\d{1,2})[.\s]/);
  if (leading) found.add(leading[1]);
  return [...found];
}

export function affiliatedWithRelations(nodes: CanonicalNode[]): CanonicalRelation[] {
  const authors = nodes.filter((n) => n.role === "author");
  const affiliations = nodes.filter((n) => n.role === "affiliation");
  const relations: CanonicalRelation[] = [];
  if (authors.length === 0 || affiliations.length === 0) return relations;

  let linked = false;
  for (const author of authors) {
    const marks = markersFrom(author.text ?? "");
    for (const aff of affiliations) {
      const affMarks = markersFrom(aff.text ?? "");
      const affStarts = (aff.text ?? "").trim().match(/^([*†‡§]|\d{1,2})\b/);
      const key = affStarts?.[1];
      if (marks.length > 0 && (affMarks.includes(marks[0]) || (key && marks.includes(key)))) {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: aff.id,
          score: 0.86,
        });
        linked = true;
      }
    }
  }

  if (!linked) {
    if (affiliations.length === 1) {
      for (const author of authors) {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: affiliations[0].id,
          score: 0.6,
        });
      }
    } else if (authors.length === affiliations.length) {
      authors.forEach((author, i) => {
        relations.push({
          kind: "AFFILIATED_WITH",
          from: author.id,
          to: affiliations[i].id,
          score: 0.55,
        });
      });
    }
  }
  return relations;
}

function overlapRatio(a: { x: number; width: number }, b: { x: number; width: number }): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const w = Math.max(0, right - left);
  return w / Math.max(Math.min(a.width, b.width), 1);
}

function horizontallyCompatible(
  a: { x: number; width: number },
  b: { x: number; width: number },
  aColumn?: RoleCandidate["column"],
  bColumn?: RoleCandidate["column"],
): boolean {
  if ((aColumn === "left" || aColumn === "right") &&
      (bColumn === "left" || bColumn === "right") &&
      aColumn !== bColumn) {
    return false;
  }
  if (overlapRatio(a, b) >= 0.12) return true;
  const aCenter = a.x + a.width / 2;
  const bCenter = b.x + b.width / 2;
  return Math.abs(aCenter - bCenter) <= Math.max(54, Math.min(a.width, b.width) * 0.8);
}

export function captionOfRelations(nodes: CanonicalNode[]): CanonicalRelation[] {
  const tableCaptionShape = (text: string) => {
    const value = text.trim();
    return /^(?:table|tables)\s+\d+(?:\.\d+)?[a-z]?(?:$|\s*[.:：]\s*|\s+\((?:continued|cont\.)\)|\s+continues?\b)/i.test(value) ||
      (/^table\s+\d+(?:\.\d+)?[a-z]?(?:\s*[.:：])?\s+\S/i.test(value) && value.length <= 120 &&
        value.split(/\s+/).length <= 12 && !/[.!?]\s*$/.test(value));
  };
  const captions = nodes.filter((n) => n.role === "caption" &&
    // Do not let a body sentence beginning with `Table 4.4 summarises ...`
    // acquire a structural relation merely because its resolver role was
    // influenced by nearby table geometry.
    (!/^table\b/i.test(n.text ?? "") || tableCaptionShape(n.text ?? "")));
  const figures = nodes.filter((n) => n.role === "figure" || n.role === "table");
  const relations: CanonicalRelation[] = [];
  const used = new Set<string>();

  for (const caption of captions) {
    const captionBox = caption.boundingBoxes[0];
    let best: { node: CanonicalNode; score: number } | null = null;
    const expectedRole = /^table\b/i.test(caption.text ?? "") ? "table" :
      /^(?:figure|fig\.)\s*\d/i.test(caption.text ?? "") ? "figure" : undefined;
    const figureCandidates = [...figures].sort((a, b) => {
      if (expectedRole !== "table") return 0;
      const label = caption.text?.match(/^table\s+\d+(?:\.\d+)?[a-z]?/i)?.[0]?.toLowerCase();
      const aMatch = label && a.structuralLabel?.toLowerCase().startsWith(label) ? 1 : 0;
      const bMatch = label && b.structuralLabel?.toLowerCase().startsWith(label) ? 1 : 0;
      return bMatch - aMatch;
    });
    for (const figure of figureCandidates) {
      if (expectedRole && figure.role !== expectedRole) continue;
      if (used.has(figure.id)) continue;
      if (figure.pageStart !== caption.pageStart) continue;
      const figBox = figure.boundingBoxes[0];
      if (!captionBox || !figBox) continue;
      let score = 0.4;
      if (figure.column && caption.column && figure.column === caption.column) {
        score += 0.2;
      }
      const dy = captionBox.y - (figBox.y + figBox.height);
      const tableAboveRegion = expectedRole === "table" &&
        figBox.y >= captionBox.y && figBox.y - (captionBox.y + captionBox.height) < 280;
      if ((dy >= -8 && dy < 220) || tableAboveRegion) score += 0.2;
      score += Math.min(0.15, overlapRatio(captionBox, figBox) * 0.15);
      if (!best || score > best.score) best = { node: figure, score };
    }
    if (best) {
      used.add(best.node.id);
      relations.push({
        kind: "CAPTION_OF",
        from: caption.id,
        to: best.node.id,
        score: Math.min(0.95, best.score),
      });
    }
  }
  return relations;
}

export function readsBeforeRelations(orderedIds: string[]): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    relations.push({
      kind: "READS_BEFORE",
      from: orderedIds[i],
      to: orderedIds[i + 1],
      score: 0.9,
    });
  }
  return relations;
}

/**
 * Link an unfinished paragraph to the first physical paragraph on the next
 * page. This is deliberately narrower than a generic adjacency merge: both
 * nodes must be body paragraphs, the source must be syntactically open, and
 * native geometry must place the pair at a page boundary. Keeping the
 * relation in the canonical layer lets projection preserve pageStart,
 * pageEnd, and all bounding boxes while translation receives one logical unit.
 */
export function pageBoundaryContinuationRelations(
  nodes: CanonicalNode[],
  layouts: PageColumnLayout[],
): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const previous = nodes[i];
    const next = nodes[i + 1];
    if (previous.role !== "paragraph" || next.role !== "paragraph") continue;
    if (!previous.text || !next.text || previous.pageEnd + 1 !== next.pageStart) continue;
    if (previous.text.trim().length < 120 || /[.!?:]\s*$/.test(previous.text.trim())) continue;
    if (!/^(?:[a-z(]|(?:and|or|but|which|that|where|while|because|although|including)\b)/i.test(next.text.trim())) continue;
    const pageLayout = layouts.find((layout) => layout.page === previous.pageEnd);
    if (!pageLayout) continue;
    const previousTail = previous.boundingBoxes.at(-1);
    const nextStart = next.boundingBoxes[0];
    if (!previousTail || !nextStart) continue;
    if (previousTail.y + previousTail.height <= pageLayout.pageHeight * 0.55) continue;
    const nextLayout = layouts.find((layout) => layout.page === next.pageStart);
    if (nextLayout && nextStart.y >= nextLayout.pageHeight * 0.42) continue;
    const compatibleColumns = previous.column === next.column
      || (previous.column === "right" && next.column === "left")
      || previous.column === "single";
    if (!compatibleColumns || !isSentenceContinuation(previous.text, next.text)) continue;
    relations.push({ kind: "CONTINUES", from: previous.id, to: next.id, score: 0.88 });
  }
  return relations;
}

/**
 * Link a paragraph that resumes below a floated table to its unfinished
 * cross-column source paragraph. The table and caption remain independent
 * canonical nodes. This relation is emitted only when the source text is
 * syntactically continuous and native geometry places the intervening table
 * in the upper right column between the two text fragments.
 */
export function floatedTableContinuationRelations(
  nodes: CanonicalNode[],
  layouts: PageColumnLayout[]
): CanonicalRelation[] {
  const relations: CanonicalRelation[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const previous = nodes[i];
    if (previous.role !== "paragraph" || !previous.text || previous.pageStart !== previous.pageEnd) continue;
    const pageLayout = layouts.find((layout) => layout.page === previous.pageEnd);
    if (!pageLayout?.isMultiColumn) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const next = nodes[j];
      if (next.pageStart !== previous.pageEnd || next.pageEnd !== next.pageStart) break;
      if (next.role === "heading" || next.role === "equation" || next.role === "reference") break;
      if (next.role !== "paragraph") continue;
      if (!next.text || previous.column !== "left" || next.column !== "right") continue;

      const intervening = nodes.slice(i + 1, j);
      // A native table row can remain `other` when the resolver has only
      // geometry evidence (for example a compact header/data row beside a
      // floated caption). It is still transparent for paragraph stitching,
      // but only when the evidence explicitly identifies a table row. Do not
      // treat arbitrary figure labels or chrome as transparent.
      const isTableIntervening = (node: CanonicalNode): boolean =>
        node.role === "table" || node.role === "caption" ||
        (node.role === "other" && node.evidence.some((entry) =>
          entry.label === "captioned-native-multicell-row" ||
          entry.label === "table-region-member" ||
          entry.label === "captioned-native-grid"
        ));
      if (intervening.length < 2 || !intervening.every(isTableIntervening)) continue;
      if (!intervening.some((node) => node.role === "table") || !intervening.some((node) => node.role === "caption")) continue;
      const previousTail = previous.boundingBoxes.at(-1);
      const nextStart = next.boundingBoxes[0];
      if (!previousTail || !nextStart) continue;
      if (previousTail.y <= pageLayout.pageHeight * 0.68 || nextStart.y >= pageLayout.pageHeight * 0.32) continue;
      if (intervening.some((node) =>
        node.column !== "right" || node.pageStart !== previous.pageEnd ||
        node.boundingBoxes.length === 0 ||
        node.boundingBoxes.some((box) => box.y + box.height >= nextStart.y)
      )) continue;
      if (previous.text.trim().length < 80 || !isSentenceContinuation(previous.text, next.text)) continue;

      relations.push({ kind: "CONTINUES", from: previous.id, to: next.id, score: 0.9 });
      break;
    }
  }
  return relations;
}

export type TopologicalOrderKey = {
  page: number;
  y: number;
  x: number;
};

/**
 * Kahn topological order over READS_BEFORE. When several nodes are ready,
 * prefer earlier page / higher-on-page geometry so table-region members from
 * later pages cannot float above ABSTRACT on page 1.
 */
export function topologicalOrder(
  ids: string[],
  relations: CanonicalRelation[],
  orderKey?: (id: string) => TopologicalOrderKey
): string[] | null {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const index = new Map(ids.map((id, i) => [id, i]));
  for (const id of ids) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const rel of relations) {
    if (rel.kind !== "READS_BEFORE") continue;
    if (!incoming.has(rel.from) || !incoming.has(rel.to)) continue;
    outgoing.get(rel.from)?.push(rel.to);
    incoming.set(rel.to, (incoming.get(rel.to) ?? 0) + 1);
  }
  const compareReady = (a: string, b: string) => {
    if (orderKey) {
      const ka = orderKey(a);
      const kb = orderKey(b);
      if (ka.page !== kb.page) return ka.page - kb.page;
      if (ka.y !== kb.y) return ka.y - kb.y;
      if (ka.x !== kb.x) return ka.x - kb.x;
    }
    return (index.get(a) ?? 0) - (index.get(b) ?? 0);
  };
  const queue = ids.filter((id) => (incoming.get(id) ?? 0) === 0).sort(compareReady);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const n = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, n);
      if (n === 0) {
        queue.push(next);
        queue.sort(compareReady);
      }
    }
  }
  if (ordered.length !== ids.length) return null;
  return ordered;
}

export function figureNodesForCaptions(candidates: RoleCandidate[], regionEvidence: StructuralRegionEvidence[] = []): CanonicalNode[] {
  const continuedTable = (text: string) => /^(?:table|tables)\s+\d+[a-z]?\s*\(continued\)/i.test(text.trim());
  return candidates
    .filter(
      (c) =>
        c.layoutBlock.role === "figure_caption" ||
        (c.layoutBlock.role === "table_caption" && !continuedTable(c.layoutBlock.text))
    )
    .map((caption, i) => {
      const role = caption.layoutBlock.role === "table_caption" ? "table" : "figure";
      const box = caption.boundingBoxes[0];
      const nextTableCaptionPage = role === "table"
        ? Math.min(
            ...candidates
              .filter((candidate) => candidate.layoutBlock.role === "table_caption" && candidate !== caption && candidate.pageStart > caption.pageStart)
              .map((candidate) => candidate.pageStart),
            Infinity,
          )
        : Infinity;
      const nextSamePageCaptionY = role === "table"
        ? Math.min(
            ...candidates
              .filter((candidate) => candidate.layoutBlock.role === "table_caption" && candidate !== caption && candidate.pageStart === caption.pageStart)
              .map((candidate) => candidate.boundingBoxes[0]?.y ?? Infinity)
              .filter((y) => y > (box?.y ?? Infinity)),
            Infinity,
          )
        : Infinity;
      const previousSamePageCaptionY = role === "table"
        ? Math.max(
            ...candidates
              .filter((candidate) => candidate.layoutBlock.role === "table_caption" && candidate !== caption && candidate.pageStart === caption.pageStart)
              .map((candidate) => candidate.boundingBoxes[0]?.y ?? -Infinity)
              .filter((y) => y < (box?.y ?? -Infinity)),
            -Infinity,
          )
        : -Infinity;
      const regionMembers = role === "table" && box
        ? candidates.filter((candidate) => {
            const candidateBox = candidate.boundingBoxes[0];
            if (!candidateBox) return false;
            const samePage = candidate.pageStart === caption.pageStart;
            const continuedCaption = candidate.layoutBlock.role === "table_caption" && continuedTable(candidate.layoutBlock.text) &&
              candidate.layoutBlock.text.match(/^(?:table|tables)\s+(\d+[a-z]?)/i)?.[1]?.toLowerCase() ===
              caption.layoutBlock.text.match(/^(?:table|tables)\s+(\d+[a-z]?)/i)?.[1]?.toLowerCase();
            if (continuedCaption) return candidate.pageStart > caption.pageStart && candidate.pageStart <= caption.pageStart + 4;
            const nextPageContinuation = candidate.pageStart === caption.pageStart + 1 &&
              box.y > 500 && candidateBox.y < 220 && candidate.pageStart < nextTableCaptionPage;
            const laterPageContinuation = candidate.pageStart > caption.pageStart &&
              candidate.pageStart <= caption.pageStart + 4 &&
              candidate.pageStart < nextTableCaptionPage &&
              Math.abs(candidateBox.x - box.x) < 180;
            if (!samePage && !nextPageContinuation && !laterPageContinuation) return false;
            if (candidate !== caption && candidate.layoutBlock.role === "table_caption") return false;
            if (["heading", "title", "footnote", "copyright", "author", "affiliation"].includes(candidate.layoutBlock.role)) return false;
            if (samePage && !horizontallyCompatible(candidateBox, box, candidate.column, caption.column)) return false;
            if (samePage && previousSamePageCaptionY > -Infinity && candidateBox.y < box.y) return false;
            if (samePage && nextSamePageCaptionY < Infinity && candidateBox.y >= nextSamePageCaptionY) return false;
            const aboveCaption = samePage && candidateBox.y < box.y && box.y - (candidateBox.y + candidateBox.height) < 280;
            const belowCaption = samePage && candidateBox.y >= box.y && candidateBox.y - (box.y + box.height) < 280;
            if (!(aboveCaption || belowCaption || laterPageContinuation || nextPageContinuation)) return false;
            // A native table is often split into one LayoutBlock per row by
            // the generic block grouper. Preserve those rows as a region even
            // when no single block has enough lines to earn table evidence.
            // Require multiple aligned text items in the row so ordinary body
            // paragraphs remain excluded.
            const text = candidate.layoutBlock.text.trim();
            const sentenceLike = /[.!?:;]\s*$/.test(text) && text.split(/\s+/).filter(Boolean).length > 8;
            const row = candidate.layoutBlock.lines.some((line) => line.items.length >= 2) && !sentenceLike;
            const multiItemLines = candidate.layoutBlock.lines.filter((line) => line.items.length >= 2).length;
            const multiItemRatio = multiItemLines / Math.max(candidate.layoutBlock.lines.length, 1);
            const numericDensity = (text.match(/\d/g) ?? []).length / Math.max(text.length, 1);
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const letterCount = (text.match(/[A-Za-z]/g) ?? []).length;
            const longProseRow = wordCount > 8 && letterCount / Math.max(text.length, 1) > 0.45;
            const flatLines = candidate.layoutBlock.lines.filter((line) => line.items.length === 1);
            const flatXs = new Map<number, number>();
            const flatYRows = new Map<number, Set<number>>();
            for (const line of flatLines) {
              const x = Math.round(line.items[0].x / 12) * 12;
              flatXs.set(x, (flatXs.get(x) ?? 0) + 1);
              const y = Math.round(line.y / 4) * 4;
              const xs = flatYRows.get(y) ?? new Set<number>();
              xs.add(x);
              flatYRows.set(y, xs);
            }
            const flattenedGridRow = flatLines.length >= 6 && flatLines.length === candidate.layoutBlock.lines.length &&
              [...flatXs.values()].filter((count) => count >= 2).length >= 2 &&
              [...flatYRows.values()].filter((xs) => xs.size >= 2).length >= 3 &&
              candidate.layoutBlock.lines.every((line) => line.bbox.width <= 260) &&
              !/[.!?]\s*$/.test(text) && text.split(/\s+/).filter(Boolean).length <= 40;
            const bulletStream = candidate.layoutBlock.lines.every((line) => line.items.length === 1) &&
              candidate.layoutBlock.lines.some((line) => /^\s*[•‣▪∙–—-]\s*/.test(line.text));
            // A caption-adjacent paragraph can be split into several native
            // lines and otherwise look like a row. Keep long prose and list
            // streams out unless strong multi-cell evidence is present.
            if (bulletStream && !flattenedGridRow) return false;
            if (row && multiItemRatio < 0.4 && !flattenedGridRow && numericDensity < 0.12) return false;
            if (longProseRow && (candidate.roleScores.table ?? 0) < 0.9 && !flattenedGridRow) return false;
            const compactCellRow = candidate.layoutBlock.lines.length === 1 &&
              !/[.!?]\s*$/.test(text) && (numericDensity >= 0.12 ||
                // Multi-column review tables often encode a bullet cell as one
                // native text item with no numeric token. Keep it eligible only
                // inside a caption-adjacent region; ordinary prose remains
                // protected by the sentence and proximity checks above.
                (/^[•‣▪∙–—-]\s*\S/.test(text) && text.length <= 180));
            // A paragraph receives table score when it is merely near a
            // caption. Without numeric/aligned-cell evidence, do not promote
            // it into a structured region.
            if (candidate.layoutBlock.role === "paragraph" &&
              !compactCellRow && !flattenedGridRow && numericDensity < 0.12) return false;
            const highConfidenceContinuationRow = laterPageContinuation &&
              (candidate.roleScores.table ?? 0) >= 0.78 &&
              candidate.layoutBlock.lines.length <= 3;
            return (row || highConfidenceContinuationRow) &&
              ((candidate.roleScores.table ?? 0) >= 0.78 || compactCellRow || flattenedGridRow);
          })
        : [];
      const memberBoxes = regionMembers.flatMap((member) => member.boundingBoxes);
      const debug = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PDF_TABLE_DEBUG;
      if (debug === "1" && role === "table") {
        console.warn(`[PDF_TABLE_REGION] label=${JSON.stringify(caption.layoutBlock.text)} captionPages=${caption.pageStart}-${caption.pageEnd} members=${regionMembers.map((member) => { const text = member.layoutBlock.text.trim(); const digits = (text.match(/\d/g) ?? []).length; return `${member.pageStart}-${member.pageEnd}:${member.layoutBlock.role}:score=${(member.roleScores.table ?? 0).toFixed(2)}:density=${(digits / Math.max(text.length, 1)).toFixed(2)}:items=${Math.max(...member.layoutBlock.lines.map((line) => line.items.length), 0)}:${text.slice(0, 80)}`; }).join(" | ")}`);
      }
      const regionBox = memberBoxes.length > 0
        ? {
            page: box!.page,
            x: Math.min(...memberBoxes.map((member) => member.x)),
            y: Math.min(...memberBoxes.map((member) => member.y)),
            width: Math.max(...memberBoxes.map((member) => member.x + member.width)) - Math.min(...memberBoxes.map((member) => member.x)),
            height: Math.max(...memberBoxes.map((member) => member.y + member.height)) - Math.min(...memberBoxes.map((member) => member.y)),
          }
        : null;
      const figureBox = box
        ? regionBox ?? {
            ...box,
            y: Math.max(0, box.y - Math.min(180, Math.max(36, box.height * 8))),
            height: Math.min(180, Math.max(36, box.height * 8)),
          }
        : caption.layoutBlock.bbox;
      const anchoredRegion = role === "table" && box
        ? regionEvidence
            .filter((region) => region.kind === "table" && region.pageStart === caption.pageStart &&
              region.boundingBoxes.some((candidateBox) =>
                Math.abs(candidateBox.y - caption.layoutBlock.bbox.y) <= 500 &&
                horizontallyCompatible(candidateBox, box)
              ))
            .sort((a, b) => {
              const aBox = a.boundingBoxes[0];
              const bBox = b.boundingBoxes[0];
              return Math.abs((aBox?.y ?? Infinity) - box.y) - Math.abs((bBox?.y ?? Infinity) - box.y);
            })[0]
        : undefined;
      const anchoredBox = anchoredRegion?.boundingBoxes[0];
      return {
        id: `fig-${i}`,
        role: role as "figure" | "table",
        text: null,
        pageStart: caption.pageStart,
        pageEnd: regionMembers.length > 0 ? Math.max(caption.pageEnd, ...regionMembers.map((member) => member.pageEnd)) : caption.pageEnd,
        boundingBoxes: regionMembers.length > 0 ? memberBoxes : anchoredBox ? [anchoredBox] : [figureBox],
        structuralLabel: role === "table" ? caption.layoutBlock.text : undefined,
        confidence: regionBox || anchoredRegion ? 0.86 : role === "table" ? 0.48 : 0.7,
        evidence: [
          {
            source: "generic-heuristic" as const,
            label: role,
            confidence: regionBox ? 0.86 : role === "table" ? 0.48 : 0.7,
            page: caption.pageStart,
            reason: regionBox
              ? `aligned native-text table region (${regionMembers.length} member blocks)`
              : role === "table"
                ? "caption-only table fallback; no structured region was inferred"
                : "region above caption (pdffigures2-style adjacent proposal)",
          },
        ],
        sourceAnchor: {
          page: caption.pageStart,
          boundingBoxes: [figureBox],
        },
        column: caption.column,
      };
    });
}
