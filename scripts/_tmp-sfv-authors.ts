import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

async function main() {
  const pdf =
    "test-fixtures/real-papers/pending-pdfs/epmc-regulating-short-form-video-addiction-a-three-tiered-legal-framework-for.pdf";
  const pages = await extractPdfPages(pdf);
  const result = extractFromPages({
    pages,
    paperId: "sfv",
    filePath: pdf,
    fileHash: "sfv",
    metadata: { pageCount: pages.length },
  });
  console.log("authors", result.paper.authors);
  for (const n of result.canonical.nodes.filter((x) => x.pageStart === 1).slice(0, 45)) {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    console.log(n.role.padEnd(12), JSON.stringify(t));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
