import type { Paper } from "../../types/paper";

type EntryKind = "article" | "inproceedings" | "preprint" | "book" | "misc";

function entryKind(paper: Paper): EntryKind {
  const type = paper.bibliography?.entryType;
  if (type) return type;
  if (paper.bibliography?.arxivId) return "preprint";
  return paper.publication ? "article" : "misc";
}

function lastName(author: string): string {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function asciiWord(value: string): string {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
}

/** `vaswani2017attention` style keys; duplicates get a/b/c suffixes. */
export function citationKeys(papers: Paper[]): string[] {
  const seen = new Map<string, number>();
  return papers.map((paper) => {
    const author = asciiWord(lastName(paper.authors[0] ?? "")).toLowerCase();
    const word =
      (paper.titleOriginal ?? "")
        .split(/\s+/)
        .map((w) => asciiWord(w).toLowerCase())
        .find((w) => w.length > 3 && !["with", "from", "that", "this", "towards"].includes(w)) ?? "";
    const base = `${author || "paper"}${paper.year ?? ""}${word}` || paper.id;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}${String.fromCharCode(96 + count)}`;
  });
}

function bibValue(value: string): string {
  return value.replace(/\\/g, "\\textbackslash{}").replace(/([{}&%$#_])/g, "\\$1");
}

export function toBibTeX(papers: Paper[]): string {
  const keys = citationKeys(papers);
  return papers
    .map((paper, index) => {
      const bib = paper.bibliography ?? {};
      const kind = entryKind(paper);
      const type = kind === "preprint" ? "misc" : kind;
      const fields: Array<[string, string | number | null | undefined]> = [
        ["title", paper.titleOriginal],
        ["author", paper.authors.join(" and ")],
        [kind === "inproceedings" ? "booktitle" : kind === "article" ? "journal" : "howpublished", paper.publication],
        ["year", paper.year],
        ["volume", bib.volume],
        ["number", bib.issue],
        ["pages", bib.pages?.replace(/\s*[-–—]+\s*/g, "--")],
        ["publisher", bib.publisher],
        ["doi", paper.doi],
        ["url", bib.url],
        ...(bib.arxivId
          ? ([
              ["eprint", bib.arxivId],
              ["archivePrefix", "arXiv"],
            ] as Array<[string, string]>)
          : []),
      ];
      const body = fields
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
        .map(([name, value]) => {
          const raw = String(value);
          // DOI / URL / eprint are verbatim in BibTeX; escaping would corrupt them.
          const text = ["doi", "url", "eprint"].includes(name) ? raw : bibValue(raw);
          return `  ${name} = {${text}}`;
        })
        .join(",\n");
      return `@${type}{${keys[index]},\n${body}\n}`;
    })
    .join("\n\n")
    .concat("\n");
}

const RIS_TYPES: Record<EntryKind, string> = {
  article: "JOUR",
  inproceedings: "CPAPER",
  preprint: "UNPB",
  book: "BOOK",
  misc: "GEN",
};

export function toRIS(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const bib = paper.bibliography ?? {};
      const kind = entryKind(paper);
      const [start, end] = (bib.pages ?? "").split(/\s*[-–—]+\s*/);
      const lines: Array<[string, string | number | null | undefined]> = [
        ["TY", RIS_TYPES[kind]],
        ["TI", paper.titleOriginal],
        ...paper.authors.map((author): [string, string] => ["AU", author]),
        [kind === "inproceedings" ? "T2" : "JO", paper.publication],
        ["PY", paper.year],
        ["VL", bib.volume],
        ["IS", bib.issue],
        ["SP", start],
        ["EP", end],
        ["PB", bib.publisher],
        ["DO", paper.doi],
        ["UR", bib.url],
      ];
      return lines
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
        .map(([tag, value]) => `${tag}  - ${String(value).replace(/\s+/g, " ").trim()}`)
        .concat("ER  - ")
        .join("\r\n");
    })
    .join("\r\n\r\n")
    .concat("\r\n");
}
