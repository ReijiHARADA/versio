import { describe, expect, it } from "vitest";
import { acceptPair, goldFromManual, stratifiedSample } from "../../evaluation/fieldGold/sample";
import type { FieldRecord } from "../../evaluation/fieldGold/types";

function record(title: string, author: string): FieldRecord {
  return { title, authors: [{ name: author, affiliationKeys: [] }], affiliations: [], emails: [], captions: [], references: [] };
}

describe("acceptPair", () => {
  it("rejects when the first author is missing", () => {
    expect(acceptPair(record("Deep Learning for Jewellery", "Jane Smith"), "Deep Learning for Jewellery\nBo Chen", "en")).toBe(false);
  });
  it("accepts with hyphenated line breaks and footnote markers", () => {
    const text = "Deep Learn-\ning for Jewel-\nlery\nJane Smith*1, Bo Chen2";
    expect(acceptPair(record("Deep Learning for Jewellery", "Jane Smith"), text, "en")).toBe(true);
  });
  it("accepts Japanese with spacing differences", () => {
    expect(acceptPair(record("泉眞也の方法論", "山田 太郎"), "泉 眞 也 の 方 法 論\n山田太郎", "ja")).toBe(true);
  });
});

describe("stratifiedSample", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({
    id: `d${i}`,
    source: i < 20 ? ("europepmc" as const) : ("arxiv" as const),
    discipline: i % 2 ? "medicine" : "social",
    language: "en" as const,
  }));
  const quota = { "europepmc/medicine": 3, "europepmc/social": 2, "arxiv/medicine": 50 };

  it("is deterministic for a seed", () => {
    expect(stratifiedSample(items, quota, 20261115)).toEqual(stratifiedSample([...items].reverse(), quota, 20261115));
  });
  it("respects quotas and returns what is available", () => {
    const out = stratifiedSample(items, quota, 20261115);
    expect(out.filter((x) => x.source === "europepmc" && x.discipline === "medicine")).toHaveLength(3);
    expect(out.filter((x) => x.source === "europepmc" && x.discipline === "social")).toHaveLength(2);
    expect(out.filter((x) => x.source === "arxiv" && x.discipline === "medicine")).toHaveLength(5);
    expect(out.filter((x) => x.source === "arxiv" && x.discipline === "social")).toHaveLength(0);
  });
});

describe("goldFromManual", () => {
  it("trusts only the title when only the title is recorded", () => {
    const g = goldFromManual({ id: "x", title: "A Title" }, "a.pdf", "0");
    expect(g.trustedFields).toEqual(["title"]);
    expect(g.source).toBe("manual");
  });
});
