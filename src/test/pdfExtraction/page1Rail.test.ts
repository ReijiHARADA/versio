import { describe, expect, it } from "vitest";
import { detectPageColumns, reconstructDocument } from "../../services/pdfLayout";
import type { ExtractedTextItem } from "../../services/pdfService";

const item = (text: string, x: number, y: number, width: number, fontSize: number): ExtractedTextItem => ({
  text, x, y, width, height: fontSize, fontSize, fontName: "Body", page: 1,
});

// PLOS-style first page: line-level items, a small-type metadata rail beside a wide abstract.
function railPage() {
  const items: ExtractedTextItem[] = [item("A study of watch faces", 198, 120, 300, 18), item("Abstract", 198, 290, 60, 11)];
  const rail = ["OPEN ACCESS", "Citation: Dong M, Bian Z (2025)", "From data to design", "Editor: Hiroyuki Maruyama", "Received: March 1, 2025", "Accepted: June 1, 2025", "Published: July 1, 2025", "Copyright: © 2025 Dong et al.", "Funding: This work was", "supported by the province", "Competing interests: none", "Data Availability: All data", "are in the manuscript and", "its Supporting information", "files are available online"];
  rail.forEach((text, i) => items.push(item(text, 36, 400 + i * 20, 140, 8)));
  for (let i = 0; i < 26; i += 1) items.push(item(`watch face design study sentence number ${i} continues the abstract text here`, 198, 305 + i * 15, 360, 10));
  return { pageNumber: 1, width: 612, height: 792, textItems: items };
}

describe("first-page metadata rail", () => {
  it("detects a PLOS-style rail and keeps the abstract lines in one column", () => {
    const layout = detectPageColumns(railPage());
    expect(layout.isAsymmetricRail).toBe(true);
    const { lines } = reconstructDocument([railPage()]);
    const abstract = lines.filter((line) => line.text.startsWith("watch face design"));
    expect(abstract.every((line) => line.column === "right")).toBe(true);
    expect(lines.some((line) => line.text.includes("Funding") && line.text.includes("watch face"))).toBe(false);
  });

  it("reads the rail's notes continued beside page 2's body as their own column", () => {
    const items: ExtractedTextItem[] = [];
    const rail = ["Funding: This work was supported", "by the National Institutes of", "Health and by the CDC.", "Competing interests: The", "authors have declared that no", "competing interests exist.", "Data Availability: The code", "is available on GitHub at", "https://example.org/code and", "the data are archived at", "https://doi.org/10.5281/x.", "All forecasts are in the", "repository under the model", "name used in this paper.", "Model weights are on Zenodo."];
    rail.forEach((text, i) => items.push({ ...item(text, 36, 60 + i * 10, 140, 8), page: 2 }));
    for (let i = 0; i < 40; i += 1) items.push({ ...item(`forecasting models of epidemics sentence number ${i} continues the introduction here`, 198, 60 + i * 14, 370, 10), page: 2 });
    const page = { pageNumber: 2, width: 612, height: 792, textItems: items };
    expect(detectPageColumns(page).isAsymmetricRail).toBe(true);
    expect(detectPageColumns({ ...page, textItems: items.filter((it) => !/^(?:Funding|Competing|Data Availability)/.test(it.text)) }).isAsymmetricRail).toBeFalsy();
  });

  it("does not treat a full-width page of word items as a rail", () => {
    const items: ExtractedTextItem[] = [item("Keywords:", 64, 300, 50, 9)];
    for (let row = 0; row < 30; row += 1) {
      let x = 64;
      for (const word of "speech and language therapists assess understanding through observation and formal testing of clients".split(" ")) {
        const width = word.length * 4.5;
        items.push(item(word, x, 320 + row * 13, width, 9));
        x += width + 2.5;
      }
    }
    expect(detectPageColumns({ pageNumber: 1, width: 612, height: 799, textItems: items }).isAsymmetricRail).toBeFalsy();
  });
});
