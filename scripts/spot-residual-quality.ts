/**
 * Residual quality probe beyond wide-corpus heuristic flags.
 * Usage: npx tsx scripts/spot-residual-quality.ts [--limit=60] [--offset=0]
 */
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const offsetArg = process.argv.find((a) => a.startsWith("--offset="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 60;
const offset = offsetArg ? Number(offsetArg.slice("--offset=".length)) : 0;

const COUNTRY_OR_AFFIL =
  /^(?:united\s+kingdom|united\s+states|usa|u\.s\.a\.|england|scotland|wales|ireland|canada|australia|germany|france|italy|spain|china|japan|korea|india|brazil|netherlands|sweden|norway|denmark|finland|switzerland|austria|belgium|portugal|poland|russia|mexico|singapore|taiwan|hong\s+kong)$/i;
const AFFIL_LEAK =
  /university|department|institute|school of|college of|hospital|laboratory|@|correspond|faculty of|centre for|center for/i;

const dir = "test-fixtures/real-papers/pending-pdfs";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
const sample: string[] = [];
const stride = Math.max(1, Math.floor(files.length / Math.max(limit, 1)));
for (let i = offset; i < files.length && sample.length < limit; i += stride) {
  sample.push(files[i]!);
}

const stats = {
  n: 0,
  noAbs: 0,
  noTitle: 0,
  shortTitle: 0,
  noAuthors: 0,
  authorLooksLikeAffil: 0,
  countryAsAuthor: 0,
  titleIsChrome: 0,
  emptyCaption: 0,
  errors: 0,
};
const noAbsIds: Array<Record<string, unknown>> = [];
const odd: Array<Record<string, unknown>> = [];

function hasAbstract(r: {
  paper?: { abstract?: string };
  canonical: { nodes: Array<{ role?: string; sectionId?: string; text?: string }> };
}): boolean {
  if ((r.paper?.abstract || "").trim()) return true;
  return r.canonical.nodes.some((n) => {
    const role = String(n.role || "");
    return role === "abstract" || role.includes("abstract");
  });
}

async function main() {
  for (const f of sample) {
    const pdf = path.join(dir, f);
    try {
      const pages = await extractPdfPages(pdf);
      const r = extractFromPages({
        pages,
        paperId: f,
        filePath: pdf,
        fileHash: f,
        metadata: { pageCount: pages.length },
      });
      const title =
        String(
          r.paper?.title ||
            r.canonical.nodes.find((n) => n.role === "title")?.text ||
            ""
        ).trim();
      const authors: string[] = (r.paper?.authors || []).map((a: unknown) =>
        typeof a === "string" ? a : String((a as { name?: string })?.name || a)
      );
      const headings = r.canonical.nodes
        .filter((n) => n.role === "heading")
        .map((n) => ({ t: n.text, p: n.pageStart }));
      const emptyCaps = r.canonical.nodes.filter(
        (n) =>
          (n.role === "caption" || n.role === "table-caption" || n.role === "figure-caption") &&
          !(n.text || "").trim()
      );

      stats.n++;
      if (!title) {
        stats.noTitle++;
        odd.push({ f, kind: "noTitle" });
      } else if (title.length < 20) {
        stats.shortTitle++;
        odd.push({ f, kind: "shortTitle", title });
      }
      if (/^(doi:|https?:|©|copyright)/i.test(title)) {
        stats.titleIsChrome++;
        odd.push({ f, kind: "titleChrome", title: title.slice(0, 80) });
      }
      if (!authors.length) {
        stats.noAuthors++;
        odd.push({ f, kind: "noAuthors", title: title.slice(0, 60) });
      }
      for (const a of authors) {
        if (COUNTRY_OR_AFFIL.test(a.trim())) {
          stats.countryAsAuthor++;
          odd.push({ f, kind: "countryAsAuthor", a, title: title.slice(0, 50) });
        } else if (AFFIL_LEAK.test(a)) {
          stats.authorLooksLikeAffil++;
          odd.push({ f, kind: "authorAffil", a, title: title.slice(0, 50) });
        }
      }
      if (!hasAbstract(r)) {
        stats.noAbs++;
        if (noAbsIds.length < 15) {
          noAbsIds.push({
            f: f.slice(0, 72),
            title: title.slice(0, 72),
            pages: pages.length,
            earlyHead: headings.slice(0, 6).map((h) => h.t),
            authors: authors.slice(0, 6),
          });
        }
      }
      if (emptyCaps.length) {
        stats.emptyCaption += emptyCaps.length;
        odd.push({ f, kind: "emptyCaption", n: emptyCaps.length });
      }
    } catch (e) {
      stats.errors++;
      odd.push({ f, kind: "error", msg: String(e).slice(0, 160) });
    }
  }
  console.log(JSON.stringify({ stats, noAbsIds, odd: odd.slice(0, 50) }, null, 2));
}

main();
