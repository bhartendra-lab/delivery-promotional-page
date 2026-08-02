export type EventType =
  | "Wedding"
  | "Birthday"
  | "Anniversary"
  | "Pre-wedding"
  | "Engagement"
  | "Corporate";

export const EVENT_TYPES: EventType[] = [
  "Wedding",
  "Birthday",
  "Anniversary",
  "Pre-wedding",
  "Engagement",
  "Corporate",
];

/**
 * Gallery appearance style variants — must match the backend
 * `delivery-landing-page` `style_variant` enum. Grouped by season skin for the
 * Gallery Design tab (see `GalleryDesignTab`).
 */
export type StyleVariant =
  | "Ivory & Rose"
  | "Blush Minimal"
  | "Sage Sanctuary"
  | "Marigold Bright"
  | "Festive Bloom"
  | "Maroon Velvet"
  | "Fine-Art Warm"
  | "Emerald Royal"
  | "Charcoal Editorial"
  | "Indigo Dusk";

export const STYLE_VARIANTS: StyleVariant[] = [
  "Ivory & Rose",
  "Blush Minimal",
  "Sage Sanctuary",
  "Marigold Bright",
  "Festive Bloom",
  "Maroon Velvet",
  "Fine-Art Warm",
  "Emerald Royal",
  "Charcoal Editorial",
  "Indigo Dusk",
];

/** Face-embedding job status carried on the booking. */
export type EmbeddingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed";

/**
 * Gallery publish status. Events are live ("published") from creation — there
 * is no publish/unpublish action; the studio only toggles `is_active`.
 * "archived" is set when the studio manually archives a storage-plan booking
 * (deactivates it and starts a 7-day countdown to auto-expiry). "expired" is
 * set by the cleanup job — after the 90-day window (Free/Event-based) or 7 days
 * after archiving — and tears down the media (the cover photo is spared).
 * "unpublished" survives in the union only for pre-migration legacy rows.
 */
export type GalleryPublishStatus = "unpublished" | "published" | "archived" | "expired";

export type ContentType = "Images" | "Videos" | "Images & Videos";

export const CONTENT_TYPES: ContentType[] = [
  "Images",
  "Videos",
  "Images & Videos",
];

export type Provider =
  | "Kwikpic"
  | "Google Drive"
  | "WeTransfer"
  | "Samaro"
  | "Other";

export const PROVIDERS: Provider[] = [
  "Kwikpic",
  "Google Drive",
  "WeTransfer",
  "Samaro",
  "Other",
];

export type DeliveryUrl = {
  content_type: ContentType;
  url: string;
  provider: Provider;
};

export type TrackingType = "visit" | "delivery" | "review";

/**
 * Guest-derived engagement counts for a booking's gallery (from `getAllBookings`).
 *   visit   — guests who visited the gallery (one per guest)
 *   review  — guests who tapped "Leave a review" (review_button_clicked)
 *   contact — guests who tapped "Contact us"     (contact_button_clicked)
 */
export type TrackingCounts = {
  visit?: number;
  review?: number;
  contact?: number;
};

export type SocialLinks = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  vimeo?: string;
  pinterest?: string;
  x?: string;
};

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkPreset = {
  _id: string;
  company_id: string;
  name?: string;
  image_url?: string;
  /** Opacity percentage (0–100). */
  opacity: number;
  position: WatermarkPosition;
  /** Width as a percentage of the media's width (1–100). */
  size: number;
  is_default: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Company = {
  _id: string;
  name: string;
  address?: string;
  business_email?: string;
  /** True only for a business_email that passed OTP verification. */
  business_email_verified?: boolean;
  /** Holds a new address while its OTP is in flight (see `whatsapp_pending_number`). */
  business_email_pending?: string;
  /** Default (dark) logo, shown on light surfaces. */
  logo?: string;
  /** Optional light logo, shown on dark surfaces; falls back to `logo`. */
  logo_light?: string;
  website?: string;
  gmb_link?: string;
  /** Legacy single-platform fields; superseded by `social_links`. */
  instagram_link?: string;
  facebook_link?: string;
  social_links?: SocialLinks;
  google_place_id?: string;
  /** The studio's one phone number — always the number that passed WhatsApp OTP verification. */
  whatsapp_number?: string;
  /** True once the studio has completed WhatsApp OTP verification. */
  whatsapp_verified?: boolean;
  /** Holds a new number while its OTP is in flight during a post-onboarding number change. */
  whatsapp_pending_number?: string;
  /** True only for studios auto-created via "Get Started" (Google or email signup); gates /dashboard until onboarding_completed_at is stamped. */
  onboarding_required?: boolean;
  /** True when the studio explicitly said it has no Google Business listing during onboarding. */
  gmb_skipped?: boolean;
  /** Stamped when the studio finishes the last mandatory onboarding step (Google Business, after WhatsApp verification). */
  onboarding_completed_at?: number | null;
  /** One-shot flag for the "2 free events" welcome dialog. */
  welcome_dialog_seen_at?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Shared response shape for every endpoint that mutates and returns the Company. */
export type CompanyMutationResponse = { message: string; company: Company };

/** The four independent checkpoints behind the branding-readiness reminder — computed server-side, never re-derived on the client. */
export type BrandingCheckpoints = {
  google_business: boolean;
  studio_logo: boolean;
  business_email: boolean;
  social_links: boolean;
};

/**
 * `GET /onboarding/reminder-status` — drives both the watermark nudge
 * (before every upload) and the branding-readiness checklist (Access &
 * Sharing). Symmetric for both: `should_show` is `!complete && dismissed_at
 * == null`. Dismissal only ever happens via the dialog's explicit "Don't
 * show this again" checkbox — an unchecked "Skip for now" never touches
 * `dismissed_at`, so the reminder returns on the next attempt/visit.
 */
export type ReminderStatus = {
  watermark: {
    should_show: boolean;
    complete: boolean;
    preset_count: number;
    dismissed_at: number | null;
  };
  branding: {
    should_show: boolean;
    complete: boolean;
    dismissed_at: number | null;
    checkpoints: BrandingCheckpoints;
  };
};

export type LoginResponse = {
  token: string;
  user: Record<string, unknown>;
  company: Company;
};

/**
 * The individual account holder's own details — distinct from the
 * studio-level `Company`. Powers "Your Account" → Personal Information and
 * the "same as personal" business email/phone shortcut on Studio Identity.
 * Backed by `GET/PUT /onboarding/get-user-details` and `/update-user-details`.
 */
export type UserProfile = {
  first_name?: string;
  last_name?: string;
  personal_email?: string;
  personal_contact?: string;
  /** Login identity — read-only here; change it only via the login/auth flow. */
  email?: string;
};

/**
 * Subscription service type, driving how usage is metered. Mirrors the backend
 * `Service.service_type` enum.
 *   - "Free" / "Event-based"  → event-count limits (bookings created this cycle)
 *   - "Monthly" / "Yearly"    → storage limits (GB used across non-expired bookings)
 */
export type ServiceType = "Free" | "Event-based" | "Monthly" | "Yearly";

export type DlpUsage = {
  /**
   * `used`/`limit`/`remaining` carry DIFFERENT UNITS depending on `service_type`:
   *   - count-based plans ("Free" | "Event-based") → event counts
   *   - storage-based plans ("Monthly" | "Yearly") → gigabytes (GB, backend-rounded to 2dp)
   * Use `isCountBasedPlan` / `isStorageBasedPlan` to branch, never a raw string compare.
   */
  used: number;
  /** Event count or GB cap. Null when the subscription is malformed/absent. */
  limit: number | null;
  /** Remaining events or GB (max(0, limit - used)). Null when limit is null. */
  remaining: number | null;
  service_type: ServiceType | null;
  month_start: string;
  status: "ok";
};

/** True for plans metered by number of events created (limit = event count). */
export function isCountBasedPlan(t: ServiceType | null | undefined): boolean {
  return t === "Free" || t === "Event-based";
}

/** True for plans metered by storage consumed (used/limit/remaining = GB). */
export function isStorageBasedPlan(t: ServiceType | null | undefined): boolean {
  return t === "Monthly" || t === "Yearly";
}

/**
 * Shared severity for a usage percentage, driving the green → orange → red story
 * used by the sidebar storage meter and the upload-modal size warning.
 *   < 70% → "ok" · 70–90% → "warning" · ≥ 90% → "danger"
 */
export function getUsageSeverity(pct: number): "ok" | "warning" | "danger" {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "ok";
}

/* ── Events / bookings ─────────────────────────────────────────── */

export type CustomFolder = {
  _id: string;
  name: string;
  booking_id: string;
  createdAt: string;
  /** Manual display order within the booking (drives sidebar + guest lounge order). */
  order?: number;
  /** "Highlights": a public folder is visible to guests without the family passcode. */
  visibility?: "private" | "public";
};

export type MediaItem = {
  _id: string;
  url: string;
  type: "image" | "video";
  booking_id: string;
  custom_folder_ids: string[];
  createdAt: string;
  /** Client-generated fingerprint id (`{booking}__{name}-{size}-{mtime}`). Projected
   *  by get-media; absent on optimistic (not-yet-persisted) items. */
  media_id?: string;
  /** Original client-side filename at upload (raw file.name). Stored on newer docs. */
  filename?: string;
  /** Total likes across all guests. Present on dashboard get-media (drives the
   *  "Liked Media" folder's badge + most-liked sort). Absent on optimistic items. */
  likes_count?: number;
  /** Studio shortlist flag (Smart Selects) — a picked-for-delivery liked photo. */
  shortlisted?: boolean;
  /** True when at least one host liked this photo (drives the filled heart in Smart
   *  Selects). Independent of the active who-filter; present only on smart loads. */
  host_liked?: boolean;
  /** Decoded pixel dimensions, captured client-side at upload. Absent on media
   *  uploaded before dimension capture landed — readers must fall back gracefully. */
  width?: number;
  height?: number;
};

/**
 * A guest of a booking, from `GET /deliverables/get-all-guests/:booking_id`.
 * Powers the "Liked Media" per-guest filter — `likes_count` orders most-active first.
 */
export type Guest = {
  _id: string;
  name: string;
  email?: string;
  /** Guest's contact number — either `email` or `phone` is populated, not necessarily both. */
  phone?: string;
  guest_type: "guest" | "host";
  guest_sub_type?: string | null;
  /** Guest's own selfie photo (set once they face-match), if any. */
  selfie_url?: string | null;
  likes_count?: number;
};

export type GetAllGuestsResponse = {
  guests: Guest[];
};

/** POST /auth/verify-otp success body. */
export type GuestOtpVerifyResponse = {
  message: string;
  token: string;
  guest: Guest;
};

export type CreateBookingResponse = {
  message: string;
  booking_id: string;
};

/**
 * A booking row as returned by `GET /bookings/get-all-bookings`. The backend
 * projects the lead's name as `name` and the linked event type as `event`.
 */
export type Booking = {
  _id: string;
  /** Lead/client name — used for the event title display. */
  name: string;
  /** Event type (from the first linked event) — used for the badge. */
  event?: EventType | string;
  createdAt: string;
  /** Tracking counts for the linked delivery landing page (may be empty). */
  trackings?: TrackingCounts;
  /**
   * Per-row fields projected by `getAllBookings` for the event cards. All
   * optional so responses from an older backend (before the projection
   * expansion) still type-check and degrade gracefully.
   */
  /** Event start date — unix seconds, may be null. */
  event_date?: number | null;
  /** Event city (from the linked event), may be absent. */
  location?: string;
  /** Whether the gallery is still active (not manually deactivated). */
  is_active?: boolean;
  gallery_publish_status?: GalleryPublishStatus;
  /** Number of indexed faces in the gallery. */
  total_faces?: number;
  /** R2 cover image URL from the delivery landing page. */
  background_image?: string;
  /** Public slug for the delivery landing page. */
  unique_identifier?: string;
  /**
   * The plan the booking was created under. Drives the expiry model: Free/
   * Event-based auto-expire 90 days from `createdAt`; Monthly/Yearly only expire
   * once archived (7 days from `gallery_archived_at`). Optional so older backend
   * responses still type-check.
   */
  service_type?: ServiceType | string | null;
  /** Epoch ms the booking was archived (set on archive). Null/absent otherwise. */
  gallery_archived_at?: number | null;
  /** Number of custom folders in this booking's gallery. */
  folder_count?: number;
  /** Number of media items (photos/videos) in this booking's gallery. */
  media_count?: number;
};

/**
 * Parallels the old `ListResponse` shape. The backend currently returns only
 * `bookings`; the aggregate/pagination fields stay optional so the UI can use
 * them if the endpoint starts returning them.
 */
export type BookingsListResponse = {
  bookings: Booking[];
  totalPages?: number;
  totalTrackings?: number;
  visitTrackings?: number;
  deliveryTrackings?: number;
  reviewTrackings?: number;
  /** Company-wide status counts (all statuses, ignoring the current page's
   *  status/pagination filter). Optional so older backends still type-check. */
  summary?: { live: number; archived: number };
};

/**
 * Full booking detail from `GET /bookings/get-booking-by-id/:booking_id/:service`.
 *
 * The backend flattens the join into a single object: `name` (the lead/event
 * name), `event_type`, `event_date` (numeric epoch from the event's
 * `start_date`), plus the delivery-landing-page fields (`background_image`,
 * `custom_message`, `style_variant`, `include_company_branding`). Publish-state
 * fields are read defensively — the projection may omit them, in which case the
 * client falls back to its locally-persisted publish state.
 */
export type BookingDetail = {
  booking_id?: string;
  /** Event/lead name. */
  name?: string;
  event_type?: string;
  /** Numeric epoch (ms). May come back `null` when unset. */
  event_date?: number | null;
  /** Current cover image (delivery-landing-page `background_image`). */
  background_image?: string;
  /** Cover focal point as CSS object-position, e.g. "50% 35%". */
  background_position?: string;
  custom_message?: string;
  style_variant?: string;
  include_company_branding?: boolean;
  /** Public shared-link slug (delivery-landing-page `unique_identifier`). */
  unique_identifier?: string;
  /** Family passcode that unlocks the full gallery in-lounge. */
  family_passcode?: string;
  /** Guest teams / sub-types (delivery-landing-page `guest_types`). */
  guest_types?: string[];
  /** Publish / activation state from the booking (read defensively). */
  gallery_publish_status?: GalleryPublishStatus;
  gallery_published_at?: number;
  /** Note the backend field really is spelt with three Ls. */
  galllery_republished_at?: number;
  gallery_deactivated_at?: number;
  /** Activation toggle — false = gallery temporarily deactivated. */
  is_active?: boolean;
  embedding_status?: EmbeddingStatus;
  /** True when new media was uploaded since the last publish (needs republish). */
  media_out_of_sync?: boolean;
  unsynced_media_count?: number;
  /** The plan the booking was created under (drives the archive/expiry model). */
  service_type?: ServiceType | string | null;
  /** Epoch ms the booking was archived (set on archive). Null/absent otherwise. */
  gallery_archived_at?: number | null;
  /** Reusable QR linked to this event, if any (joined by `getBookingById`).
   *  Both absent when no QR points here. */
  qr_unique_id?: string;
  qr_image_url?: string;

  /** Legacy/optional fields kept for backwards-compatible reads. */
  _id?: string;
  event_name?: string;
  createdAt?: string;
  lead?: { _id: string; name: string };
  events?: Array<{ _id?: string; name?: string; event_type?: string }>;
};

export type BookingDetailResponse = {
  booking: BookingDetail;
};

/* ── Reusable QR ───────────────────────────────────────────────── */

/**
 * The event a QR currently points at, as flattened by `getAllQRCodes`. Null on
 * the QR when it's unlinked. A "live" event is `gallery_publish_status:
 * "published"`; `is_active: false` means published-but-temporarily-deactivated
 * (still counts as live — badge it, don't hide it).
 */
export type AssignedEventSummary = {
  booking_id: string;
  delivery_landing_page_id: string;
  name: string;
  event_type?: string;
  background_image?: string;
  unique_identifier?: string;
  gallery_publish_status?: GalleryPublishStatus;
  is_active?: boolean;
};

/**
 * A studio's reusable QR — one printed sticker/stand that can be re-pointed at
 * whichever event is currently live. `qr_image_url` is a public R2 URL (download
 * it client-side like any other media; no proxy). `color_code` is the picked hex.
 */
export type QrCode = {
  _id: string;
  unique_id: string;
  qr_image_url: string;
  color_code: string;
  createdAt: string;
  assigned_event: AssignedEventSummary | null;
};

export type GetMediaResponse = {
  media: MediaItem[];
  customFolders?: CustomFolder[];
  /** Count of media in the requested view (active folder, or all). Drives "load more". */
  total?: number;
  /** Count of all media in the booking. Drives the header + "All Media" total. */
  totalCount?: number;
  /** Per-folder media membership counts, keyed by folder id. Drives the sidebar. */
  folderCounts?: Record<string, number>;
  /** Count of media with at least one like. Drives the Smart Selects header. */
  likedCount?: number;
  /** Count of shortlisted media. Drives the "Shortlisted" filter chip. */
  shortlistedCount?: number;
};

/* ── Guest-facing client gallery ───────────────────────────────── */

/**
 * Public event payload from
 * `GET /deliverables/get-delivery-landing-page-by-unique-identifier/:unique_identifier`.
 * Company branding fields render only when `include_company_branding === true`.
 */
export type DeliveryLandingPageData = {
  delivery_landing_page_id: string;
  booking_id: string;
  company_id: string;
  event_name?: string;
  /** Numeric epoch (ms) — the event's start_date. May be null/absent. */
  event_date?: number | null;
  event_type?: string;
  custom_message?: string;
  background_image?: string;
  /** CSS object-position for the cover focal point, e.g. "50% 35%". */
  background_position?: string;
  style_variant?: string;
  include_company_branding?: boolean;
  guest_types?: string[];
  company_name?: string;
  company_logo?: string;
  company_logo_light?: string;
  company_address?: string;
  company_whatsapp_number?: string;
  /** @deprecated legacy KV alias — read company_whatsapp_number first, this is a fallback for pages published before the contact_number removal. */
  company_contact_number?: string;
  company_website?: string;
  company_gmb_link?: string;
  company_instagram_link?: string;
  company_facebook_link?: string;
  company_social_links?: SocialLinks;
  company_google_place_id?: string;
  company_watermark_url?: string;
  /** Activation toggle from the booking — false = studio has temporarily paused the gallery. */
  is_active?: boolean;
  /** Publish state from the booking — "expired" means the gallery's access window has closed. */
  gallery_publish_status?: GalleryPublishStatus;
};

/** A media item as returned to guests by `get-media` (carries `media_id` + likes). */
export type GuestMediaItem = {
  _id: string;
  media_id: string;
  url: string;
  type: "image" | "video";
  custom_folder_ids: string[];
  createdAt: string;
  likes_count?: number;
  /** True when the current guest has liked this photo (drives persisted hearts). */
  liked_by_me?: boolean;
  /** Decoded pixel dimensions, captured client-side at upload. Absent on media
   *  uploaded before dimension capture landed — the gallery falls back to its
   *  legacy no-reserved-height masonry behavior for those. */
  width?: number;
  height?: number;
};

export type GuestMediaResponse = {
  media: GuestMediaItem[];
  customFolders?: CustomFolder[];
  total?: number;
  totalCount?: number;
  folderCounts?: Record<string, number>;
};

/** The current guest's restorable session, from `get-guest-session`. */
export type GuestSession = {
  name?: string;
  email?: string;
  /** "host" once the family passcode has been entered; "guest" otherwise. */
  guest_type: "guest" | "host";
  guest_sub_type: string | null;
  selfie_url: string | null;
  has_selfie: boolean;
  /**
   * The validated selfie id. Combined with the event's booking_id it lets the
   * client re-run `search-selfie` on a returning visit when the per-session
   * matched-photos cache is empty. Matched media_ids themselves are not stored
   * server-side — they live in `sessionStorage` (see `getCachedMediaIds`).
   */
  selfie_id: string | null;
};

