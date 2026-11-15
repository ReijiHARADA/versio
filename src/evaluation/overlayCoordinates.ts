import type { BoundingBox } from "../types/paper";

/**
 * Converts an extraction-space box into the coordinate system used by the
 * rendered PDF canvas. Extraction preserves horizontal native text at its
 * baseline because the layout resolver depends on that convention. The
 * Evaluation Studio is the presentation boundary: it alone converts it to a
 * top-left rectangle.
 */
export function overlayBoxFromExtraction(
  box: BoundingBox,
  options: { hasText: boolean; pageRotation: number; role: string },
): BoundingBox {
  const normalizedPageRotation = ((options.pageRotation % 360) + 360) % 360;
  const isUnrotatedPage = normalizedPageRotation === 0;
  const baselineText = options.hasText && isUnrotatedPage;
  const baselineBox = baselineText ? { ...box, y: Math.max(0, box.y - box.height) } : box;

  // Historical bundles from before rotation-aware extraction encode arXiv's
  // vertical margin stamp as an implausibly wide horizontal baseline box.
  // Restrict the repair to that unmistakable geometry; ordinary wide titles
  // and captions are never transformed.
  if (options.role === "copyright" && baselineBox.width > baselineBox.height * 4) {
    return {
      ...baselineBox,
      x: Math.max(0, baselineBox.x - baselineBox.height),
      y: Math.max(0, baselineBox.y + baselineBox.height - baselineBox.width),
      width: baselineBox.height,
      height: baselineBox.width,
    };
  }
  return baselineBox;
}
