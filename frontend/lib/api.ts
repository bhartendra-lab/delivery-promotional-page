import { getToken, clearToken, getCompany } from "./auth";
import type {
  PlansResponse,
  PublicCoupon,
  SubscriptionSnapshot,
  CouponValidation,
  CheckoutResponse,
  CancelSubscriptionResponse,
  ResumeSubscriptionResponse,
  Invoice,
  BillingProfile,
  CheckoutPreview,
} from "./billing-types";
import type {
  BookingDetail,
  BookingDetailResponse,
  BookingsListResponse,
  Company,
  CreateBookingResponse,
  CustomFolder,
  DeliveryLandingPageData,
  DlpUsage,
  EventType,
  GalleryPublishStatus,
  SocialLinks,
  GetMediaResponse,
  GetAllGuestsResponse,
  Guest,
  GuestOtpVerifyResponse,
  LoginResponse,
  QrCode,
  ServiceType,
  StyleVariant,
  TrackingType,
  UserProfile,
  WatermarkPreset,
  WatermarkPosition,
  WhatsappOtpVerifyResponse,
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
    // The API stamps a weak ETag on every response (Express default) but sends no
    // Cache-Control, so the browser revalidates and the server replies 304 with an
    // empty body — which this helper can't parse, leaving the UI without data.
    // `no-store` skips the conditional cache so we always get a full 200 body.
    cache: "no-store",
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

/** Machine-readable `code` from an ApiError's JSON body, e.g. "BILLING_PROFILE_INCOMPLETE" — null if absent/not an ApiError. */
export function getApiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || typeof err.body !== "object" || err.body === null) return null;
  const code = (err.body as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function getCompanyDetails() {
  return request<{ company: Company }>("/onboarding/get-company-details");
}

/* ── Get Started: email-or-Google login ────────────────────────── */

/** POST /auth/check-email — does any User already exist for this email? Pre-auth, no cookie yet. */
export function checkEmailExists(email: string) {
  return request<{ exists: boolean }>("/auth/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    auth: false,
  });
}

/**
 * POST /auth/email-signup — brand-new email: auto-provisions a Company +
 * admin User + Free subscription and emails a password-setup link. No token
 * back — the user must complete that link (existing /reset-password flow)
 * before they can log in.
 */
export function emailSignup(email: string) {
  return request<{ message: string }>("/auth/email-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    auth: false,
  });
}

/* ── Mandatory studio onboarding: WhatsApp OTP ─────────────────── */

/** POST /onboarding/whatsapp/request-otp — sends the first code. 429 on cooldown. */
export function requestWhatsappOtp(input: { whatsappNumber: string }) {
  return request<{ message: string }>("/onboarding/whatsapp/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whatsapp_number: input.whatsappNumber }),
  });
}

/** POST /onboarding/whatsapp/resend-otp — requires request-otp to have already run for this company. */
export function resendWhatsappOtp() {
  return request<{ message: string }>("/onboarding/whatsapp/resend-otp", { method: "POST" });
}

/** POST /onboarding/whatsapp/verify-otp — on success also persists the studio name and returns the updated Company. */
export function verifyWhatsappOtp(input: { code: string; studioName: string }) {
  return request<WhatsappOtpVerifyResponse>("/onboarding/whatsapp/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: input.code, studio_name: input.studioName }),
  });
}

/* ── Post-onboarding: change WhatsApp number ───────────────────── */

/** POST /onboarding/whatsapp/change-request-otp — sends a code to a NEW number; the current one stays live until verified. */
export function requestWhatsappChangeOtp(input: { whatsappNumber: string }) {
  return request<{ message: string }>("/onboarding/whatsapp/change-request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whatsapp_number: input.whatsappNumber }),
  });
}

/** POST /onboarding/whatsapp/change-resend-otp — requires change-request-otp to have already run for this company. */
export function resendWhatsappChangeOtp() {
  return request<{ message: string }>("/onboarding/whatsapp/change-resend-otp", { method: "POST" });
}

/** POST /onboarding/whatsapp/change-verify-otp — on success promotes the pending number and returns the updated Company. */
export function verifyWhatsappChangeOtp(input: { code: string }) {
  return request<WhatsappOtpVerifyResponse>("/onboarding/whatsapp/change-verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: input.code }),
  });
}

/* ── Onboarding: Google Business step ──────────────────────────── */

/** POST /onboarding/google-business — third onboarding step; requires whatsapp_verified. */
export function saveGoogleBusiness(input: { googlePlaceId?: string; address?: string; skipped?: boolean }) {
  return request<WhatsappOtpVerifyResponse>("/onboarding/google-business", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      google_place_id: input.googlePlaceId,
      address: input.address,
      skipped: input.skipped,
    }),
  });
}

/** POST /onboarding/welcome-dialog-seen — idempotent one-shot ack for the "2 free events" dialog. */
export function markWelcomeDialogSeen() {
  return request<WhatsappOtpVerifyResponse>("/onboarding/welcome-dialog-seen", { method: "POST" });
}

export type CompanyUpdateInput = {
  name?: string;
  address?: string;
  business_email?: string;
  website?: string;
  gmb_link?: string;
  social_links?: SocialLinks;
  google_place_id?: string;
  logo?: File | null;
  logo_light?: File | null;
};

export function updateCompanyDetails(input: CompanyUpdateInput) {
  const fd = new FormData();
  if (input.name !== undefined) fd.append("name", input.name);
  if (input.address !== undefined) fd.append("address", input.address);
  if (input.business_email !== undefined) fd.append("business_email", input.business_email);
  if (input.website !== undefined) fd.append("website", input.website);
  if (input.gmb_link !== undefined) fd.append("gmb_link", input.gmb_link);
  if (input.social_links !== undefined) fd.append("social_links", JSON.stringify(input.social_links));
  if (input.google_place_id !== undefined) fd.append("google_place_id", input.google_place_id);
  if (input.logo) fd.append("logo", input.logo);
  if (input.logo_light) fd.append("logo_light", input.logo_light);
  return request<{ company: Company }>("/onboarding/update-company-details", {
    method: "PUT",
    body: fd,
  });
}

/* ── personal profile (account holder) ────────────────────────────
 * NOT YET BACKED BY A REAL ENDPOINT. `/onboarding/get-user-details` and
 * `/onboarding/update-user-details` are placeholders that mirror the
 * company-details pair above — confirm the real path and field names with
 * the backend engineer (see BACKEND_NOTES.md) before this ships. Callers
 * (SettingsContext) treat a failure here as best-effort and degrade
 * gracefully rather than blocking the rest of Settings.
 */
export function getUserProfile() {
  return request<{ user: UserProfile }>("/onboarding/get-user-details");
}

export type UserProfileUpdateInput = {
  first_name?: string;
  last_name?: string;
  personal_email?: string;
  personal_contact?: string;
};

export function updateUserProfile(input: UserProfileUpdateInput) {
  return request<{ user: UserProfile }>("/onboarding/update-user-details", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/* ── watermark presets ─────────────────────────────────────────── */

export type WatermarkPresetInput = {
  image?: File | null;
  name?: string;
  opacity?: number;
  position?: WatermarkPosition;
  size?: number;
  is_default?: boolean;
};

function watermarkFormData(input: WatermarkPresetInput): FormData {
  const fd = new FormData();
  if (input.image) fd.append("image", input.image);
  if (input.name !== undefined) fd.append("name", input.name);
  if (input.opacity !== undefined) fd.append("opacity", String(input.opacity));
  if (input.position !== undefined) fd.append("position", input.position);
  if (input.size !== undefined) fd.append("size", String(input.size));
  if (input.is_default !== undefined) fd.append("is_default", String(input.is_default));
  return fd;
}

export function getWatermarkPresets() {
  return request<{ presets: WatermarkPreset[] }>("/deliverables/get-watermark-presets");
}

export function createWatermarkPreset(input: WatermarkPresetInput) {
  return request<{ preset: WatermarkPreset }>("/deliverables/create-watermark-preset", {
    method: "POST",
    body: watermarkFormData(input),
  });
}

export function updateWatermarkPreset(id: string, input: WatermarkPresetInput) {
  return request<{ preset: WatermarkPreset }>(
    `/deliverables/update-watermark-preset/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: watermarkFormData(input),
    },
  );
}

export function deleteWatermarkPreset(id: string) {
  return request<{ message: string }>(
    `/deliverables/delete-watermark-preset/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/* ── Reusable QR ───────────────────────────────────────────────── */

/**
 * POST /deliverables/generate-qr — server composites a styled, gradient,
 * logo-overlaid PNG for the picked hex and uploads it to public R2. Can take a
 * couple of seconds. 400s (with a message) when the plan's QR limit is reached.
 */
export function generateQrCode(colorCode: string) {
  return request<{ qr: QrCode }>("/deliverables/generate-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color_code: colorCode }),
  });
}

/**
 * GET /deliverables/get-all-qr-codes — every QR for the studio, newest-first,
 * each with a flattened `assigned_event` (or null). `qr_limit` is the plan cap
 * (null = no cap on record); drives the "X of Y used" hint.
 */
export function getAllQrCodes() {
  return request<{ qrs: QrCode[]; qr_limit: number | null }>("/deliverables/get-all-qr-codes");
}

/**
 * POST /deliverables/assign-qr — link a QR to a live event's delivery landing
 * page. Both the QR and the event must belong to the caller's studio (else 404).
 * Also 409s if the event is already linked to a different QR.
 */
export function linkQr(qrUniqueId: string, bookingId: string) {
  return request<{ qr: QrCode }>("/deliverables/assign-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_unique_id: qrUniqueId, booking_id: bookingId }),
  });
}

/**
 * POST /deliverables/unassign-qr — clears a QR's event link without deleting
 * the QR itself or touching the event/DLP it pointed at.
 */
export function unlinkQr(qrUniqueId: string) {
  return request<{ qr: QrCode }>("/deliverables/unassign-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_unique_id: qrUniqueId }),
  });
}

/**
 * DELETE /deliverables/delete-qr/:unique_id — removes the QR doc + its R2 image.
 * Does NOT touch the event it pointed at. A printed copy stops working once gone.
 */
export function deleteQr(uniqueId: string) {
  return request<{ message: string }>(`/deliverables/delete-qr/${encodeURIComponent(uniqueId)}`, {
    method: "DELETE",
  });
}

/* ── Billing ────────────────────────────────────────────────────── */

/** GET /billing/plans — public, no auth. Every active DH Service including Free. */
export function getBillingPlans() {
  return request<PlansResponse>("/billing/plans", { auth: false });
}

/** GET /billing/coupons/public — public, no auth. Empty array is normal. */
export function getPublicCoupons() {
  return request<{ coupons: PublicCoupon[] }>("/billing/coupons/public", { auth: false });
}

/**
 * GET /billing/subscription — auth + (admin or billing_user). Callers should
 * catch ApiError and check `.status`: 404 means no subscription on record
 * (not an error state — render accordingly); 403 means the caller isn't
 * admin/billing_user (hide billing UI silently, don't show an error).
 */
export function getSubscription() {
  return request<SubscriptionSnapshot>("/billing/subscription");
}

/** POST /billing/coupons/validate. Both outcomes are HTTP 200 — branch on `valid`, never on status. */
export function validateCoupon(input: { coupon_code: string; service_id: string; quantity?: number }) {
  return request<CouponValidation>("/billing/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * POST /billing/checkout — the six-branch discriminated union (see
 * billing-types.ts#CheckoutResponse). 400/402/409 messages are backend
 * copy meant to be shown to the user verbatim via ApiError.message.
 */
export function checkout(input: { service_id: string; quantity?: number; coupon_code?: string }) {
  return request<CheckoutResponse>("/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** POST /billing/subscription/cancel — turns auto-renew off; access continues to period end. */
export function cancelSubscription() {
  return request<CancelSubscriptionResponse>("/billing/subscription/cancel", { method: "POST" });
}

/**
 * POST /billing/subscription/resume — re-arms auto-renew on a cancelled
 * subscription via a fresh deferred mandate. Charges nothing now; the
 * customer completes a mandate-authorisation handshake (short_url /
 * Razorpay Checkout on subscription_id), then poll GET /billing/subscription
 * until `cancel_at_period_end === false`.
 */
export function resumeSubscription() {
  return request<ResumeSubscriptionResponse>("/billing/subscription/resume", { method: "POST" });
}

/** GET /billing/invoices */
export function listInvoices() {
  return request<{ invoices: Invoice[] }>("/billing/invoices");
}

/** GET /billing/profile — auth + (admin or billing_user). Nulls until a company has saved one. */
export function getBillingProfile() {
  return request<{ billing: BillingProfile }>("/billing/profile");
}

export type BillingProfileInput = {
  legal_name: string;
  gstin?: string;
  billing_address: string;
  place_of_supply_state: string;
};

/** PUT /billing/profile — 422 { code: "GSTIN_STATE_MISMATCH" } if gstin's prefix doesn't match the chosen state. */
export function updateBillingProfile(input: BillingProfileInput) {
  return request<{ billing: BillingProfile }>("/billing/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * POST /billing/checkout/preview — same body as checkout(), read-only. 422
 * { code: "BILLING_PROFILE_INCOMPLETE" } until the company has a saved
 * billing profile (see getBillingProfile/updateBillingProfile above).
 */
export function previewCheckout(input: { service_id: string; quantity?: number; coupon_code?: string }) {
  return request<CheckoutPreview>("/billing/checkout/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * GET /billing/invoices/:id — `pdf_url` is a short-lived presigned R2 URL.
 * Fetch fresh on click, open it, and throw it away — never cache or store it.
 */
export function getInvoice(id: string) {
  return request<{ invoice: Invoice; pdf_url: string }>(`/billing/invoices/${encodeURIComponent(id)}`);
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
  status?: GalleryPublishStatus | "all";
}) {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.search) sp.set("search", params.search);
  if (params.status) sp.set("status", params.status);
  sp.set("service", BOOKING_SERVICE);
  return request<BookingsListResponse>(
    `/bookings/get-all-bookings?${sp.toString()}`,
  );
}

/**
 * POST /bookings/archive-booking/:booking_id — sets status → "archived",
 * records `gallery_archived_at`, and deactivates the gallery in one write.
 * Bodyless (booking_id is a path param), matching the deleteMedia wiring.
 */
export function archiveBooking(bookingId: string) {
  return request<{ message: string }>(
    `/bookings/archive-booking/${encodeURIComponent(bookingId)}`,
    { method: "POST" },
  );
}

/**
 * POST /bookings/restore-booking/:booking_id — brings an archived booking back
 * to "published" + active. 404s server-side on an already-expired booking
 * (there is no restore path back from expired), so never present Restore on an
 * expired card/overlay.
 */
export function restoreBooking(bookingId: string) {
  return request<{ message: string }>(
    `/bookings/restore-booking/${encodeURIComponent(bookingId)}`,
    { method: "POST" },
  );
}

/**
 * DELETE /bookings/clear-booking-data/:booking_id — tears down all R2 media +
 * face embeddings (the cover photo is deliberately spared) and sets status →
 * "expired". Irreversible; gate it behind the typed-"delete" confirm.
 */
export function clearBookingData(bookingId: string) {
  return request<{ message: string }>(
    `/bookings/clear-booking-data/${encodeURIComponent(bookingId)}`,
    { method: "DELETE" },
  );
}

/**
 * POST /bookings/recalculate-studio-storage — re-walks R2 for every non-expired
 * booking on the company's active subscription and writes the fresh total to
 * Subscription.storage_used. Expensive (R2 listing), so only call it at
 * well-defined storage-changing moments (clear data; upload paused/cancelled/
 * completed) — never on a timer or poll.
 */
export function recalculateStudioStorage() {
  return request<{ usedStorage: number; message: string }>(
    "/bookings/recalculate-studio-storage",
    { method: "POST" },
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
  /** Cover focal point as CSS object-position, e.g. "50% 35%". */
  background_position?: string;
  custom_message?: string;
  style_variant?: StyleVariant | string;
  include_company_branding?: boolean;
  /**
   * Guest teams / sub-types. Persisted onto the delivery-landing-page (the API
   * name is misleading). The backend ignores empty arrays, so this can add or
   * change teams but cannot clear them to `[]`.
   */
  guest_types?: string[];
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
  /**
   * The company's active plan type (whatever `getDlpUsage` returned for
   * `service_type` on this dashboard load). Stored on the booking so
   * `getDlpUsage`'s later aggregation can match bookings by plan. Omit/null
   * gracefully when usage hasn't loaded yet — creation must not block on it.
   */
  service_type?: ServiceType | string | null;
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

/**
 * Partial update — only the fields present in `updates` are sent, so a
 * visibility-only toggle (the kebab's "Make public" / "Remove from
 * Highlights") never touches `name` and vice versa.
 */
export function updateCustomFolder(
  customFolderId: string,
  updates: { name?: string; visibility?: "private" | "public" },
) {
  return request<{ message: string; customFolder: CustomFolder }>(
    `/deliverables/update-custom-folder/${encodeURIComponent(customFolderId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
  );
}

/**
 * The backend refuses to delete a non-empty folder — it responds 400 with
 * `{ message: "Folder is not empty", mediaCount }` (caught via `ApiError.body`
 * by the caller) instead of deleting anything.
 */
export function deleteCustomFolder(customFolderId: string) {
  return request<{ message: string }>(
    `/deliverables/delete-custom-folder/${encodeURIComponent(customFolderId)}`,
    { method: "DELETE" },
  );
}

/** `folderIds` is the full ordered list — each folder's `order` becomes its index. */
export function reorderCustomFolders(bookingId: string, folderIds: string[]) {
  return request<{ message: string }>(
    `/deliverables/reorder-custom-folders/${encodeURIComponent(bookingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_ids: folderIds }),
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
  /** Original client-side filename (raw file.name). Persisted so "Locate Original
   *  Images" can read the clean name without parsing it back out of media_id. */
  filename?: string;
  /** Decoded pixel dimensions of the compressed photo, when the browser could
   *  determine them. Powers the guest gallery's aspect-ratio-reserved tiles. */
  width?: number;
  height?: number;
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
  custom_folder_id?: string;
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

/**
 * GET /deliverables/get-media/:booking_id — paginated, newest-first. The grid
 * loads `limit` items per page (default 100 server-side) and requests the next
 * page with `skip` as the user scrolls to the end. The first page (skip 0) also
 * returns `customFolders`, `total`, `totalCount` and `folderCounts`; later pages
 * return only `media`.
 */
export function getMedia(
  bookingId: string,
  opts?: {
    customFolderId?: string;
    skip?: number;
    limit?: number;
    /** "Liked Media" view — only photos with at least one like. */
    onlyLiked?: boolean;
    /** "likes" → most-liked first (the Liked Media order); "oldest" → oldest-first (manual folder ordering); default is newest-first. */
    sort?: "likes" | "recent" | "oldest";
    /** Restrict likes to hosts / guests. */
    likedGuestType?: "host" | "guest";
    /** Restrict likes to guests in these teams (guest_sub_type). */
    likedGuestSubTypes?: string[];
    /** Restrict likes to these specific guest ids. */
    likedGuestIds?: string[];
    /** Smart Selects — only shortlisted media. */
    shortlistedOnly?: boolean;
  },
) {
  const params = new URLSearchParams();
  if (opts?.customFolderId) params.set("custom_folder_id", opts.customFolderId);
  if (opts?.skip != null) params.set("skip", String(opts.skip));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.onlyLiked) params.set("only_liked", "true");
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.likedGuestType) params.set("liked_guest_type", opts.likedGuestType);
  if (opts?.likedGuestSubTypes?.length)
    params.set("liked_guest_sub_types", opts.likedGuestSubTypes.join(","));
  if (opts?.likedGuestIds?.length)
    params.set("liked_guest_ids", opts.likedGuestIds.join(","));
  if (opts?.shortlistedOnly) params.set("shortlisted_only", "true");
  const qs = params.toString();
  return request<GetMediaResponse>(
    `/deliverables/get-media/${encodeURIComponent(bookingId)}${qs ? `?${qs}` : ""}`,
  );
}

/**
 * GET /deliverables/get-all-guests/:booking_id — every guest of the booking with
 * their like count. Powers the "Liked Media" per-guest filter (dashboard only)
 * and the Access & Sharing guest list.
 */
export function getAllGuests(bookingId: string, opts?: { guestType?: "host" | "guest" }) {
  const params = new URLSearchParams();
  if (opts?.guestType) params.set("guest_type", opts.guestType);
  const qs = params.toString();
  return request<GetAllGuestsResponse>(
    `/deliverables/get-all-guests/${encodeURIComponent(bookingId)}${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Downloads the booking's guest list as a CSV (same endpoint as `getAllGuests`,
 * `exportCsv=true`). Runs a raw authenticated `fetch` (not the JSON `request`
 * helper) so the CSV blob and its filename survive, then triggers a browser
 * download via a throwaway anchor.
 */
export async function exportGuestsCsv(bookingId: string, opts?: { guestType?: "host" | "guest" }) {
  const params = new URLSearchParams({ exportCsv: "true" });
  if (opts?.guestType) params.set("guest_type", opts.guestType);
  const token = getToken();
  const res = await fetch(
    `${API_BASE}/deliverables/get-all-guests/${encodeURIComponent(bookingId)}?${params.toString()}`,
    {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  if (!res.ok) {
    throw new ApiError(res.status, `Export failed: ${res.status}`, null);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename=([^;]+)/.exec(disposition)?.[1]?.trim() || `${bookingId}_guests.csv`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * POST /deliverables/revoke-guest-access/:guest_id — demotes a host back to
 * guest scope, revoking the family-passcode-granted full-gallery access.
 */
export function revokeGuestAccess(guestId: string) {
  return request<{ message: string; guest: Guest }>(
    `/deliverables/revoke-guest-access/${encodeURIComponent(guestId)}`,
    { method: "POST" },
  );
}

/**
 * POST /deliverables/update-media-shortlist — flag/unflag media as shortlisted
 * for Smart Selects. `mediaIds` are Media `_id`s (never optimistic placeholders).
 */
export function updateMediaShortlist(mediaIds: string[], shortlisted: boolean) {
  return request<{ message: string; modifiedCount: number }>(
    "/deliverables/update-media-shortlist",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_ids: mediaIds, shortlisted }),
    },
  );
}

/**
 * One shortlisted media item as returned by `get-shortlisted-media` — just the
 * fields the client-side "Locate Original Images" matcher needs. `media_id`
 * encodes `{booking}__{filename}-{size}-{lastModified}`; `filename` is the stored
 * clean name (null on legacy docs, which parse it back out of `media_id`).
 */
export type ShortlistedMediaItem = {
  _id: string;
  media_id: string;
  /** Gallery (web-res) R2 URL — lets the studio zip-download any not-found photos. */
  url: string;
  filename: string | null;
  custom_folder_ids: string[];
};

export type ShortlistedMediaResponse = {
  media: ShortlistedMediaItem[];
  /** The booking's custom folders — id→name for per-folder subfolder routing. */
  customFolders: { _id: string; name: string }[];
};

/**
 * GET /deliverables/get-shortlisted-media/:booking_id — the full, unpaginated set
 * of shortlisted media for the booking (Smart Selects → Locate Original Images),
 * plus the booking's custom folders, for the client-side disk matcher. Nothing
 * about a run is persisted server-side — every call reflects the live shortlist.
 */
export function getShortlistedMedia(bookingId: string) {
  return request<ShortlistedMediaResponse>(
    `/deliverables/get-shortlisted-media/${encodeURIComponent(bookingId)}`,
  );
}

/**
 * GET /deliverables/get-media/:booking_id?ids_only=true — returns just the
 * `media_id`s of every media already saved for the booking (no pagination,
 * likes, or folder counts). The upload engine calls this before a run to skip
 * files that are already in the gallery when a folder is re-selected after a
 * cancelled/interrupted upload.
 */
export function getUploadedMediaIds(bookingId: string): Promise<string[]> {
  return request<{ media_ids: string[] }>(
    `/deliverables/get-media/${encodeURIComponent(bookingId)}?ids_only=true`,
  ).then((res) => res.media_ids ?? []);
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
 * POST /deliverables/publish-gallery/:booking_id — LEGACY. Events are live
 * from creation and uploads embed + sync automatically, so the app no longer
 * calls this. The backend keeps the route as an idempotent manual "sync now"
 * nudge (ops escape hatch); the function stays for parity with that.
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
 * POST /deliverables/regenerate-family-passcode/:booking_id — mints a fresh
 * 6-digit family passcode for the event's delivery-landing-page and returns it.
 * Regenerating invalidates any passcode already shared with the family.
 */
export function regenerateFamilyPasscode(bookingId: string) {
  return request<{ message: string; family_passcode: string }>(
    `/deliverables/regenerate-family-passcode/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/* ── Guest-facing client gallery ───────────────────────────────── */

/**
 * GET /deliverables/get-delivery-landing-page-by-unique-identifier/:unique_identifier
 * Public (no auth) — the guest gallery's first data fetch. A 400 means the slug
 * doesn't resolve → render not-found.
 */
export function getDeliveryLandingPageByUniqueIdentifier(uniqueIdentifier: string) {
  return request<{ deliveryLandingPage: DeliveryLandingPageData }>(
    `/deliverables/get-delivery-landing-page-by-unique-identifier/${encodeURIComponent(uniqueIdentifier)}`,
    { auth: false },
  );
}

/**
 * POST /auth/google/guest-refresh — silently re-mint a guest JWT from an expired
 * one. Returns the fresh token; rejects (401) when refresh isn't possible, so
 * the caller falls back to the full Google sign-in.
 */
export function refreshGuestToken(token: string) {
  return request<{ token: string }>("/auth/google/guest-refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    auth: false,
  });
}

/**
 * WhatsApp OTP guest login — the primary sign-in path, Google being the
 * secondary fallback. All three calls run before a guest token exists, so
 * they're unauthenticated (`auth: false`) like `refreshGuestToken` above.
 * `phone` is always the plain 10-digit national number; the backend
 * normalizes it identically for all three endpoints (see
 * `normalizePhoneNumber`), so they resolve to the same guest doc.
 */

/** POST /auth/guest-otp-login — sends the first code. 429 on cooldown. */
export function requestGuestOtp(input: { uniqueIdentifier: string; name: string; phone: string }) {
  return request<{ message: string }>("/auth/guest-otp-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      phone: input.phone,
      unique_identifier: input.uniqueIdentifier,
    }),
    auth: false,
  });
}

/** POST /auth/resend-otp — requires the guest to already exist (i.e. requestGuestOtp already ran). */
export function resendGuestOtp(input: { uniqueIdentifier: string; phone: string }) {
  return request<{ message: string }>("/auth/resend-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: input.phone,
      unique_identifier: input.uniqueIdentifier,
    }),
    auth: false,
  });
}

/** POST /auth/verify-otp — on success returns a guest JWT identical in shape to the Google-SSO path. */
export function verifyGuestOtp(input: { uniqueIdentifier: string; phone: string; code: string }) {
  return request<GuestOtpVerifyResponse>("/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: input.phone,
      unique_identifier: input.uniqueIdentifier,
      code: input.code,
    }),
    auth: false,
  });
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
