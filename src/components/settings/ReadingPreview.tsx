import { useMemo, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Clock,
  FileText,
  Folder,
  Inbox,
  Library,
  Star,
} from "lucide-react";
import type { DisplaySettings, SidebarMode } from "../../stores/appStore";
import styles from "./ReadingPreview.module.css";

type ReadingPreviewProps = {
  settings: DisplaySettings;
};

function showOriginal(mode: DisplaySettings["originalDisplay"]): boolean {
  return mode === "always" || mode === "when-untranslated";
}

function sidebarExpanded(
  mode: SidebarMode,
  hovered: boolean,
  focused: boolean
): boolean {
  if (mode === "expanded") return true;
  if (mode === "collapsed") return false;
  return hovered || focused;
}

/**
 * Schematic Paper Reader chrome for Settings live preview.
 * Does not import real AppSidebar / Reader or use workspace data.
 */
export function ReadingPreview({ settings }: ReadingPreviewProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = sidebarExpanded(settings.sidebarMode, hovered, focused);
  const rootsOnly = settings.sidebarCollapseRootsOnly && !expanded;

  const previewStyle = useMemo(
    () =>
      ({
        "--preview-font-size": `${settings.fontSize}px`,
        "--preview-line-height": String(settings.lineHeight),
        "--preview-content-width": `${settings.contentWidth}px`,
      }) as CSSProperties,
    [settings.contentWidth, settings.fontSize, settings.lineHeight]
  );

  return (
    <div
      className={styles.frame}
      style={previewStyle}
      aria-label="本文プレビュー"
      data-theme-preview={settings.theme}
    >
      <p className={styles.caption}>ライブプレビュー</p>
      <div
        className={`${styles.app} ${expanded ? styles.sidebarExpanded : styles.sidebarCollapsed}`}
        aria-hidden="true"
      >
        <aside
          className={styles.sidebar}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
        >
          <div className={styles.sideSearch}>
            <span className={styles.sideIcon}>
              <Library size={14} />
            </span>
            {expanded ? <span className={styles.sideLabel}>ライブラリを検索</span> : null}
          </div>
          <div className={styles.sideSection}>
            {expanded ? <p className={styles.sideSectionTitle}>ワークスペース</p> : null}
            <div className={styles.sideItemActive}>
              <span className={styles.sideIcon}>
                <Folder size={14} />
              </span>
              {expanded ? <span className={styles.sideLabel}>認知科学</span> : null}
            </div>
            {!rootsOnly ? (
              <>
                <div className={`${styles.sideItem} ${styles.sideNested}`}>
                  <span className={styles.sideIcon}>
                    <Folder size={14} />
                  </span>
                  {expanded ? <span className={styles.sideLabel}>注意研究</span> : null}
                </div>
                <div className={`${styles.sideItem} ${styles.sideNestedDeep}`}>
                  <span className={styles.sideIcon}>
                    <FileText size={14} />
                  </span>
                  {expanded ? <span className={styles.sideLabel}>Attention…</span> : null}
                </div>
              </>
            ) : null}
          </div>
          <div className={styles.sideSection}>
            {expanded ? <p className={styles.sideSectionTitle}>ライブラリ</p> : null}
            <div className={styles.sideItem}>
              <span className={styles.sideIcon}>
                <BookOpen size={14} />
              </span>
              {expanded ? <span className={styles.sideLabel}>すべての論文</span> : null}
            </div>
            <div className={styles.sideItem}>
              <span className={styles.sideIcon}>
                <Inbox size={14} />
              </span>
              {expanded ? <span className={styles.sideLabel}>インボックス</span> : null}
            </div>
            <div className={styles.sideItem}>
              <span className={styles.sideIcon}>
                <Star size={14} />
              </span>
              {expanded ? <span className={styles.sideLabel}>お気に入り</span> : null}
            </div>
            <div className={styles.sideItem}>
              <span className={styles.sideIcon}>
                <Clock size={14} />
              </span>
              {expanded ? <span className={styles.sideLabel}>最近</span> : null}
            </div>
          </div>
        </aside>

        <div className={styles.main}>
          <article className={styles.reader}>
            <h4 className={styles.paperTitle}>注意機構があれば十分である</h4>
            <h5 className={styles.sectionHeading}>1. はじめに</h5>
            <p className={styles.body}>
              英語論文を、日本語の記事を読む感覚で読むための表示です。文字サイズ・行間・本文幅がここに反映されます。
            </p>
            {showOriginal(settings.originalDisplay) ? (
              <p className={styles.original}>
                The dominant sequence transduction models are based on complex recurrent or
                convolutional neural networks.
              </p>
            ) : null}
            <p className={styles.body}>
              モデルは再帰や畳み込みに依存せず、注意機構だけに基づいて系列変換を行います。
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}
