import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const offset = Number(process.env.SPOT_OFFSET || "800");
const limit = Number(process.env.SPOT_LIMIT || "60");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")).slice(offset, offset + limit);

const issues: string[] = [];
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
    const nodes = r.canonical.nodes;
    const title = (nodes.find((n) => n.role === "title")?.text || "").trim();
    if (!title || title.length < 10) issues.push(`${f.slice(0, 55)} BAD_TITLE: ${title}`);

    const chromeOther = nodes.filter(
      (n) =>
        (n.role === "other" || n.role === "paragraph") &&
        /^(?:©|copyright|all rights reserved|downloaded from|licensed under|protected by copyright)/i.test(
          (n.text || "").trim(),
        ),
    );
    for (const n of chromeOther.slice(0, 1)) {
      if (n.role !== "copyright") {
        issues.push(`${f.slice(0, 55)} chrome-as-${n.role}: ${(n.text || "").slice(0, 50)}`);
      }
    }

    const longHeading = nodes.filter(
      (n) =>
        n.role === "heading" &&
        (n.text || "").length > 120 &&
        !/^(abstract|introduction|methods|results|discussion|conclusion|references)\b/i.test(
          n.text || "",
        ),
    );
    if (longHeading.length) {
      issues.push(`${f.slice(0, 55)} long-heading: ${(longHeading[0]!.text || "").slice(0, 70)}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    issues.push(`${f.slice(0, 55)} ERR: ${msg.slice(0, 60)}`);
  }
}

console.log("checked", files.length, "offset", offset, "issues", issues.length);
for (const i of issues.slice(0, 25)) console.log(i);
