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
});
