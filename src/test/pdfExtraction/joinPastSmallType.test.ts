import { describe, expect, it } from "vitest";
import { reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, page: number, fontSize = 9): ExtractedTextItem => ({
  text, x, y, width, height: fontSize, fontSize, fontName: fontSize < 9 ? "Small" : "Body", page,
});
const prose = "results were consistent across every site and cohort in the study";

describe("paragraph continued past small type", () => {
  it("joins the paragraph across a caption tail at the top of the next page", () => {
    const one: ExtractedTextItem[] = [];
    for (let i = 0; i < 30; i += 1) one.push(item(`${i % 6 === 0 ? "  " : ""}${prose} ${i}`, i % 6 === 0 ? 62 : 50, 100 + i * 12, i % 6 === 0 ? 478 : 490, 1));
    one.push(item("The long-term consequences of the infection were assessed after a single inoculation and", 62, 500, 478, 1));
    one.push(item("were then compared with the matched controls across all of the behavioural measures used.", 50, 512, 490, 1));
    const two: ExtractedTextItem[] = [
      item("pathways related to bacterial infection, immune response and mitochondrial collapse in the", 50, 60, 490, 2, 7),
      item("retina. The size of the nodes represents the number of proteins in each pathway shown.", 50, 69, 470, 2, 7),
      item("However, the alternations in both colour and contrast modes of the maze were further reduced", 50, 100, 490, 2),
      item("in the infected mice, which points to a visuocognitive deficit beyond the locomotor changes.", 50, 112, 470, 2),
    ];
    for (let i = 0; i < 20; i += 1) two.push(item(`${i % 6 === 0 ? "  " : ""}${prose} ${i}`, i % 6 === 0 ? 62 : 50, 140 + i * 12, i % 6 === 0 ? 478 : 490, 2));
    const doc = reconstructDocument([
      { pageNumber: 1, width: 595, height: 842, textItems: one },
      { pageNumber: 2, width: 595, height: 842, textItems: two },
    ]);
    const joined = doc.blocks.find((block) => block.text.includes("behavioural measures used."));
    expect(joined?.text).toContain("However, the alternations");
  });
});
