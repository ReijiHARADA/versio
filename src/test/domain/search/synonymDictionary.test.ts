import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ROLE, SynonymDictionary, type SynonymDictionaryData } from "../../../domain/search/synonymDictionary";
import { buildSearchQuery } from "../../../domain/search/searchQuery";

const source = { id: "t", name: "t", version: "1", license: "MIT", url: "", synonymWeight: 0.6, crossWeight: 0.7 };

const data: SynonymDictionaryData = {
  version: 1,
  sources: [source],
  concepts: [
    [
      0,
      [
        ["ユーザビリティー", 1, ROLE.base, 1, "ユザビリティ"],
        ["usability", 1, ROLE.translation, 1],
        ["使い勝手", 2, ROLE.base, 1],
        ["操作性", 3, ROLE.base, 0],
      ],
    ],
    [
      0,
      [
        ["human computer interaction", 1, ROLE.base, 1],
        ["hci", 1, ROLE.abbr, 1],
        ["mixed reality", 2, ROLE.base, 1],
        ["mr", 2, ROLE.abbr, 1],
      ],
    ],
  ],
};

describe("SynonymDictionary", () => {
  const dictionary = new SynonymDictionary(data);

  it("relates forms of one lexeme and other lexemes by role and language", () => {
    const variants = dictionary.lookup("ユザビリティ") ?? [];
    expect(variants).toEqual([
      { term: "usability", label: "usability", weight: 0.9, relation: "translation" },
      { term: "使い勝手", label: "使い勝手", weight: 0.6, relation: "synonym" },
      { term: "操作性", label: "操作性", weight: 0.6, relation: "synonym" },
    ]);
    expect(dictionary.lookup("usability")?.find((v) => v.term === "使い勝手")?.relation).toBe("translation");
  });

  it("does not expand from target-only forms and returns null for unknown terms", () => {
    expect(dictionary.lookup("操作性")).toBeNull();
    expect(dictionary.lookup("unknown")).toBeNull();
  });

  it("expands abbreviations both ways but never adds a two-letter one", () => {
    expect(dictionary.lookup("hci")?.[0]).toMatchObject({ term: "human computer interaction", relation: "expansion" });
    expect(dictionary.lookup("human computer interaction")?.[0]).toMatchObject({ term: "hci", relation: "abbr" });
    expect(dictionary.lookup("mixed reality")?.some((v) => v.term === "mr")).toBe(false);
    expect(dictionary.lookup("mr")?.[0].term).toBe("mixed reality");
  });
});

describe("bundled dictionary", () => {
  const dictionary = new SynonymDictionary(
    JSON.parse(readFileSync("src/generated/synonyms.json", "utf8")) as SynonymDictionaryData
  );
  const active = (query: string) =>
    buildSearchQuery(query, { dictionary }).groups.flatMap((group) => group.variants.map((variant) => variant.label));

  it.each([
    ["使いやすさ", ["ユーザビリティ", "操作性", "usability"]],
    ["認知負荷", ["cognitive load", "認知的負荷"]],
    ["HCI", ["human-computer interaction", "ヒューマンコンピュータインタラクション"]],
    ["インターフェース", ["インターフェイス", "interface"]],
  ])("%s also searches %j", (query, expected) => {
    expect(active(query)).toEqual(expect.arrayContaining(expected));
  });

  it("keeps loose general-dictionary synonyms off by default", () => {
    expect(active("学習")).not.toContain("研究");
  });
});
