/**
 * Pure. The sources a grid tile may fall through, most preferred first:
 * thumbnail → its cold-host copy → the 2560px delivery copy → its cold copy.
 * Consecutive duplicates are dropped (an already-cold URL's fallback is
 * itself), so a tile never retries the exact URL it just failed on.
 *
 * Hosts are parameters, not imports, so the mobile app can share this file:
 * the web passes its HOT/COLD (media-actions.ts), the app passes its own.
 */

export type MediaHosts = { hot: string; cold: string };

export const coldOf = (url: string, { hot, cold }: MediaHosts): string => url.replace(`//${hot}/`, `//${cold}/`);

export function gridSrcChain(m: { url: string; thumbnail_url?: string | null }, hosts: MediaHosts): string[] {
  const thumb = m.thumbnail_url || null;
  const chain = thumb
    ? // A thumbnail can be missing on either host while the delivery copy is
      // fine — e.g. mid-migration, or a photo the backfill hasn't reached — so
      // degrade to the 2560px copy (guaranteed to exist) before giving up.
      [thumb, coldOf(thumb, hosts), m.url, coldOf(m.url, hosts)]
    : [m.url, coldOf(m.url, hosts)];
  return chain.filter((url, i) => url && url !== chain[i - 1]);
}
