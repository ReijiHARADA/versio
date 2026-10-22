import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument } from "../src/services/pdfLayout";

// Import non-exported helpers by re-evaluating through a tiny patch isn't possible.
// Instead, duplicate the predicates we need via runtime inspection of line roles after
// forcing a local copy of the split function logic using only public APIs.

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("ergonomics-analisis-pemetaan-bibliometrik"))!;
const pages = await extractPdfPages(path.join(dir, f));
const { blocks } = reconstructDocument(pages);
const block = blocks.find((x) => x.role === "author" && x.lines.length === 6 && /Analisis/i.test(x.text));
console.log("found mega", Boolean(block), "title blocks", blocks.filter((b) => b.role === "title" && b.pageStart === 1).length);
console.log(
  "ario-only authors",
  blocks.filter((b) => b.role === "author" && /Ario Wicaksono/i.test(b.text) && !/Analisis/i.test(b.text)).map((b) => b.text.slice(0, 80)),
);
