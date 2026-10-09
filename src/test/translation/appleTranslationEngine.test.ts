import { describe, expect, it } from "vitest";
import { isAppleEligibleSource } from "../../services/translation/appleTranslationEngine";

describe("Apple translation eligibility", () => {
  it("accepts complete ordinary prose", () => {
    expect(isAppleEligibleSource("The study examined 20 participants and found no significant difference between the conditions.")).toBe(true);
  });
  it("rejects structural and contaminated sources", () => {
    expect(isAppleEligibleSource("ABSTRACT")).toBe(false);
    expect(isAppleEligibleSource("author@example.com 1,2")).toBe(false);
    expect(isAppleEligibleSource("Figure 2")).toBe(false);
    expect(isAppleEligibleSource("This sentence is truncated at the page boundary and")).toBe(false);
  });
});
