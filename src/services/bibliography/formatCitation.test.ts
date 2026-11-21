import { describe, expect, it } from "vitest";
import type { Paper } from "../../types/paper";
import { citationKeys, toBibTeX, toRIS } from "./formatCitation";

const paper = (overrides: Partial<Paper>): Paper =>
  ({
    id: "p",
    titleOriginal: "Deep Learning",
    authors: ["Yann LeCun", "Yoshua Bengio"],
    publication: "Nature",
    year: 2015,
    doi: "10.1038/nature14539",
    bibliography: { entryType: "article", volume: "521", issue: "7553", pages: "436–444" },
    ...overrides,
  }) as Paper;

describe("citationKeys", () => {
  it("builds author-year-word keys and disambiguates duplicates", () => {
    expect(citationKeys([paper({}), paper({}), paper({ authors: [], titleOriginal: null, year: null })])).toEqual([
      "lecun2015deep",
      "lecun2015deepa",
      "paper",
    ]);
  });

  it("transliterates accents and skips short words", () => {
    expect(citationKeys([paper({ authors: ["José Müller"], titleOriginal: "On the Attention" })])).toEqual([
      "muller2015attention",
    ]);
  });
});

describe("toBibTeX", () => {
  it("writes a journal article", () => {
    expect(toBibTeX([paper({})])).toBe(
      [
        "@article{lecun2015deep,",
        "  title = {Deep Learning},",
        "  author = {Yann LeCun and Yoshua Bengio},",
        "  journal = {Nature},",
        "  year = {2015},",
        "  volume = {521},",
        "  number = {7553},",
        "  pages = {436--444},",
        "  doi = {10.1038/nature14539}",
        "}",
        "",
      ].join("\n")
    );
  });

  it("writes an arXiv preprint as @misc with eprint and escapes specials", () => {
    const out = toBibTeX([
      paper({
        titleOriginal: "R&D at 100% {fast}",
        publication: null,
        doi: "10.48550/arXiv.1706.03762",
        bibliography: { entryType: "preprint", arxivId: "1706.03762", url: "https://arxiv.org/abs/1706.03762" },
      }),
    ]);
    expect(out).toContain("@misc{");
    expect(out).toContain("title = {R\\&D at 100\\% \\{fast\\}}");
    expect(out).toContain("eprint = {1706.03762}");
    expect(out).toContain("archivePrefix = {arXiv}");
    expect(out).toContain("doi = {10.48550/arXiv.1706.03762}");
    expect(out).not.toContain("journal");
  });

  it("uses booktitle for proceedings", () => {
    expect(toBibTeX([paper({ publication: "CHI", bibliography: { entryType: "inproceedings" } })])).toContain(
      "booktitle = {CHI}"
    );
  });
});

describe("toRIS", () => {
  it("writes one record per paper with split pages", () => {
    expect(toRIS([paper({})]).split("\r\n")).toEqual([
      "TY  - JOUR",
      "TI  - Deep Learning",
      "AU  - Yann LeCun",
      "AU  - Yoshua Bengio",
      "JO  - Nature",
      "PY  - 2015",
      "VL  - 521",
      "IS  - 7553",
      "SP  - 436",
      "EP  - 444",
      "DO  - 10.1038/nature14539",
      "ER  - ",
      "",
    ]);
  });

  it("infers a preprint without an explicit type", () => {
    expect(toRIS([paper({ bibliography: { arxivId: "1706.03762" } })])).toMatch(/^TY {2}- UNPB/);
  });
});
