import path from "node:path";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";

const dir = "test-fixtures/real-papers/pending-pdfs";
const names = [
  "epmc-psychometric-properties-and-symptom-profiles-of-the-phq-9-and-dass-21-am.pdf",
  "epmc-reply-to-the-meaningfulness-of-searching-for-minimal-exposure-duration-t.pdf",
];

function check(jobId: string, titleText: string, paragraphs: string[]) {
  const flags: string[] = [];
  const stop = new Set([
    "a", "an", "the", "of", "and", "or", "in", "on", "for", "to", "with", "from", "by",
    "using", "based", "study", "review", "paper", "pdf",
  ]);
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stop.has(w));
  const idTokens = tokens(jobId);
  const titleTokens = new Set(tokens(titleText));
  const overlap = idTokens.filter((t) => titleTokens.has(t)).length;
  const titleLooksAcademic =
    titleText.length >= 36 &&
    (/:\s*\S/.test(titleText) ||
      /\b(?:review|study|analysis|survey|protocol|effect|role|impact|reply|modeling|assessment)\b/i.test(
        titleText,
      ));
  if (
    idTokens.length >= 3 &&
    overlap === 0 &&
    /[A-Za-z]{4,}/.test(titleText) &&
    !titleLooksAcademic
  ) {
    flags.push("title-id-mismatch");
  }

  const sectionMarker =
    /(?:^|[.!?]\s+|—|–)(?:Abstract|Introduction|Related Work|Methods|Results|Discussion|Conclusions)(?!\.)(?:\s+[—–-]|[—–-]|\s+[A-Z])/;
  const glued = paragraphs.filter((t) => {
    if (/\bMethods\s+(?:Psychol|Ecol|Evol|Mol|Biochem|Enzymol)\b/i.test(t)) return false;
    if (/\bTutor\.\s*Quant\.\s*Methods\b/i.test(t)) return false;
    if (
      /^\d{1,3}\.\s+\p{L}/u.test(t.trim()) &&
      (/\bet al\b/i.test(t) || /\(\d{4}\)/.test(t) || /(?:^|\.\s)\d{4};\d/.test(t))
    ) {
      return false;
    }
    if (
      /^(?:Abstract|Introduction|Methods|Results|Discussion|Conclusions)\s+[A-Z]/.test(t) &&
      !/[.!?]\s+(?:Abstract|Introduction|Methods|Results|Discussion|Conclusions)\s+[A-Z]/.test(t)
    ) {
      return false;
    }
    return sectionMarker.test(t);
  });
  if (glued.length) flags.push(`embedded-section:${glued.length}`);
  return { overlap, titleLooksAcademic, flags, gluedSample: glued[0]?.slice(0, 80) };
}

async function main() {
  for (const name of names) {
    const pdf = path.join(dir, name);
    const pages = await extractPdfPages(pdf);
    const r = extractFromPages({
      pages,
      paperId: name,
      filePath: pdf,
      fileHash: name,
      metadata: { pageCount: pages.length },
    });
    const title = r.paper.titleOriginal || "";
    const paras = r.canonical.nodes
      .filter((n) => n.role === "paragraph")
      .map((n) => n.text || "");
    console.log(
      name.slice(0, 55),
      check(name.replace(/\.pdf$/, ""), title, paras),
      "\n title=",
      title.slice(0, 90),
    );
  }
}

main();
