/**
 * Broad extraction triage beyond the catalog baseline (catalog + pending PDFs).
 * Scores structural risks without requiring ground-truth titles.
 */
import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

type Finding = {
  id: string;
  source: "catalog" | "pending" | "path";
  pages: number;
  title: string;
  headings: number;
  paragraphs: number;
  score: number;
  flags: string[];
  samples: string[];
};

const root = path.resolve(".");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: Array<{ id: string; filename: string }> };
const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
const onlyPending = process.argv.includes("--pending-only");
const onlyCatalog = process.argv.includes("--catalog-only");

const jobs: Array<{ id: string; pdfPath: string; source: Finding["source"] }> = [];
if (!onlyPending) {
  for (const paper of catalog.papers) {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (fs.existsSync(pdfPath)) jobs.push({ id: paper.id, pdfPath, source: "catalog" });
  }
}
if (!onlyCatalog && fs.existsSync(pendingDir)) {
  // `_quarantine/` is a subdirectory, so only top-level PDFs are scored.
  for (const name of fs.readdirSync(pendingDir).filter((n) => n.endsWith(".pdf"))) {
    jobs.push({
      id: name.replace(/\.pdf$/i, ""),
      pdfPath: path.join(pendingDir, name),
      source: "pending",
    });
  }
}

const selected = jobs.slice(0, Number.isFinite(limit) ? limit : jobs.length);
const findings: Finding[] = [];

const lowercaseColonHeading = /^[a-z][\w'’ -]{0,40}:$/;
const chromeLike =
  /^(?:doi:|https?:|©|copyright|downloaded from|licensed under|creative commons|all rights reserved)\b/i;
const pageNumberOnly = /^(?:page\s*)?\d{1,3}$/i;

for (let index = 0; index < selected.length; index += 1) {
  const job = selected[index]!;
  process.stderr.write(`[wide] ${index + 1}/${selected.length} ${job.id}\n`);
  try {
    const pages = await extractPdfPages(job.pdfPath);
    const result = extractFromPages({
      pages,
      paperId: job.id,
      filePath: job.pdfPath,
      fileHash: job.id,
      metadata: { pageCount: pages.length },
    });
    const nodes = result.canonical.nodes;
    const titleNode = nodes.find((n) => n.role === "title");
    const headings = nodes.filter((n) => n.role === "heading");
    const paragraphs = nodes.filter((n) => n.role === "paragraph");
    const flags: string[] = [];
    const samples: string[] = [];
    let score = 0;

    if (!titleNode?.text?.trim()) {
      flags.push("missing-title");
      score += 8;
    } else if (chromeLike.test(titleNode.text) || titleNode.text.length < 12) {
      flags.push("weak-title");
      samples.push(`title:${titleNode.text.slice(0, 100)}`);
      score += 5;
    }

    const badHeadings = headings.filter((h) => {
      const t = (h.text ?? "").trim();
      return (
        lowercaseColonHeading.test(t) ||
        pageNumberOnly.test(t) ||
        /^\p{L}{2,14}\.$/u.test(t) ||
        (t.length <= 2 && !/^\d+$/.test(t))
      );
    });
    if (badHeadings.length) {
      flags.push(`spurious-heading:${badHeadings.length}`);
      score += Math.min(12, badHeadings.length * 3);
      for (const h of badHeadings.slice(0, 3)) {
        samples.push(`heading@${h.pageStart}:${(h.text ?? "").slice(0, 80)}`);
      }
    }

    const chromeParas = paragraphs.filter((p) => chromeLike.test((p.text ?? "").trim()));
    if (chromeParas.length >= 3) {
      flags.push(`chrome-paragraphs:${chromeParas.length}`);
      score += Math.min(6, chromeParas.length);
    }

    const emptyParas = paragraphs.filter((p) => !(p.text ?? "").trim());
    if (emptyParas.length) {
      flags.push(`empty-paragraph:${emptyParas.length}`);
      score += Math.min(4, emptyParas.length);
    }

    // Body text stuck as heading (long Title Case line with sentence punctuation).
    const proseHeadings = headings.filter((h) => {
      const t = (h.text ?? "").trim();
      return t.length > 90 && /[.!?]$/.test(t) && !/^\d+(?:\.\d+)*\s/.test(t);
    });
    if (proseHeadings.length) {
      flags.push(`prose-as-heading:${proseHeadings.length}`);
      score += proseHeadings.length * 4;
      samples.push(`proseHeading:${(proseHeadings[0]?.text ?? "").slice(0, 100)}`);
    }

    // True section glue: marker after sentence end / em-dash. Exclude Springer
    // "Abstract. …" chapter lead-ins and mid-prose "Results are…".
    const sectionMarker =
      /(?:^|[.!?]\s+|—|–)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions)(?!\.)(?:\s+[—–-]|[—–-]|\s+[A-Z])/;
    const glued = paragraphs.filter((p) => {
      const t = p.text ?? "";
      // Bibliography / review-title lines often contain "… review, J." etc.
      if (/^\s*\[\d+\]/.test(t) || /\(\d{4}[a-z]?\)\s*\.?$/.test(t.trim())) return false;
      // Multi-citation blobs: "Hayes (2013). Introduction to…" / "Res. Methods Instrum."
      if ((t.match(/\(\d{4}[a-z]?\)/g) ?? []).length >= 2) return false;
      if (/\(\d{4}[a-z]?\)\.\s+Introduction to\b/i.test(t)) return false;
      if (/\b(?:Res\.|Instrum\.|Comput\.)\s+Methods\b/i.test(t)) return false;
      if (/^(?:Abstract|Introduction)\.\s/.test(t)) return false;
      // TOC crumbs such as `Introduction J5` / `Methods 12`.
      if (/\b(?:Abstract|Introduction|Methods|Results|Discussion|Conclusions)\s+[A-Z]?\d{1,3}\b/.test(t) &&
        t.split(/\s+/).length <= 6) return false;
      if (/\bResults?\s+(?:are|show|showed|indicate|suggest|presented)\b/i.test(t) &&
        !/\.\s+(?:Results|Discussion|Methods)\s+[A-Z]/.test(t)) return false;
      return sectionMarker.test(t);
    });
    if (glued.length) {
      flags.push(`embedded-section-marker:${glued.length}`);
      score += Math.min(8, glued.length * 2);
      samples.push(`glued:${(glued[0]?.text ?? "").slice(0, 100)}`);
    }

    // Diagram crumbs promoted to headings (Q, VM, PA:).
    const microHeadings = headings.filter((h) => {
      const t = (h.text ?? "").trim();
      return /^[A-Za-z]{1,3}$/.test(t) || /^[A-Z]{1,6}\s*:$/.test(t) ||
        (/^[A-Z][A-Za-z0-9/+-]{0,5}$/.test(t) && t.length <= 6 && !/^\d/.test(t));
    });
    if (microHeadings.length) {
      flags.push(`micro-heading:${microHeadings.length}`);
      score += Math.min(12, microHeadings.length * 2);
      samples.push(`micro:${microHeadings.slice(0, 4).map((h) => h.text).join("|")}`);
    }

    // Title looks like a keyword list or degree boilerplate.
    const titleText = (titleNode?.text ?? "").trim();
    if (titleText && ((titleText.match(/,/g) ?? []).length >= 4 ||
      /^(?:doctor of philosophy|phd thesis|keywords?\b)/i.test(titleText))) {
      flags.push("keywords-or-degree-title");
      score += 6;
      samples.push(`badTitle:${titleText.slice(0, 100)}`);
    }

    // Filename/id tokens should overlap a real article title (weak signal).
    if (titleText.length >= 16) {
      const stop = new Set([
        "a", "an", "the", "of", "and", "or", "in", "on", "for", "to", "with", "from", "by",
        "using", "based", "study", "review", "paper", "pdf", "hci", "hfe", "covid", "ml",
      ]);
      const tokens = (value: string) =>
        value.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !stop.has(w));
      const idTokens = tokens(job.id);
      const titleTokens = new Set(tokens(titleText));
      const overlap = idTokens.filter((t) => titleTokens.has(t)).length;
      if (idTokens.length >= 3 && overlap === 0 && /[A-Za-z]{4,}/.test(titleText)) {
        flags.push("title-id-mismatch");
        score += 3;
        samples.push(`mismatch:${titleText.slice(0, 80)}`);
      }
    }

    // Long papers with almost no section headings are usually under-structured.
    if (pages.length >= 8 && headings.length < 3) {
      flags.push(`sparse-headings:${headings.length}`);
      score += 4;
    }

    // Person-shaped page-1 headings (author rows mislabeled as sections).
    const authorHeadings = headings.filter((h) => {
      const t = (h.text ?? "").trim();
      return h.pageStart === 1 &&
        /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3}$/.test(t) &&
        t.length <= 40 &&
        !/\b(?:Abstract|Introduction|Related|Methods|Results|Discussion|Conclusion|Keywords?|Acceptability|Concepts)\b/i.test(t);
    });
    if (authorHeadings.length >= 2) {
      flags.push(`author-as-heading:${authorHeadings.length}`);
      score += Math.min(6, authorHeadings.length * 2);
      samples.push(`authorH:${authorHeadings.slice(0, 2).map((h) => h.text).join("|")}`);
    }

    // Captions without any figure/table neighbour on the same page.
    const captions = nodes.filter((n) => n.role === "caption");
    const orphanCaptions = captions.filter((c) => {
      const page = c.pageStart;
      return !nodes.some((n) =>
        n.pageStart === page &&
        (n.role === "figure" || n.role === "table" || (n.role === "other" && /fig|table|図|表/i.test(n.text ?? "")))
      );
    });
    if (orphanCaptions.length >= 3) {
      flags.push(`orphan-caption:${orphanCaptions.length}`);
      score += Math.min(6, orphanCaptions.length);
      samples.push(`orphanCap:${(orphanCaptions[0]?.text ?? "").slice(0, 80)}`);
    }

    findings.push({
      id: job.id,
      source: job.source,
      pages: pages.length,
      title: (titleNode?.text ?? "").slice(0, 160),
      headings: headings.length,
      paragraphs: paragraphs.length,
      score,
      flags,
      samples,
    });
  } catch (error) {
    findings.push({
      id: job.id,
      source: job.source,
      pages: 0,
      title: "",
      headings: 0,
      paragraphs: 0,
      score: 100,
      flags: [`extract-error:${error instanceof Error ? error.message.slice(0, 120) : String(error)}`],
      samples: [],
    });
  }
}

findings.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
const flagged = findings.filter((f) => f.score > 0);
const report = {
  version: "extraction-wide-corpus-v1",
  generatedAt: new Date().toISOString(),
  scanned: findings.length,
  catalog: findings.filter((f) => f.source === "catalog").length,
  pending: findings.filter((f) => f.source === "pending").length,
  flagged: flagged.length,
  clean: findings.length - flagged.length,
  top: findings.slice(0, 40),
  byFlag: Object.fromEntries(
    [...new Set(flagged.flatMap((f) => f.flags.map((flag) => flag.split(":")[0]!)))].map(
      (name) => [name, flagged.filter((f) => f.flags.some((flag) => flag.startsWith(name))).length]
    )
  ),
  findings,
};

const out = path.join(root, "test-data/real-papers/reports/extraction-wide-corpus-latest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  JSON.stringify(
    {
      output: out,
      scanned: report.scanned,
      flagged: report.flagged,
      clean: report.clean,
      byFlag: report.byFlag,
      top: report.top.map((f) => ({
        id: f.id,
        source: f.source,
        score: f.score,
        flags: f.flags,
        title: f.title.slice(0, 80),
      })),
    },
    null,
    2
  ) + "\n"
);
