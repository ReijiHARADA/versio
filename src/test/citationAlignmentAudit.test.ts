import { describe, expect, it } from "vitest";
import { diagnoseCitationAlignment } from "../services/translation/audit/citationAlignment";

describe("audit citation alignment", () => {
  it("flags an eligible translation that drops a numeric citation", () => {
    const result = diagnoseCitationAlignment(
      "The effect was reported previously [12, 13].",
      "この効果は以前に報告された。",
    );
    expect(result.eligible).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.missingCitationOccurrences).toEqual(["12", "13"]);
  });

  it("does not flag incomplete source fragments as citation failures", () => {
    const result = diagnoseCitationAlignment(
      "The result of the experiment is described in Section",
      "結果は説明されている。",
    );
    expect(result.eligible).toBe(false);
    expect(result.flagged).toBe(false);
  });
});
