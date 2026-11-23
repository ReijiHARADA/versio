import { describe, expect, it } from "vitest";
import { normalizeIndexText, normalizeSearchText } from "../../../domain/search/normalizeSearchText";

describe("normalizeSearchText", () => {
  it.each([
    ["インターフェース", "インタフェース"],
    ["コンピューター", "コンピュータ"],
    ["ユーザー・インターフェース", "ユーザインタフェース"],
    ["ヴァイオリン", "バイオリン"],
    ["ｲﾝﾀｰﾌｪｰｽ", "インタフェース"],
    ["ＨＣＩ", "hci"],
    ["Human–Computer Interaction", "human-computer interaction"],
    ["eﬃcient", "efficient"],
    ["認知 負荷", "認知負荷"],
  ])("treats %s and %s as the same", (a, b) => {
    expect(normalizeSearchText(a)).toBe(normalizeSearchText(b));
  });

  it("keeps different words apart", () => {
    expect(normalizeSearchText("ユーザビリティ")).not.toBe(normalizeSearchText("ユーザ"));
    expect(normalizeSearchText("user interface")).toBe("user interface");
  });

  it("separates Latin words from Japanese text", () => {
    expect(normalizeSearchText("UIの設計")).toBe("ui の設計");
    expect(normalizeSearchText("GPT-4を使う")).toBe("gpt 4 を使う");
  });

  it("is idempotent", () => {
    const samples = [
      "ユーザー・インターフェース、認知負荷（cognitive load）を測る。UI/UX 3D",
      "  ーーカーー ヴ  ",
    ];
    for (const sample of samples) {
      const once = normalizeIndexText(sample);
      expect(normalizeIndexText(once)).toBe(once);
    }
  });

  it("pads index text and leaves empty text empty", () => {
    expect(normalizeIndexText("UI design")).toBe(" ui design ");
    expect(normalizeIndexText(" 、 ")).toBe("");
  });
});
