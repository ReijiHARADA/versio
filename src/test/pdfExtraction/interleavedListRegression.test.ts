import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import { extractPdfPages } from "../readingOrder/extractPdf";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const pdfPath = path.join(
  root,
  "test-fixtures/real-papers/pending-pdfs/computational-linguistics-nlp-translation.pdf"
);

describe("interleaved list extraction", () => {
  it("keeps a spanning list introduction and its cross-column items in source order", async () => {
    if (!fs.existsSync(pdfPath)) return;
    const pages = await extractPdfPages(pdfPath);
    const { blocks } = reconstructDocument(pages);
    const block = blocks.find((candidate) => candidate.text.includes("create separate clusters for"));

    expect(block?.role).toBe("paragraph");
    expect(block?.text).toContain("{“stake”}, {“usair”, “merger”, “twa”}, {“acquire", "acquisition”}");
    expect(block?.text).toMatch(/\{“acquire”, “acquisition”\}.*\{\s*“voting”, “buyout”, “ownership”/s);
    expect(block?.text).toContain("which intuitively appear");
    expect(block?.text).not.toContain("which itively appear");
  });

  it("reattaches an inline footnote citation that overlaps the paragraph's last line", async () => {
    if (!fs.existsSync(pdfPath)) return;
    const pages = await extractPdfPages(pdfPath);
    const { blocks } = reconstructDocument(pages);
    const block = blocks.find((candidate) => candidate.text.includes("Genealogies of Knowledge projects"));

    expect(block?.role).toBe("paragraph");
    expect(block?.text).toContain("projects 3 (Jones 2019; Luz and Sheehan 2020)");
    expect(block?.text).not.toMatch(/projects\s*$/);
  });
});
