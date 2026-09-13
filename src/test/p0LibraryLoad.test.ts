import { describe, expect, it } from "vitest";
import { buildFtsMatchQuery } from "../data/sqlite/fts";
import { derivePaperReadiness } from "../domain/paperReadiness";

describe("buildFtsMatchQuery", () => {
  it("quotes tokens for FTS5 MATCH", () => {
    expect(buildFtsMatchQuery(" interactive jewellery ")).toBe(
      '"interactive" "jewellery"'
    );
  });

  it("strips MATCH metacharacters", () => {
    expect(buildFtsMatchQuery('foo"bar*')).toBe('"foobar"');
  });
});

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
