import { describe, expect, it } from "vitest";
import { isPreprintBandFragment } from "./publisherChrome";

describe("isPreprintBandFragment", () => {
  it("matches the split runs of the preprint license band", () => {
    expect(isPreprintBandFragment("(which was not certified by peer review) is the author/funder. All rights reserved.")).toBe(true);
    expect(isPreprintBandFragment("this version posted December 31, 2025. The copyright holder for this preprint (which")).toBe(true);
    expect(isPreprintBandFragment("bioRxiv preprint doi: https://doi.org/10.1101/2024.01.01.000001;")).toBe(true);
    expect(isPreprintBandFragment("doi: https://doi.org/10.64898/2025.12.31.697184;")).toBe(true);
  });

  it("leaves prose about peer review alone", () => {
    expect(isPreprintBandFragment("Manuscripts were selected after peer review by two editors.")).toBe(false);
    expect(isPreprintBandFragment("The dataset is described at https://doi.org/10.1101/x and in Table 2.")).toBe(false);
  });
});
