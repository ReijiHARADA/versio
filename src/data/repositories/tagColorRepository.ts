import type { SqliteClient } from "../sqlite/client";
import { toLabelColor, type LabelColor } from "../../domain/labelColors";

/** Tag name (case-insensitive) → label color. */
export function listTagColors(db: SqliteClient): Record<string, LabelColor> {
  const colors: Record<string, LabelColor> = {};
  for (const row of db.query("SELECT tag, color FROM tag_colors")) {
    const color = toLabelColor(row.color);
    if (color) colors[String(row.tag).toLocaleLowerCase()] = color;
  }
  return colors;
}

export function setTagColor(db: SqliteClient, tag: string, color: LabelColor | null): void {
  if (color) {
    db.exec("INSERT INTO tag_colors (tag, color) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET color = excluded.color", [tag, color]);
  } else {
    db.exec("DELETE FROM tag_colors WHERE tag = ?", [tag]);
  }
}
