import { getToken, clearToken, getCompany } from "./auth";
import type {
  BookingDetail,
  BookingDetailResponse,
  BookingsListResponse,
  Company,
  CreateBookingResponse,
  CustomFolder,
  DlpUsage,
  EventType,
  GetMediaResponse,
  LoginResponse,
  StyleVariant,
  TrackingType,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const text = await res.text();
  const body = text ? safeParse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && auth) clearToken();
    const message =
      (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : null) || `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { ApiError };

export function getCompanyDetails() {
  return request<{ company: Company }>("/onboarding/get-company-details");
}

export type CompanyUpdateInput = {
  name?: string;
  address?: string;
  contact_number?: string;
  website?: string;
  gmb_link?: string;
  instagram_link?: string;
  facebook_link?: string;
  google_place_id?: string;
  logo?: File | null;
};

export function updateCompanyDetails(input: CompanyUpdateInput) {
  const fd = new FormData();
  if (input.name !== undefined) fd.append("name", input.name);
  if (input.address !== undefined) fd.append("address", input.address);
  if (input.contact_number !== undefined) fd.append("contact_number", input.contact_number);
  if (input.website !== undefined) fd.append("website", input.website);
  if (input.gmb_link !== undefined) fd.append("gmb_link", input.gmb_link);
  if (input.instagram_link !== undefined) fd.append("instagram_link", input.instagram_link);
  if (input.facebook_link !== undefined) fd.append("facebook_link", input.facebook_link);
  if (input.google_place_id !== undefined) fd.append("google_place_id", input.google_place_id);
  if (input.logo) fd.append("logo", input.logo);
  return request<{ company: Company }>("/onboarding/update-company-details", {
    method: "PUT",
    body: fd,
  });
}

export function checkResetLink(userId: string) {
  return request<{ valid: true }>(`/auth/check-reset-link/${encodeURIComponent(userId)}`, {
    auth: false,
  });
}

export function resetPassword(userId: string, newPassword: string) {
  return request<LoginResponse>("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
    auth: false,
  });
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    auth: false,
  });
}

export function getDlpUsage() {
  return request<DlpUsage>("/deliverables/get-dlp-usage");
}

/* ── Bookings / events ─────────────────────────────────────────── */

/**
 * Service slug for the bookings endpoints. The backend requires one of
 * "CRM" | "DH"; this app is the Delivery Hub, so we always send "DH".
 */
export const BOOKING_SERVICE = "DH";

/** GET /bookings/get-all-bookings?page=&limit=&search=&service= */
export function getAllBookings(params: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.search) sp.set("search", params.search);
  sp.set("service", BOOKING_SERVICE);
  return request<BookingsListResponse>(
    `/bookings/get-all-bookings?${sp.toString()}`,
  );
}

/** GET /bookings/get-booking-by-id/:booking_id/:service */
export function getBookingById(bookingId: string, service: string = BOOKING_SERVICE) {
  return request<BookingDetailResponse>(
    `/bookings/get-booking-by-id/${encodeURIComponent(bookingId)}/${encodeURIComponent(service)}`,
  );
}

/**
 * PUT /bookings/update-booking/:booking_id
 *
 * The backend updates the event row with `start_date: Number(event_date)`
 * unconditionally, so callers that touch the landing-page fields (cover /
 * gallery design) must also pass the *current* `event_type` and `event_date`
 * to avoid clobbering them — see `EventWorkspace`'s `persistBooking` helper.
 */
export type UpdateBookingInput = {
  event_name?: string;
  event_type?: EventType | string;
  /** Numeric epoch (ms). */
  event_date?: number;
  background_image?: string;
  custom_message?: string;
  style_variant?: StyleVariant | string;
  include_company_branding?: boolean;
};
export function updateBooking(bookingId: string, body: UpdateBookingInput) {
  return request<{ booking: BookingDetail }>(
    `/bookings/update-booking/${encodeURIComponent(bookingId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function createBooking(body: {
  event_name: string;
  event_type: EventType | string;
  /** Optional numeric epoch (ms). Omit the field entirely when unset. */
  event_date?: number;
}) {
  // Always create under the Delivery Hub service so the booking's
  // creation_source matches the "DH" filter used by getAllBookings/getBookingById.
  return request<CreateBookingResponse>("/bookings/create-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, service: BOOKING_SERVICE }),
  });
}

export function createCustomFolder(bookingId: string, name: string) {
  return request<{ message: string; custom_folder_id: string }>(
    `/deliverables/create-custom-folder/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

export function updateCustomFolder(customFolderId: string, name: string) {
  return request<{ message: string; customFolder: CustomFolder }>(
    `/deliverables/update-custom-folder/${encodeURIComponent(customFolderId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

/**
 * Batch metadata save. Backend persists ALL media for the event in one call.
 * On failure, the caller (engine) keeps the in-memory results and offers a
 * retry — the IndexedDB-backed state means a crash/refresh doesn't lose them.
 */
export type MediaMetadataItem = {
  url: string;
  type: "image" | "video";
  custom_folder_id: string;
  media_id: string;
};
/**
 * Persist a batch of media. When new media is uploaded to an already-published
 * gallery, pass `media_out_of_sync: true` + `unsynced_media_count` (the size of
 * this chunk) — the backend increments the booking's unsynced count and flags it
 * so the workspace can prompt a Republish on return.
 */
export function createMediaBatch(
  bookingId: string,
  media_metadata: MediaMetadataItem[],
  outOfSync?: { media_out_of_sync: boolean; unsynced_media_count: number },
) {
  return request<{ message: string }>(
    `/deliverables/create-media/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_metadata, ...(outOfSync ?? {}) }),
    },
  );
}

/** Request a batch of presigned PUT URLs for direct browser → R2 upload. */
// TODO(backend): remove custom_folder_id from R2 key path. We still send
// custom_folder_id below because the backend uses it for DB association
// (Media.custom_folder_ids), but it must no longer be a segment of the R2
// object key — the storage path should be
// vyavasth/companies/{company_id}/event-media/{booking_id}/{media_id}.jpeg
export type PresignRequest = {
  filename: string;
  content_type?: string;
  custom_folder_id: string;
};
export type PresignedUpload = {
  key: string;
  presigned_url: string;
  public_url: string;
  content_type: string;
  filename: string;
  custom_folder_id: string;
};
export function presignUploads(bookingId: string, files: PresignRequest[]) {
  return request<{ uploads: PresignedUpload[] }>(
    `/deliverables/presign-uploads/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    },
  );
}

export function getMedia(bookingId: string, customFolderId?: string) {
  const qs = customFolderId
    ? `?custom_folder_id=${encodeURIComponent(customFolderId)}`
    : "";
  return request<GetMediaResponse>(
    `/deliverables/get-media/${encodeURIComponent(bookingId)}${qs}`,
  );
}

/**
 * DELETE /deliverables/delete-media — body `{ media_ids }`. Deletes the R2
 * objects and the DB rows in one call. Used for both single-image delete
 * (array of one) and multi-select delete. `media_ids` are Media `_id`s — never
 * pass optimistic placeholder ids (e.g. `optimistic-*`).
 */
export function deleteMedia(mediaIds: string[]) {
  return request<{ message: string }>("/deliverables/delete-media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_ids: mediaIds }),
  });
}

/**
 * POST /deliverables/publish-gallery/:booking_id — kicks off the GPU-expensive
 * face-embedding batch job and sets `embedding_status="in_progress"`. Publish
 * actually flips `gallery_publish_status` to "published" only when the job
 * finishes. Used for both Publish and Republish from the top-right LivePill.
 */
export function publishGallery(bookingId: string) {
  return request<{ message: string }>(
    `/deliverables/publish-gallery/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * POST /deliverables/update-gallery-activation-status/:booking_id — temporarily
 * deactivate (is_active=false) or reactivate (is_active=true) a published
 * gallery. Distinct from publish/republish: it does not re-run embeddings.
 */
export function updateGalleryActivationStatus(bookingId: string, isActive: boolean) {
  return request<{ message: string }>(
    `/deliverables/update-gallery-activation-status/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    },
  );
}

/**
 * PUT a blob to a presigned R2 URL. The presigned URL is short-lived and
 * carries SigV4 auth in the querystring; the browser just executes the PUT
 * and R2 stores the object.
 *
 * Throws `R2PutError` (with `.status`) for HTTP failures so the engine's
 * retry classifier can tell retryable (5xx/network) from terminal (4xx).
 */
export class R2PutError extends Error {
  status: number;
  body?: string;
  constructor(status: number, message: string, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
export async function putBlobToPresignedUrl(
  presignedUrl: string,
  blob: Blob,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  // ContentType MUST match what the URL was signed with — otherwise R2
  // returns SignatureDoesNotMatch. The presign endpoint defaults to
  // image/jpeg; if you change that there, change it here too.
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
    signal,
  });
  if (!res.ok) {
    // Surface R2's XML error body — it's how we'll diagnose CORS /
    // signature / bucket-policy issues during integration.
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new R2PutError(
      res.status,
      `R2 PUT failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 240)}` : ""}`,
      body,
    );
  }
}

/** Read the cached company id once — used for upload UI display only. */
export function getCachedCompanyId(): string | null {
  return getCompany()?._id ?? null;
}

/**
 * Tracking endpoint. Per BACKEND_NOTES, this endpoint is currently auth-protected
 * (backend bug) — we still call it without an Authorization header because the
 * client view is unauthenticated. Failures are logged but never thrown so they
 * cannot break the user flow.
 */
export async function trackEvent(
  id: string,
  trackingType: TrackingType,
  trackingData?: Record<string, unknown>,
): Promise<void> {
  const payload = {
    tracking_type: trackingType,
    // Always send an object so JSON.stringify never drops the field.
    tracking_data: trackingData ?? {},
  };
  try {
    const res = await fetch(
      `${API_BASE}/deliverables/create-delivery-landing-page-tracking/${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      console.warn(
        `[trackEvent] ${trackingType} → ${res.status} ${res.statusText}`,
        detail,
      );
    }
  } catch (err) {
    console.warn(`[trackEvent] ${trackingType} failed`, err);
  }
}
