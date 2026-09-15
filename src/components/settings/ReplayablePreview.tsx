import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import styles from "./ReplayablePreview.module.css";

type ReplayablePreviewProps = {
  src: string;
  poster: string;
  /** Length of one animation cycle (ms). Used with playCount to show the replay overlay. */
  cycleDurationMs: number;
  /** How many cycles to play before pausing. Default 3. */
  playCount?: number;
  /** Still image only (no GIF playback / overlay). */
  still?: boolean;
  alt?: string;
};

/**
 * Plays a short GIF a few times, then freezes on the poster with a replay control.
 * Reduced-motion: poster only.
 */
export function ReplayablePreview({
  src,
  poster,
  cycleDurationMs,
  playCount = 3,
  still = false,
  alt = "",
}: ReplayablePreviewProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [playing, setPlaying] = useState(!still);
  const [token, setToken] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const stopTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    stopTimer();
    if (still || reduceMotion || !playing) return;
    const total = Math.max(1, playCount) * Math.max(200, cycleDurationMs);
    timerRef.current = window.setTimeout(() => {
      setPlaying(false);
    }, total);
    return stopTimer;
  }, [still, reduceMotion, playing, playCount, cycleDurationMs, token]);

  const replay = useCallback(() => {
    setToken((n) => n + 1);
    setPlaying(true);
  }, []);

  const showPoster = still || reduceMotion || !playing;
  const imageSrc = showPoster
    ? poster
    : `${src}${src.includes("?") ? "&" : "?"}r=${token}`;

  return (
    <div className={styles.root}>
      <img
        className={styles.image}
        src={imageSrc}
        alt={alt}
        width={640}
        height={360}
        loading="lazy"
        decoding="async"
      />
      {!still && !reduceMotion && !playing ? (
        <button
          type="button"
          className={styles.replay}
          onClick={replay}
          aria-label="プレビューを再生"
        >
          <span className={styles.replayBadge}>
            <Play size={18} fill="currentColor" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
