import type { PaperBibliography } from "../../types/paper";

/** Fields a fetched record may fill; absent keys mean "no value from the source". */
export type BibliographicRecord = {
  title?: string;
  authors?: string[];
  publication?: string;
  year?: number;
  doi?: string;
  bibliography: PaperBibliography;
};

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function first(value: unknown): string | undefined {
  return Array.isArray(value) ? str(value[0]) : str(value);
}

function stripMarkup(value: string | undefined): string | undefined {
  return value ? str(value.replace(/<[^>]+>/g, "")) : undefined;
}

const CROSSREF_TYPES: Record<string, PaperBibliography["entryType"]> = {
  "journal-article": "article",
  "proceedings-article": "inproceedings",
  "posted-content": "preprint",
  book: "book",
  monograph: "book",
  "edited-book": "book",
};

type CrossrefAuthor = { given?: string; family?: string; name?: string };

export function parseCrossrefWork(json: string): BibliographicRecord {
  const message = (JSON.parse(json) as { message?: Record<string, unknown> }).message;
  if (!message) throw new Error("Crossref の応答を読み取れませんでした");
  const authors = ((message.author as CrossrefAuthor[] | undefined) ?? [])
    .map((author) => str(author.name) ?? str([author.given, author.family].filter(Boolean).join(" ")))
    .filter((name): name is string => Boolean(name));
  const dateParts = ["issued", "published-print", "published-online", "published"]
    .map((key) => (message[key] as { "date-parts"?: number[][] } | undefined)?.["date-parts"]?.[0]?.[0])
    .find((year) => typeof year === "number");
  const bibliography: PaperBibliography = {
    entryType: CROSSREF_TYPES[String(message.type)] ?? "misc",
    volume: str(message.volume),
    issue: str(message.issue),
    pages: str(message.page)?.replace(/-+/g, "–"),
    publisher: str(message.publisher),
    url: str(message.URL),
  };
  return {
    title: stripMarkup(first(message.title)),
    authors: authors.length ? authors : undefined,
    publication: first(message["container-title"]),
    year: dateParts,
    doi: str(message.DOI),
    bibliography: dropEmpty(bibliography),
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? str(decodeXml(match[1])) : undefined;
}

/** arXiv Atom feed (export.arxiv.org/api/query). Regex keeps it testable without a DOM. */
export function parseArxivAtom(xml: string, arxivId: string): BibliographicRecord {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const entryId = entry ? tag(entry, "id") : undefined;
  if (!entry || !entryId || entryId.includes("/api/errors")) {
    throw new Error("該当する論文が見つかりませんでした");
  }
  const authors = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
    .map((match) => tag(match[1], "name"))
    .filter((name): name is string => Boolean(name));
  const published = tag(entry, "published");
  const journalRef = tag(entry, "arxiv:journal_ref");
  const doi = tag(entry, "arxiv:doi");
  const id = arxivId.replace(/v\d+$/, "");
  return {
    title: tag(entry, "title"),
    authors: authors.length ? authors : undefined,
    publication: journalRef,
    year: published ? Number(published.slice(0, 4)) || undefined : undefined,
    doi: doi ?? `10.48550/arXiv.${id}`,
    bibliography: dropEmpty({
      entryType: journalRef ? "article" : "preprint",
      url: `https://arxiv.org/abs/${id}`,
      arxivId: id,
    }),
  };
}

function dropEmpty(bibliography: PaperBibliography): PaperBibliography {
  return Object.fromEntries(
    Object.entries(bibliography).filter(([, value]) => value !== undefined && value !== "")
  ) as PaperBibliography;
}
