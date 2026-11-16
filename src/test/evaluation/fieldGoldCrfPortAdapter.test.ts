import { describe, expect, it } from "vitest";
import { predictionFromCrfPort } from "../../evaluation/fieldGold/adapters/crfport";

describe("CRF-port field gold adapter", () => {
  it("does not score Japanese references", () => expect(predictionFromCrfPort("ja", "ja", [], 1).unavailableFields).toContain("references"));
  it("returns an available empty reference list for empty English input", () => {
    const result = predictionFromCrfPort("en", "en", [], 1);
    expect(result.fields.references).toEqual([]);
    expect(result.unavailableFields).not.toContain("references");
  });
});
