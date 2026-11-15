import type { LayoutBlock, PageColumnLayout } from "../../pdfLayout";
import { looksLikeAuthorList } from "../../pdfLayout";
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
import * as publisherPredicates from "../formats/publisherChrome";
import { normalizedTextHash } from "../sourceAnchor";
import { resolveTitle } from "./titleResolver";
import {
  mergeMathematicalDisplayFragments,
  sanitizeMathControls,
} from "./mathFragmentMerge";

/** Vignette / forced-choice prompts mistaken for prose-cell grids. */
function looksLikeVignetteOrOptionProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^(?:Q\s*:|[-•]\s*Option\b)/i.test(trimmed)) return true;
  // Linda-style multi-sentence bios that sit beside Option rows in the same
  // repeated column anchors — keep real method/goal grids out of this net.
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (
    words.length >= 20 &&
    /[.!?]\s+[A-Z]/.test(trimmed) &&
    !/\d/.test(trimmed) &&
    /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+is\b|Imagine\b|Suppose\b)/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/** Sentence-shaped body lines near vector figures stay translatable. */
function looksLikeSentenceProse(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 6 && /[A-Za-z]/.test(trimmed) &&
    (/[,:;]/.test(trimmed) || /^(?:In |By |We |The |This |For |As |To )/i.test(trimmed));
}

/** Publisher running headers painted as outline headings. */

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
      (/[*†‡]/.test(candidate.text) || /\band\b/i.test(candidate.text) ||
       ((candidate.text.match(/\d{1,2}\s*[, ]\s*[A-ZÀ-ÖØ-Ý]/g)?.length ?? 0) >= 2 && /[À-ÖØ-öø-ÿ]/.test(candidate.text))) &&
      (candidate.text.match(/\b[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{1,}\b/g)?.length ?? 0) >= 3 &&
      !/\b(?:university|department|institute|laboratory|hospital|faculty|school|center|centre)\b/i.test(candidate.text)) {
    return { role: "author", confidence: Math.max(scores.author ?? 0.84, 0.84) };
  }
  // Institution-shaped text can inherit author styling in flattened journal
  // mastheads. Keep it as affiliation metadata instead of exposing it as an
  // author (e.g. a trailing consortium line after a wrapped author row).
  if (candidate.role === "author" && publisherPredicates.isInstitutionalAuthorLine(candidate.text)) {
    return { role: "affiliation", confidence: Math.max(scores.affiliation ?? 0.82, 0.82) };
  }
  // Layout-owned captions must not lose to heading typography races
  // (`TABLE 2` with ALL-CAPS + spacing still scores as a section head).
  if (
    candidate.layoutBlock.role === "table_caption" ||
    candidate.layoutBlock.role === "figure_caption"
  ) {
    return {
      role: "caption",
      confidence: Math.max(scores.caption ?? candidate.confidence, 0.9),
    };
  }
  // Page headers/footers and journal running rails (`Frontiers in Psychology`,
  // `IEEE XPLORE`) must not become outline headings via ALL-CAPS boosts.
  if (candidate.layoutBlock.role === "header" || candidate.layoutBlock.role === "footer") {
    return {
      role: candidate.layoutBlock.role,
      confidence: Math.max(
        scores[candidate.layoutBlock.role] ?? candidate.confidence,
        0.88,
      ),
    };
  }
  if (
    (candidate.layoutBlock.role === "copyright" || candidate.role === "copyright") &&
    publisherPredicates.isJournalRunningHeader(candidate.text)
  ) {
    return {
      role: "copyright",
      confidence: Math.max(scores.copyright ?? candidate.confidence, 0.9),
    };
  }
  const paragraph = scores.paragraph ?? 0.3;
  const ranked = Object.entries(scores)
    .filter((entry): entry is [CanonicalNode["role"], number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1]);
  const [role, score] = ranked[0] ?? [candidate.role, candidate.confidence];
  const symbolicFormula =
    ((candidate.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length >= 4 &&
      (candidate.text.match(/[A-Za-z]{3,}/g) ?? []).length <= 6) ||
    (/^(?:d\s*[A-ZΑ-Ω[]|d\[[A-Za-z]+\]|[A-Za-z][\w,+()]*\s*=)/.test(candidate.text.trim()) &&
      candidate.text.trim().split(/\s+/).filter(Boolean).length <= 14 &&
      (/=/.test(candidate.text) || /^d\s*[A-ZΑ-Ω[]/.test(candidate.text.trim())));
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
  // Real figure/table captions often sit inside the same vector band; keep
  // them as captions so Reader can still show `図 1 …` / `Figure 1 …`.
  // Layout-owned figure/table captions already returned above, so role !==
  // "caption" is enough here without re-checking layoutBlock.role.
  const cjkCheckmarkGrid = candidate.evidence.find(
    (entry) => entry.label === "cjk-checkmark-comparison-grid",
  );
  if (
    candidate.role !== "title" &&
    candidate.role !== "caption" &&
    (candidate.roleScores.caption ?? 0) < 0.85 &&
    vectorFigureLabels && vectorFigureLabels.confidence >= 0.82 &&
    (candidate.roleScores.table ?? 0) < 0.8 &&
    !(captionedNativeMulticell && captionedNativeMulticell.confidence >= 0.9) &&
    !(cjkCheckmarkGrid && cjkCheckmarkGrid.confidence >= 0.8) &&
    !looksLikeSentenceProse(candidate.text)
  ) {
    return { role: "other", confidence: vectorFigureLabels.confidence };
  }
  if (cjkCheckmarkGrid && cjkCheckmarkGrid.confidence >= 0.8) {
    return {
      role: "table",
      confidence: Math.max(candidate.roleScores.table ?? 0, cjkCheckmarkGrid.confidence),
    };
  }
  // A native row with four or more separated cells and an explicit nearby
  // table caption can also trigger the vector-label detector because the PDF
  // exposes each cell as a short text span. Caption ownership plus the
  // multicell geometry is stronger than that generic figure signal; retain a
  // table role so the row is rendered as structured/source-only table data.
  if (captionedNativeMulticell && captionedNativeMulticell.confidence >= 0.9) {
    return { role: "table", confidence: Math.max(candidate.roleScores.table ?? 0, captionedNativeMulticell.confidence) };
  }
  if (
    imageLabelEvidence &&
    candidate.role !== "caption" &&
    (scores.caption ?? 0) < 0.85 &&
    (scores.other ?? 0) >= paragraph + 0.06 &&
    !looksLikeSentenceProse(candidate.text)
  ) {
    return { role: "other", confidence: scores.other ?? score };
  }
  // A repeated prose-cell grid is a document-level geometry proof, not a
  // lexical guess. It may include bold headers and sentence-shaped cells, so
  // let it outrank heading/paragraph typography once all three column bands
  // have been established. Vignette Q/Option prompts still lose to paragraph
  // so they are not absorbed into an opaque table card.
  if (
    proseCellGrid &&
    proseCellGrid.confidence >= 0.95 &&
    (scores.table ?? 0) >= 0.94 &&
    !looksLikeVignetteOrOptionProse(candidate.text)
  ) {
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
  // Display-equation crumbs win typography races on math-heavy PDFs; keep them
  // out of the outline even when the heading score is high.
  if (role === "heading" && symbolicFormula) {
    return { role: "equation", confidence: Math.max(score, 0.8) };
  }
  // Vector-label scoring can edge `other` a hair above paragraph on a
  // sentence that merely sits near a figure. Prefer the paragraph.
  if (role === "other" && looksLikeSentenceProse(candidate.text) && paragraph >= 0.7) {
    return { role: "paragraph", confidence: paragraph };
  }
  return { role, confidence: score };
}

/**
 * Rotation shared by a block's lines. A table row and a label running down the
 * side of a plot are both "text near each other"; only their baselines tell
 * them apart, so the resolver needs that signal on the node.
 */
function representativeNodeRotation(lines: { rotation?: number }[]): number {
  if (lines.length === 0) return 0;
  const rotated = lines.filter((line) => Math.abs(line.rotation ?? 0) >= 45).length;
  return rotated > lines.length / 2 ? 90 : 0;
}

/** Rotated and horizontal text never belong to the same table region. */
function sharesTextRotation(a: CanonicalNode, b: CanonicalNode): boolean {
  return (Math.abs(a.textRotation ?? 0) >= 45) === (Math.abs(b.textRotation ?? 0) >= 45);
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
    overlayBoundingBoxes: candidate.layoutBlock.lines.flatMap((line) => line.overlayBbox ? [line.overlayBbox] : []),
    textRotation: representativeNodeRotation(candidate.layoutBlock.lines),
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
  // Do not use `/i` on the body lead: with it, `[A-Z]` also matches `also` /
  // `and`, which falsely promotes mid-sentence "Results also…" into a heading.
  const emDash = text.match(
    /^(Abstract|Background|Objective|Objectives|Purpose|Aims?|Introduction|Related Work|Methods|Results|Discussion|Conclusion|Conclusions)(?:\s*[—–-]\s*|\s+)(.+)$/i
  );
  if (
    emDash &&
    emDash[2].trim().split(/\s+/).filter(Boolean).length >= 5 &&
    /^[A-Z(]/.test(emDash[2].trim()) &&
    // Lowercase glue only — Title Case `Of the participants…` after Results is OK.
    !/^(?:and|also|of|on|in|for|with|to|as|that|which)\b/.test(emDash[2].trim()) &&
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

  // Parent section label glued onto a short child heading
  // (`Interventions Cell phone support` / `Measures Demographics and health status`).
  // Require a short Title-Case child (not a full sentence) so Methods prose stays intact.
  const nestedHeading = text.match(
    /^(Interventions|Measures|Procedures|Materials|Background|Results|Discussion|Methods)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Za-z][\p{L}'’-]*){0,6})$/u,
  );
  if (
    nestedHeading &&
    node.role === "heading" &&
    !/[:.]/.test(text) &&
    nestedHeading[2]!.trim().split(/\s+/).length >= 2 &&
    nestedHeading[2]!.trim().split(/\s+/).length <= 7 &&
    !/^(?:and|also|of|on|in|for|with|to|as|that|which|the|this)\b/i.test(nestedHeading[2]!.trim())
  ) {
    const parent = nestedHeading[1]!;
    const child = nestedHeading[2]!.trim();
    return pushSplit([
      {
        ...node,
        id: `${node.id}::nested-parent`,
        role: "heading",
        text: parent,
        confidence: Math.max(node.confidence, 0.88),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "nested-section-heading-split",
            confidence: 0.88,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "split parent section label from glued child heading",
          },
        ],
      },
      {
        ...node,
        id: `${node.id}::nested-child`,
        role: "heading",
        text: child,
        confidence: Math.max(node.confidence, 0.86),
      },
    ]);
  }

  // Unnumbered section labels glued into the first sentence of the section.
  const plainSection = text.match(
    /^(Materials and Methods|Results and Discussions?|Methodology|Background|Objective|Objectives|Methods|Results|Discussion|Conclusions?)\s+([A-Z(].+)$/i
  );
  if (
    plainSection &&
    plainSection[2].trim().split(/\s+/).filter(Boolean).length >= 5 &&
    /^[A-Z(]/.test(plainSection[2].trim()) &&
    !/^(?:and|also|of|on|in|for|with|to|as|that|which)\b/.test(plainSection[2].trim()) &&
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
  // Body lead must be a true capital (ASCII check after /i match) so
  // "Results also show…" / "Discussion and analysis…" stay prose.
  const midSection = text.match(
    /^(.*[.!?])\s+(Background|Methods|Results|Discussion|Conclusions?|Introduction)\s+([\s\S]{20,})$/i
  );
  if (
    midSection &&
    midSection[1].trim().length >= 20 &&
    /^[A-Z(]/.test(midSection[3].trim()) &&
    !/^(?:and|also|of|on|in|for|with|to|as|that|which)\b/.test(midSection[3].trim()) &&
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

/**
 * Page-1 bylines with superscript affiliation markers are sometimes scored as
 * tables (`Name1, Name2 & Name3`). Recover them before author projection.
 */
function recoverPageOneAuthorTables(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (node.role !== "table" || node.pageStart !== 1 || !node.text) return node;
    const t = node.text.trim();
    // Bylines often carry affiliation superscripts (`Geddam1`, `Ghayvat4,5`)
    // that make the shared author-list heuristic fail — accept that shape here.
    const bylineWithMarkers =
      /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3}\d{0,2}(?:\s*[,;&]\s*|\s+(?:and|&)\s+)/u.test(t) &&
      (t.match(/[A-Z][\p{L}'’.-]+/gu) ?? []).length >= 4 &&
      (t.match(/\d/g) ?? []).length >= 2 &&
      (t.match(/\d/g) ?? []).length <= 10;
    if (!looksLikeAuthorList(t) && !bylineWithMarkers) return node;
    // Keep real tables: multi-line grids and digit-heavy score rows.
    if (t.includes("\n") || (t.match(/\d/g) ?? []).length > 12) return node;
    if (/university|department|institute|faculty|hospital|laboratory/i.test(t)) return node;
    return {
      ...node,
      role: "author" as const,
      confidence: Math.min(node.confidence, 0.86),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic",
          label: "page-one-author-table-recovery",
          confidence: 0.86,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "page-one byline mistaken for a table row",
        },
      ],
    };
  });
}

const ABSTRACT_STOP_RAIL =
  /^(?:keywords?|key words?|index terms?|kata kunci|how to cite|citation|categories|subjects?|mesh)\s*:?/i;
// Body section starts — not Cureus-style `Methods:` / `Results:` abstract bands
// (those keep a trailing colon and must stay inside the abstract).
// Require a heading-shaped tail so mid-abstract wraps like
// `result, molecular biology laboratory education…` do not become stop rails.
const SECTION_INTRO =
  /^(?:[IVXLCDM]+\.\s+)?(?:\d+\.?\s+)?(?:introduction|methods?|materials|results?|discussion|background|related\s+work)\b(?!\s*:)(?:\s*$|\s+[A-Z0-9])/i;

/** True only for bare / near-bare section headings — not BMJ-style
 * `Introduction Up to 40% of major complications…` structured-abstract leads. */
function isSectionIntroHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!SECTION_INTRO.test(trimmed)) return false;
  const rest = trimmed
    .replace(
      /^(?:[IVXLCDM]+\.\s+)?(?:\d+\.?\s+)?(?:introduction|methods?|materials|results?|discussion|background|related\s+work)\b\s*/i,
      "",
    )
    .trim();
  return rest.length < 48 || !/[a-z]{4,}/.test(rest);
}

/** IEEE ACCESS often paints `I. INTRODUCTION` as an author-role glyph. */
function promoteMislabelledSectionAuthors(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (node.role !== "author" || !node.text) return node;
    const text = node.text.trim();
    if (
      !(
        /^(?:[IVXLCDM]+\.)\s+[A-Z][A-Z\s\-:]{2,40}$/.test(text) ||
        SECTION_INTRO.test(text)
      ) ||
      text.length > 48
    ) {
      return node;
    }
    return {
      ...node,
      role: "heading" as const,
      confidence: Math.max(node.confidence, 0.88),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "section-author-role-promotion",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "roman-numeral section label recovered from author role",
        },
      ],
    };
  });
}

/** Frontiers-style editorial chrome and abstract lead-ins that layout promotes to heading. */
export function demoteEditorialChromeHeadings(nodes: CanonicalNode[]): CanonicalNode[] {
  const titleText = nodes.find((n) => n.role === "title")?.text?.trim().toLowerCase() ?? "";
  const looksLikeColumnHeader = (text: string): boolean => {
    const value = text.replace(/\s+/g, " ").trim();
    const count = value.split(/\s+/).filter(Boolean).length;
    return (
      count >= 1 &&
      count <= 3 &&
      value.length <= 28 &&
      /^[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,2}$/.test(value) &&
      !/^(?:introduction|methods?|results?|discussion|conclusion|references|acknowledgements?|abstract|background|objectives?|related\s+work)$/i.test(
        value,
      )
    );
  };
  return nodes.map((node) => {
    if (node.role !== "heading" || !node.text) return node;
    const t = node.text.trim();
    // Diagram / panel crumbs (`Aim`, `PA`) and DovePress QR chrome.
    const microPanelHeading =
      /^(?:aim|pa|vm|qr)$/i.test(t) ||
      /^(?:point your smartphone|video abstract|scan (?:the|this) (?:qr|code)|or use:)/i.test(t);
    // Table header cells painted as headings (`Brain Region` beside
    // `Framework Component` / `Function` on the same baseline).
    const box = node.boundingBoxes[0];
    const tableHeaderRow =
      looksLikeColumnHeader(t) &&
      Boolean(box) &&
      nodes.filter(
        (peer) =>
          peer !== node &&
          peer.pageStart === node.pageStart &&
          peer.text &&
          looksLikeColumnHeader(peer.text) &&
          Math.abs((peer.boundingBoxes[0]?.y ?? 9999) - box!.y) <= 8,
      ).length >= 1;
    // Funding / grant acknowledgement lines promoted as outline headings.
    const fundingChromeHeading =
      /^(?:this study was (?:partly )?supported by|funding:|supported by|acknowledgements?)\b/i.test(t) ||
      (/\b(?:hmrf|nsfc|nih grant|grant no\.?)\b/i.test(t) && t.length <= 120 && !/^\d+(?:\.\d+)+\s/.test(t));
    // Bare labels and notice leads (`Copyright © 2022 …` / `Copyright (1998) …`).
    const copyrightChrome =
      /^copyright\s*:?\s*$/i.test(t) ||
      /^copyright\s+and\b/i.test(t) ||
      /^reuse:\s*copyright\b/i.test(t) ||
      /^copyright\s*(?:©|\(\s*\d{4}\s*\)|\d{4}\b)/i.test(t) ||
      /^protected by copyright\b/i.test(t) ||
      // Thesis front-matter declaration banners (UNSW / similar).
      /^(?:copyright|authenticity|originality)\s+statement\s*$/i.test(t) ||
      /^downloaded from\b/i.test(t) ||
      /^to cite\s*:/i.test(t) ||
      /\bmoral rights remain with the author/i.test(t);
    const editorialLabel =
      microPanelHeading ||
      fundingChromeHeading ||
      tableHeaderRow ||
      copyrightChrome ||
      /^(?:\*?correspondence|edited by|reviewed by|open access|citation|copyright|keywords?|index terms?|published|received|revised|accepted)\s*:?\s*$/i.test(t) ||
      // Frontiers glued sidebar labels (`KEYWORDS COPYRIGHT` / `KEYWORDS CITATION`).
      /^(?:keywords?\s+(?:copyright|citation)|copyright\s+keywords?)\s*$/i.test(t) ||
      /^(?:for numbered affiliations see|correspondence to)\b/i.test(t) ||
      // Keyword / index rails with payload (`Keywords: information visualization, …`).
      /^(?:keywords?|index terms?|ccs concepts)\s*:\s*\S/i.test(t) ||
      /^(?:received|revised|accepted|published)\b/i.test(t) &&
        (t.length <= 48 ||
          /\bpeer review\b/i.test(t) ||
          // Frontiers glues several date rails into one heading
          // (`RECEIVED 03 March 2026 ACCEPTED 06 March 2026 KEYWORDS PUBLISHED…`).
          (t.length <= 220 &&
            /\b(?:received|revised|accepted|published|keywords?)\b/i.test(t.slice(10)) &&
            (t.match(/\b20\d{2}\b/g) ?? []).length >= 1)) ||
      /^(?:published:\s*)?peer review history\b/i.test(t) ||
      // BMJ Open / publisher footers often keep a trailing period (`24 September 2026.`).
      /^(?:\d{1,2}\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\.?$/i.test(t) ||
      // Figure captions promoted as outline headings
      // (`Conceptual framework illustrating the impact of …`).
      /^(?:fig(?:ure)?\.?\s*\d+|conceptual framework|schematic (?:overview|diagram|illustration))\b/i.test(t) ||
      // Bare / short table captions (`TABLE 2`, `Table 1. …`).
      /^(?:tables?|表)\s*\d+\b/i.test(t) ||
      /^(?:competing interests|research ethics|ethics approval|acknowledgements?|funding|data availability(?:\s+statement)?|declaration of generative ai|author contributions|conflict of interest|generative ai statement)\b/i.test(t) ||
      // Nature / Springer UI crumbs and graphical-abstract labels in the outline.
      /^check for updates$/i.test(t) ||
      /^graphical abstracts?$/i.test(t) ||
      /^abbreviations?$/i.test(t) ||
      /^study\s+protocol$/i.test(t) ||
      // Table column rails painted as outline headings (`Parameter Value`).
      /^(?:parameter\s+value|variable\s+name|feature\s+name|column\s+name)$/i.test(t) ||
      // Glued / bare table column headers without separators.
      /^(?:screening dimension|implication of differences|project content|dimension interview item)\b/i.test(t) ||
      /^(?:dimension|interview\s+item|framework\s+component|brain\s+region)\b/i.test(t) &&
        t.split(/\s+/).filter(Boolean).length <= 5 ||
      /^(?:inclusion|exclusion)\s+criteria\s*:?\s*$/i.test(t) ||
      /^open access\b/i.test(t) && /\blicensed under\b/i.test(t) ||
      // License / CC rails painted as outline headings on Frontiers covers.
      /\b(?:creative\s+commons|attribution\s+license|cc-?by(?:-nc|-nd|-sa)?)\b/i.test(t) ||
      /^(?:this is an open-access article|licensed under the)\b/i.test(t) ||
      /@/.test(t);
    const abstractLeadIn =
      (/^(?:this study|this paper|this article|this review|we (?:present|propose|report|investigate))\b/i.test(t) ||
        // BMJ structured-abstract label glued onto the following sentence
        // (`Methods and analysis This will be a quasi-experimental…`).
        /^(?:methods?\s+and\s+analysis|strengths?\s+and\s+limitations)\b/i.test(t)) &&
      t.split(/\s+/).filter(Boolean).length >= 6;
    const duplicateTitle =
      titleText.length >= 24 && t.toLowerCase() === titleText;
    // Long sentence-like headings and math/table crumbs are body, not outline.
    const proseHeading =
      t.length > 90 && /[.!?]$/.test(t) && !/^\d+(?:\.\d+)*\s/.test(t);
    // Frontiers / abstract bands often paint the first wrap of a paragraph as a
    // heading (`Fishermen primarily refer…`, `Guided by the PRISMA-ScR…`).
    const bodyLeadHeading =
      !/^\d+(?:\.\d+)*\s/.test(t) &&
      t.split(/\s+/).filter(Boolean).length >= 5 &&
      (/^(?:the|this|these|those|a|an|all|to|since|however|guided|fishermen|fisheries|moreover|furthermore|additionally|therefore|among|literature|disagreements|prisma|screening|seafarers|based on|short-term|long-term|in this|from our|\(|[“"‘'])/i.test(
        t,
      ) ||
        // Incomplete wraps ending mid-phrase.
        /\b(?:yet|the|of|and|a|an|for|with|from|to|in|on|both|are|is|map|intervention|forms|information|conducted|arbitration|three|two|one)$/i.test(
          t,
        ) ||
        // Results/findings prose wraps (`Results of EFA indicated that … consists of three`).
        (/^(?:results?\s+of|findings?\s+(?:of|from)|analysis\s+of)\b/i.test(t) &&
          t.split(/\s+/).filter(Boolean).length >= 8 &&
          !/^\d+(?:\.\d+)*\s/.test(t) &&
          !/[.!?]$/.test(t)) ||
        /\b(?:indicated|showed|revealed|suggested)\s+that\b/i.test(t) &&
          t.split(/\s+/).filter(Boolean).length >= 8 ||
        // Past-tense method/results prose painted as a heading.
        /\b(?:were|was|was used|is illustrated|are illustrated)\b/i.test(t) &&
          t.split(/\s+/).filter(Boolean).length >= 6);
    // Numbered section label glued onto following body prose
    // (`4.2 Recommendations …. Community-Embedded Suppor`).
    const numberedProseHeading =
      /^\d+(?:\.\d+)*\s+\S/.test(t) &&
      /[.!?]\s+[A-ZÀ-ÖØ-Þ]/.test(t) &&
      t.split(/\s+/).filter(Boolean).length >= 8;
    // Structured-abstract label glued onto the lead sentence, or bare
    // `Methods:` / `Background and objective: …` abstract bands.
    const structuredAbstractLeadHeading =
      /^(?:background(?:\s+and\s+objectives?)?|objectives?|aims?|methods?|materials(?:\s+and\s+methods)?|results?|findings?|conclusions?)\s*:/i.test(
        t,
      ) &&
      (t.split(/\s+/).filter(Boolean).length >= 4 ||
        /^(?:background(?:\s+and\s+objectives?)?|objectives?|aims?|methods?|results?|conclusions?)\s*:?\s*$/i.test(
          t,
        ));
    // Database query crumbs mistaken for outline headings.
    const searchQueryHeading =
      /[()]{2,}/.test(t) && /\b(?:limit-to|pubyear|wos|scopus)\b/i.test(t);
    const words = t.split(/\s+/).filter(Boolean).length;
    // Running headers: `106 D. A. SHEPHERD AND H. PATZELT`.
    const runningAuthorHeader =
      /^\d{1,4}\s+[A-Z](?:\.\s*[A-Z])*\.?\s+[A-Z][A-Z'’-]*(?:\s+(?:AND|&)\s+[A-Z](?:\.\s*[A-Z])*\.?\s+[A-Z][A-Z'’-]*)+\s*$/.test(t) ||
      (/^\d{1,4}\s+[A-Z][A-Z.\s'’-]+$/.test(t) &&
        /\b(?:AND|&)\b/.test(t) &&
        words <= 12 &&
        t === t.toUpperCase());
    // Journal chrome rails: lone `Article` / `Research Article` / OCR `Article ll`.
    const journalTypeRail =
      publisherPredicates.isJournalRunningHeader(t) ||
      /^(?:research\s+)?article(?:\s+[a-z]{1,3})?$/i.test(t) ||
      /^(?:brief\s+)?(?:communication|report)$/i.test(t) ||
      /^(?:review\s+article|original\s+article|research\s+paper)$/i.test(t) ||
      // Frontiers running footers (`11 frontiersin.org`).
      publisherPredicates.isFrontiersFooter(t);
    // Degree / institution crumbs promoted as outline headings
    // (`1 Doctorand, Universitatea Pedagogică de`).
    const degreeAffiliationHeading =
      /^(?:\d{1,2}\s+)?(?:doctorand|phd\s+candidate|doctoral\s+student|universitatea|university of)\b/i.test(t) &&
      words <= 12 &&
      !/^\d+(?:\.\d+)+\s/.test(t);
    // Publisher address / affiliation place lines mistaken for headings.
    const geoChromeHeading =
      /^(?:united\s+states(?:\s+of\s+america)?|united\s+kingdom|people'?s\s+republic\s+of\s+china|republic\s+of\s+korea)$/i.test(t);
    // Glued table column headers (`Risk Category Example Causes Potential Consequences`).
    // Require all-Title-Case stacks (or known truncated header leads) so real
    // section titles with lowercase connectors (`Advances in …`) stay headings.
    const titleCaseWords = t.split(/\s+/).filter(Boolean);
    const titleCased = titleCaseWords.filter((w) => /^[A-Z][A-Za-z'’-]*$/.test(w)).length;
    const lowerConnectors = titleCaseWords.filter((w) => /^[a-z]/.test(w)).length;
    const gluedHeaderLead =
      /^(?:level of|risk category|concept definition|what it reflects)\b/i.test(t);
    // ALL-CAPS section banners (`H COMPARISONS WITH LOGISTIC…`) are real
    // outline headings; title-case dense demotion is for glued Title-Case
    // table header stacks only.
    const allCapsBanner = t === t.toUpperCase() && /[A-Z]/.test(t);
    const titleCaseDense =
      !allCapsBanner &&
      titleCaseWords.length <= 12 &&
      !/[:.?]$/.test(t) &&
      !/^\d+(?:\.\d+)*\s/.test(t) &&
      !/\b(?:introduction|methods?|results?|discussion|conclusion|related work|abstract|acknowledgements?|background)\b/i.test(t) &&
      (
        (titleCaseWords.length >= 4 && lowerConnectors === 0 && titleCased === titleCaseWords.length) ||
        (gluedHeaderLead && titleCaseWords.length >= 3)
      );
    // Nature-style figure/stat crumbs painted as headings (`5.83 F`).
    // Also table p-value rails: `0.004 <0.001 Reasoning−oriented LLMs`.
    // Frontiers SEM f² / R² spills: `0.444 (large) 0.112 (medium)`.
    const effectSizeCellHeading =
      (/^\d\.\d{2,}\s*\((?:large|medium|small|none|negligible|small[–—-]medium)\)/i.test(t) &&
        words <= 8) ||
      (/^\d\.\d{2,}(?:\s*\([^)]+\))?(?:\s+\d\.\d{2,}(?:\s*\([^)]+\))?)+$/.test(t) &&
        words <= 8) ||
      /^[—–-]\s*\d\.\d{2,}(?:\s*\([^)]+\))?/.test(t);
    const dualConstructCellHeading =
      !/^\d+(?:\.\d+)*\s/.test(t) &&
      words >= 3 &&
      words <= 6 &&
      // Two Title-Case construct names stacked without a section number
      // (`Psychological resilience Employee wellbeing`).
      /^[A-Z][a-z]+(?:\s+[a-z]+)?(?:\s+[A-Z][a-z]+(?:\s+[a-z]+)?)+$/.test(t) &&
      (t.match(/\b[A-Z][a-z]+/g) ?? []).length >= 2 &&
      nodes.some(
        (peer) =>
          peer.pageStart === node.pageStart &&
          /^(?:table|表)\s*\d+/i.test(peer.text?.trim() ?? "") &&
          (peer.role === "caption" || peer.role === "paragraph" || peer.role === "heading"),
      );
    const statCrumbHeading =
      effectSizeCellHeading ||
      dualConstructCellHeading ||
      /^\d+(?:\.\d+)?\s*[A-Za-z]{1,3}$/.test(t) ||
      /^\d+\.\d{2}\s+[A-Z]$/.test(t) ||
      (/<\s*0?\.\d+/.test(t) &&
        (t.match(/<\s*0?\.\d+/g) ?? []).length >= 1 &&
        (/^\d/.test(t) || (t.match(/<\s*0?\.\d+/g) ?? []).length >= 2) &&
        words <= 14 &&
        !/^\d+(?:\.\d+)+\s+[A-Za-z]/.test(t));
    // Table body cells painted as outline headings
    // (`2019 118.80 GPixels/sec`, `10.26 GPixel/sec`).
    // Unit tokens already exclude real section titles (`2.1 Introduction`).
    const tableMetricCellHeading =
      /^(?:\d{4}\s+)?[\d.]+\s*(?:G?Pixels?(?:\/(?:s(?:ec)?)?)?|MPixels?(?:\/(?:s(?:ec)?)?)?|FPS|Hz|T?FLOPS?|GFLOPS|MFLOPS)\b/i.test(
        t,
      ) && words <= 6;
    // Lone math / OCR glyphs (`Þ`, `ð`, `σ`) painted as outline headings.
    const singleGlyphHeading =
      t.length <= 3 &&
      !/[A-Za-z0-9]{2}/.test(t) &&
      /[ÞþðÐσΣΩωμπα-ωΑ-Ω∫∑∏√∞]/.test(t);
    const mathOrTableCrumb =
      singleGlyphHeading ||
      /[∑∫≤≥≠≈]/.test(t) ||
      /^\(?SOTA\)/i.test(t) ||
      /^number of true/i.test(t) ||
      // Spaced display-math crumbs (`V ar(QM B − QM F )`) promoted as headings.
      (/^[A-Z]\s*[a-z]{1,3}\s*\([^)]*[−–—+\-×·⋅][^)]*\)\s*$/u.test(t) && words <= 12) ||
      // ODE / assignment fragments (`d[PTH]`, `cACE = …`, `= kVIP · …`, `0 = L · konR1`).
      (/^(?:=\s|\d+\s*=|d\s*[A-ZΑ-Ω[]|d\[[A-Za-z]+\]|[A-Za-z][+*]?(?:\s+\S+){0,8}\s*=)/.test(t) &&
        words <= 18 &&
        !/^\d+(?:\.\d+)+\s+[A-Za-z]/.test(t) &&
        !/\b(?:introduction|methods?|results?|discussion|conclusion|related work|abstract|acknowledgements?)\b/i.test(t)) ||
      (/=/.test(t) &&
        words <= 16 &&
        !/^\d+(?:\.\d+)+\s+[A-Za-z]/.test(t) &&
        !/\b(?:the|and|for|with|from|this|that|which|using|based|study|review)\b/i.test(t) &&
        (/[·⋅×−–—+()[\]₀-₉]/.test(t) || /[A-Za-z]\d/.test(t))) ||
      // Glued variable mash with no spaces (`AT1R,PTHAT1R,PTH`).
      (/^[A-Za-z0-9,+()[\]_-]{10,}$/.test(t) && /[A-Z].*[0-9].*[A-Z]/.test(t) && (t.match(/,/g) ?? []).length >= 1) ||
      // Chem / greek math crumbs (`[AT1R – AngII]`, `[AT1R – AngII]γAT1R,RANKL`, `γAT1R,PTH`).
      (/^\[[^\]]+\]/.test(t) && words <= 6 && (/[–—-]/.test(t) || /[α-ωΑ-Ω]/.test(t))) ||
      (/^[α-ωΑ-Ω][A-Za-z0-9,+()_-]{2,}$/u.test(t) && words <= 3) ||
      (/\[\s*\]/.test(t) && words <= 10 && !/\b(?:introduction|methods?|results?)\b/i.test(t));
    if (
      !editorialLabel &&
      !abstractLeadIn &&
      !duplicateTitle &&
      !proseHeading &&
      !bodyLeadHeading &&
      !numberedProseHeading &&
      !structuredAbstractLeadHeading &&
      !searchQueryHeading &&
      !mathOrTableCrumb &&
      !runningAuthorHeader &&
      !journalTypeRail &&
      !degreeAffiliationHeading &&
      !geoChromeHeading &&
      !titleCaseDense &&
      !statCrumbHeading &&
      !tableMetricCellHeading
    ) {
      return node;
    }
    const asOther =
      editorialLabel ||
      mathOrTableCrumb ||
      runningAuthorHeader ||
      journalTypeRail ||
      degreeAffiliationHeading ||
      geoChromeHeading ||
      titleCaseDense ||
      statCrumbHeading ||
      tableMetricCellHeading ||
      searchQueryHeading;
    const asCopyright = copyrightChrome;
    return {
      ...node,
      role: asCopyright
        ? ("copyright" as const)
        : asOther
          ? ("other" as const)
          : ("paragraph" as const),
      confidence: Math.min(node.confidence, 0.55),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic",
          label: "editorial-chrome-heading-demotion",
          confidence: 0.85,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: asCopyright
            ? "publisher running chrome demoted to copyright"
            : editorialLabel
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

/** Structured-abstract subheads under an Abstract label (Objectives / Methods…).
 * Bare `Introduction` is the body section after the abstract — only colon forms
 * (`Introduction:`) stay inside structured abstract bands elsewhere. */
const STRUCTURED_ABSTRACT_SUBHEAD =
  /^(?:background|objectives?|purpose|aims?|methods?|materials(?:\s+and\s+methods)?|results?|findings?|conclusions?|discussion)\s*:?\s*$/i;
/** Cambridge / Wiley bands: `Background. …` / `Aims. …` / `Background and Objectives: …`. */
const STRUCTURED_ABSTRACT_LEAD =
  /^(?:background(?:\s+and\s+(?:objectives?|aims?))?|aims?|objectives?|purpose|methods?|materials(?:\s+and\s+methods)?|results?|findings?|conclusions?|discussion)\s*[.:：]/i;
const PUBLISHER_COPYRIGHT_CHROME =
  /^(?:©|copyright|for personal use only|creative commons|email\b)/i;
const PUBLISHER_DOWNLOAD_CHROME = /downloaded from\s+https?:/i;

export function markAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  let inAbstract = false;
  let sawStructuredConclusion = false;
  let sawAbstractBody = false;
  let sawStructuredSubhead = false;
  let abstractColumnX: number | null = null;
  const clearAbstractBand = () => {
    inAbstract = false;
    sawStructuredConclusion = false;
    sawAbstractBody = false;
    sawStructuredSubhead = false;
    abstractColumnX = null;
  };
  return nodes.map((node) => {
    const text = (node.text ?? "").trim();
    // PLOS sometimes paints the bare `Abstract` label as `other` / `paragraph`
    // / rival `title` instead of heading; still open the structured-abstract
    // band before title-resolution demotes the label to a body paragraph.
    if (
      (node.role === "heading" ||
        node.role === "other" ||
        node.role === "paragraph" ||
        node.role === "title" ||
        node.role === "author") &&
      /^(?:abstract|abstrak|要旨|lay summary|plain language summary)\s*:?\s*$/i.test(text)
    ) {
      inAbstract = true;
      sawStructuredConclusion = false;
      sawAbstractBody = false;
      sawStructuredSubhead = false;
      abstractColumnX = node.boundingBoxes[0]?.x ?? null;
      return node.role === "heading"
        ? node
        : { ...node, role: "heading" as const };
    }
    // PLOS editor crumbs glue the country onto a trailing Abstract label
    // (`… Affiliated First Hospital, CHINA Abstract`). Open the band; keep the
    // chrome text demoted so the following narrative body is collected.
    if (
      (node.role === "paragraph" || node.role === "other" || node.role === "author") &&
      text.length <= 140 &&
      /\b(?:china|usa|u\.s\.a\.?|uk|united kingdom|india|japan|germany|france|brazil|australia|canada|italy|spain|korea|netherlands|turkey|türkiye)\s+Abstract\s*$/i.test(
        text,
      )
    ) {
      inAbstract = true;
      sawStructuredConclusion = false;
      sawAbstractBody = false;
      sawStructuredSubhead = false;
      // Label often sits on the left editor rail (x≈36) while the body is the
      // main column (x≈198) — do not pin the band to the rail x.
      const labelX = node.boundingBoxes[0]?.x ?? 0;
      abstractColumnX = labelX < 80 ? null : labelX;
      return {
        ...node,
        role: "heading" as const,
        text: "Abstract",
        confidence: Math.max(node.confidence, 0.84),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "plos-trailing-abstract-label",
            confidence: 0.84,
            reason: "country + trailing Abstract label opens abstract band",
          },
        ],
      };
    }
    // Inline labels (`Abstract. Nowadays…` / `Abstrak. Saat ini…`) are often
    // paragraphs, not bare headings. DovePress also paints them as copyright.
    // Promote the labelled body and keep collecting until Keywords / the next section.
    if (
      (node.role === "paragraph" || node.role === "other" || node.role === "copyright") &&
      /^(?:abstract|abstrak|要旨)\s*[.:：]/i.test(text) &&
      text.length >= 40 &&
      !PUBLISHER_COPYRIGHT_CHROME.test(text)
    ) {
      inAbstract = true;
      sawStructuredConclusion = false;
      sawAbstractBody = true;
      sawStructuredSubhead = false;
      abstractColumnX = node.boundingBoxes[0]?.x ?? null;
      return { ...node, role: "abstract" as const };
    }
    if (node.role === "heading") {
      // Keep Objectives/Methods/Results/Conclusions inside the abstract band.
      // After Conclusions, a bare Introduction/Methods is the body section.
      // BMC structured abstracts also lead with bare `Introduction` before any
      // abstract prose — keep that lead only when the Abstract body has not
      // started yet (otherwise bare Introduction is the article section).
      const structuredAbstractLead =
        inAbstract &&
        !sawAbstractBody &&
        publisherPredicates.isBmcStructuredAbstractLead(text);
      if (
        inAbstract &&
        (STRUCTURED_ABSTRACT_SUBHEAD.test(text) || structuredAbstractLead) &&
        !/^\d+(?:\.\d+)*\s/.test(text)
      ) {
        // Plain abstracts (`Abstract` + prose) then a bare body `Results` /
        // `Discussion` must not stay in the structured-abstract band. Only
        // keep those labels when a structured subhead already opened the band
        // (Cureus / BMC) or the label still carries a colon.
        if (
          sawAbstractBody &&
          !sawStructuredSubhead &&
          /^(?:introduction|background|methods?|results?|discussion|conclusions?)\s*$/i.test(text)
        ) {
          clearAbstractBand();
          return node;
        }
        if (
          sawStructuredConclusion &&
          /^(?:introduction|background|methods?|results?|discussion)\s*:?\s*$/i.test(text)
        ) {
          clearAbstractBand();
          return node;
        }
        if (/^conclusions?\s*:?\s*$/i.test(text)) sawStructuredConclusion = true;
        sawStructuredSubhead = true;
        return {
          ...node,
          role: "abstract" as const,
          confidence: Math.max(node.confidence, 0.86),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "structured-abstract-subhead",
              confidence: 0.86,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "structured-abstract subheading kept inside Abstract band",
            },
          ],
        };
      }
      // DovePress QR / video-abstract chrome sits in a side column and must not
      // terminate the Abstract: band (`Point your SmartPhone at the code`).
      if (
        inAbstract &&
        (/^(?:point your smartphone|video abstract|scan (?:the|this) (?:qr|code)|or use:)/i.test(text) ||
          (abstractColumnX != null &&
            Math.abs((node.boundingBoxes[0]?.x ?? 0) - abstractColumnX) > 120 &&
            text.length <= 64 &&
            !SECTION_INTRO.test(text) &&
            !/^(?:keywords?|key words?|index terms?)\b/i.test(text)))
      ) {
        return node;
      }
      clearAbstractBand();
      return node;
    }
    // Author summary / significance boxes follow the abstract on PLOS covers.
    if (
      inAbstract &&
      /^(?:author summary|significance|importance|plain language summary|key points?)\b/i.test(text)
    ) {
      clearAbstractBand();
      return node;
    }
    // Keywords / how-to-cite rails often arrive as paragraphs, not headings.
    // PLOS left-rail `Citation:` sits beside Abstract and must not terminate
    // the body-column abstract band.
    if (inAbstract && ABSTRACT_STOP_RAIL.test(text)) {
      const stopX = node.boundingBoxes[0]?.x ?? 0;
      if (
        abstractColumnX != null &&
        Math.abs(stopX - abstractColumnX) > 80 &&
        /^(?:citation|categories|subjects?|mesh)\s*:?\s*$/i.test(text)
      ) {
        return node;
      }
      clearAbstractBand();
      return node;
    }
    // Springer footers after the abstract (`& Name 1 University of …`) must not
    // stay in the abstract band or they absorb numbered affiliations.
    if (
      inAbstract &&
      (/^(?:&\s*)[\p{L}]/u.test(text) && /\b(?:university|department|faculty|institute)\b/i.test(text) ||
        /^\d{1,2}\s+(?:University|Department|Faculty|Institute|School)\b/.test(text) ||
        /^corresponding author\b/i.test(text))
    ) {
      clearAbstractBand();
      return node;
    }
    // Two-column covers can leak the next section lead into the abstract band
    // (`… English Language 1. Introduction` / PLOS chrome `… the 1 Introduction
    // original author…`). Stop before promoting that prose.
    // Use isSectionIntroHeading — not bare SECTION_INTRO — because the latter's
    // `i` flag makes `[A-Z0-9]` match lowercase and kills BMC abstract bodies
    // that begin `Methods for analyzing…` / `Results of…`.
    // Do not treat structured-abstract leads (`Background. …` / `Aims. …`) as
    // body section stops either.
    // PLOS paints bare `Background` / `Methods` as `other` inside the Abstract
    // band — keep those as structured subheads instead of body-section stops.
    if (
      inAbstract &&
      (node.role === "paragraph" || node.role === "other" || node.role === "copyright") &&
      STRUCTURED_ABSTRACT_SUBHEAD.test(text) &&
      !/^\d+(?:\.\d+)*\s/.test(text)
    ) {
      if (
        sawAbstractBody &&
        !sawStructuredSubhead &&
        /^(?:introduction|background|methods?|results?|discussion|conclusions?)\s*$/i.test(text)
      ) {
        clearAbstractBand();
        return node;
      }
      if (
        sawStructuredConclusion &&
        /^(?:introduction|background|methods?|results?|discussion)\s*:?\s*$/i.test(text)
      ) {
        clearAbstractBand();
        return node;
      }
      if (/^conclusions?\s*:?\s*$/i.test(text)) sawStructuredConclusion = true;
      sawStructuredSubhead = true;
      return {
        ...node,
        role: "abstract" as const,
        confidence: Math.max(node.confidence, 0.86),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "structured-abstract-subhead",
            confidence: 0.86,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "structured-abstract subheading kept inside Abstract band",
          },
        ],
      };
    }
    if (
      inAbstract &&
      !STRUCTURED_ABSTRACT_LEAD.test(text) &&
      !STRUCTURED_ABSTRACT_SUBHEAD.test(text) &&
      (/\b1\.?\s+introduction\b/i.test(text) || isSectionIntroHeading(text))
    ) {
      clearAbstractBand();
      return node;
    }
    if (
      inAbstract &&
      (node.role === "paragraph" || node.role === "copyright" || node.role === "other")
    ) {
      if (PUBLISHER_COPYRIGHT_CHROME.test(text) || PUBLISHER_DOWNLOAD_CHROME.test(text)) {
        return node;
      }
      // BMJ sidebar cite crumbs (`Robin B, et al. Inequitably` /
      // `harmed: a scoping review… BMJ Open … doi:10.…`) must not count as
      // abstract body — otherwise bare `Introduction` clears the band.
      if (
        (text.length <= 96 &&
          (/\bet al\b/i.test(text) ||
            /^(?:to cite|cite this article)\b/i.test(text) ||
            (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.?){0,2}(?:\s*,\s*[A-Z][\p{L}'’-]+){1,3}/u.test(
              text,
            ) &&
              !/[.!?]\s+[A-Z]/.test(text) &&
              text.split(/\s+/).length <= 10 &&
              !/\b(?:we|our|this|these|patient|study|methods?|results?|research)\b/i.test(
                text,
              )))) ||
        (text.length <= 260 &&
          publisherPredicates.isBmjAbstractCitation(text)) ||
        (text.length <= 220 &&
          /^[►▶]/.test(text) &&
          /\b(?:prepublication|supplemental|available online)\b/i.test(text))
      ) {
        return node;
      }
      // After a structured-abstract Conclusions band, license / CC rails and
      // correspondence crumbs are no longer abstract body.
      if (
        sawStructuredConclusion &&
        (/^(?:this article is licensed|creative commons|open access this article|full list of author)\b/i.test(
          text,
        ) ||
          /^[*†‡]?\s*correspondence\b/i.test(text))
      ) {
        clearAbstractBand();
        return node;
      }
      const x = node.boundingBoxes[0]?.x ?? 0;
      // Skip the entire opposite column (PLOS citation / editor rails) while
      // collecting the Abstract body in the main column — including long cite
      // paragraphs that previously slipped past a short-text-only guard.
      // Centered `Abstract` labels (Research Square / Springer) sit right of
      // the body column — do not treat a left-body `Background:…` lead as an
      // opposite-column rail.
      if (
        abstractColumnX != null &&
        Math.abs(x - abstractColumnX) > 110 &&
        !STRUCTURED_ABSTRACT_LEAD.test(text)
      ) {
        return node;
      }
      if (
        /^(?:AFFILIATION|Received:|Accepted:|Published:|Peer Review|E-?mail:|Citation:|Editor:)/i.test(
          text,
        ) ||
        (/@/.test(text) && text.length < 90)
      ) {
        return node;
      }
      // PLOS left-rail article id crumbs (`pdig.0001661`) are not abstract body.
      if (/^[a-z]{2,8}\.\d{5,}$/i.test(text) && text.length <= 24) {
        return node;
      }
      // Drop citation crumbs glued onto abstract lead-ins
      // (`Liao R, Qi X, et al. (2026) Foundation model- Objective…`).
      let body = text;
      const gluedCite = body.match(
        /^.{0,160}?\(\d{4}\)\s+(.+)$/,
      );
      if (gluedCite && /\bet al\b/i.test(body.slice(0, gluedCite.index! + 20)) && gluedCite[1]!.length >= 40) {
        body = gluedCite[1]!.replace(/^[\w\s,-]+?\s*[—–-]\s*/, "").trim();
      }
      sawAbstractBody = true;
      return { ...node, role: "abstract", text: body };
    }
    return node;
  });
}

/**
 * Frontiers / structured abstracts often use colon labels
 * (`Introduction:`, `Methods:`, `Results:`, `Discussion:`) before the real
 * body `Introduction`. Promote those bands when page 1 still has no abstract.
 */
function markColonStructuredFrontAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  if (nodes.some((node) => node.role === "abstract" && node.pageStart <= 2)) {
    return nodes;
  }
  const structuredLabel =
    /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|findings?)\s*:/i;
  // Research Square preprints use bare title-case labels without a colon.
  const bareStructuredHeading =
    /^(?:background|methods?|materials(?:\s+and\s+methods)?|results?|conclusions?|objectives?|purpose|aims?|findings?)\s*$/i;
  const stopChrome =
    /^(?:citation|keywords?|key words?|index terms?|copyright|received|accepted|published|correspondence|edited by|reviewed by)\b/i;
  // DovePress / similar often paint Purpose:/Methods: bands as `copyright`.
  // BMJ Open Quality also parks Introduction/Methods leads inside `table` cells.
  const structuredBandRole = (role: CanonicalNode["role"]): boolean =>
    role === "heading" ||
    role === "paragraph" ||
    role === "other" ||
    role === "copyright" ||
    role === "table";
  const looksLikePublisherCopyrightChrome = (text: string): boolean =>
    /^(?:©|copyright|for personal use only|creative commons|email\b)/i.test(text) ||
    /downloaded from\s+https?:/i.test(text) ||
    /^risk management and healthcare policy\b/i.test(text);
  // Glued label+body (`Introduction Given the level…` / `Methods Medline…`)
  // is common when BMJ paints the abstract box as a table/other cell.
  // Also accept cite-prefix + Objective (`Brinn A, et al. … Objective To…`).
  const gluedStructuredLead =
    /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|setting|participants|exposure|main outcomes?)\b(?!\s*:?\s*$)(?=\s+[A-Za-z(])/i;
  const citeGluedObjective =
    /\bet al\b.+\bObjective\s+To\b/i;
  const isStructuredAbstractLabel = (text: string, role: CanonicalNode["role"]): boolean =>
    structuredLabel.test(text) ||
    (role === "heading" && bareStructuredHeading.test(text)) ||
    ((role === "table" || role === "other" || role === "paragraph") &&
      text.length >= 40 &&
      (gluedStructuredLead.test(text) || citeGluedObjective.test(text)));
  // Cover pages are often title-only; Research Square puts the structured
  // abstract on page 2–3 after a long author/affiliation masthead. Also stop
  // on a repeated Background after Conclusion.
  const isBodySectionStart = (text: string, sawConclusion: boolean): boolean =>
    /^(?:[IVXLCDM]+\.\s+)?(?:\d+\.\s*)?(?:introduction|related\s+work)\b(?!\s*:)/i.test(text) ||
    /^(?:METHODS|RESULTS|DISCUSSION|BACKGROUND|CONCLUSIONS?)\s*$/.test(text) ||
    (sawConclusion && /^(?:background|methods?|results?|discussion|conclusions?)\s*$/i.test(text));
  const frontMatter = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.pageStart <= 3 && node.text)
    .sort(
      (a, b) =>
        a.node.pageStart - b.node.pageStart ||
        (a.node.boundingBoxes[0]?.y ?? 0) - (b.node.boundingBoxes[0]?.y ?? 0) ||
        (a.node.boundingBoxes[0]?.x ?? 0) - (b.node.boundingBoxes[0]?.x ?? 0),
    );
  let sawConclusionLabel = false;
  let bodyIntroPage = Infinity;
  let bodyIntroY = Infinity;
  for (const { node } of frontMatter) {
    const text = node.text!.trim();
    if (!(node.role === "heading" || node.role === "paragraph")) continue;
    if (isStructuredAbstractLabel(text, node.role) && /^conclusions?\b/i.test(text)) {
      sawConclusionLabel = true;
      continue;
    }
    if (isBodySectionStart(text, sawConclusionLabel) && !structuredLabel.test(text)) {
      bodyIntroPage = node.pageStart;
      bodyIntroY = node.boundingBoxes[0]?.y ?? Infinity;
      break;
    }
  }

  const labelHits = frontMatter.filter(({ node }) => {
    const page = node.pageStart;
    const y = node.boundingBoxes[0]?.y ?? Infinity;
    if (page > bodyIntroPage || (page === bodyIntroPage && !(y < bodyIntroY))) return false;
    const text = node.text!.trim();
    return (
      structuredBandRole(node.role) &&
      isStructuredAbstractLabel(text, node.role) &&
      !looksLikePublisherCopyrightChrome(text)
    );
  });
  if (labelHits.length < 2) return nodes;

  const firstLabel = labelHits[0]!.node;
  const lastLabel = labelHits.at(-1)!.node;
  const firstLabelPage = firstLabel.pageStart;
  const firstLabelY = firstLabel.boundingBoxes[0]?.y ?? Infinity;
  const lastLabelPage = lastLabel.pageStart;
  const lastLabelY = lastLabel.boundingBoxes[0]?.y ?? firstLabelY;
  const labelXs = labelHits
    .map(({ node }) => node.boundingBoxes[0]?.x ?? 0)
    .sort((a, b) => a - b);
  const labelColumnX = labelXs[Math.floor(labelXs.length / 2)] ?? 0;
  // Include prose that follows the final colon label until chrome / body intro.
  let bandEndPage = Number.isFinite(bodyIntroPage) ? bodyIntroPage : lastLabelPage;
  let bandEndY = Number.isFinite(bodyIntroY)
    ? bodyIntroY
    : lastLabelY + 140;
  for (const { node } of frontMatter) {
    const box = node.boundingBoxes[0];
    const page = node.pageStart;
    const y = box?.y ?? Infinity;
    const x = box?.x ?? 0;
    if (page < lastLabelPage || (page === lastLabelPage && y <= lastLabelY + 1)) continue;
    if (page > bodyIntroPage || (page === bodyIntroPage && y >= bodyIntroY)) break;
    // Sidebar citation / editor rails sit far left of the abstract column.
    if (Math.abs(x - labelColumnX) > 90) continue;
    const text = node.text!.trim();
    // Publisher watermarks interleaved in the abstract column must not truncate
    // the structured band (`For personal use only` between Purpose and Methods).
    if (looksLikePublisherCopyrightChrome(text)) continue;
    if (stopChrome.test(text) || ABSTRACT_STOP_RAIL.test(text)) {
      bandEndPage = page;
      bandEndY = Math.min(bandEndY, y);
      break;
    }
    const abstractProseHeading =
      node.role === "heading" &&
      !isStructuredAbstractLabel(text, node.role) &&
      !/^\d+(?:\.\d+)*\s/.test(text) &&
      !/^(?:introduction|related\s+work|references?)\b/i.test(text) &&
      text.split(/\s+/).filter(Boolean).length >= 6 &&
      /^[A-Z(]/.test(text);
    if (
      node.role === "heading" &&
      !isStructuredAbstractLabel(text, node.role) &&
      !abstractProseHeading &&
      text.length <= 80 &&
      !/:\s+\S/.test(text)
    ) {
      bandEndPage = page;
      bandEndY = Math.min(bandEndY, y);
      break;
    }
    if (
      node.role === "paragraph" ||
      node.role === "copyright" ||
      isStructuredAbstractLabel(text, node.role) ||
      abstractProseHeading ||
      /:\s+\S/.test(text)
    ) {
      bandEndPage = page;
      bandEndY = Math.max(bandEndY, y + 24);
    }
  }

  const looksLikeCiteChrome = (text: string): boolean =>
    publisherPredicates.isFrontiersCiteChrome(text);

  const beforeBand = (page: number, y: number): boolean =>
    page < firstLabelPage || (page === firstLabelPage && y < firstLabelY - 2);
  const afterBand = (page: number, y: number): boolean =>
    page > bandEndPage || (page === bandEndPage && y >= bandEndY);

  return nodes.map((node) => {
    // Research Square mastheads can push the structured band to page 3.
    if (node.pageStart > 3 || !node.text) return node;
    const box = node.boundingBoxes[0];
    const y = box?.y ?? Infinity;
    const x = box?.x ?? 0;
    if (beforeBand(node.pageStart, y) || afterBand(node.pageStart, y)) return node;
    if (Math.abs(x - labelColumnX) > 90) return node;
    const text = node.text.trim();
    if (
      ABSTRACT_STOP_RAIL.test(text) ||
      stopChrome.test(text) ||
      looksLikeCiteChrome(text) ||
      looksLikePublisherCopyrightChrome(text)
    ) {
      return node;
    }
    if (!structuredBandRole(node.role)) {
      return node;
    }
    const abstractProseHeading =
      node.role === "heading" &&
      !isStructuredAbstractLabel(text, node.role) &&
      !/^\d+(?:\.\d+)*\s/.test(text) &&
      !/^(?:introduction|related\s+work|references?)\b/i.test(text) &&
      text.split(/\s+/).filter(Boolean).length >= 6 &&
      /^[A-Z(]/.test(text);
    if (
      !(
        isStructuredAbstractLabel(text, node.role) ||
        node.role === "paragraph" ||
        (node.role === "other" && text.length >= 40) ||
        (node.role === "copyright" && text.length >= 40) ||
        (node.role === "heading" &&
          (/:\s+\S/.test(text) || structuredLabel.test(text) || abstractProseHeading))
      )
    ) {
      return node;
    }
    return {
      ...node,
      role: "abstract" as const,
      confidence: Math.max(node.confidence, 0.87),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "colon-structured-front-abstract",
          confidence: 0.87,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "front colon/bare-label structured abstract band before body introduction",
        },
      ],
    };
  });
}

/**
 * IEEE ACCESS and similar templates omit an `Abstract` heading: the body sits
 * between the grant/affiliation band and INDEX TERMS / I. INTRODUCTION.
 * Promote only when page 1 still has no abstract node.
 */
/** DovePress body column often paints abstract wrap lines as `copyright`. */
function demotePageOneProseCopyrights(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (node.role !== "copyright" || node.pageStart !== 1 || !node.text) return node;
    const t = node.text.trim();
    if (PUBLISHER_COPYRIGHT_CHROME.test(t) || PUBLISHER_DOWNLOAD_CHROME.test(t) || /^©/.test(t)) {
      return node;
    }
    // IEEE / publisher editorial chrome must stay hidden — do not promote it
    // back into the Reader body as a paragraph.
    if (
      /^(?:the\s+)?(?:associate|handling|guest)\s+editor\b/i.test(t) ||
      /\bcoordinating the review of this manuscript\b/i.test(t) ||
      /^(?:protected by copyright|downloaded from|to cite\s*:)/i.test(t)
    ) {
      return node;
    }
    if (/^(?:abstract|abstrak|要旨|purpose|methods?|results?|conclusions?)\s*[.:：]/i.test(t)) {
      return node; // leave labelled bands for markAbstracts / colon structured
    }
    if (t.length < 40 || !/^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)) return node;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 6 || !/[a-z]{4,}/.test(t)) return node;
    if (!/\b(?:the|and|of|in|for|with|that|are|is|to|using|from|this|these|however|into|a)\b/i.test(t)) {
      return node;
    }
    return {
      ...node,
      role: "paragraph" as const,
      confidence: Math.min(node.confidence, 0.78),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "page-one-prose-copyright-demotion",
          confidence: 0.8,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "narrative prose demoted from copyright on page 1",
        },
      ],
    };
  });
}

/** Springer Nature AOP PDFs expose an early-access notice as the only "abstract". */
function demoteEarlyAccessBoilerplate(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const t = node.text.trim();
    if (!publisherPredicates.isNatureEarlyAccessNotice(t)) return node;
    return {
      ...node,
      role: "other" as const,
      confidence: Math.min(node.confidence, 0.4),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "early-access-boilerplate",
          confidence: 0.9,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "early-access notice demoted from abstract",
        },
      ],
    };
  });
}

/**
 * Frontiers two-column covers often paint abstract lead-ins as affiliation
 * because they share the body-column x with numbered institution bands.
 * Demote narrative prose that lacks institution vocabulary.
 */
function demotePageOneProseAffiliations(nodes: CanonicalNode[]): CanonicalNode[] {
  // Prefer institution-shaped phrases so prose like `laboratory education`
  // still demotes. Do not treat hyphenated `patient-centered` as `center`.
  const affilVocab =
    /\b(?:university|department(?:\s+of)?|institute(?:\s+of)?|faculty(?:\s+of)?|school\s+of|college\s+of|hospital|laboratory\s+of|inc\.|ltd|gmbh|affiliations?|corresponding author|orcid)\b|(?<!-)\b(?:center|centre)\s+(?:for|of)\b/i;
  return nodes.map((node) => {
    if (node.role !== "affiliation" || node.pageStart !== 1 || !node.text) return node;
    const t = node.text.trim();
    // Nature chrome button label painted as affiliation.
    if (publisherPredicates.isNatureUpdateButton(t)) {
      return {
        ...node,
        role: "other" as const,
        confidence: Math.min(node.confidence, 0.4),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "check-for-updates-demotion",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "check-for-updates chrome demoted from affiliation",
          },
        ],
      };
    }
    if (t.length < 40) return node;
    if (/^\d{1,2}\s*[A-ZÀ-ÖØ-Ý]/.test(t) || affilVocab.test(t) || /@/.test(t)) return node;
    // Sentence leads or mid-wrap continuations (`heterogeneous outputs…`).
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ“"']/.test(t)) return node;
    const words = t.split(/\s+/).filter(Boolean);
    // Wrapped abstract lines are often 6–8 words before the column break.
    if (words.length < 6 || !/[a-z]{4,}/.test(t)) return node;
    if (!/\b(?:the|and|of|in|for|with|that|are|is|to|using|from|this|these|however|into|a)\b/i.test(t)) {
      return node;
    }
    return {
      ...node,
      role: "paragraph" as const,
      confidence: Math.min(node.confidence, 0.78),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "page-one-prose-affiliation-demotion",
          confidence: 0.8,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "narrative prose demoted from affiliation on page 1",
        },
      ],
    };
  });
}

function markUnlabeledFrontAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  if (nodes.some((node) => node.role === "abstract" && node.pageStart === 1)) {
    return nodes;
  }
  // Nature Scientific Reports early-access covers are chrome-only on page 1;
  // the real unlabeled abstract sits on page 2+. Skip page-1 promotion so
  // promoteLateFrontAbstracts can recover the body lead.
  const earlyAccessCover = nodes.some(
    (node) =>
      node.pageStart === 1 &&
      node.text &&
      publisherPredicates.isNatureEarlyAccessNotice(node.text),
  );
  if (earlyAccessCover) {
    return nodes;
  }
  const titleNode = nodes.find((node) => node.role === "title" && node.pageStart === 1);
  const titleY = titleNode?.boundingBoxes[0]?.y ?? 0;
  const titleX = titleNode?.boundingBoxes[0]?.x ?? 220;
  // Frontiers sidebars emit a bare `CITATION` label that matches a loose
  // citation stop pattern; only keyword rails / section intros / "how to cite"
  // delimit the unlabeled abstract window. Keyword rails that sit above any
  // narrative (editorial covers) must not truncate the body lead-in.
  const hasNarrativeAbove = (stopAtY: number): boolean =>
    nodes.some((node) => {
      const y = node.boundingBoxes[0]?.y ?? 0;
      const text = (node.text ?? "").trim();
      return (
        node.pageStart === 1 &&
        node.role === "paragraph" &&
        y > titleY + 40 &&
        y < stopAtY - 8 &&
        text.length >= 140 &&
        text.split(/\s+/).length >= 25 &&
        /[.!?]/.test(text)
      );
    });
  const looksLikeBylinePara = (text: string): boolean => {
    const t = text.trim();
    if ((t.match(/·/g) ?? []).length >= 2) return true;
    if (/[†‡*]/.test(t) && (t.match(/,/g) ?? []).length >= 2 && t.length <= 220) return true;
    if (!/[.!?]/.test(t) && (t.match(/,/g) ?? []).length >= 3 && /\d/.test(t) && t.length <= 240) {
      return true;
    }
    return false;
  };
  const looksLikeFrontChromePara = (text: string): boolean => {
    const t = text.trim();
    return (
      /^(?:citation|editorial on the research topic)\b/i.test(t) ||
      /^(?:and\s+\w+\.\s+)?this is an open-access article\b/i.test(t) ||
      /^open access\b/i.test(t) ||
      // Nature early-access cover blurb / peer-review chrome must not steal the
      // unlabeled abstract slot (otherwise promoteLateFrontAbstracts never sees
      // the real page-2 lead).
      /^we are providing an unedited version of this manuscript/i.test(t) ||
      /^if this paper is publishing under a transparent peer review\b/i.test(t) ||
      /^(?:adaptation|distribution and reproduction)\b/i.test(t) ||
      (/\bcreative commons attribution\b/i.test(t) && t.length <= 420) ||
      /^(?:permitted, provided the original author)/i.test(t) ||
      // Frontiers how-to-cite rails (`Reinemann DN (2024) A retrospective… Front. Educ.`).
      (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3})?\s*\(\d{4}\)/u.test(t) &&
        (/\bFront\.\s*\w+/i.test(t) || /\bdoi:\s*10\./i.test(t) || t.length <= 320))
    );
  };
  let stopY = nodes
    .filter((node) => node.pageStart === 1 && node.text)
    .filter((node) => {
      const text = node.text!.trim();
      const y = node.boundingBoxes[0]?.y ?? Infinity;
      if (isSectionIntroHeading(text) || /^how to cite\b/i.test(text)) return true;
      if (/^(?:keywords?|key words?|index terms?|kata kunci)\b/i.test(text)) {
        return hasNarrativeAbove(y);
      }
      return false;
    })
    .map((node) => node.boundingBoxes[0]?.y ?? Infinity)
    .sort((a, b) => a - b)[0] ?? Infinity;
  // Springer / HRI covers often omit Keywords and numbered Introduction on
  // page 1. Delimit the unlabeled abstract as the first long narrative band
  // before the next long body paragraph.
  if (!Number.isFinite(stopY) || stopY <= titleY + 40) {
    const longParas = nodes
      .filter(
        (node) =>
          node.pageStart === 1 &&
          node.role === "paragraph" &&
          (node.text?.length ?? 0) >= 160 &&
          (node.boundingBoxes[0]?.y ?? 0) > titleY + 40 &&
          node.text &&
          !looksLikeBylinePara(node.text) &&
          !looksLikeFrontChromePara(node.text),
      )
      .sort((a, b) => (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0));
    if (longParas.length === 0) return nodes;
    // Frontiers covers sometimes ship a single long lead paragraph on page 1
    // with no Keywords / Introduction stop. Keep a finite page-end window so
    // that lone narrative can still be promoted (Infinity fails Number.isFinite).
    if (longParas.length === 1) {
      stopY = 10_000;
    } else {
      // Nature / npj wraps the abstract across several mid-length lines with
      // small y gaps. Do not cut the band at the second wrap — advance to the
      // first long paragraph that sits clearly below the opening cluster.
      let stopIndex = 1;
      while (
        stopIndex < longParas.length &&
        (longParas[stopIndex]!.boundingBoxes[0]?.y ?? 0) -
          (longParas[stopIndex - 1]!.boundingBoxes[0]?.y ?? 0) <
          48
      ) {
        stopIndex += 1;
      }
      stopY = longParas[stopIndex]?.boundingBoxes[0]?.y ?? 10_000;
    }
  }
  if (!Number.isFinite(stopY) || stopY <= titleY + 40) return nodes;

  const looksLikeKeywordRail = (text: string): boolean => {
    const trimmed = text.trim();
    if (ABSTRACT_STOP_RAIL.test(trimmed)) return true;
    const commas = (trimmed.match(/,/g) ?? []).length;
    return commas >= 3 && trimmed.length <= 280 && !/[.!?]\s+[A-Z]/.test(trimmed);
  };
  const looksLikeNarrativeAbstract = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length < 180) return false;
    if (/^(?:received|digital object|this work was supported|corresponding author)\b/i.test(trimmed)) {
      return false;
    }
    if (looksLikeKeywordRail(trimmed) || isSectionIntroHeading(trimmed)) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    // Single-sentence abstracts end with `.` and have no mid-text `. `;
    // still treat a terminal sentence stop as narrative evidence.
    // BMJ Open paints structured-abstract leads as `Introduction <prose…>`.
    if (
      /^(?:introduction|background|methods?|results?|conclusions?|objectives?)\b/i.test(trimmed) &&
      !isSectionIntroHeading(trimmed) &&
      words.length >= 28 &&
      /[.!?](?:\s|$)/.test(trimmed)
    ) {
      return true;
    }
    return words.length >= 35 && /[.!?](?:\s|$)/.test(trimmed);
  };
  // Nature / npj often indent the abstract while the title is full-bleed left
  // (`title.x≈40`, abstract `x≈217`). Prefer the dominant indented narrative
  // column when it differs from the title x-band.
  const narrativeXs = nodes
    .filter(
      (node) =>
        node.pageStart === 1 &&
        node.role === "paragraph" &&
        (node.text?.length ?? 0) >= 160 &&
        (node.boundingBoxes[0]?.y ?? 0) > titleY + 40,
    )
    .map((node) => node.boundingBoxes[0]?.x ?? titleX);
  const indentedColumnX =
    narrativeXs.filter((x) => Math.abs(x - titleX) > 72).sort((a, b) => a - b)[0] ?? null;
  const inMainColumn = (node: CanonicalNode): boolean => {
    const x = node.boundingBoxes[0]?.x ?? 0;
    if (Math.abs(x - titleX) <= 72) return true;
    return indentedColumnX != null && Math.abs(x - indentedColumnX) <= 36;
  };
  const inAbstractWindow = (node: CanonicalNode): boolean => {
    const y = node.boundingBoxes[0]?.y ?? Infinity;
    return node.pageStart === 1 && y > titleY + 36 && y < stopY;
  };

  // Prefer a contiguous main-column paragraph run (line-wrapped abstracts
  // after demoting prose-as-affiliation). Sidebar chrome at other x is skipped
  // without resetting the run. Score every run so author-name bands do not
  // steal the longest-run slot from a shorter narrative abstract.
  const runs: number[][] = [];
  let currentRun: number[] = [];
  const considerRun = () => {
    if (currentRun.length > 0) runs.push(currentRun);
    currentRun = [];
  };
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.pageStart !== 1) continue;
    if (!inAbstractWindow(node)) {
      considerRun();
      continue;
    }
    if (!inMainColumn(node)) continue;
    if (
      node.role === "paragraph" &&
      node.text &&
      !looksLikeKeywordRail(node.text) &&
      !looksLikeFrontChromePara(node.text) &&
      !looksLikeBylinePara(node.text) &&
      !isSectionIntroHeading(node.text.trim())
    ) {
      currentRun.push(index);
      continue;
    }
    // Mid-abstract wraps sometimes keep an `affiliation` role (Nature `(PEV)
    // framework…`). Treat narrative affiliation crumbs as run members.
    // `Check for updates` sits in the title x-band and must not break the run.
    if (node.role === "affiliation" && node.text) {
      const crumb = node.text.trim();
      if (/^check for updates$/i.test(crumb)) continue;
      if (
        !/^\d/.test(crumb) &&
        !/\b(?:university|department|institute|faculty|hospital)\b/i.test(crumb) &&
        (crumb.length <= 48 ||
          (crumb.length <= 140 &&
            /\b(?:the|and|of|in|for|with|that|by|framework|between|against)\b/i.test(crumb)))
      ) {
        if (crumb.length >= 40) currentRun.push(index);
        continue;
      }
    }
    if (
      node.role === "affiliation" ||
      node.role === "heading" ||
      node.role === "author" ||
      node.role === "title"
    ) {
      considerRun();
    }
  }
  considerRun();

  const pickRun = (): number[] => {
    const scored = runs
      .map((candidate) => {
        const joined = candidate.map((i) => nodes[i]!.text!.trim()).join(" ");
        const words = joined.split(/\s+/).filter(Boolean).length;
        // Wrapped Frontiers abstracts are often many short lines; accept a
        // slightly softer threshold when the run has multiple fragments.
        const ok =
          looksLikeNarrativeAbstract(joined) ||
          // Nature wraps often split mid-sentence across 2–3 fragments without
          // a terminal `.` on the first line; accept those lead bands too.
          (candidate.length >= 2 &&
            joined.length >= 160 &&
            words >= 28 &&
            (/[.!?](?:\s|$)/.test(joined) || candidate.length >= 2) &&
            !looksLikeKeywordRail(joined) &&
            !looksLikeBylinePara(joined));
        return { candidate, joined, ok };
      })
      .filter((entry) => entry.ok)
      // Prefer the earliest page-1 narrative band (lead abstract) over a later
      // longer Methods/MBLEM paragraph that still sits above Keywords.
      .sort((a, b) => {
        const aY = nodes[a.candidate[0]!]!.boundingBoxes[0]?.y ?? 0;
        const bY = nodes[b.candidate[0]!]!.boundingBoxes[0]?.y ?? 0;
        return aY - bY || b.joined.length - a.joined.length;
      });
    if (scored[0]) return scored[0].candidate;
    for (const candidate of runs) {
      for (const index of candidate) {
        if (looksLikeNarrativeAbstract(nodes[index]!.text!)) return [index];
      }
    }
    return [];
  };
  const run = pickRun();
  if (run.length === 0) {
    // Fallback: first lone narrative paragraph (pre-demotion path).
    let promoted = false;
    return nodes.map((node) => {
      if (promoted || node.pageStart !== 1 || node.role !== "paragraph" || !node.text) {
        return node;
      }
      const y = node.boundingBoxes[0]?.y ?? Infinity;
      if (y <= titleY + 36 || y >= stopY) return node;
      if (!looksLikeNarrativeAbstract(node.text)) return node;
      promoted = true;
      return {
        ...node,
        role: "abstract" as const,
        confidence: Math.max(node.confidence, 0.86),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "unlabeled-front-abstract",
            confidence: 0.86,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "page-1 narrative band before keywords / introduction without Abstract heading",
          },
        ],
      };
    });
  }

  const drop = new Set(run.slice(1));
  const firstIndex = run[0]!;
  const first = nodes[firstIndex]!;
  let mergedText = run
    .map((i) => nodes[i]!.text!.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop a leading how-to-cite fragment if one slipped into the run.
  if (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,3})?\s*\(\d{4}\)/u.test(mergedText)) {
    const cut = mergedText.search(
      /\.\s+(?=(?:The|This|We|In|Student|Our|Although|While|During)\b)/,
    );
    if (cut > 40 && cut < mergedText.length - 80) {
      mergedText = mergedText.slice(cut + 1).trim();
    }
  }
  const mergedBoxes = run.flatMap((i) => nodes[i]!.boundingBoxes);
  return nodes
    .map((node, index) => {
      if (index === firstIndex) {
        return {
          ...first,
          role: "abstract" as const,
          text: mergedText,
          pageEnd: Math.max(...run.map((i) => nodes[i]!.pageEnd)),
          boundingBoxes: mergedBoxes,
          confidence: Math.max(first.confidence, 0.86),
          evidence: [
            ...first.evidence,
            {
              source: "generic-heuristic" as const,
              label: "unlabeled-front-abstract",
              confidence: 0.86,
              page: first.pageStart,
              bbox: first.boundingBoxes[0],
              reason:
                run.length > 1
                  ? "page-1 wrapped narrative band merged before keywords / introduction"
                  : "page-1 narrative band before keywords / introduction without Abstract heading",
            },
          ],
        };
      }
      return node;
    })
    .filter((_, index) => !drop.has(index));
}

/**
 * Opinion / commentary Frontiers pieces sometimes paint mid-body prose as
 * `abstract` after `1. INTRODUCTION` already opened (`The HMD and tracking…`).
 * Demote those so the body reading order stays intact; do not invent a new
 * abstract when none exists before the intro.
 */
function demoteAbstractsAfterIntroduction(nodes: CanonicalNode[]): CanonicalNode[] {
  // Match Introduction by text as well as role — some covers still have the
  // section label as paragraph/other when heading promotion missed.
  const introIndex = nodes.findIndex(
    (node) =>
      node.pageStart <= 2 &&
      (node.role === "heading" || node.role === "paragraph" || node.role === "other") &&
      isSectionIntroHeading(node.text ?? ""),
  );
  if (introIndex < 0) return nodes;
  const intro = nodes[introIndex]!;
  const introY = intro.boundingBoxes[0]?.y ?? 0;
  return nodes.map((node, index) => {
    if (node.role !== "abstract") return node;
    if (index <= introIndex) return node;
    // Geometry guard: abstract above the Introduction heading on an earlier
    // column can sort after it in the array — keep those.
    const nodeY = node.boundingBoxes[0]?.y ?? 0;
    if (node.pageStart < intro.pageStart) return node;
    if (node.pageStart === intro.pageStart && nodeY + 2 < introY) return node;
    return {
      ...node,
      role: "paragraph" as const,
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "abstract-after-introduction-demotion",
          confidence: 0.9,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "body prose after Introduction demoted from abstract",
        },
      ],
    };
  });
}

/**
 * Mega-author Frontiers covers push the lead narrative onto page 2–3 after a
 * long affiliation dump. When page 1 still has no abstract, promote the first
 * long prose band before the body Introduction on pages 1–3.
 */
function promoteLateFrontAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  if (nodes.some((node) => node.role === "abstract" && node.pageStart <= 3)) {
    return nodes;
  }
  const earlyAccessCover = nodes.some(
    (node) =>
      node.pageStart === 1 &&
      node.text &&
      publisherPredicates.isNatureEarlyAccessNotice(node.text),
  );
  const intro = nodes.find(
    (node) =>
      node.pageStart <= 4 &&
      node.role === "heading" &&
      isSectionIntroHeading(node.text ?? ""),
  );
  const introPage = intro?.pageStart ?? 4;
  const introY = intro?.boundingBoxes[0]?.y ?? Infinity;
  const looksLikeLicenseContinuation = (text: string): boolean =>
    /^(?:adaptation|distribution and reproduction|open access)\b/i.test(text) ||
    /\bcreative commons attribution\b/i.test(text) ||
    /^if this paper is publishing under a transparent peer review\b/i.test(text);
  const candidate = nodes
    .filter((node) => {
      if (node.role !== "paragraph" || !node.text || node.pageStart > introPage) return false;
      // Nature early-access page 1 is cover chrome; the lead abstract is later.
      if (earlyAccessCover && node.pageStart < 2) return false;
      if (node.pageStart === introPage && (node.boundingBoxes[0]?.y ?? 0) >= introY - 4) {
        return false;
      }
      const text = node.text.trim();
      if (text.length < 220) return false;
      if (/^(?:citation|keywords?|doi:|©|copyright)\b/i.test(text)) return false;
      if (looksLikeLicenseContinuation(text)) return false;
      // Citation crumbs glued onto the abstract lead
      // (`Zhao L, Yang X, Luo R, Xu J and Gu X brain-signal…`).
      if (
        /^(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.?){0,3}\s*,\s*){2,}[A-Z][\p{L}'’-]+(?:\s+[A-Z]\.?){0,3}\s+and\s+[A-Z]/u.test(
          text,
        ) &&
        !/^(?:The|This|We|Our|Building|Background|Objective)\b/i.test(text)
      ) {
        return false;
      }
      // Numbered affiliation dumps (`55Department of…, 78Department…`).
      const numberedInst = text.match(/\d{1,3}(?:Department|University|College|School|Institute)\b/gi) ?? [];
      if (numberedInst.length >= 2) return false;
      if (/\b(?:university|department of|united states,\s*\d)/i.test(text) && text.length < 500) {
        return false;
      }
      // Prefer pedagogy / methods narrative over leftover affiliation prose.
      const instHits = text.match(/\b(?:Department|University|College)\b/gi) ?? [];
      if (
        !/\b(?:the|this|we|students?|research|study|learning|assessment|course|building on|theoretical|framework)\b/i.test(
          text,
        ) ||
        (instHits.length >= 3 && !/\b(?:students?|pedagogy|assessment|curriculum)\b/i.test(text))
      ) {
        return false;
      }
      const words = text.split(/\s+/).filter(Boolean);
      return words.length >= 40 && /[.!?](?:\s|$)/.test(text);
    })
    .sort(
      (a, b) =>
        a.pageStart - b.pageStart ||
        (a.boundingBoxes[0]?.y ?? 0) - (b.boundingBoxes[0]?.y ?? 0),
    )[0];
  if (!candidate) return nodes;
  return nodes.map((node) =>
    node === candidate
      ? {
          ...node,
          role: "abstract" as const,
          confidence: Math.max(node.confidence, 0.84),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "late-front-abstract",
              confidence: 0.84,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "lead narrative before Introduction after multi-page masthead",
            },
          ],
        }
      : node,
  );
}

/**
 * Native streams often slice one abstract into several same-column paragraphs.
 * Join unfinished → continuation pairs so Reader/translation see one unit.
 */
/**
 * Two-column covers sometimes leave a one-word abstract terminator
 * (`constructs.`) as `other` after the main abstract band. Attach it when the
 * abstract is unfinished and the crumb is short, same-page, and nearby.
 */
/** Sidebar DOI / citation crumbs sometimes glue onto abstract prose mid-sentence. */
/** BMJ / HighWire cite crumbs mistaken for the whole abstract. */
function looksLikeCiteOnlyAbstract(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 120) return false;
  return (
    /^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,4})?,?\s+et al\.\s+/u.test(t) ||
    /^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,4})?(?:\s*,\s*[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,4})?){0,4}\s+et al\.\s+/u.test(
      t,
    ) ||
    (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z]{1,4})?,?\s+et al\.\s+Effect of\b/u.test(t) && t.split(/\s+/).length <= 12) ||
    // Truncated MDPI cite crumbs (`Christou, A.I.; Kalfadeli,`).
    (/^[A-Z][\p{L}'’-]+,\s*[A-Z](?:\.[A-Z])*\.?(?:\s*;\s*[A-Z][\p{L}'’-]+(?:,\s*[A-Z](?:\.[A-Z])*\.?)?)+,?\s*$/u.test(
      t,
    ) &&
      t.split(/\s+/).length <= 8) ||
    // JMIR journal citation tails painted as abstract.
    /^\((?:JMIR|J\s*Med\s*Internet\s*Res)[^)]*\d{4}[^)]*\)\s*$/i.test(t)
  );
}

function scrubAbstractCiteCrumbs(text: string): string {
  let cleaned = text
    .replace(/,?\s*doi:\s*10\.\d{4,9}\/[^\s,;]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
  // Frontiers how-to-cite rails glued onto the abstract lead
  // (`Reinemann DN (2024) …` / `Lin L and Talib MBA (2025) Exploring… This study…`).
  // Bound the cite head (no nested `.*?`) so long abstracts cannot ReDoS.
  const citationHead = publisherPredicates.isFrontiersCitationLead(cleaned);
  if (citationHead) {
    const afterYear = cleaned.slice(citationHead[0].length);
    const narrative = afterYear.search(/\b(?:The|This|We|Student|Our|In)\b/);
    if (narrative >= 0) {
      cleaned = afterYear.slice(narrative).replace(/\s+/g, " ").trim();
    }
  }
  // Frontiers date rails glued onto / into the abstract
  // (`RECEIVEDREVISED 21 May 202610 February 2026 Many primarily…` /
  // `… plant ACCEPTEDPUBLISHED31 May 202619 June 2026 …`).
  if (/^(?:RECEIVED|REVISED|ACCEPTED|PUBLISHED)/i.test(cleaned)) {
    const narrative = cleaned.search(/\b(?:Many|The|This|We|Our|In)\b/);
    if (narrative > 0) {
      cleaned = cleaned.slice(narrative).replace(/\s+/g, " ").trim();
    }
  }
  cleaned = cleaned
    .replace(
      /\s*(?:RECEIVEDREVISED|ACCEPTEDPUBLISHED|RECEIVED\s*REVISED|ACCEPTED\s*PUBLISHED)(?:\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}){0,4}/gi,
      " ",
    )
    .replace(
      /\s*(?:RECEIVED|REVISED|ACCEPTED|PUBLISHED)\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}){0,3}/gi,
      " ",
    );
  // Journal crumbs can sit mid-abstract after a glued how-to-cite rail.
  cleaned = cleaned
    .replace(/\bFront\.\s*\w+\.?\s*\d+:\d+\.?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
  return cleaned;
}

function attachAbstractTerminalCrumbs(nodes: CanonicalNode[]): CanonicalNode[] {
  const result = [...nodes];
  for (let index = 0; index < result.length; index += 1) {
    const abstract = result[index];
    if (abstract.role !== "abstract" || !abstract.text) continue;
    const prevText = abstract.text.trim();
    if (/[.!?。！？]\s*$/.test(prevText)) continue;
    const absBox = abstract.boundingBoxes[abstract.boundingBoxes.length - 1];
    for (let cursor = index + 1; cursor < Math.min(index + 8, result.length); cursor += 1) {
      const crumb = result[cursor];
      if (crumb.pageStart !== abstract.pageStart) break;
      if (crumb.role === "author" || crumb.role === "affiliation") continue;
      if (crumb.role === "heading" || crumb.role === "title") continue;
      if (/^(?:keywords?|key words?|index terms?|kata kunci)\s*:/i.test((crumb.text ?? "").trim())) {
        break;
      }
      const text = (crumb.text ?? "").trim();
      if (!text || text.length > 48) continue;
      // Do not attach a neighboring structured-abstract label (`Methods`) as a
      // one-word terminator of `Objectives`.
      if (STRUCTURED_ABSTRACT_SUBHEAD.test(text)) continue;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const terminalLike =
        (/^[A-Za-z][\w'’-]*[.!?]?$/.test(text) && wordCount === 1) ||
        (/^[a-zà-öø-ÿ]/.test(text) && wordCount <= 6 && /[.!?。！？]\s*$/.test(text));
      if (!terminalLike) continue;
      const crumbBox = crumb.boundingBoxes[0];
      const gap =
        absBox && crumbBox ? crumbBox.y - (absBox.y + absBox.height) : Infinity;
      if (gap < -8 || gap > 80) continue;
      result[index] = {
        ...abstract,
        text: `${prevText} ${text}`.replace(/\s+/g, " ").trim(),
        pageEnd: Math.max(abstract.pageEnd, crumb.pageEnd),
        boundingBoxes: [...abstract.boundingBoxes, ...crumb.boundingBoxes],
        evidence: [
          ...abstract.evidence,
          {
            source: "generic-heuristic" as const,
            label: "abstract-terminal-crumb",
            confidence: 0.84,
            page: crumb.pageStart,
            bbox: crumbBox,
            reason: "short unfinished-abstract terminator attached",
          },
        ],
      };
      result.splice(cursor, 1);
      break;
    }
  }
  return result;
}

export function mergeAbstractContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    // Two-column covers can interleave a title node between abstract slices
    // in reading order. Look back to the latest same-page abstract rather
    // than requiring strict adjacency in the node list.
    const previousIndex =
      node.role === "abstract"
        ? result.findLastIndex((candidate) => {
            if (candidate.role !== "abstract") return false;
            // Same-page first; also allow page N→N+1 when the previous band is
            // unfinished (`Discussion: These` | `findings characterize…`).
            if (candidate.pageStart === node.pageStart) return true;
            if (node.pageStart === candidate.pageEnd + 1) {
              const prev = (candidate.text ?? "").trim();
              return Boolean(prev) && !/[.!?。！？]\s*$/.test(prev);
            }
            return false;
          })
        : -1;
    const previous = previousIndex >= 0 ? result[previousIndex] : null;
    const intervening = previousIndex >= 0 ? result.slice(previousIndex + 1) : [];
    const previousAbs = previousIndex >= 0 ? result[previousIndex] : null;
    const previousAbsX = previousAbs?.boundingBoxes[0]?.x;
    const blocked = intervening.some((candidate) => {
      if (
        candidate.role === "heading" &&
        /^(?:keywords?|key words?|introduction|methods?|results?|discussion)\b/i.test(
          (candidate.text ?? "").trim(),
        )
      ) {
        return true;
      }
      // Sidebar author/affiliation crumbs often interleave abstract lines in
      // reading order; only block when they share the abstract column and look
      // like real byline/affiliation text (not mislabelled abstract prose).
      if (candidate.role === "author" || candidate.role === "affiliation") {
        const text = (candidate.text ?? "").trim();
        if (text.split(/\s+/).filter(Boolean).length >= 6) return false;
        const cx = candidate.boundingBoxes[0]?.x;
        if (previousAbsX == null || cx == null) return true;
        return Math.abs(cx - previousAbsX) <= 90;
      }
      return false;
    });
    if (previous && node.role === "abstract" && !blocked && previous.text && node.text) {
      const prevText = previous.text.trim();
      const nextText = node.text.trim();
      // Do not glue BMJ sidebar cite/title crumbs into the abstract band;
      // demote them out of abstract so they are not counted as body.
      if (
        nextText.length <= 260 &&
        publisherPredicates.isBmjAbstractContinuation(nextText)
      ) {
        result.push({
          ...node,
          role: "other",
          confidence: Math.min(node.confidence, 0.45),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "demoted-abstract-cite-crumb",
              confidence: 0.88,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "sidebar cite/title crumb is not abstract body",
            },
          ],
        });
        continue;
      }
      const bareStructuredLabelProbe =
        /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|findings?)\s*:?\s*$/i;
      // Bare labels sometimes inherit the whole band's boundingBoxes; use the
      // first box so same-line prose is not measured against the band footer.
      const prevBox = bareStructuredLabelProbe.test(prevText)
        ? previous.boundingBoxes[0]
        : previous.boundingBoxes[previous.boundingBoxes.length - 1];
      const nodeBox = node.boundingBoxes[0];
      const unfinished =
        !/[.!?。！？]\s*$/.test(prevText) ||
        /^[a-zà-öø-ÿ]/.test(nextText) ||
        (/[A-Za-z]$/.test(prevText) && /^[a-z]/.test(nextText));
      // Cureus / structured abstracts keep each band sentence-final, so the
      // unfinished check alone would leave Background/Methods/Results/Conclusions
      // as four abstract nodes. Merge those label-led siblings while they stay
      // on the same page column.
      const structuredLabel =
        /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|findings?)\s*:?/i;
      const bareStructuredLabel =
        /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|findings?)\s*:?\s*$/i;
      // Same-baseline two-column labels (`Objectives` | `Methods`) must stay
      // separate; only merge a label into following prose / continuation bands.
      const structuredContinuation =
        structuredLabel.test(nextText) &&
        !bareStructuredLabel.test(nextText) &&
        (structuredLabel.test(prevText) || /[.!?。！？]\s*$/.test(prevText));
      if (bareStructuredLabel.test(prevText) && bareStructuredLabel.test(nextText)) {
        result.push(node);
        continue;
      }
      const gap = prevBox && nodeBox ? nodeBox.y - (prevBox.y + prevBox.height) : Infinity;
      // The first abstract line often starts after an inline `Abstract:` label
      // (indented x), while continuations use the full column left edge.
      const overlap =
        prevBox && nodeBox
          ? Math.max(
              0,
              Math.min(prevBox.x + prevBox.width, nodeBox.x + nodeBox.width) -
                Math.max(prevBox.x, nodeBox.x),
            )
          : 0;
      const xAligned =
        !prevBox ||
        !nodeBox ||
        Math.abs(prevBox.x - nodeBox.x) <= 64 ||
        overlap >= Math.min(prevBox.width, nodeBox.width) * 0.35;
      const mergeGapLimit = structuredContinuation ? 56 : 36;
      // Colon labels (`Background:`) merge into following prose. Bare band
      // labels (`Results` / `Methods`) must stay separate so outline/abstract
      // markers survive — `unfinished` alone would otherwise glue
      // `Results` + `Of the participants…` into one node.
      const colonStructuredLabel =
        /^(?:background|introduction|methods?|materials(?:\s+and\s+methods)?|results?|discussion|conclusions?|objectives?|purpose|aims?|findings?)\s*:\s*$/i;
      const bareWordStructuredLabel =
        bareStructuredLabel.test(prevText) && !colonStructuredLabel.test(prevText);
      const labelThenProse =
        colonStructuredLabel.test(prevText) &&
        !bareStructuredLabel.test(nextText) &&
        nextText.split(/\s+/).filter(Boolean).length >= 5;
      // Soft wraps mid-label (`Discussion: These` + `findings…` /
      // `Overall, Fed-XLM-R` + `demonstrates…`) share a baseline.
      const softWrapContinuation =
        unfinished &&
        Boolean(prevBox && nodeBox) &&
        Math.abs(nodeBox!.y - prevBox!.y) <= Math.max(prevBox!.height ?? 12, 16) &&
        (/:\s+\S/.test(prevText) ||
          /^(?:the|these|this|those|a|an|of|and|to|with|for)\b/i.test(nextText) ||
          (/^[a-zà-öø-ÿ]/.test(nextText) && nextText.split(/\s+/).filter(Boolean).length >= 4) ||
          (prevText.split(/\s+/).filter(Boolean).length <= 6 &&
            nextText.split(/\s+/).filter(Boolean).length >= 6 &&
            !/^[A-Z][A-Z\s]{3,}$/.test(nextText)));
      // Same-baseline `Background:` + prose often shares Y (gap ≈ −height).
      // Some Frontiers bands report identical Y for every abstract row.
      const sameBaselineLabelProse =
        (labelThenProse || softWrapContinuation) &&
        Boolean(prevBox && nodeBox) &&
        Math.abs(nodeBox!.y - prevBox!.y) <= Math.max(prevBox!.height ?? 12, 16);
      const gapFloor = labelThenProse || softWrapContinuation
        ? -Math.max((prevBox?.height ?? 12) * 2, 28)
        : -4;
      // Soft wraps / same-baseline label prose may indent the continuation.
      const alignOk = xAligned || sameBaselineLabelProse || softWrapContinuation;
      const nextLooksLikeTable =
        /^[\d.%*\s<>≤≥-]+$/.test(nextText) ||
        /^\*+\s*\*+/.test(nextText) ||
        /^(?:variable|category\s+vs\.?\s+reference|standardized prevalence|note:\s*bars)\b/i.test(
          nextText,
        ) ||
        (/\*{2,}/.test(nextText) && nextText.split(/\s+/).filter(Boolean).length <= 12);
      if (
        !nextLooksLikeTable &&
        !bareWordStructuredLabel &&
        (unfinished || structuredContinuation || labelThenProse || softWrapContinuation) &&
        (sameBaselineLabelProse || (gap >= gapFloor && gap <= mergeGapLimit)) &&
        alignOk &&
        nextText.length >= 8
      ) {
        // Prefer a word boundary. Only glue without a space for hyphenated
        // wraps (`decision-` + `making`); `of` + `psychological` must stay spaced.
        const joiner = /[‐‑‒–—―-]$/.test(prevText) ? "" : " ";
        result[previousIndex] = {
          ...previous,
          text: `${prevText}${joiner}${nextText}`.replace(/\s+/g, " ").trim(),
          pageEnd: Math.max(previous.pageEnd, node.pageEnd),
          boundingBoxes: [...previous.boundingBoxes, ...node.boundingBoxes],
          confidence: Math.max(previous.confidence, node.confidence),
          evidence: [
            ...previous.evidence,
            {
              source: "generic-heuristic" as const,
              label: structuredContinuation
                ? "structured-abstract-merge"
                : "abstract-continuation-merge",
              confidence: structuredContinuation ? 0.88 : 0.86,
              page: node.pageStart,
              bbox: nodeBox,
              reason: structuredContinuation
                ? "same-column structured abstract band continued"
                : "same-column unfinished abstract continued on the next line",
            },
          ],
        };
        continue;
      }
    }
    result.push(node);
  }
  return result.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const text = node.text.replace(/\s+/g, " ").trim();
    const citeChrome = publisherPredicates.isBmjAbstractChrome(text);
    if (!citeChrome) return node;
    return {
      ...node,
      role: "other" as const,
      confidence: Math.min(node.confidence, 0.4),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "demoted-abstract-cite-chrome",
          confidence: 0.9,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "cite/title sidebar chrome demoted out of abstract band",
        },
      ],
    };
  });
}

/** Figure/flowchart chrome concatenated into a fake outline heading. */
function looksLikeChartOrFlowChromeHeading(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || value.length < 18) return false;
  // Real outline items are `1 Introduction` / `2.1 Task Definition`, not
  // axis ticks that happen to start with `0.06`.
  if (/^(?:[1-9]\d?)(?:\.\d+){0,3}\s+[A-ZÀ-ÖØ-Ý]/.test(value)) return false;
  if (/[.!?。！？]/.test(value) && value.split(/\s+/).length >= 10) return false;
  // Axis tick concatenations (`0.00 0 2000 … Tokens8000`).
  if (
    (/\b(?:percentile|tokens?)\b/i.test(value) || /(?:^|\s)\d+(?:\.\d+)?(?:\s+\d+){3,}/.test(value)) &&
    (value.match(/\d/g) ?? []).length >= 4
  ) {
    return true;
  }
  // Flowchart node soup without a numbered section prefix.
  if (
    /(?:setup|config|get env|env state|initial state|task initial)/i.test(value) &&
    !/^\d/.test(value) &&
    value.split(/\s+/).length >= 8 &&
    !/[.!?。！？]/.test(value)
  ) {
    return true;
  }
  // Example task prompts painted as headings.
  if (/^task instruction\s*:/i.test(value)) return true;
  return false;
}

function suppressVectorLabelClusters(nodes: CanonicalNode[]): CanonicalNode[] {
  const captions = nodes.filter((node) => node.role === "caption");
  return nodes.map((node) => {
    const strongVectorLabel = node.evidence.some((entry) =>
      entry.label === "vector-figure-label-cluster" && entry.confidence >= 0.82
    );
    const denseVectorPanel = node.evidence.some((entry) =>
      (entry.label === "dense-vector-panel" || entry.label === "figure-panel-label") &&
      entry.confidence >= 0.75
    );
    // Compact axis/label glyphs lose to `other`. Sentence-shaped body lines
    // that merely sit near a figure keep their paragraph role for translation.
    if (
      strongVectorLabel &&
      (node.role === "heading" || node.role === "paragraph") &&
      !looksLikeSentenceProse(node.text ?? "")
    ) {
      return {
        ...node,
        role: "other" as const,
        confidence: Math.max(node.confidence, 0.84),
      };
    }
    // Dense plot panels often duplicate a short lead-in (`for GPTrel … for
    // GPTrel …`). That shape trips looksLikeSentenceProse via a leading `For`,
    // but dense-vector-panel geometry is stronger than translation eligibility.
    // How many of those repetitions land in one node is a line-grouping
    // outcome, not a property of the figure, so accept any repeat count and
    // bound the repeated unit instead of the whole string.
    const trimmedPanel = (node.text ?? "").trim();
    const repeatedPanelUnit = trimmedPanel.match(/^(.*?)(?:\s+\1)+$/s)?.[1] ?? null;
    const repeatedPanelLead =
      repeatedPanelUnit !== null &&
      repeatedPanelUnit.length >= 12 &&
      repeatedPanelUnit.length <= 120;
    if (
      denseVectorPanel &&
      (node.role === "heading" || node.role === "paragraph") &&
      (!looksLikeSentenceProse(trimmedPanel) || repeatedPanelLead)
    ) {
      return {
        ...node,
        role: "other" as const,
        confidence: Math.max(node.confidence, 0.84),
      };
    }
    if (node.role === "heading" && node.text && looksLikeChartOrFlowChromeHeading(node.text)) {
      return {
        ...node,
        role: "other" as const,
        confidence: Math.max(node.confidence, 0.84),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "chart-flow-chrome-heading",
            confidence: 0.84,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "figure/flowchart chrome demoted out of the outline",
          },
        ],
      };
    }
    // Bare panel titles under a figure (`Statistics` beneath Fig. 3) — keep
    // numbered sections like `2.2.1 Overview`.
    if (
      node.role === "heading" &&
      node.text &&
      /^(?:Statistics|Overview|Distribution|Comparison|Ablation|Examples?|Qualitative|Quantitative)$/i.test(
        node.text.trim(),
      )
    ) {
      const y = node.boundingBoxes[0]?.y ?? Infinity;
      const nearCaption = captions.some(
        (caption) =>
          caption.pageStart === node.pageStart &&
          Math.abs((caption.boundingBoxes[0]?.y ?? 0) - y) < 140,
      );
      if (nearCaption) {
        return {
          ...node,
          role: "other" as const,
          confidence: Math.max(node.confidence, 0.84),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "figure-panel-heading",
              confidence: 0.84,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "single-token panel label near a figure caption",
            },
          ],
        };
      }
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
export function mergeFigureCaptionContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    const directPrevious = result[result.length - 1];
    const nodeBox = node.boundingBoxes[0];
    const continuation = node.text?.trim() ?? "";
    // Scrambled two-column reading order can emit bare `FIGURE 4` before a
    // higher `FIGURE 5` caption, then the FIGURE 4 legend. Prefer a nearby
    // bare numbered figure caption in the same column over the array-last one.
    let captionIndex = directPrevious?.role === "caption"
      ? result.length - 1
      : result.findLastIndex((candidate) => candidate.role === "caption");
    if (
      (node.role === "paragraph" || node.role === "heading") &&
      continuation.length >= 12 &&
      nodeBox
    ) {
      let bestBare = -1;
      let bestBareGap = Infinity;
      for (let i = result.length - 1; i >= Math.max(0, result.length - 8); i -= 1) {
        const candidate = result[i]!;
        if (candidate.role !== "caption" || candidate.pageStart !== node.pageStart) continue;
        const ct = (candidate.text ?? "").trim();
        if (
          !/^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(
            ct,
          )
        ) {
          continue;
        }
        const cBox = candidate.boundingBoxes[candidate.boundingBoxes.length - 1];
        if (!cBox) continue;
        const gap = nodeBox.y - (cBox.y + cBox.height);
        const aligned = Math.abs(nodeBox.x - cBox.x) <= Math.max(24, cBox.width * 0.35);
        if (!aligned || gap < -18 || gap > 56) continue;
        if (gap < bestBareGap) {
          bestBareGap = gap;
          bestBare = i;
        }
      }
      if (bestBare >= 0) captionIndex = bestBare;
    }
    const previous = captionIndex >= 0 ? result[captionIndex] : directPrevious;
    const previousBox = previous?.boundingBoxes[previous.boundingBoxes.length - 1];
    const captionText = previous?.text?.trim() ?? "";
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
    // Exception: a bare `FIGURE N` / `Fig. N:` label has no description yet,
    // so the next aligned prose line is the caption body even when long.
    const continuationWords = continuation.split(/\s+/).filter(Boolean).length;
    const bareNumberedCaption =
      /^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(
        captionText,
      );
    // Numbered procedure lists (`1. … 2. …`) must not glue onto a caption that
    // already has a legend. Bare `FIGURE N` labels still accept panel legends
    // that mention decimals (`XLSR-53: …`) or sparse `N.` tokens.
    const numberedProcedureContinuation =
      !bareNumberedCaption &&
      (continuation.match(/(?:^|\s)\d+\.\s+/g) ?? []).length >= 2;
    const sentenceLikeBodyContinuation =
      !bareNumberedCaption &&
      continuationWords > 24 &&
      /^[A-Z][A-Za-z]/.test(continuation) &&
      !labeledFigureContinuation;
    const shortHeadingLegend =
      bareNumberedCaption &&
      node.role === "heading" &&
      continuationWords >= 2 &&
      continuationWords <= 16 &&
      /^[A-ZÀ-ÖØ-Ý(]/u.test(continuation) &&
      // Bare section titles stay headings; legends like `Results of FC…` merge.
      !/^(?:introduction|methods?|results?|discussion|conclusions?|references?)\s*$/i.test(
        continuation,
      );
    // Supplement / end-matter often emits bare `Figure 1:` then a later
    // `Figure 1) Legend body…` (same number) as paragraph or caption.
    const captionFigureNum = captionText.match(/^(?:figure|fig\.?|図)\s*(\d+)/i)?.[1];
    const continuationFigureNum = continuation.match(
      /^(?:figure|fig\.?|図)\s*(\d+)\s*[):.\-–—]/i,
    )?.[1];
    const sameNumberedFigureLegend =
      bareNumberedCaption &&
      Boolean(captionFigureNum && continuationFigureNum) &&
      captionFigureNum === continuationFigureNum &&
      continuation.length >= captionText.length + 12 &&
      !/^(?:figure|fig\.?|図)\s*\d+[a-z]?\s*:?\s*$/i.test(continuation);
    // Bare `Figure 3` at the page foot with the Title-Case legend as the first
    // block on the next page (nap pipeline β-diversity legend).
    const pageBoundaryBareLegend =
      bareNumberedCaption &&
      previous != null &&
      previous.pageEnd + 1 === node.pageStart &&
      (node.role === "paragraph" || node.role === "heading") &&
      continuationWords >= 6 &&
      continuationWords <= 100 &&
      (previousBox?.y ?? 0) > 560 &&
      (nodeBox?.y ?? 999) < 140 &&
      /^[A-ZΑ-ΩÀ-ÖØ-Þßẞβ][\p{L}0-9(\-–—]/u.test(continuation) &&
      !/^(?:introduction|methods?|results?|discussion|conclusions?|references?)\b/i.test(
        continuation,
      );
    const canMerge = previous?.role === "caption" &&
      /^\s*(?:figure|fig\.?|図)\s*\d+/i.test(captionText) &&
      (previous.pageStart === node.pageStart || pageBoundaryBareLegend) &&
      (node.role === "paragraph" ||
        node.role === "table" ||
        shortHeadingLegend ||
        (node.role === "caption" && sameNumberedFigureLegend)) &&
      (continuation.length >= 12 || shortHeadingLegend) &&
      (pageBoundaryBareLegend ||
        (verticalGap >= -18 &&
          verticalGap <= (sameNumberedFigureLegend ? 600 : bareNumberedCaption ? 56 : 42))) &&
      (pageBoundaryBareLegend ||
        xAligned ||
        bareNumberedCaption ||
        sameNumberedFigureLegend ||
        (harmlessIntervening && verticalGap <= 180)) &&
      (!/[.!?]\s*$/.test(captionText) || labeledFigureContinuation) &&
      !numberedProcedureContinuation &&
      !sentenceLikeBodyContinuation &&
      // Block a *different* numbered figure/table lead. Same-number
      // `Figure 1)` legends of a bare `Figure 1:` are allowed.
      (!(
        /^(?:table|figure|fig\.?|図)\s*\d+/i.test(continuation) && !sameNumberedFigureLegend
      )) &&
      !/^(?:references?|introduction|methods?|results?|discussion|conclusions?)\s*$/i.test(
        continuation,
      ) &&
      // Long multi-sentence figure legends are still captions when the lead is
      // a bare `FIGURE N`. Cap body-length dumps; allow longer panel legends
      // that explicitly mark (A)/(B)/… sections (Frontiers-style).
      !(
        bareNumberedCaption &&
        continuationWords >
          ((continuation.match(/\([A-Da-d]\)/g) ?? []).length >= 1 ? 420 : 220)
      );
    if (canMerge) {
      result[captionIndex] = {
        ...previous,
        text: `${captionText} ${continuation}`.replace(/\s+/g, " ").trim(),
        pageEnd: node.pageEnd,
        boundingBoxes: [...previous.boundingBoxes, ...node.boundingBoxes],
        confidence: Math.min(previous.confidence, node.confidence),
        evidence: [
          ...previous.evidence,
          ...node.evidence.filter((evidence) => evidence.label === "page-boundary-continuation"),
          {
            source: "generic-heuristic" as const,
            label: "figure-caption-continuation",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "legend merged onto figure caption",
          },
        ],
      };
      // Only drop short chrome crumbs between caption and continuation — never
      // other figure captions emitted out of y-order in two-column pages.
      if (captionIndex < result.length - 1 && harmlessIntervening) {
        result.splice(captionIndex + 1);
      }
      continue;
    }

    // Reading order may emit the legend above a bare `Fig. N` / `FIGURE N`
    // (same column, a few lines higher) — e.g. `: This figure illustrates…`
    // then `Fig. 2`.
    const bareIncomingFigure =
      node.role === "caption" &&
      /^(?:figure|fig\.?|図)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(
        (node.text ?? "").trim(),
      );
    if (bareIncomingFigure && result.length > 0) {
      const capBox = node.boundingBoxes[0];
      let leadIndex = -1;
      for (let i = result.length - 1; i >= Math.max(0, result.length - 4); i -= 1) {
        const lead = result[i]!;
        const leadText = (lead.text ?? "").trim();
        const leadBox = lead.boundingBoxes[0];
        const leadGap =
          leadBox && capBox ? capBox.y - (leadBox.y + leadBox.height) : Infinity;
        const leadAligned =
          Boolean(leadBox && capBox) &&
          lead.pageStart === node.pageStart &&
          Math.abs(capBox!.x - leadBox!.x) <= 64 &&
          leadGap >= -4 &&
          leadGap <= 48;
        if (
          leadAligned &&
          (lead.role === "paragraph" || lead.role === "other") &&
          looksLikePrecedingFigureLegend(leadText)
        ) {
          leadIndex = i;
          break;
        }
        if (
          lead.role === "heading" &&
          /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introduction|methods?|results?|discussion)\b/i.test(
            leadText,
          )
        ) {
          break;
        }
      }
      if (leadIndex >= 0) {
        const lead = result[leadIndex]!;
        const leadText = (lead.text ?? "").trim().replace(/^:\s*/, "");
        result[leadIndex] = {
          ...node,
          text: `${(node.text ?? "").trim()} ${leadText}`.replace(/\s+/g, " ").trim(),
          pageEnd: Math.max(node.pageEnd, lead.pageEnd),
          boundingBoxes: [...node.boundingBoxes, ...lead.boundingBoxes],
          confidence: Math.min(node.confidence, lead.confidence),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "preceding-figure-caption-legend",
              confidence: 0.9,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "legend paragraph before bare Fig/FIGURE N",
            },
          ],
        };
        continue;
      }
    }

    result.push(node);
  }
  return result;
}

/** Strong preceding-legend cues for bare Fig/FIGURE labels (not body prose). */
function looksLikePrecedingFigureLegend(text: string): boolean {
  const trimmed = text.trim().replace(/^:\s*/, "");
  if (trimmed.length < 24 || trimmed.length > 420) return false;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (words < 6 || words > 80) return false;
  if (/^(?:table|figure|fig\.?|図)\s*\d+/i.test(trimmed)) return false;
  if (/^(?:references?|introduction|methods?|results?|discussion|conclusions?)\b/i.test(trimmed)) {
    return false;
  }
  // `: This figure illustrates…` / `The figure shows…`
  if (/^(?:this|the)\s+figure\b/i.test(trimmed)) return true;
  // Panel-legend style with explicit (A)/(a) markers and short description.
  if (/\([A-Da-d]\)/.test(trimmed) && words <= 60 && /\b(?:show|shows|depict|panel)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** Join wrapped table-caption text before table-region promotion. Some native
 * streams label the first line as `table_caption` and emit the remaining
 * lowercase lines as ordinary paragraphs. If those lines are allowed into
 * the resolver first, numeric-neighborhood evidence can incorrectly promote
 * them to table cells. Require same-page caption typography geometry and a
 * lowercase continuation so body prose remains a paragraph. */
function isTitleCaseTableCaptionBody(captionText: string, continuation: string): boolean {
  if (!/^(?:table|表)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(captionText)) {
    return false;
  }
  const words = continuation.split(/\s+/).filter(Boolean);
  return (
    /^[A-ZÀ-ÖØ-Ý(]/u.test(continuation) &&
    words.length >= 3 &&
    words.length <= 80 &&
    !/^(?:table|figure|fig\.?|図|references?|introduction|methods?)\b/i.test(continuation) &&
    ((continuation.match(/\d/g) ?? []).length / Math.max(continuation.length, 1) < 0.12)
  );
}

export function mergeTableCaptionContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
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
    const bareNumberedTableCaption =
      /^(?:table|表)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(captionText);
    const titleCaseTableCaptionBody = isTitleCaseTableCaptionBody(captionText, continuation);
    // `Table 2 shows the codes…` — lowercase legend verb on the same baseline.
    const legendVerbContinuation =
      bareNumberedTableCaption &&
      /^(?:shows?|presents?|summarizes?|lists?|reports?|describes?|compares?|contains?|displays?)\b/i.test(
        continuation,
      );
    const captionBody = titleCaseTableCaptionBody || legendVerbContinuation;
    // Frontiers often paints `TABLE 5` and its title on one baseline.
    // Require x proximity so a right-column body line at the same Y is not
    // glued onto a left-edge bare `TABLE N` footer (`…logue, and participation`).
    const sameBaseline =
      Boolean(previousBox && nodeBox) &&
      Math.abs(nodeBox!.y - previousBox!.y) <= Math.max(previousBox!.height ?? 12, 14) &&
      Math.abs(nodeBox!.x - previousBox!.x) <= 64;
    // Bare `Table N` labels must not absorb same-baseline table-cell crumbs
    // (`investigated terms.`) before the real Title-Case legend (`Results of…`).
    const lowercaseWrap =
      !bareNumberedTableCaption && /^[a-zà-öø-ÿ]/u.test(continuation);
    const canMerge = previous?.role === "caption" &&
      /^\s*(?:table|表)\s*\d+/i.test(captionText) &&
      previous.pageStart === node.pageStart &&
      (node.role === "paragraph" || node.role === "table" ||
        (bareNumberedTableCaption && captionBody && node.role === "other")) &&
      continuation.length >= 2 &&
      (lowercaseWrap || captionBody) &&
      !/[.!?]\s*$/.test(captionText) &&
      (sameBaseline ||
        (verticalGap >= -4 && verticalGap <= (bareNumberedTableCaption ? 56 : 42))) &&
      (horizontallyInside ||
        (sameBaseline && captionBody) ||
        (bareNumberedTableCaption &&
          previousBox &&
          nodeBox &&
          Math.abs(nodeBox.x - previousBox.x) <= 48 &&
          captionBody) ||
        // Bare `Table 5` on the right rail with a full-width Title-Case legend
        // immediately below (psychological-distress Table 5).
        (bareNumberedTableCaption &&
          captionBody &&
          previousBox &&
          nodeBox &&
          verticalGap >= -4 &&
          verticalGap <= 28 &&
          nodeBox.x <= previousBox.x + 24 &&
          nodeBox.width >= Math.max(160, previousBox.width * 2))) &&
      (sameLineHeight ||
        captionBody ||
        (sameBaseline && captionBody) ||
        (bareNumberedTableCaption && captionBody && verticalGap <= 28)) &&
      // Same-baseline bare `Table N` + Title-Case legend can be long (Eyettention
      // `Table 7 New sentence split…`); allow more words than stacked wraps.
      continuation.split(/\s+/).filter(Boolean).length <=
        (sameBaseline && captionBody
          ? 80
          : captionBody
            ? 40
            : 24);
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

    // Reading order may emit the Title-Case legend before the bare `Table N`
    // label — on the same baseline or a few lines above.
    const bareIncoming =
      node.role === "caption" &&
      /^(?:table|表)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*$/i.test(
        (node.text ?? "").trim(),
      );
    if (bareIncoming && result.length > 0) {
      const capBox = node.boundingBoxes[0];
      let leadIndex = -1;
      for (let i = result.length - 1; i >= Math.max(0, result.length - 6); i -= 1) {
        const lead = result[i]!;
        const leadText = (lead.text ?? "").trim();
        const leadBox = lead.boundingBoxes[0];
        const leadGap =
          leadBox && capBox ? capBox.y - (leadBox.y + leadBox.height) : Infinity;
        const leadAligned =
          Boolean(leadBox && capBox) &&
          lead.pageStart === node.pageStart &&
          Math.abs(capBox!.x - leadBox!.x) <= 64 &&
          (Math.abs(capBox!.y - leadBox!.y) <= Math.max(capBox!.height ?? 12, 14) ||
            (leadGap >= -4 && leadGap <= 48));
        if (
          leadAligned &&
          (lead.role === "paragraph" || lead.role === "other" || lead.role === "heading") &&
          isTitleCaseTableCaptionBody((node.text ?? "").trim(), leadText)
        ) {
          leadIndex = i;
          break;
        }
        // Stop when we cross a hard section boundary.
        if (
          lead.role === "heading" &&
          /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introduction|methods?|results?|discussion)\b/i.test(
            leadText,
          )
        ) {
          break;
        }
      }
      if (leadIndex >= 0) {
        const lead = result[leadIndex]!;
        const leadText = (lead.text ?? "").trim();
        result[leadIndex] = {
          ...node,
          text: `${(node.text ?? "").trim()} ${leadText}`.replace(/\s+/g, " ").trim(),
          pageEnd: Math.max(node.pageEnd, lead.pageEnd),
          boundingBoxes: [...node.boundingBoxes, ...lead.boundingBoxes],
          confidence: Math.min(node.confidence, lead.confidence),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "preceding-table-caption-legend",
              confidence: 0.9,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "Title-Case legend before bare Table N",
            },
          ],
        };
        continue;
      }
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

function isNumberedTableCaptionText(text: string | null | undefined): boolean {
  return /^(?:table|表)\s*\d+/i.test((text ?? "").trim());
}

function isBareNumberedCaptionText(text: string | null | undefined): boolean {
  return /^(?:(?:figure|fig\.?|table|表|図)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?\s*:?\s*)$/i.test(
    (text ?? "").trim(),
  );
}

/**
 * Running headers/footers often reprint a bare `Table 5` on every page of a
 * multi-page table. Keep the first occurrence; demote later exact repeats at
 * a similar Y so empty-caption diagnostics stay clean.
 */
export function demoteRepeatedBareCaptions(nodes: CanonicalNode[]): CanonicalNode[] {
  const firstByKey = new Map<string, { page: number; y: number }>();
  const demoteIds = new Set<string>();
  for (const node of nodes) {
    if (node.role !== "caption" || !isBareNumberedCaptionText(node.text)) continue;
    const key = (node.text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const y = node.boundingBoxes[0]?.y ?? 0;
    const prev = firstByKey.get(key);
    if (!prev) {
      firstByKey.set(key, { page: node.pageStart, y });
      continue;
    }
    if (node.pageStart > prev.page && Math.abs(y - prev.y) <= 36) {
      demoteIds.add(node.id);
    }
  }
  // `Figure 2.` with only a trailing period is chrome, not a legend.
  for (const node of nodes) {
    if (node.role !== "caption" || !node.text) continue;
    if (/^(?:figure|fig\.?|図)\s*\d+[a-z]?\s*\.\s*$/i.test(node.text.replace(/\s+/g, " ").trim())) {
      demoteIds.add(node.id);
    }
  }
  // Bare `FIGURE N` + same-page `Figure N.` period twin with no real legend
  // (radial-consistency FIGURE 2 / Figure 2.) — demote both as chrome.
  for (const node of nodes) {
    if (node.role !== "caption" || !isBareNumberedCaptionText(node.text)) continue;
    if (demoteIds.has(node.id)) continue;
    const num = (node.text ?? "").match(/^(?:figure|fig\.?|図)\s*(\d+)/i)?.[1];
    if (!num) continue;
    const periodTwin = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.role !== "caption") return false;
      const ct = (candidate.text ?? "").replace(/\s+/g, " ").trim();
      return new RegExp(`^(?:figure|fig\\.?|図)\\s*${num}[a-z]?\\s*\\.\\s*$`, "i").test(ct);
    });
    const hasRealLegend = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.role !== "caption") return false;
      const ct = (candidate.text ?? "").replace(/\s+/g, " ").trim();
      const n = ct.match(/^(?:figure|fig\.?|図)\s*(\d+)/i)?.[1];
      return (
        n === num &&
        !isBareNumberedCaptionText(ct) &&
        !/^(?:figure|fig\.?|図)\s*\d+[a-z]?\s*\.\s*$/i.test(ct) &&
        ct.length >= 28
      );
    });
    if (periodTwin && !hasRealLegend) demoteIds.add(node.id);
  }
  // Multi-page table footers often reprint a bare `TABLE 1` under a
  // `(Continued)` marker with no legend on that page.
  for (const node of nodes) {
    if (node.role !== "caption" || !isBareNumberedCaptionText(node.text)) continue;
    if (demoteIds.has(node.id)) continue;
    const box = node.boundingBoxes[0];
    const y = box?.y ?? 0;
    const x = box?.x ?? 0;
    const continuedAbove = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.id === node.id) return false;
      const cy = candidate.boundingBoxes[0]?.y ?? 0;
      return cy < y && cy >= y - 80 && /\(\s*continued\s*\)/i.test(candidate.text ?? "");
    });
    // Bare label beside a right-column mid-word body fragment on the same
    // baseline is continued-table footer chrome, not a real caption.
    const besideBodyFragment = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.id === node.id) return false;
      if (candidate.role !== "paragraph" && candidate.role !== "other") return false;
      const cb = candidate.boundingBoxes[0];
      if (!cb) return false;
      const text = (candidate.text ?? "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      const midSentence =
        /^[a-zà-öø-ÿ]/.test(text) ||
        /^\d+\)/.test(text) ||
        /^=\s*\d/.test(text) ||
        /^[^A-Z\d\u00C0-\u00DE(]/.test(text);
      return (
        midSentence &&
        words >= 4 &&
        words <= 40 &&
        Math.abs(cb.y - y) <= 20 &&
        // Classic right-rail fragment, or overlapping column with the bare label
        // (split `…(n = 2)` / `Table 4` / `2). Their…` lines).
        (cb.x - x >= 80 || Math.abs(cb.x - x) <= 40)
      );
    });
    // Page-top bare `Table N` above a data grid with no legend is continued-
    // table chrome (legend lived on the previous page).
    const nearPageTop = y > 0 && y < 90;
    const tableBelow = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.role !== "table") return false;
      const cy = candidate.boundingBoxes[0]?.y ?? 0;
      return cy >= y && cy - y <= 40;
    });
    // Bare label sharing a baseline with a table-row dump (`Tool NO NAME…`)
    // and no Title-Case legend is a grid header, not a caption.
    const sameBaselineTableDump = nodes.some((candidate) => {
      if (candidate.pageStart !== node.pageStart || candidate.role !== "table") return false;
      const cb = candidate.boundingBoxes[0];
      if (!cb) return false;
      const cellWords = (candidate.text ?? "").split(/\s+/).filter(Boolean).length;
      // Right-rail bare `Table 9` beside a wide Scenario/Results grid
      // (hybrid-real-synthetic) — same baseline, label to the right of cells.
      const rightRailBesideGrid =
        /^(?:table|表)\s*\d+/i.test((node.text ?? "").trim()) &&
        Math.abs(cb.y - y) <= 8 &&
        cb.x + 24 < x &&
        // Some grids keep a skinny lead-cell bbox; trust word count instead.
        cellWords >= 6 &&
        ((candidate.text ?? "").trim().length >= 40);
      return (
        (Math.abs(cb.y - y) <= 8 && Math.abs((cb.x ?? 0) - x) <= 8) || rightRailBesideGrid
      );
    });
    // Journal callout: large bare `Figure 2` immediately above a full
    // `Figure 1 A‒C | …` (or same-number) legend. Keep the legend caption;
    // demote the bare label so emptyCap does not fire on chrome.
    const bareFigure = /^(?:figure|fig\.?|図)\s*\d+/i.test((node.text ?? "").trim());
    const bareTable = /^(?:table|表)\s*\d+/i.test((node.text ?? "").trim());
    const fullCaptionBelow =
      bareFigure &&
      nodes.some((candidate) => {
        if (candidate.pageStart !== node.pageStart || candidate.id === node.id) return false;
        if (candidate.role !== "caption") return false;
        const ct = (candidate.text ?? "").replace(/\s+/g, " ").trim();
        if (isBareNumberedCaptionText(ct)) return false;
        if (!/^(?:figure|fig\.?|図)\s*\d+/i.test(ct)) return false;
        if (ct.length < 28) return false;
        const cb = candidate.boundingBoxes[0];
        if (!cb) return false;
        const gap = cb.y - (y + (box?.height ?? 0));
        const aligned = Math.abs(cb.x - x) <= Math.max(24, (box?.width ?? 40) * 0.5);
        return aligned && gap >= -6 && gap <= 48;
      });
    // Page-foot bare `TABLE 3` with cell crumbs on the next page and no legend.
    const continuedTableAtPageFoot =
      bareTable &&
      y > 720 &&
      nodes.some((candidate) => {
        if (candidate.pageStart !== node.pageStart + 1) return false;
        if (candidate.role !== "table" && candidate.role !== "other" && candidate.role !== "paragraph") {
          return false;
        }
        const ct = (candidate.text ?? "").replace(/\s+/g, " ").trim();
        const cy = candidate.boundingBoxes[0]?.y ?? 999;
        return (
          cy < 200 &&
          ct.length > 0 &&
          ct.length <= 80 &&
          !/^(?:table|figure|fig\.?|表|図)\s*\d+/i.test(ct) &&
          (/^(?:[A-Z]{2,}(?:\s+[A-Z]{2,}){0,4})$/.test(ct) ||
            /(?:POMDP|VLM|Path\s*Planning)/i.test(ct))
        );
      });
    // Vertically rotated page-foot `Table N` (width≪height) is running chrome
    // with no legend text (assayblast Table 1/3 at y≈706, w≈9, h≈28).
    const rotatedPageFootLabel =
      (bareTable || bareFigure) &&
      y > 650 &&
      (box?.width ?? 99) <= 14 &&
      (box?.height ?? 0) >= (box?.width ?? 0) * 2 &&
      (box?.height ?? 0) >= 18;
    if (
      continuedAbove ||
      besideBodyFragment ||
      (nearPageTop && tableBelow) ||
      sameBaselineTableDump ||
      fullCaptionBelow ||
      continuedTableAtPageFoot ||
      rotatedPageFootLabel
    ) {
      demoteIds.add(node.id);
    }
  }
  if (demoteIds.size === 0) return nodes;
  return nodes.map((node) => {
    if (!demoteIds.has(node.id)) return node;
    return {
      ...node,
      role: "other" as const,
      confidence: Math.min(node.confidence, 0.4),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "repeated-bare-caption-chrome",
          confidence: 0.9,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "bare Table/Figure N repeated as running chrome or continued-table footer",
        },
      ],
    };
  });
}

function isTablePanelLabel(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  return /^\([a-z0-9]{1,2}\)$/i.test(trimmed) || /^[a-z0-9]{1,2}\)$/i.test(trimmed);
}

function hasRowLikeTableEvidence(node: CanonicalNode): boolean {
  return node.evidence.some((entry) =>
    entry.label === "table-row-geometry" ||
    entry.label === "repeated-prose-cell-grid" ||
    entry.label === "captioned-native-multicell-row" ||
    entry.label === "cjk-checkmark-comparison-grid" ||
    entry.label === "merged-adjacent-table-rows" ||
    entry.label === "merged-page-geometry-table-rows" ||
    entry.label === "caption-anchored-graphics-grid" ||
    entry.label === "table-region-member" ||
    entry.label === "page-native-grid" ||
    entry.label === "caption-bounded-table-cell"
  );
}

/** Font-decode / chart-axis debris promoted via page-native-grid. */
function isGarbageTableFragment(node: CanonicalNode): boolean {
  if (node.role !== "table") return false;
  const text = (node.text ?? "").trim();
  if (!text) return true;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  const symbols = (text.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  // Lone bibliography markers painted as table cells.
  if (/^\[\d{1,3}\]$/.test(text)) return true;
  // Pure p-values / matrix cells (`0.594`) are real table content when they
  // sit inside a larger table, but a solitary citation-sized number with no
  // other cell text is almost always a fragmented review-matrix crumb.
  if (digits > 0 && letters === 0 && /^[\d.,+\-–—()%]+$/.test(text)) {
    return text.length <= 8 && !/[.%]/.test(text) ? true : false;
  }
  if (letters <= 2 && text.length <= 12 && digits === 0) return true;
  if (letters > 0 && symbols >= letters && letters < 12) return true;
  if (/[*;=><]{2,}/.test(text) && letters < 10) return true;
  if (/^(?:ab|=+|y{2,}|o\*\*;)/i.test(text) && text.length <= 24) return true;
  // Decode noise rows such as `Y YY Y Y` / `>Y YY` / `O**; H O**; H`.
  if (digits === 0 && letters <= 10 && /^(?:[A-Z<>*=;\s]|[YyHhOoMm])+$/.test(text) && text.length <= 40) {
    return true;
  }
  if (digits === 0 && letters > 0 && letters <= 6 && /[Yy]{2,}/.test(text)) return true;
  return false;
}

/**
 * Frontiers / review comparison tables often emit one native block per row
 * (`• Machine learning ✓ ✓`). Keep them as table content so they skip MADLAD,
 * but collapse consecutive same-page row fragments into one node so Reader
 * does not open dozens of table cards for a single visual matrix.
 */
function isWeakProseGridTableFragment(node: CanonicalNode): boolean {
  if (node.role !== "table") return false;
  const labels = new Set(node.evidence.map((entry) => entry.label));
  if (!labels.has("repeated-prose-cell-grid")) return false;
  if (
    labels.has("table-row-geometry") ||
    labels.has("captioned-native-multicell-row") ||
    labels.has("cjk-checkmark-comparison-grid") ||
    labels.has("merged-adjacent-table-rows") ||
    labels.has("captioned-neighbor-cell-rows") ||
    labels.has("axis-label-numeric-neighborhood")
  ) {
    return false;
  }
  const text = (node.text ?? "").trim();
  if (!text || isNumberedTableCaptionText(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  // Captionless method/goal grids use short Title-Case headers and infinitive
  // goal sentences as real cells. Keep those; only demote lowercase crumbs.
  if (/^(?:Method|Goal|Approach|Description)\b/i.test(text)) return false;
  if (/^To\s+[a-z]/i.test(text) && words.length >= 5) return false;
  // OzCHI-style matrix axis labels (`Phonebook`, `Thumb`, `Finger 1`).
  if (/^(?:Finger\s*\d+|Thumb|Phonebook|Gallery|Comfortable)$/i.test(text)) return false;
  // Multi-column prose crumbs (`enthusiasm`, `for purely`, `approaches.`) win
  // the prose-cell-grid race without independent row geometry.
  if (/^[a-z]/.test(text)) return true;
  if (/[."”']$/.test(text) && words.length <= 5 && /^[a-z]/.test(text) && !/\d/.test(text)) return true;
  if (words.length <= 3 && !/\d/.test(text) && !/[√✓☑☒•]/.test(text) && !/\//.test(text)) return true;
  return false;
}

function isWeakTableIntervening(node: CanonicalNode): boolean {
  if (node.role !== "paragraph" && node.role !== "other" && node.role !== "heading") return false;
  const text = (node.text ?? "").trim();
  if (!text) return true;
  if (/^(?:partial|continued|continued\.)$/i.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return text.length <= 36 && words.length <= 5 && !/[.!?]$/.test(text) &&
    !/^(?:table|figure|fig\.?|図|表)\s*\d+/i.test(text);
}

function findMergeableTableAnchor(result: CanonicalNode[]): number {
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const candidate = result[index];
    if (
      candidate.role === "table" &&
      (candidate.text ?? "").trim() &&
      hasRowLikeTableEvidence(candidate) &&
      !isNumberedTableCaptionText(candidate.text)
    ) {
      return index;
    }
    if (isWeakTableIntervening(candidate)) continue;
    break;
  }
  return -1;
}

export function mergeAdjacentTableRows(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    if (node.role === "table" && !(node.text ?? "").trim()) {
      continue;
    }

    if (isGarbageTableFragment(node)) {
      continue;
    }

    if (node.role === "table" && isTablePanelLabel(node.text)) {
      result.push({
        ...node,
        role: "other",
        confidence: Math.min(node.confidence, 0.55),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "demoted-table-panel-label",
            confidence: 0.7,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "panel marker is not an independent table",
          },
        ],
      });
      continue;
    }

    if (isWeakProseGridTableFragment(node)) {
      result.push({
        ...node,
        role: "paragraph",
        confidence: Math.min(node.confidence, 0.62),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic",
            label: "demoted-weak-prose-cell-grid",
            confidence: 0.72,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "prose-cell-grid without row geometry is not a table",
          },
        ],
      });
      continue;
    }

    const anchorIndex = node.role === "table" &&
      hasRowLikeTableEvidence(node) &&
      !isNumberedTableCaptionText(node.text)
      ? findMergeableTableAnchor(result)
      : -1;
    const prev = anchorIndex >= 0 ? result[anchorIndex] : undefined;
    if (prev && prev.pageStart === node.pageStart) {
      const prevBox = prev.boundingBoxes.at(-1);
      const nodeBox = node.boundingBoxes[0];
      const gap = prevBox && nodeBox
        ? nodeBox.y - (prevBox.y + prevBox.height)
        : Number.POSITIVE_INFINITY;
      const line = Math.max(prevBox?.height ?? 12, nodeBox?.height ?? 12, 10);
      // Allow overlap (two-column PDF boxes) and a short run of weak crumbs
      // between native table rows (`partial`, citation tails).
      if (gap >= -line * 3.5 && gap <= line * 4.2 && sharesTextRotation(prev, node)) {
        const intervening = result.slice(anchorIndex + 1);
        // A rotated label running down the side of a plot sits between the
        // rows geometrically but is not part of the table.
        if (intervening.some((entry) => !sharesTextRotation(prev, entry))) {
          result.push(node);
          continue;
        }
        const interveningText = intervening
          .map((entry) => (entry.text ?? "").trim())
          .filter(Boolean)
          .join(" ");
        result.splice(anchorIndex + 1);
        result[anchorIndex] = {
          ...prev,
          text: [prev.text, interveningText, node.text]
            .map((part) => (part ?? "").trim())
            .filter(Boolean)
            .join("\n"),
          pageEnd: Math.max(prev.pageEnd, node.pageEnd),
          boundingBoxes: [...prev.boundingBoxes, ...intervening.flatMap((entry) => entry.boundingBoxes), ...node.boundingBoxes],
          confidence: Math.min(prev.confidence, node.confidence),
          evidence: [
            ...prev.evidence,
            ...node.evidence.filter((entry) =>
              entry.label === "table-row-geometry" ||
              entry.label === "repeated-prose-cell-grid" ||
              entry.label === "captioned-native-multicell-row" ||
              entry.label === "cjk-checkmark-comparison-grid"
            ),
            {
              source: "generic-heuristic",
              label: "merged-adjacent-table-rows",
              confidence: 0.9,
              page: node.pageStart,
              bbox: nodeBox,
              reason: intervening.length
                ? "joined table-row fragments across weak intervening crumbs"
                : "joined consecutive native table-row fragments",
            },
          ],
        };
        continue;
      }
    }
    result.push(node);
  }
  return result;
}

function isProseMistakenTableRow(node: CanonicalNode): boolean {
  if (node.role !== "table") return false;
  const text = (node.text ?? "").trim();
  if (!text || isNumberedTableCaptionText(text)) return false;
  if (/[√✓☑☒]/.test(text) || /\t/.test(text)) return false;
  // Caption-owned / geometry-backed matrix rows stay tables even when a cell
  // lead is a lowercase statistic label such as `n No Minor Substantial`.
  if (node.evidence.some((entry) =>
    entry.label === "table-row-geometry" ||
    entry.label === "captioned-native-multicell-row" ||
    entry.label === "captioned-neighbor-cell-rows" ||
    entry.label === "matrix-axis-label-neighbor" ||
    entry.label === "caption-bounded-table-cell"
  )) {
    return false;
  }
  if (looksLikeVignetteOrOptionProse(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (/^(?:rather than|however|therefore|in this|we |this |because|although)\b/i.test(text)) return true;
  if (/^[a-z]/.test(text) && !/\d/.test(text) && words.length >= 3 && words.length <= 12) return true;
  // Page footers and truncated cell crumbs left after matrix extraction.
  if (/\b\d+\s+of\s+\d+\s*$/i.test(text) && words.length <= 10) return true;
  if (text.length < 40 && /\b(?:of|the|in|at|for|and|to|from)\s*$/i.test(text)) return true;
  if (text.length < 36 && /^\d{4}\s*\[\d+\]/.test(text)) return true;
  return false;
}

function demoteProseMistakenTableRows(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node) => {
    if (!isProseMistakenTableRow(node)) return node;
    return {
      ...node,
      role: "paragraph",
      confidence: Math.min(node.confidence, 0.6),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic",
          label: "demoted-prose-table-row",
          confidence: 0.7,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "sentence-like fragment lacked table structure",
        },
      ],
    };
  });
}

/**
 * Merge table-row fragments that share a page even when reading order inserts
 * body prose between them (two-column Frontiers layouts). Cluster by vertical
 * proximity and overlapping x-bands rather than document adjacency.
 */
export function mergeTableRowsByPageGeometry(nodes: CanonicalNode[]): CanonicalNode[] {
  type Entry = { index: number; node: CanonicalNode };
  const byPage = new Map<number, Entry[]>();
  nodes.forEach((node, index) => {
    if (
      node.role !== "table" ||
      !(node.text ?? "").trim() ||
      isNumberedTableCaptionText(node.text) ||
      !hasRowLikeTableEvidence(node)
    ) {
      return;
    }
    const list = byPage.get(node.pageStart) ?? [];
    list.push({ index, node });
    byPage.set(node.pageStart, list);
  });

  const absorbed = new Set<string>();
  const replacement = new Map<number, CanonicalNode>();

  for (const entries of byPage.values()) {
    entries.sort((a, b) =>
      (a.node.boundingBoxes[0]?.y ?? 0) - (b.node.boundingBoxes[0]?.y ?? 0) ||
      (a.node.boundingBoxes[0]?.x ?? 0) - (b.node.boundingBoxes[0]?.x ?? 0)
    );
    let cluster: Entry[] = [];
    const flush = () => {
      if (cluster.length <= 1) {
        cluster = [];
        return;
      }
      const first = cluster[0]!;
      const merged: CanonicalNode = {
        ...first.node,
        text: cluster.map((entry) => (entry.node.text ?? "").trim()).filter(Boolean).join("\n"),
        pageEnd: Math.max(...cluster.map((entry) => entry.node.pageEnd)),
        boundingBoxes: cluster.flatMap((entry) => entry.node.boundingBoxes),
        confidence: Math.min(...cluster.map((entry) => entry.node.confidence)),
        evidence: [
          ...first.node.evidence,
          {
            source: "generic-heuristic",
            label: "merged-page-geometry-table-rows",
            confidence: 0.88,
            page: first.node.pageStart,
            bbox: first.node.boundingBoxes[0],
            reason: `joined ${cluster.length} same-page table-row fragments by geometry`,
          },
        ],
      };
      replacement.set(first.index, merged);
      for (const entry of cluster.slice(1)) absorbed.add(entry.node.id);
      cluster = [];
    };

    for (const entry of entries) {
      if (cluster.length === 0) {
        cluster = [entry];
        continue;
      }
      const prev = cluster.at(-1)!.node;
      const prevBox = prev.boundingBoxes.at(-1);
      const nodeBox = entry.node.boundingBoxes[0];
      const gap = prevBox && nodeBox
        ? nodeBox.y - (prevBox.y + prevBox.height)
        : Number.POSITIVE_INFINITY;
      const line = Math.max(prevBox?.height ?? 12, nodeBox?.height ?? 12, 10);
      const prevRight = (prevBox?.x ?? 0) + (prevBox?.width ?? 0);
      const nodeRight = (nodeBox?.x ?? 0) + (nodeBox?.width ?? 0);
      const xOverlap = prevBox && nodeBox
        ? Math.min(prevRight, nodeRight) - Math.max(prevBox.x, nodeBox.x)
        : 0;
      const xCompatible = xOverlap >= -36 || Math.abs((prevBox?.x ?? 0) - (nodeBox?.x ?? 0)) <= 72;
      // Review comparison matrices often leave large vertical gaps between
      // extracted cell crumbs on the same page; keep clustering loosely.
      if (gap >= -line * 4 && gap <= Math.max(line * 7.5, 96) && xCompatible &&
          sharesTextRotation(prev, entry.node)) {
        cluster.push(entry);
      } else {
        flush();
        cluster = [entry];
      }
    }
    flush();
  }

  return nodes
    .map((node, index) => replacement.get(index) ?? node)
    .filter((node) => !absorbed.has(node.id));
}

/**
 * When a page still has many short prose-cell-grid table crumbs after geometry
 * clustering (typical of wide review comparison matrices), collapse them into
 * one table node per page so Reader does not open a card per cell.
 */
/** Short cell-like fragments that sit between numbered table captions but never
 * received table geometry (Frontiers SEM score tables, etc.). Promote them so
 * captions are not left orphaned and effect-size crumbs do not become headings. */
function looksLikeCaptionBoundedTableCell(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 96) return false;
  if (/^(?:table|figure|fig\.?|図|表)\s*\d+/i.test(trimmed)) return false;
  if (/^(?:introduction|methods?|results?|discussion|conclusion|references?)\b/i.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (/^source\s*:/i.test(trimmed) && words.length <= 8) return true;
  if (trimmed === "—" || trimmed === "-" || trimmed === "–") return true;
  if (/\d/.test(trimmed) && words.length <= 10 && !/[.!?]\s+[A-Z]/.test(trimmed)) return true;
  if (words.length <= 6 && !/[.!?]$/.test(trimmed) && !/^(?:however|therefore|moreover|furthermore|in this|we |this study)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function isNumberedTableCaptionNode(node: CanonicalNode): boolean {
  if (!isNumberedTableCaptionText(node.text)) return false;
  // Layout may leave `TABLE 6 F-squared.` as a paragraph until the late
  // standalone-caption pass; treat those leads as caption anchors too.
  return node.role === "caption" || node.role === "paragraph" || node.role === "heading";
}

/** Copy a nearby numbered table caption onto merged table regions that lost
 * `structuralLabel` when caption shells were empty-filtered. */
export function annotateTablesFromCaptions(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((node, index) => {
    if (node.role !== "table" || node.structuralLabel) return node;
    if (isNumberedTableCaptionText(node.text)) return node;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = nodes[i]!;
      if (prev.pageStart !== node.pageStart) break;
      const prevText = (prev.text ?? "").trim();
      if (isNumberedTableCaptionText(prevText) &&
        (prev.role === "caption" || prev.role === "paragraph" || prev.role === "heading")) {
        return { ...node, structuralLabel: prevText };
      }
      if (prev.role === "table" && prev.structuralLabel) {
        return { ...node, structuralLabel: prev.structuralLabel };
      }
      if (prev.role === "heading" && /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introduction|methods?|results?|discussion)\b/i.test(prevText)) {
        break;
      }
    }
    return node;
  });
}

export function promoteCaptionBoundedTableCells(nodes: CanonicalNode[]): CanonicalNode[] {
  const captionIndexes: number[] = [];
  nodes.forEach((node, index) => {
    if (isNumberedTableCaptionNode(node)) {
      captionIndexes.push(index);
    }
  });
  if (captionIndexes.length === 0) return nodes;

  const promoteIds = new Set<string>();
  for (let c = 0; c < captionIndexes.length; c += 1) {
    const start = captionIndexes[c]!;
    const end = captionIndexes[c + 1] ?? nodes.length;
    const caption = nodes[start]!;
    const window: CanonicalNode[] = [];
    for (let i = start + 1; i < end; i += 1) {
      const node = nodes[i]!;
      if (node.pageStart !== caption.pageStart) break;
      if (node.role === "caption" || isNumberedTableCaptionText(node.text)) break;
      if (node.role === "heading" && /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introduction|methods?|results?|discussion|conclusion|references?)\b/i.test((node.text ?? "").trim())) {
        break;
      }
      const text = (node.text ?? "").trim();
      // Long body prose ends the table window.
      if (
        (node.role === "paragraph" || node.role === "abstract") &&
        text.split(/\s+/).filter(Boolean).length >= 18 &&
        /[.!?]$/.test(text) &&
        !looksLikeCaptionBoundedTableCell(text)
      ) {
        break;
      }
      if (
        (node.role === "paragraph" || node.role === "heading" || node.role === "other" || node.role === "copyright") &&
        looksLikeCaptionBoundedTableCell(text)
      ) {
        window.push(node);
      } else if (node.role === "table") {
        // Already owned; no need to promote siblings for orphan clearance,
        // but keep scanning short crumbs after a partial table row.
        continue;
      } else if (text) {
        // Non-cell content interrupts the band.
        if (window.length > 0 && window.length < 3) window.length = 0;
        else break;
      }
    }
    if (window.length >= 3) {
      for (const node of window) promoteIds.add(node.id);
    }
  }

  if (promoteIds.size === 0) return nodes;
  return nodes.map((node) => {
    if (!promoteIds.has(node.id)) return node;
    return {
      ...node,
      role: "table" as const,
      confidence: Math.max(node.confidence, 0.82),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "caption-bounded-table-cell",
          confidence: 0.84,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "short cell-like fragment between numbered table captions",
        },
      ],
    };
  });
}

function collapseDenseShortProseGridTables(nodes: CanonicalNode[]): CanonicalNode[] {
  type Entry = { index: number; node: CanonicalNode };
  const byPage = new Map<number, Entry[]>();
  nodes.forEach((node, index) => {
    const text = (node.text ?? "").trim();
    if (
      node.role !== "table" ||
      text.length === 0 ||
      text.length >= 40 ||
      isNumberedTableCaptionText(text)
    ) {
      return;
    }
    // Prefer prose/native grid crumbs, but also collapse dense short cells
    // from review comparison matrices that used other evidence labels.
    const list = byPage.get(node.pageStart) ?? [];
    list.push({ index, node });
    byPage.set(node.pageStart, list);
  });

  const absorbed = new Set<string>();
  const replacement = new Map<number, CanonicalNode>();
  for (const entries of byPage.values()) {
    if (entries.length < 4) continue;
    entries.sort((a, b) => (a.node.boundingBoxes[0]?.y ?? 0) - (b.node.boundingBoxes[0]?.y ?? 0));
    const first = entries[0]!;
    replacement.set(first.index, {
      ...first.node,
      text: entries.map((entry) => (entry.node.text ?? "").trim()).filter(Boolean).join("\n"),
      pageEnd: Math.max(...entries.map((entry) => entry.node.pageEnd)),
      boundingBoxes: entries.flatMap((entry) => entry.node.boundingBoxes),
      confidence: Math.min(...entries.map((entry) => entry.node.confidence)),
      evidence: [
        ...first.node.evidence,
        {
          source: "generic-heuristic",
          label: "collapsed-dense-prose-grid-tables",
          confidence: 0.84,
          page: first.node.pageStart,
          bbox: first.node.boundingBoxes[0],
          reason: `collapsed ${entries.length} short prose-grid table crumbs on one page`,
        },
      ],
    });
    for (const entry of entries.slice(1)) absorbed.add(entry.node.id);
  }

  return nodes
    .map((node, index) => replacement.get(index) ?? node)
    .filter((node) => !absorbed.has(node.id));
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
  // Demote vignette / Q&A prose before row merges so `Q:` / `Option N:` lines
  // stay independent paragraphs instead of collapsing into one opaque card.
  // Captioned questionnaire grids keep strong matrix evidence and are skipped.
  nodes = demoteProseMistakenTableRows(nodes);
  nodes = mergeTableCaptionContinuations(nodes);
  nodes = resolveTableRegions(nodes, input.regionEvidence ?? []);
  nodes = mergeAdjacentTableRows(nodes);
  // Drop empty table shells left after region promotion / row merges.
  nodes = nodes.filter((node) => node.role !== "table" || Boolean((node.text ?? "").trim()));
  nodes = mergeTableRowsByPageGeometry(nodes);
  nodes = collapseDenseShortProseGridTables(nodes);
  nodes = demoteProseMistakenTableRows(nodes);
  nodes = nodes.filter((node) => node.role !== "table" || Boolean((node.text ?? "").trim()));
  nodes = annotateTablesFromCaptions(nodes);
  nodes = promoteRotatedTableCaptions(nodes, candidates);
  nodes = splitInlineSectionLabels(nodes);
  nodes = demotePageOneAuthorHeadings(nodes);
  nodes = recoverPageOneAuthorTables(nodes);
  nodes = promoteMislabelledSectionAuthors(nodes);
  nodes = demotePageOneProseAffiliations(nodes);
  nodes = demotePageOneProseCopyrights(nodes);
  // Affiliation superscripts glued onto abstract prose without a newline:
  // `A. Name1, B. Name2 Distributed Acoustic Sensing…`
  // Require digit/marker superscripts on the byline and abstract-shaped
  // body so Indonesian title+byline cover glue is not peeled into authors.
  nodes = nodes.flatMap((node) => {
    if (node.role !== "author" || node.pageStart > 1 || !node.text) return [node];
    const raw = node.text.replace(/\s+/g, " ").trim();
    if (raw.length < 100) return [node];
    const m = raw.match(
      /^((?:[A-Z](?:\.[A-Z])*\.?[A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]+){0,3}\d+(?:[*†‡§¶])?(?:\s*(?:,|&|and)\s*)?){2,})\s+([A-Z][\s\S]{80,})$/,
    );
    if (!m?.[1] || !m[2]) return [node];
    const byline = m[1].replace(/[,\s]+$/, "").trim();
    const abstractBody = m[2].trim();
    const bylineWords = byline.split(/\s+/).filter(Boolean);
    if (bylineWords.length < 3 || bylineWords.length > 16) return [node];
    // Every author token in the byline should carry a digit marker.
    if ((byline.match(/\d+/g) ?? []).length < 2) return [node];
    if (!/[.!?]\s+[A-Z]/.test(abstractBody)) return [node];
    if (abstractBody.split(/\s+/).length < 24) return [node];
    // Reject when the "byline" is really a title fragment (no initials, long TC).
    if (!/\b[A-Z]\.(?:\s*[A-Z]\.)*/.test(byline) && bylineWords.length >= 6) return [node];
    const authorNode: CanonicalNode = {
      ...node,
      text: byline,
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "peeled-author-abstract-glue",
          confidence: 0.9,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "split affiliation byline from glued abstract prose",
        },
      ],
    };
    const abstractNode: CanonicalNode = {
      ...node,
      id: `${node.id}-abstract-peel`,
      role: "abstract",
      text: abstractBody,
      confidence: Math.max(node.confidence, 0.82),
      evidence: [
        {
          source: "generic-heuristic" as const,
          label: "peeled-author-abstract-body",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "abstract body recovered from author+prose glue",
        },
      ],
    };
    return [authorNode, abstractNode];
  });
  nodes = markAbstracts(nodes);
  nodes = markColonStructuredFrontAbstracts(nodes);
  nodes = markUnlabeledFrontAbstracts(nodes);
  // Numbered affiliation dumps painted as abstract
  // (`Academy of Medical Sciences… 4School of Artificial Intelligence…`).
  // Run before late-front promotion so a false abstract does not block it.
  nodes = nodes.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const text = node.text.replace(/\s+/g, " ").trim();
    const numberedInst =
      text.match(/\d{1,2}\s*(?:Faculty|School|Department|Institute|University|Academy|College)\b/gi) ??
      [];
    const narrative =
      /\b(?:this (?:study|paper|review|work)|we (?:present|propose|investigate)|background|objective|methods?:|results?:)\b/i.test(
        text,
      );
    const affiliationLead =
      /^(?:Academy|School|Faculty|Department|Institute|University)\b/i.test(text) &&
      /\b(?:university|china|sciences|academy|faculty)\b/i.test(text);
    if ((numberedInst.length >= 1 || affiliationLead) && !narrative && text.length < 900) {
      return {
        ...node,
        role: "affiliation" as const,
        confidence: Math.min(node.confidence, 0.55),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "affiliation-dump-demoted-from-abstract",
            confidence: 0.88,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "numbered affiliation rail demoted from abstract role",
          },
        ],
      };
    }
    return node;
  });
  nodes = promoteLateFrontAbstracts(nodes);
  // Mislabelled affiliation prose in the abstract column (`Persons who have
  // experienced homelessness…`) should join the band before continuation merge.
  nodes = (() => {
    const next = [...nodes];
    for (let i = 0; i < next.length; i += 1) {
      const node = next[i];
      if (node.role !== "affiliation" || !node.text) continue;
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text.split(/\s+/).filter(Boolean).length < 6) continue;
      // Real Elsevier / Springer affiliation rails (`a Institute of…`, long
      // multi-site addresses) must stay affiliations even when they are long
      // and sit near an abstract column.
      if (
        /^[a-z]\s+(?:Institute|University|Department|Faculty|School|Hospital|Center|Centre)\b/i.test(text) ||
        /(?:university|department|institute|hospital|faculty|school of|article history)\b/i.test(text)
      ) {
        continue;
      }
      if (/@|university|department|institute|hospital|faculty|school of\b/i.test(text) && text.length < 80) {
        continue;
      }
      const prev = next[i - 1];
      const following = next[i + 1];
      const nearAbstract =
        (prev?.role === "abstract" && prev.pageStart === node.pageStart) ||
        (following?.role === "abstract" && following.pageStart === node.pageStart);
      if (!nearAbstract) continue;
      const absX = (prev?.role === "abstract" ? prev : following)?.boundingBoxes[0]?.x;
      const x = node.boundingBoxes[0]?.x;
      if (absX != null && x != null && Math.abs(x - absX) > 100) continue;
      next[i] = {
        ...node,
        role: "abstract" as const,
        confidence: Math.max(node.confidence, 0.8),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "affiliation-prose-in-abstract-band",
            confidence: 0.84,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "long affiliation-labelled prose adjacent to abstract band",
          },
        ],
      };
    }
    return next;
  })();
  nodes = mergeAbstractContinuations(nodes);
  // Elsevier asymmetric rails can still glue `a Institute… article info
  // a b s t r a c t Deep learning…` into one abstract node. Peel the body.
  nodes = nodes.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const raw = node.text.replace(/\s+/g, " ").trim();
    const letterspaced = raw.match(
      /\ba\s+b\s+s\s+t\s+r\s+a\s+c\s+t\s+(.+)$/i,
    );
    if (letterspaced && (letterspaced[1]?.length ?? 0) >= 80) {
      return {
        ...node,
        text: letterspaced[1]!.trim(),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "peeled-letterspaced-abstract-label",
            confidence: 0.88,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "dropped article-info rail before letterspaced abstract label",
          },
        ],
      };
    }
    if (/^[a-z]\s+(?:Institute|University|Department|Faculty)\b/i.test(raw)) {
      const cut = raw.search(
        /\b(?:Deep learning|This (?:paper|study|review|work)|We (?:present|propose|report)|In this|Recent(?:ly)?)\b/,
      );
      if (cut >= 40 && raw.length - cut >= 80) {
        return {
          ...node,
          text: raw.slice(cut).trim(),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "peeled-affiliation-lead-abstract",
              confidence: 0.86,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason: "dropped leading affiliation rail from abstract body",
            },
          ],
        };
      }
    }
    return node;
  });
  // Letterspaced correspondence / registry rails sometimes trail the abstract.
  nodes = nodes.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const t = node.text.replace(/\s+/g, " ").trim();
    const compact = t.replace(/\s+/g, "");
    const correspondence =
      /^\*?\s*correspondence\b/i.test(t) || /^\*?correspondence:/i.test(compact);
    const registryRail =
      /^(?:systematic review registration|trial registration|clinical trial registration)\s*:?\s*$/i.test(
        t,
      );
    if (!correspondence && !registryRail) return node;
    return {
      ...node,
      role: "copyright" as const,
      confidence: Math.min(node.confidence, 0.5),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: correspondence
            ? "demoted-abstract-correspondence-rail"
            : "demoted-abstract-registry-rail",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: correspondence
            ? "correspondence rail is not abstract body"
            : "registry label without payload is not abstract body",
        },
      ],
    };
  });
  nodes = demoteAbstractsAfterIntroduction(nodes);
  // Table/figure body that leaked into a multi-page abstract band.
  const firstAbstractPage = Math.min(
    ...nodes.filter((n) => n.role === "abstract").map((n) => n.pageStart),
    Infinity,
  );
  nodes = nodes.map((node) => {
    if (node.role !== "abstract" || !node.text) return node;
    const t = node.text.replace(/\s+/g, " ").trim();
    const tableLike =
      /^[\d.%*\s<>≤≥-]+$/.test(t) ||
      /^\*+\s*\*+/.test(t) ||
      /^(?:variable|category\s+vs\.?\s+reference|standardized prevalence|note:\s*bars)\b/i.test(t) ||
      (/\*{2,}/.test(t) && t.split(/\s+/).filter(Boolean).length <= 12) ||
      (/^(?:sex|men|women)\b/i.test(t) && /\d{2,}\s*\(/.test(t) && t.length < 200) ||
      (/^(?:neck|lower back|upper back|shoulders|elbows|knees|wrists)\b/i.test(t) &&
        /\b(?:flight attendants|prevalence)\b/i.test(t));
    // Structured abstracts rarely span more than two pages; later pages are
    // almost always body tables/figures that inherited the open band.
    const lateBand =
      Number.isFinite(firstAbstractPage) &&
      node.pageStart >= firstAbstractPage + 2 &&
      !/^(?:background|introduction|methods?|results?|conclusions?|discussion|objective)\s*:/i.test(t);
    if (!tableLike && !lateBand) return node;
    return {
      ...node,
      role: tableLike ? ("table" as const) : ("paragraph" as const),
      confidence: Math.min(node.confidence, 0.7),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: tableLike ? "demoted-tablelike-abstract" : "demoted-late-abstract-band",
          confidence: 0.86,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: tableLike
            ? "table/stat crumb demoted from abstract band"
            : "abstract band leaked past page+1 into body",
        },
      ],
    };
  });
  nodes = attachAbstractTerminalCrumbs(nodes);
  nodes = demoteEarlyAccessBoilerplate(nodes);
  nodes = nodes.map((node) =>
    node.role === "abstract" && node.text
      ? { ...node, text: scrubAbstractCiteCrumbs(node.text) }
      : node,
  );
  // BMJ / HighWire: a how-to-cite crumb (`Ismail FW, et al. Effect of`) can
  // become the only abstract node. Demote it and promote the following
  // structured-abstract body so Reader is not left with a citation stub.
  nodes = (() => {
    const next = [...nodes];
    for (let i = 0; i < next.length; i += 1) {
      const node = next[i];
      if (node.role !== "abstract" || !node.text || !looksLikeCiteOnlyAbstract(node.text)) {
        continue;
      }
      next[i] = {
        ...node,
        role: "copyright" as const,
        confidence: Math.min(node.confidence, 0.45),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "cite-only-abstract-demotion",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "how-to-cite crumb demoted from abstract",
          },
        ],
      };
      for (let j = i + 1; j < Math.min(i + 8, next.length); j += 1) {
        const cand = next[j];
        if (cand.pageStart !== node.pageStart) break;
        if (cand.role === "heading" && /^(?:introduction|background|objectives?|methods?(?:\s+and\s+analysis)?)\b/i.test((cand.text ?? "").trim())) {
          continue;
        }
        if (cand.role !== "paragraph" && cand.role !== "other") continue;
        const text = (cand.text ?? "").trim();
        if (text.length < 40) continue;
        if (/^(?:protected by copyright|downloaded from|to cite\s*:)/i.test(text)) continue;
        next[j] = {
          ...cand,
          role: "abstract" as const,
          confidence: Math.max(cand.confidence, 0.72),
          evidence: [
            ...cand.evidence,
            {
              source: "generic-heuristic" as const,
              label: "abstract-body-after-cite-crumb",
              confidence: 0.78,
              page: cand.pageStart,
              bbox: cand.boundingBoxes[0],
              reason: "structured abstract body recovered after cite crumb",
            },
          ],
        };
        break;
      }
    }
    return next;
  })();
  // Cite-body recovery above can re-label mid-body prose as abstract after
  // Introduction — run demotion once more as the final abstract gate.
  nodes = demoteAbstractsAfterIntroduction(nodes);
  nodes = suppressVectorLabelClusters(nodes);
  nodes = dedupeExactCaptions(nodes);
  nodes = mergeFigureCaptionContinuations(nodes);

  const resolvedTitleText = titleResolved.text;
  const titleNode = nodes.find((n) => n.role === "title");
  if (titleNode && resolvedTitleText) {
    titleNode.text = resolvedTitleText;
    titleNode.confidence = titleResolved.confidence;
    titleNode.evidence = [...titleNode.evidence, ...titleResolved.evidence];
    // Wrapped titles can leave a trailing fragment as a second title node
    // (`Care—Children's Experiences`). Demote proper suffixes of the joined
    // title so only one title identity remains.
    const normalizedResolved = resolvedTitleText.replace(/\s+/g, " ").trim().toLowerCase();
    nodes = nodes.flatMap((node) => {
      if (node === titleNode || node.role !== "title" || !node.text) return [node];
      const fragment = node.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (!fragment) return [node];
      const isSuffixOrCopy =
        fragment === normalizedResolved ||
        normalizedResolved.endsWith(fragment) ||
        normalizedResolved.startsWith(fragment);
      // Wrap fragments that are already inside the joined title must leave the
      // reading stream entirely (`Mobile Phone User Interfaces` after
      // `Exploring … for`). Rival body lines that lost the title race stay as
      // paragraphs so real prose is not deleted. Bylines that over-scored as
      // title (`Wenhao Lin , Yu Fang and Haidong Song *`) must return to author.
      if (isSuffixOrCopy) return [];
      const raw = node.text.replace(/\s+/g, " ").trim();
      const words = raw.split(/\s+/).filter(Boolean);
      const byline =
        /\b(?:and|&)\b/i.test(raw) &&
        (raw.match(/,/g) ?? []).length >= 1 &&
        /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*)+/u.test(raw) &&
        !/:/.test(raw) &&
        words.length <= 18 &&
        !/\b(?:study|review|analysis|survey|effect|role|model|attention|through|toward)\b/i.test(raw);
      // Lone First Last painted in the title font (`Qiuxia Guo`) after the
      // resolved title won — restore as author, not a leftover title/paragraph.
      const personName =
        words.length >= 2 &&
        words.length <= 4 &&
        /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Þ]\.?)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){1,2}$/u.test(raw) &&
        !/\b(?:study|review|analysis|survey|effect|role|model|attention|system|style|based|from|with|using|for|of|on|in|to|and)\b/i.test(
          raw,
        );
      const layoutAuthor = node.evidence.some(
        (e) => /role author/i.test(e.reason ?? "") || /layoutRole=author/i.test(e.reason ?? ""),
      );
      return [
        {
          ...node,
          role: byline || personName || layoutAuthor ? ("author" as const) : ("paragraph" as const),
          confidence: Math.min(node.confidence, 0.5),
          evidence: [
            ...node.evidence,
            {
              source: "generic-heuristic" as const,
              label: "rival-title-demotion",
              confidence: 0.85,
              page: node.pageStart,
              bbox: node.boundingBoxes[0],
              reason:
                byline || layoutAuthor
                  ? "title-overscored byline restored to author"
                  : "second title node lost the resolver race",
            },
          ],
        },
      ];
    });
    // Title-wrap lines sometimes keep a non-title role (author / other) after
    // scoring. Drop those page-1 fragments when they are clearly only a piece
    // of the already-resolved title, not standalone body prose.
    nodes = nodes.filter((node) => {
      if (node === titleNode || node.pageStart !== 1 || !node.text) return true;
      if (node.role !== "author" && node.role !== "other" && node.role !== "paragraph") {
        return true;
      }
      const fragment = node.text.replace(/\s+/g, " ").trim().toLowerCase();
      const words = fragment.split(/\s+/).filter(Boolean);
      if (fragment.length < 12 || words.length < 2) return true;
      const covered =
        fragment === normalizedResolved ||
        normalizedResolved.endsWith(fragment) ||
        normalizedResolved.startsWith(fragment);
      return !covered;
    });
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
  // Inline section splits can mint a parent `5. Results` after `5.3 …` when
  // two-column glue injects the label into later prose. Demote only those
  // split-derived parents (layout-owned section titles keep their role).
  nodes = (() => {
    const majorsWithSub = new Map<number, Set<number>>();
    return nodes.map((node) => {
      if (node.role !== "heading" || !node.text) return node;
      const t = node.text.trim();
      const sub = t.match(/^(\d+)\.(\d+)\b/);
      if (sub) {
        const set = majorsWithSub.get(node.pageStart) ?? new Set<number>();
        set.add(Number(sub[1]));
        majorsWithSub.set(node.pageStart, set);
        return node;
      }
      const parent = t.match(/^(\d+)\.\s+[A-Z].{0,48}$/);
      if (!parent) return node;
      if (!(majorsWithSub.get(node.pageStart)?.has(Number(parent[1])))) return node;
      if (!node.evidence.some((entry) => entry.label === "inline-numbered-section-split")) {
        return node;
      }
      return {
        ...node,
        role: "paragraph" as const,
        confidence: Math.min(node.confidence, 0.55),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "late-parent-section-split-demotion",
            confidence: 0.86,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "inline-split parent section after same-page subsection",
          },
        ],
      };
    });
  })();
  // Hyphen-wrapped title crumbs (`experimental pre-`) and BMJ cite-rail
  // wraps can remain as paragraphs after the resolver stitches the full
  // title. Demote leftovers that are already covered by the resolved title.
  // Restrict to early pages: later body/table cells often reuse title nouns
  // (`Employee wellbeing`, `Visual impairment`) and must not become chrome.
  if ((resolvedTitleText?.length ?? 0) >= 40) {
    const titleNorm = resolvedTitleText!.toLowerCase().replace(/[\s-]+/g, "");
    const titlePageEnd = Math.max(
      1,
      ...nodes
        .filter((node) => node.id === "title-resolved" || node.role === "title")
        .map((node) => node.pageEnd),
    );
    const demotionPageLimit = Math.max(2, titlePageEnd);
    nodes = nodes.map((node) => {
      if (
        (node.role !== "paragraph" && node.role !== "title" && node.role !== "other") ||
        !node.text
      ) {
        return node;
      }
      if (node.id === "title-resolved") return node;
      if (node.pageStart > demotionPageLimit) return node;
      // Axis / matrix labels share vocabulary with titles but belong to tables.
      if (node.evidence.some((entry) =>
        entry.label === "axis-label-numeric-neighborhood" ||
        entry.label === "captioned-neighbor-cell-rows" ||
        entry.label === "captioned-native-multicell-row" ||
        entry.label === "table-row-geometry"
      )) {
        return node;
      }
      const t = node.text.replace(/\s+/g, " ").trim();
      if (t.length < 8 || t.length > 220) return node;
      if (!/[A-Za-z]/.test(t) || /[.!?]$/.test(t)) return node;
      // Keep journal DOI / volume tails out of this demotion path.
      if (publisherPredicates.isBmjCiteRail(t) || /\b(?:doi:|10\.\d{4,}\/)/i.test(t)) return node;
      const fragNorm = t.toLowerCase().replace(/[\s-]+/g, "");
      if (fragNorm.length < 8) return node;
      // Single dictionary words that happen to appear in the title are body
      // terms on page 1 as often as crumbs; require a multi-token or hyphen
      // fragment before demoting.
      const fragTokens = t.split(/\s+/).filter(Boolean);
      if (fragTokens.length === 1 && !/-/.test(t) && fragNorm.length < 18) return node;
      const coveredExact = titleNorm.includes(fragNorm);
      // Cite rails sometimes compress hyphen compounds
      // (`quasi-experimental pre-post` → `quasi-post`).
      const fragWords = t
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((w) => w.replace(/-/g, ""))
        .filter((w) => w.length >= 5);
      const coveredFuzzy =
        !coveredExact &&
        fragNorm.length >= 40 &&
        fragNorm.length <= titleNorm.length + 8 &&
        fragWords.filter((w) => titleNorm.includes(w)).length >=
          Math.max(4, Math.ceil(fragWords.length * 0.7));
      if (!coveredExact && !coveredFuzzy) return node;
      if (t.toLowerCase() === resolvedTitleText!.toLowerCase()) return node;
      return {
        ...node,
        // Hide in Reader the same way as publisher chrome (not body `other`).
        role: "copyright" as const,
        confidence: Math.min(node.confidence, 0.45),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "title-fragment-demotion",
            confidence: 0.9,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "title crumb already covered by resolved title",
          },
        ],
      };
    });
  }
  // BMJ Open / Frontiers box chrome often lands in the author role
  // (`STRENGTHS AND LIMITATIONS…`, `SPECIALTY SECTION`, letterspaced
  // `R E S E A R C H`) even after name projection filters it from
  // `paper.authors`.
  nodes = nodes.map((node) => {
    if (node.role !== "author" || !node.text) return node;
    const t = node.text.replace(/\s+/g, " ").trim();
    const letterspacedCompact = t.replace(/\s+/g, "");
    const letterspacedBanner =
      /^(?:[A-Z]\s+){3,}[A-Z](?:\s+(?:[A-Z]\s+){2,}[A-Z])*$/.test(t) &&
      letterspacedCompact.length >= 4 &&
      letterspacedCompact.length <= 24 &&
      /^(?:ORIGINAL|RESEARCH|ARTICLE|REVIEW|BRIEF|REPORT|LETTER|EDITORIAL|CLINICAL|SYSTEMATIC|INFO|ABSTRACT|KEYWORDS?|INTRODUCTION|METHODS?|RESULTS?|DISCUSSION|CONCLUSION|ACKNOWLEDGEMENTS?)+(?:OPENACCESS)?$/i.test(
        letterspacedCompact,
      );
    const chrome =
      /^(?:this study|strengths and limitations(?:\s+of\s+this\s+study)?)\b/i.test(t) ||
      /^to cite\s*:/i.test(t) ||
      (/^to cite\b/i.test(t) && /\babstract\b/i.test(t)) ||
      /^open access$/i.test(t) ||
      /^(?:edited by|reviewed by|approved by|specialty section)$/i.test(t) ||
      /^(?:for numbered affiliations see|correspondence to)\b/i.test(t) ||
      /^(?:abstract\s+)?corresponding\s+authors?\s*:?\s*$/i.test(t) ||
      /\b(?:creative\s+commons|attribution\s+license|cc-?by)\b/i.test(t) ||
      /^of\s+(?:the\s+)?(?:university|college|department|faculty|institute|nebraska|hospital|school)\b/i.test(t) ||
      publisherPredicates.isJurnalMasthead(t) ||
      /^(?:informasi\s+artikel(?:\s+abstract)?|email\s+abstrak|kata\s+kunci)\b/i.test(t) ||
      letterspacedBanner;
    if (!chrome) return node;
    return {
      ...node,
      role: "copyright" as const,
      confidence: Math.min(node.confidence, 0.5),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "publisher-author-chrome-demotion",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "publisher box chrome demoted from author role",
        },
      ],
    };
  });
  // Running publisher rails that survived layout as paragraph/other must not
  // reach Reader translation (chrome→other used to leave them visible).
  // Also catch bare `COPYRIGHT` / `Copyright:` labels that layout left as other.
  nodes = nodes.map((node) => {
    if (!node.text) return node;
    if (node.role === "copyright" || node.role === "header" || node.role === "footer") {
      return node;
    }
    const t = node.text.replace(/\s+/g, " ").trim();
    if (
      !/^copyright\s*:?\s*$/i.test(t) &&
      !/^copyright\s*(?:©|\(\s*\d{4}\s*\)|\d{4}\b)/i.test(t) &&
      !/^(?:©|protected by copyright|downloaded from|to cite\s*:)/i.test(t) &&
      !/\bprotected by copyright, including for uses related to text and data mining\b/i.test(t)
    ) {
      return node;
    }
    return {
      ...node,
      role: "copyright" as const,
      confidence: Math.min(node.confidence, 0.5),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "publisher-running-chrome",
          confidence: 0.92,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "publisher running chrome forced to copyright role",
        },
      ],
    };
  });
  // Springer mastheads often emit `1 University of …` as copyright. Promote
  // numbered institution bands back to affiliation so projection and tests
  // can find them.
  nodes = nodes.map((node) => {
    if (node.role !== "copyright" && node.role !== "other") return node;
    const t = (node.text ?? "").trim();
    if (!/^\d{1,2}\s+\S/.test(t)) return node;
    if (!/\b(?:university|department|school|faculty|college|hospital|centre|center|institute|laboratory)\b/i.test(t)) return node;
    if (/\b(?:accepted|published|©|copyright|vol\.?|issn)\b/i.test(t)) return node;
    return {
      ...node,
      role: "affiliation" as const,
      confidence: Math.max(node.confidence, 0.82),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "numbered-affiliation-band-promotion",
          confidence: 0.84,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "numbered institution band recovered from copyright/other",
        },
      ],
    };
  });
  // Publisher article-type banners / bare emails sometimes score as author.
  nodes = nodes.map((node) => {
    if (node.role !== "author" || !node.text) return node;
    const t = node.text.trim();
    const articleType = /^(?:original article|research article|review article|systematic review|brief report|case report|editorial|research highlight)\b/i.test(t);
    const bareEmail = /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?:\s*\([^)]*\))?$/i.test(t) ||
      (/@/.test(t) && t.split(/\s+/).length <= 6 && !/^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý])/u.test(t.replace(/[*†‡§\d,]/g, " ").trim()));
    if (!articleType && !bareEmail) return node;
    return {
      ...node,
      role: "other" as const,
      confidence: Math.min(node.confidence, 0.5),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: articleType ? "article-type-banner-demotion" : "email-author-demotion",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: articleType ? "article-type banner is not an author" : "email crumb is not an author",
        },
      ],
    };
  });
  // Standalone figure/table captions that scored as body paragraphs
  // (`TABLE 3 A summary of…`, `Fig. 2 Flow diagram of…`). Keep narrative
  // references (`Table 3 summarizes…`, `Figure 3 illustrates…`) as paragraphs.
  nodes = nodes.map((node) => {
    if (node.role !== "paragraph" || !node.text) return node;
    const t = node.text.replace(/\s+/g, " ").trim();
    if (t.length < 12 || t.length > 220) return node;
    if (!/^(?:(?:figure|fig\.?|table|表)\s*\d+[a-z]?(?:\s*\((?:continued|cont\.?)\))?)/i.test(t)) {
      return node;
    }
    if (
      /\b(?:illustrates?|summarizes?|maps?|shows?|presents?|depicts?|further\s+ranks?|reports?)\b/i.test(t)
    ) {
      return node;
    }
    return {
      ...node,
      role: "caption" as const,
      confidence: Math.max(node.confidence, 0.86),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "standalone-caption-promotion",
          confidence: 0.86,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "figure/table caption recovered from paragraph role",
        },
      ],
    };
  });
  // Layout sometimes paints body cross-refs as figure_caption
  // (`Figure 5 maps the distribution…`). Demote those back to paragraphs.
  nodes = nodes.map((node) => {
    if (node.role !== "caption" || !node.text) return node;
    const t = node.text.replace(/\s+/g, " ").trim();
    const narrative =
      /^(?:figure|fig\.?|table|表)\s*\d+[a-z]?\s+(?:maps?|shows?|illustrates?|presents?|summarizes?|depicts?|reports?|describes?|highlights?|provides?|compares?)\b/i.test(
        t,
      ) &&
      t.split(/\s+/).filter(Boolean).length >= 10;
    if (!narrative) return node;
    return {
      ...node,
      role: "paragraph" as const,
      confidence: Math.min(node.confidence, 0.62),
      evidence: [
        ...node.evidence,
        {
          source: "generic-heuristic" as const,
          label: "demoted-narrative-caption",
          confidence: 0.88,
          page: node.pageStart,
          bbox: node.boundingBoxes[0],
          reason: "in-text figure/table reference, not a caption",
        },
      ],
    };
  });
  // Caption promotion above can create bare `FIGURE N` / `Table N` labels after
  // the early continuation passes — merge their legends once more.
  nodes = mergeTableCaptionContinuations(nodes);
  nodes = mergeFigureCaptionContinuations(nodes);

  // Glued `Table 5Author 99…` crumbs: peel when the table number butts into a
  // Title-Case word (`5Author`), not panel letters (`Table 5a` / `Table 5A`).
  nodes = nodes.flatMap((node) => {
    if (
      (node.role !== "caption" && node.role !== "table" && node.role !== "paragraph") ||
      !node.text
    ) {
      return [node];
    }
    const t = node.text.replace(/\s+/g, " ").trim();
    // Require the title/cell tail to butt into the digits with no space
    // (`Table 5Author…`). A spaced legend (`Table 5 Results of…`) must stay
    // intact — `/i` alone would also treat `Results` as `[A-Z][a-z]`.
    const tight = t.match(/^(table|表)\s*(\d+)(\S[\s\S]+)$/i);
    if (!tight) return [node];
    const tailRaw = tight[3] ?? "";
    if (!/^[A-Z][a-z]/.test(tailRaw)) return [node];
    const captionText = `Table ${tight[2]}`;
    const tail = tailRaw.trim();
    if (tail.split(/\s+/).filter(Boolean).length < 2) return [node];
    return [
      {
        ...node,
        role: "caption" as const,
        text: captionText,
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: "peeled-glued-table-caption",
            confidence: 0.86,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "split Table N glued onto following cell text",
          },
        ],
      },
      {
        ...node,
        id: `${node.id}::glued-table-tail`,
        role: "table" as const,
        text: tail,
        confidence: Math.min(node.confidence, 0.7),
        evidence: [
          {
            source: "generic-heuristic" as const,
            label: "caption-bounded-table-cell",
            confidence: 0.8,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: "tail peeled from glued table caption",
          },
        ],
      },
    ];
  });
  // After captions exist, promote short SEM/score-table crumbs that never got
  // native table geometry so orphan-caption diagnostics clear.
  nodes = promoteCaptionBoundedTableCells(nodes);
  nodes = mergeAdjacentTableRows(nodes);
  nodes = collapseDenseShortProseGridTables(nodes);
  nodes = nodes.filter((node) => node.role !== "table" || Boolean((node.text ?? "").trim()));
  nodes = demoteRepeatedBareCaptions(nodes);
  nodes = annotateTablesFromCaptions(nodes);
  // Stacked d/dγ crumbs, lone √ glyphs, and superscript `[ 2]` fragments are
  // common native-PDF math failures; repair them before Reader projection.
  // mergeMathematicalDisplayFragments sanitizes eth/C0 first so numbered
  // displays like `… ð3Þ` promote; re-sanitize after merges for combined text.
  nodes = mergeMathematicalDisplayFragments(nodes);
  nodes = nodes.map((node) => sanitizeMathControls(node));
  // Math / table passes can reshuffle neighbors; re-merge bare `FIGURE N` +
  // legend paragraphs that were not adjacent during earlier caption passes.
  nodes = mergeFigureCaptionContinuations(nodes);
  nodes = mergeTableCaptionContinuations(nodes);

  const figureNodes = figureNodesForCaptions(candidates, input.regionEvidence ?? [], input.layouts);
  nodes = [...nodes, ...figureNodes];
  // Standalone-promoted figure captions (`FIGURE 3(a)…`) never pass through
  // layout `figure_caption` shells. Add a same-page figure shell so captions
  // are not left orphaned when the page has only image/vector content.
  nodes = (() => {
    const extras: CanonicalNode[] = [];
    let shellIndex = 0;
    for (const caption of nodes) {
      if (caption.role !== "caption" || !caption.text) continue;
      if (!/^(?:figure|fig\.?|図)\s*\d+/i.test(caption.text.trim())) continue;
      const hasOwner = nodes.some(
        (node) =>
          node.pageStart === caption.pageStart &&
          (node.role === "figure" || node.role === "table"),
      );
      if (hasOwner) continue;
      const box = caption.boundingBoxes[0];
      const shellBox = box
        ? {
            ...box,
            y: Math.max(0, box.y - Math.min(160, Math.max(40, box.height * 6))),
            height: Math.min(160, Math.max(40, box.height * 6)),
          }
        : undefined;
      extras.push({
        id: `fig-shell-${shellIndex++}`,
        role: "figure",
        text: null,
        pageStart: caption.pageStart,
        pageEnd: caption.pageEnd,
        boundingBoxes: shellBox ? [shellBox] : [...caption.boundingBoxes],
        confidence: 0.66,
        evidence: [
          {
            source: "generic-heuristic" as const,
            label: "caption-anchored-figure-shell",
            confidence: 0.66,
            page: caption.pageStart,
            bbox: shellBox ?? caption.boundingBoxes[0],
            reason: "figure shell for promoted caption without layout figure_caption",
          },
        ],
        sourceAnchor: {
          page: caption.pageStart,
          boundingBoxes: shellBox ? [shellBox] : [...caption.boundingBoxes],
        },
      });
    }
    return extras.length > 0 ? [...nodes, ...extras] : nodes;
  })();

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
