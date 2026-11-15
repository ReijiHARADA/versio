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

/**
 * Operator-index crumbs painted under min/max/∑ (`i`, `i i`). Consume without
 * inventing a `_i` rewrite when placement is ambiguous across two operators.
 */
export function isOrphanOperatorIndexCrumb(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 12) return false;
  return /^[ijknm](?:\s+[ijknm]){0,3}$/u.test(t);
}

function hasEquationNumber(text: string): boolean {
  // Allow a short orphan tail after the number (`…[x] (3) γ,γ)`), or a
  // linearized stacked-derivative suffix (`… (4) dγ ∫`).
  return /\(\s*\d{1,2}[a-z]?\s*\)(?:\s*$|\s+(?:d[γΓg](?:\s*∫)?|[^\s]{1,12})\s*$)/u.test(
    text.trim(),
  );
}

/** Bare display equation numbers painted as their own block (`(21)`). */
export function isBareEquationNumber(text: string): boolean {
  // `(0)` is almost always a tensor/layer superscript (`h(0)`), not a display number.
  return /^\(\s*[1-9]\d?[a-z]?\s*\)$/.test(text.trim());
}

/** Summation index + number painted under a display (`i (1)`). */
export function isIndexedEquationNumber(text: string): boolean {
  return /^[a-zα-ω]\s*\(\s*[1-9]\d?[a-z]?\s*\)$/iu.test(text.trim());
}

/** Single-line display math, including formulas mis-tagged as table cells. */
function isDisplayMathCandidate(node: CanonicalNode): boolean {
  const t = (node.text ?? "").trim();
  if (!t || /\n/.test(t)) return false;
  if (node.role === "equation") return true;
  if (
    (node.role === "paragraph" ||
      node.role === "table" ||
      node.role === "other" ||
      node.role === "heading" ||
      node.role === "footnote") &&
    (looksLikeDisplayMathBody(t) || looksLikeCasesDisplay(t))
  ) {
    return true;
  }
  return false;
}

function findBareNumberMergeTarget(
  result: CanonicalNode[],
  node: CanonicalNode,
): number {
  // Two-column reading order interleaves left/right blocks, so a sequential
  // "break on tall dy / prose" walk can stop before the true same-baseline
  // body. Score geometrically over a short same-page window instead.
  let best = -1;
  let bestScore = Infinity;
  const windowStart = Math.max(0, result.length - 14);
  for (let i = result.length - 1; i >= windowStart; i -= 1) {
    const prev = result[i]!;
    if (prev.pageStart !== node.pageStart) break;
    const prevText = (prev.text ?? "").trim();
    if (!prevText) continue;
    if (hasEquationNumber(prevText)) continue;
    if (!isDisplayMathCandidate(prev)) continue;
    const casesPrev = looksLikeCasesDisplay(prevText);
    const dy = boxY(node) - boxY(prev);
    if (dy < -10 || dy > (casesPrev ? 72 : 48)) continue;
    const alignedRight =
      boxX(node) + 8 >= boxRight(prev) - 40 || Math.abs(boxY(node) - boxY(prev)) <= 22;
    const casesCentered =
      casesPrev &&
      Math.abs(boxX(node) - (boxX(prev) + (prev.boundingBoxes[0]?.width ?? 0) / 2)) <= 120;
    if (!alignedRight && !casesCentered) continue;
    // Prefer same baseline, then the nearest body to the left of the number.
    const score =
      Math.abs(dy) * 1000 + Math.max(0, boxX(node) - boxRight(prev)) + (result.length - 1 - i);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function looksLikeCasesDisplay(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || t.length > 400) return false;
  // Native PDF cases braces / piecewise reward definitions.
  if (/[⎧⎨⎩]/.test(t)) return true;
  if (/\bif\b/i.test(t) && /[-–]?\d+(?:\.\d+)?/.test(t) && (t.match(/\bif\b/gi) ?? []).length >= 2) {
    return true;
  }
  return false;
}

/** CN2 / decision-tree comparison crumbs mistaken for display math. */
function looksLikeRuleDebrisMath(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 96) return false;
  if (/^[≥≤=≠∼~\s]+$/.test(t)) return true;
  if (/^[≥≤=≠]+/.test(t) && /\bAND\b/i.test(t)) return true;
  if (/^(?:≥|≤|=){1,3}\s*(?:yes|no)\b/i.test(t)) return true;
  return false;
}

/**
 * Stacked fractions linearized as juxtaposed function calls without `=` /
 * `/` (`d(site(II),…) + d(…) d(…) d(…)`). Same head identifier ≥3 times,
 * no sentence prose — strong enough for bare-(n) lookback, not for inventing
 * a missing equation number.
 */
function looksLikeStackedFunctionFraction(text: string): boolean {
  const t = text.trim();
  if (t.length < 24 || t.length > 280) return false;
  if (/\n/.test(t)) return false;
  const prose = (
    t.match(
      /\b(?:the|and|for|with|from|this|that|which|here|when|where|denotes|between)\b/gi,
    ) ?? []
  ).length;
  if (prose > 0) return false;
  const calls = t.match(/\b[A-Za-z][A-Za-z0-9]{0,7}\s*\(/g) ?? [];
  if (calls.length < 3) return false;
  const freq = new Map<string, number>();
  for (const call of calls) {
    const head = call.replace(/\s*\($/, "").toLowerCase();
    freq.set(head, (freq.get(head) ?? 0) + 1);
  }
  const max = Math.max(...freq.values());
  // Prefer a repeated head (`d(` ×4). Allow mixed heads only when dense.
  return max >= 3 || (calls.length >= 5 && max >= 2);
}

function looksLikeDisplayMathBody(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 8) return false;
  if (looksLikeCasesDisplay(t)) return true;
  if (looksLikeStackedFunctionFraction(t)) return true;
  const math =
    // Include ‖/∥ norms, ∏ products, and ∣ (U+2223) divides bars from pdf.js.
    (t.match(/[=≡≈≠≤≥∼~∑∏∫√∞±×÷+\-−–—⊕⊗⊙∂∇∈∉∪∩→←↦‖∥|∣α-ωΑ-Ω⋅·]/gu) ?? []).length +
    (/\b(?:mmse|arg\s*min|DKL|KL|E[px]|Var|exp|Softmax|SmoothL1)\b/i.test(t) ? 2 : 0) +
    // Dimensionality comparisons often lose the ≤ glyph to a C0 stand-in.
    ((t.match(/\bdim\s*\(/gi) ?? []).length >= 2 ? 2 : 0) +
    // Numbered displays often have a single relation (`yˆ = g(…) (2)`,
    // `f : S → ˆI (13)`, `Pe ≥ (15)`, `× exp(…) (4)`, `y ∼ P(…) (7)`).
    (hasEquationNumber(t) && /[=≡≈≠≤≥∼~→←↦∈∋⊂⊃×÷±]/.test(t) ? 1 : 0);
  const prose = (t.match(/\b(?:the|and|for|with|from|this|that|which|here|when)\b/gi) ?? [])
    .length;
  return math >= 2 && prose <= 2;
}

/**
 * Some publishers put prose labels under a display with underbraces. pdf.js
 * returns those labels on the same native line as the formula, which makes the
 * otherwise valid numbered expression look too long for the normal compact
 * display guard. The decorations are layout, not body prose: keep the entire
 * source string, but let the structure resolver retain it as one equation.
 */
function isDecoratedNumberedDisplay(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /\(\s*\d{1,2}[a-z]?\s*\)/u.test(t) &&
    /[︸︷]/u.test(t) &&
    /[=≡≈≠≤≥∼~∑∏∫√∞±×÷+\-−–—⊕⊗⊙∂∇∈∉∪∩→←↦‖∥|∣]/u.test(t) &&
    t.length <= 720;
}

function boxY(node: CanonicalNode): number {
  return node.boundingBoxes[0]?.y ?? 0;
}

function lastBoxY(node: CanonicalNode): number {
  return Math.max(...node.boundingBoxes.map((box) => box.y), boxY(node));
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

/** A short row printed below an integral is commonly its stacked denominator. */
function isStackedDenominatorCrumb(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length > 40 || /[.!?;:]/.test(t)) return false;
  if (/\b(?:the|and|for|with|from|this|that|where)\b/i.test(t)) return false;
  // Do not pull ordinary numeric prose or equation numbers into a neighbour.
  if (/^\(\s*\d{1,2}[a-z]?\s*\)$/.test(t)) return false;
  return /^[0-9A-Za-zα-ωΑ-Ω\s()+\-−=/.]+$/u.test(t) &&
    (/[α-ωΑ-Ω]/u.test(t) || /[+\-−/]/.test(t) || /\d/.test(t));
}

/** A display derivation often paints each algebraic continuation as a node. */
function isAlignedDisplayContinuation(text: string): boolean {
  return /^(?:[=≡≈≤≥+＋−-]|\\(?:quad|qquad|displaystyle|left|right)\b)/u.test(text.replace(/^\s+/u, ""));
}

function isMathDisplayInterstice(node: CanonicalNode): boolean {
  const text = (node.text ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 120 || /[.!?;:]/u.test(text)) return false;
  if (/\b(?:the|and|for|with|from|this|that|where|which|we|our)\b/i.test(text)) return false;
  const proseWords = text.match(/[A-Za-z]{4,}/g) ?? [];
  return proseWords.length <= 1 && /[=+＋−\-−∫∑∏√γΓεδλμσπρτθζξ[\](){}|]/u.test(text);
}

function alignedContinuationTarget(result: CanonicalNode[], node: CanonicalNode): { targetIndex: number; target: CanonicalNode; interstice: CanonicalNode[] } | null {
  if (node.role !== "equation" || !isAlignedDisplayContinuation(node.text ?? "")) return null;
  const interstice: CanonicalNode[] = [];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const candidate = result[index]!;
    if (candidate.pageStart !== node.pageStart) return null;
    if (candidate.role === "equation") return { targetIndex: index, target: candidate, interstice: interstice.reverse() };
    if (!isMathDisplayInterstice(candidate)) return null;
    interstice.push(candidate);
  }
  return null;
}

/**
 * A tall display can start with stacked operator / radical fragments before
 * pdf.js emits its main baseline as an equation node.  Keep those fragments
 * with that equation when they form a compact, non-prose vertical stack.  The
 * rule is deliberately one-sided: it never absorbs a preceding sentence.
 */
function displayPreludeTarget(result: CanonicalNode[], node: CanonicalNode): { targetIndex: number; fragments: CanonicalNode[] } | null {
  if (node.role !== "equation") return null;
  const fragments: CanonicalNode[] = [];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const candidate = result[index]!;
    if (candidate.pageStart !== node.pageStart || !isMathDisplayInterstice(candidate)) break;
    const below = fragments.at(-1) ?? node;
    if (boxY(below) - lastBoxY(candidate) < -2 || boxY(below) - lastBoxY(candidate) > 28) break;
    fragments.push(candidate);
  }
  if (!fragments.length) return null;
  const ordered = fragments.reverse();
  const first = ordered[0]!;
  if (boxRight(first) < boxX(node) - 28 || boxX(first) > boxRight(node) + 28) return null;
  return { targetIndex: result.length - ordered.length, fragments: ordered };
}

/**
 * Place a detached ∫ into a definition clause at the integrand (`p(z)=∫ p…`),
 * not as a leading orphan before English prose.
 */
export function insertIntegralIntoDefinition(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || /∫/u.test(trimmed)) return trimmed;
  // `The marginal is p(zγ) = p(…)dx` → `… = ∫ p(…)dx`
  const afterEquals = trimmed.replace(
    /^((?:the\s+marginal\s+is\s+)?p\s*\([^)]*\)\s*=\s*)(?!∫)/iu,
    "$1∫ ",
  );
  if (afterEquals !== trimmed) return afterEquals.replace(/\s+/g, " ").trim();
  if (/^(?:the\s+marginal|where|with)\b/i.test(trimmed) && /=\s*(?!∫)/.test(trimmed)) {
    return trimmed.replace(/=\s*/, "= ∫ ").replace(/\s+/g, " ").trim();
  }
  // No safe integrand anchor — return unchanged so the caller can strip the
  // orphan glyph instead of re-prefixing `∫ Note that…`.
  return trimmed;
}

/**
 * Native PDF often linearizes a stacked derivative as
 * `d BODY (n) dγ` (and may tack a following `∫` from the next line).
 * Rewrite to `d/dγ BODY (n)` when the shape is unambiguous.
 */
export function normalizeLinearStackedDerivative(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  // Keep a trailing ∫ so a later pass can move it onto the following
  // definition paragraph (`The marginal is …`).
  const match = trimmed.match(
    /^d\s+(.+?)\s*(\(\s*\d{1,2}[a-z]?\s*\))\s*d[γΓg](\s*∫)?\s*$/u,
  );
  if (!match) return text;
  const body = match[1]!.trim().replace(/\s+/g, " ");
  const integral = match[3] ? " ∫" : "";
  // Avoid double-prefixing when a prior pass already wrote d/dγ.
  if (/^d\s*\/\s*d/i.test(body)) {
    return `${body} ${match[2]}${integral}`.replace(/\s+/g, " ").trim();
  }
  return `d/dγ ${body} ${match[2]}${integral}`.replace(/\s+/g, " ").trim();
}

/**
 * Underbrace / arg-min labels sometimes glue after `(n)` as `γ,γ)` debris.
 * Strip only the trailing orphan — never invent a better subscript.
 */
export function stripTrailingOrphanMathTail(text: string): string {
  return text
    .replace(
      /(\(\s*\d{1,2}[a-z]?\s*\))\s*[A-Za-zα-ωΑ-Ω]{1,4}\s*,\s*[A-Za-zα-ωΑ-Ω]{1,4}\)\s*$/u,
      "$1",
    )
    .trim();
}

/**
 * Underbrace labels under `min` / `arg min` often interleave into the main
 * baseline (`≡ xˆ(minzγ,γ) E` / `arg minxˆ(z mse`). Drop the obvious debris
 * without inventing a cleaned symbolic form.
 */
export function scrubUnderbraceLabelDebris(text: string): string {
  let next = text.replace(/\s+/g, " ").trim();
  next = next.replace(/≡\s*x\s*ˆ?\s*\(\s*min[^)]{0,24}\)\s*/iu, "≡ ");
  next = next.replace(/\barg\s*min\s*x\s*ˆ?\s*\(\s*z?\s*/iu, "arg min ");
  next = next.replace(/\barg\s*min\s+mse\b/iu, "arg min mse");
  // `min` spurious token before an expectation operator on an mmse line.
  next = next.replace(/≡\s*min\s+(E[p(])/u, "≡ $1");
  return next.replace(/\s+/g, " ").trim();
}

function refineDisplayEquationText(text: string): string {
  return stripTrailingOrphanMathTail(
    scrubUnderbraceLabelDebris(normalizeLinearStackedDerivative(text)),
  );
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
  const overlayBoxes = [primary, ...extras].flatMap((node) => node.overlayBoundingBoxes ?? []);
  const pageStart = Math.min(primary.pageStart, ...extras.map((node) => node.pageStart));
  const pageEnd = Math.max(primary.pageEnd, ...extras.map((node) => node.pageEnd));
  return {
    ...primary,
    role,
    text,
    pageStart,
    pageEnd,
    boundingBoxes: boxes,
    ...(overlayBoxes.length > 0 ? { overlayBoundingBoxes: overlayBoxes } : {}),
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
  if (nodes.length === 0) return nodes;

  // Eth/C0 stand-ins for `(n)` must be normalized before numbered-display
  // promotion and bare-number lookback; otherwise `D = D0 exp ð3Þ` stays paragraph.
  const source = nodes.map((node) => sanitizeMathControls(node));

  const consumed = new Set<string>();
  const result: CanonicalNode[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const node = source[index]!;
    if (consumed.has(node.id)) continue;
    const next = source[index + 1];
    const mid = next;
    const den = source[index + 2];

    // A three-piece stacked integral can arrive as an operator row, a main
    // numbered row, then its denominator. The operator row has already been
    // emitted by the time we inspect the main row, so fold all three into one
    // canonical equation rather than leaving the denominator as prose.
    const previous = result.at(-1);

    const continuation = alignedContinuationTarget(result, node);
    // A multi-line derivation is one structural display even when PDF.js
    // yields a node for each aligned row. Join only an explicit continuation
    // operator that is spatially inside the preceding display's horizontal
    // band; this deliberately leaves separately numbered or prose equations
    // alone. `previous` is the already-merged row, allowing a = / − / = chain.
    if (
      continuation &&
      continuation.target.pageStart === node.pageStart &&
      // Let the more specific operator/body/denominator merge below own this
      // shape; consuming its middle row here would strand the denominator.
      !(
        next &&
        /[∫∑∏]/u.test(continuation.target.text ?? "") &&
        (continuation.target.text ?? "").trim().length <= 96 &&
        hasEquationNumber(node.text ?? "") &&
        isStackedDenominatorCrumb(next.text ?? "")
      ) &&
      // When a stacked fraction/radical sits between rows, measure the gap
      // from its bottom rather than from the main row's first baseline.  A
      // multi-line equation may itself have a tall bounding-box list.
      boxY(node) - lastBoxY(continuation.interstice.at(-1) ?? continuation.target) >= -2 &&
      boxY(node) - lastBoxY(continuation.interstice.at(-1) ?? continuation.target) <= 36 &&
      continuation.interstice.every((fragment, index, all) => {
        const prior = index === 0 ? continuation.target : all[index - 1]!;
        return boxY(fragment) - lastBoxY(prior) >= -2 && boxY(fragment) - lastBoxY(prior) <= 28;
      }) &&
      (continuation.interstice.length === 0 || boxY(node) - lastBoxY(continuation.interstice.at(-1)!) <= 28) &&
      boxX(node) <= boxRight(continuation.target) + 24 &&
      boxRight(node) >= boxX(continuation.target) - 24
    ) {
      result.splice(continuation.targetIndex);
      result.push(
        mergeNodes(
          continuation.target,
          [...continuation.interstice, node],
          "equation",
          joinText(continuation.target.text ?? "", node.text ?? ""),
          "aligned-display-continuation-merge",
          "nearby aligned equation row beginning with a continuation operator merged into the same display",
        ),
      );
      for (const fragment of continuation.interstice) consumed.add(fragment.id);
      consumed.add(node.id);
      continue;
    }

    const prelude = displayPreludeTarget(result, node);
    if (
      prelude &&
      // Preserve the more specific operator / numbered body / denominator
      // reconstruction below.  Its text normalization inserts the fraction
      // bar, whereas a generic prelude merge would only concatenate rows.
      !(
        next &&
        /[∫∑∏]/u.test(prelude.fragments.map((fragment) => fragment.text ?? "").join(" ")) &&
        hasEquationNumber(node.text ?? "") &&
        isStackedDenominatorCrumb(next.text ?? "")
      )
    ) {
      result.splice(prelude.targetIndex);
      result.push(
        mergeNodes(
          node,
          prelude.fragments,
          "equation",
          joinText(prelude.fragments.map((fragment) => fragment.text ?? "").join(" "), node.text ?? ""),
          "display-math-prelude-merge",
          "compact operator/radical fragments above the main equation baseline merged into the same display",
        ),
      );
      for (const fragment of prelude.fragments) consumed.add(fragment.id);
      consumed.add(node.id);
      continue;
    }

    if (
      previous &&
      next &&
      !consumed.has(next.id) &&
      previous.pageStart === node.pageStart &&
      node.pageStart === next.pageStart &&
      previous.role === "equation" &&
      (node.role === "equation" ||
        (hasEquationNumber(node.text ?? "") && looksLikeDisplayMathBody(node.text ?? ""))) &&
      /[∫∑∏]/u.test(previous.text ?? "") &&
      (previous.text ?? "").trim().length <= 96 &&
      hasEquationNumber(node.text ?? "") &&
      isStackedDenominatorCrumb(next.text ?? "") &&
      boxY(node) - boxY(previous) >= -2 &&
      boxY(node) - boxY(previous) <= 32 &&
      boxY(next) - boxY(node) >= -2 &&
      boxY(next) - boxY(node) <= 32 &&
      boxX(next) >= boxX(node) - 12 &&
      boxRight(next) <= boxRight(node) + 20
    ) {
      result.pop();
      const denominator = (next.text ?? "").replace(/\s+/g, " ").trim();
      result.push(
        mergeNodes(
          node,
          [previous, next],
          "equation",
          `${(previous.text ?? "").trim()} ${(node.text ?? "").trim()} / (${denominator})`,
          "stacked-integral-fraction-merge",
          "operator, numbered body, and lower-baseline denominator merged into one display equation",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

    // Displayed integrals frequently have a denominator painted on a lower
    // baseline (`1 + γ`) as its own paragraph node. Keep it with the formula
    // when the geometry says it sits inside the formula's horizontal span;
    // a nearby prose/numeric line is intentionally not eligible.
    if (
      next &&
      !consumed.has(next.id) &&
      node.pageStart === next.pageStart &&
      node.role === "equation" &&
      /[∫∑∏]/u.test(node.text ?? "") &&
      isStackedDenominatorCrumb(next.text ?? "") &&
      boxY(next) >= boxY(node) - 2 &&
      boxY(next) - boxY(node) <= 32 &&
      boxX(next) >= boxX(node) - 12 &&
      boxRight(next) <= boxRight(node) + 20
    ) {
      const denominator = (next.text ?? "").replace(/\s+/g, " ").trim();
      result.push(
        mergeNodes(
          node,
          [next],
          "equation",
          `${(node.text ?? "").trim()} / (${denominator})`,
          "stacked-fraction-denominator-merge",
          "lower-baseline denominator reattached to adjacent display equation",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

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
      // A lone ∫ before definition prose belongs after `=` (`p(z)=∫ p…`).
      const attached =
        glyph === "∫" &&
        next.role === "paragraph" &&
        /^(?:the\s+marginal|where|with)\b/i.test(body)
          ? insertIntegralIntoDefinition(body)
          : /^(?:γ|ε|ϵ|x|z|σ)/u.test(body)
            ? `${glyph}${body}`
            : joinText(glyph, body);
      // A numbered display body must stay an equation even when a leading ∫/√
      // crumb was glued on (`∫ gxi ∪ gxj = … (9)`).
      const displayAfterGlyph =
        next.role === "equation" ||
        (hasEquationNumber(attached) && looksLikeDisplayMathBody(attached));
      result.push(
        mergeNodes(
          next,
          [node],
          displayAfterGlyph ? "equation" : "paragraph",
          attached,
          displayAfterGlyph ? "inline-math-glyph-display" : "inline-math-glyph-merge",
          displayAfterGlyph
            ? "inline math glyph reattached to numbered display equation"
            : "inline math glyph reattached to following paragraph",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

    // Orphan `∫` / `∫ T` before a numbered efficiency line that has `dt` but
    // lost the integral glyph (`η = dt × 100 (42)`). Skip a short footnote /
    // integrand crumb painted between them.
    if (/^∫\s*T?\s*$/u.test((node.text ?? "").trim())) {
      const mid = next;
      const target =
        mid &&
        !consumed.has(mid.id) &&
        (mid.role === "equation" || looksLikeDisplayMathBody(mid.text ?? "")) &&
        hasEquationNumber(mid.text ?? "") &&
        /=\s*(?!∫).*?\bdt\b/u.test(mid.text ?? "")
          ? mid
          : mid &&
              !consumed.has(mid.id) &&
              (mid.role === "footnote" || mid.role === "other") &&
              (mid.text ?? "").trim().length <= 40 &&
              source[index + 2] &&
              !consumed.has(source[index + 2]!.id)
            ? source[index + 2]!
            : null;
      if (
        target &&
        node.pageStart === target.pageStart &&
        (target.role === "equation" || looksLikeDisplayMathBody(target.text ?? "")) &&
        hasEquationNumber(target.text ?? "") &&
        /=\s*(?!∫).*?\bdt\b/u.test(target.text ?? "") &&
        boxY(target) - boxY(node) <= 48 &&
        Math.abs(boxX(node) - boxX(target)) <= 220
      ) {
        const extras = [node, ...(target !== mid && mid ? [mid] : [])];
        const body = (target.text ?? "").trim().replace(/=\s*/, "= ∫ ");
        result.push(
          mergeNodes(
            target,
            extras,
            "equation",
            body.replace(/\s+/g, " ").trim(),
            "orphan-integral-dt-merge",
            "orphan ∫ reattached into numbered dt display equation",
          ),
        );
        for (const extra of extras) consumed.add(extra.id);
        consumed.add(target.id);
        continue;
      }
    }

    // Incomplete norm opener `Di = ∥ ∥` immediately before a numbered norm body
    // (`∥ ∂x… ∥2 (5)`). Drop the empty bars so the LHS lands on the body.
    if (
      next &&
      !consumed.has(next.id) &&
      node.pageStart === next.pageStart &&
      /=\s*[∥‖]\s*[∥‖]\s*$/u.test((node.text ?? "").trim()) &&
      hasEquationNumber(next.text ?? "") &&
      /[∥‖]/u.test(next.text ?? "") &&
      looksLikeDisplayMathBody(next.text ?? "") &&
      boxY(next) - boxY(node) <= 28 &&
      Math.abs(boxX(node) - boxX(next)) <= 120
    ) {
      const lhs = (node.text ?? "").trim().replace(/=\s*[∥‖]\s*[∥‖]\s*$/u, "=").trim();
      const body = (next.text ?? "").trim();
      result.push(
        mergeNodes(
          next,
          [node],
          "equation",
          joinText(lhs, body),
          "incomplete-norm-opener-merge",
          "empty norm bars before numbered ∥…∥ display merged onto equation body",
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

    // Bare `(n)` or indexed `i (n)` after a display formula that lost its number.
    // Look back past short stacked-fraction crumbs; never invent weak links.
    const indexedNumber = isIndexedEquationNumber(node.text ?? "");
    if ((isBareEquationNumber(node.text ?? "") || indexedNumber) && result.length > 0) {
      const targetIndex = findBareNumberMergeTarget(result, node);
      if (targetIndex >= 0) {
        const prev = result[targetIndex]!;
        const prevText = (prev.text ?? "").trim();
        const numberMatch = (node.text ?? "").trim().match(/\(\s*\d{1,2}[a-z]?\s*\)/);
        const number = numberMatch?.[0] ?? (node.text ?? "").trim();
        const indexLetter = indexedNumber
          ? (node.text ?? "").trim().match(/^([a-zα-ω])/iu)?.[1]
          : undefined;
        let body = prevText;
        if (indexLetter && /^[∑∏]/.test(body) && !new RegExp(`^[∑∏]_?${indexLetter}`).test(body)) {
          body = body.replace(/^([∑∏])/u, `$1_${indexLetter}`);
        }
        result[targetIndex] = mergeNodes(
          prev,
          [node],
          "equation",
          joinText(body, number),
          indexedNumber ? "indexed-equation-number-merge" : "bare-equation-number-merge",
          indexedNumber
            ? "summation index + equation number reattached to display formula"
            : "orphan equation number reattached to preceding display formula",
        );
        consumed.add(node.id);
        continue;
      }
    }

    // Bare `(n)` painted *before* its display body (number on the right rail,
    // body on the next baseline). Attach forward only when the next line is an
    // unnumbered display candidate — never onto prose / already-numbered lines.
    if (
      isBareEquationNumber(node.text ?? "") &&
      next &&
      !consumed.has(next.id) &&
      node.pageStart === next.pageStart &&
      !hasEquationNumber(next.text ?? "") &&
      isDisplayMathCandidate(next) &&
      boxY(next) - boxY(node) <= 28 &&
      boxY(next) + 4 >= boxY(node) &&
      // Number sits to the right of (or near) the formula body.
      boxX(node) + 8 >= boxX(next) - 40
    ) {
      const number = (node.text ?? "").trim().match(/\(\s*[1-9]\d?[a-z]?\s*\)/)?.[0] ??
        (node.text ?? "").trim();
      result.push(
        mergeNodes(
          next,
          [node],
          "equation",
          joinText((next.text ?? "").trim(), number),
          "bare-equation-number-forward-merge",
          "orphan equation number reattached to following unnumbered display formula",
        ),
      );
      consumed.add(node.id);
      consumed.add(next.id);
      continue;
    }

    // Column / enumeration crumbs: bare `(n)` on the same baseline as a short
    // prose fragment (`effects; (3)` before `user experience… and (4)`). Keep
    // as paragraph — never invent a display equation without a math body.
    // Two-column pages may interleave a right-column wrap before the left-
    // column bare `(n)` (covid CVI `(49)` under a `• …` bullet).
    if (isBareEquationNumber(node.text ?? "") && result.length > 0) {
      const nextText = (next?.text ?? "").trim();
      const bareDigits = (node.text ?? "").match(/\d+/)?.[0] ?? "";
      const citeListNeighbor =
        next != null &&
        next.pageStart === node.pageStart &&
        boxY(next) - boxY(node) <= 24 &&
        (/^[•·▪◦]\s/.test(nextText) ||
          (bareDigits.length > 0 &&
            new RegExp(`\\(\\s*${bareDigits}\\s*\\)`).test(nextText)));
      let enumIndex = -1;
      for (let i = result.length - 1; i >= Math.max(0, result.length - 8); i -= 1) {
        const cand = result[i]!;
        if (cand.pageStart !== node.pageStart) break;
        if (cand.role !== "paragraph" && cand.role !== "other") continue;
        const candText = (cand.text ?? "").trim();
        if (!candText) continue;
        if (looksLikeDisplayMathBody(candText)) continue;
        if (/[=∫∑∏√∂∇≤≥≈≠±×÷⋅‖∥]/u.test(candText)) continue;
        // Citation bullets may already contain `(54, 77)` — still valid hosts.
        if (hasEquationNumber(candText) && !/^[•·▪◦]\s/.test(candText)) continue;
        const dy = Math.abs(boxY(cand) - boxY(node));
        const sameColumn = Math.abs(boxX(cand) - boxX(node)) <= 80;
        if (dy > (citeListNeighbor ? 28 : 8)) continue;
        if (!sameColumn && !(boxX(node) + 2 >= boxX(cand) - 40 && dy <= 8)) continue;
        if (
          candText.length > 160 &&
          !citeListNeighbor &&
          !/^[•·▪◦]\s/.test(candText)
        ) {
          continue;
        }
        enumIndex = i;
        break;
      }
      if (enumIndex >= 0) {
        const prev = result[enumIndex]!;
        result[enumIndex] = mergeNodes(
          prev,
          [node],
          "paragraph",
          joinText((prev.text ?? "").trim(), (node.text ?? "").trim()),
          "same-baseline-enumeration-number-merge",
          "list/enumeration number glued to same-baseline prose fragment",
        );
        consumed.add(node.id);
        continue;
      }
    }
    // Superscript bracket / orphan tail / operator-index after a display.
    if (
      (isSuperscriptBracketCrumb(node.text ?? "") ||
        isOrphanMathTailCrumb(node.text ?? "") ||
        isOrphanOperatorIndexCrumb(node.text ?? "")) &&
      result.length > 0
    ) {
      const prev = result[result.length - 1]!;
      const indexCrumb = isOrphanOperatorIndexCrumb(node.text ?? "");
      if (
        prev.pageStart === node.pageStart &&
        (prev.role === "equation" ||
          (prev.role === "paragraph" && looksLikeDisplayMathBody(prev.text ?? ""))) &&
        boxY(node) - boxY(prev) <= (indexCrumb ? 18 : 36) &&
        Math.abs(boxX(node) - boxX(prev)) <= 280 &&
        (!indexCrumb ||
          (prev.role === "equation" &&
            /\b(?:min|max|∑|∏|arg\s*min|arg\s*max)\b/i.test(prev.text ?? "")))
      ) {
        const crumb = (node.text ?? "").trim();
        const power = crumb.match(/^\[\s*[*∗]?\s*(\d{1,2})\s*\]$/)?.[1];
        const marker = power === "2" ? "²" : power ? `^${power}` : "";
        // Index crumbs are consumed (not appended) — placement under multiple
        // min/max operators is ambiguous in linearized text.
        const mergedText = indexCrumb
          ? (prev.text ?? "").trim()
          : power
            ? attachSuperscript(prev.text ?? "", marker)
            : joinText(prev.text ?? "", crumb, "");
        result[result.length - 1] = mergeNodes(
          prev,
          [node],
          prev.role === "equation" || hasEquationNumber(prev.text ?? "") ? "equation" : prev.role,
          mergedText,
          power
            ? "superscript-bracket-merge"
            : indexCrumb
              ? "orphan-operator-index-consume"
              : "orphan-math-tail-merge",
          power
            ? "norm/power superscript bracket absorbed into preceding formula"
            : indexCrumb
              ? "operator-index crumb under display consumed without inventing subscripts"
              : "orphan math tail absorbed into preceding formula",
        );
        consumed.add(node.id);
        continue;
      }
    }

    // Promote intact numbered display formulas that scored as paragraph.
    // Also catch linearized stacked derivatives (`d BODY (n) dγ`) that still
    // look like prose until normalized. Leading display operators (`∫`, `∑`)
    // from glyph merges stay eligible. Unnumbered ∑/∫/∏ lines that already
    // look like display math (not sentence prose) promote without inventing a number.
    const linearizedStacked =
      /^d\s+.+\(\s*\d{1,2}[a-z]?\s*\)\s*d[γΓg]/u.test((node.text ?? "").replace(/\s+/g, " ").trim());
    const displayText = (node.text ?? "").replace(/\s+/g, " ").trim();
    const decoratedNumberedDisplay = isDecoratedNumberedDisplay(displayText);
    const unnumberedOperatorDisplay =
      !hasEquationNumber(displayText) &&
      looksLikeDisplayMathBody(displayText) &&
      /^[∑∫∏]/.test(displayText) &&
      displayText.split(/\s+/).length <= 36 &&
      !/[!?]/.test(displayText) &&
      !/\b(?:the|and|for|with|from|this|that|which|here|when)\b/i.test(displayText);
    if (
      (node.role === "paragraph" ||
        node.role === "other" ||
        node.role === "table" ||
        node.role === "footnote" ||
        node.role === "heading") &&
      !/\n/.test(displayText) &&
      (hasEquationNumber(node.text ?? "") || unnumberedOperatorDisplay || decoratedNumberedDisplay) &&
      (looksLikeDisplayMathBody(node.text ?? "") || linearizedStacked || unnumberedOperatorDisplay || decoratedNumberedDisplay) &&
      ((node.text ?? "").trim().split(/\s+/).length <= 48 || decoratedNumberedDisplay)
    ) {
      const refined = refineDisplayEquationText(node.text ?? "");
      const changed = refined !== (node.text ?? "").trim();
      const label = unnumberedOperatorDisplay
        ? "unnumbered-operator-display-equation"
        : decoratedNumberedDisplay
          ? "decorated-numbered-display-equation"
          : changed
          ? "linear-stacked-derivative-normalize"
          : "numbered-display-equation";
      result.push({
        ...sanitizeMathControls({ ...node, text: refined }),
        role: "equation",
        evidence: [
          ...node.evidence,
          evidence(
            node,
            label,
            unnumberedOperatorDisplay
              ? "unnumbered ∑/∫/∏ display promoted to equation"
              : decoratedNumberedDisplay
                ? "numbered display with underbrace labels retained as one equation"
                : changed
                ? "linearized d … (n) dγ display normalized to d/dγ"
                : "numbered symbolic display promoted to equation",
          ),
        ],
      });
      continue;
    }

    // Repeated radical-only crumbs (`√ √ √ √`) are matrix decorations, not displays.
    if (/^(?:√\s*){2,}$/u.test((node.text ?? "").trim())) {
      result.push({
        ...sanitizeMathControls(node),
        role: "other",
        confidence: Math.min(node.confidence, 0.35),
        evidence: [
          ...node.evidence,
          evidence(node, "radical-crumb-demotion", "repeated √ crumbs are not a display equation"),
        ],
      });
      continue;
    }

    // Decision-tree / rule-table debris painted as equations (`≥ = ==`, `≥ yes AND …`).
    if (
      (node.role === "equation" || node.role === "paragraph" || node.role === "other") &&
      looksLikeRuleDebrisMath(node.text ?? "")
    ) {
      result.push({
        ...sanitizeMathControls(node),
        role: "other",
        confidence: Math.min(node.confidence, 0.3),
        evidence: [
          ...node.evidence,
          evidence(node, "rule-debris-demotion", "comparison/rule crumbs are not display equations"),
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

    // Already-promoted equations still get underbrace / linear-d cleanup.
    if (node.role === "equation" && (node.text ?? "").trim()) {
      const refined = refineDisplayEquationText(node.text ?? "");
      if (refined !== (node.text ?? "").trim()) {
        result.push({
          ...sanitizeMathControls({ ...node, text: refined }),
          evidence: [
            ...node.evidence,
            evidence(node, "display-equation-text-refine", "underbrace/linear-d debris scrubbed from display equation"),
          ],
        });
        continue;
      }
    }

    result.push(node);
  }

  // Trailing `∫` on a linearized derivative often belongs on a nearby
  // definition paragraph (`The marginal is p(z)=∫…`). Reading order may list
  // that paragraph before or after the equation node, so search by geometry.
  for (let index = 0; index < result.length; index += 1) {
    const cur = result[index]!;
    if (cur.role !== "equation") continue;
    const curText = (cur.text ?? "").trim();
    if (!/∫\s*$/u.test(curText)) continue;
    let target = -1;
    for (let j = 0; j < result.length; j += 1) {
      if (j === index) continue;
      const cand = result[j]!;
      if (cand.role === "equation") continue;
      if (cand.pageStart !== cur.pageStart) continue;
      const dy = boxY(cand) - boxY(cur);
      if (dy < -4 || dy > 56) continue;
      const candText = (cand.text ?? "").trim();
      if (
        /^(?:the\s+marginal|where|with)\b/i.test(candText) ||
        /^p\s*\(\s*z/i.test(candText)
      ) {
        target = j;
        break;
      }
    }
    result[index] = {
      ...cur,
      text: curText.replace(/\s*∫\s*$/u, "").trim(),
      evidence: [
        ...cur.evidence,
        evidence(
          cur,
          "detach-trailing-integral",
          target >= 0
            ? "trailing ∫ moved off display equation onto nearby definition"
            : "trailing ∫ removed from linearized stacked derivative",
        ),
      ],
    };
    if (target >= 0) {
      const nxt = result[target]!;
      const nxtText = (nxt.text ?? "").trim();
      if (!/∫/u.test(nxtText)) {
        result[target] = {
          ...nxt,
          text: insertIntegralIntoDefinition(nxtText),
          evidence: [
            ...nxt.evidence,
            evidence(
              nxt,
              "attach-definition-integral",
              "∫ from nearby display reattached after definition equals",
            ),
          ],
        };
      }
    }
  }

  return result.map((node) => {
    const cleaned = sanitizeMathControls(node);
    if (!cleaned.text) return cleaned;
    // Lone √/∫ crumbs sometimes stick onto the next English sentence after a
    // display merge (`√ Let p(z|x) be…`, `∫ The marginal is…`). Relocate ∫
    // into a definition integrand when possible; otherwise strip the orphan.
    if (
      (cleaned.role === "paragraph" || cleaned.role === "abstract") &&
      // `√ A threshold…`, `∫ Note that…`, `∑ the total…`
      /^[√∑∏∂∆∇∫]\s+(?=(?:[A-Z](?:[a-z]+|\b)|the\b|and\b|for\b|with\b|this\b|that\b|where\b|note\b))/iu.test(
        cleaned.text,
      )
    ) {
      const glyph = cleaned.text.trim()[0]!;
      const rest = cleaned.text.replace(/^[√∑∏∂∆∇∫]\s+/u, "").trim();
      if (glyph === "∫") {
        const relocated = insertIntegralIntoDefinition(rest);
        if (relocated !== rest && /∫/u.test(relocated)) {
          return {
            ...cleaned,
            text: relocated,
            evidence: [
              ...cleaned.evidence,
              evidence(
                cleaned,
                "relocate-leading-integral",
                "leading ∫ moved into definition integrand",
                0.88,
              ),
            ],
          };
        }
      }
      return {
        ...cleaned,
        text: rest,
        evidence: [
          ...cleaned.evidence,
          evidence(
            cleaned,
            "strip-leading-orphan-math-glyph",
            "dropped leading orphan math glyph before English prose",
            0.86,
          ),
        ],
      };
    }
    if (cleaned.role !== "equation") return cleaned;
    const refined = refineDisplayEquationText(cleaned.text);
    return refined === cleaned.text.trim() ? cleaned : { ...cleaned, text: refined };
  });
}

/** Replace C0 controls that PDF fonts misuse as math letters (ε ≈ SI). */
export function sanitizeMathControls(node: CanonicalNode): CanonicalNode {
  if (
    !node.text ||
    (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(node.text) &&
      !/[ðÐþÞ]/.test(node.text) &&
      !/\u00bc/.test(node.text))
  ) {
    return node;
  }
  const mathContext =
    /[=+∼~‖|α-ωΑ-Ω√∫∑]|N\s*\(|mmse|DKL|SNR|\u00bc|\bdim\s*\(/i.test(node.text) ||
    node.role === "equation" ||
    node.role === "table" ||
    // Matrix ellipsis / crystallography overline painted as C0 in Symbol maps.
    /(?:\u0004\s*){2,}/.test(node.text) ||
    /[A-Za-z]\d+\s+\u0004/.test(node.text) ||
    (/\u0016/.test(node.text) && /[A-Za-z]\d/.test(node.text)) ||
    // ENQ between parenthetical dims is a ≤ stand-in (`dim(S) \u0005 dim(A)`).
    /\)\s*\u0005\s*(?:\(|dim\b)/i.test(node.text);
  // High-confidence substitutions can run even outside full math context.
  let cleaned = node.text
    // Vulgar fraction ¼ is a common ToUnicode stand-in for `=` in math PDFs.
    .replace(/\u00bc/g, "=")
    // ENQ between math atoms is commonly ≤ (`dim (S) ≤ dim (A)`).
    .replace(/\)\s*\u0005\s*/g, ") ≤ ")
    .replace(/\u0005\s*(?=\()/g, "≤ ")
    // SI / SO often stand in for ε in broken ToUnicode maps on math PDFs.
    .replace(/\u000e|\u000f/g, "ε")
    // Spaced EOT runs are matrix ellipses (`B12 ⋯ B1m`).
    .replace(/(?:\u0004\s*){2,}/g, "⋯ ")
    // Lone EOT between matrix cells is a centered dot.
    .replace(/\u0004/g, "·")
    // SYN between alnum is often a missing overline (F43̄m).
    .replace(/([A-Za-z0-9])\u0016\s*([A-Za-z])/g, "$1\u0304$2")
    // SOH between identifiers is commonly a ratio slash (`EGB / Ebulk`).
    .replace(
      /\b([A-Za-z][A-Za-z0-9]*)\s*\u0001\s*([A-Za-z][A-Za-z0-9]*)\b/g,
      "$1 / $2",
    )
    // DC2/DC3 pair as empty brackets around a symbol (`( Ea )`).
    .replace(/\u0012\s*([A-Za-z][A-Za-z0-9]*)\s*\u0013/g, "($1)")
    .replace(/\u0012\s*\u0013\s*([A-Za-z][A-Za-z0-9]*)/g, "($1)")
  // Eth/thorn stand-ins for parentheses (`ð14Þ` → `(14)`, `lðθÞ` → `l(θ)`,
  // `minðl , l Þ` → `min(l , l )`). Repeat for shallow nesting.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = cleaned.replace(
      /[ðÐ]\s*([^ðÐþÞ\n]{1,48}?)\s*[þÞ]/gu,
      (_match, inner: string) => `(${String(inner).replace(/\s+/g, " ").trim()})`,
    );
    if (next === cleaned) break;
    cleaned = next;
  }
  // Truncated ToUnicode often drops the closing thorn on equation numbers.
  cleaned = cleaned.replace(/[ðÐ]\s*(\d{1,2}[a-z]?)\b/g, "($1)");
  // Leftover thorns outside eth-paren pairs are usually `+` (`a þ b`, `þ f`).
  if (mathContext || /[=√∫∑τμσ]/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*[þÞ]\s*/g, " + ");
  }
  if (mathContext) {
    cleaned = cleaned.replace(/[\u0000-\u0008\u000b\u000c\u0010-\u001f]/g, "");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned === (node.text ?? "").replace(/\s+/g, " ").trim()) return node;
  return {
    ...node,
    text: cleaned,
    evidence: [
      ...node.evidence,
      evidence(node, "math-control-sanitize", "C0 control glyphs normalized in math context", 0.8),
    ],
  };
}
