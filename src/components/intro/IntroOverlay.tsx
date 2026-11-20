import { useEffect, useRef, useState } from "react";
import introMp4 from "../../assets/intro/intro.mp4";
import finalPng from "../../assets/intro/final.png";
import { hasSeenIntro, markIntroSeen } from "./introSeen";
import { playStapleSound } from "./stapleSound";
import styles from "./IntroOverlay.module.css";

// Frame 34 of the 30 fps render (CONTACT in design/intro/stapler_intro.py).
const CLINCH_TIME_S = 33 / 30;

export function IntroOverlay() {
  // Automated browsers (Playwright verify scripts) start with fresh storage; keep them out of the intro.
  const [open, setOpen] = useState(() => !hasSeenIntro() && !navigator.webdriver);
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [done, setDone] = useState(still);
  const [videoFailed, setVideoFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const snapTimer = useRef<number | undefined>(undefined);

  const close = () => {
    markIntroSeen();
    window.clearTimeout(snapTimer.current);
    setLeaving(true);
    window.setTimeout(() => setOpen(false), 400);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(snapTimer.current);
    };
  }, [open]);

  if (!open) return null;

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
            const wait = (CLINCH_TIME_S - e.currentTarget.currentTime) * 1000;
            window.clearTimeout(snapTimer.current);
            if (wait > 0) snapTimer.current = window.setTimeout(playStapleSound, wait);
          }}
          onEnded={() => setDone(true)}
          onError={() => {
            setVideoFailed(true);
            setDone(true);
          }}
        />
      )}
      <button type="button" className={styles.skip} onClick={close}>
        スキップ
      </button>
      <button type="button" className={styles.cta} data-visible={done} tabIndex={done ? 0 : -1} onClick={close}>
        Versioを使い始める
      </button>
    </div>
  );
}
