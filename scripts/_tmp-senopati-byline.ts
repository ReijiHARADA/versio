import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { looksLikeAuthorList, reconstructDocument } from "../src/services/pdfLayout";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("ergonomics-analisis-pemetaan-bibliometrik"))!;
const pages = await extractPdfPages(path.join(dir, f));
const { lines, blocks } = reconstructDocument(pages);
for (const l of lines.filter((line) => line.page === 1 && line.y > 150 && line.y < 220)) {
  const t = l.text.trim();
  const numbered =
    /^\s*[A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){1,4}\d/u.test(t) &&
    (t.match(/,/g) ?? []).length >= 1;
  console.log(
    l.y.toFixed(1),
    "list",
    looksLikeAuthorList(t),
    "num",
    numbered,
    JSON.stringify(t.slice(0, 90)),
  );
}
console.log(
  "author blocks",
  blocks
    .filter((b) => b.role === "author" && b.pageStart === 1)
    .map((b) => JSON.stringify(b.text.replace(/\s+/g, " ").slice(0, 100))),
);
