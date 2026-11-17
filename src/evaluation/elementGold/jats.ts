import { jatsParagraphs } from "../extractionAudit/paragraphGold";
import { blockText, parseJatsFields } from "../fieldGold/jats";
import { elements, first, removeElements, text } from "../fieldGold/xml";
import type { ElementGold } from "./types";

/** Section titles with their nesting depth (1 = top level). Figure/table titles are not headings. */
function headingsOf(xml: string, level = 1): ElementGold["headings"] {
  return elements(xml, "sec").flatMap((sec) => {
    const own = sec.inner.split(/<sec[\s>]/)[0];
    const title = first(own, "title");
    const label = first(own, "label");
    const t = title ? [label ? text(label.inner) : "", text(title.inner)].filter(Boolean).join(" ") : "";
    return [...(t ? [{ text: t, level }] : []), ...headingsOf(sec.inner, level + 1)];
  });
}

/**
 * Printed footnotes: author notes (equal contribution, present address) and notes the text
 * points to (`<xref ref-type="fn">`). Other back-matter `<fn>` (Springer "Declarations",
 * competing interests) print as end sections, not footnotes; table footnotes stay with their table.
 */
function footnotesOf(articleMeta: string, bodyAndBack: string): string[] {
  const cited = new Set([...(articleMeta + bodyAndBack).matchAll(/<xref\b[^>]*ref-type="fn"[^>]*rid="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const notes = elements(first(articleMeta, "author-notes")?.inner ?? "", "fn").filter((f) => !/edited-by|reviewed-by/.test(f.attrs["fn-type"] ?? ""));
  const pointed = elements(removeElements(bodyAndBack, "table-wrap"), "fn").filter((f) => cited.has(f.attrs.id ?? ""));
  // Frontiers / BMJ put editor credits and supplement notices in author-notes; they are sidebars, not footnotes.
  const notFootnote = /^(edited (and reviewed )?by|reviewed by|specialty section|authors?['’] contributions?|(additional )?supplement(al|ary)? material)\b/i;
  return [...notes, ...pointed].map((f) => blockText(removeElements(f.inner, "label"))).filter((t) => t && !notFootnote.test(t));
}

/** Element gold from publisher JATS (body, back and front matter); no model involved. */
export function jatsElementGold(xml: string, meta: { id: string; license: string; sourceUrl: string }): ElementGold {
  const article = removeElements(xml, "sub-article");
  const front = first(article, "front")?.inner ?? "";
  const articleMeta = first(front, "article-meta")?.inner ?? front;
  const body = first(article, "body")?.inner ?? "";
  const back = first(article, "back")?.inner ?? "";
  const backNoRefs = back.replace(/<ref-list[\s\S]*<\/ref-list>/, "");
  const textual = (s: string) => removeElements(removeElements(s, "fig"), "table-wrap");
  const fields = parseJatsFields(xml);
  const abstractSecs = elements(articleMeta, "abstract").filter((a) => !a.attrs["abstract-type"]).map((a) => a.inner).join("");
  const permissions = first(articleMeta, "permissions");
  const tables = elements(body + backNoRefs, "table-wrap").map((t) => ({
    label: first(t.inner, "label") ? text(first(t.inner, "label")!.inner) : null,
    caption: blockText(first(t.inner, "caption")?.inner ?? ""),
    cells: [...elements(t.inner, "td"), ...elements(t.inner, "th")].map((c) => blockText(c.inner)).filter(Boolean),
  }));
  const links = [...(body + backNoRefs).matchAll(/<(?:ext-link|uri)\b([^>]*)>([\s\S]*?)<\/(?:ext-link|uri)>/g)]
    .map((m) => (m[1].match(/xlink:href="([^"]+)"/)?.[1] ?? text(m[2])).trim())
    .filter((u) => /^(https?:|www\.|doi:|10\.)/i.test(u));
  return {
    id: meta.id,
    source: "europepmc",
    provenance: "jats",
    license: meta.license,
    sourceUrl: meta.sourceUrl,
    title: fields.title ?? "",
    authors: fields.authors.map((a) => a.name),
    affiliations: fields.affiliations.map((a) => a.text),
    emails: fields.emails,
    venue: text(first(front, "journal-title")?.inner ?? "") || null,
    doi: text(elements(articleMeta, "article-id").find((a) => a.attrs["pub-id-type"] === "doi")?.inner ?? "") || null,
    permissions: permissions ? blockText(removeElements(removeElements(permissions.inner, "copyright-year"), "ali:license_ref")) || null : null,
    headings: [...headingsOf(abstractSecs), ...headingsOf(textual(body)), ...headingsOf(textual(backNoRefs))],
    paragraphs: jatsParagraphs(xml).map((p) => p.text),
    footnotes: footnotesOf(articleMeta, body + backNoRefs),
    figures: fields.captions.filter((c) => c.kind === "figure").map((c) => ({ label: c.label, caption: c.text })),
    tables,
    equations: elements(textual(body + backNoRefs), "disp-formula").length,
    references: fields.references.map((r) => r.raw),
    links: [...new Set(links)],
  };
}
