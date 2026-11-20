import type { CanonicalNode } from "../../canonical/types";

const LABEL = /^(?:key\s?words?|index\s+terms)\s*[:：.—–-]?\s*/i;
// Other front-matter rail labels end a keyword list.
const OTHER_LABEL = /^(?:citation|copyright|received|accepted|published|edited\s+by|reviewed\s+by|correspondence|abstract|introduction|background|\d+\.?\s+\p{Lu})/iu;
const MAX_PAGE = 2;

/**
 * Keyword list from the front matter: a `Keywords` / `KEYWORDS` / `Index Terms`
 * label, inline or on its own, followed by separator-delimited terms that may
 * wrap over several nodes (`gaze following, human-robot interaction,` / `joint …`).
 * Returns the terms and the node ids that held them.
 */
export function extractKeywords(nodes: CanonicalNode[]): { keywords: string[]; nodeIds: Set<string> } {
  for (let start = 0; start < nodes.length; start += 1) {
    const node = nodes[start];
    const text = (node.text ?? "").trim();
    if (node.pageStart > MAX_PAGE || !LABEL.test(text)) continue;
    // An inline label must be followed by a list, not a sentence (`Keywords were …`).
    if (/^(?:key\s?words?|index\s+terms)\s+(?:were|are|was|is|of|in|from)\b/i.test(text)) continue;
    const found = keywordsFrom(nodes, start);
    if (found) return found;
  }
  return { keywords: [], nodeIds: new Set<string>() };
}

function keywordsFrom(nodes: CanonicalNode[], start: number): { keywords: string[]; nodeIds: Set<string> } | undefined {
  const label = nodes[start];
  const nodeIds = new Set([label.id]);
  let text = (label.text ?? "").trim().replace(LABEL, "");
  for (let i = start + 1; i < nodes.length && i <= start + 6; i += 1) {
    const node = nodes[i];
    const next = (node.text ?? "").trim();
    const open = text === "" || /[,;·•-]$/.test(text);
    if (!open || node.pageStart !== label.pageStart || !next || OTHER_LABEL.test(next) || node.role === "heading") break;
    nodeIds.add(node.id);
    text = /-$/.test(text) ? `${text}${next}` : `${text} ${next}`.trim();
  }
  const keywords = text
    .split(/\s*[;,·•]\s*/)
    .map((term) => term.replace(/[.]+$/, "").trim())
    .filter((term) => term.length > 0 && term.length <= 80);
  // A real list has several short terms; a sentence that merely starts with the word is not one.
  if (keywords.length < 2 || keywords.some((term) => term.split(/\s+/).length > 8 ||
    // Prose clauses (`and engagement while addressing …`) are not terms.
    /^(?:and|or)\b|\b(?:while|which|that|the|is|are|was|were)\b/i.test(term))) return undefined;
  return { keywords, nodeIds };
}
