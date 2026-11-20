import { describe, expect, it } from "vitest";
import {
  SETTINGS_SCROLL_SECTIONS,
  SETTINGS_SECTIONS,
  isSettingsScrollSection,
  settingsSectionElementId,
} from "../utils/settingsToc";
import {
  COMMIT_PULL_PX,
  EDGE_ARM_IDLE_MS,
  MAX_WHEEL_STEP,
  PULL_RUBBER_DIM,
  RELEASE_IDLE_MS,
  elasticOffset,
  pullCommitProgress,
  pullVisualOffset,
  rubberBand,
  wheelStep,
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

  it("keeps the next-page peek well below a full page", () => {
    const deep = pullVisualOffset(COMMIT_PULL_PX * 3, false);
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThanOrEqual(PULL_RUBBER_DIM);
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

  it("scales wheel steps with a soft ceiling on extreme flicks", () => {
    const gentle = wheelStep(4);
    const flick = wheelStep(80);
    expect(gentle).toBeCloseTo(4 * 0.65, 5);
    expect(flick).toBe(wheelStep(MAX_WHEEL_STEP));
    expect(flick).toBeGreaterThan(gentle);
    // Soft ceiling only — original sensitivity still reaches commit in a short drag.
    expect(COMMIT_PULL_PX / flick).toBeLessThan(12);
  });

  it("uses idle gaps for edge-arm and finger-up (not acceleration)", () => {
    expect(EDGE_ARM_IDLE_MS).toBeGreaterThanOrEqual(80);
    expect(EDGE_ARM_IDLE_MS).toBeLessThanOrEqual(200);
    expect(RELEASE_IDLE_MS).toBeGreaterThanOrEqual(80);
    expect(RELEASE_IDLE_MS).toBeLessThanOrEqual(220);
  });

  it("nearly freezes pull visual when reduced motion is preferred", () => {
    const normal = pullVisualOffset(COMMIT_PULL_PX, false);
    const reduced = pullVisualOffset(COMMIT_PULL_PX, true);
    expect(reduced).toBeLessThan(normal);
    expect(reduced).toBeLessThanOrEqual(10);
  });
});

describe("mergeTranslationSettingsV2", () => {
  it("drops legacy engine settings", () => {
    const merged = mergeTranslationSettingsV2({
      translationEngine: "madlad",
      madladServerUrl: "http://127.0.0.1:8765",
    });
    expect(merged).not.toHaveProperty("translationEngine");
    expect(merged).not.toHaveProperty("madladServerUrl");
  });

  it("keeps default concurrency 8 and existing Ollama settings", () => {
    const merged = mergeTranslationSettingsV2({
      ollamaModel: "gemma2:9b",
      generateGlossary: false,
      translationConcurrency: 8,
      useCache: false,
    });
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
  it("defaults sidebar mode to expanded", async () => {
    const { useAppStore } = await import("../stores/appStore");
    expect(useAppStore.getState().displaySettings.sidebarMode).toBe("expanded");
    expect(useAppStore.getState().displaySettings.sidebarWidth).toBe(220);
  });
});
