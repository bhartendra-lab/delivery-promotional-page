/**
 * Locate Originals by collection: which photos a run looks for, and where each
 * one goes. Pure, so the rules are tested apart from the File System Access
 * plumbing (fsa.ts) and the copier (engine.ts).
 *
 * With collections, the output tree is
 *   Smartly Selected/{Collection}/{Folder}/{file}
 *   Smartly Selected/Shortlisted/{Folder}/{file}
 * and a photo in two collections is copied into both: album designers work
 * per album. With no collections the tree is exactly what it always was,
 * Smartly Selected/{Folder}/{file}, and none of this module is used.
 */
import type { LocateItem } from "../collections/types.ts";
import { sanitizeFolderName } from "./match.ts";

/** One row of the "What should we locate?" checklist. */
export type LocateChoice = { id: string; name: string; count: number; sent: boolean };

/**
 * What the checklist starts with (spec §9.2): every sent collection; if none
 * is sent, every collection with photos. Shortlisted is ticked only when no
 * collection is (an event with collections but nothing in them yet, say).
 */
export function locateDefaults(collections: readonly LocateChoice[]): { collections: Set<string>; shortlist: boolean } {
  const filled = collections.filter((c) => c.count > 0);
  const sent = filled.filter((c) => c.sent);
  const chosen = new Set((sent.length ? sent : filled).map((c) => c.id));
  return { collections: chosen, shortlist: chosen.size === 0 };
}

/**
 * The shortlist's placement name in a locate answer: the one name that is not
 * a collection's. The backend calls it "Shortlisted", or "Shortlisted
 * (studio)" when a Client named a collection "Shortlisted".
 */
export function shortlistPlacementOf(
  items: readonly Pick<LocateItem, "placements">[] | readonly { placements?: string[] }[],
  collectionNames: ReadonlySet<string>,
): string | null {
  for (const it of items) for (const p of it.placements ?? []) if (!collectionNames.has(p)) return p;
  return null;
}

/**
 * The run's photos for a choice, each keeping only the placements chosen.
 * Fetched once for everything (every visible collection and the shortlist),
 * then narrowed here on every tick, so the button's count is always live.
 */
export function chosenTargets<T extends { placements?: string[] }>(
  items: readonly T[],
  chosenNames: ReadonlySet<string>,
): (T & { placements: string[] })[] {
  const out: (T & { placements: string[] })[] = [];
  for (const it of items) {
    const placements = (it.placements ?? []).filter((p) => chosenNames.has(p));
    if (placements.length) out.push({ ...it, placements });
  }
  return out;
}

/**
 * Where one copy of a photo goes, relative to the output folder. `placement`
 * null is the old layout (no collection level).
 */
export function placementPath(placement: string | null, folderName: string, filename: string): string {
  const folder = sanitizeFolderName(folderName);
  return placement ? `${sanitizeFolderName(placement)}/${folder}/${filename}` : `${folder}/${filename}`;
}

/** The not-found list, grouped by where each photo would have gone, in the
 *  run's own order of placements. A photo in two collections is listed under
 *  both: the designer of each album is missing it. */
export function groupByPlacement<T extends { placements?: string[] }>(items: readonly T[], order: readonly string[]): { placement: string; items: T[] }[] {
  const groups = new Map<string, T[]>(order.map((p) => [p, []]));
  for (const it of items) {
    for (const p of it.placements ?? []) {
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(it);
    }
  }
  return [...groups].filter(([, list]) => list.length > 0).map(([placement, list]) => ({ placement, items: list }));
}
