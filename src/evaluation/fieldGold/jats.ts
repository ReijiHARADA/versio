import type { FieldRecord } from "./types";
import { elements, first, removeElements, text } from "./xml";

/** Block-ish JATS children get a space so words do not glue together. */
function blockText(xml: string): string {
  return text(xml.replace(/<\/(title|p|label|name|surname|given-names|institution|source|year|volume|article-title|person-group)>/g, "</$1> "))
    .replace(/\s+([,.;:])/g, "$1");
}

function personName(nameXml: string): string {
  const given = text(first(nameXml, "given-names")?.inner ?? "");
  const surname = text(first(nameXml, "surname")?.inner ?? "");
  return [given, surname].filter(Boolean).join(" ");
}

function captionsOf(xml: string): FieldRecord["captions"] {
  const out: FieldRecord["captions"] = [];
  const scan = (tag: "fig" | "table-wrap", kind: "figure" | "table") => {
    for (const el of elements(xml, tag)) {
      const caption = first(el.inner, "caption");
      const label = first(el.inner, "label");
      if (!caption) continue;
      out.push({ kind, label: label ? text(label.inner) : null, text: blockText(caption.inner) });
    }
  };
  // Document order matters little for scoring; keep figures then tables per scan.
  scan("fig", "figure");
  scan("table-wrap", "table");
  return out;
}

export function parseJatsFields(xml: string): FieldRecord {
  const article = removeElements(xml, "sub-article");
  const front = first(article, "front")?.inner ?? article;
  const meta = first(front, "article-meta")?.inner ?? front;
  const titleEl = first(first(meta, "title-group")?.inner ?? meta, "article-title");

  const authors = elements(meta, "contrib")
    .filter((c) => (c.attrs["contrib-type"] ?? "author") === "author")
    .map((c) => {
      const nameEl = first(c.inner, "name");
      const name = nameEl ? personName(nameEl.inner) : text(first(c.inner, "string-name")?.inner ?? first(c.inner, "collab")?.inner ?? "");
      const affiliationKeys = [...c.inner.matchAll(/<xref\b[^>]*ref-type="aff"[^>]*rid="([^"]+)"/g)]
        .flatMap((m) => m[1].split(/\s+/));
      return { name, affiliationKeys };
    })
    .filter((a) => a.name);

  const affiliations = elements(meta, "aff").map((a, i) => ({
    key: a.attrs.id ?? `aff${i + 1}`,
    text: text(removeElements(removeElements(a.inner, "label"), "institution-id")).replace(/\s+([,.;])/g, "$1"),
  }));
  // No author→aff links and a single affiliation: it applies to every author.
  if (affiliations.length === 1 && authors.every((a) => a.affiliationKeys.length === 0)) {
    for (const a of authors) a.affiliationKeys = [affiliations[0].key];
  }

  const emails = [...new Set(elements(meta, "email").map((e) => text(e.inner).toLowerCase()).filter(Boolean))];

  const body = first(article, "body")?.inner ?? "";
  const back = removeElements(removeElements(first(article, "back")?.inner ?? "", "app-group"), "app");
  const captions = captionsOf(body + back.replace(/<ref-list[\s\S]*<\/ref-list>/, ""));

  const references = elements(first(back, "ref-list")?.inner ?? first(article, "ref-list")?.inner ?? "", "ref").map((ref) => {
    const cite = first(ref.inner, "mixed-citation") ?? first(ref.inner, "element-citation") ?? first(ref.inner, "citation") ?? ref;
    const isBook = /book/.test(cite.attrs["publication-type"] ?? "");
    const title = first(cite.inner, "article-title") ?? first(cite.inner, "chapter-title") ?? (isBook ? first(cite.inner, "source") : null);
    const year = text(first(cite.inner, "year")?.inner ?? "").match(/\d{4}/)?.[0];
    const doi = elements(cite.inner, "pub-id").find((p) => p.attrs["pub-id-type"] === "doi");
    return {
      raw: blockText(removeElements(cite.inner, "pub-id")),
      ...(title ? { title: text(title.inner) } : {}),
      ...(year ? { year } : {}),
      ...(doi ? { doi: text(doi.inner) } : {}),
    };
  });

  return { title: titleEl ? text(titleEl.inner) : null, authors, affiliations, emails, captions, references };
}
