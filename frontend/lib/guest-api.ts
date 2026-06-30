/**
 * Guest API layer — authenticated calls made with the per-event guest JWT.
 *
 * Distinct from `lib/api.ts` (which uses the dashboard cookie token). Every call
 * attaches the guest token for `uid`, and on a 401 it transparently refreshes
 * the token once and retries. A `GuestAuthError` means the guest must sign in
 * again (the flow falls back to Google login).
 */

import { ApiError, type PresignRequest, type PresignedUpload } from "./api";
import { ensureGuestToken, refreshGuest } from "./guest-auth";
import type { GuestMediaResponse, GuestSession } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Thrown when there's no usable guest token and refresh can't recover one. */
export class GuestAuthError extends Error {
  constructor(message = "Guest authentication required") {
    super(message);
    this.name = "GuestAuthError";
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Core guest fetch: attach token, refresh-and-retry once on 401, parse JSON. */
async function guestFetch<T>(uid: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureGuestToken(uid);
  if (!token) throw new GuestAuthError();

  const run = (tok: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${tok}`);
    // `no-store`: the API sends a weak ETag with no Cache-Control, so the browser
    // revalidates and gets a bodyless 304 that this helper can't parse. Skip the
    // conditional cache so we always receive a full 200 body.
    return fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers });
  };

  let res = await run(token);
  if (res.status === 401) {
    const fresh = await refreshGuest(uid);
    if (!fresh) throw new GuestAuthError();
    res = await run(fresh);
  }

  const text = await res.text();
  const body = text ? safeParse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

/* ── session ────────────────────────────────────────────────────────────── */

/** Restore the guest's session (drives returning-guest skip of login/team/scan). */
export function getGuestSession(uid: string) {
  return guestFetch<{ guest: GuestSession }>(uid, "/deliverables/get-guest-session");
}

/** Persist the guest's chosen team / sub-type. */
export function updateGuestSubType(uid: string, guestSubType: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/update-guest-sub-type", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guest_sub_type: guestSubType }),
  });
}

/* ── selfie / face search ───────────────────────────────────────────────── */

/**
 * Presign a single selfie upload. Reuses the event-media presign endpoint; the
 * guest token carries company_id so the backend builds the R2 key server-side.
 * A non-empty `custom_folder_id` is required by validation but isn't part of the
 * object key, so a placeholder is fine — the selfie is never registered as media.
 */
export function presignGuestUploads(uid: string, bookingId: string, files: PresignRequest[]) {
  return guestFetch<{ uploads: PresignedUpload[] }>(
    uid,
    `/deliverables/presign-uploads/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    },
  );
}

/** Validate a captured selfie against the face-search worker (returns the
 *  worker's error message on a non-2xx so the guest can retake). */
export function validateSelfie(uid: string, body: { selfie_id: string; selfie_url: string }) {
  return guestFetch<{ message: string; data: unknown }>(uid, "/deliverables/validate-selfie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Search the gallery for the guest's face; returns the matched media_ids. The
 * backend does not persist them — the caller caches the result for the session
 * (see `setCachedMediaIds`) and re-runs this on a fresh tab / rescan.
 */
export function searchSelfie(uid: string, body: { selfie_id: string; booking_id: string }) {
  return guestFetch<{ message: string; data: string[] }>(uid, "/deliverables/search-selfie", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Record the guest's explicit consent to selfie / face processing — written to
 * the backend consent_logs audit trail (DPDP). Called the moment the guest ticks
 * the consent box and taps "Scan my face". The backend derives the principal and
 * booking from the guest token; we only send what the guest actually saw
 * (policy_version). Treat as fire-and-forget at the call site — never block the
 * scan on it.
 */
export function recordConsent(
  uid: string,
  body: { policy_version: string; purpose?: string; consent_method?: string },
) {
  return guestFetch<{ message: string }>(uid, "/auth/record-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ── gallery media + likes + passcode ───────────────────────────────────── */

export type GuestMediaQuery = {
  /** My Photos — restrict to the guest's matched set (vs All Photos for hosts). */
  mine?: boolean;
  /** Liked view — only photos with at least one like (from anyone). */
  onlyLiked?: boolean;
  customFolderId?: string;
  skip?: number;
  limit?: number;
};

/**
 * Paginated gallery media for guests. `mine` → My Photos (matched set); without
 * it a host (passcode-unlocked) gets All Photos. The matched set is no longer
 * stored server-side, so the caller passes the session-cached `mediaIds`; the
 * backend restricts non-host guests (and any `mine` request) to that set and
 * ignores it for a host browsing All. POST (not GET) so the array rides in the
 * body. First page also returns customFolders + counts.
 */
export function getGuestMedia(
  uid: string,
  bookingId: string,
  q: GuestMediaQuery = {},
  mediaIds: string[] = [],
) {
  const params = new URLSearchParams();
  if (q.mine) params.set("mine", "true");
  if (q.onlyLiked) params.set("only_liked", "true");
  if (q.customFolderId) params.set("custom_folder_id", q.customFolderId);
  if (q.skip != null) params.set("skip", String(q.skip));
  if (q.limit != null) params.set("limit", String(q.limit));
  const qs = params.toString();
  return guestFetch<GuestMediaResponse>(
    uid,
    `/deliverables/get-media/${encodeURIComponent(bookingId)}${qs ? `?${qs}` : ""}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_ids: mediaIds }),
    },
  );
}

/** Like / unlike a photo. `mediaId` is the Media `media_id` field, sent in the
 *  body (the backend matches on `media_id`, not the Mongo `_id`). */
export function likePhoto(uid: string, mediaId: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/like-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
}
export function unlikePhoto(uid: string, mediaId: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/unlike-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
}

/** Verify the family passcode → unlocks All Photos (promotes the guest to host). */
export function verifyFamilyPasscode(uid: string, deliveryLandingPageId: string, passcode: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/verify-family-passcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delivery_landing_page_id: deliveryLandingPageId, passcode }),
  });
}

/* ── full-gallery zip ────────────────────────────────────────────────────── */

/**
 * Mark the full-gallery ZIP as downloaded (analytics; also refreshes its expiry
 * server-side). Fire-and-forget — the caller must never let a failure here block
 * the actual download. The backend keys on `booking_id`, not the landing-page id.
 */
export function markZipAsDownloaded(uid: string, bookingId: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/mark-zip-as-downloaded", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId }),
  });
}

/** Ask the backend to (re)generate the full-gallery ZIP; the guest is emailed
 *  when it's ready. Fire-and-forget. */
export function requestZipGeneration(uid: string, bookingId: string) {
  return guestFetch<{ message: string }>(uid, "/deliverables/request-zip-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId }),
  });
}

/* ── lounge engagement ──────────────────────────────────────────────────── */

/**
 * Record that the guest engaged with a studio CTA on the lounge — clicking the
 * "Leave a review" or "Contact us" button. The backend keys on the guest id from
 * the token, so only the clicked flag is sent. Fire-and-forget analytics: the
 * caller must never let a failure block the link's navigation.
 */
export function catchGuestBehavior(
  uid: string,
  behavior: { review_button_clicked?: boolean; contact_button_clicked?: boolean },
) {
  return guestFetch<{ message: string }>(uid, "/deliverables/catch-guest-behavior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(behavior),
  });
}
