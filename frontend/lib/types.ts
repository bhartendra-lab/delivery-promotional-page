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
  | "Marigold Bright"
  | "Festive Bloom"
  | "Maroon Velvet"
  | "Fine-Art Warm"
  | "Emerald Royal"
  | "Charcoal Editorial";

export const STYLE_VARIANTS: StyleVariant[] = [
  "Ivory & Rose",
  "Blush Minimal",
  "Marigold Bright",
  "Festive Bloom",
  "Maroon Velvet",
  "Fine-Art Warm",
  "Emerald Royal",
  "Charcoal Editorial",
];

/** Face-embedding job status carried on the booking. */
export type EmbeddingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed";

/**
 * Gallery publish status. "published" is set by the embedding job on
 * completion; "expired" is set by the cleanup job after the 90-day window.
 */
export type GalleryPublishStatus = "unpublished" | "published" | "expired";

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
  linkedin?: string;
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
  contact_number?: string;
  business_email?: string;
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
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  token: string;
  user: Record<string, unknown>;
  company: Company;
};

export type DlpUsage = {
  used: number;
  limit: number | null;
  remaining: number | null;
  service_type: string | null;
  month_start: string;
  status: "ok";
};

/* ── Events / bookings ─────────────────────────────────────────── */

export type CustomFolder = {
  _id: string;
  name: string;
  booking_id: string;
  createdAt: string;
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
  /** True once the shortlisted photo's original file was located on disk. */
  identified?: boolean;
};

/**
 * A guest of a booking, from `GET /deliverables/get-all-guests/:booking_id`.
 * Powers the "Liked Media" per-guest filter — `likes_count` orders most-active first.
 */
export type Guest = {
  _id: string;
  name: string;
  email?: string;
  guest_type: "guest" | "host";
  guest_sub_type?: string | null;
  likes_count?: number;
};

export type GetAllGuestsResponse = {
  guests: Guest[];
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
  /** Full-gallery ZIP download URL (host-only). Null/absent until generated. */
  zip_url?: string | null;
  /**
   * ZIP state. Backend enum: "not_generated" | "generated" | "downloaded" | "expired".
   * Read open-endedly: "generated"/"downloaded" (and the spec alias "ready") are
   * downloadable, "expired" offers a re-request, anything else shows nothing.
   */
  zip_status?: string;
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

