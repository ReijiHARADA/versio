import type { ReactNode } from "react";
import { READER_INSPECTOR_TABS, type ReaderInspectorTab } from "../../utils/readerRightPanel";
import panelStyles from "./SidePanel.module.css";

/** Right inspector shell: tab header + the active panel's content. */
export function ReaderInspector({
  tab,
  onTabChange,
  onClose,
  children,
}: {
  tab: ReaderInspectorTab;
  onTabChange: (tab: ReaderInspectorTab) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const label = READER_INSPECTOR_TABS.find((item) => item.id === tab)?.label;
  return (
    <aside className={panelStyles.panel} aria-label="インスペクタ" data-testid="reader-inspector">
      <header className={panelStyles.header}>
        <div className={panelStyles.tabs} role="tablist" aria-label="インスペクタの表示">
          {READER_INSPECTOR_TABS.map((item) => (
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
        <button type="button" className={panelStyles.close} onClick={onClose}>
          閉じる
        </button>
      </header>
      <div
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
