import { useEffect, useRef, useState } from "react";
import introMp4 from "../../assets/intro/intro.mp4";
import finalPng from "../../assets/intro/final.png";
import howtoCollectMp4 from "../../assets/intro/howto-collect.mp4";
import howtoCollectJpg from "../../assets/intro/howto-collect.jpg";
import howtoReadMp4 from "../../assets/intro/howto-read.mp4";
import howtoReadJpg from "../../assets/intro/howto-read.jpg";
import { usePlamoModel } from "../settings/usePlamoModel";
import { HowToScreen } from "./HowToScreen";
import { PlamoSetupScreen } from "./PlamoSetupScreen";
import { introStepAfterCta, nextIntroStep, type IntroStep } from "./introSteps";
import { hasSeenIntro, markIntroSeen } from "./introSeen";
import { playStapleSound, primeStapleSound, STAPLE_FIRST_CLICK_S } from "./stapleSound";
import styles from "./IntroOverlay.module.css";

// Timeline of design/intro/stapler_intro.py at 30 fps (frame N plays at (N - 1) / 30 s).
// The recording's first click lands on STAGE1 = 27; its snap then falls on CONTACT = 35.
const SOUND_START_S = 26 / 30 - STAPLE_FIRST_CLICK_S;
const CTA_TIME_S = 84 / 30; // a beat after the base leaves the frame (GONE = 78)
const CTA_LABEL = "Versioを使い始める";

// Clips come from `npm run record:howto` (filming-only demo build).
const HOWTO_PAGES = {
  "howto-collect": {
    page: 1,
    title: "PDF を落として、集める",
    body: "ウィンドウに PDF をドロップすると、読める状態になります。プロジェクトへドラッグして整理します。",
    video: howtoCollectMp4,
    poster: howtoCollectJpg,
    primaryLabel: "次へ",
  },
  "howto-read": {
    page: 2,
    title: "日本語で読み、原文で確かめる",
    body: "気になる段落は原文を開いて確かめ、メモを残せます。⌘K でライブラリ全体を探せます。",
    video: howtoReadMp4,
    poster: howtoReadJpg,
    primaryLabel: "はじめる",
  },
} as const;

export function IntroOverlay() {
  // Automated browsers (Playwright verify scripts) are kept out of the intro.
  const [open, setOpen] = useState(() => {
    const show = !navigator.webdriver && !hasSeenIntro();
    if (show) primeStapleSound();
    return show;
  });
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [ctaShown, setCtaShown] = useState(still);
  const [leaving, setLeaving] = useState(false);
  const [step, setStep] = useState<IntroStep>("intro");
  const plamo = usePlamoModel();
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

  const onCta = () => setStep(introStepAfterCta(plamo.state));
  const advance = () => {
    const next = nextIntroStep(step);
    if (next === "close") close();
    else setStep(next);
  };
  const howto = step === "howto-collect" || step === "howto-read" ? HOWTO_PAGES[step] : null;

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
      <button type="button" className={styles.cta} data-visible={ctaShown && step === "intro"} tabIndex={ctaShown && step === "intro" ? 0 : -1} aria-label={CTA_LABEL} onClick={onCta}>
        {/* letters settle in one by one, then the pill grows behind them */}
        <span className={styles.pill} aria-hidden>
          {[...CTA_LABEL].map((c, i) => (
            <span key={i} className={styles.letter} style={{ animationDelay: `${i * 35}ms` }}>
              {c}
            </span>
          ))}
        </span>
      </button>
      {step === "plamo" ? (
        <PlamoSetupScreen
          onDownload={() => {
            // installs in the background while the how-to pages play; the shell shows progress at the bottom
            void plamo.download();
            advance();
          }}
          onClose={advance}
        />
      ) : null}
      {howto ? <HowToScreen key={step} {...howto} total={2} still={still} onNext={advance} onSkip={close} /> : null}
    </div>
  );
}
