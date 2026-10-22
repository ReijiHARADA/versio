import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "../readingOrder/extractPdf";
import { extractFromPages } from "../../services/pdfExtraction/pipeline/extractAcademicPdf";
import { reconstructDocument } from "../../services/pdfLayout";

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
const registerPdf = path.join(root, "test-data/real-papers/linguistics-register.pdf");
const wearabilityPdf = path.join(root, "test-data/real-papers/design-for-wearability.pdf");
const virtualRealityPdf = path.join(root, "test-data/real-papers/ergonomics-6-virtual-reality-and-ergonomics-human-factors.pdf");
const medicalAffiliationStatementPdf = path.join(root, "test-data/real-papers/medical-image-segmentation-deep-learning.pdf");
const legacyConversationPdf = path.join(root, "test-data/real-papers/conversation-analysis-user-experience.pdf");
const cognitiveMotorMemoryPdf = path.join(root, "test-data/real-papers/cognitive-motor-memory.pdf");
const landingPagePdf = path.join(root, "test-data/real-papers/how-content-volume-landing-pages.pdf");
const gpt3AuthorsPdf = path.join(root, "test-data/real-papers/using-cognitive-psychology-gpt3.pdf");
const frontiersAndContinuationPdf = path.join(root, "test-data/real-papers/marketing-neuroconsumer.pdf");
const macedonianJournalPdf = path.join(root, "test-fixtures/real-papers/pending-pdfs/marketing-impact-of-e-marketing-on-consumer-behavior.pdf");
const frontiersNumberedMastheadPdf = path.join(root, "test-data/real-papers/cognitive-dual-task.pdf");
const mixedMastheadPdf = path.join(root, "test-data/real-papers/marketing-digital-marketing-consumer-behavior.pdf");

describe("author masthead projection", () => {
  it("recovers numbered Frontiers author continuations without locations", async () => {
    if (!fs.existsSync(frontiersNumberedMastheadPdf)) return;
    const pages = await extractPdfPages(frontiersNumberedMastheadPdf);
    const result = await extractFromPages({ pages, paperId: "frontiers-numbered-masthead", filePath: frontiersNumberedMastheadPdf, fileHash: "frontiers-numbered-masthead", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Vivian Castillo de Lima", "João Francisco Barbieri", "Hélio José Coelho-Júnior"]));
    expect(result.paper.authors).not.toEqual(expect.arrayContaining(["Campinas, Campinas, Brazil", "United States"]));
  }, 60_000);

  it("keeps a two-column Russian masthead title separate from affiliation text", async () => {
    if (!fs.existsSync(mixedMastheadPdf)) return;
    const pages = await extractPdfPages(mixedMastheadPdf);
    const reconstructed = reconstructDocument(pages);
    const titleBlocks = reconstructed.blocks.filter((block) => block.role === "title");
    expect(titleBlocks.some((block) => /ЦИФРОВОЙ МАРКЕТИНГ/.test(block.text))).toBe(true);
    expect(titleBlocks.some((block) => /ЦИФРОВОЙ МАРКЕТИНГ/.test(block.text) && /канд\. экон\. наук/.test(block.text))).toBe(false);
  }, 60_000);

  it("separates a title-case author from location lines flattened into one masthead node", async () => {
    if (!fs.existsSync(macedonianJournalPdf)) return;
    const pages = await extractPdfPages(macedonianJournalPdf);
    const result = await extractFromPages({ pages, paperId: "macedonian-journal-masthead", filePath: macedonianJournalPdf, fileHash: "macedonian-journal-masthead", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Lidija Pulevska Ivanovska", "Elena Karadakoska"]));
    expect(result.paper.authors.every((name) => !/Republic|Ohrid|Macedonia|Skopje/i.test(name))).toBe(true);
  }, 60_000);

  it("keeps a central Frontiers author row ending in `and`", async () => {
    if (!fs.existsSync(frontiersAndContinuationPdf)) return;
    const pages = await extractPdfPages(frontiersAndContinuationPdf);
    const result = extractFromPages({ pages, paperId: "frontiers-author-continuation", filePath: frontiersAndContinuationPdf, fileHash: "frontiers-author-continuation", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining([
      "Sanchit Pawar", "Asle Fagerstrøm", "Valdimar Sigurdsson", "Aurelija Burinskiene", "Erik Arntzen",
    ]));
  }, 60_000);

  it("recovers adjacent title-case authors from mixed email and location columns", async () => {
    if (!fs.existsSync(landingPagePdf)) return;
    const pages = await extractPdfPages(landingPagePdf);
    const result = extractFromPages({ pages, paperId: "landing-page-authors", filePath: landingPagePdf, fileHash: "landing-page-authors", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Ruti Gafni", "Nim Dvir"]));
    expect(result.paper.authors.some((name) => /@|Tel Aviv|Israel/i.test(name))).toBe(false);
    expect(result.paper.authorsStructured?.every((author) => !/@|Tel Aviv|Israel/i.test(author.name))).toBe(true);
  }, 60_000);

  it("promotes a same-line `and` author continuation in a two-column masthead", async () => {
    if (!fs.existsSync(gpt3AuthorsPdf)) return;
    const pages = await extractPdfPages(gpt3AuthorsPdf);
    const result = extractFromPages({ pages, paperId: "gpt3-authors", filePath: gpt3AuthorsPdf, fileHash: "gpt3-authors", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Marcel Binz", "Eric Schulz"]));
  }, 60_000);

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
    const expectedEn = "The role of applied linguistics and language discourse analysis in English language teaching";
    const result = await extractFromPages({ pages, paperId: "broken-unicode-title", filePath: brokenUnicodeTitlePdf, fileHash: "broken-unicode-title", metadata: { pageCount: pages.length } });
    // Bilingual PDFs may keep the clean Cyrillic cover title; either that or
    // the English rendering is fine so long as ToUnicode glyph garbage is out.
    expect(
      result.paper.titleOriginal === expectedEn ||
        /прикладной лингвистики/i.test(result.paper.titleOriginal ?? ""),
    ).toBe(true);
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
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /et al\.: User Experience Design Using Machine Learning/i.test(node.text ?? ""))).toBe(false);
    // IEEE ACCESS omits an Abstract heading; the front narrative must still
    // become an abstract before INDEX TERMS / I. INTRODUCTION.
    expect(result.canonical.nodes.some((node) => node.role === "abstract" && /User experience \(UX\) is the key/i.test(node.text ?? ""))).toBe(true);
    expect(result.canonical.nodes.some((node) => node.role === "heading" && /^I\.\s*INTRODUCTION$/i.test((node.text ?? "").trim()))).toBe(true);
  }, 60_000);

  it("demotes OSWORLD chart/flow chrome out of the outline", async () => {
    const osworldPdf = path.join(root, "test-data/real-papers/osworld-multimodal-agents.pdf");
    if (!fs.existsSync(osworldPdf)) return;
    const pages = await extractPdfPages(osworldPdf);
    const result = extractFromPages({ pages, paperId: "osworld-chrome", filePath: osworldPdf, fileHash: "osworld-chrome", metadata: { pageCount: pages.length } });
    const headings = result.canonical.nodes.filter((node) => node.role === "heading").map((node) => node.text ?? "");
    expect(headings.every((text) => !/Percentile|Tokens\d|Task Initial State Setup Config|Task Instruction\s*:/i.test(text))).toBe(true);
    expect(headings.every((text) => !/^(?:Results|Discussion)$/i.test(text.trim()))).toBe(true);
    expect(headings.every((text) => !/^Statistics$/i.test(text.trim()))).toBe(true);
    expect(headings.some((text) => /^1\s+Introduction$/i.test(text.trim()))).toBe(true);
    expect(headings.some((text) => /2\.2\.1\s+Overview/i.test(text))).toBe(true);
  }, 60_000);

  it("does not promote mid-sentence Discussion into an IEEE outline heading", async () => {
    if (!fs.existsSync(ieeeWrappedMastheadPdf)) return;
    const pages = await extractPdfPages(ieeeWrappedMastheadPdf);
    const result = extractFromPages({ pages, paperId: "ieee-mid-discussion", filePath: ieeeWrappedMastheadPdf, fileHash: "ieee-mid-discussion", metadata: { pageCount: pages.length } });
    const headings = result.canonical.nodes.filter((node) => node.role === "heading").map((node) => (node.text ?? "").trim());
    expect(headings.filter((text) => /^Discussion$/i.test(text))).toHaveLength(0);
    expect(headings.some((text) => /^I\.\s*INTRODUCTION$/i.test(text))).toBe(true);
  }, 60_000);

  it("splits structured-abstract Results Of… without leaving an embedded marker", async () => {
    const handednessPdf = path.join(root, "test-fixtures/real-papers/pending-pdfs/epmc-association-between-handedness-and-occupational-accidents-a-prospective-.pdf");
    if (!fs.existsSync(handednessPdf)) return;
    const pages = await extractPdfPages(handednessPdf);
    const result = extractFromPages({ pages, paperId: "handedness-results-of", filePath: handednessPdf, fileHash: "handedness-results-of", metadata: { pageCount: pages.length } });
    expect(result.canonical.nodes.some((node) => node.role === "paragraph" && /^Results\s+Of\b/i.test(node.text ?? ""))).toBe(false);
    // Structured-abstract `Results` stays an abstract band label (not a body heading).
    expect(
      result.canonical.nodes.some(
        (node) =>
          (node.role === "heading" || node.role === "abstract") &&
          /^Results$/i.test((node.text ?? "").trim()),
      ),
    ).toBe(true);
    expect(result.paper.authors).toEqual(expect.arrayContaining([
      "Aki Tomizawa", "Tomohisa Nagata", "Kiminori Odagami", "Takahiro Mori", "Koji Mori",
    ]));
    expect(result.paper.authors.every((name) => !/for the|Study II/i.test(name))).toBe(true);
  }, 60_000);

  it("recovers initialed bylines labelled as affiliations without title crumbs", async () => {
    const uxPdf = path.join(root, "test-fixtures/real-papers/pending-pdfs/hci-user-experience-analysis-on-mobile-application-design-using-user-exper.pdf");
    if (!fs.existsSync(uxPdf)) return;
    const pages = await extractPdfPages(uxPdf);
    const result = extractFromPages({ pages, paperId: "ux-initialed-byline", filePath: uxPdf, fileHash: "ux-initialed-byline", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["I D Sabukunze", "A Arakaza"]));
    expect(result.paper.authors.every((name) => !/User Experience|Questionnaire|Analysis/i.test(name))).toBe(true);
    expect(result.paper.affiliations.every((affiliation) => !/^D Sabukunze/i.test(affiliation.name))).toBe(true);
    expect(result.paper.titleOriginal).toMatch(/User Experience Analysis on Mobile Application Design/i);
    expect(result.canonical.nodes.filter((node) => node.role === "abstract").length).toBeGreaterThanOrEqual(1);
    expect(result.paper.doi).toBeNull();
  }, 60_000);

  it("drops Cureus chrome subjects and merges structured abstract bands", async () => {
    const cureusPdf = path.join(root, "test-fixtures/real-papers/pending-pdfs/epmc-evaluating-large-language-models-for-automated-data-cleaning-and-feature.pdf");
    if (!fs.existsSync(cureusPdf)) return;
    const pages = await extractPdfPages(cureusPdf);
    const result = extractFromPages({ pages, paperId: "cureus-chrome", filePath: cureusPdf, fileHash: "cureus-chrome", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Shimul A. Babli", "Pulkit Gairola"]));
    expect(result.paper.authors.every((name) => !/Creative Commons|Epidemiology|Quality Improvement|Healthcare Technology/i.test(name))).toBe(true);
    expect(result.canonical.nodes.filter((node) => node.role === "abstract")).toHaveLength(1);
    expect(result.paper.doi).toBe("10.7759/cureus.108550");
  }, 60_000);

  it("does not expose publication-date bands as affiliations", async () => {
    if (!fs.existsSync(registerPdf)) return;
    const pages = await extractPdfPages(registerPdf);
    const result = await extractFromPages({ pages, paperId: "linguistics-register", filePath: registerPdf, fileHash: "publication-band", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations.every((affiliation) => !/Accepted:|Published online/i.test(affiliation.name))).toBe(true);
  }, 60_000);

  it("keeps a numbered affiliation band separate from following article prose", async () => {
    if (!fs.existsSync(registerPdf)) return;
    const pages = await extractPdfPages(registerPdf);
    const result = await extractFromPages({ pages, paperId: "linguistics-register-affiliation-band", filePath: registerPdf, fileHash: "numbered-affiliation-band", metadata: { pageCount: pages.length } });
    expect(result.blocks.some((block) => /University of Turku/.test(block.original ?? "") && /discriminative importance/.test(block.original ?? ""))).toBe(false);
    expect(result.canonical.nodes.some((node) => node.role === "affiliation" && /University of Turku/.test(node.text ?? ""))).toBe(true);
  }, 60_000);

  it("keeps location-only masthead fragments out of authors", async () => {
    if (!fs.existsSync(wearabilityPdf)) return;
    const pages = await extractPdfPages(wearabilityPdf);
    const result = await extractFromPages({ pages, paperId: "design-for-wearability", filePath: wearabilityPdf, fileHash: "location-author", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).not.toContain("PA USA");
  }, 60_000);

  it("rejects quoted title descriptions from affiliation projection", async () => {
    if (!fs.existsSync(virtualRealityPdf)) return;
    const pages = await extractPdfPages(virtualRealityPdf);
    const result = await extractFromPages({ pages, paperId: "virtual-reality-ergonomics", filePath: virtualRealityPdf, fileHash: "quoted-affiliation", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations.every((affiliation) => !/^\s*["“].*?["”]\s+by\s+/i.test(affiliation.name))).toBe(true);
  }, 60_000);

  it("normalizes spaces inside Japanese author names", async () => {
    if (!fs.existsSync(virtualRealityPdf)) return;
    const pages = await extractPdfPages(virtualRealityPdf);
    const result = await extractFromPages({ pages, paperId: "virtual-reality-japanese-author", filePath: virtualRealityPdf, fileHash: "japanese-author", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["河合隆史"]));
    expect(result.paper.authors).not.toContain("河 合 隆 史");
  }, 60_000);

  it("recovers IEEE affiliation statements emitted as body paragraphs", async () => {
    if (!fs.existsSync(medicalAffiliationStatementPdf)) return;
    const pages = await extractPdfPages(medicalAffiliationStatementPdf);
    const result = await extractFromPages({ pages, paperId: "medical-affiliation-statement", filePath: medicalAffiliationStatementPdf, fileHash: "affiliation-statement", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations.some((affiliation) => /School of Electronic.*Shaanxi University/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.filter((affiliation) => /Brunel University London/i.test(affiliation.name))).toHaveLength(1);
    expect(result.paper.affiliations.filter((affiliation) => /University|Laboratory|Department|School/i.test(affiliation.name)).length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("splits title-case authors flattened into a research-center affiliation", async () => {
    if (!fs.existsSync(legacyConversationPdf)) return;
    const pages = await extractPdfPages(legacyConversationPdf);
    const result = await extractFromPages({ pages, paperId: "legacy-conversation-authors", filePath: legacyConversationPdf, fileHash: "title-case-affiliation-prefix", metadata: { pageCount: pages.length } });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Allison Woodruff", "Paul M. Aoki"]));
    expect(result.paper.authors.some((name) => /Palo Alto|Research Center|USA/i.test(name))).toBe(false);
    expect(result.paper.affiliations.some((affiliation) => /Palo Alto Research Center/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.filter((affiliation) => /Palo Alto Research Center/i.test(affiliation.name))).toHaveLength(1);
  }, 60_000);

  it("splits numbered multi-institution masthead streams without exposing contact text", async () => {
    if (!fs.existsSync(cognitiveMotorMemoryPdf)) return;
    const pages = await extractPdfPages(cognitiveMotorMemoryPdf);
    const result = await extractFromPages({ pages, paperId: "cognitive-motor-affiliations", filePath: cognitiveMotorMemoryPdf, fileHash: "cognitive-motor-affiliations", metadata: { pageCount: pages.length } });
    expect(result.paper.affiliations.length).toBeGreaterThanOrEqual(3);
    expect(result.paper.affiliations.every((affiliation) => !/@|kino31513|\b[234]\s+and\s+Science/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /Research Center for Brain Communication/i.test(affiliation.name))).toBe(true);
  }, 60_000);

  it("splits wrapped Frontiers bylines and drops topic / school author crumbs", async () => {
    const stridesPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-making-strides-in-doctoral-level-career-outcomes-reporting-a-review-of-c.pdf",
    );
    const editorialPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-editorial-alzheimer-s-dementia-recognition-through-spontaneous-speech.pdf",
    );
    if (fs.existsSync(stridesPdf)) {
      const pages = await extractPdfPages(stridesPdf);
      const result = extractFromPages({
        pages,
        paperId: "strides-byline-wrap",
        filePath: stridesPdf,
        fileHash: "strides-byline-wrap",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual(
        expect.arrayContaining(["Tammy R. L. Collins", "Rebekah L. Layton", "Deepti Ramadoss"]),
      );
      expect(result.paper.authors.every((name) => !/Layton Deepti|Harvard Medical School/i.test(name))).toBe(true);
    }
    if (fs.existsSync(editorialPdf)) {
      const pages = await extractPdfPages(editorialPdf);
      const result = extractFromPages({
        pages,
        paperId: "editorial-topic-author",
        filePath: editorialPdf,
        fileHash: "editorial-topic-author",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual(
        expect.arrayContaining(["Saturnino Luz", "Fasih Haider", "Brian Mac Whinney"]),
      );
      expect(result.paper.authors.every((name) => !/Dementia Recognition|Spontaneous Speech/i.test(name))).toBe(true);
    }
  }, 60_000);

  it("recovers JMIR preprint cover title stack and authors behind decorative cover art", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-ai-assisted-clinical-documentation-in-routine-danish-general-practice-qu.pdf",
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "jmir-preprint-cover",
      filePath: pdf,
      fileHash: "jmir-preprint-cover",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(/Documentation Time, Note Quality, and Clinician Acceptance/i);
    expect(result.paper.authors).toEqual([
      "Louise Nørgaard Olsen",
      "Philipp Harbig",
      "Anna Bay Laurberg",
      "Jacob Laurberg",
      "Morten Haaning Charles",
    ]);
    expect(result.paper.authors.every((name) => !/Documentation Time|Note Quality/i.test(name))).toBe(true);
  }, 60_000);

  it("recovers JMIR preprint cover title and authors behind decorative cover art", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-ai-assisted-clinical-documentation-in-routine-danish-general-practice-qu.pdf",
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "jmir-preprint-cover",
      filePath: pdf,
      fileHash: "jmir-preprint-cover",
      // PDF Info often stores the preprint DOI chrome; native title must win.
      metadata: {
        pageCount: pages.length,
        title: "Preprint - 10.2196/preprints.94431",
      },
    });
    expect(result.paper.titleOriginal).toMatch(
      /AI-Assisted Clinical Documentation in Routine Danish General Practice: A Pragmatic Pre–Post Study of Documentation Time, Note Quality, and Clinician Acceptance/i,
    );
    expect(result.paper.titleOriginal).not.toMatch(/preprint\s*[-–—]/i);
    expect(result.paper.authors).toEqual([
      "Louise Nørgaard Olsen",
      "Philipp Harbig",
      "Anna Bay Laurberg",
      "Jacob Laurberg",
      "Morten Haaning Charles",
    ]);
    expect(result.paper.authors.every((name) => !/Documentation Time|Note Quality/i.test(name))).toBe(true);
  }, 60_000);

  it("restores Frontiers bylines that over-scored as rival titles", async () => {
    const fishermenPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-mental-health-of-fishermen-current-research-status-and-future-directions.pdf",
    );
    if (!fs.existsSync(fishermenPdf)) return;
    const pages = await extractPdfPages(fishermenPdf);
    const result = extractFromPages({
      pages,
      paperId: "frontiers-fishermen-byline",
      filePath: fishermenPdf,
      fileHash: "frontiers-fishermen-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(/Mental health of fishermen/i);
    expect(result.paper.authors).toEqual(["Wenhao Lin", "Yu Fang", "Haidong Song"]);
  }, 60_000);

  it("rejects Nature Communications journal rails as authors and keeps the article title", async () => {
    const naturePdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-large-scale-integrated-optoelectronic-chaos-for-machine-learning-acceler.pdf",
    );
    if (!fs.existsSync(naturePdf)) return;
    const pages = await extractPdfPages(naturePdf);
    const result = extractFromPages({
      pages,
      paperId: "nature-comms-journal-rail",
      filePath: naturePdf,
      fileHash: "nature-comms-journal-rail",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(/optoelectronic chaos/i);
    expect(result.paper.authors.every((name) => !/^Nature Communications$/i.test(name))).toBe(true);
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Zhouyang Pan", "Zhekai Zheng"]));
  }, 60_000);

  it("keeps a PLOS protocol title instead of left-rail OSF registry chrome", async () => {
    const plosProtocolPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-digital-behavioral-addictions-in-adolescents-and-young-adults-protocol-f.pdf",
    );
    if (!fs.existsSync(plosProtocolPdf)) return;
    const pages = await extractPdfPages(plosProtocolPdf);
    const result = extractFromPages({
      pages,
      paperId: "plos-protocol-osf-rail",
      filePath: plosProtocolPdf,
      fileHash: "plos-protocol-osf-rail",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(/^Digital behavioral addictions in adolescents and young adults: Protocol for a scoping review/i);
    expect(result.paper.titleOriginal).not.toMatch(/Registries at|OSF\.IO|will independently screen/i);
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Sasha R. Sioni", "Jenna L. Butner", "Sten H. Vermund"]),
    );
  }, 60_000);

  it("does not promote post-Introduction body prose into a synthetic abstract", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("virtual-reality-for-information-visualization-migh"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "vr-infoviz-no-synthetic-abstract",
      filePath: pdf,
      fileHash: "vr-infoviz-no-synthetic-abstract",
      metadata: { pageCount: pages.length },
    });
    const hmd = result.canonical.nodes.find((node) =>
      /HMD and tracking system were independent/i.test(node.text ?? ""),
    );
    expect(hmd?.role).toBe("paragraph");
    expect(result.canonical.nodes.every((node) => node.role !== "abstract" || !/HMD and tracking/i.test(node.text ?? ""))).toBe(true);
  }, 60_000);

  it("recovers a same-baseline `and` coauthor above the abstract band", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("exploring-the-status-of-the-human-operator-in-indu"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "frontiers-and-sarah-maggioli",
      filePath: pdf,
      fileHash: "frontiers-and-sarah-maggioli",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Liliana Cunha", "Daniel Silva", "Sarah Maggioli"]),
    );
    expect(
      result.canonical.nodes.every(
        (node) =>
          node.role !== "author" ||
          !/^(?:specialty section|R E S E A R C H)$/i.test((node.text ?? "").replace(/\s+/g, " ").trim()),
      ),
    ).toBe(true);
  }, 60_000);

  it("demotes letterspaced RESEARCH banners and affiliation dump tails from author", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("can-mhealth-improve-migrant-wellness-during-public"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "mhealth-letterspaced-banner",
      filePath: pdf,
      fileHash: "mhealth-letterspaced-banner",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Chad Abresch", "Michelle Warren", "Russell J. Mc Culloh"]),
    );
    expect(result.paper.authors.every((name) => !/RESEARCH|Nebraska Kearney/i.test(name))).toBe(true);
    expect(
      result.canonical.nodes.every(
        (node) =>
          node.role !== "author" ||
          !/^(?:R E S E A R C H|of Nebraska Kearney)/i.test((node.text ?? "").replace(/\s+/g, " ").trim()),
      ),
    ).toBe(true);
  }, 60_000);

  it("recovers chapter-footer authors from copyright bylines", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("cognitive-psychology-attention-and-entrepreneurial-cognition"),
        )
      : undefined;
    const pdf = hit
      ? path.join(pending, hit)
      : path.join(root, "test-data/real-papers/cognitive-psychology-attention-and-entrepreneurial-cognition.pdf");
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "shepherd-chapter-footer",
      filePath: pdf,
      fileHash: "shepherd-chapter-footer",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["D. A. Shepherd", "H. Patzelt"]));
    expect(result.paper.authors.every((name) => !/SHEPHERD AND|^AND$/i.test(name))).toBe(true);
  }, 60_000);

  it("peels Indonesian cover title+byline glue and recovers numbered authors", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("ergonomics-analisis-pemetaan-bibliometrik"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "senopati-glued-cover",
      filePath: pdf,
      fileHash: "senopati-glued-cover",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(/^Analisis Pemetaan Bibliometrik/i);
    expect(result.paper.titleOriginal).not.toMatch(/^(?:Halaman|Diagram|Juli|Oktober)/i);
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Ario Wicaksono", "Indri Hapsari Susilowati", "Afifah Mu’minah"]),
    );
    expect(result.paper.authors.every((name) => !/Jurnal SENOPATI|INFORMASI|ABSTRACT|Diagram/i.test(name))).toBe(true);
  }, 60_000);

  it("joins a Frontiers title stack ending in Abstract and drops topic crumbs from authors", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("vr-sickness-adaptation-with-ramped-optic-flow"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "vr-sickness-title-stack",
      filePath: pdf,
      fileHash: "vr-sickness-title-stack",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toMatch(
      /VR Sickness Adaptation With Ramped Optic Flow Transfers From Abstract To Realistic Environments/i,
    );
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Isayas Adhanom", "Savannah Halow", "Eelke Folmer"]),
    );
    expect(result.paper.authors.every((name) => !/Optic Flow|Transfers From Abstract/i.test(name))).toBe(true);
  }, 60_000);

  it("demotes letterspaced INFO / ABSTRACT sidebar banners from authors", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("a-speech-segregation-algorithm-for-spatial-hearing-aids"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "speech-segregation-info-banner",
      filePath: pdf,
      fileHash: "speech-segregation-info-banner",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Jakeh E. Orr", "Atra Z. Eslami Boudreaux", "Irmak Gokcen", "Yan Gai"]),
    );
    expect(result.paper.authors.every((name) => !/\bINFO\b|ABSTRACT|I N F O|A B S T R A C T/i.test(name))).toBe(true);
    expect(
      result.canonical.nodes.every(
        (node) =>
          node.role !== "author" ||
          !/^(?:I N F O|A B S T R A C T)$/i.test((node.text ?? "").replace(/\s+/g, " ").trim()),
      ),
    ).toBe(true);
  }, 60_000);

  it("keeps Spanish compound names and Ma particles without month-name false rejects", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("use-of-artificial-intelligence-in-education-and-tr"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "spanish-compound-bylines",
      filePath: pdf,
      fileHash: "spanish-compound-bylines",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual([
      "María Belén Morales-Cevallos",
      "Canva Byron Ma Lam",
      "María José López Pino",
      "Adriana Monserrath Monge Moreno",
      "Diego Fabián Vique López",
    ]);
    expect(result.paper.authors.every((name) => !/universidad|facultad/i.test(name))).toBe(true);
  }, 60_000);

  it("recovers Title-Case + ALL-CAPS authors from parenthetical affiliations", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) => name.includes("ergonomics-human-factors-in-around"))
      : undefined;
    if (!hit) return;
    const pages = await extractPdfPages(path.join(pending, hit));
    const result = extractFromPages({
      pages,
      paperId: "horie-paren-affiliation",
      filePath: hit,
      fileHash: "horie-paren-affiliation",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Yoshinori HORIE"]);
  }, 60_000);

  it("recovers a Cyrillic title-case author from an affiliation genre rail", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) => name.startsWith("marketing-impact-of-sensory"))
      : undefined;
    if (!hit) return;
    const pages = await extractPdfPages(path.join(pending, hit));
    const result = extractFromPages({
      pages,
      paperId: "cyrillic-sensory-author",
      filePath: hit,
      fileHash: "cyrillic-sensory-author",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Ивана Ж. БАЛТЕЗАРЕВИЋ"]);
  }, 60_000);

  it("recovers a thesis repository Author: Last, First byline and clean title", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("fatigue-and-occupational-safety-in-short-haul"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "thesis-author-publication-date",
      filePath: pdf,
      fileHash: "thesis-author-publication-date",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.titleOriginal).toBe(
      "Fatigue and occupational safety in short haul, light transport",
    );
    expect(result.paper.authors).toEqual(["Rena Friswell"]);
    const abstractLead = result.canonical.nodes.find((node) => node.role === "abstract")?.text ?? "";
    expect(abstractLead).toMatch(/Light goods vehicles/i);
  }, 60_000);

  it("peels a Frontiers RECEIVED date rail off a hydroponic abstract lead", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) => name.includes("implementation-of-hydroponic-teaching"))
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "hydroponic-received-abstract",
      filePath: pdf,
      fileHash: "hydroponic-received-abstract",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Annie Wang", "Kevin Wang", "Byron Meade"]),
    );
    expect(result.paper.authors.every((name) => !/^Front\./i.test(name))).toBe(true);
    const abstractText = result.canonical.nodes
      .filter((node) => node.role === "abstract")
      .map((node) => node.text ?? "")
      .join(" ");
    expect(abstractText).toMatch(/Many primarily undergraduate institutions/i);
    expect(abstractText).not.toMatch(/RECEIVEDREVISED|ACCEPTEDPUBLISHED/i);
  }, 60_000);

  it("recovers a parenthetical Latin byline from a Japanese society note", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/ergonomics-2s2-1-ergonomics-human-factors-in-around-1964.pdf",
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "japanese-parenthetical-byline",
      filePath: pdf,
      fileHash: "japanese-parenthetical-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Yoshinori HORIE"]);
  }, 60_000);

  it("recovers a Serbian given-initial-surname from a review-article affiliation row", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/marketing-impact-of-sensory-marketing-on-consumer-behavior.pdf",
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "serbian-cyrillic-byline",
      filePath: pdf,
      fileHash: "serbian-cyrillic-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Ивана Ж. БАЛТЕЗАРЕВИЋ"]);
  }, 60_000);

  it("demotes mega-author PLOS abstract overflow bylines into authors", async () => {
    const preferItPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-prefer-it-a-transdisciplinary-co-created-framework-to-realise-inclusive-.pdf",
    );
    if (!fs.existsSync(preferItPdf)) return;
    const pages = await extractPdfPages(preferItPdf);
    const result = extractFromPages({
      pages,
      paperId: "prefer-it-byline-overflow",
      filePath: preferItPdf,
      fileHash: "prefer-it-byline-overflow",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors.length).toBeGreaterThanOrEqual(20);
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Jetse Goris", "Anne H. Hoekman"]),
    );
    const abstractText = result.canonical.nodes
      .filter((node) => node.role === "abstract")
      .map((node) => node.text ?? "")
      .join(" ");
    expect(abstractText).toMatch(/Artificial intelligence \(AI\) in healthcare/i);
    expect(abstractText).not.toMatch(/Jetse Goris/i);
  }, 60_000);

  it("keeps BMC Methods-for… bodies inside a structured abstract band", async () => {
    const cbSearchPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-cb-search-a-method-for-searching-for-similar-protein-motifs-with-biased-.pdf",
    );
    if (!fs.existsSync(cbSearchPdf)) return;
    const pages = await extractPdfPages(cbSearchPdf);
    const result = extractFromPages({
      pages,
      paperId: "cb-search-methods-for-abstract",
      filePath: cbSearchPdf,
      fileHash: "cb-search-methods-for-abstract",
      metadata: { pageCount: pages.length },
    });
    const abstractText = result.canonical.nodes
      .filter((node) => node.role === "abstract")
      .map((node) => node.text ?? "")
      .join(" ");
    expect(abstractText).toMatch(/Methods for analyzing protein sequence similarity/i);
    expect(abstractText).toMatch(/Background/i);
    expect(abstractText.length).toBeGreaterThan(800);
  }, 60_000);

  it("recovers a Research Square page-3 Background–Conclusions abstract band", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("introducing-galaxyr-an-easy-to-use-r-implementation"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "galaxyr-structured-abs",
      filePath: pdf,
      fileHash: "galaxyr-structured-abs",
      metadata: { pageCount: pages.length },
    });
    const abs = result.canonical.nodes.filter((n) => n.role === "abstract");
    expect(abs.length).toBeGreaterThanOrEqual(6);
    expect(abs.some((n) => /^Background$/i.test((n.text ?? "").trim()))).toBe(true);
    expect(abs.some((n) => /GalaxyR/i.test(n.text ?? ""))).toBe(true);
  }, 60_000);

  it("recovers a thesis cover author heading beside partial-fulfil wording", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("marketing-is-digital-advertising-effective"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "santoso-thesis-cover",
      filePath: pdf,
      fileHash: "santoso-thesis-cover",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Irene Irawaty Santoso"]));
    expect(result.paper.authors).toHaveLength(1);
  }, 60_000);

  it("drops equal-contribution crumbs and SOFTWARE banners from QStrain authors", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) => name.includes("qstrain-an-interactive-platform"))
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "qstrain-eq-contrib",
      filePath: pdf,
      fileHash: "qstrain-eq-contrib",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Euna Jeong", "Seungyean Lee", "Sumin Jeong", "Sukjoon Yoon"]),
    );
    expect(
      result.paper.authors.every(
        (name) => !/have Abstract|SOFTWARE|S O F T/i.test(name) && !/contributed equally/i.test(name),
      ),
    ).toBe(true);
  }, 60_000);

  it("peels a single numbered author glued onto Deep-learning abstract prose", async () => {
    const pending = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    const hit = fs.existsSync(pending)
      ? fs.readdirSync(pending).find((name) =>
          name.includes("visual-cues-in-mi-bci-induce-biases"),
        )
      : undefined;
    if (!hit) return;
    const pdf = path.join(pending, hit);
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "visual-cues-lotte-glued-abs",
      filePath: pdf,
      fileHash: "visual-cues-lotte-glued-abs",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["Fabien Lotte"]));
    const abstractText = [
      result.paper.abstract ?? "",
      ...result.canonical.nodes.filter((node) => node.role === "abstract").map((node) => node.text ?? ""),
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    expect(abstractText).toMatch(/^Deep learning classification/i);
    expect(abstractText).not.toMatch(/Fabien Lotte/i);
  }, 60_000);

  it("recovers Frontiers two-author bylines glued onto abstract prose without commas", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-multi-way-radial-consistency-pre-training-for-event-based-optical-flow.pdf",
    );
    if (!fs.existsSync(pdf)) return;
    const pages = await extractPdfPages(pdf);
    const result = extractFromPages({
      pages,
      paperId: "frontiers-two-author-glued-abs",
      filePath: pdf,
      fileHash: "frontiers-two-author-glued-abs",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(expect.arrayContaining(["An Feng", "Tao Wenyin"]));
    expect(result.paper.authors).toHaveLength(2);
    const abstractText = [
      result.paper.abstract ?? "",
      ...result.canonical.nodes.filter((node) => node.role === "abstract").map((node) => node.text ?? ""),
    ].join(" ");
    expect(abstractText).toMatch(/Optical flow estimation/i);
    expect(abstractText).not.toMatch(/^An Feng/i);
  }, 60_000);

  it("keeps Frontiers sidebar bylines ending in `and` without country crumbs", async () => {
    const frontiersSidebarPdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-a-retrospective-analysis-of-the-perceived-impact-of-the-covid-19-pandemi.pdf",
    );
    if (!fs.existsSync(frontiersSidebarPdf)) return;
    const pages = await extractPdfPages(frontiersSidebarPdf);
    const result = extractFromPages({
      pages,
      paperId: "frontiers-sidebar-and-byline",
      filePath: frontiersSidebarPdf,
      fileHash: "frontiers-sidebar-and-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual([
      "Khadeejah T. Franklin",
      "Alexa J. Saval",
      "Anne M. Cafer",
      "Dana N. Reinemann",
    ]);
    expect(result.paper.authors.every((name) => !/United (?:Kingdom|States)|OPEN ACCESS|EDITED BY/i.test(name))).toBe(true);
    expect(result.paper.affiliations.every((affiliation) => !/University of Minho|These authors share|Dana N\. Reinemann/i.test(affiliation.name))).toBe(true);
    expect(result.paper.affiliations.some((affiliation) => /University of Mississippi/i.test(affiliation.name))).toBe(true);
    const abstractText = result.canonical.nodes
      .filter((node) => node.role === "abstract")
      .map((node) => node.text ?? "")
      .join(" ");
    expect(abstractText).toMatch(/Student parents/i);
    expect(abstractText).not.toMatch(/Front\. Educ|Reinemann DN \(2024\)|doi:\s*10\./i);
  }, 60_000);

  it("recovers chapter-footer D. A. Shepherd bylines from copyright nodes", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.startsWith("cognitive-psychology-attention-and-entrepreneurial"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "shepherd-chapter-footer",
      filePath: match,
      fileHash: "shepherd-chapter-footer",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["D. A. Shepherd", "H. Patzelt"]);
  }, 60_000);

  it("recovers particle surnames from a Scientific Reports abstract byline", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("xgboost-based-predictive"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "xgboost-abstract-byline",
      filePath: match,
      fileHash: "xgboost-abstract-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining([
        "Moataz M. El Sherbiny",
        "Mohamed G. Abdelfattah",
        "Ali E. Takieldeen",
        "Hossam El-Din Mostafa",
        "Hala B. Nafea",
      ]),
    );
    const abstractText = [
      result.paper.abstract ?? "",
      ...result.canonical.nodes.filter((n) => n.role === "abstract").map((n) => n.text ?? ""),
    ].join(" ");
    expect(abstractText).toMatch(/Diabetes mellitus is a persistent/i);
    expect(abstractText).not.toMatch(/^Moataz M\. El Sherbiny/i);
  }, 60_000);

  it("peels a single Name* author glued onto a Frontiers abstract lead", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("true-xai-causal"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "true-xai-single-star-byline",
      filePath: match,
      fileHash: "true-xai-single-star-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toContain("Gopal Singh Jamnal");
    const abstractText = result.canonical.nodes
      .filter((n) => n.role === "abstract")
      .map((n) => n.text ?? "")
      .join(" ");
    expect(abstractText).toMatch(/^Forecasting corporate earnings/i);
    expect(abstractText).not.toMatch(/^Gopal Singh Jamnal/i);
  }, 60_000);

  it("recovers Frontiers star-lead byline instead of RECEIVED/KEYWORDS chrome", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("regulating-short-form-video-addiction"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "short-form-video-star-lead-byline",
      filePath: match,
      fileHash: "short-form-video-star-lead-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining(["Jennifer S. Stevenson", "Xia Wang", "Jiayi Wang"]),
    );
    expect(
      result.paper.authors.every(
        (a) => !/^(?:RECEIVED|REVISED|ACCEPTED|PUBLISHED|KEYWORDS)\b/i.test(a),
      ),
    ).toBe(true);
  }, 60_000);

  it("marks PLOS trailing Abstract and drops biobank consortium crumbs", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("atrial-fibrillation-and-retinal"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "atrial-plos-trailing-abstract",
      filePath: match,
      fileHash: "atrial-plos-trailing-abstract",
      metadata: { pageCount: pages.length },
    });
    expect(result.canonical.nodes.some((n) => n.role === "abstract")).toBe(true);
    expect(
      result.canonical.nodes.some(
        (n) =>
          n.role === "abstract" &&
          /investigate the association between multimodal retinal/i.test(n.text ?? ""),
      ),
    ).toBe(true);
    expect(result.paper.authors.some((a) => /Huemer/i.test(a))).toBe(true);
    expect(
      result.paper.authors.every(
        (a) => !/\b(?:consortium|biobank)\b/i.test(a),
      ),
    ).toBe(true);
  }, 60_000);

  it("joins Frontiers other-role and-wrap under a comma-ending author row", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("toward-a-dual-pathway-model-of-neuroplastic"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "dual-pathway-other-and-wrap",
      filePath: match,
      fileHash: "dual-pathway-other-and-wrap",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining([
        "Murad Sultanov",
        "Tukezban Rustamova",
        "Aytan Huseynova",
        "Gulchin Mammadova",
        "Khadidja Ismailova",
      ]),
    );
    expect(result.paper.authors.every((a) => !/Chayut|Bunterngchit/i.test(a))).toBe(true);
  }, 60_000);

  it("joins Frontiers comma-wrap paragraph with following and-author row", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("multimodal-dataset-for-socially-aware"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "multimodal-frontiers-comma-wrap",
      filePath: match,
      fileHash: "multimodal-frontiers-comma-wrap",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining([
        "Carlos A. P. Pizzino",
        "Phani-Teja Singamaneni",
        "Micael S. Couceiro",
        "Rachid Alami",
      ]),
    );
  }, 60_000);

  it("keeps numbered OUP byline and ignores Corresponding authors contact rail", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("computer-vision-syndrome-and-ergonomic"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "cvs-oup-byline",
      filePath: match,
      fileHash: "cvs-oup-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(
      expect.arrayContaining([
        "Muhamad Faez Faisal Sezali",
        "Mohd Nazri Shafei",
        "Afiq Izzudin A. Rahim",
      ]),
    );
    expect(
      result.paper.authors.every(
        (a) => !/corresponding|^\(\s*\)$/i.test(a),
      ),
    ).toBe(true);
  }, 60_000);

  it("does not promote Keywords: topic lists into authors", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("psychological-distress-subjective-well-bein"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "psych-keywords-not-authors",
      filePath: match,
      fileHash: "psych-keywords-not-authors",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors.some((a) => /Henao/i.test(a))).toBe(true);
    expect(
      result.paper.authors.every(
        (a) => !/\b(?:well-being|intention|equation|distress)\b/i.test(a),
      ),
    ).toBe(true);
  }, 60_000);

  it("drops Frontiers citation crumbs and bare Universidad lines from authors", async () => {
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.includes("editorial-public-health-strategies"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "frontiers-editorial-authors",
      filePath: match,
      fileHash: "frontiers-editorial-authors",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual([
      "Diana Patricia Guizar-S´anchez",
      "Ana Fres´an-Orellana",
    ]);
    expect(
      result.paper.authors.every(
        (name) => !/Universidad|Fres´an-Orellana A\b|Guizar-S´anchez DP\b/i.test(name),
      ),
    ).toBe(true);
  }, 60_000);

  it("keeps Jan given-name bylines that look like January date crumbs", async () => {
    const pdf = path.join(
      root,
      "test-fixtures/real-papers/pending-pdfs/epmc-a-systematic-review-of-patient-decision-aids-fo.pdf",
    );
    const files = fs.readdirSync(path.join(root, "test-fixtures/real-papers/pending-pdfs"));
    const match = files.find((f) => f.startsWith("epmc-a-systematic-review-of-patient-decision"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(root, "test-fixtures/real-papers/pending-pdfs", match));
    const result = extractFromPages({
      pages,
      paperId: "bmc-jan-berghold-byline",
      filePath: match,
      fileHash: "bmc-jan-berghold-byline",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual([
      "Jan Berghold",
      "Lena Fischer",
      "Alexander Pachanov",
      "Leon Vincent Schewe",
      "Dawid Pieper",
    ]);
  }, 60_000);

  it("recovers hyphenated glued starred affiliation authors", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const match = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-ai-driven-audience-clustering"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(pendingDir, match));
    const result = extractFromPages({
      pages,
      paperId: "ai-driven-yong-seok-jang",
      filePath: match,
      fileHash: "ai-driven-yong-seok-jang",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Yong-Seok Jang"]);
    expect(
      result.canonical.nodes.some(
        (n) =>
          n.role === "abstract" &&
          /sports media audiences/i.test(n.text ?? ""),
      ),
    ).toBe(true);
  }, 60_000);

  it("recovers one-comma Frontiers bylines and PLOS ORCID ID rows", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const mind = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-mind-the-gap-an-evidence-gap"));
    const mobile = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-mobile-applications-for-elderly"));
    const tourism = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-artificial-intelligence-in-the-tourism"));
    if (mind) {
      const pages = await extractPdfPages(path.join(pendingDir, mind));
      const result = extractFromPages({
        pages,
        paperId: "mind-the-gap-byline",
        filePath: mind,
        fileHash: "mind-the-gap-byline",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual([
        "Malin Siv Roppel",
        "Marlene Lakemann",
        "Dagmar Starke",
      ]);
    }
    if (mobile) {
      const pages = await extractPdfPages(path.join(pendingDir, mobile));
      const result = extractFromPages({
        pages,
        paperId: "plos-orcid-id-authors",
        filePath: mobile,
        fileHash: "plos-orcid-id-authors",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual(
        expect.arrayContaining([
          "Joseane O. V. Paiva",
          "Rossana M. C. Andrade",
          "Ivana Cristina de H. C. Barreto",
        ]),
      );
      expect(result.paper.authors.every((name) => !/\bID\b/.test(name))).toBe(
        true,
      );
      expect(result.paper.authors.length).toBeGreaterThanOrEqual(8);
    }
    if (tourism) {
      const pages = await extractPdfPages(path.join(pendingDir, tourism));
      const result = extractFromPages({
        pages,
        paperId: "tourism-reviewed-by-peel",
        filePath: tourism,
        fileHash: "tourism-reviewed-by-peel",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual(
        expect.arrayContaining([
          "Alexandra Lorena López-Naranjo",
          "Mariana Isabel Puente-Riofrio",
          "Verónica Adriana Carrasco-Salazar",
          "Juan Diego Erazo-Rodríguez",
        ]),
      );
    }
  }, 180_000);

  it("recovers Frontiers body bylines and demotes sidebar reviewer crumbs", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const art = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-art-based-interventions"));
    const argue = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-argue-tira"));
    if (art) {
      const pages = await extractPdfPages(path.join(pendingDir, art));
      const result = extractFromPages({
        pages,
        paperId: "art-based-body-byline",
        filePath: art,
        fileHash: "art-based-body-byline",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual([
        "Liandi He",
        "Rilei He",
        "Guomeng Liu",
        "Siying Liu",
        "Xin He",
      ]);
      expect(
        result.paper.authors.every((name) => !/Carotenuto|Campania/i.test(name)),
      ).toBe(true);
    }
    if (argue) {
      const pages = await extractPdfPages(path.join(pendingDir, argue));
      const result = extractFromPages({
        pages,
        paperId: "argue-tira-abstract-star",
        filePath: argue,
        fileHash: "argue-tira-abstract-star",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual(["Areej Alhothali"]);
      expect(
        result.paper.authors.every((name) => !/Soumia|Ikiss/i.test(name)),
      ).toBe(true);
    }
  }, 120_000);

  it("recovers glued CamelCase body bylines over Frontiers reviewer crumbs", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const postpartum = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-analysis-of-postpartum"));
    const mqtt = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-attention-enhanced-deep-learning"));
    if (postpartum) {
      const pages = await extractPdfPages(path.join(pendingDir, postpartum));
      const result = extractFromPages({
        pages,
        paperId: "postpartum-glued-byline",
        filePath: postpartum,
        fileHash: "postpartum-glued-byline",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual([
        expect.stringMatching(/^Revathy P\.?$/),
        "Akila Victor",
      ]);
      expect(
        result.paper.authors.every(
          (name) => !/Lepach|Yeboah|Affiliated|Jiangnan/i.test(name),
        ),
      ).toBe(true);
    }
    if (mqtt) {
      const pages = await extractPdfPages(path.join(pendingDir, mqtt));
      const result = extractFromPages({
        pages,
        paperId: "mqtt-glued-byline",
        filePath: mqtt,
        fileHash: "mqtt-glued-byline",
        metadata: { pageCount: pages.length },
      });
      expect(result.paper.authors).toEqual([
        "Siddhartha Singhal",
        "Kakelli Anil Kumar",
      ]);
      expect(
        result.paper.authors.every(
          (name) => !/Milad|Warsaw|Ahvanooey/i.test(name),
        ),
      ).toBe(true);
    }
  }, 120_000);

  it("drops affiliation city tails painted as authors", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const match = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("cognitive-psychology-a-study-on-the-teaching"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(pendingDir, match));
    const result = extractFromPages({
      pages,
      paperId: "jilin-changchun-location-author",
      filePath: match,
      fileHash: "jilin-changchun-location-author",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual(["Yu Cheng"]);
    expect(
      result.paper.authors.every((name) => !/Jilin|Changchun/i.test(name)),
    ).toBe(true);
  }, 60_000);

  it("splits glued CamelCase Frontiers bylines and drops agency crumbs", async () => {
    const pendingDir = path.join(root, "test-fixtures/real-papers/pending-pdfs");
    if (!fs.existsSync(pendingDir)) return;
    const match = fs
      .readdirSync(pendingDir)
      .find((f) => f.startsWith("epmc-a-multimodal-tableware"));
    if (!match) return;
    const pages = await extractPdfPages(path.join(pendingDir, match));
    const result = extractFromPages({
      pages,
      paperId: "multimodal-tableware-glued-authors",
      filePath: match,
      fileHash: "multimodal-tableware-glued-authors",
      metadata: { pageCount: pages.length },
    });
    expect(result.paper.authors).toEqual([
      "Ming Zhang",
      "Shan Ding",
      "Zhihui Zhang",
      "Qinglong Kong",
      "Xun Li",
    ]);
    expect(
      result.paper.authors.every(
        (name) => !/NSTDA|Development Agency|Thailand/i.test(name),
      ),
    ).toBe(true);
  }, 60_000);
});
