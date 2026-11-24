import { memo, useMemo, type ReactNode } from "react";
import type { Annotation } from "../../types/annotation";
import type { GlossaryEntry } from "../../services/llm/types";
import type { PaperBlock, FigureMetadata, EquationMetadata, TableMetadata } from "../../types/paper";
import {
  isPageNumberArtifactBlock,
  looksLikeBibliographyEntry,
  looksLikeConferenceRunningHeader,
  looksLikeYearTitleReferenceContinuation,
  parseReferenceLinks,
} from "../../services/citations";
import { openExternalUrl } from "../../services/openExternalUrl";
import { Paragraph } from "./Paragraph";
import { Figure } from "./Figure";
import { Equation } from "./Equation";
import { Table } from "./Table";
import { Footnote } from "./Footnote";
import { ReferenceImportAction } from "./citations/ReferenceImportAction";
import { referenceIdentifiers } from "../../services/import/referenceIdentifier";
import styles from "./PaperContent.module.css";

function ReferenceEntryImport({ text }: { text: string }) {
  const identifiers = useMemo(() => referenceIdentifiers(text), [text]);
  return <ReferenceImportAction identifiers={identifiers} rawText={text} className={styles.referenceImport} />;
}

function renderReferenceText(text: string): ReactNode {
  const links = parseReferenceLinks(text);
  if (links.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  links.forEach((link, index) => {
    if (link.start > cursor) parts.push(text.slice(cursor, link.start));
    parts.push(
      <a
        key={`${link.href}-${index}`}
        className={styles.referenceLink}
        href={link.href}
        onClick={(event) => {
          event.preventDefault();
          void openExternalUrl(link.href);
        }}
      >
        {text.slice(link.start, link.end)}
      </a>
    );
    cursor = link.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

type PaperBlockViewProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations: Annotation[];
  draftHighlight?: { start: number; end: number } | null;
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[], rect: DOMRect) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  referenceIndex: Map<string, string>;
  /** Stable reference-only list so memo survives body translation patches. */
  referenceBlocks: PaperBlock[];
  glossaryEntries: GlossaryEntry[];
  onOpenGlossaryInspector?: () => void;
  onJumpToTarget: (targetId: string) => void;
  inReferencesSection?: boolean;
  refSectionIds?: Set<string>;
};

export const PaperBlockView = memo(function PaperBlockView({
  block,
  highlightText,
  onBlockUpdated,
  annotations,
  draftHighlight,
  flashAnnotationIds,
  onHighlightClick,
  onOpenSourcePdf,
  referenceIndex,
  referenceBlocks,
  glossaryEntries,
  onOpenGlossaryInspector,
  onJumpToTarget,
  inReferencesSection = false,
  refSectionIds,
}: PaperBlockViewProps) {
  const original = block.original?.trim() ?? "";
  // PDF page markers often land as body footnotes (border-top + muted digit).
  // Hide in every section, including when only the translated digit remains.
  if (isPageNumberArtifactBlock(block.original, block.translated)) {
    return null;
  }
  // Conference running headers interrupting REFERENCES render as body paragraphs.
  if (
    looksLikeConferenceRunningHeader(original) ||
    (inReferencesSection && looksLikeConferenceRunningHeader(block.translated ?? ""))
  ) {
    return null;
  }

  const effectiveType =
    inReferencesSection &&
    block.type === "paragraph" &&
    (looksLikeBibliographyEntry(original) || looksLikeYearTitleReferenceContinuation(original))
      ? "reference"
      : block.type;

  let content: React.ReactNode = null;

  switch (effectiveType) {
    case "heading":
      return null;
    case "paragraph":
      content = (
        <Paragraph
          block={block}
          highlightText={highlightText}
          onBlockUpdated={onBlockUpdated}
          annotations={annotations}
          draftHighlight={draftHighlight}
          flashAnnotationIds={flashAnnotationIds}
          onHighlightClick={onHighlightClick}
          onOpenSourcePdf={onOpenSourcePdf}
          referenceIndex={referenceIndex}
          referenceBlocks={referenceBlocks}
          glossaryEntries={glossaryEntries}
          onOpenGlossaryInspector={onOpenGlossaryInspector}
          onJumpToTarget={onJumpToTarget}
          refSectionIds={refSectionIds}
        />
      );
      break;
    case "figure":
      content = <Figure block={block} metadata={block.metadata as FigureMetadata} />;
      break;
    case "table":
      content = <Table block={block} metadata={block.metadata as TableMetadata} />;
      break;
    case "equation":
      content = <Equation block={block} metadata={block.metadata as EquationMetadata} />;
      break;
    case "footnote":
      content = <Footnote block={block} />;
      break;
    case "reference": {
      const referenceId =
        typeof block.metadata.referenceId === "string" ? block.metadata.referenceId : undefined;
      content = (
        <p id={referenceId} className={styles.reference}>
          {renderReferenceText(block.original || "")}
          <ReferenceEntryImport text={block.original || ""} />
        </p>
      );
      break;
    }
    default:
      return null;
  }

  return <div id={`block-${block.id}`}>{content}</div>;
});
