import type { CanonicalNode } from "../../canonical/types";

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const LABEL_ONLY = /^[*∗†‡\s]*(?:correspondence|corresponding authors?)\s*:?\s*$/i;
const INLINE_NOTE = /^[*∗†‡\s]*(?:correspondence|corresponding authors?|e-?mail)\b/i;
// Byline e-mails under each author are not notes; a marked one (`* name@host`) is.
const MARKED_EMAIL = /^[*∗†‡]\s*[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*$/;
const EMAIL_TAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\s\S]*@)([\s\S]*)$/;
const MASTHEAD_ROLES = new Set(["copyright", "other", "paragraph"]);
// The next sidebar field below the address (`RECEIVED 13 February 2024`).
const SIDEBAR_FIELD = /^\s*(?:received|accepted|published|edited by|reviewed by|citation|copyright|specialty section)\b/i;

/**
 * The corresponding-author note is printed (a footnote or a sidebar box) but the
 * resolver files it under masthead roles, so the reader dropped it. Re-role it as a
 * footnote; a sidebar label (`*CORRESPONDENCE`) with the name and address on the
 * lines below it becomes one note.
 */
export function withCorrespondenceNotes(nodes: CanonicalNode[]): CanonicalNode[] {
  const consumed = new Set<string>();
  const replaced = new Map<string, CanonicalNode>();
  for (const node of nodes) {
    const text = (node.text ?? "").trim();
    // A bare label can be filed as an affiliation when a rail is read as its own column.
    if (node.pageStart > 2 || consumed.has(node.id) ||
      !(MASTHEAD_ROLES.has(node.role) || (node.role === "affiliation" && LABEL_ONLY.test(text)))) continue;
    const box = node.boundingBoxes[0];
    if (LABEL_ONLY.test(text) && box) {
      // Sidebar rows sit directly below the label in the same column, left- or
      // right-aligned with it; the name row may already be filed as an author or, in a rail, a heading.
      const parts = nodes.filter((n) => {
        const b = n.boundingBoxes[0];
        return n.pageStart === node.pageStart && n.id !== node.id && b && (MASTHEAD_ROLES.has(n.role) || n.role === "author" || n.role === "heading") &&
          (Math.abs(b.x - box.x) <= 12 || Math.abs(b.x + b.width - (box.x + box.width)) <= 12) &&
          b.y > box.y && b.y - box.y <= 40 && !/^\P{Ll}+$/u.test(n.text ?? "") && !SIDEBAR_FIELD.test(n.text ?? "");
      });
      if (!parts.some((n) => EMAIL.test(n.text ?? ""))) continue;
      parts.forEach((n) => consumed.add(n.id));
      const label = text.replace(/\s*:?\s*$/, "");
      replaced.set(node.id, { ...node, role: "footnote", text: `${label}: ${parts.map((n) => n.text!.trim()).join(", ")}` });
    } else if ((INLINE_NOTE.test(text) && (text.match(EMAIL_TAIL)?.[1].length ?? 99) <= 40) || (node.role !== "paragraph" && MARKED_EMAIL.test(text))) {
      replaced.set(node.id, { ...node, role: "footnote" });
    } else if (INLINE_NOTE.test(text) && !EMAIL.test(text) && text.length <= 80 && box) {
      // `*Correspondence: Name` with the address alone on the row below.
      const address = nodes.find((n) => {
        const b = n.boundingBoxes[0];
        return n.pageStart === node.pageStart && n.id !== node.id && b && MASTHEAD_ROLES.has(n.role) &&
          /^\s*[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*$/.test(n.text ?? "") && b.y > box.y && b.y - box.y <= 30 &&
          b.x < box.x + box.width && b.x + b.width > box.x;
      });
      if (!address) continue;
      consumed.add(address.id);
      replaced.set(node.id, { ...node, role: "footnote", text: `${text}, ${address.text!.trim()}` });
    }
  }
  if (replaced.size === 0) return nodes;
  return nodes.filter((n) => !consumed.has(n.id)).map((n) => replaced.get(n.id) ?? n);
}
