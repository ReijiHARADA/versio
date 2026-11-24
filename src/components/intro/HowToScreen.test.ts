import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HowToScreen } from "./HowToScreen";

const render = (props: Partial<Parameters<typeof HowToScreen>[0]>) =>
  renderToStaticMarkup(createElement(HowToScreen, { ...base, still: false, ...props }));

const base = {
  page: 1 as const,
  total: 2 as const,
  title: "PDF を落として、集める",
  body: "本文",
  video: "/clip.mp4",
  poster: "/clip.jpg",
  primaryLabel: "次へ",
  onNext: () => {},
  onSkip: () => {},
};

describe("HowToScreen", () => {
  it("plays the muted clip with its poster, holding the end instead of a native loop", () => {
    const html = render({});
    expect(html).toContain("<video");
    expect(html).not.toMatch(/\bloop\b/);
    expect(html).toMatch(/muted/);
    expect(html).toContain('poster="/clip.jpg"');
  });

  it("shows only the still under reduced motion", () => {
    const html = render({ still: true });
    expect(html).not.toContain("<video");
    expect(html).toContain('src="/clip.jpg"');
  });

  it("labels the page, the primary action, and skip", () => {
    const html = render({ page: 2, still: true, primaryLabel: "はじめる" });
    expect(html).toContain("2 / 2");
    expect(html).toContain("はじめる");
    expect(html).toContain("スキップ");
    expect(html).toContain("PDF を落として、集める");
  });

  it("offers 戻る only when there is a page to go back to", () => {
    expect(render({ still: true })).not.toContain("戻る");
    expect(render({ page: 2, still: true, onBack: () => {} })).toContain("戻る");
  });

  it("puts スキップ apart from the page actions", () => {
    const html = render({ page: 2, still: true, onBack: () => {} });
    expect(html).toMatch(/data-skip[^>]*>スキップ/);
    expect(html.indexOf("戻る")).toBeLessThan(html.indexOf("次へ"));
  });

  it("shows the clip inside the device mockup", () => {
    expect(render({})).toMatch(/data-mockup/);
  });
});
