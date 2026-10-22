import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";
const dir = "test-fixtures/real-papers/pending-pdfs";
const f = fs.readdirSync(dir).find((x) => x.startsWith("marketing-impact-of-sensory"))!;
const pages = await extractPdfPages(path.join(dir, f));
const r = extractFromPages({ pages, paperId: f, filePath: f, fileHash: f, metadata: { pageCount: pages.length } });
for (const n of r.canonical.nodes.filter((n) => n.pageStart <= 1 && /Балтез|БАЛТЕЗ|Ивана|affiliation|Факултет/i.test(n.text||""))) {
  console.log(n.role, JSON.stringify(n.text));
}
const sample = "Прегледни рад Ивана Ж. БАЛТЕЗАРЕВИЋ* Факултет за културу и медије Мегатрент Универзитет";
const cleaned = sample.replace(/[*†‡§]/gu, " ").replace(/\s+/g, " ").trim();
const m = cleaned.match(/\b([А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ]\.\s+[А-ЯЁ][А-ЯЁа-яё'’-]{2,})\b/u);
console.log("match", m?.[1]);
console.log("authors", r.paper.authors);
