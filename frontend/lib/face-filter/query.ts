/**
 * The face filter's pure rules: the query string, reading an answer, and
 * keeping a selection consistent with the chips it was made from.
 *
 * No I/O, so it is tested directly (query.test.ts). The hook that drives the
 * bar (components/event/screens/faces/useFaceFilter.ts) owns the requests.
 */

import type { FaceChip, FaceChips, FaceFilterBlock, FaceFilterMedia, FaceFilterScope } from "./types";

/** The server caps a selection here; the bar never holds more. */
export const FACE_FILTER_MAX_SELECTED = 30;

/** Rapid taps on the bar settle for this long before a selection is asked for. */
export const SELECTION_DEBOUNCE_MS = 250;

/** The backend's own rule for an identity id (SAFE_IDENTITY_ID). An id outside
 *  it would be dropped by the server anyway, so it is never shown as a chip. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The `get-guest-session` query for the face filter.
 *
 * `faces` is sent only when there is a selection: an empty `faces=` asks the
 * server for a selection answer, and a bar with nothing selected must not ask
 * for anything.
 */
export function faceFilterQuery({
  scope,
  ifKey,
  faces,
}: {
  scope: FaceFilterScope;
  ifKey?: string | null;
  faces?: readonly string[];
}): string {
  const params = new URLSearchParams();
  params.set("include", "face_filter");
  params.set("scope", scope);
  if (ifKey) params.set("if_key", ifKey);
  const picked = (faces ?? []).slice(0, FACE_FILTER_MAX_SELECTED);
  if (picked.length > 0) params.set("faces", picked.join(","));
  return `?${params.toString()}`;
}

function parseChip(raw: unknown): FaceChip | null {
  const chip = raw as Partial<FaceChip> | null;
  if (!chip || typeof chip.id !== "string" || !SAFE_ID.test(chip.id)) return null;
  if (typeof chip.thumb_url !== "string" || !chip.thumb_url) return null;
  const count = Number(chip.count);
  return { id: chip.id, thumb_url: chip.thumb_url, count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 };
}

/**
 * Shape-checked chips from a full block (or from the cache, which is
 * guest-writable storage). Null for anything that is not a usable block.
 */
export function parseFaceChips(raw: unknown): FaceChips | null {
  const block = raw as Partial<FaceChips> | null;
  if (!block || typeof block.key !== "string" || !block.key) return null;
  if (block.scope !== "mine" && block.scope !== "all") return null;
  if (block.state !== "ready" && block.state !== "preparing" && block.state !== "needs_selfie") return null;
  if (!Array.isArray(block.faces)) return null;
  const seen = new Set<string>();
  const faces: FaceChip[] = [];
  for (const raw of block.faces) {
    const chip = parseChip(raw);
    if (!chip || seen.has(chip.id)) continue;
    seen.add(chip.id);
    faces.push(chip);
  }
  return { key: block.key, scope: block.scope, state: block.state, faces };
}

/**
 * The chips after one answer.
 *
 * - No block at all: the backend's switch is off, so there is no bar.
 * - `enabled: false`: the event's switch (or face search) is off.
 * - `unchanged`: what is already held stands.
 * - A full block replaces what is held.
 *
 * Returns `prev` itself when nothing changed, so callers can compare by
 * identity.
 */
export function applyChipAnswer(prev: FaceChips | null, block: FaceFilterBlock | null | undefined): FaceChips | null {
  if (!block || typeof block !== "object") return null;
  if ("unchanged" in block && block.unchanged === true) return prev;
  if ("enabled" in block && block.enabled === true) return parseFaceChips(block);
  return null;
}

/** The faces a bar shows: only for a ready scope with at least one chip. */
export function visibleChips(chips: FaceChips | null | undefined): FaceChip[] | null {
  return chips && chips.state === "ready" && chips.faces.length > 0 ? chips.faces : null;
}

/**
 * A selection with every chip that no longer exists dropped, silently.
 * Returns `selected` itself when nothing was dropped.
 */
export function reconcileSelection(selected: string[], chips: FaceChips | null): string[] {
  if (selected.length === 0) return selected;
  const present = new Set(visibleChips(chips)?.map((chip) => chip.id) ?? []);
  const kept = selected.filter((id) => present.has(id));
  return kept.length === selected.length ? selected : kept;
}

/** Tap one chip: on if it was off, off if it was on. Never past the cap. */
export function toggleSelection(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= FACE_FILTER_MAX_SELECTED) return selected;
  return [...selected, id];
}

/** Order-free identity of a selection, for keys and comparisons. */
export function selectionKey(selected: readonly string[]): string {
  return [...selected].sort().join(",");
}

/** Is this a usable `face_filter_media` answer? Parallel arrays may be short;
 *  the ranking reads a missing entry as zero. */
export function isFaceFilterMedia(raw: unknown): raw is FaceFilterMedia {
  const media = raw as Partial<FaceFilterMedia> | null;
  return (
    !!media &&
    typeof media.key === "string" &&
    (media.scope === "mine" || media.scope === "all") &&
    Array.isArray(media.faces) &&
    Array.isArray(media.media_ids) &&
    Array.isArray(media.hits) &&
    Array.isArray(media.like_counts)
  );
}
