import type { ExtractAcademicPdfResult } from "../../../services/pdfExtraction/pipeline/extractAcademicPdf";
import type { FieldPrediction, FieldRecord } from "../types";

export type VersioResultSlice = Pick<ExtractAcademicPdfResult, "paper" | "blocks" | "canonical">;

const CAPTION_LABEL = /^\s*(?:fig(?:ure)?\.?|table|図|表)\s*[\dA-Za-z]+(?:[.-]\d+)*\s*[.:：|]?\s*/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const GROUPED_EMAIL = /\{([^{}]+)\}\s*@\s*([\w-]+(?:\.[\w-]+)+)/g;

/** Emails on pages 1–2, including the `{a, b}@host` form. Paper has no email field, so this reads canonical text. */
export function emailsFromText(textValue: string): string[] {
  const found = new Set<string>();
  const rest = textValue.replace(GROUPED_EMAIL, (_, users: string, host: string) => {
    for (const user of users.split(/[,;|\s]+/).filter(Boolean)) found.add(`${user}@${host}`.toLowerCase());
    return " ";
  });
  for (const m of rest.match(EMAIL) ?? []) found.add(m.replace(/\.$/, "").toLowerCase());
  return [...found];
}

export function predictionFromVersio(result: VersioResultSlice, elapsedMs: number, id = result.paper.id): FieldPrediction {
  const { paper, blocks, canonical } = result;
  const affiliations = (paper.affiliations ?? []).map((a) => ({ key: a.id, text: a.name }));
  const authors = paper.authorsStructured?.length
    ? paper.authorsStructured.map((a) => ({ name: a.name, affiliationKeys: a.affiliationIds ?? [] }))
    : paper.authors.map((name) => ({ name, affiliationKeys: [] }));
  const captions: FieldRecord["captions"] = [];
  for (const block of blocks) {
    if (block.type !== "figure" && block.type !== "table") continue;
    const meta = block.metadata as { captionOriginal?: string; figureNumber?: string; tableNumber?: string };
    const caption = meta.captionOriginal?.trim();
    if (!caption) continue;
    const number = block.type === "figure" ? meta.figureNumber : meta.tableNumber;
    captions.push({
      kind: block.type,
      label: number ? `${block.type === "figure" ? "Figure" : "Table"} ${number}` : null,
      text: caption.replace(CAPTION_LABEL, ""),
    });
  }
  const references = blocks.filter((b) => b.type === "reference" && b.original?.trim()).map((b) => ({ raw: b.original!.trim() }));
  const firstPage = canonical.nodes.filter((n) => n.pageStart <= 2 && n.text).map((n) => n.text).join("\n");
  return {
    id,
    parser: "versio",
    parserVersion: "current",
    elapsedMs,
    unavailableFields: [],
    fields: { title: paper.titleOriginal || null, authors, affiliations, emails: emailsFromText(firstPage), captions, references },
  };
}
