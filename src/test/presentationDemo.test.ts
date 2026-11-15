import { describe, expect, it } from "vitest";
import { createMemoryFileSystem } from "../data/fs/memoryFs";
import { projectionToPackage } from "../data/package/fromProjection";
import { loadPaperPackage, persistPaperPackage } from "../data/package/persist";
import { packageToProjection } from "../data/package/toProjection";
import {
  createPresentationCaptureSeed,
  createPresentationDemoProjection,
  PRESENTATION_PRIMARY_PAPER_ID,
} from "../services/presentationDemo";

describe("presentation demo fixture", () => {
  it("is a valid Paper Package with retained visual assets, not an extraction input", async () => {
    const projection = createPresentationDemoProjection("demo-paper", "demo-hash", "Versio-Demo.pdf");
    const pkg = projectionToPackage(projection);
    expect(pkg.assets).toEqual([]);
    const fs = createMemoryFileSystem();
    await persistPaperPackage(fs, pkg);
    const loaded = await loadPaperPackage(fs, projection.paper.id, { includeAssets: true });
    const restored = packageToProjection(loaded, projection.paper);
    expect(restored.blocks.filter((block) => block.type === "figure")).toHaveLength(5);
    expect(String(restored.blocks.find((block) => block.id === "fig-1")?.metadata.imageUrl)).toBe(
      "/presentation-demo-assets/dfw-fig1-placement.png"
    );
    expect(restored.blocks.filter((block) => block.type === "table")).toHaveLength(1);
    expect(restored.blocks.filter((block) => block.type === "reference")).toHaveLength(11);
    expect(restored.sections).toHaveLength(16);
    expect(restored.sections.filter((section) => section.parentSectionId === "guidelines")).toHaveLength(7);
    // Package round-trip re-slugs reference anchors (e.g. ref-hall-1982).
    expect(restored.blocks.find((block) => block.id === "ref-10")?.metadata.referenceId).toMatch(/^ref-/);
  });

  it("gives every translatable block a Japanese translation", () => {
    const { blocks } = createPresentationDemoProjection("demo-paper", "demo-hash", "Versio-Demo.pdf");
    for (const block of blocks.filter((item) => item.type !== "reference")) {
      expect(block.translated, block.id).toMatch(/[ぁ-んァ-ン一-龯]/);
    }
  });

  it("preloads only the primary reader body in the capture-only demo seed", () => {
    const seed = createPresentationCaptureSeed();
    expect(seed.papers).toHaveLength(6);
    expect(new Set(seed.papers.map((paper) => paper.id)).size).toBe(6);
    expect(seed.documents).toHaveLength(1);
    expect(seed.documents[0]).toMatchObject({ paperId: PRESENTATION_PRIMARY_PAPER_ID });
    const nodeIds = new Set(seed.workspaceNodes.map((node) => node.id));
    for (const membership of seed.memberships) {
      expect(nodeIds.has(membership.nodeId)).toBe(true);
      expect(seed.papers.some((paper) => paper.id === membership.paperId)).toBe(true);
    }
  });
});
