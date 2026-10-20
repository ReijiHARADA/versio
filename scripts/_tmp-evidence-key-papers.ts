import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const outDir = "test-data/extraction-evidence";
fs.mkdirSync(outDir, { recursive: true });
const needles = [
  "advanced-security-framework-for-5g",
  "epmc-effect-of-simulation",
  "ai-assisted-clinical-documentation",
  "multi-way-radial-consistency",
];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
const report: Array<Record<string, unknown>> = [];

for (const needle of needles) {
  const f = files.find((x) => x.includes(needle));
  if (!f) {
    report.push({ needle, missing: true });
    continue;
  }
  const pages = await extractPdfPages(path.join(dir, f));
  const r = extractFromPages({
    pages,
    paperId: f,
    filePath: f,
    fileHash: f,
    metadata: { pageCount: pages.length },
  });
  const nodes = r.canonical.nodes;
  const entry = {
    file: f,
    title: r.paper.titleOriginal,
    authors: r.paper.authors,
    abstractHead: (r.paper.abstract || nodes.find((n) => n.role === "abstract")?.text || "")
      .replace(/\s+/g, " ")
      .slice(0, 220),
    headings: nodes
      .filter((n) => n.role === "heading")
      .slice(0, 12)
      .map((n) => ({ p: n.pageStart, t: (n.text || "").slice(0, 80) })),
    captions: nodes
      .filter((n) => /caption/i.test(String(n.role)))
      .slice(0, 8)
      .map((n) => ({
        role: n.role,
        p: n.pageStart,
        t: (n.text || "").replace(/\s+/g, " ").slice(0, 100),
      })),
    earlyParas: nodes
      .filter((n) => n.role === "paragraph" && (n.pageStart ?? 1) <= 2)
      .slice(0, 6)
      .map((n) => (n.text || "").replace(/\s+/g, " ").slice(0, 140)),
    scrambleFlags: nodes.filter(
      (n) =>
        /quasi-\s*of complications|Protected by copyright/i.test(n.text || "") &&
        n.role === "paragraph",
    ).length,
  };
  report.push(entry);
  console.log(
    JSON.stringify({
      f: f.slice(0, 55),
      title: String(entry.title || "").slice(0, 70),
      nAuth: entry.authors?.length ?? 0,
      scramble: entry.scrambleFlags,
      caps: entry.captions.length,
    }),
  );
}

const outPath = path.join(outDir, "key-papers-2026-10-19.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("wrote", outPath);
