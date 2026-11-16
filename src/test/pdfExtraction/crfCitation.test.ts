import { describe, expect, it } from "vitest";
import { tokenizeGrobid } from "../../services/pdfExtraction/crf/tokenize";

describe("GROBID citation tokenizer", () => {
  it("preserves unicode words while splitting GROBID delimiters", () => {
    expect(tokenizeGrobid("Müller ﬁeld 「x」")).toEqual(["Müller", " ", "field", " ", "「x」"]);
  });
  it("keeps URL components usable for the identifier feature", () => {
    expect(tokenizeGrobid("https://doi.org/10.1000/x")).toEqual(["https", ":", "/", "/", "doi", ".", "org", "/", "10", ".", "1000", "/", "x"]);
  });
});
