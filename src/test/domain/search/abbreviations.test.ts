import { describe, expect, it } from "vitest";
import { extractAbbreviations } from "../../../domain/search/abbreviations";

describe("extractAbbreviations", () => {
  it.each([
    ["Human-Computer Interaction (HCI)", { abbr: "HCI", longForm: "Human-Computer Interaction" }],
    ["we used augmented reality (AR) headsets", { abbr: "AR", longForm: "augmented reality" }],
    ["functional near-infrared spectroscopy (fNIRS)", { abbr: "fNIRS", longForm: "functional near-infrared spectroscopy" }],
    ["System Usability Scale (SUS)", { abbr: "SUS", longForm: "System Usability Scale" }],
    ["HCI (Human-Computer Interaction)", { abbr: "HCI", longForm: "Human-Computer Interaction" }],
    ["ヒューマンコンピュータインタラクション（HCI）では", { abbr: "HCI", longForm: "ヒューマンコンピュータインタラクション" }],
    ["これは認知負荷（cognitive load）を", { abbr: "cognitive load", longForm: "認知負荷" }],
  ])("finds %s", (text, expected) => {
    expect(extractAbbreviations(text)).toEqual([expected]);
  });

  it.each(["(2019)", "(Smith et al., 2020)", "(p < 0.05)", "(Fig. 3)", "the results (see below)"])("ignores %s", (text) => {
    expect(extractAbbreviations(text)).toEqual([]);
  });

  it("dedupes case-insensitively in first-occurrence order", () => {
    expect(extractAbbreviations("Human-Computer Interaction (HCI). human-computer interaction (hci).")).toEqual([
      { abbr: "HCI", longForm: "Human-Computer Interaction" },
    ]);
  });

  it("handles 200 KB in under 200 ms", () => {
    const text = `${"Human-Computer Interaction (HCI). ".repeat(6_000)}System Usability Scale (SUS)`;
    const started = performance.now();
    extractAbbreviations(text);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("rejects long forms that run into a citation and Japanese labels with digits", () => {
    expect(extractAbbreviations("as in Sheng et al., 2023; Xu et al., 2024 (Pie)")).toEqual([]);
    expect(extractAbbreviations("仮説（H1-H3）を立てた")).toEqual([]);
    expect(extractAbbreviations("拡張現実（AR）を使う")).toEqual([{ abbr: "AR", longForm: "拡張現実" }]);
  });
});
