import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CloseIcon as X,
} from "@solar-icons/react/linear";
import type { LicenseInventory, LicensePackage } from "../../types/licenses";
import {
  ECOSYSTEM_LABELS,
  STATUS_LABELS,
  getLicenseText,
  getNoticeText,
} from "../../data/licenses";
import styles from "./LicenseTextSheet.module.css";
import { Presence, MotionDiv } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

type LicenseTextSheetProps = {
  inventory: LicenseInventory | null;
  pkg: LicensePackage | null;
  onClose: () => void;
};

export function LicenseTextSheet({ inventory, pkg, onClose }: LicenseTextSheetProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pkg) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pkg]);

  if (!pkg || !inventory) return <Presence>{null}</Presence>;

  const licenseText = getLicenseText(inventory, pkg);
  const noticeText = getNoticeText(inventory, pkg);

  return <Presence>{createPortal(
    <MotionDiv
      className={`${styles.overlay} ${motion.overlay}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`${styles.sheet} ${motion.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 id={titleId} className={styles.title}>
              {pkg.name}
            </h2>
            <p className={styles.meta}>
              {[
                pkg.version,
                ECOSYSTEM_LABELS[pkg.ecosystem],
                pkg.license ?? "ライセンス種別未確認",
                STATUS_LABELS[pkg.status],
              ].join(" · ")}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="閉じる"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>
          {pkg.copyright ? (
            <p className={styles.copyright}>{pkg.copyright}</p>
          ) : null}
          {pkg.notes ? <p className={styles.notes}>{pkg.notes}</p> : null}
          {licenseText ? (
            <pre className={styles.text}>{licenseText}</pre>
          ) : (
            <p className={styles.empty}>
              このパッケージのライセンス全文は同梱ファイルから取得できませんでした。
            </p>
          )}
          {noticeText ? (
            <>
              <h3 className={styles.noticeTitle}>NOTICE</h3>
              <pre className={styles.text}>{noticeText}</pre>
            </>
          ) : null}
        </div>
      </section>
    </MotionDiv>,
    document.body
  )}</Presence>;
}
