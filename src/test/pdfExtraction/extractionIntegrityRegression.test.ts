/**
 * App-path regression on real CC-licensed papers from the field-gold corpus
 * (gitignored PDFs; skipped when absent). Each case is a defect found by the
 * extraction audit (docs/EXTRACTION_INTEGRITY_AUDIT.md). Warned-paragraph
 * ceilings are the measured values after the fix: a change that breaks more
 * paragraphs than that fails here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPageColumns } from "../../services/pdfLayout";
import { enhanceReferencesWithCrf } from "../../services/pdfExtraction/crf/applyReferences";
import { loadNodeCrfRuntime } from "../../services/pdfExtraction/crf/nodeRuntime";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { extractPdfPages } from "../readingOrder/extractPdf";

const root = path.resolve(import.meta.dirname, "../../..");
const pdfOf = (id: string): string | null => {
  const gold = path.join(root, "test-data/field-gold", id, "gold.json");
  if (!fs.existsSync(gold)) return null;
  const pdf = path.join(root, (JSON.parse(fs.readFileSync(gold, "utf8")) as { pdfPath: string }).pdfPath);
  return fs.existsSync(pdf) ? pdf : null;
};
async function extract(id: string) {
  const pdf = pdfOf(id)!;
  const pages = await extractPdfPages(pdf);
  const result = extractFromPages({ pages, paperId: id, filePath: pdf, fileHash: id, metadata: { pageCount: pages.length } });
  // Same post-projection step as extractAcademicPdf.
  await enhanceReferencesWithCrf(result, pages, loadNodeCrfRuntime);
  const paragraphs = result.blocks.filter((b) => b.type === "paragraph");
  return { pages, paragraphs, warned: paragraphs.filter((b) => typeof b.metadata.translationInputWarning === "string").length };
}

describe("extraction integrity on real papers", () => {
  it("reads narrow-gutter two-column pages as two columns (no interleaved lines)", async (ctx) => {
    if (!pdfOf("epmc-PMC12885475")) ctx.skip();
    const { pages, paragraphs, warned } = await extract("epmc-PMC12885475");
    expect(detectPageColumns(pages[1]).isMultiColumn).toBe(true);
    expect(paragraphs.some((b) => /focus on different This pattern suggests/.test(b.original ?? ""))).toBe(false);
    expect(warned).toBeLessThanOrEqual(5);
  }, 60_000);

  it("drops running heads assembled from several repeated pieces", async (ctx) => {
    if (!pdfOf("epmc-PMC11003102")) ctx.skip();
    const { paragraphs, warned } = await extract("epmc-PMC11003102");
    expect(paragraphs.some((b) => /BMC Psychology \(2024\) 12:195/.test(b.original ?? ""))).toBe(false);
    // Paragraphs separated only by a first-line indent stay separate, and line-break hyphens are gone.
    const opening = paragraphs.find((b) => /^Work environment globally is rapidly evolving/.test(b.original ?? ""));
    expect(opening?.original).not.toMatch(/PSC is an organisational culture/);
    expect(opening?.original).toMatch(/have experienced violence/);
    expect(warned).toBeLessThanOrEqual(9);
  }, 60_000);

  it("translates lead-ins and where-clauses around display equations", async (ctx) => {
    if (!pdfOf("epmc-PMC13586154")) ctx.skip();
    const { paragraphs, warned } = await extract("epmc-PMC13586154");
    const leadIns = paragraphs.filter((b) => /Eq\. \d:$/.test((b.original ?? "").trim()));
    expect(leadIns.length).toBeGreaterThanOrEqual(6);
    expect(leadIns.filter((b) => b.metadata.translationInputWarning)).toEqual([]);
    expect(paragraphs.filter((b) => /^where θ denotes/.test(b.original ?? "") && b.metadata.translationInputWarning)).toEqual([]);
    expect(warned).toBeLessThanOrEqual(7);
  }, 60_000);

  for (const [id, ceiling] of [
    ["epmc-PMC12094662", 4],
    ["epmc-PMC13551842", 26],
    ["arxiv-2509.25460", 8],
  ] as const) {
    it.skipIf(!pdfOf(id))(`${id} keeps warned paragraphs at or below ${ceiling}`, async () => {
      expect((await extract(id)).warned).toBeLessThanOrEqual(ceiling);
    }, 60_000);
  }
});
