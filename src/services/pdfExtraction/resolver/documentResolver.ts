import type { LayoutBlock, PageColumnLayout } from "../../pdfLayout";
import { scoreLayoutBlock } from "../../extractionConfidence";
import type {
  CanonicalDiagnostics,
  CanonicalDocument,
  CanonicalNode,
} from "../canonical/types";
import type { FormatDetection, PageTextKind, ExtractionEvidence } from "../types";
import type { RoleCandidate } from "../generic/candidates";
import type { StructuralRegionEvidence } from "../types";
import { formatTitleEvidence } from "../formats/applyHardRules";
import { normalizedTextHash } from "../sourceAnchor";
import { resolveTitle } from "./titleResolver";
import {
  affiliatedWithRelations,
  captionOfRelations,
  childOfRelations,
  floatedTableContinuationRelations,
  pageBoundaryContinuationRelations,
  figureNodesForCaptions,
  readsBeforeRelations,
} from "./relationResolver";

function resolvedRole(candidate: RoleCandidate): { role: CanonicalNode["role"]; confidence: number } {
  const scores = candidate.roleScores;
  // In Frontiers-style mastheads, a numbered author continuation can be
  // emitted as an affiliation block when it sits in the adjacent column.
  // Preserve it as an author when the line is short, marker-bearing, and
  // contains several person-shaped tokens without institution vocabulary.
  if (candidate.pageStart === 1 && candidate.role === "affiliation" && candidate.text.length <= 180 &&
      /\b(?:\d{1,2}|[*†‡])\s*(?:,|&|$)/.test(candidate.text) &&
      (/[\*†‡]/.test(candidate.text) || /\band\b/i.test(candidate.text) ||
       ((candidate.text.match(/\d{1,2}\s*[, ]\s*[A-ZÀ-ÖØ-Ý]/g)?.length ?? 0) >= 2 && /[À-ÖØ-öø-ÿ]/.test(candidate.text))) &&
      (candidate.text.match(/\b[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{1,}\b/g)?.length ?? 0) >= 3 &&
      !/\b(?:university|department|institute|laboratory|hospital|faculty|school|center|centre)\b/i.test(candidate.text)) {
    return { role: "author", confidence: Math.max(scores.author ?? 0.84, 0.84) };
  }
  // Institution-shaped text can inherit author styling in flattened journal
  // mastheads. Keep it as affiliation metadata instead of exposing it as an
  // author (e.g. a trailing consortium line after a wrapped author row).
  if (candidate.role === "author" && /\b(?:university|department|institute|laboratory|hospital|consortium|faculty|school|center|centre)\b/i.test(candidate.text)) {
    return { role: "affiliation", confidence: Math.max(scores.affiliation ?? 0.82, 0.82) };
  }
  const paragraph = scores.paragraph ?? 0.3;
  const ranked = Object.entries(scores)
    .filter((entry): entry is [CanonicalNode["role"], number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1]);
  const [role, score] = ranked[0] ?? [candidate.role, candidate.confidence];
  const symbolicFormula = (candidate.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length >= 4 &&
    (candidate.text.match(/[A-Za-z]{3,}/g) ?? []).length <= 6;
  const imageLabelEvidence = candidate.evidence.some((entry) =>
    entry.label === "image-overlap-label-cluster" || entry.label === "vector-figure-label-cluster"
  );
  const mixedNativeBand = candidate.evidence.find((entry) => entry.label === "mixed-native-x-band");
  const vectorFigureLabels = candidate.evidence.find((entry) => entry.label === "vector-figure-label-cluster");
  const captionedNativeMulticell = candidate.evidence.find(
    (entry) => entry.label === "captioned-native-multicell-row"
  );
  const repeatedChartLabels = candidate.evidence.find((entry) => entry.label === "repeated-numeric-chart-label");
  const axisLabelNeighborhood = candidate.evidence.find(
    (entry) => entry.label === "axis-label-numeric-neighborhood"
  );
  const proseCellGrid = candidate.evidence.find(
    (entry) => entry.label === "repeated-prose-cell-grid"
  );
  // Two independent geometry signals are required before excluding a block
  // from ordinary translation. A mixed x-band alone can be a legitimate
  // inline annotation; repeated numeric labels alone can occur in prose.
  // Their high-confidence combination is strong evidence that native figure
  // labels were fused into a paragraph. Preserve the text as `other` so a
  // later figure/table resolver can handle it without sending it to MADLAD.
  if (
    candidate.role === "paragraph" &&
    mixedNativeBand && mixedNativeBand.confidence >= 0.7 &&
    repeatedChartLabels && repeatedChartLabels.confidence >= 0.75
  ) {
    return { role: "other", confidence: Math.max(mixedNativeBand.confidence, repeatedChartLabels.confidence) };
  }
  // A dense, punctuation-free vector label cluster spanning multiple native
  // x-bands is independently strong evidence of diagram text. Allow it to
  // suppress translation even if the paragraph score is marginally higher.
  // The sentence-like prose guard lives in the generic evidence generator, so
  // this does not demote ordinary multi-column prose.
  if (
    candidate.role !== "title" &&
    vectorFigureLabels && vectorFigureLabels.confidence >= 0.82 &&
    (candidate.roleScores.table ?? 0) < 0.8 &&
    !(captionedNativeMulticell && captionedNativeMulticell.confidence >= 0.9)
  ) {
    return { role: "other", confidence: vectorFigureLabels.confidence };
  }
  // A native row with four or more separated cells and an explicit nearby
  // table caption can also trigger the vector-label detector because the PDF
  // exposes each cell as a short text span. Caption ownership plus the
  // multicell geometry is stronger than that generic figure signal; retain a
  // table role so the row is rendered as structured/source-only table data.
  if (captionedNativeMulticell && captionedNativeMulticell.confidence >= 0.9) {
    return { role: "table", confidence: Math.max(candidate.roleScores.table ?? 0, captionedNativeMulticell.confidence) };
  }
  if (imageLabelEvidence && (scores.other ?? 0) >= paragraph + 0.06) {
    return { role: "other", confidence: scores.other ?? score };
  }
  // A repeated prose-cell grid is a document-level geometry proof, not a
  // lexical guess. It may include bold headers and sentence-shaped cells, so
  // let it outrank heading/paragraph typography once all three column bands
  // have been established.
  if (proseCellGrid && proseCellGrid.confidence >= 0.95 && (scores.table ?? 0) >= 0.94) {
    return { role: "table", confidence: scores.table ?? proseCellGrid.confidence };
  }
  // Borderless matrices are often emitted as one native block per row. Their
  // short row labels (for example "Comfortable" or "Finger 1") can have a
  // strong heading-style score because the PDF uses bold text for the axis.
  // When the geometry classifier also sees a repeated numeric neighbourhood,
  // that table evidence is more specific than typography alone. Keep the
  // label in the table projection so it cannot become a translated heading.
  if (
    role === "heading" &&
    axisLabelNeighborhood &&
    axisLabelNeighborhood.confidence >= 0.8 &&
    (scores.table ?? 0) >= 0.9 &&
    !/[.!?;:]/.test(candidate.text) &&
    candidate.text.trim().split(/\s+/).filter(Boolean).length <= 4
  ) {
    return { role: "table", confidence: Math.max(scores.table ?? 0, axisLabelNeighborhood.confidence) };
  }
  // Precision first: weak semantic evidence falls back to paragraph instead
  // of turning normal prose into an equation, heading, or table.
  if (role === "equation" && !symbolicFormula && score < Math.max(0.72, paragraph + 0.18)) {
    return { role: "paragraph", confidence: paragraph };
  }
  // Table evidence may override paragraph only when native geometry produced
  // a very high-confidence grid.  This lets multi-cell table rows avoid
  // MADLAD while retaining the precision-first fallback for weak cues.
  if (role === "table" && score < 0.94 && score < Math.max(0.78, paragraph + 0.2)) {
    return { role: "paragraph", confidence: paragraph };
  }
  if (role === "heading" && score < Math.max(0.68, paragraph + 0.08)) {
    return { role: "paragraph", confidence: paragraph };
  }
  return { role, confidence: score };
}

function nodeFromCandidate(candidate: RoleCandidate): CanonicalNode {
  const box = candidate.boundingBoxes[0] ?? candidate.layoutBlock.bbox;
  const resolved = resolvedRole(candidate);
  return {
    id: candidate.id,
    role: resolved.role,
    text: candidate.text,
    pageStart: candidate.pageStart,
    pageEnd: candidate.pageEnd,
    boundingBoxes: candidate.boundingBoxes,
    confidence: resolved.confidence,
    evidence: [
      ...candidate.evidence,
      {
        source: "generic-heuristic",
        label: "role-scores",
        confidence: resolved.confidence,
        page: candidate.pageStart,
        bbox: candidate.layoutBlock.bbox,
        reason: Object.entries(candidate.roleScores)
          .map(([role, score]) => `${role}=${Number(score).toFixed(2)}`)
          .join(", "),
      },
    ],
    sourceAnchor: {
      page: candidate.pageStart,
      boundingBoxes: candidate.boundingBoxes,
      normalizedTextHash: normalizedTextHash(
        candidate.text,
        candidate.pageStart,
        box.x,
        box.y
      ),
    },
    column: candidate.column,
    style: candidate.style,
  };
}

function promoteRotatedTableCaptions(
  nodes: CanonicalNode[],
  candidates: RoleCandidate[]
): CanonicalNode[] {
  const tableBoxes = candidates
    .filter((candidate) => (candidate.roleScores.table ?? 0) >= 0.94)
    .flatMap((candidate) => candidate.boundingBoxes);
  if (tableBoxes.length === 0) return nodes;
  return nodes.map((node) => {
    if (node.role !== "heading" || !node.text || node.text.length > 100) return node;
    const candidate = candidates.find((item) => item.id === node.id);
    if (!candidate || !candidate.layoutBlock.lines.some((line) => Math.abs(line.rotation ?? 0) >= 45)) {
      return node;
    }
    const box = node.boundingBoxes[0];
    if (!box) return node;
    const nearTable = tableBoxes.some((table) =>
      table.page === box.page &&
      box.y >= table.y + table.height &&
      box.y - (table.y + table.height) < 48 &&
      box.x < table.x + table.width &&
      table.x < box.x + box.width
    );
    return nearTable
      ? {
          ...node,
          role: "caption" as const,
          confidence: Math.min(0.86, node.confidence + 0.08),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "rotation-aware-table-caption",
              confidence: 0.82,
              page: node.pageStart,
              bbox: box,
              reason: "short rotated heading immediately below a high-confidence table region",
            },
          ],
        }
      : node;
  });
}

/**
 * IEEE/ACM often emit `Abstract—Body sentence…` as one native paragraph.
 * Layout keeps that shape as prose so it is not promoted to the title; split
 * the structural label here so markAbstracts can attach the body.
 * Bodies are re-scanned so `Background … Methods …` chains keep splitting.
 */
function splitInlineSectionLabels(nodes: CanonicalNode[]): CanonicalNode[] {
  const out: CanonicalNode[] = [];
  for (const node of nodes) {
    out.push(...splitInlineSectionLabelChain(node, 0));
  }
  return out;
}

function splitInlineSectionLabelChain(node: CanonicalNode, depth: number): CanonicalNode[] {
  if (depth > 6) return [node];
  if (node.role !== "paragraph" && node.role !== "heading") return [node];
  const text = (node.text ?? "").trim();
  if (!text) return [node];

  const pushSplit = (parts: CanonicalNode[]): CanonicalNode[] => {
    const expanded: CanonicalNode[] = [];
    for (const part of parts) {
      if (part.role === "paragraph") expanded.push(...splitInlineSectionLabelChain(part, depth + 1));
      else expanded.push(part);
    }
    return expanded;
  };

  // `Abstract—Body` / `Abstract-Body` (IEEE) or `Abstract Body…`.
  const emDash = text.match(
    /^(Abstract|Background|Objective|Objectives|Purpose|Aims?|Introduction|Related Work|Methods|Results|Discussion|Conclusion|Conclusions)(?:\s*[—–-]\s*|\s+)(.+)$/i
  );
  if (
    emDash &&
    emDash[2].trim().split(/\s+/).filter(Boolean).length >= 5 &&
    /^[A-Z(]/.test(emDash[2].trim()) &&
    !/^\d+\.\s/.test(emDash[2].trim())
  ) {
    const label = emDash[1].replace(/\b\w/g, (ch) => ch.toUpperCase());
    const body = emDash[2].trim();
    return pushSplit([
      {
        ...node,
        id: `${node.id}::section-label`,
        role: "heading",
        text: label,
        confidence: Math.max(node.confidence, 0.9),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "inline-section-label-split",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "split unspaced section label from following prose",
          },
        ],
      },
      { ...node, id: `${node.id}::section-body`, role: "paragraph", text: body },
    ]);
  }

  // Unnumbered section labels glued into the first sentence of the section.
  const plainSection = text.match(
    /^(Materials and Methods|Results and Discussions?|Methodology|Background|Objective|Objectives|Methods|Results|Discussion|Conclusions?)\s+([A-Z(].+)$/i
  );
  if (
    plainSection &&
    plainSection[2].trim().split(/\s+/).filter(Boolean).length >= 5 &&
    !/^(?:Materials and Methods|Results and Discussions?|Methodology|Background|Objective|Objectives|Methods|Results|Discussion|Conclusions?)$/i.test(text)
  ) {
    const label = plainSection[1].replace(/\b\w/g, (ch) => ch.toUpperCase());
    const body = plainSection[2].trim();
    return pushSplit([
      {
        ...node,
        id: `${node.id}::plain-section-label`,
        role: "heading",
        text: label,
        confidence: Math.max(node.confidence, 0.9),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "plain-section-label-split",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "split unnumbered section label from following prose",
          },
        ],
      },
      { ...node, id: `${node.id}::plain-section-body`, role: "paragraph", text: body },
    ]);
  }

  // Mid-paragraph unnumbered section labels after a sentence end.
  // Greedy `.*[.!?]` so we split on the sentence end immediately before the
  // section label, not the first period in a long abstract paragraph.
  const midSection = text.match(
    /^(.*[.!?])\s+(Background|Methods|Results|Discussion|Conclusions?|Introduction)\s+([A-Z][\s\S]{20,})$/i
  );
  if (
    midSection &&
    midSection[1].trim().length >= 20 &&
    midSection[3].trim().split(/\s+/).filter(Boolean).length >= 5 &&
    !/\b(?:the|our|these|those|its|their)\s+$/i.test(midSection[1])
  ) {
    const label = midSection[2].replace(/\b\w/g, (ch) => ch.toUpperCase());
    const body = midSection[3].trim();
    return pushSplit([
      { ...node, id: `${node.id}::pre-mid-section`, role: "paragraph", text: midSection[1].trim() },
      {
        ...node,
        id: `${node.id}::mid-section-label`,
        role: "heading",
        text: label,
        confidence: Math.max(node.confidence, 0.88),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "mid-paragraph-section-split",
            confidence: 0.88,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "split section label glued after sentence end",
          },
        ],
      },
      { ...node, id: `${node.id}::mid-section-body`, role: "paragraph", text: body },
    ]);
  }

  // Keywords / chrome lines sometimes swallow the next numbered section.
  const numbered = text.match(
    /^(.*?\S)\s+(\d{1,2}\.\s+(?:Introduction|Related Work|Methods|Results|Discussion|Conclusions)\b.*)$/i
  );
  if (
    numbered &&
    numbered[1].trim().length >= 12 &&
    numbered[2].trim().split(/\s+/).filter(Boolean).length >= 4 &&
    !/^\d{1,2}\.\s/.test(numbered[1].trim())
  ) {
    const prefix = numbered[1].trim();
    const rest = numbered[2].trim();
    const headingMatch = rest.match(
      /^(\d{1,2}\.\s+(?:Introduction|Related Work|Methods|Results|Discussion|Conclusions))\b(?:\s+|$)(.*)$/i
    );
    if (headingMatch) {
      const parts: CanonicalNode[] = [
        { ...node, id: `${node.id}::pre-section`, role: "paragraph", text: prefix },
        {
          ...node,
          id: `${node.id}::numbered-section-label`,
          role: "heading",
          text: headingMatch[1].replace(/\s+/g, " ").trim(),
          confidence: Math.max(node.confidence, 0.9),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic",
              label: "inline-numbered-section-split",
              confidence: 0.9,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "split numbered section heading glued into preceding prose",
            },
          ],
        },
      ];
      const body = headingMatch[2].trim();
      if (body.split(/\s+/).filter(Boolean).length >= 3) {
        parts.push({ ...node, id: `${node.id}::numbered-section-body`, role: "paragraph", text: body });
      }
      return pushSplit(parts);
    }
  }

  return [node];
}

function demotePageOneAuthorHeadings(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (node.role !== "heading" || node.pageStart !== 1 || !node.text) return node;
    const t = node.text.trim();
    // Bilingual mastheads often emit transliterated author names as large
    // "headings" beside the real article title. Keep genuine section labels.
    // Allow hyphenated given names (`Yong-Seok Jang`) and initials.
    const personShaped = /^[A-ZА-ЯЁ][a-zа-яё]*(?:-[A-ZА-ЯЁ][a-zа-яё]+)*(?:\s+[A-ZА-ЯЁ](?:\.|[a-zа-яё]*(?:-[A-ZА-ЯЁ][a-zа-яё]+)*)){1,3}$/u.test(t) &&
      t.length <= 42 &&
      !/\b(?:Abstract|Introduction|Related|Methods|Results|Discussion|Conclusion|Keywords?)\b/i.test(t);
    if (!personShaped) return node;
    return {
      ...node,
      role: "author" as const,
      confidence: Math.min(node.confidence, 0.82),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic",
          label: "page-one-author-heading-demotion",
          confidence: 0.8,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "person-shaped page-one heading demoted to author",
        },
      ],
    };
  });
}

/** Frontiers-style editorial chrome and abstract lead-ins that layout promotes to heading. */
function demoteEditorialChromeHeadings(nodes: CanonicalNode[]): CanonicalNode[] {
  const titleText = nodes.find((n) => n.role === "title")?.text?.trim().toLowerCase() ?? "";
  return nodes.map((node) => {
    if (node.role !== "heading" || !node.text) return node;
    const t = node.text.trim();
    const editorialLabel =
      /^(?:\*?correspondence|edited by|reviewed by|open access|citation|copyright|keywords?|published|received|accepted)$/i.test(t) ||
      /^(?:competing interests|research ethics|ethics approval|acknowledgements?)\b/i.test(t) ||
      /^open access\b/i.test(t) && /\blicensed under\b/i.test(t) ||
      /@/.test(t);
    const abstractLeadIn =
      /^(?:this study|this paper|this article|this review|we (?:present|propose|report|investigate))\b/i.test(t) &&
      t.split(/\s+/).filter(Boolean).length >= 8;
    const duplicateTitle =
      titleText.length >= 24 && t.toLowerCase() === titleText;
    // Long sentence-like headings and math/table crumbs are body, not outline.
    const proseHeading =
      t.length > 90 && /[.!?]$/.test(t) && !/^\d+(?:\.\d+)*\s/.test(t);
    const mathOrTableCrumb =
      /[∑∫≤≥≠≈]/.test(t) ||
      /^\(?SOTA\)/i.test(t) ||
      /^number of true/i.test(t);
    if (!editorialLabel && !abstractLeadIn && !duplicateTitle && !proseHeading && !mathOrTableCrumb) {
      return node;
    }
    const asOther = editorialLabel || mathOrTableCrumb;
    return {
      ...node,
      role: asOther ? ("other" as const) : ("paragraph" as const),
      confidence: Math.min(node.confidence, 0.55),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic",
          label: "editorial-chrome-heading-demotion",
          confidence: 0.85,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: editorialLabel
            ? "editorial chrome label demoted from heading"
            : duplicateTitle
              ? "duplicate title heading demoted to paragraph"
              : proseHeading
                ? "sentence-like heading demoted to paragraph"
                : mathOrTableCrumb
                  ? "math/table crumb demoted from heading"
                  : "abstract lead-in prose demoted from heading",
        },
      ],
    };
  });
}

function markAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  let inAbstract = false;
  return nodes.map((node) => {
    if (node.role === "heading" && /^(?:abstract|要旨)$/i.test((node.text ?? "").trim())) {
      inAbstract = true;
      return node;
    }
    if (node.role === "heading") {
      inAbstract = false;
      return node;
    }
    if (inAbstract && node.role === "paragraph") {
      return { ...node, role: "abstract" };
    }
    return node;
  });
}

function suppressVectorLabelClusters(nodes: CanonicalNode[]): CanonicalNode[] {
  const captions = nodes.filter((node) => node.role === "caption");
  return nodes.map((node) => {
    const strongVectorLabel = node.evidence.some((entry) =>
      entry.label === "vector-figure-label-cluster" && entry.confidence >= 0.82
    );
    if (strongVectorLabel && (node.role === "heading" || node.role === "paragraph")) {
      return {
        ...node,
        role: "other" as const,
        confidence: Math.max(node.confidence, 0.84),
      };
    }
    if (!node.text || !["heading", "paragraph"].includes(node.role) || node.text.length > 40) return node;
    const text = node.text.trim();
    if (!text || /[.!?。！？]$/.test(text)) return node;
    const tokens = text.split(/\s+/).filter(Boolean);
    const labelLike = tokens.length >= 2 && tokens.every((token) =>
      token.length <= 12 && /^[A-Z][A-Za-z0-9_+−–—/().]*$/.test(token)
    );
    if (!labelLike) return node;
    const captionNearby = captions.some((caption) =>
      caption.pageStart === node.pageStart && Math.abs(caption.boundingBoxes[0]?.y - (node.boundingBoxes[0]?.y ?? 0)) < 260
    );
    if (!captionNearby) return node;
    const peers = nodes.filter((peer) => {
      if (peer === node || peer.pageStart !== node.pageStart || !peer.text || peer.text.length > 40) return false;
      if (/[.!?。！？]$/.test(peer.text.trim())) return false;
      const box = peer.boundingBoxes[0];
      const own = node.boundingBoxes[0];
      if (!box || !own || Math.abs(box.y - own.y) > 140 || Math.abs(box.x - own.x) > 260) return false;
      return peer.text.trim().split(/\s+/).filter(Boolean).length >= 2;
    });
    if (peers.length < 3) return node;
    return {
      ...node,
      role: "other" as const,
      confidence: Math.max(node.confidence, 0.84),
      evidence: [...node.evidence, {
        source: "generic-heuristic" as const,
        label: "vector-label-cluster",
        confidence: 0.84,
        page: node.pageStart,
        bbox: node.boundingBoxes[0] ?? { page: node.pageStart, x: 0, y: 0, width: 0, height: 0 },
        reason: "short symbol-like labels form a local cluster near a figure/table caption",
      }],
    };
  });
}

/** Remove exact duplicate caption candidates emitted by native text streams.
 * Keep the most confident/provenanced candidate; near-duplicate prose is left
 * untouched because it may represent a legitimate continuation.
 */
function dedupeExactCaptions(nodes: CanonicalNode[]): CanonicalNode[] {
  const seen = new Map<string, CanonicalNode>();
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    if (node.role !== "caption" || !node.text) {
      result.push(node);
      continue;
    }
    const key = `${node.pageStart}:${node.text.trim().replace(/\s+/g, " ").toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, node);
      result.push(node);
      continue;
    }
    if (node.confidence > existing.confidence) {
      const index = result.indexOf(existing);
      if (index >= 0) result[index] = node;
      seen.set(key, node);
    }
  }
  return result;
}

/** Join a figure caption that was split by a native text stream.  This is
 * intentionally narrower than paragraph stitching: it requires an explicit
 * Figure caption, the caption to end like an unfinished label/description,
 * and a nearby same-page paragraph whose geometry is aligned with it. */
function mergeFigureCaptionContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    const directPrevious = result[result.length - 1];
    const captionIndex = directPrevious?.role === "caption"
      ? result.length - 1
      : result.findLastIndex((candidate) => candidate.role === "caption");
    const previous = captionIndex >= 0 ? result[captionIndex] : directPrevious;
    const previousBox = previous?.boundingBoxes[previous.boundingBoxes.length - 1];
    const nodeBox = node.boundingBoxes[0];
    const captionText = previous?.text?.trim() ?? "";
    const continuation = node.text?.trim() ?? "";
    const verticalGap = previousBox && nodeBox ? nodeBox.y - (previousBox.y + previousBox.height) : Infinity;
    const xAligned = previousBox && nodeBox
      ? Math.abs(nodeBox.x - previousBox.x) <= Math.max(24, previousBox.width * 0.35)
      : false;
    const intervening = captionIndex >= 0 ? result.slice(captionIndex + 1) : [];
    const harmlessIntervening = intervening.every((candidate) =>
      candidate.role === "other" ||
      (candidate.role === "paragraph" && (candidate.text?.trim().length ?? 0) <= 24 &&
        ((candidate.text?.match(/[A-Za-z]/g) ?? []).length <= 8))
    );
    const labeledFigureContinuation = /\b(?:[A-D]|Panel\s+[A-D])\s*:/i.test(continuation) &&
      /\b(?:human|model|probability|condition|error bars|data)\b/i.test(continuation);
    const numberedProcedureContinuation = (continuation.match(/(?:^|\s)\d+\.\s+/g) ?? []).length >= 2;
    // A caption continuation is normally a short label/panel line. A long,
    // sentence-like paragraph immediately below an unpunctuated caption is
    // body prose, even when the PDF geometry is close enough to look like a
    // continuation. Keeping this boundary prevents the resolver from
    // swallowing the article's next paragraph into a figure caption.
    const continuationWords = continuation.split(/\s+/).filter(Boolean).length;
    const sentenceLikeBodyContinuation = continuationWords > 24 &&
      /^[A-Z][A-Za-z]/.test(continuation) &&
      !labeledFigureContinuation;
    const canMerge = previous?.role === "caption" &&
      /^\s*(?:figure|fig\.?|図)\s*\d+/i.test(captionText) &&
      previous.pageStart === node.pageStart &&
      (node.role === "paragraph" || node.role === "table") &&
      continuation.length >= 12 &&
      verticalGap >= -18 && verticalGap <= 42 &&
      (xAligned || (harmlessIntervening && verticalGap <= 180)) &&
      (!/[.!?]\s*$/.test(captionText) || labeledFigureContinuation) &&
      !numberedProcedureContinuation &&
      !sentenceLikeBodyContinuation &&
      !/^(?:table|figure|fig\.?|図|references?|introduction|methods?|results?)\b/i.test(continuation);
    if (canMerge) {
      result[captionIndex] = {
        ...previous,
        text: `${captionText} ${continuation}`.replace(/\s+/g, " ").trim(),
        pageEnd: node.pageEnd,
        boundingBoxes: [...previous.boundingBoxes, ...node.boundingBoxes],
        confidence: Math.min(previous.confidence, node.confidence),
        evidence: [...previous.evidence, ...node.evidence.filter((evidence) => evidence.label === "page-boundary-continuation")],
      };
      if (captionIndex < result.length - 1) result.splice(captionIndex + 1);
      continue;
    }
    result.push(node);
  }
  return result;
}

/** Join wrapped table-caption text before table-region promotion. Some native
 * streams label the first line as `table_caption` and emit the remaining
 * lowercase lines as ordinary paragraphs. If those lines are allowed into
 * the resolver first, numeric-neighborhood evidence can incorrectly promote
 * them to table cells. Require same-page caption typography geometry and a
 * lowercase continuation so body prose remains a paragraph. */
function mergeTableCaptionContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    const captionIndex = result.findLastIndex((candidate) => candidate.role === "caption" && /^(?:table|表)\s*\d+/i.test(candidate.text?.trim() ?? ""));
    const previous = captionIndex >= 0 ? result[captionIndex] : undefined;
    const captionText = previous?.text?.trim() ?? "";
    const continuation = node.text?.trim() ?? "";
    const previousBox = previous?.boundingBoxes.at(-1);
    const nodeBox = node.boundingBoxes[0];
    const verticalGap = previousBox && nodeBox ? nodeBox.y - (previousBox.y + previousBox.height) : Infinity;
    const horizontallyInside = previousBox && nodeBox
      ? nodeBox.x >= previousBox.x - 8 && nodeBox.x + nodeBox.width <= previousBox.x + previousBox.width + 8
      : false;
    const sameLineHeight = previousBox && nodeBox ? Math.abs(nodeBox.height - previousBox.height) <= 0.8 : false;
    const canMerge = previous?.role === "caption" &&
      /^\s*(?:table|表)\s*\d+/i.test(captionText) &&
      previous.pageStart === node.pageStart &&
      (node.role === "paragraph" || node.role === "table") &&
      continuation.length >= 2 &&
      /^[a-zà-öø-ÿ]/u.test(continuation) &&
      !/[.!?]\s*$/.test(captionText) &&
      verticalGap >= -4 && verticalGap <= 42 &&
      horizontallyInside &&
      sameLineHeight &&
      continuation.split(/\s+/).filter(Boolean).length <= 24;
    if (canMerge) {
      result[captionIndex] = {
        ...previous,
        text: `${captionText} ${continuation}`.replace(/\s+/g, " ").trim(),
        pageEnd: node.pageEnd,
        boundingBoxes: [...previous.boundingBoxes, ...node.boundingBoxes],
        confidence: Math.min(previous.confidence, node.confidence),
        evidence: [...previous.evidence, ...node.evidence.filter((evidence) => evidence.label === "page-boundary-continuation")],
      };
      continue;
    }
    result.push(node);
  }
  return result;
}

function average(values: number[], fallback = 0.8): number {
  if (values.length === 0) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Apply only high-confidence, explicitly anchored region evidence. Generic
 * callers usually provide no regions; when present, member ids are the hard
 * boundary that prevents page-wide guesses from relabelling prose. */
function looksLikeProseTableRegionMember(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (/[.!?;]\s*$/.test(trimmed) && words.length >= 4) return true;
  if (words.length >= 12 && digits / Math.max(letters + digits, 1) < 0.08) return true;
  // Lone words / short letter runs beside a chart are not table cells.
  if (digits === 0 && words.length <= 3 && letters >= 3) return true;
  return false;
}

export function resolveTableRegions(nodes: CanonicalNode[], regions: StructuralRegionEvidence[]): CanonicalNode[] {
  let resolvedNodes = nodes;
  for (const region of regions) {
    if (region.kind !== "table" || region.confidence < 0.98 || region.memberCandidateIds.length === 0) continue;
    const memberIds = new Set(region.memberCandidateIds);
    const members = resolvedNodes.filter((node) => memberIds.has(node.id));
    if (members.length !== region.memberCandidateIds.length) continue;
    const physicallyBoundedGrid = region.provenance.some((entry) =>
      entry.label === "caption-anchored-graphics-grid" && entry.confidence >= 0.99
    );
    const memberIdsToPromote = new Set(members
      .filter((node) =>
        (node.role === "paragraph" || node.role === "other") &&
        // A paragraph carrying explicit image/vector-label evidence may
        // intersect a caption-anchored region from the other column. Keep
        // that geometry-owned figure label out of table promotion; the
        // candidate resolver will preserve it as `other` instead.
        !node.evidence.some((entry) =>
          entry.label === "image-overlap-label-cluster" ||
          entry.label === "vector-figure-label-cluster"
        ) &&
        (physicallyBoundedGrid || !looksLikeProseTableRegionMember(node.text))
      )
      .map((node) => node.id));
    if (memberIdsToPromote.size === 0) continue;
    resolvedNodes = resolvedNodes.map((node) => {
      if (!memberIdsToPromote.has(node.id)) return node;
      return {
        ...node,
        role: "table",
        confidence: Math.max(node.confidence, region.confidence),
        evidence: [...node.evidence, ...region.provenance, {
          source: "layout-model" as const,
          label: "table-region-member",
          confidence: region.confidence,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: `region=${region.id}`,
        }],
      };
    });
  }
  return resolvedNodes;
}

export function resolveCanonicalDocument(input: {
  candidates: RoleCandidate[];
  layouts: PageColumnLayout[];
  blocks: LayoutBlock[];
  baseFontSize: number;
  detection: FormatDetection;
  pageKind: PageTextKind;
  pageCount: number;
  filePath?: string;
  fileHash?: string;
  metadataTitle?: string;
  extraEvidence?: ExtractionEvidence[];
  regionEvidence?: StructuralRegionEvidence[];
  grobidTitle?: string | null;
}): CanonicalDocument {
  const { candidates, detection } = input;
  const titleResolved = resolveTitle({
    candidates,
    metadataTitle: input.metadataTitle,
    extra: [
      ...formatTitleEvidence(detection),
      ...(input.extraEvidence ?? []),
    ],
    grobidTitle: input.grobidTitle,
  });

  let nodes = candidates.map(nodeFromCandidate);
  nodes = mergeTableCaptionContinuations(nodes);
  nodes = resolveTableRegions(nodes, input.regionEvidence ?? []);
  nodes = promoteRotatedTableCaptions(nodes, candidates);
  nodes = splitInlineSectionLabels(nodes);
  nodes = demotePageOneAuthorHeadings(nodes);
  nodes = markAbstracts(nodes);
  nodes = suppressVectorLabelClusters(nodes);
  nodes = dedupeExactCaptions(nodes);
  nodes = mergeFigureCaptionContinuations(nodes);

  const resolvedTitleText = titleResolved.text;
  const titleNode = nodes.find((n) => n.role === "title");
  if (titleNode && resolvedTitleText) {
    titleNode.text = resolvedTitleText;
    titleNode.confidence = titleResolved.confidence;
    titleNode.evidence = [...titleNode.evidence, ...titleResolved.evidence];
  } else if (!titleNode && resolvedTitleText) {
    // Metadata/GROBID can supply a title even when the native candidate was
    // conservatively left as paragraph. Reuse the closest native candidate's
    // provenance so the resolved title never becomes an unanchored node.
    const titleSource = candidates
      .filter((candidate) => candidate.pageStart === 1 && candidate.boundingBoxes.length > 0)
      .sort((a, b) => {
        const aScore = a.evidence.some((e) => /title/i.test(e.label)) ? 1 : 0;
        const bScore = b.evidence.some((e) => /title/i.test(e.label)) ? 1 : 0;
        return bScore - aScore || Math.abs(a.text.length - resolvedTitleText.length) - Math.abs(b.text.length - resolvedTitleText.length);
      })[0];
    nodes.unshift({
      id: "title-resolved",
      role: "title",
      text: resolvedTitleText,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: titleSource?.boundingBoxes ?? [],
      confidence: titleResolved.confidence,
      evidence: titleResolved.evidence,
      sourceAnchor: titleSource
        ? { page: titleSource.pageStart, boundingBoxes: titleSource.boundingBoxes }
        : { page: 1, boundingBoxes: [] },
    });
  }

  nodes = demoteEditorialChromeHeadings(nodes);

  const figureNodes = figureNodesForCaptions(candidates, input.regionEvidence ?? []);
  nodes = [...nodes, ...figureNodes];

  const headingNodes = nodes.filter((n) => n.role === "heading");
  const readable = nodes.filter((n) =>
    ["heading", "paragraph", "abstract", "caption", "equation", "footnote", "reference", "other"].includes(
      n.role
    )
  );
  const fallbackOrder = readable.map((n) => n.id);

  const relations = [
    ...readsBeforeRelations(fallbackOrder),
    ...childOfRelations(headingNodes),
    ...captionOfRelations(nodes),
    ...affiliatedWithRelations(nodes),
    ...pageBoundaryContinuationRelations(nodes, input.layouts),
    ...floatedTableContinuationRelations(nodes, input.layouts),
  ];

  const layoutScores = input.blocks.map((block) => {
    const layout = input.layouts.find((l) => l.page === block.pageStart);
    return scoreLayoutBlock(block, layout);
  });
  const layoutConfidence = average(layoutScores.map((s) => s.diagnostics.columnConfidence));
  const readingOrderConfidence = average(
    layoutScores.map((s) => s.diagnostics.readingOrderConfidence)
  );
  const unicodeConfidence = average(
    layoutScores.map((s) => s.diagnostics.unicodeConfidence)
  );
  const paragraphConfidence = average(
    layoutScores.map((s) => s.diagnostics.paragraphConfidence)
  );
  const formatConfidence =
    detection.applied === "generic"
      ? 0.55
      : detection.scores[detection.applied];
  const relationConfidence = relations.length === 0 ? 0.5 : average(relations.map((r) => r.score));
  const semanticConfidence = average(
    nodes.filter((n) => n.role === "title" || n.role === "heading" || n.role === "author").map((n) => n.confidence),
    titleResolved.confidence || 0.6
  );

  const diagnostics: CanonicalDiagnostics = {
    layoutConfidence: round2(layoutConfidence),
    readingOrderConfidence: round2(readingOrderConfidence),
    textIntegrityConfidence: round2(unicodeConfidence),
    semanticConfidence: round2(semanticConfidence),
    formatConfidence: round2(formatConfidence),
    relationConfidence: round2(relationConfidence),
    columnConfidence: round2(layoutConfidence),
    unicodeConfidence: round2(unicodeConfidence),
    paragraphConfidence: round2(paragraphConfidence),
  };

  return {
    source: {
      filePath: input.filePath,
      fileHash: input.fileHash,
      pageCount: input.pageCount,
    },
    pageCount: input.pageCount,
    format: detection,
    pageKind: input.pageKind,
    nodes,
    relations,
    diagnostics,
    formatId: detection.applied,
  };
}

function round2(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export { topologicalOrder } from "./relationResolver";
