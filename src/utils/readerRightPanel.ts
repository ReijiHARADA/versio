/** Reader right inspector: one tab of paper-attached info at a time (see UI_INTERACTION_PRINCIPLES.md). */
export type ReaderInspectorTab = "info" | "notes" | "glossary";
export type ReaderInspectorState = { open: boolean; tab: ReaderInspectorTab };

export const READER_INSPECTOR_TABS: { id: ReaderInspectorTab; label: string }[] = [
  { id: "info", label: "情報" },
  { id: "notes", label: "メモ" },
  { id: "glossary", label: "用語" },
];

/** Saved state wins; first launch opens the info tab only where it can sit on the ground. */
export function resolveReaderInspector(
  saved: Partial<ReaderInspectorState> | undefined,
  wide: boolean
): ReaderInspectorState {
  const tab = READER_INSPECTOR_TABS.some((item) => item.id === saved?.tab) ? saved!.tab! : "info";
  return { open: saved?.open ?? wide, tab };
}
