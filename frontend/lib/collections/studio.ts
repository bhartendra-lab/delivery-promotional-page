/**
 * Smart Selects' collection toolbar, as pure functions: the filenames line a
 * designer pastes into their editor, and the CSV of a collection.
 *
 * Studio copy rules: plain and exact, no exclamation marks, no em dashes.
 */
import { resolveCleanName } from "../locate-originals/match.ts";
import type { CuratorItem, GuestCollection } from "./types.ts";

/** "DSC_4821.jpg, DSC_4822.jpg": the original names, in the view's order. */
export function filenamesLine(items: readonly Pick<CuratorItem, "filename" | "media_id">[], bookingId: string): string {
  return items.map((m) => resolveCleanName({ filename: m.filename ?? null, media_id: m.media_id }, bookingId)).join(", ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-26 14:05" in India's time: sorts correctly in a spreadsheet. */
export function istStamp(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) return "";
  const d = new Date(epochMs + 330 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const escapeCsv = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * One collection as a CSV: Filename, Folder, Added by, Added at, one row per
 * photo in the view's order. "Added by" is the guest who added it, or the
 * studio's name for the studio's own adds (as the attribution line says).
 */
export function collectionCsv(
  items: readonly CuratorItem[],
  { collectionId, bookingId, folderName }: { collectionId: string; bookingId: string; folderName: (id: string | null) => string },
): string {
  const rows = [["Filename", "Folder", "Added by", "Added at"]];
  for (const m of items) {
    const ref = m.collection_refs?.find((r) => r.collection_id === collectionId);
    rows.push([
      resolveCleanName({ filename: m.filename ?? null, media_id: m.media_id }, bookingId),
      folderName(m.primary_folder_id ?? m.custom_folder_ids?.[0] ?? null),
      ref?.added_by_name ?? "",
      istStamp(ref?.added_at ?? null),
    ]);
  }
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
}

/** A file name for the CSV: "Priya_and_Rahul_-_Priya's_Side.csv" made safe. */
export function csvFileName(eventName: string, collectionName: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, "").replace(/\s+/g, " ").trim();
  return `${[safe(eventName), safe(collectionName)].filter(Boolean).join(" - ") || "collection"}.csv`;
}

/** The rail's second line for a collection: its target, or nothing. */
export function railTarget(c: Pick<GuestCollection, "count" | "target_count">): string | null {
  return c.target_count ? `${c.count.toLocaleString("en-IN")} of ${c.target_count.toLocaleString("en-IN")}` : null;
}

/** Album size typed by the studio: a whole number from 1 to 5,000, or empty to clear. */
export function parseAlbumSize(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.replace(/[,\s]/g, "");
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false, message: "Enter a whole number of photos." };
  const n = Number(t);
  if (n < 1 || n > 5000) return { ok: false, message: "Album size must be between 1 and 5,000 photos." };
  return { ok: true, value: n };
}
