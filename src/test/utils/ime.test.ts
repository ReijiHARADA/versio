import { describe, expect, it } from "vitest";
import { isImeComposing } from "../../utils/ime";

describe("isImeComposing", () => {
  it("recognizes both modern composition state and Chrome/WebKit keyCode 229", () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true);
    expect(isImeComposing({ nativeEvent: { keyCode: 229 } })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
