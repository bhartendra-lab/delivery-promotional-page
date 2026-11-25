// lib/guest-metrics-core.ts — the pure rules behind the guest gallery's own
// metrics (lib/guest-metrics.ts is the browser runtime).
//
// These are counted by us and sent to nobody: no third-party script on a guest
// page, ever. A guest is a random device id made in the browser. No name,
// phone, face or photo id is ever part of a metric.

export const GUEST_EVENT_TYPES = ["gallery_view", "photo_open", "download", "selfie_search", "share", "powered_by_click"] as const;
export type GuestEventType = (typeof GUEST_EVENT_TYPES)[number];

/** The fixed words the backend accepts as `source`. */
export const METRIC_SOURCES = ["visit", "scan", "viewer", "tile", "gallery", "whatsapp", "copy", "native"] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

export const DEVICE_ID_KEY = "vy_gdev";
/** These two are counted once per browser session, however many times the screen mounts. */
export const ONCE_PER_SESSION: readonly GuestEventType[] = ["gallery_view", "selfie_search"];

export type MetricData = { count?: number; source?: MetricSource };
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A random id, from crypto when there is any. Never derived from anything about the guest. */
export function makeDeviceId(random: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } | undefined): string {
  if (random?.randomUUID) return random.randomUUID();
  const bytes = new Uint8Array(16);
  if (random?.getRandomValues) random.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The kept device id, or a new one kept for next time. Storage that throws still gives an id (for this page only). */
export function deviceIdFrom(store: KeyValueStore | null, random: Parameters<typeof makeDeviceId>[0]): string {
  try {
    const kept = store?.getItem(DEVICE_ID_KEY);
    if (kept && DEVICE_ID.test(kept)) return kept;
  } catch {
    /* fall through to a fresh id */
  }
  const id = makeDeviceId(random);
  try {
    store?.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* an id not kept is still an id */
  }
  return id;
}

/** Guests who ask not to be tracked (Do Not Track or Global Privacy Control) are not counted. */
export function optedOutByBrowser(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined): boolean {
  return nav?.doNotTrack === "1" || nav?.globalPrivacyControl === true;
}

/** What goes in `tracking_data`: the device id, and only a sound count and a known source word. */
export function buildTrackingData(deviceId: string, data: MetricData = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { device_id: deviceId };
  if (Number.isInteger(data.count) && data.count! >= 1 && data.count! <= 5000) out.count = data.count;
  if (data.source && (METRIC_SOURCES as readonly string[]).includes(data.source)) out.source = data.source;
  return out;
}

/** The per-session guard key, or null for an event that is counted every time. */
export function onceKey(uid: string, type: GuestEventType): string | null {
  return ONCE_PER_SESSION.includes(type) ? `vy_gm:${uid}:${type}` : null;
}

/**
 * The "Powered by Vyavasth" link, tagged so the dashboard's own analytics can tell a studio who came from a
 * gallery from one who came from anywhere else. Existing parameters are kept.
 */
export function poweredByUrl(base: string): string {
  const url = new URL(base);
  url.searchParams.set("utm_source", "gallery");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}
