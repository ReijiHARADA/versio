import { describe, expect, it } from "vitest";
import { derivePaperReadiness } from "../domain/paperReadiness";

describe("derivePaperReadiness without loaded body", () => {
  it("allows opening ready papers before body is cached", () => {
    expect(
      derivePaperReadiness({ processingStatus: "ready", blocks: undefined }).canOpen
    ).toBe(true);
  });

  it("keeps extracting papers closed until body exists", () => {
    expect(
      derivePaperReadiness({ processingStatus: "extracting", blocks: undefined }).canOpen
    ).toBe(false);
  });
});
