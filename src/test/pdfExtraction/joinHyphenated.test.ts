import { describe, expect, it } from "vitest";
import { joinHyphenated } from "../../services/pdfLayout";

describe("joinHyphenated", () => {
  it("drops a line-end hyphen when the joined form is a dictionary word", () => {
    expect(joinHyphenated("ten cate-", "gories of")).toBe("ten categories of");
    expect(joinHyphenated("content, nat-", "urally resulting")).toBe("content, naturally resulting");
    expect(joinHyphenated("for inter-", "national use")).toBe("for international use");
  });

  it("keeps compounds and prefix forms that are written both ways", () => {
    expect(joinHyphenated("a decision-", "support tool")).toBe("a decision-support tool");
    expect(joinHyphenated("a non-", "linear model")).toBe("a non-linear model");
    expect(joinHyphenated("memory- and interaction-", "perspectives")).toBe("memory- and interaction-perspectives");
  });

  it("keeps a spaced dash at the line end", () => {
    expect(joinHyphenated("Methodology, Writing –", "review & editing")).toBe("Methodology, Writing – review & editing");
  });
});
