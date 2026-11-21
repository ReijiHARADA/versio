import type { ExtractedPage } from "../../pdfService";

type Line = { y: number; text: string };

function pageLines(page: ExtractedPage): Line[] {
  const items = [...page.textItems].filter((t) => t.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<Line & { items: typeof items }> = [];
  for (const item of items) {
    // Same baseline and horizontally adjacent: a two-column page or a header's
    // left/right halves (journal name vs. author names) stay separate lines.
    const line = lines.find((l) => {
      const last = l.items.at(-1)!;
      return Math.abs(l.y - item.y) < 2 && item.x - (last.x + last.width) < 20;
    });
    if (line) line.items.push(item);
    else lines.push({ y: item.y, text: "", items: [item] });
  }
  return lines.map((l) => ({ y: l.y, text: l.items.sort((a, b) => a.x - b.x).map((t) => t.text.trim()).join(" ").replace(/\s+/g, " ") }));
}

// Generic words only: publisher names belong in Format Profiles (formats/).
const VENUE_WORD =
  /\b(?:journal|proceedings|annals|review|letters|transactions|reports|bulletin|medicine|health|science|research|psycholog\w*|open|international|conference|acta|archives)\b/i;
/** A short masthead-style name: `Xxx in Yyy and AI`, `XXXX ONE`. */
const TITLE_PHRASE = /^[A-Z][\p{L}-]*(?: (?:in|of|and|for|the|&|[A-Z][\p{L}-]*)){1,5}$/u;
// Two-author running heads (`Limbu and Gautam`) and manuscript stamps are not venues.
const NOT_VENUE = /^[A-Z][\p{L}'’-]+ and [A-Z][\p{L}'’-]+$|\b(?:manuscript|in press|preprint)\b/iu;
const isVenueLike = (venue: string) => !NOT_VENUE.test(venue) && (VENUE_WORD.test(venue) || TITLE_PHRASE.test(venue));

/** A running-header/footer segment reduced to the journal name it carries. */
export function cleanRunningVenue(text: string): string {
  return text
    .replace(/^.*\bet al\.?,?\s*/i, "")
    .replace(/\b(?:doi|https?:|www\.).*$/i, "")
    .replace(/\S+\.(?:org|com|net|edu)\S*/gi, "")
    .replace(/\b(?:page\s+)?\d+\s+of\s+\d+\b/gi, "")
    .replace(/\b(?:vol(?:ume)?|no|issue)\.?\s*\d+/gi, "")
    .replace(/\be?\d[\d():;.,–-]*/g, "")
    .replace(/[|,;:()•·]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}]+/u, "")
    .trim();
}

/**
 * Journal / conference name printed on the page: the page-one
 * `Proceedings of …, pages N–M` line (ACL, ACM), otherwise the journal name
 * repeated in the running header or footer of most pages.
 */
/**
 * The article DOI in page 1's raw text, including the running header/footer
 * (`PLOS Computational Biology | https://doi.org/10.1371/…`), which never
 * becomes a document node. A fallback for when the projection found none.
 */
export function findDoi(pages: ExtractedPage[]): string | null {
  if (!pages.length) return null;
  const text = pageLines(pages[0]).map((line) => line.text).join(" ");
  const match = text.match(/(?:\bdoi\s*:?\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
  return match ? match[1].replace(/[.,;:]+$/, "") : null;
}

export function findVenue(pages: ExtractedPage[]): string | null {
  if (!pages.length) return null;
  const first = pageLines(pages[0]);
  const at = first.findIndex((l) => /\bProceedings of\b/.test(l.text));
  if (at >= 0) {
    const text = first.slice(at, at + 3).map((l) => l.text).join(" ").replace(/^.*?(?=\bProceedings of\b)/, "");
    // shortcut: without the ACL `pages N–M` end the line's extent is unknown
    // (ACM's two-column reference block), so it is skipped rather than cut mid-name.
    const venue = text.match(/^.*?\bpages\s+\d+\s*[–-]\s*\d+/)?.[0].trim();
    if (venue && venue.length <= 300) return venue;
  }
  if (pages.length < 3) return null;
  const seen = new Map<string, Set<number>>();
  pages.forEach((page, index) => {
    for (const line of pageLines(page)) {
      if (line.y > page.height * 0.09 && line.y < page.height * 0.92) continue;
      for (const segment of line.text.split("|")) {
        const venue = cleanRunningVenue(segment);
        if (venue.length < 4 || venue.length > 120 || !isVenueLike(venue)) continue;
        seen.set(venue, (seen.get(venue) ?? new Set()).add(index));
      }
    }
  });
  const best = [...seen].filter(([, on]) => on.size >= Math.ceil(pages.length * 0.5)).sort((a, b) => b[1].size - a[1].size || Number(VENUE_WORD.test(b[0])) - Number(VENUE_WORD.test(a[0])) || b[0].length - a[0].length)[0];
  return best?.[0] ?? null;
}
