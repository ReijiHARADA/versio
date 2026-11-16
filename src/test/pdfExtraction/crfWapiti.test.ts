import { describe, expect, it } from "vitest";
import { bigramIndex, decode, expandPattern, parseHexFloat, parsePattern, parseWapitiModel } from "../../services/pdfExtraction/crf/wapiti";

// Two labels A/B. Observations in order: "u0:x" (L=2 weights at 0..1), "u0:y" (2..3), "b" (4..7).
const MODEL = [
  "#mdl#2#5",
  "#rdr#2/1/0",
  "10:u0:%x[0,0],",
  "1:b,",
  "#qrk#2",
  "1:A,",
  "1:B,",
  "#qrk#3",
  "4:u0:x,",
  "4:u0:y,",
  "1:b,",
  "0=0x1p+1",
  "3=0x1.8p-1",
  `${4 + bigramIndex(0, 1, 2)}=0x1p+2`,
].join("\n");

describe("Wapiti model", () => {
  const model = parseWapitiModel(MODEL);

  it("parses labels and patterns", () => {
    expect(model.labels).toEqual(["A", "B"]);
    expect(model.patterns.map((p) => p.kind)).toEqual(["u", "b"]);
  });
  it("reads hex floats", () => {
    expect(parseHexFloat("0x1.8p-1")).toBe(0.75);
    expect(parseHexFloat("-0x1p+1")).toBe(-2);
  });
  it("picks the label with the dominant unigram weight", () => {
    expect(decode(model, [["x"]])).toEqual(["A"]);
    expect(decode(model, [["y"]])).toEqual(["B"]);
  });
  it("lets a bigram weight change the path", () => {
    // Without the A→B transition bonus the second token ("z", unknown) would stay A.
    expect(decode(model, [["x"], ["z"]])).toEqual(["A", "B"]);
  });
  it("treats unknown observations as zero", () => {
    expect(() => decode(model, [["unseen"], ["also-unseen"]])).not.toThrow();
  });
  it("uses Wapiti placeholders outside the sequence", () => {
    const p = parsePattern("u1:%x[-1,0]/%x[1,0]");
    expect(expandPattern(p, [["a"]], 0)).toBe("u1:_x-1/_x+1");
  });
});
