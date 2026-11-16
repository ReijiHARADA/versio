import { describe, expect, it } from "vitest";
import { emailsFromText, predictionFromVersio, type VersioResultSlice } from "../../evaluation/fieldGold/adapters/versio";

function block(type: string, original: string | null, metadata: Record<string, unknown> = {}) {
  return { id: `b-${Math.random()}`, type, original, metadata, pageStart: 1 } as never;
}

const slice = {
  paper: {
    id: "p1",
    titleOriginal: "Interactive Jewellery",
    authors: ["Jane Smith", "Bo Chen"],
    authorsStructured: [{ id: "a1", name: "Jane Smith", affiliationIds: ["f1"] }, { id: "a2", name: "Bo Chen", affiliationIds: [] }],
    affiliations: [{ id: "f1", name: "University of Tokyo" }],
  },
  blocks: [
    block("figure", null, { captionOriginal: "Figure 3: Overview of the system.", figureNumber: "3" }),
    block("table", null, { captionOriginal: "Table 1. Results", tableNumber: "1" }),
    block("reference", "Smith J. Deep models. 2020."),
    block("paragraph", "Body text"),
  ],
  canonical: { nodes: [{ pageStart: 1, text: "Contact: {jane, bo}@u-tokyo.ac.jp and x.y@kyoto-u.ac.jp." }, { pageStart: 3, text: "z@else.org" }] },
} as unknown as VersioResultSlice;

describe("predictionFromVersio", () => {
  const p = predictionFromVersio(slice, 12);
  it("maps title, authors and affiliations", () => {
    expect(p.fields.title).toBe("Interactive Jewellery");
    expect(p.fields.authors[0]).toEqual({ name: "Jane Smith", affiliationKeys: ["f1"] });
    expect(p.fields.affiliations).toEqual([{ key: "f1", text: "University of Tokyo" }]);
  });
  it("maps captions with labels and strips the label prefix", () => {
    expect(p.fields.captions).toEqual([
      { kind: "figure", label: "Figure 3", text: "Overview of the system." },
      { kind: "table", label: "Table 1", text: "Results" },
    ]);
  });
  it("maps references and first-page emails", () => {
    expect(p.fields.references).toEqual([{ raw: "Smith J. Deep models. 2020." }]);
    expect(p.fields.emails.sort()).toEqual(["bo@u-tokyo.ac.jp", "jane@u-tokyo.ac.jp", "x.y@kyoto-u.ac.jp"]);
  });
});

describe("emailsFromText", () => {
  it("drops a trailing period", () => {
    expect(emailsFromText("mail a@b.org.")).toEqual(["a@b.org"]);
  });
});
