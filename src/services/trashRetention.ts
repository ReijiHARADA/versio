import { getSetting, saveSetting } from "./database";

export const TRASH_RETENTION_SETTING_KEY = "trashRetentionDays";
export const DEFAULT_TRASH_RETENTION_DAYS = 3;
export const TRASH_RETENTION_OPTIONS = [1, 3, 7, 14, 30] as const;
export type TrashRetentionDays = (typeof TRASH_RETENTION_OPTIONS)[number];

export function isValidTrashRetentionDays(value: unknown): value is TrashRetentionDays {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (TRASH_RETENTION_OPTIONS as readonly number[]).includes(value)
  );
}

export function normalizeTrashRetentionDays(value: unknown): TrashRetentionDays {
  if (isValidTrashRetentionDays(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (isValidTrashRetentionDays(parsed)) return parsed;
  }
  return DEFAULT_TRASH_RETENTION_DAYS;
}

export async function getTrashRetentionDays(): Promise<TrashRetentionDays> {
  const raw = await getSetting<unknown>(TRASH_RETENTION_SETTING_KEY);
  return normalizeTrashRetentionDays(raw);
}

export async function setTrashRetentionDays(days: unknown): Promise<TrashRetentionDays> {
  const next = normalizeTrashRetentionDays(days);
  await saveSetting(TRASH_RETENTION_SETTING_KEY, next);
  return next;
}

/** Cutoff ISO: items with trashed_at <= cutoff are expired. */
export function trashExpiryCutoffIso(retentionDays: number, now = new Date()): string {
  const ms = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms).toISOString();
}

export function trashExpiresAtIso(trashedAt: string, retentionDays: number): string {
  const start = Date.parse(trashedAt);
  if (!Number.isFinite(start)) return trashedAt;
  return new Date(start + Math.max(1, retentionDays) * 24 * 60 * 60 * 1000).toISOString();
}

export function formatTrashRemainingLabel(
  trashedAt: string,
  retentionDays: number,
  now = new Date()
): string {
  const expires = Date.parse(trashExpiresAtIso(trashedAt, retentionDays));
  if (!Number.isFinite(expires)) return "期限不明";
  const remainingMs = expires - now.getTime();
  if (remainingMs <= 0) return "まもなく完全削除";
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (days <= 1) return "約1日以内に完全削除";
  return `約${days}日後に完全削除`;
}
