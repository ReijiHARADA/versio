export const SETTINGS_SCROLL_SECTIONS = [
  { id: "reading", label: "読書" },
  { id: "translation", label: "翻訳" },
  { id: "data", label: "ライブラリとデータ" },
] as const;

export const SETTINGS_LICENSE_SECTION = {
  id: "licenses",
  label: "ライセンス",
} as const;

/** Sidebar order: scrollable settings first, licenses pinned at the bottom. */
export const SETTINGS_SECTIONS = [
  ...SETTINGS_SCROLL_SECTIONS,
  SETTINGS_LICENSE_SECTION,
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
export type SettingsScrollSectionId = (typeof SETTINGS_SCROLL_SECTIONS)[number]["id"];

export function isSettingsScrollSection(
  id: SettingsSectionId
): id is SettingsScrollSectionId {
  return id !== "licenses";
}

export function settingsSectionElementId(id: SettingsSectionId): string {
  return `section-${id}`;
}
