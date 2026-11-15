import { parseJatsFields } from "./jats";
import type { FieldName, FieldRecord } from "./types";
import { first, elements, text } from "./xml";

function localized(xml: string, tag: string): { ja: string[]; en: string[] } {
  const el = first(xml, tag)?.inner ?? "";
  const names = (lang: string) => {
    const block = first(el, lang)?.inner ?? "";
    const inner = elements(block, "name");
    return (inner.length > 0 ? inner.map((n) => text(n.inner)) : [text(block)]).filter(Boolean);
  };
  return { ja: names("ja"), en: names("en") };
}

/**
 * J-STAGE gold. The WebAPI gives title and authors (no affiliations, no license);
 * a full-text JATS file, when the journal provides one, adds captions / references / affiliations.
 */
export function parseJstageFields(input: { searchApiXml: string; fullTextJats: string | null }): { fields: FieldRecord; trustedFields: FieldName[] } {
  const entry = first(input.searchApiXml, "entry")?.inner ?? input.searchApiXml;
  const titles = localized(entry, "article_title");
  const authors = localized(entry, "author");
  const useJa = titles.ja.length > 0;
  const fields: FieldRecord = {
    title: (useJa ? titles.ja[0] : titles.en[0]) ?? null,
    authors: (useJa && authors.ja.length > 0 ? authors.ja : authors.en).map((name) => ({ name, affiliationKeys: [] })),
    affiliations: [],
    emails: [],
    captions: [],
    references: [],
  };
  const trustedFields: FieldName[] = ["title", "authors"];
  if (input.fullTextJats) {
    const jats = parseJatsFields(input.fullTextJats);
    if (jats.affiliations.length > 0 && jats.authors.some((a) => a.affiliationKeys.length > 0)) {
      fields.authors = jats.authors;
      fields.affiliations = jats.affiliations;
      trustedFields.push("authorAffiliation");
    }
    if (jats.captions.length > 0) { fields.captions = jats.captions; trustedFields.push("captions"); }
    if (jats.references.length > 0) { fields.references = jats.references; trustedFields.push("references"); }
  }
  return { fields, trustedFields };
}
