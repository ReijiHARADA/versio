import { useEffect, useRef, useState } from "react";
import styles from "./HowToScreen.module.css";

type Props = {
  page: 1 | 2;
  total: 2;
  title: string;
  body: string;
  video: string;
  poster: string;
  /** reduced motion: show the poster instead of the clip */
  still: boolean;
  primaryLabel: string;
  onNext: () => void;
  onSkip: () => void;
  /** omitted on the first page */
  onBack?: () => void;
};

/** One how-to page after the intro: a looping clip of a practiced user, one heading, one line. */
export function HowToScreen({ page, total, title, body, video, poster, still, primaryLabel, onNext, onSkip, onBack }: Props) {
  const primary = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => primary.current?.focus(), []);
  const titleId = `howto-title-${page}`;

  return (
    <section className={styles.screen} aria-labelledby={titleId} data-tauri-drag-region>
      <button type="button" className={`${styles.secondary} ${styles.skip}`} data-skip onClick={onSkip}>
        スキップ
      </button>
      <div className={styles.column}>
        {/* a generic laptop drawn in CSS: bezel with camera, screen, base */}
        <div className={styles.device} data-bezel aria-hidden>
          <div className={styles.bezel}>
            <span className={styles.camera} />
            <div className={styles.frame}>
            {still || failed ? (
              <img className={styles.media} src={poster} alt="" />
            ) : (
              <video
                className={styles.media}
                src={video}
                poster={poster}
                muted
                autoPlay
                loop
                playsInline
                onError={() => setFailed(true)}
              />
            )}
            </div>
          </div>
          <div className={styles.base}>
            <span className={styles.notch} />
          </div>
        </div>

        <div className={styles.text}>
          <h1 id={titleId} className={styles.title}>
            {title}
          </h1>
          <p className={styles.body}>{body}</p>
        </div>

        <div className={styles.actions}>
          <span className={styles.count} aria-label={`${total} ページ中 ${page} ページ目`}>
            {page} / {total}
          </span>
          {onBack ? (
            <button type="button" className={styles.secondary} onClick={onBack}>
              戻る
            </button>
          ) : null}
          <button ref={primary} type="button" className={styles.primary} onClick={onNext}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
