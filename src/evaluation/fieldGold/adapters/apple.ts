import type { FieldName, FieldPrediction, FieldRecord } from "../types";

export type ProbeBox = { x: number; y: number; w: number; h: number };
export type ProbeOutput = {
  fmAvailable: boolean;
  fmError?: string | null;
  pages: Array<{ page: number; title?: string | null; paragraphs: Array<{ text: string; bbox: ProbeBox }>; lists: Array<{ items: string[]; bbox: ProbeBox }>; tables: number }>;
  header?: { title: string | null; authors: Array<{ name: string; affiliationKeys: string[] }>; affiliations: Array<{ key: string; text: string }>; emails: string[] } | null;
};

const CAPTION = /^\s*(fig(?:ure)?\.?|table|図|表)\s*(\d+[a-z]?)\s*[.:：|]?\s*/i;
const REFERENCES_HEADING = /^\s*(?:\d+\.?\s*)?(references|bibliography|literature cited|参考文献|引用文献)\s*$/i;
const HEADER_FIELDS: FieldName[] = ["authors", "authorAffiliation", "emails"];

/**
 * Vision document structure (+ on-device LLM header when available) → FieldRecord.
 * Without the LLM, authors / affiliations / emails are "unavailable", not 0.
 */
export function predictionFromApple(id: string, json: ProbeOutput, elapsedMs: number): FieldPrediction {
  const captions: FieldRecord["captions"] = [];
  for (const page of json.pages) {
    for (const p of page.paragraphs) {
      const m = p.text.match(CAPTION);
      if (!m) continue;
      const kind = /^(table|表)/i.test(m[1]) ? ("table" as const) : ("figure" as const);
      captions.push({ kind, label: `${kind === "table" ? "Table" : "Figure"} ${m[2]}`, text: p.text.slice(m[0].length).trim() });
    }
  }

  const references: FieldRecord["references"] = [];
  let inReferences = false;
  for (const page of json.pages) {
    let headingY: number | null = null;
    const texts: string[] = [];
    for (const p of page.paragraphs) {
      if (!inReferences && REFERENCES_HEADING.test(p.text)) {
        inReferences = true;
        headingY = p.bbox.y;
        continue;
      }
      if (inReferences) texts.push(p.text);
    }
    if (!inReferences) continue;
    for (const list of page.lists) {
      if (headingY !== null && list.bbox.y > headingY) continue; // above the heading (normalized y grows upward)
      for (const item of list.items) if (!texts.some((t) => t.includes(item.trim()))) texts.push(item);
    }
    for (const t of texts) if (t.trim().length >= 20) references.push({ raw: t.trim() });
  }

  const header = json.fmAvailable ? json.header ?? null : null;
  const title = header?.title ?? json.pages[0]?.title ?? null;
  return {
    id,
    parser: "apple",
    parserVersion: json.fmAvailable ? "vision+fm" : "vision",
    elapsedMs,
    unavailableFields: header ? [] : HEADER_FIELDS,
    fields: {
      title,
      authors: header?.authors ?? [],
      affiliations: header?.affiliations ?? [],
      emails: header?.emails ?? [],
      captions,
      references,
    },
  };
}
