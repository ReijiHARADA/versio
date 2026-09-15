import paragraphStyles from "./Paragraph.module.css";

type OriginalTextBlockProps = {
  text: string;
};

/** Presentational original-language block shared by Reader and Settings preview. */
export function OriginalTextBlock({ text }: OriginalTextBlockProps) {
  return (
    <div className={paragraphStyles.originalWrapper}>
      <p className={paragraphStyles.original}>{text}</p>
    </div>
  );
}
