import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const line = (text: string, y: number): ExtractedTextItem => ({
  text, x: 72, y, width: 460, height: 10, fontSize: 10, fontName: "Body", page: 3,
});

describe("open-access wording in body text", () => {
  it("keeps a body line that starts with open-access in its paragraph", () => {
    const texts = [
      "Recordings were drawn from public archives and from several",
      "open-access recordings whose licensing permits non-commercial research",
      "use, and every file was checked for quality before it was included",
      "in the corpus that the models were trained and evaluated on here.",
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 3, width: 612, height: 792, textItems: texts.map((t, i) => line(t, 200 + i * 13)) }]);
    const owner = blocks.find((block) => block.text.includes("open-access recordings"));
    expect(owner?.role).toBe("paragraph");
  });
});
