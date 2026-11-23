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

  it("keeps the hyphen before a capital", () => {
    expect(joinHyphenated("strengths of ConvNeXt-", "Tiny in this setting")).toBe("strengths of ConvNeXt-Tiny in this setting");
  });

  it("keeps the hyphen after a one- or two-letter head", () => {
    expect(joinHyphenated("measures like kd-", "trees and")).toBe("measures like kd-trees and");
    expect(joinHyphenated("and e-", "health services")).toBe("and e-health services");
    expect(joinHyphenated("Al-", "though the")).toBe("Although the");
    expect(joinHyphenated("the de-", "sign, and")).toBe("the design, and");
  });

  it("keeps a spaced dash at the line end", () => {
    expect(joinHyphenated("Methodology, Writing –", "review & editing")).toBe("Methodology, Writing – review & editing");
  });
});
