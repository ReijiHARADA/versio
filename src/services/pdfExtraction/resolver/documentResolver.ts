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
  const symbolicFormula =
    ((candidate.text.match(/[=∈∉∪∩∑∏√∞≤≥≈≠→←↦{}|]/gu) ?? []).length >= 4 &&
      (candidate.text.match(/[A-Za-z]{3,}/g) ?? []).length <= 6) ||
    (/^(?:d\s*[A-ZΑ-Ω\[]|d\[[A-Za-z]+\]|[A-Za-z][\w,+()]*\s*=)/.test(candidate.text.trim()) &&
      candidate.text.trim().split(/\s+/).filter(Boolean).length <= 14 &&
      (/=/.test(candidate.text) || /^d\s*[A-ZΑ-Ω\[]/.test(candidate.text.trim())));
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
  if (
    candidate.role !== "title" &&
    candidate.role !== "caption" &&
    candidate.layoutBlock.role !== "figure_caption" &&
    candidate.layoutBlock.role !== "table_caption" &&
    (candidate.roleScores.caption ?? 0) < 0.85 &&
    vectorFigureLabels && vectorFigureLabels.confidence >= 0.82 &&
    (candidate.roleScores.table ?? 0) < 0.8 &&
    !(captionedNativeMulticell && captionedNativeMulticell.confidence >= 0.9) &&
    !looksLikeSentenceProse(candidate.text)
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
  if (
    imageLabelEvidence &&
    candidate.role !== "caption" &&
    candidate.layoutBlock.role !== "figure_caption" &&
    candidate.layoutBlock.role !== "table_caption" &&
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

const ABSTRACT_STOP_RAIL =
  /^(?:keywords?|key words?|index terms?|kata kunci|how to cite|citation)\s*:/i;
// Body section starts — not Cureus-style `Methods:` / `Results:` abstract bands
// (those keep a trailing colon and must stay inside the abstract).
const SECTION_INTRO =
  /^(?:[IVXLCDM]+\.\s+)?(?:\d+\.\s*)?(?:introduction|methods?|materials|results?|discussion|background|related\s+work)\b(?!\s*:)/i;

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
  return nodes.map((node) => {
    if (node.role !== "heading" || !node.text) return node;
    const t = node.text.trim();
    const editorialLabel =
      /^(?:\*?correspondence|edited by|reviewed by|open access|citation|copyright|keywords?|index terms?|published|received|revised|accepted)\s*:?\s*$/i.test(t) ||
      // Keyword / index rails with payload (`Keywords: information visualization, …`).
      /^(?:keywords?|index terms?|ccs concepts)\s*:\s*\S/i.test(t) ||
      /^(?:received|revised|accepted|published)\b/i.test(t) && (t.length <= 48 || /\bpeer review\b/i.test(t)) ||
      /^(?:published:\s*)?peer review history\b/i.test(t) ||
      /^(?:\d{1,2}\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}$/i.test(t) ||
      /^(?:competing interests|research ethics|ethics approval|acknowledgements?|funding|data availability(?:\s+statement)?|declaration of generative ai)\b/i.test(t) ||
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
      /^(?:research\s+)?article(?:\s+[a-z]{1,3})?$/i.test(t) ||
      /^(?:brief\s+)?(?:communication|report)$/i.test(t) ||
      /^(?:review\s+article|original\s+article|research\s+paper)$/i.test(t) ||
      // Frontiers running footers (`11 frontiersin.org`).
      /^(?:\d{1,3}\s+)?frontiersin\.org$/i.test(t);
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
    const titleCaseDense =
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
    const statCrumbHeading =
      /^\d+(?:\.\d+)?\s*[A-Za-z]{1,3}$/.test(t) ||
      /^\d+\.\d{2}\s+[A-Z]$/.test(t) ||
      (/<\s*0?\.\d+/.test(t) &&
        (t.match(/<\s*0?\.\d+/g) ?? []).length >= 1 &&
        (/^\d/.test(t) || (t.match(/<\s*0?\.\d+/g) ?? []).length >= 2) &&
        words <= 14 &&
        !/^\d+(?:\.\d+)+\s+[A-Za-z]/.test(t));
    const mathOrTableCrumb =
      /[∑∫≤≥≠≈]/.test(t) ||
      /^\(?SOTA\)/i.test(t) ||
      /^number of true/i.test(t) ||
      // ODE / assignment fragments (`d[PTH]`, `cACE = …`, `= kVIP · …`, `0 = L · konR1`).
      (/^(?:=\s|\d+\s*=|d\s*[A-ZΑ-Ω\[]|d\[[A-Za-z]+\]|[A-Za-z][+*]?(?:\s+\S+){0,8}\s*=)/.test(t) &&
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
      !mathOrTableCrumb &&
      !runningAuthorHeader &&
      !journalTypeRail &&
      !degreeAffiliationHeading &&
      !geoChromeHeading &&
      !titleCaseDense &&
      !statCrumbHeading
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
      statCrumbHeading;
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
    const text = (node.text ?? "").trim();
    if (node.role === "heading" && /^(?:abstract|abstrak|要旨)\s*:?\s*$/i.test(text)) {
      inAbstract = true;
      return node;
    }
    // Inline labels (`Abstract. Nowadays…` / `Abstrak. Saat ini…`) are often
    // paragraphs, not bare headings. Promote the labelled body and keep
    // collecting until Keywords / the next section.
    if (
      (node.role === "paragraph" || node.role === "other") &&
      /^(?:abstract|abstrak|要旨)\s*[.:：]/i.test(text) &&
      text.length >= 40
    ) {
      inAbstract = true;
      return { ...node, role: "abstract" as const };
    }
    if (node.role === "heading") {
      inAbstract = false;
      return node;
    }
    // Keywords / how-to-cite rails often arrive as paragraphs, not headings.
    if (inAbstract && ABSTRACT_STOP_RAIL.test(text)) {
      inAbstract = false;
      return node;
    }
    // Two-column covers can leak the next section lead into the abstract band
    // (`… English Language 1. Introduction`). Stop before promoting that prose.
    if (inAbstract && (/\b1\.\s*introduction\b/i.test(text) || SECTION_INTRO.test(text))) {
      inAbstract = false;
      return node;
    }
    if (inAbstract && node.role === "paragraph") {
      return { ...node, role: "abstract" };
    }
    return node;
  });
}

/**
 * IEEE ACCESS and similar templates omit an `Abstract` heading: the body sits
 * between the grant/affiliation band and INDEX TERMS / I. INTRODUCTION.
 * Promote only when page 1 still has no abstract node.
 */
function markUnlabeledFrontAbstracts(nodes: CanonicalNode[]): CanonicalNode[] {
  if (nodes.some((node) => node.role === "abstract" && node.pageStart === 1)) {
    return nodes;
  }
  const titleY =
    nodes.find((node) => node.role === "title" && node.pageStart === 1)?.boundingBoxes[0]?.y ?? 0;
  const stopY = nodes
    .filter((node) => node.pageStart === 1 && node.text)
    .filter((node) => {
      const text = node.text!.trim();
      return (
        ABSTRACT_STOP_RAIL.test(text) ||
        SECTION_INTRO.test(text) ||
        /^(?:keywords?|key words?|index terms?)\b/i.test(text) && text.split(/,/).length >= 3
      );
    })
    .map((node) => node.boundingBoxes[0]?.y ?? Infinity)
    .sort((a, b) => a - b)[0] ?? Infinity;
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
    if (looksLikeKeywordRail(trimmed) || SECTION_INTRO.test(trimmed)) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length >= 35 && /[.!?]\s/.test(trimmed);
  };

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

/**
 * Native streams often slice one abstract into several same-column paragraphs.
 * Join unfinished → continuation pairs so Reader/translation see one unit.
 */
function mergeAbstractContinuations(nodes: CanonicalNode[]): CanonicalNode[] {
  const result: CanonicalNode[] = [];
  for (const node of nodes) {
    // Two-column covers can interleave a title node between abstract slices
    // in reading order. Look back to the latest same-page abstract rather
    // than requiring strict adjacency in the node list.
    const previousIndex =
      node.role === "abstract"
        ? result.findLastIndex(
            (candidate) => candidate.role === "abstract" && candidate.pageStart === node.pageStart,
          )
        : -1;
    const previous = previousIndex >= 0 ? result[previousIndex] : null;
    const intervening = previousIndex >= 0 ? result.slice(previousIndex + 1) : [];
    const blocked = intervening.some(
      (candidate) =>
        (candidate.role === "heading" &&
          /^(?:keywords?|key words?|introduction|methods?|results?|discussion)\b/i.test(
            (candidate.text ?? "").trim(),
          )) ||
        candidate.role === "author" ||
        candidate.role === "affiliation",
    );
    if (previous && node.role === "abstract" && !blocked && previous.text && node.text) {
      const prevBox = previous.boundingBoxes[previous.boundingBoxes.length - 1];
      const nodeBox = node.boundingBoxes[0];
      const prevText = previous.text.trim();
      const nextText = node.text.trim();
      const unfinished =
        !/[.!?。！？]\s*$/.test(prevText) ||
        /^[a-zà-öø-ÿ]/.test(nextText) ||
        (/[A-Za-z]$/.test(prevText) && /^[a-z]/.test(nextText));
      // Cureus / structured abstracts keep each band sentence-final, so the
      // unfinished check alone would leave Background/Methods/Results/Conclusions
      // as four abstract nodes. Merge those label-led siblings while they stay
      // on the same page column.
      const structuredLabel =
        /^(?:background|methods?|materials(?:\s+and\s+methods)?|results?|conclusions?|objectives?|purpose|aims?|findings?)\s*:/i;
      const structuredContinuation =
        structuredLabel.test(nextText) &&
        (structuredLabel.test(prevText) || /[.!?。！？]\s*$/.test(prevText));
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
      if (
        (unfinished || structuredContinuation) &&
        gap >= -4 &&
        gap <= mergeGapLimit &&
        xAligned &&
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
  return result;
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

function isNumberedTableCaptionText(text: string | null | undefined): boolean {
  return /^(?:table|表)\s*\d+/i.test((text ?? "").trim());
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
    entry.label === "page-native-grid"
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
      if (gap >= -line * 3.5 && gap <= line * 4.2) {
        const intervening = result.slice(anchorIndex + 1);
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
    entry.label === "matrix-axis-label-neighbor"
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
      if (gap >= -line * 4 && gap <= Math.max(line * 7.5, 96) && xCompatible) {
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
  nodes = promoteRotatedTableCaptions(nodes, candidates);
  nodes = splitInlineSectionLabels(nodes);
  nodes = demotePageOneAuthorHeadings(nodes);
  nodes = promoteMislabelledSectionAuthors(nodes);
  nodes = markAbstracts(nodes);
  nodes = markUnlabeledFrontAbstracts(nodes);
  nodes = mergeAbstractContinuations(nodes);
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
    nodes = nodes.map((node) => {
      if (node === titleNode || node.role !== "title" || !node.text) return node;
      const fragment = node.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (!fragment) return node;
      const isSuffixOrCopy =
        fragment === normalizedResolved ||
        normalizedResolved.endsWith(fragment) ||
        normalizedResolved.startsWith(fragment);
      // Exact duplicates / wrap fragments, and rival drop-cap body lines that
      // lost the title race (`Tcase incidence reports…`), must not stay titles.
      return {
        ...node,
        role: (isSuffixOrCopy ? "other" : "paragraph") as "other" | "paragraph",
        confidence: Math.min(node.confidence, 0.5),
        evidence: [
          ...node.evidence,
          {
            source: "generic-heuristic" as const,
            label: isSuffixOrCopy ? "duplicate-title-fragment-demotion" : "rival-title-demotion",
            confidence: 0.85,
            page: node.pageStart,
            bbox: node.boundingBoxes[0],
            reason: isSuffixOrCopy
              ? "title fragment is a suffix or copy of the resolved title"
              : "second title node lost the resolver race",
          },
        ],
      };
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
    const articleType = /^(?:original article|research article|review article|systematic review|brief report|case report|editorial)\b/i.test(t);
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

  const figureNodes = figureNodesForCaptions(candidates, input.regionEvidence ?? [], input.layouts);
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
