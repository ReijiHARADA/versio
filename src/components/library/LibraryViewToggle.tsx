import { LayoutGrid, List } from "lucide-react";
import { useAppStore, type LibraryView } from "../../stores/appStore";
import styles from "./LibraryViewToggle.module.css";

const OPTIONS: Array<{ value: LibraryView; label: string; Icon: typeof List }> = [
  { value: "list", label: "リスト", Icon: List },
  { value: "grid", label: "アイテム", Icon: LayoutGrid },
];

export function useLibraryView(): LibraryView {
  return useAppStore((state) => (state.displaySettings.libraryView === "grid" ? "grid" : "list"));
}

export function LibraryViewToggle() {
  const view = useLibraryView();
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);
  return (
    <div className={styles.group} role="radiogroup" aria-label="表示方法">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          aria-label={`${label}表示`}
          title={`${label}表示`}
          data-testid={`library-view-${value}`}
          className={`${styles.option} ${view === value ? styles.active : ""}`}
          onClick={() => setDisplaySettings({ libraryView: value })}
        >
          <Icon size={15} aria-hidden="true" />
          <span className={styles.label} aria-hidden="true">
            <span>{label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
