import { describe, expect, it } from "vitest";
import { splitFlattenedList } from "../../services/pdfExtraction/projection/toPaper";

describe("flattened list projection", () => {
  it("keeps inline numbered prose together and splits physical list lines", () => {
    const inline = "We evaluate three settings: 1. stable layout 2. adaptive layout 3. mixed layout";
    expect(splitFlattenedList(inline)).toEqual([inline]);
    const physical = "We evaluate three settings:\n1. stable layout\n2. adaptive layout\n3. mixed layout";
    expect(splitFlattenedList(physical)).toEqual([
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
