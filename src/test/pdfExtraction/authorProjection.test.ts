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
const interleavedAffiliationPdf = path.join(root, "test-data/real-papers/dont-mind-me.pdf");
const singleAuthorReportPdf = path.join(root, "test-data/real-papers/ergonomics-human-factors-and-ergonomics.pdf");
const brokenUnicodeTitlePdf = path.join(root, "test-data/real-papers/linguistics-the-role-of-applied-linguistics-and-language-discourse-analysis-in-eng.pdf");
const journalMastheadPdf = path.join(root, "test-data/real-papers/hci-human-computer-interaction.pdf");
const plosAffiliationPdf = path.join(root, "test-data/real-papers/hfe-healthcare-safety-review.pdf");
const wrappedAffiliationPdf = path.join(root, "test-data/real-papers/wear-scale.pdf");
const ieeeWrappedMastheadPdf = path.join(root, "test-fixtures/real-papers/pending-pdfs/hci-user-experience-design-using-machine-learning-a-systematic-review.pdf");

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
    expect(result.paper.affiliations.some((affiliation) => /Paul G\. Allen School.*University of Washington/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.every((affiliation) => !/Figure 1|smartphone app|real-time PPG/i.test(affiliation.name))).toBe(true);
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
    expect(names).toHaveLength(4);
    expect(names.some((name) => /Applied Kinesiology.*University of Campinas/i.test(name))).toBe(true);
    expect(names.some((name) => /Laboratory of Electromyography.*University of Campinas/i.test(name))).toBe(true);
    expect(names.some((name) => /NIH Biomedical Research Center.*University of Maryland/i.test(name))).toBe(true);
  }, 60_000);

  it("separates numbered institutions from an interleaved author row", async () => {
    if (!fs.existsSync(interleavedAffiliationPdf)) return;
    const pages = await extractPdfPages(interleavedAffiliationPdf);
    const result = await extractFromPages({ pages, paperId: "interleaved-affiliation", filePath: interleavedAffiliationPdf, fileHash: "interleaved-affiliation", metadata: { pageCount: pages.length } });
    const names = result.paper.affiliations.map((affiliation) => affiliation.name);
    expect(result.paper.authors).toEqual(expect.arrayContaining([
      "Halley Profita", "James Clawson", "Thad Starner", "Jim Budd", "Scott Gilliland", "Clint Zeagler", "Ellen Yi-Luen Do",
    ]));
    expect(result.paper.authors).not.toContain("James Clawson Thad Starner");
    expect(names).toEqual(expect.arrayContaining([
      "Department of Computer Science",
      "University of Colorado",
      "Industrial Design",
      "Interactive Computing",
      "Georgia Institute of Technology",
    ]));
    expect(names.every((name) => !/Scott Gilliland|Clint Zeagler|Ellen Yi-Luen|\{jamer/i.test(name))).toBe(true);
  }, 60_000);

  it("recovers a single author from a flattened report masthead", async () => {
    if (!fs.existsSync(singleAuthorReportPdf)) return;
    const pages = await extractPdfPages(singleAuthorReportPdf);
    const result = await extractFromPages({ pages, paperId: "single-author-report", filePath: singleAuthorReportPdf, fileHash: "single-author-report", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toContain("Murali Krishna Pasupuleti");
    expect(result.paper.affiliations.some((affiliation) => /National Education Services/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations).not.toContainEqual(expect.objectContaining({ name: "M N" }));
    expect(result.paper.authors).not.toContain("Research Book Title :Human Factors and Ergonomics");
  }, 60_000);

  it("does not expose repeated-glyph ToUnicode output as the paper title", async () => {
    if (!fs.existsSync(brokenUnicodeTitlePdf)) return;
    const pages = await extractPdfPages(brokenUnicodeTitlePdf);
    const expected = "The role of applied linguistics and language discourse analysis in English language teaching";
    const result = await extractFromPages({ pages, paperId: "broken-unicode-title", filePath: brokenUnicodeTitlePdf, fileHash: "broken-unicode-title", metadata: { pageCount: pages.length } });
    expect(result.paper.titleOriginal).toBe(expected);
    expect(result.paper.titleOriginal).not.toMatch(/АПФАПФ|CIPCIP/i);
  }, 60_000);

  it("does not project journal metadata or body fragments as authors", async () => {
    if (!fs.existsSync(journalMastheadPdf)) return;
    const pages = await extractPdfPages(journalMastheadPdf);
    const result = await extractFromPages({ pages, paperId: "journal-masthead-boundary", filePath: journalMastheadPdf, fileHash: "journal-masthead-boundary", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(["Suvrunda Jadhav", "T.R. Patil"]);
    expect(result.paper.authors.some((name) => /field, common architectures|journal|issue|volume/i.test(name))).toBe(false);
    expect(result.paper.affiliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringMatching(/IT Department.*School of Engineering/i) }),
    ]));
    expect(result.paper.affiliations.some((affiliation) => /Vol\.\s*6|Issue 3/i.test(affiliation.name))).toBe(false);
  }, 60_000);

  it("recovers numbered institutions from a PLOS affiliation line", async () => {
    if (!fs.existsSync(plosAffiliationPdf)) return;
    const pages = await extractPdfPages(plosAffiliationPdf);
    const result = await extractFromPages({ pages, paperId: "plos-affiliation-fallback", filePath: plosAffiliationPdf, fileHash: "plos-affiliation-fallback", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringMatching(/Chinese Evidence-based Medicine Centre.*Sichuan University/i) }),
      expect.objectContaining({ name: expect.stringMatching(/School of Foreign Languages.*Sichuan University/i) }),
    ]));
  }, 60_000);

  it("stitches wrapped same-column masthead affiliations without absorbing body text", async () => {
    if (!fs.existsSync(wrappedAffiliationPdf)) return;
    const pages = await extractPdfPages(wrappedAffiliationPdf);
    const result = await extractFromPages({ pages, paperId: "wear-scale", filePath: wrappedAffiliationPdf, fileHash: "wrapped-affiliation-regression", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Changhyun Nam", "Young‑A Lee"]));
    expect(result.paper.affiliations.some((affiliation) => /Department.*Hospitality.*Management.*Iowa State University/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.every((affiliation) => !/Full list of author information|available online/i.test(affiliation.name))).toBe(true);
  }, 60_000);

  it("separates an IEEE author row that swallows its faculty line", async () => {
    if (!fs.existsSync(ieeeWrappedMastheadPdf)) return;
    const pages = await extractPdfPages(ieeeWrappedMastheadPdf);
    const result = await extractFromPages({ pages, paperId: "ieee-wrapped-masthead", filePath: ieeeWrappedMastheadPdf, fileHash: "ieee-wrapped-masthead", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["ABDALLAH M. H. ABBAS", "KHAIRIL IMRAN GHAUTH", "CHOO-YEE TING"]));
    expect(result.paper.authors.every((name) => !/Faculty|Multimedia|Malaysia|Corresponding/i.test(name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /Faculty of Computing.*Multimedia University/i.test(affiliation.name))).toBe(true);
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /associate editor coordinating/i.test(node.text ?? ""))).toBe(false);
  }, 60_000);
});
