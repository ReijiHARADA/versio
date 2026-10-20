import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument } from "../src/services/pdfLayout.ts";

const pdf =
  process.argv[2] ||
  "test-fixtures/real-papers/pending-pdfs/epmc-digital-behavioral-addictions-in-adolescents-and-young-adults-protocol-f.pdf";

async function main() {
  const pages = await extractPdfPages(pdf);
  const { blocks } = reconstructDocument(pages);
  const p1 = blocks.filter((b) => b.page === 1);
  for (const b of p1.slice(0, 50)) {
    const t = String(b.text || "").replace(/\s+/g, " ").slice(0, 110);
    console.log(
      String(b.role).padEnd(12),
      `fs=${Math.round((b.fontSize || 0) * 10) / 10}`,
      `y=${Math.round(b.y)}`,
      `x=${Math.round(b.x)}`,
      t
    );
  }
}
main();
