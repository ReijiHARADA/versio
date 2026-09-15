import type { CSSProperties } from "react";
import type { DisplaySettings, OriginalDisplayMode } from "../../stores/appStore";
import {
  ReaderArticleSurface,
  type ReaderArticleParagraph,
} from "../reader/ReaderArticleSurface";
import styles from "./ReadingPreview.module.css";

const FIXTURE_SECTION = "1. はじめに";
const FIXTURE_BODY_1 =
  "英語論文を、日本語の記事を読む感覚で読むための表示です。文字サイズ・行間・本文幅がここに反映されます。";
const FIXTURE_BODY_2 =
  "モデルは再帰や畳み込みに依存せず、注意機構だけに基づいて系列変換を行います。";
const FIXTURE_ORIGINAL =
  "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.";

type ReadingPreviewProps = {
  settings: Pick<
    DisplaySettings,
    "fontSize" | "lineHeight" | "contentWidth" | "theme" | "originalDisplay"
  >;
};

function showOriginal(mode: OriginalDisplayMode): boolean {
  // Preview fixture is always "translated"; when-untranslated still shows how
  // original chrome looks. on-demand stays hidden until the reader expands it.
  return mode === "always" || mode === "when-untranslated";
}

function buildParagraphs(mode: OriginalDisplayMode): ReaderArticleParagraph[] {
  const withOriginal = showOriginal(mode);
  return [
    {
      id: "p1",
      text: FIXTURE_BODY_1,
      original: withOriginal ? FIXTURE_ORIGINAL : null,
    },
    { id: "p2", text: FIXTURE_BODY_2 },
  ];
}

/** Settings visual live preview — production Reader presentational surface + fixture. */
export function ReadingPreview({ settings }: ReadingPreviewProps) {
  const contentStyle = {
    "--content-font-size": `${settings.fontSize}px`,
    "--content-line-height": String(settings.lineHeight),
    "--content-max-width": `${settings.contentWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={styles.frame}
      aria-label="本文プレビュー"
      data-theme-preview={settings.theme}
    >
      <div className={styles.viewport}>
        <ReaderArticleSurface
          sectionTitle={FIXTURE_SECTION}
          paragraphs={buildParagraphs(settings.originalDisplay)}
          contentStyle={contentStyle}
        />
      </div>
    </div>
  );
}
