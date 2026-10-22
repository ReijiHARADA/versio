import fs from "fs";
import path from "path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf";

const dir = "test-fixtures/real-papers/pending-pdfs";
const offset = Number(process.env.OFFSET ?? "300");
const limit = Number(process.env.LIMIT ?? "100");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".pdf"))
  .sort()
  .slice(offset, offset + limit);

const by: Record<string, number> = {};
const hits: Array<{ k: string; f: string; d: string }> = [];
const bump = (k: string, f: string, d: string) => {
  by[k] = (by[k] || 0) + 1;
  if (hits.filter((h) => h.k === k).length < 8) {
    hits.push({ k, f: f.slice(0, 52), d: String(d).slice(0, 90) });
  }
};

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
    const title = (r.paper.titleOriginal || r.paper.title || "").trim();
    const authors = r.paper.authors || [];

    if (!title) bump("noTitle", f, "");
    else if (title.length < 12) bump("shortTitle", f, title);
    if (/copyright|received:|creativecommons|frontiers in\b/i.test(title)) {
      bump("titleChrome", f, title);
    }
    if (!authors.length) bump("noAuthors", f, title.slice(0, 60));
    for (const a of authors) {
      if (
        /university|department|faculty|institute|corresponding|orcid|decision making|informatics|hospital|school of/i.test(
          a,
        )
      ) {
        bump("authorAffil", f, a);
      }
    }

    if (!nodes.some((n) => n.role === "abstract") && pages.length <= 40) {
      bump("noAbs", f, title.slice(0, 50));
    }

    for (const h of nodes.filter((n) => n.role === "heading")) {
      const t = (h.text ?? "").trim();
      if (/^copyright\b/i.test(t)) bump("copyrightHead", f, t);
      if (/^[A-D]$/.test(t)) bump("panelHead", f, `p${h.pageStart} ${t}`);
      if (/^(?:keywords?|key words?)\b/i.test(t) && t.length > 48) {
        bump("kwAsHead", f, t.slice(0, 60));
      }
      if (t.length > 160 && /[.!?]\s+[A-Z]/.test(t)) bump("proseHead", f, t.slice(0, 60));
    }

    for (const c of nodes.filter((n) => n.role === "caption")) {
      const t = (c.text ?? "").trim();
      if (!t || /^(?:figure|fig\.?|table|表)\s*\d+[a-z]?\s*:?\s*$/i.test(t)) {
        bump("emptyCap", f, t || "(empty)");
      }
    }

    for (const e of nodes.filter((n) => n.role === "equation")) {
      const t = (e.text ?? "").trim();
      if (/^\(\s*\d{1,2}[a-z]?\s*\)$/.test(t)) bump("bareEqNum", f, t);
      if (t.length <= 2) bump("tinyEq", f, t);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) bump("eqCtrl", f, t.slice(0, 40));
      if (/[ðþÐÞ]/.test(t)) bump("eqEth", f, t.slice(0, 40));
      if (/^[∫∑∏√∂∇≤≥≈≠±×÷⋅]/.test(t) && t.length < 8) bump("eqOrphanOp", f, t);
    }

    for (const p of nodes.filter((n) => n.role === "paragraph" || n.role === "other")) {
      const t = (p.text ?? "").trim();
      // `(0)` is a layer/tensor index, not a display equation number.
      if (/^\(\s*[1-9]\d?[a-z]?\s*\)$/.test(t)) bump("bareEqPara", f, `p${p.pageStart} ${t}`);
      // Numbered display stuck as paragraph: short line ending with (n) and math-ish body
      if (
        t.length >= 8 &&
        t.length <= 120 &&
        /\(\s*\d{1,2}[a-z]?\s*\)$/.test(t) &&
        /[=∫∑∏√∂∇≤≥≈≠±×÷⋅ˆ^_]/.test(t) &&
        !/[.!?]/.test(t.slice(0, -4))
      ) {
        bump("displayAsPara", f, `p${p.pageStart} ${t.slice(0, 70)}`);
      }
      if (/^[∫∑∏√]/.test(t) && /^[∫∑∏√]\s+[A-Z]/.test(t)) {
        bump("leadingOpProse", f, `p${p.pageStart} ${t.slice(0, 50)}`);
      }
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t) && /[=∫∑]/.test(t)) {
        bump("paraCtrlMath", f, t.slice(0, 40));
      }
    }
  } catch (err) {
    bump("err", f, String(err));
  }
}

console.log(JSON.stringify({ scanned: files.length, offset, by, hits }, null, 2));
