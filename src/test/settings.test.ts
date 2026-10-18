import { describe, expect, it } from "vitest";
import {
  SETTINGS_SCROLL_SECTIONS,
  SETTINGS_SECTIONS,
  isSettingsScrollSection,
  settingsSectionElementId,
} from "../utils/settingsToc";
import {
  COMMIT_PULL_PX,
  PULL_RUBBER_DIM,
  elasticOffset,
  latchOverflowCap,
  pullCommitProgress,
  pullVisualOffset,
  rubberBand,
} from "../components/settings/useSettingsElasticPull";
import {
  DEFAULT_TRANSLATION_SETTINGS_V2,
  mergeTranslationSettingsV2,
} from "../utils/translationSettings";

describe("settings TOC", () => {
  it("lists settings sections in navigation order with licenses last", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.label)).toEqual([
      "読書",
      "翻訳",
      "ライブラリとデータ",
      "詳細",
      "ライセンス",
    ]);
    expect(SETTINGS_SCROLL_SECTIONS.map((section) => section.id)).not.toContain("licenses");
    expect(isSettingsScrollSection("advanced")).toBe(true);
    expect(isSettingsScrollSection("licenses")).toBe(false);
    expect(settingsSectionElementId("reading")).toBe("section-reading");
    expect(settingsSectionElementId("licenses")).toBe("section-licenses");
  });
});

describe("settings pull-to-navigate", () => {
  it("maps pull distance with diminishing rubber-band offset", () => {
    expect(rubberBand(0)).toBe(0);
    expect(elasticOffset(0)).toBe(0);
    expect(rubberBand(40)).toBeGreaterThan(0);
    expect(rubberBand(140)).toBeGreaterThan(rubberBand(40));
    expect(rubberBand(140)).toBeLessThan(PULL_RUBBER_DIM);
  });

  it("keeps visual pull well below a full page (PTR-style, not page peek)", () => {
    const deep = pullVisualOffset(COMMIT_PULL_PX * 3, false);
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThanOrEqual(PULL_RUBBER_DIM);
    // Must not approach viewport-scale motion during the gesture.
    expect(deep).toBeLessThan(120);
  });

  it("fills commit progress from raw overflow, independent of rubber visual", () => {
    expect(pullCommitProgress(0)).toBe(0);
    expect(pullCommitProgress(COMMIT_PULL_PX / 2)).toBeCloseTo(0.5, 5);
    expect(pullCommitProgress(COMMIT_PULL_PX)).toBe(1);
    expect(pullCommitProgress(COMMIT_PULL_PX * 2)).toBe(1);

    const visualAtCommit = pullVisualOffset(COMMIT_PULL_PX, false);
    expect(visualAtCommit).toBeLessThan(COMMIT_PULL_PX);
  });

  it("caps latch overflow just below a full commit", () => {
    const cap = latchOverflowCap();
    expect(cap).toBeLessThan(COMMIT_PULL_PX);
    expect(pullCommitProgress(cap)).toBeGreaterThan(0.8);
    expect(pullCommitProgress(cap)).toBeLessThan(1);
  });

  it("nearly freezes pull visual when reduced motion is preferred", () => {
    const normal = pullVisualOffset(COMMIT_PULL_PX, false);
    const reduced = pullVisualOffset(COMMIT_PULL_PX, true);
    expect(reduced).toBeLessThan(normal);
    expect(reduced).toBeLessThanOrEqual(10);
  });
});

describe("mergeTranslationSettingsV2", () => {
  it("keeps default concurrency 8 and existing URLs", () => {
    const merged = mergeTranslationSettingsV2({
      madladServerUrl: "http://127.0.0.1:9000",
      ollamaModel: "gemma2:9b",
      generateGlossary: false,
      translationConcurrency: 8,
      useCache: false,
    });
    expect(merged.madladServerUrl).toBe("http://127.0.0.1:9000");
    expect(merged.generateGlossary).toBe(false);
    expect(merged.useCache).toBe(false);
    expect(merged.translationConcurrency).toBe(8);
    expect(merged.ollamaServerUrl).toBe(
      DEFAULT_TRANSLATION_SETTINGS_V2.ollamaServerUrl
    );
  });

  it("bumps legacy concurrency of 3 or less up to 8", () => {
    expect(mergeTranslationSettingsV2({ translationConcurrency: 1 }).translationConcurrency).toBe(8);
    expect(mergeTranslationSettingsV2({ translationConcurrency: 3 }).translationConcurrency).toBe(8);
    expect(mergeTranslationSettingsV2({ translationConcurrency: 4 }).translationConcurrency).toBe(4);
  });
});

describe("display settings defaults", () => {
  it("defaults sidebar mode to auto hover expand", async () => {
    const { useAppStore } = await import("../stores/appStore");
    expect(useAppStore.getState().displaySettings.sidebarMode).toBe("auto");
    expect(useAppStore.getState().displaySettings.sidebarWidth).toBe(220);
  });
});
