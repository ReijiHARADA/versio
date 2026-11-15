import type { FieldName, FieldPrediction, FieldRecord } from "../types";
import { elements, first, removeElements, text } from "../xml";

const ALL_FIELDS: FieldName[] = ["title", "authors", "authorAffiliation", "emails", "captions", "references"];

function personName(author: string): string {
  const pers = first(author, "persName")?.inner ?? "";
  const forenames = elements(pers, "forename").map((e) => text(e.inner));
  const surname = text(first(pers, "surname")?.inner ?? "");
  return [...forenames, surname].filter(Boolean).join(" ");
}

function affiliationText(aff: string): string {
  const raw = elements(aff, "note").find((n) => n.attrs.type === "raw_affiliation");
  if (raw) return text(removeElements(raw.inner, "label"));
  const parts = [
    ...elements(aff, "orgName").map((e) => text(e.inner)),
    ...["settlement", "region", "country"].map((t) => text(first(aff, t)?.inner ?? "")),
  ];
  return parts.filter(Boolean).join(", ");
}

/** GROBID `processFulltextDocument` TEI → FieldRecord (header authors only; bibliography authors are ignored). */
export function parseGrobidFulltextTei(xml: string): FieldRecord {
  const header = first(xml, "teiHeader")?.inner ?? "";
  const titleEl = elements(first(header, "titleStmt")?.inner ?? "", "title").find((t) => t.attrs.type === "main") ?? first(first(header, "titleStmt")?.inner ?? "", "title");
  const analytic = first(first(header, "sourceDesc")?.inner ?? "", "analytic")?.inner ?? "";

  const affiliations = new Map<string, string>();
  const emails = new Set<string>();
  const authors: FieldRecord["authors"] = [];
  for (const author of elements(analytic, "author")) {
    const name = personName(author.inner);
    for (const email of elements(author.inner, "email")) emails.add(text(email.inner).toLowerCase());
    const keys: string[] = [];
    for (const aff of elements(author.inner, "affiliation")) {
      const key = aff.attrs.key ?? `aff${affiliations.size}`;
      if (!affiliations.has(key)) affiliations.set(key, affiliationText(aff.inner));
      keys.push(key);
    }
    if (name) authors.push({ name, affiliationKeys: keys });
  }

  const body = first(xml, "text")?.inner ?? "";
  const captions: FieldRecord["captions"] = elements(body, "figure").flatMap((fig) => {
    const kind = fig.attrs.type === "table" ? ("table" as const) : ("figure" as const);
    const desc = text(first(fig.inner, "figDesc")?.inner ?? "");
    if (!desc) return [];
    const label = text(first(fig.inner, "label")?.inner ?? "");
    return [{ kind, label: label ? `${kind === "table" ? "Table" : "Figure"} ${label}` : null, text: desc }];
  });

  const listBibl = first(body, "listBibl")?.inner ?? "";
  const references: FieldRecord["references"] = elements(listBibl, "biblStruct").map((b) => {
    const rawNote = elements(b.inner, "note").find((n) => n.attrs.type === "raw_reference");
    const titles = elements(b.inner, "title");
    const title = text((titles.find((t) => t.attrs.level === "a") ?? titles[0])?.inner ?? "") || undefined;
    const year = elements(b.inner, "date").map((d) => d.attrs.when?.slice(0, 4)).find(Boolean);
    const doi = elements(b.inner, "idno").find((i) => i.attrs.type === "DOI");
    return {
      raw: rawNote ? text(rawNote.inner) : text(b.inner),
      ...(title ? { title } : {}),
      ...(year ? { year } : {}),
      ...(doi ? { doi: text(doi.inner) } : {}),
    };
  });

  return {
    title: titleEl ? text(titleEl.inner) || null : null,
    authors,
    affiliations: [...affiliations].map(([key, value]) => ({ key, text: value })),
    emails: [...emails],
    captions,
    references,
  };
}

export function predictionFromGrobid(id: string, tei: string | null, elapsedMs: number, version: string): FieldPrediction {
  const empty: FieldRecord = { title: null, authors: [], affiliations: [], emails: [], captions: [], references: [] };
  return {
    id,
    parser: "grobid",
    parserVersion: version,
    elapsedMs,
    unavailableFields: tei ? [] : ALL_FIELDS,
    fields: tei ? parseGrobidFulltextTei(tei) : empty,
  };
}
