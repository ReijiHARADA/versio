/** Ported from GROBID 0.9.1 CitationParser.java (Apache-2.0), modified. */
import { decode } from "./wapiti";
import { crfRuntime } from "./runtime";
import { citationFeatureRows } from "./citationFeatures";
import { tokenizeGrobid, isGrobidWhitespace } from "./tokenize";

export type Citation = { raw: string; title?: string; year?: string; doi?: string; authors?: string; journal?: string; rejected?: true };
const clean = (value: string) => value.replace(/\s+([,.;:)\]])/g, "$1").replace(/([\[(])\s+/g, "$1").replace(/\s+/g, " ").trim();

export function parseCitation(raw: string): Citation {
  const all = tokenizeGrobid(raw); const tokens = all.filter((token) => !isGrobidWhitespace(token));
  if (!tokens.length) return { raw };
  const labels = decode(crfRuntime().citation, citationFeatureRows(all, crfRuntime().lexicons));
  const fields = new Map<string, string[]>();
  labels.forEach((label, i) => { const key = label.replace(/^I-/, "").replace(/[<>]/g, ""); if (key && key !== "other") (fields.get(key) ?? fields.set(key, []).get(key)!).push(tokens[i]); });
  const get = (...keys: string[]) => clean(keys.flatMap((key) => fields.get(key) ?? []).join(" ")) || undefined;
  const pubnum = get("pubnum"); const doi = pubnum?.match(/10\.\S+/i)?.[0] ?? raw.match(/10\.\d{4,9}\/[\w.()/:;-]+/i)?.[0];
  // BiblioItem.rejectAsReference: no title-like field, no author-like field, no URL/DOI.
  const rejected = !get("title", "booktitle", "journal") && !get("author", "collaboration") && !get("web") && !doi && !/(https?|ftp)\s?:\s?\/\/|www\s?\./i.test(raw);
  return { raw, ...(rejected ? { rejected: true as const } : {}), ...(get("title") ? { title: get("title") } : {}), ...(get("date")?.match(/[12]\d{3}/)?.[0] ? { year: get("date")!.match(/[12]\d{3}/)![0] } : {}), ...(doi ? { doi: doi.replace(/[.)]+$/, "") } : {}), ...(get("author") ? { authors: get("author") } : {}), ...(get("journal") ? { journal: get("journal") } : {}) };
}
