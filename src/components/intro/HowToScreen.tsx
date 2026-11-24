import { useEffect, useRef, useState } from "react";
import styles from "./HowToScreen.module.css";

/** Rest on the last frame before replaying, so the result reads before the loop restarts. */
const END_HOLD_MS = 2000;

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
  const replay = useRef<number | undefined>(undefined);
  useEffect(() => primary.current?.focus(), []);
  useEffect(() => () => window.clearTimeout(replay.current), []);
  const titleId = `howto-title-${page}`;

  return (
    <section className={styles.screen} aria-labelledby={titleId} data-tauri-drag-region>
      <button type="button" className={`${styles.secondary} ${styles.skip}`} data-skip onClick={onSkip}>
        スキップ
      </button>
      <div className={styles.column}>
        {/* Rotato render of a MacBook (transparent HEVC), see `npm run record:howto` */}
        <div className={styles.mockup} data-mockup aria-hidden>
          {still || failed ? (
            <img className={styles.media} src={poster} alt="" />
          ) : (
            <video
              className={styles.media}
              src={video}
              poster={poster}
              muted
              autoPlay
              playsInline
              onEnded={(e) => {
                const clip = e.currentTarget;
                replay.current = window.setTimeout(() => {
                  clip.currentTime = 0;
                  void clip.play().catch(() => {});
                }, END_HOLD_MS);
              }}
              onError={() => setFailed(true)}
            />
          )}
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
