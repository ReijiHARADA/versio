import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractLayoutDocument } from "../src/services/pdfLayout";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("ergonomics-analisis-pemetaan-bibliometrik"))!;
const pages = await extractPdfPages(path.join(dir, f));
const layout = await extractLayoutDocument(pages as any, { filePath: f });
for (const block of layout.blocks ?? []) {
  const t = (block.text || "").replace(/\s+/g, " ");
  if (/Wicaksono|Susilowati|Mu.?minah|Ario|Indri Hapsari|Afifah/i.test(t)) {
    console.log(
      "p",
      block.page,
      "y",
      block.bbox?.y?.toFixed?.(1) ?? block.y,
      JSON.stringify(t.slice(0, 100)),
    );
  }
}
