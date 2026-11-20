import { useEffect, useRef, useState } from "react";
import introMp4 from "../../assets/intro/intro.mp4";
import finalPng from "../../assets/intro/final.png";
import { hasSeenIntro, markIntroSeen } from "./introSeen";
import { playStapleSound, STAPLE_FIRST_CLICK_S } from "./stapleSound";
import styles from "./IntroOverlay.module.css";

// Timeline of design/intro/stapler_intro.py at 30 fps (frame N plays at (N - 1) / 30 s).
// The recording's first click lands on STAGE1 = 27; its snap then falls on CONTACT = 35.
const SOUND_START_S = 26 / 30 - STAPLE_FIRST_CLICK_S;
const CTA_TIME_S = 84 / 30; // a beat after the base leaves the frame (GONE = 78)
const CTA_LABEL = "Versioを使い始める";

export function IntroOverlay() {
  // Automated browsers (Playwright verify scripts) start with fresh storage; keep them out of the intro.
  const [open, setOpen] = useState(() => !hasSeenIntro() && !navigator.webdriver);
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [ctaShown, setCtaShown] = useState(still);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // never strand the user if the video stalls or autoplay is refused
    const fallback = window.setTimeout(() => setCtaShown(true), 4000);
    return () => {
      window.clearTimeout(fallback);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (!open) return null;

  const close = () => {
    markIntroSeen();
    setLeaving(true);
    window.setTimeout(() => setOpen(false), 400);
  };

  return (
    <div className={styles.overlay} data-leaving={leaving} data-tauri-drag-region role="dialog" aria-label="Versio へようこそ">
      {still || videoFailed ? (
        <img className={styles.media} src={finalPng} alt="" />
      ) : (
        <video
          className={styles.media}
          src={introMp4}
          muted
          autoPlay
          playsInline
          onPlaying={(e) => {
            const now = e.currentTarget.currentTime;
            timers.current.forEach((t) => window.clearTimeout(t));
            timers.current = [];
            if (now < SOUND_START_S) timers.current.push(window.setTimeout(playStapleSound, (SOUND_START_S - now) * 1000));
            timers.current.push(window.setTimeout(() => setCtaShown(true), Math.max(0, CTA_TIME_S - now) * 1000));
          }}
          onError={() => {
            setVideoFailed(true);
            setCtaShown(true);
          }}
        />
      )}
      <button type="button" className={styles.cta} data-visible={ctaShown} tabIndex={ctaShown ? 0 : -1} aria-label={CTA_LABEL} onClick={close}>
        {/* letters settle in one by one, then the pill grows behind them */}
        <span className={styles.pill} aria-hidden>
          {[...CTA_LABEL].map((c, i) => (
            <span key={i} className={styles.letter} style={{ animationDelay: `${i * 35}ms` }}>
              {c}
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
