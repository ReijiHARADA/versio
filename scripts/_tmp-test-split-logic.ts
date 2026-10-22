import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { reconstructDocument, looksLikeAuthorList } from "../src/services/pdfLayout";

const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.includes("ergonomics-analisis-pemetaan-bibliometrik"))!;
const pages = await extractPdfPages(path.join(dir, f));
const { blocks } = reconstructDocument(pages);
const block = blocks.find((x) => x.role === "author" && /Analisis Pemetaan/i.test(x.text))!;

const isNumberedPersonByline = (text: string): boolean => {
  const trimmed = text.trim();
  return (
    /^\s*[A-ZÀ-Ö][\p{L}'’-]+(?:\s+[A-ZÀ-Ö][\p{L}'’-]+){1,4}\d/u.test(trimmed) &&
    (trimmed.match(/,/g) ?? []).length >= 1 &&
    !/[“"「]/.test(trimmed) &&
    !/\b(?:ergonomics|vosviewer|bibliometrik|occupational health)\b/i.test(trimmed)
  );
};

block.lines.forEach((line, i) => {
  console.log(i, "num", isNumberedPersonByline(line.text), "list", looksLikeAuthorList(line.text), JSON.stringify(line.text.slice(0, 50)));
});
const numbered = block.lines.findIndex((line) => isNumberedPersonByline(line.text));
console.log("numbered index", numbered);
