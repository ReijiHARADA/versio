import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { getPaperCover } from "../../services/paperCover";
import styles from "./PaperCover.module.css";

/** First PDF page as a paper sheet; loads when it scrolls into view. */
export function PaperCover({ paperId, className = "" }: { paperId: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void getPaperCover(paperId).then((url) => {
          if (!cancelled) setSrc(url);
        });
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [paperId]);

  return (
    <div ref={ref} className={`${styles.sheet} ${className}`}>
      {src ? (
        <img src={src} alt="" className={styles.image} draggable={false} />
      ) : (
        <FileText size={20} strokeWidth={1.25} className={styles.placeholder} aria-hidden="true" />
      )}
    </div>
  );
}
