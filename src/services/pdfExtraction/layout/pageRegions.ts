import type { ExtractedPage, PdfGraphicsPrimitive } from "../../pdfService";
import { isFigureCaption, isTableCaption, type LayoutLine, type LayoutRect } from "../../pdfLayout";
import { captionAnchoredGraphicsGrids, isGraphicsRule } from "../generic/tableRegions";

export type PageRegion = {
  kind: "table" | "figure";
  rect: LayoutRect;
  evidence: "ruled-grid" | "image" | "vector";
  captionLine?: LayoutLine;
};

const rectOf = (item: { x: number; y: number; width: number; height: number }): LayoutRect =>
  ({ x: item.x, y: item.y, width: item.width, height: item.height });

const overlapsX = (a: LayoutRect, b: LayoutRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) > 0;

const gapTo = (a: LayoutRect, b: LayoutRect) =>
  a.y > b.y + b.height ? a.y - (b.y + b.height) : b.y > a.y + a.height ? b.y - (a.y + a.height) : 0;

const union = (items: LayoutRect[]): LayoutRect => {
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x, y, width: right - x, height: bottom - y };
};

const primitiveTouches = (a: PdfGraphicsPrimitive, b: PdfGraphicsPrimitive) =>
  a.x <= b.x + b.width + 3 && b.x <= a.x + a.width + 3 &&
  a.y <= b.y + b.height + 3 && b.y <= a.y + a.height + 3;

const componentRects = (items: PdfGraphicsPrimitive[]): LayoutRect[] => {
  const remaining = new Set(items.map((_, index) => index));
  const components: LayoutRect[] = [];
  while (remaining.size) {
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const indexes = [seed];
    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      for (const index of [...remaining]) {
        if (!primitiveTouches(items[indexes[cursor]], items[index])) continue;
        remaining.delete(index);
        indexes.push(index);
      }
    }
    if (indexes.length >= 20) components.push(union(indexes.map((index) => rectOf(items[index]))));
  }
  return components;
};

export function lineInRegion(line: LayoutLine, region: PageRegion): boolean {
  const box = line.bbox;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return x >= region.rect.x && x <= region.rect.x + region.rect.width &&
    y >= region.rect.y && y <= region.rect.y + region.rect.height;
}

export function detectPageRegions(page: ExtractedPage, lines: LayoutLine[], bodyFontSize: number): PageRegion[] {
  const captionGap = Math.max(24, bodyFontSize * 3);
  const tableCaptions = lines.filter((line) => isTableCaption(line.text));
  const figureCaptions = lines.filter((line) => isFigureCaption(line.text));
  const nearbyCaption = (rect: LayoutRect, captions: LayoutLine[]) => captions.find((caption) => {
    const captionRect = rectOf(caption);
    return overlapsX(rect, captionRect) && gapTo(rect, captionRect) <= captionGap;
  });
  const regions: PageRegion[] = [];

  for (const captionLine of tableCaptions) {
    for (const rect of captionAnchoredGraphicsGrids(page, rectOf(captionLine))) {
      if (gapTo(rect, rectOf(captionLine)) <= captionGap && overlapsX(rect, rectOf(captionLine))) {
        regions.push({ kind: "table", rect, evidence: "ruled-grid", captionLine });
      }
    }
  }

  const pageArea = page.width * page.height;
  for (const image of page.imagePlacements ?? []) {
    const rect = rectOf(image);
    const share = rect.width * rect.height / pageArea;
    const captionLine = nearbyCaption(rect, figureCaptions);
    if (share >= 0.02 && share <= 0.9 && captionLine) {
      regions.push({ kind: "figure", rect, evidence: "image", captionLine });
    }
  }

  const vectors = (page.graphicsPrimitives ?? []).filter((primitive) => !isGraphicsRule(primitive));
  for (const rect of componentRects(vectors)) {
    const captionLine = nearbyCaption(rect, figureCaptions);
    if (captionLine) regions.push({ kind: "figure", rect, evidence: "vector", captionLine });
  }

  return regions.filter((region) => {
    const prose = lines
      .filter((line) => lineInRegion(line, region) && Math.abs(line.fontSize - bodyFontSize) <= 0.5 && line.text.length > 40)
      .sort((a, b) => a.y - b.y);
    let consecutive = 0;
    for (let index = 0; index < prose.length; index += 1) {
      consecutive = index > 0 && prose[index].y > prose[index - 1].y ? consecutive + 1 : 1;
      if (consecutive >= 3) return false;
    }
    return true;
  });
}
