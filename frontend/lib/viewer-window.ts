/**
 * The photo viewers' sliding window: which neighbours of the photo on screen
 * should already be downloaded, so Next and Previous never wait on the network.
 *
 * Pure (no DOM), so the web viewers, the studio Lightbox and the mobile app
 * (which copies this file through its core sync) all agree on the same window.
 *
 * WHY 5 AHEAD AND 3 BEHIND. Guests overwhelmingly page forwards; going back is
 * usually one or two photos ("wait, that one"). Five ahead covers a burst of
 * quick Next taps at gallery speed; three behind covers the look-back. Nine
 * 2560px photos is roughly 9–15 MB of transfer, cheap next to the cost of a
 * stuck button. Decoding is a separate, much tighter budget: the hook that
 * uses this window decodes only ±1 (see use-image-window.ts).
 *
 * WHY THE ORDER IS INTERLEAVED. The loader runs at most a few requests at a
 * time, in this order, so the order IS the priority: the current photo, then
 * the very next, then the one just behind, then further ahead. A guest who
 * taps Next twice lands on a photo that was second in line, not ninth.
 */

export const WINDOW_AHEAD = 5;
export const WINDOW_BEHIND = 3;

/** Indices to have ready, most urgent first: current, then nearest neighbours
 *  biased forward: [i, i+1, i-1, i+2, i+3, i-2, i+4, i+5, i-3].
 *  `wrap` mirrors the viewer's own navigation (desktop wraps, the reel doesn't).
 *  Never repeats an index; never returns more than `count` entries. */
export function windowIndices(
  index: number,
  count: number,
  opts: { ahead?: number; behind?: number; wrap: boolean },
): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const ahead = Math.max(0, Math.floor(opts.ahead ?? WINDOW_AHEAD));
  const behind = Math.max(0, Math.floor(opts.behind ?? WINDOW_BEHIND));
  const i0 = Math.min(count - 1, Math.max(0, Math.floor(index)));

  // Offsets in priority order. Two ahead for every one behind, after the
  // first step each way: +1, -1, +2, +3, -2, +4, +5, -3, … — then whatever
  // is left on either side once the other runs out.
  const offsets: number[] = [0];
  let a = 1;
  let b = 1;
  if (a <= ahead) offsets.push(a++);
  if (b <= behind) offsets.push(-b++);
  while (a <= ahead || b <= behind) {
    for (let k = 0; k < 2 && a <= ahead; k++) offsets.push(a++);
    if (b <= behind) offsets.push(-b++);
  }

  const seen = new Set<number>();
  const out: number[] = [];
  for (const d of offsets) {
    let j = i0 + d;
    if (opts.wrap) j = ((j % count) + count) % count;
    else if (j < 0 || j >= count) continue;
    if (seen.has(j)) continue;
    seen.add(j);
    out.push(j);
    if (out.length >= count) break;
  }
  return out;
}

/** True when the window reaches past the loaded items and another page should be asked for. */
export function windowNeedsMore(index: number, loaded: number, hasMore: boolean, ahead: number = WINDOW_AHEAD): boolean {
  if (!hasMore) return false;
  return index + Math.max(0, ahead) >= loaded - 1;
}
