import { describe, expect, it } from "vitest";
import { splitFlattenedList } from "../../services/pdfExtraction/projection/toPaper";

describe("flattened list projection", () => {
  it("splits numbered items without changing their source text", () => {
    const source = "We evaluate three settings: 1. stable layout 2. adaptive layout 3. mixed layout";
    expect(splitFlattenedList(source)).toEqual([
      "We evaluate three settings:",
      "1. stable layout",
      "2. adaptive layout",
      "3. mixed layout",
    ]);
  });

  it("does not split decimal values as list markers", () => {
    const source = "The measured value was 2.5 mm and the sample count was 20.";
    expect(splitFlattenedList(source)).toEqual([source]);
  });
});
