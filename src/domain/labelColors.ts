/** Finder-style label colors shared by folders and tags. Values live in variables.css (`--label-*`). */
export const LABEL_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  red: "レッド",
  orange: "オレンジ",
  yellow: "イエロー",
  green: "グリーン",
  blue: "ブルー",
  purple: "パープル",
  gray: "グレイ",
};

export function toLabelColor(value: unknown): LabelColor | null {
  return typeof value === "string" && (LABEL_COLORS as readonly string[]).includes(value) ? (value as LabelColor) : null;
}

export const labelColorVar = (color: LabelColor) => `var(--label-${color})`;

/** Inline style that hands a label color to CSS as `--tag-color`. */
export const tagColorStyle = (color: LabelColor | undefined): Record<string, string> | undefined =>
  color ? { "--tag-color": labelColorVar(color) } : undefined;
