import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "../../services/pdfExtraction/canonical/types";
import { withCorrespondenceNotes } from "../../services/pdfExtraction/projection/frontMatter/correspondenceNotes";

const node = (id: string, role: string, text: string, x: number, y: number) =>
  ({ id, role, text, pageStart: 1, boundingBoxes: [{ x, y, width: 80, height: 8 }] }) as unknown as CanonicalNode;

describe("withCorrespondenceNotes", () => {
  it("joins a sidebar label with the name and address below it into one footnote", () => {
    const out = withCorrespondenceNotes([
      node("l", "other", "*CORRESPONDENCE", 50, 279),
      node("a", "abstract", "Background: a long abstract paragraph.", 215, 280),
      node("n", "copyright", "Yam B. Limbu", 50, 288),
      node("e", "copyright", "limbuy@montclair.edu", 58, 297),
      node("c", "other", "CITATION", 50, 342),
    ]);
    expect(out.map((n) => n.id)).toEqual(["l", "a", "c"]);
    expect(out[0]).toMatchObject({ role: "footnote", text: "*CORRESPONDENCE: Yam B. Limbu, limbuy@montclair.edu" });
  });

  it("takes right-aligned sidebar rows and an author-filed name, but stops at the next field", () => {
    const right = (id: string, role: string, text: string, width: number, y: number) =>
      ({ id, role, text, pageStart: 1, boundingBoxes: [{ x: 159 - width, y, width, height: 8 }] }) as unknown as CanonicalNode;
    const out = withCorrespondenceNotes([
      right("l", "paragraph", "*Correspondence:", 60, 529),
      right("n", "author", "Eelke Folmer", 38, 539),
      right("e", "copyright", "eelke@unr.edu", 44, 549),
      right("r", "copyright", "Received: 07 April 2022", 70, 559),
    ]);
    expect(out.map((n) => n.id)).toEqual(["l", "r"]);
    expect(out[0]).toMatchObject({ role: "footnote", text: "*Correspondence: Eelke Folmer, eelke@unr.edu" });
  });

  it("re-roles inline notes but leaves byline e-mails and prose that runs on", () => {
    const out = withCorrespondenceNotes([
      node("i", "other", "*† Correspondence: buitrungthanh@utehy.edu.vn", 166, 248),
      node("b", "copyright", "bhauma@rpi.edu", 100, 120),
      node("p", "paragraph", "Email: a@b.org Carbon, the fourth most abundant element in the local universe, is", 50, 400),
    ]);
    expect(out.map((n) => n.role)).toEqual(["footnote", "copyright", "paragraph"]);
  });
});
