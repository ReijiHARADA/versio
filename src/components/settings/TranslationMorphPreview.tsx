import { useCallback, useEffect, useState } from "react";
import { TranslationMorph } from "../reader/TranslationMorph";
import styles from "./TranslationMorphPreview.module.css";

const DEMO_EN =
  "Attention mechanisms alone are sufficient for sequence transduction, without recurrence or convolution.";
const DEMO_JA =
  "系列変換には、再帰や畳み込みに頼らず、注意機構だけがあれば十分である。";

/**
 * Local preview of the paragraph translation morph (waiting → particle reveal).
 */
export function TranslationMorphPreview() {
  const [phase, setPhase] = useState<"waiting" | "revealing" | "done">("waiting");

  const replay = useCallback(() => {
    setPhase("waiting");
    window.setTimeout(() => setPhase("revealing"), 900);
  }, []);

  useEffect(() => {
    const start = window.setTimeout(() => setPhase("revealing"), 1100);
    return () => window.clearTimeout(start);
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <p className={styles.caption}>
          構造確定後の英語表示 → 文字が粒子に溶け、日本語の字形へ再形成される演出のプレビューです。
        </p>
        <button type="button" className={styles.replay} onClick={replay}>
          もう一度再生
        </button>
      </div>
      <div className={styles.stage} aria-live="polite">
        {phase === "done" ? (
          <p className={styles.settled}>{DEMO_JA}</p>
        ) : (
          <TranslationMorph
            fromText={DEMO_EN}
            toText={DEMO_JA}
            phase={phase === "revealing" ? "revealing" : "waiting"}
            onRevealComplete={() => setPhase("done")}
          />
        )}
      </div>
      <p className={styles.hint}>
        {phase === "waiting"
          ? "翻訳待ち（英語レイアウト表示）"
          : phase === "revealing"
            ? "切り替え中"
            : "完了"}
      </p>
    </div>
  );
}
