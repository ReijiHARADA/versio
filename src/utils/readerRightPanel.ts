/** Reader right inspector: one tab of paper-attached info at a time (see UI_INTERACTION_PRINCIPLES.md). */
export type ReaderInspectorTab = "info" | "notes" | "glossary" | "search";
export type ReaderInspectorState = { open: boolean; tab: ReaderInspectorTab };

export const READER_INSPECTOR_TABS: { id: ReaderInspectorTab; label: string }[] = [
  { id: "info", label: "情報" },
  { id: "notes", label: "メモ" },
  { id: "glossary", label: "用語" },
  { id: "search", label: "検索" },
];

/** Saved state wins; first launch opens the info tab only where it can sit on the ground. */
export function resolveReaderInspector(
  saved: Partial<ReaderInspectorState> | undefined,
  wide: boolean
): ReaderInspectorState {
  return { open: saved?.open ?? wide, tab: saved?.tab ?? "info" };
}

/** Toolbar shortcut for one tab: open on it, or close when it is already showing. */
export function toggleReaderInspectorTab(
  state: ReaderInspectorState,
  target: ReaderInspectorTab
): ReaderInspectorState {
  return state.open && state.tab === target ? { ...state, open: false } : { open: true, tab: target };
}
