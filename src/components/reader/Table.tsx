import { useEffect, useRef, useState } from "react";
import { Maximize2, Eye, EyeOff } from "../ui/MaterialSymbol";
import type { PaperBlock, TableMetadata } from "../../types/paper";
import { usePaperAssetUrl } from "../../hooks/usePaperAssetUrl";
import styles from "./Figure.module.css";
import { splitCaptionLabel } from "./caption";
import { MediaLightbox } from "./MediaLightbox";

type TableProps = {
  block: PaperBlock;
  metadata: TableMetadata;
};

export function Table({ block, metadata }: TableProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [surfaceActive, setSurfaceActive] = useState(false);
  const [showOriginalCaption, setShowOriginalCaption] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageUrl = usePaperAssetUrl(block.paperId, metadata.imageUrl);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const hasTranslatedCaption =
    metadata.captionTranslated && metadata.captionOriginal;
  // A persisted imageUrl may outlive its asset file (for example after an
  // app-data migration or a partial package restore). Treat a failed image
  // load as unavailable so native tableRows can remain readable.
  const hasImage = Boolean(imageUrl) && !imageFailed;
  const caption = metadata.captionTranslated || metadata.captionOriginal;
  const displayedCaption = splitCaptionLabel(caption || "", metadata.tableNumber || "Table");
  const textFallback = !hasImage && !metadata.imageUrl && Boolean(block.original?.trim());
  const tableRows = Array.isArray(metadata.tableRows)
    ? metadata.tableRows.filter((row) => Array.isArray(row) && row.length > 0)
    : [];
  // Captionless/native grids may intentionally have no block.original after
  // package projection: their source text lives entirely in tableRows. Keep
  // the cell structure as the primary fallback instead of showing an empty
  // extraction shell.
  const structuredFallback = !hasImage && !metadata.imageUrl && tableRows.length >= 2;
  // Native table rows retain PDF x coordinates. Use those coordinates to keep
  // sparse/wrapped rows in the same visual columns instead of letting each
  // row's own cell count reflow the grid independently.
  const rawColumnPositions = tableRows
    .flatMap((row) => row.map((cell) => cell.x).filter((x) => Number.isFinite(x)))
    .sort((a, b) => a - b);
  const columnPositions: number[] = [];
  for (const x of rawColumnPositions) {
    const previous = columnPositions.at(-1);
    if (previous === undefined || Math.abs(previous - x) > 18) columnPositions.push(x);
    else columnPositions[columnPositions.length - 1] = (previous + x) / 2;
  }
  const columnCount = Math.max(columnPositions.length, ...tableRows.map((row) => row.length), 1);
  const fallbackGridStyle = { gridTemplateColumns: `repeat(${columnCount}, minmax(6rem, 1fr))` };
  const cellColumn = (x: number, used: Set<number>) => {
    if (columnPositions.length === 0 || !Number.isFinite(x)) return undefined;
    const nearest = columnPositions.reduce((best, position, index) =>
      Math.abs(position - x) < Math.abs(columnPositions[best] - x) ? index : best, 0);
    if (!used.has(nearest)) return nearest;
    const next = columnPositions.findIndex((_, index) => !used.has(index));
    return next >= 0 ? next : nearest;
  };
  const showCaption = Boolean(caption) || hasImage;

  return (
    <>
      <figure className={styles.figure}>
        <div className={`${styles.imageWrapper} ${surfaceActive ? styles.sourceHidden : ""}`}>
          {hasImage ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt={caption}
              className={`${styles.image} ${styles.imageClickable}`}
              loading="lazy"
              role="button"
              tabIndex={0}
              title="クリックで拡大表示"
              onClick={() => setIsZoomed(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsZoomed(true);
                }
              }}
              onError={() => setImageFailed(true)}
            />
          ) : structuredFallback ? (
            <div className={styles.tableFallbackGrid} role="table" aria-label={caption || "抽出された表"}>
              {tableRows.map((row, rowIndex) => {
                const usedColumns = new Set<number>();
                return (
                  <div className={styles.tableFallbackRow} role="row" style={fallbackGridStyle} key={`${block.id}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => {
                      const column = cellColumn(cell.x, usedColumns);
                      if (column !== undefined) usedColumns.add(column);
                      return (
                        <div
                          className={styles.tableFallbackCell}
                          role="cell"
                          style={column === undefined ? undefined : { gridColumnStart: column + 1 }}
                          key={`${block.id}-${rowIndex}-${cellIndex}`}
                        >
                          {cell.text}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : metadata.imageUrl ? (
            <div className={styles.missingImage}>表を読み込み中…</div>
          ) : textFallback ? (
            // Source-only / borderless table rows: show the extracted cells as
            // text instead of a blank "extraction failed" shell.
            <pre className={styles.tableFallbackText}>{block.original}</pre>
          ) : (
            <div className={styles.missingImage}>表を抽出できませんでした</div>
          )}
          {hasImage && (
            <button
              type="button"
              className={styles.zoomButton}
              onClick={(event) => {
                event.stopPropagation();
                setIsZoomed(true);
              }}
              title="拡大表示"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
        {showCaption && (
          <figcaption className={styles.caption}>
            <span className={styles.figureNumber}>{displayedCaption.label}</span>
            {displayedCaption.text && (
              <span className={styles.captionText}>{displayedCaption.text}</span>
            )}
            {hasTranslatedCaption && (
              <button
                type="button"
                className={styles.toggleOriginal}
                onClick={() => setShowOriginalCaption(!showOriginalCaption)}
                title={
                  showOriginalCaption ? "原文キャプションを隠す" : "原文キャプションを表示"
                }
              >
                {showOriginalCaption ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
            {showOriginalCaption && metadata.captionOriginal && (
              <p className={styles.originalCaption}>{metadata.captionOriginal}</p>
            )}
          </figcaption>
        )}
      </figure>

      {hasImage && (
        <MediaLightbox
          open={isZoomed}
          src={imageUrl!}
          alt={caption || ""}
          sourceRef={imageRef}
          onClose={() => setIsZoomed(false)}
          onSurfaceChange={setSurfaceActive}
          caption={
            <>
              <strong>{displayedCaption.label}:</strong> {displayedCaption.text}
            </>
          }
        />
      )}
    </>
  );
}
