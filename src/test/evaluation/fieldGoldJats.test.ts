import { describe, expect, it } from "vitest";
import { parseJatsFields } from "../../evaluation/fieldGold/jats";

const JATS = `<?xml version="1.0"?>
<article>
<front><article-meta>
  <title-group><article-title>A <italic>synthetic</italic> study of things</article-title></title-group>
  <contrib-group>
    <contrib contrib-type="author" corresp="yes"><name><surname>Smith</surname><given-names>Jane</given-names></name><xref ref-type="aff" rid="aff1"><sup>1</sup></xref><xref ref-type="corresp" rid="c1">*</xref></contrib>
    <contrib contrib-type="author"><name><surname>Chen</surname><given-names>Bo</given-names></name><xref ref-type="aff" rid="aff1"/><xref ref-type="aff" rid="aff2"/><email>bo@example.org</email></contrib>
    <contrib contrib-type="editor"><name><surname>Editor</surname><given-names>Ed</given-names></name></contrib>
  </contrib-group>
  <aff id="aff1"><label>1</label><institution>Univ A</institution>, <country>Japan</country></aff>
  <aff id="aff2"><label>2</label><institution-wrap><institution>Lab B</institution></institution-wrap></aff>
  <author-notes><corresp id="c1">* Correspondence: <email>jane@example.org</email></corresp></author-notes>
</article-meta></front>
<body>
  <fig id="f1"><label>Figure 1</label><caption><title>Overview.</title><p>Text of the caption.</p></caption></fig>
  <table-wrap id="t1"><label>Table 1</label><caption><p>Table caption.</p></caption><table/></table-wrap>
</body>
<back>
  <app-group><app><fig id="fa"><label>Figure A1</label><caption><p>Appendix fig.</p></caption></fig></app></app-group>
  <ref-list>
    <ref id="r1"><mixed-citation publication-type="journal"><person-group><name><surname>Lee</surname><given-names>A</given-names></name></person-group>. <article-title>Prior work</article-title>. <source>J Things</source>. <year>2019</year>;<volume>3</volume>. <pub-id pub-id-type="doi">10.1000/xyz</pub-id></mixed-citation></ref>
    <ref id="r2"><element-citation><article-title>Second</article-title><year>2020a</year></element-citation></ref>
  </ref-list>
</back>
<sub-article><body><fig><label>Figure S1</label><caption><p>Sub fig.</p></caption></fig></body></sub-article>
</article>`;

describe("parseJatsFields", () => {
  const r = parseJatsFields(JATS);
  it("reads the title with inline markup", () => expect(r.title).toBe("A synthetic study of things"));
  it("reads authors with affiliation keys and skips editors", () => {
    expect(r.authors).toEqual([
      { name: "Jane Smith", affiliationKeys: ["aff1"] },
      { name: "Bo Chen", affiliationKeys: ["aff1", "aff2"] },
    ]);
  });
  it("reads affiliations without labels", () => {
    expect(r.affiliations).toEqual([{ key: "aff1", text: "Univ A, Japan" }, { key: "aff2", text: "Lab B" }]);
  });
  it("collects emails once each", () => expect(r.emails.sort()).toEqual(["bo@example.org", "jane@example.org"]));
  it("reads body figure and table captions only", () => {
    expect(r.captions).toEqual([
      { kind: "figure", label: "Figure 1", text: "Overview. Text of the caption." },
      { kind: "table", label: "Table 1", text: "Table caption." },
    ]);
  });
  it("reads references", () => {
    expect(r.references).toHaveLength(2);
    expect(r.references[0]).toMatchObject({ title: "Prior work", year: "2019", doi: "10.1000/xyz" });
    expect(r.references[0].raw).toContain("Lee A");
    expect(r.references[1]).toMatchObject({ title: "Second", year: "2020" });
  });
  it("finds a ref-list outside <back>", () => {
    const xml = `<article><front><article-meta><title-group><article-title>T</article-title></title-group></article-meta></front><body><p>x</p><ref-list><ref id="r1"><mixed-citation>Smith J. <article-title>Only ref</article-title>. 2021.</mixed-citation></ref></ref-list></body></article>`;
    expect(parseJatsFields(xml).references).toHaveLength(1);
  });
  it("drops institution ids and links a lone affiliation to every author", () => {
    const xml = `<article><front><article-meta><contrib-group><contrib contrib-type="author"><name><surname>Lee</surname><given-names>Ann</given-names></name></contrib><contrib contrib-type="author"><name><surname>Kim</surname><given-names>Bo</given-names></name></contrib></contrib-group><aff id="a1"><institution-wrap><institution-id institution-id-type="ror">https://ror.org/027m9bs27</institution-id><institution>Kyoto University</institution></institution-wrap></aff></article-meta></front></article>`;
    const r = parseJatsFields(xml);
    expect(r.affiliations).toEqual([{ key: "a1", text: "Kyoto University" }]);
    expect(r.authors.map((a) => a.affiliationKeys)).toEqual([["a1"], ["a1"]]);
  });
});
