import { describe, expect, it } from "vitest";
import { parseBibliographicIdentifier } from "./identifiers";
import { parseArxivAtom, parseCrossrefWork } from "./parseRecords";
import { applyMetadataPatch } from "./applyPatch";
import type { Paper } from "../../types/paper";

describe("parseBibliographicIdentifier", () => {
  it.each([
    ["10.1145/3290605.3300233", { kind: "doi", id: "10.1145/3290605.3300233" }],
    ["https://doi.org/10.1038/nature14539.", { kind: "doi", id: "10.1038/nature14539" }],
    ["doi:10.1002/(SICI)1097-4571", { kind: "doi", id: "10.1002/(SICI)1097-4571" }],
    ["arXiv:2101.01234v2", { kind: "arxiv", id: "2101.01234v2" }],
    ["https://arxiv.org/pdf/2101.01234v1.pdf", { kind: "arxiv", id: "2101.01234v1" }],
    ["https://arxiv.org/abs/hep-th/9901001", { kind: "arxiv", id: "hep-th/9901001" }],
    ["10.48550/arXiv.2306.00001", { kind: "arxiv", id: "2306.00001" }],
    ["2306.00001", { kind: "arxiv", id: "2306.00001" }],
  ])("%s", (input, expected) => {
    expect(parseBibliographicIdentifier(input)).toEqual(expected);
  });

  it("rejects text without an identifier", () => {
    expect(parseBibliographicIdentifier("deep learning")).toBeNull();
    expect(parseBibliographicIdentifier("")).toBeNull();
  });
});

describe("parseCrossrefWork", () => {
  it("maps a journal article", () => {
    const record = parseCrossrefWork(
      JSON.stringify({
        message: {
          type: "journal-article",
          title: ["Deep <i>learning</i>"],
          author: [{ given: "Yann", family: "LeCun" }, { name: "DeepMind Team" }],
          "container-title": ["Nature"],
          issued: { "date-parts": [[2015, 5, 27]] },
          volume: "521",
          issue: "7553",
          page: "436-444",
          publisher: "Springer",
          DOI: "10.1038/nature14539",
          URL: "https://doi.org/10.1038/nature14539",
        },
      })
    );
    expect(record).toEqual({
      title: "Deep learning",
      authors: ["Yann LeCun", "DeepMind Team"],
      publication: "Nature",
      year: 2015,
      doi: "10.1038/nature14539",
      bibliography: {
        entryType: "article",
        volume: "521",
        issue: "7553",
        pages: "436–444",
        publisher: "Springer",
        url: "https://doi.org/10.1038/nature14539",
      },
    });
  });

  it("falls back to misc for unknown types", () => {
    const record = parseCrossrefWork(JSON.stringify({ message: { type: "dataset", title: [] } }));
    expect(record.bibliography).toEqual({ entryType: "misc" });
    expect(record.title).toBeUndefined();
  });
});

describe("parseArxivAtom", () => {
  const feed = (entry: string) =>
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>q</title>${entry}</feed>`;

  it("maps an arXiv entry", () => {
    const record = parseArxivAtom(
      feed(`<entry><id>http://arxiv.org/abs/1706.03762v7</id>
        <published>2017-06-12T17:57:34Z</published>
        <title>Attention Is All
          You Need</title>
        <author><name>Ashish Vaswani</name></author>
        <author><name>Noam Shazeer</name></author>
      </entry>`),
      "1706.03762v7"
    );
    expect(record).toEqual({
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      publication: undefined,
      year: 2017,
      doi: "10.48550/arXiv.1706.03762",
      bibliography: {
        entryType: "preprint",
        url: "https://arxiv.org/abs/1706.03762",
        arxivId: "1706.03762",
      },
    });
  });

  it("uses journal_ref and doi when present", () => {
    const record = parseArxivAtom(
      feed(`<entry><id>http://arxiv.org/abs/1234.5678v1</id><published>2012-01-01T00:00:00Z</published>
        <title>T &amp; U</title><arxiv:doi>10.1000/xyz</arxiv:doi>
        <arxiv:journal_ref>Phys. Rev. D 1 (2012)</arxiv:journal_ref></entry>`),
      "1234.5678"
    );
    expect(record.title).toBe("T & U");
    expect(record.doi).toBe("10.1000/xyz");
    expect(record.publication).toBe("Phys. Rev. D 1 (2012)");
    expect(record.bibliography.entryType).toBe("article");
  });

  it("throws for the arXiv error entry and empty feeds", () => {
    expect(() =>
      parseArxivAtom(feed(`<entry><id>http://arxiv.org/api/errors#incorrect_id</id></entry>`), "x")
    ).toThrow();
    expect(() => parseArxivAtom(feed(""), "x")).toThrow();
  });
});

describe("applyMetadataPatch", () => {
  const paper = {
    id: "p1",
    authors: ["A Smith", "B Jones"],
    authorsStructured: [
      { id: "author-1", name: "A Smith", affiliationIds: ["aff-1"] },
      { id: "author-2", name: "B Jones", affiliationIds: [] },
    ],
    titleOriginal: "Old",
    updatedAt: "2020-01-01",
  } as unknown as Paper;

  it("keeps author ids and affiliations by position and mints unique ids for new authors", () => {
    const next = applyMetadataPatch(paper, { authors: ["Alice Smith", " ", "B Jones", "C Lee"] }, "now");
    expect(next.authors).toEqual(["Alice Smith", "B Jones", "C Lee"]);
    expect(next.authorsStructured).toEqual([
      { id: "author-1", name: "Alice Smith", affiliationIds: ["aff-1"] },
      { id: "author-2", name: "B Jones", affiliationIds: [] },
      { id: "author-3", name: "C Lee", affiliationIds: [] },
    ]);
    expect(next.updatedAt).toBe("now");
  });

  it("leaves fields absent from the patch untouched", () => {
    const next = applyMetadataPatch(paper, { doi: "10.1/x" }, "now");
    expect(next.titleOriginal).toBe("Old");
    expect(next.authorsStructured).toBe(paper.authorsStructured);
    expect(next.doi).toBe("10.1/x");
  });
});
