import type { CanonicalNode } from "../canonical/types";
import type { ExtractionEvidence } from "../types";

/** Lone PDF glyph crumbs that belong inside nearby prose or a display formula. */
export function isInlineMathGlyphCrumb(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 8) return false;
  if (/^[√∫∑∏∂∆∇∞±×÷‖|]$/u.test(t)) return true;
  // Single Greek / Latin math letter (often a broken superscript or accent).
  if (/^[α-ωΑ-Ωεϵϑϕϖϱϰ]$/u.test(t)) return true;
  return false;
}

/** Stacked fraction numerator/denominator crumbs next to a display equation. */
export function isDerivativeStackCrumb(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 8) return false;
  if (/^[d∂]\s*$/u.test(t)) return true;
  // `dγ`, `dx`, `dθ`, `dt` under a stacked derivative.
  if (/^d[a-zα-ωγθϕψ]\s*$/iu.test(t)) return true;
  return false;
}

/** Norm / power superscripts emitted as bracket crumbs (`[ 2]`, `[ ∗ 2]`). */
export function isSuperscriptBracketCrumb(text: string): boolean {
  return /^\[\s*[*∗]?\s*\d{1,2}\s*\]$/.test(text.trim());
}

/** Trailing underbrace / arg-min debris (`γ,γ)`). */
export function isOrphanMathTailCrumb(text: string): boolean {
  const t = text.trim();
  if (t.length > 16) return false;
  return /^[A-Za-zα-ωΑ-Ω]{1,4}\s*,\s*[A-Za-zα-ωΑ-Ω]{1,4}\)\s*$/u.test(t);
}

function hasEquationNumber(text: string): boolean {
  // Allow a short orphan tail after the number (`…[x] (3) γ,γ)`).
  return /\(\s*\d{1,2}[a-z]?\s*\)(?:\s*$|\s+\S{1,12}\s*$)/.test(text.trim());
}

function looksLikeDisplayMathBody(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 8) return false;
  const math =
    (t.match(/[=≡≈≠≤≥∑∫√∞±×÷∂∇∈∉∪∩→←↦‖|α-ωΑ-Ω]/gu) ?? []).length +
    (/\b(?:mmse|arg\s*min|DKL|KL|E[px]|Var)\b/i.test(t) ? 2 : 0);
  const prose = (t.match(/\b(?:the|and|for|with|from|this|that|which|here|when)\b/gi) ?? [])
    .length;
  return math >= 2 && prose <= 2;
}

function boxY(node: CanonicalNode): number {
  return node.boundingBoxes[0]?.y ?? 0;
}

function boxX(node: CanonicalNode): number {
  return node.boundingBoxes[0]?.x ?? 0;
}

function boxRight(node: CanonicalNode): number {
  const box = node.boundingBoxes[0];
  return box ? box.x + box.width : 0;
}

function evidence(
  node: CanonicalNode,
  label: string,
  reason: string,
  confidence = 0.9,
): ExtractionEvidence {
  return {
    source: "generic-heuristic",
    label,
    confidence,
    page: node.pageStart,
    bbox: node.boundingBoxes[0],
    reason,
  };
}

function joinText(left: string, right: string, sep = " "): string {
  const a = left.replace(/\s+/g, " ").trim();
  const b = right.replace(/\s+/g, " ").trim();
  if (!a) return b;
  if (!b) return a;
  if (sep === "" || /[⁄/]$/.test(a) || /^[⁄/]/.test(b)) return `${a}${b}`;
  return `${a}${sep}${b}`;
}

/** Place a power marker on the closing norm bar, or just before `(n)`. */
function attachSuperscript(body: string, marker: string): string {
  const text = body.trim();
  // Avoid duplicating an existing power on the closing norm (`‖…‖2` / `‖…‖²`).
  if (/‖[^‖]+‖[²2²³]/.test(text) || /‖[^‖]+‖\s*\^\s*\d/.test(text)) {
    return text.replace(/‖([^‖]+)‖\s*[2²]/, `‖$1‖${marker}`);
  }
  if (/‖[^‖]+‖/.test(text)) {
    return text.replace(/(‖[^‖]+)‖/, `$1‖${marker}`);
  }
  if (/\(\s*\d{1,2}[a-z]?\s*\)\s*$/.test(text)) {
    return text.replace(/\s*(\(\s*\d{1,2}[a-z]?\s*\)\s*$)/, `${marker} $1`).replace(`${marker} (`, `${marker}(`);
  }
  return `${text}${marker}`;
}

function mergeNodes(
  primary: CanonicalNode,
  extras: CanonicalNode[],
  role: CanonicalNode["role"],
  text: string,
  label: string,
  reason: string,
): CanonicalNode {
  const boxes = [primary, ...extras].flatMap((node) => node.boundingBoxes);
  const pageStart = Math.min(primary.pageStart, ...extras.map((node) => node.pageStart));
  const pageEnd = Math.max(primary.pageEnd, ...extras.map((node) => node.pageEnd));
  return {
    ...primary,
    role,
    text,
    pageStart,
    pageEnd,
    boundingBoxes: boxes,
    confidence: Math.min(primary.confidence, ...extras.map((node) => node.confidence), 0.92),
    evidence: [
      ...primary.evidence,
      ...extras.flatMap((node) => node.evidence),
      evidence(primary, label, reason),
    ],
    sourceAnchor: {
      ...primary.sourceAnchor,
      page: pageStart,
      boundingBoxes: boxes,
    },
  };
}

/**
 * Repair common native-PDF math fragmentation before Reader projection:
 * stacked d/dγ crumbs, lone √ glyphs, superscript `[ 2]`, and short orphan tails.
 * Does not invent equation–number relations without an explicit `(n)` in the text.
 */
export function mergeMathematicalDisplayFragments(nodes: CanonicalNode[]): CanonicalNode[] {
  if (nodes.length < 2) return nodes.map(sanitizeMathControls);

  const consumed = new Set<string>();
  const result: CanonicalNode[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (consumed.has(node.id)) continue;
    const next = nodes[index + 1];
    const mid = next;
    const den = nodes[index + 2];

    // Stacked derivative: `d` + display body + `dγ` → one equation.
    if (
      mid &&
      den &&
      !consumed.has(mid.id) &&
      !consumed.has(den.id) &&
      node.pageStart === mid.pageStart &&
      mid.pageStart === den.pageStart &&
      isDerivativeStackCrumb(node.text ?? "") &&
      /^[d∂]\s*$/u.test((node.text ?? "").trim()) &&
      isDerivativeStackCrumb(den.text ?? "") &&
      /^d/i.test((den.text ?? "").trim()) &&
      (mid.role === "equation" || looksLikeDisplayMathBody(mid.text ?? "")) &&
      hasEquationNumber(mid.text ?? "") &&
      boxY(mid) >= boxY(node) - 2 &&
      boxY(den) >= boxY(mid) - 2 &&
      boxY(den) - boxY(node) <= 48 &&
      Math.abs(boxX(node) - boxX(den)) <= 24
    ) {
      const numerator = (node.text ?? "").trim();
      const denominator = (den.text ?? "").trim().replace(/\s+/g, "");
      const body = (mid.text ?? "").trim();
      // Prefer `d/dγ body` without duplicating a leading `d` already on the body.
      const strippedBody = body.replace(/^[d∂]\s+/u, "").trim();
      const text = joinText(`${numerator}/${denominator}`, strippedBody);
      result.push(
        mergeNodes(mid, [node, den], "equation", text, "stacked-derivative-merge", "stacked d/d· crumbs merged into numbered display equation"),
      );
      consumed.add(node.id);
      consumed.add(mid.id);
      consumed.add(den.id);
      continue;
    }

    // Lone inline glyph immediately before a math-bearing paragraph.
    if (
      next &&
      !consumed.has(next.id) &&
      node.pageStart === next.pageStart &&
      isInlineMathGlyphCrumb(node.text ?? "") &&
      (next.role === "paragraph" || next.role === "equation") &&
      (next.text ?? "").trim().length >= 12 &&
      boxY(next) - boxY(node) <= 18 &&
      boxY(next) + 2 >= boxY(node) &&
      boxX(node) >= boxX(next) - 8 &&
      boxX(node) <= boxRight(next) + 24
    ) {
      const glyph = (node.text ?? "").trim();
      const body = (next.text ?? "").trim();
      // Prefer attaching √ immediately before a Greek / SNR token when present.
      const attached = /^(?:γ|ε|ϵ|x|z|σ)/u.test(body)
        ? `${glyph}${body}`
        : joinText(glyph, body);
      result.push(
        mergeNodes(
          next,
          [node],
          next.role === "equation" ? "equation" : "paragraph",
          attached,
          "inline-math-glyph-merge",
          "inline math glyph reattached to following paragraph",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

    // Superscript bracket crumb immediately before a numbered display formula
    // (`[ 2]` then `mmse(γ) ≡ … ‖·‖ . (2)`).
    if (
      next &&
      !consumed.has(next.id) &&
      isSuperscriptBracketCrumb(node.text ?? "") &&
      node.pageStart === next.pageStart &&
      (next.role === "equation" || looksLikeDisplayMathBody(next.text ?? "")) &&
      hasEquationNumber(next.text ?? "") &&
      boxY(next) - boxY(node) <= 24 &&
      Math.abs(boxX(node) - boxX(next)) <= 280
    ) {
      const power = (node.text ?? "").trim().match(/^\[\s*[*∗]?\s*(\d{1,2})\s*\]$/)?.[1] ?? "2";
      const marker = power === "2" ? "²" : `^${power}`;
      result.push(
        mergeNodes(
          next,
          [node],
          "equation",
          attachSuperscript(next.text ?? "", marker),
          "superscript-bracket-merge",
          "norm/power superscript bracket absorbed into following formula",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

    // Superscript bracket / orphan tail after an equation or math paragraph.
    if (
      (isSuperscriptBracketCrumb(node.text ?? "") || isOrphanMathTailCrumb(node.text ?? "")) &&
      result.length > 0
    ) {
      const prev = result[result.length - 1]!;
      if (
        prev.pageStart === node.pageStart &&
        (prev.role === "equation" ||
          (prev.role === "paragraph" && looksLikeDisplayMathBody(prev.text ?? ""))) &&
        boxY(node) - boxY(prev) <= 36 &&
        Math.abs(boxX(node) - boxX(prev)) <= 280
      ) {
        const crumb = (node.text ?? "").trim();
        const power = crumb.match(/^\[\s*[*∗]?\s*(\d{1,2})\s*\]$/)?.[1];
        const marker = power === "2" ? "²" : power ? `^${power}` : "";
        const mergedText = power
          ? attachSuperscript(prev.text ?? "", marker)
          : joinText(prev.text ?? "", crumb, "");
        result[result.length - 1] = mergeNodes(
          prev,
          [node],
          prev.role === "equation" || hasEquationNumber(prev.text ?? "") ? "equation" : prev.role,
          mergedText,
          power ? "superscript-bracket-merge" : "orphan-math-tail-merge",
          power
            ? "norm/power superscript bracket absorbed into preceding formula"
            : "orphan math tail absorbed into preceding formula",
        );
        consumed.add(node.id);
        continue;
      }
    }

    // Promote intact numbered display formulas that scored as paragraph.
    if (
      (node.role === "paragraph" || node.role === "other") &&
      hasEquationNumber(node.text ?? "") &&
      looksLikeDisplayMathBody(node.text ?? "") &&
      (node.text ?? "").trim().split(/\s+/).length <= 40
    ) {
      result.push({
        ...sanitizeMathControls(node),
        role: "equation",
        evidence: [
          ...node.evidence,
          evidence(node, "numbered-display-equation", "numbered symbolic display promoted to equation"),
        ],
      });
      continue;
    }

    // Bracket crumbs must not remain as tables.
    if (
      (node.role === "table" || node.role === "other") &&
      isSuperscriptBracketCrumb(node.text ?? "")
    ) {
      result.push({
        ...sanitizeMathControls(node),
        role: "other",
        confidence: Math.min(node.confidence, 0.4),
        evidence: [
          ...node.evidence,
          evidence(node, "superscript-bracket-demotion", "bracket power crumb is not a table"),
        ],
      });
      continue;
    }

    result.push(node);
  }

  return result.map(sanitizeMathControls);
}

/** Replace C0 controls that PDF fonts misuse as math letters (ε ≈ SI). */
export function sanitizeMathControls(node: CanonicalNode): CanonicalNode {
  if (!node.text || !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(node.text)) {
    return node;
  }
  const mathContext =
    /[=+∼~‖|α-ωΑ-Ω√∫∑]|N\s*\(|mmse|DKL|SNR/i.test(node.text) ||
    node.role === "equation";
  if (!mathContext) return node;
  const cleaned = node.text
    // SI / SO often stand in for ε in broken ToUnicode maps on math PDFs.
    .replace(/\u000e|\u000f/g, "ε")
    .replace(/[\u0000-\u0008\u000b\u000c\u0010-\u001f]/g, "");
  if (cleaned === node.text) return node;
  return {
    ...node,
    text: cleaned,
    evidence: [
      ...node.evidence,
      evidence(node, "math-control-sanitize", "C0 control glyphs normalized in math context", 0.8),
    ],
  };
}
