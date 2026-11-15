import { describe, expect, it } from "vitest";
import { parseJstageFields } from "../../evaluation/fieldGold/jstage";

// Shape verified against a live J-STAGE WebAPI (service=3) response on 2026-11-15; values are synthetic.
const ENTRY = `<feed><entry>
  <article_title><en><![CDATA[A Synthetic Study]]></en><ja><![CDATA[合成的な研究：試験]]></ja></article_title>
  <author><en><name><![CDATA[Taro Yamada]]></name><name><![CDATA[Hanako Sato]]></name></en>
  <ja><name><![CDATA[山田 太郎]]></name><name><![CDATA[佐藤 花子]]></name></ja></author>
  <prism:doi>10.0000/synthetic.1</prism:doi>
</entry></feed>`;

const JATS = `<article><front><article-meta>
  <title-group><article-title>合成的な研究：試験</article-title></title-group>
  <contrib-group><contrib contrib-type="author"><name><surname>山田</surname><given-names>太郎</given-names></name><xref ref-type="aff" rid="a1"/></contrib></contrib-group>
  <aff id="a1">架空大学</aff>
</article-meta></front><body><fig><label>図1</label><caption><p>概要</p></caption></fig></body>
<back><ref-list><ref><mixed-citation>文献A，2020．</mixed-citation></ref></ref-list></back></article>`;

describe("parseJstageFields", () => {
  it("reads Japanese title and authors from the WebAPI entry", () => {
    const r = parseJstageFields({ searchApiXml: ENTRY, fullTextJats: null });
    expect(r.fields.title).toBe("合成的な研究：試験");
    expect(r.fields.authors.map((a) => a.name)).toEqual(["山田 太郎", "佐藤 花子"]);
    expect(r.trustedFields).toEqual(["title", "authors"]);
  });
  it("falls back to English when there is no Japanese", () => {
    const en = ENTRY.replace(/<ja>[\s\S]*?<\/ja>/g, "");
    expect(parseJstageFields({ searchApiXml: en, fullTextJats: null }).fields.title).toBe("A Synthetic Study");
  });
  it("adds captions, references and author affiliation from full-text JATS", () => {
    const r = parseJstageFields({ searchApiXml: ENTRY, fullTextJats: JATS });
    expect(r.trustedFields).toEqual(["title", "authors", "authorAffiliation", "captions", "references"]);
    expect(r.fields.captions).toEqual([{ kind: "figure", label: "図1", text: "概要" }]);
    expect(r.fields.references).toHaveLength(1);
    expect(r.fields.affiliations).toEqual([{ key: "a1", text: "架空大学" }]);
  });
});
