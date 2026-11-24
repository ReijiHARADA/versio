import { useRef, useState } from "react";
import {
  MaximizeIcon as Maximize2,
} from "@solar-icons/react/linear";
import type { PaperBlock, FigureMetadata } from "../../types/paper";
import { usePaperAssetUrl } from "../../hooks/usePaperAssetUrl";
import styles from "./Figure.module.css";
import { splitCaptionLabel } from "./caption";
import { MediaLightbox } from "./MediaLightbox";
import { MediaCaption } from "./MediaCaption";

type FigureProps = {
  block: PaperBlock;
  metadata: FigureMetadata;
};

export function Figure({ block, metadata }: FigureProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [surfaceActive, setSurfaceActive] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageUrl = usePaperAssetUrl(block.paperId, metadata.imageUrl);

  const hasTranslatedCaption =
    metadata.captionTranslated && metadata.captionOriginal;
  const hasImage = Boolean(imageUrl);
  const caption = metadata.captionTranslated || metadata.captionOriginal || "";
  const displayedCaption = splitCaptionLabel(caption, metadata.figureNumber || "Figure");

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
            />
          ) : metadata.imageUrl ? (
            <div className={styles.missingImage}>図を読み込み中…</div>
          ) : (
            <div className={styles.missingImage}>図を抽出できませんでした</div>
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
        <MediaCaption
          label={displayedCaption.label}
          text={displayedCaption.text}
          captionOriginal={metadata.captionOriginal}
          canToggleOriginal={Boolean(hasTranslatedCaption)}
        />
      </figure>

      {hasImage && (
        <MediaLightbox
          open={isZoomed}
          src={imageUrl!}
          alt={caption}
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
