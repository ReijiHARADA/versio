import { describe, expect, it } from "vitest";
import { parseGrobidFulltextTei, predictionFromGrobid } from "../../evaluation/fieldGold/adapters/grobid";

const TEI = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
<titleStmt><title level="a" type="main">Interactive Jewellery</title></titleStmt>
<sourceDesc><biblStruct><analytic>
<author><persName><forename type="first">Jane</forename><forename type="middle">Q</forename><surname>Smith</surname></persName><email>Jane@u-tokyo.ac.jp</email>
<affiliation key="aff0"><note type="raw_affiliation"><label>1</label> University of Tokyo, Japan</note><orgName type="institution">University of Tokyo</orgName></affiliation></author>
<author><persName><forename type="first">Bo</forename><surname>Chen</surname></persName>
<affiliation key="aff0"><orgName type="institution">University of Tokyo</orgName></affiliation></author>
</analytic></biblStruct></sourceDesc></fileDesc></teiHeader>
<text><body>
<figure xml:id="fig_0"><head>Figure 3:</head><label>3</label><figDesc>Overview of the system.</figDesc></figure>
<figure type="table" xml:id="tab_0"><head>Table 1</head><label>1</label><figDesc>Results by condition.</figDesc></figure>
</body><back><div type="references"><listBibl>
<biblStruct><analytic><title level="a" type="main">Deep models of reading</title><author><persName><surname>Lee</surname></persName></author></analytic>
<monogr><title level="j">Nature</title><imprint><date type="published" when="2020-01-02"/></imprint></monogr><idno type="DOI">10.1/abc</idno>
<note type="raw_reference">Lee A. Deep models of reading. Nature. 2020.</note></biblStruct>
<biblStruct><monogr><title level="m">A book</title><imprint><date when="2019"/></imprint></monogr></biblStruct>
</listBibl></div></back></text></TEI>`;

describe("parseGrobidFulltextTei", () => {
  const r = parseGrobidFulltextTei(TEI);
  it("reads title, header authors, affiliations and emails", () => {
    expect(r.title).toBe("Interactive Jewellery");
    expect(r.authors).toEqual([
      { name: "Jane Q Smith", affiliationKeys: ["aff0"] },
      { name: "Bo Chen", affiliationKeys: ["aff0"] },
    ]);
    expect(r.affiliations).toEqual([{ key: "aff0", text: "University of Tokyo, Japan" }]);
    expect(r.emails).toEqual(["jane@u-tokyo.ac.jp"]);
  });
  it("reads figure and table captions with labels", () => {
    expect(r.captions).toEqual([
      { kind: "figure", label: "Figure 3", text: "Overview of the system." },
      { kind: "table", label: "Table 1", text: "Results by condition." },
    ]);
  });
  it("reads references with title, year and DOI", () => {
    expect(r.references).toHaveLength(2);
    expect(r.references[0]).toEqual({ raw: "Lee A. Deep models of reading. Nature. 2020.", title: "Deep models of reading", year: "2020", doi: "10.1/abc" });
    expect(r.references[1]).toMatchObject({ title: "A book", year: "2019" });
  });
});

describe("predictionFromGrobid", () => {
  it("marks every field unavailable when GROBID returned nothing", () => {
    expect(predictionFromGrobid("x", null, 0, "0.9.1").unavailableFields).toHaveLength(6);
  });
});
