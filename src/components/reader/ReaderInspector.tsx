import type { CSSProperties, ReactNode } from "react";
import { READER_INSPECTOR_TABS, type ReaderInspectorView } from "../../utils/readerRightPanel";
import panelStyles from "./SidePanel.module.css";
import { useMotionState } from "../ui/Presence";

const SEARCH_TAB = { id: "search" as const, label: "検索" };

/** Right inspector shell: tab header + the active panel's content. The 検索 tab exists only while search is active. */
export function ReaderInspector({
  tab,
  searchAvailable,
  onTabChange,
  children,
}: {
  tab: ReaderInspectorView;
  searchAvailable: boolean;
  onTabChange: (tab: ReaderInspectorView) => void;
  children: ReactNode;
}) {
  const tabs: { id: ReaderInspectorView; label: string }[] = searchAvailable
    ? [...READER_INSPECTOR_TABS, SEARCH_TAB]
    : READER_INSPECTOR_TABS;
  const index = Math.max(0, tabs.findIndex((item) => item.id === tab));
  const label = tabs[index]?.label;
  const indicator = { "--tab-count": tabs.length, "--tab-index": index } as CSSProperties;
  return (
    <aside className={panelStyles.panel} data-motion={useMotionState()} aria-label="インスペクタ" data-testid="reader-inspector">
      <header className={panelStyles.header}>
        <div className={panelStyles.tabs} role="tablist" aria-label="インスペクタの表示" style={indicator}>
          <span className={panelStyles.tabIndicator} aria-hidden />
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`inspector-tab-${item.id}`}
              aria-selected={item.id === tab}
              aria-controls="inspector-tabpanel"
              className={panelStyles.tab}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div
        key={tab}
        id="inspector-tabpanel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        aria-label={label}
        className={panelStyles.body}
      >
        {children}
      </div>
    </aside>
  );
}
