import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const offset = Number(process.env.OFFSET ?? "0");
const limit = Number(process.env.LIMIT ?? "200");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".pdf"))
  .sort()
  .slice(offset, offset + limit);

const hits: string[] = [];
for (const f of files) {
  try {
    const pages = await extractPdfPages(path.join(dir, f));
    const r = extractFromPages({
      pages,
      paperId: f,
      filePath: f,
      fileHash: f,
      metadata: { pageCount: pages.length },
    });
    const authors = r.paper.authors || [];
    if (authors.length === 0 || authors.length > 2) continue;
    // copyright with "and" suggesting more authors
    const copy = r.canonical.nodes
      .filter((n) => n.role === "copyright" && n.pageStart === 1)
      .map((n) => n.text || "")
      .join(" ");
    const andCount = (copy.match(/\band\b/gi) ?? []).length;
    if (andCount >= 1 && /©/.test(copy)) {
      const namesInCopy = copy.match(/©\s*\d{4}\s+([^.]+)/);
      hits.push(
        `${f.slice(0, 48)} authors=${authors.length} [${authors.join("; ")}] © ${namesInCopy?.[1]?.slice(0, 60) ?? copy.slice(0, 60)}`,
      );
    }
    if (hits.length >= 10) break;
  } catch {
    /* skip */
  }
}
console.log(JSON.stringify({ offset, limit, hits }, null, 2));
