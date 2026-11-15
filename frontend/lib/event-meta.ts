/**
 * Pure. The event workspace's reading of get-booking-by-id: the event meta
 * (`normalizeMeta`, with its offline fallbacks to the cached copy), the
 * live/sync snapshot, the pay per event validity, and the live pill's state.
 * Split out of EventWorkspace.tsx so the Studio app shares it through its
 * core sync instead of a copy.
 */
import type { BookingDetail, EmbeddingStatus, EventExpiryChoice, GalleryPublishStatus, ServiceType } from "./types.ts";
import { normalizeDeliveryPreferences, type DeliveryPreferences } from "./delivery-preferences.ts";
import type { ValidityExtensionRecord, ValidityOption } from "./event-validity.ts";

/** The live pill's two states (LivePill.tsx). */
export type LivePillState = "live" | "deactivated";

export type EventMeta = {
  name: string;
  type: string;
  /** Epoch ms, or null when unset. */
  eventDate: number | null;
  backgroundImage?: string;
  /** Cover focal point as CSS object-position, e.g. "50% 35%". */
  backgroundPosition?: string;
  customMessage?: string;
  styleVariant?: string;
  includeBranding?: boolean;
  /** Public shared-link slug for the guest gallery (`/event/<unique_identifier>`). */
  uniqueIdentifier?: string;
  /** Family passcode that unlocks the full gallery in-lounge. */
  familyPasscode?: string;
  /** Guest teams / sub-types shown on the client "Which team are you in?" screen. */
  guestTypes?: string[];
  /** Reusable QR pointed at this event, if any (joined by `getBookingById`). */
  qrUniqueId?: string;
  qrImageUrl?: string;
  /**
   * Event-scoped guest delivery preferences, already normalised (defaults
   * filled) — so consumers can read `deliveryPreferences.allow_download`
   * directly without re-checking for an absent key.
   */
  deliveryPreferences?: DeliveryPreferences;
  /**
   * What this event may still change, as the backend decided from the plan the
   * EVENT was created under (`name_locked` / `cover_locked`). Pay per event:
   * the name from creation, the cover once one is set. Absent (an older
   * backend, or before the first load) reads as unlocked.
   */
  nameLocked?: boolean;
  coverLocked?: boolean;
  /**
   * The Studio's own expiry for a storage plan event. Null or absent on both
   * means "never". `expiryAt` is epoch ms, the end of that day in IST.
   */
  expiryChoice?: EventExpiryChoice | null;
  expiryAt?: number | null;
};

/**
 * Live/sync snapshot, sourced authoritatively from get-booking-by-id.
 * Events are live from creation — the only user control is activate/
 * deactivate; everything else here is pipeline status.
 */
export type PublishInfo = {
  status: GalleryPublishStatus;
  embedding: EmbeddingStatus;
  isActive: boolean;
  outOfSync: boolean;
  unsyncedCount: number;
  /** The booking's own plan — gates the in-workspace Archive control. */
  serviceType: ServiceType | null;
  /**
   * True once the first photos have SYNCED (`gallery_published_at` set by the
   * backend on the first completed finalize). It used to lock the event name,
   * because a rename regenerated the unique_identifier and broke the shared
   * link. A rename no longer touches the link, so this locks nothing now: what
   * an event may still change comes from the backend as `name_locked` and
   * `cover_locked` (see `normalizeMeta`), by the plan the event was made under.
   */
  hasBeenPublished: boolean;
};

export const DEFAULT_PUB: PublishInfo = {
  status: "published",
  embedding: "not_started",
  isActive: true,
  outOfSync: false,
  unsyncedCount: 0,
  serviceType: null,
  hasBeenPublished: false,
};

export function normalizeMeta(
  b: BookingDetail,
  prev: EventMeta | null,
  opts: { qrAuthoritative?: boolean } = {},
): EventMeta {
  const date = typeof b.event_date === "number" && Number.isFinite(b.event_date) ? b.event_date : null;
  // background_image: a non-empty string sets the cover; "" means explicitly
  // cleared; undefined/null falls back to the cached value (offline resilience).
  const bg =
    typeof b.background_image === "string" ? b.background_image || undefined : prev?.backgroundImage;
  return {
    name: b.name ?? b.event_name ?? b.lead?.name ?? prev?.name ?? "Untitled event",
    type: b.event_type ?? b.events?.[0]?.event_type ?? prev?.type ?? "Event",
    eventDate: date ?? prev?.eventDate ?? null,
    backgroundImage: bg,
    backgroundPosition: b.background_position ?? prev?.backgroundPosition,
    customMessage: b.custom_message ?? prev?.customMessage,
    styleVariant: b.style_variant ?? prev?.styleVariant,
    includeBranding: b.include_company_branding ?? prev?.includeBranding,
    uniqueIdentifier: b.unique_identifier ?? prev?.uniqueIdentifier,
    familyPasscode: b.family_passcode ?? prev?.familyPasscode,
    guestTypes: b.guest_types ?? prev?.guestTypes,
    // Normalised on the way in so every consumer reads a complete object.
    // The `prev` fallback matters twice over: partial-update responses that
    // don't echo the field must not wipe it, and a localStorage hydration
    // carries the last known value until the authoritative read lands.
    deliveryPreferences: normalizeDeliveryPreferences(
      b.delivery_preferences ?? prev?.deliveryPreferences,
    ),
    // getBookingById (reloadBooking) is the sole source of truth for QR
    // linking — the QR can be relinked/deleted from the Reusable QR tab
    // without this workspace ever mounting, so an absent field in that
    // authoritative response means "unlinked now" and must clear the panel
    // rather than fall back to `prev` (which can be a stale localStorage
    // hydration from before the change). Partial-update responses like
    // updateBooking never report QR fields at all, so they keep falling back
    // to `prev` there to avoid wiping a real link on an unrelated edit.
    qrUniqueId: opts.qrAuthoritative ? b.qr_unique_id : (b.qr_unique_id ?? prev?.qrUniqueId),
    qrImageUrl: opts.qrAuthoritative ? b.qr_image_url : (b.qr_image_url ?? prev?.qrImageUrl),
    // The per-plan edit locks, decided by the backend so plan rules are never
    // re-derived here. Absent (an older backend) keeps the cached value, and
    // with none cached reads as unlocked.
    nameLocked: b.name_locked ?? prev?.nameLocked,
    coverLocked: b.cover_locked ?? prev?.coverLocked,
    // `null` is a real answer here ("never"), so only `undefined` (a response
    // that does not carry the field at all) falls back to the cached value.
    expiryChoice: b.event_expiry_choice !== undefined ? b.event_expiry_choice : prev?.expiryChoice,
    expiryAt: b.event_expiry_at !== undefined ? b.event_expiry_at : prev?.expiryAt,
  };
}

export function normalizePublish(b: BookingDetail): PublishInfo {
  return {
    status: b.gallery_publish_status ?? "published",
    embedding: b.embedding_status ?? "not_started",
    isActive: b.is_active !== false,
    outOfSync: b.media_out_of_sync === true,
    unsyncedCount: typeof b.unsynced_media_count === "number" ? b.unsynced_media_count : 0,
    serviceType: (b.service_type as ServiceType | null | undefined) ?? null,
    // "First photos synced", not a publish action (which no longer exists) —
    // see the PublishInfo docs.
    hasBeenPublished: typeof b.gallery_published_at === "number",
  };
}

/**
 * When a pay per event event closes and what extending it would cost, from
 * get-booking-by-id. Null for a storage plan event (no validity), and for a
 * backend that predates validity extensions, where the pill simply shows no
 * "Extend validity" row.
 */
export type ValidityInfo = {
  endsAt: number;
  lapsed: boolean;
  extendable: boolean;
  options: ValidityOption[];
  /** Whether each option's price includes GST (the Event-based plan's switch). */
  gstInclusive: boolean;
  extensions: ValidityExtensionRecord[];
  extensionCount: number;
};

export function normalizeValidity(b: BookingDetail): ValidityInfo | null {
  if (typeof b.validity_ends_at !== "number") return null;
  return {
    endsAt: b.validity_ends_at,
    lapsed: b.validity_lapsed === true,
    extendable: b.validity_extendable === true,
    options: Array.isArray(b.validity_options) ? b.validity_options : [],
    // Absent from a backend that predates the switch, where every price included GST.
    gstInclusive: b.validity_gst_inclusive !== false,
    extensions: Array.isArray(b.validity_extensions) ? b.validity_extensions : [],
    extensionCount: typeof b.validity_extension_count === "number" ? b.validity_extension_count : 0,
  };
}

export function computePillState(pub: PublishInfo): LivePillState {
  if (!pub.isActive) return "deactivated";
  // The studio only ever sees "Live". Background processing (embeddings →
  // face search) runs after every upload but is deliberately NOT surfaced to
  // the studio — the gallery is live the moment photos finish uploading.
  return "live";
}
