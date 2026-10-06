import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "../readingOrder/extractPdf";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const pdf = path.join(root, "test-data/real-papers/power-over-skin.pdf");
const particlePdf = path.join(root, "test-data/real-papers/interactive-jewellery.pdf");
const acmPdf = path.join(root, "test-data/real-papers/ppg-earring.pdf");
const letteredAffiliationPdf = path.join(root, "test-data/real-papers/medical-deep-learning-meta-review.pdf");
const reviewerMastheadPdf = path.join(root, "test-data/real-papers/cognitive-dual-task.pdf");

describe("author masthead projection", () => {
  it("keeps same-baseline multi-column names separate and excludes locations", async () => {
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "power-over-skin",
      filePath: pdf,
      fileHash: "author-regression",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Andy Kong", "Daehwa Kim", "Chris Harrison"]));
    expect(result.paper.authors).not.toEqual(expect.arrayContaining(["Pittsburgh, USA"]));
  }, 60_000);

  it("splits adjacent authors when the second surname has a particle sequence", async () => {
    if (!fs.existsSync(particlePdf)) return;
    const pages = await extractPdfPages(particlePdf);
    const result = extractFromPages({
      pages,
      paperId: "interactive-jewellery",
      filePath: particlePdf,
      fileHash: "author-particle-regression",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Maarten Versteeg", "Elise van den Hoven", "Caroline Hummels"]));
    expect(result.paper.authors).not.toContain("Maarten Versteeg Elise van den Hoven");
  }, 60_000);

  it("keeps wrapped two-column affiliations in their source columns", async () => {
    if (!fs.existsSync(particlePdf)) return;
    const pages = await extractPdfPages(particlePdf);
    const result = extractFromPages({ pages, paperId: "interactive-jewellery-affiliations", filePath: particlePdf, fileHash: "affiliation-columns", metadata: { pageCount: pages.length } });
    const names = result.paper.affiliations.map((affiliation) => affiliation.name);
    expect(names).toHaveLength(4);
    expect(names.some((name) => /Industrial Design.*Eindhoven University of Technology.*The Netherlands/i.test(name))).toBe(true);
    expect(names.some((name) => /Faculty of Design.*Architecture.*Sydney Australia/i.test(name))).toBe(true);
    expect(names.some((name) => /Australian Research.*Macquarie University/i.test(name))).toBe(true);
    expect(names.some((name) => /Faculty of Design.*The Netherlands/i.test(name))).toBe(false);
  }, 60_000);

  it("uses a clean ACM reference-format author list when masthead columns overlap", async () => {
    if (!fs.existsSync(acmPdf)) return;
    const pages = await extractPdfPages(acmPdf);
    const result = extractFromPages({ pages, paperId: "ppg-earring", filePath: acmPdf, fileHash: "author-acm-regression", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining([
      "Qiuyue (Shirley) Xue", "Dilini Nissanka", "Jiachen Tammy Yan", "Ruiqing Wang", "Shwetak Patel", "Vikram Iyer",
    ]));
    expect(result.paper.authors.some((name) => /Seattle|Engineering|@/.test(name))).toBe(false);
  }, 60_000);

  it("splits lettered affiliation blocks from journal mastheads", async () => {
    if (!fs.existsSync(letteredAffiliationPdf)) return;
    const pages = await extractPdfPages(letteredAffiliationPdf);
    const result = extractFromPages({ pages, paperId: "medical-deep-learning-meta-review", filePath: letteredAffiliationPdf, fileHash: "lettered-affiliation-regression", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations).toHaveLength(6);
    expect(result.paper.affiliations.every((affiliation) => !/contents|lists available|article history/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /German Cancer Consortium/i.test(affiliation.name))).toBe(true);
  }, 60_000);

  it("does not project editor/reviewer chrome as an affiliation", async () => {
    if (!fs.existsSync(reviewerMastheadPdf)) return;
    const pages = await extractPdfPages(reviewerMastheadPdf);
    const result = extractFromPages({ pages, paperId: "reviewer-chrome-affiliation", filePath: reviewerMastheadPdf, fileHash: "reviewer-chrome", metadata: { pageCount: pages.length } });
    const names = result.paper.affiliations.map((affiliation) => affiliation.name);
    expect(names.every((name) => !/edited by|reviewed by|tongjian you|yi sun/i.test(name))).toBe(true);
    expect(names.every((name) => !/University of Massachusetts Boston/i.test(name))).toBe(true);
  }, 60_000);
});
