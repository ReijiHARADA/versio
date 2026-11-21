import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import sheet from "../settings/LicenseTextSheet.module.css";
import styles from "./ShortcutsSheet.module.css";

// Keep in sync with src-tauri/src/menu.rs and the in-app key handlers.
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "全体",
    items: [
      ["論文を追加", "⌘O"],
      ["新規フォルダ", "⇧⌘N"],
      ["ライブラリを検索", "⌘K"],
      ["戻る／進む", "⌘[ ／ ⌘]"],
      ["サイドバーを表示／非表示", "⌃⌘S"],
      ["設定", "⌘,"],
      ["キーボードショートカット", "⌘/"],
    ],
  },
  {
    title: "論文を読む",
    items: [
      ["論文内を検索", "⌘F"],
      ["文字を大きく／小さく", "⌘+ ／ ⌘−"],
      ["文字を標準サイズに", "⌘0"],
      ["メモを保存", "⌘↩"],
    ],
  },
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={sheet.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={sheet.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={sheet.header}>
          <h2 id={titleId} className={sheet.title}>キーボードショートカット</h2>
          <button ref={closeButtonRef} type="button" className={sheet.closeButton} onClick={onClose} title="閉じる" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>
        <div className={sheet.body}>
          {GROUPS.map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              {group.items.map(([label, keys]) => (
                <div key={label} className={styles.row}>
                  <span>{label}</span>
                  <kbd className={styles.keys}>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}
