import fs from "node:fs";
import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const targets = [
  "epmc-digital-behavioral-addictions-in-adolescents-and-young-adults-protocol-f.pdf",
  "epmc-disentangling-cation-polyanion-coupling-reveals-which-anion-motion-domin.pdf",
];
const opto = fs
  .readdirSync(dir)
  .find((f) => f.includes("optoelectronic-chaos") || f.includes("optoelectronic"));
if (opto) targets.push(opto);

async function dump(pdfName: string) {
  const pdf = path.join(dir, pdfName);
  const pages = await extractPdfPages(pdf);
  const r = extractFromPages({
    pages,
    paperId: pdfName,
    filePath: pdf,
    fileHash: pdfName,
    metadata: { pageCount: pages.length },
  });
  const title =
    r.paper?.title ||
    r.canonical.nodes.find((n) => n.role === "title")?.text;
  const authors = (r.paper?.authors || []).map((a: unknown) =>
    typeof a === "string" ? a : String((a as { name?: string })?.name || a)
  );
  const heads = r.canonical.nodes
    .filter((n) => n.role === "heading")
    .map((n) => ({ t: n.text, p: n.pageStart }))
    .filter((h) => (h.t || "").length <= 8 || /Þ|þ|Registr|Nature/.test(h.t || ""));
  const early = r.canonical.nodes
    .filter((n) => (n.pageStart ?? 0) <= 1)
    .slice(0, 40)
    .map((n) => ({
      role: n.role,
      t: String(n.text || "").slice(0, 120),
      p: n.pageStart,
    }));
  console.log("====", pdfName);
  console.log("TITLE:", title);
  console.log("AUTHORS:", authors.slice(0, 15));
  console.log("SHORT/ODD HEADS:", heads.slice(0, 20));
  console.log("EARLY NODES:", JSON.stringify(early, null, 2));
}

async function main() {
  for (const t of targets) await dump(t);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
