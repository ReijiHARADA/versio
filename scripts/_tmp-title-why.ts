import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";
import { reconstructDocument } from "../src/services/pdfLayout.ts";
import { buildRoleCandidates } from "../src/services/pdfExtraction/generic/candidates.ts";
import { resolveTitle } from "../src/services/pdfExtraction/resolver/titleResolver.ts";

const pdf =
  "test-fixtures/real-papers/pending-pdfs/epmc-digital-behavioral-addictions-in-adolescents-and-young-adults-protocol-f.pdf";

async function main() {
  const pages = await extractPdfPages(pdf);
  const { blocks } = reconstructDocument(pages);
  const candidates = buildRoleCandidates(blocks as any, { pages } as any);
  const titles = candidates.filter((c) => c.role === "title" || /Digital behavioral|Registries at|Protocol for/i.test(c.text));
  console.log(
    "interesting candidates:",
    titles.map((c) => ({
      role: c.role,
      conf: c.confidence,
      t: c.text.slice(0, 140),
    }))
  );
  const resolved = resolveTitle({
    candidates,
    metadataTitle: undefined,
  });
  console.log("resolved:", resolved.text?.slice(0, 200), "conf", resolved.confidence);
  console.log(
    "evidence:",
    resolved.evidence?.map((e) => e.reason).slice(-8)
  );
}
main();
