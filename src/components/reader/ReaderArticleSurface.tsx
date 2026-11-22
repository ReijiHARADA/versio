import type { CSSProperties, ReactNode } from "react";
import articleStyles from "./PaperContent.module.css";
import paragraphStyles from "./Paragraph.module.css";
import { OriginalTextBlock } from "./OriginalTextBlock";

export type ReaderArticleParagraph = {
  id: string;
  text: string;
  /** Optional English original shown under this paragraph. */
  original?: string | null;
};

type ReaderArticleSurfaceProps = {
  /** When omitted, the paper header (title + rule) is not rendered. */
  title?: string;
  sectionTitle?: string;
  paragraphs: ReaderArticleParagraph[];
  /** Injected by ReaderScreen / Settings preview (`--content-*`). */
  contentStyle?: CSSProperties;
  footer?: ReactNode;
};

/**
 * Pure presentational article chrome shared by production Reader and Settings
 * live preview. No DB, routing, translation, or annotations.
 */
export function ReaderArticleSurface({
  title,
  sectionTitle,
  paragraphs,
  contentStyle,
  footer,
}: ReaderArticleSurfaceProps) {
  return (
    <article className={articleStyles.article} style={contentStyle}>
      {title ? (
        <header className={articleStyles.header}>
          <h1 className={articleStyles.title}>{title}</h1>
        </header>
      ) : null}
      <div className={articleStyles.content}>
        <section className={articleStyles.section}>
          {sectionTitle ? (
            <h2 className={articleStyles.heading2}>{sectionTitle}</h2>
          ) : null}
          {paragraphs.map((paragraph) => (
            <div key={paragraph.id} className={paragraphStyles.container}>
              <p className={paragraphStyles.translated}>{paragraph.text}</p>
              {paragraph.original ? (
                <OriginalTextBlock text={paragraph.original} />
              ) : null}
            </div>
          ))}
        </section>
        {footer}
      </div>
    </article>
  );
}
