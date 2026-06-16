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

/** Gallery publish status (set "published" by the embedding job on completion). */
export type GalleryPublishStatus = "unpublished" | "published";

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

export type TrackingCounts = {
  visit?: number;
  delivery?: number;
  review?: number;
};

export type Company = {
  _id: string;
  name: string;
  address?: string;
  contact_number?: string;
  logo?: string;
  website?: string;
  gmb_link?: string;
  instagram_link?: string;
  facebook_link?: string;
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
  custom_message?: string;
  style_variant?: string;
  include_company_branding?: boolean;
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
};

export type KvData = {
  client_name: string;
  event_type: EventType;
  event_date?: number;
  custom_message?: string;
  delivery_urls: DeliveryUrl[];
  background_image?: string;
  company_name?: string;
  company_google_place_id?: string;
  company_address?: string;
  company_contact_number?: string;
  company_logo?: string;
  company_website?: string;
  company_gmb_link?: string;
  company_instagram_link?: string;
  company_facebook_link?: string;
  /** Optional, may be added by backend later. */
  brand_colors?: {
    primaryColor?: string;
    secondaryColor?: string;
    textOnPrimary?: string;
  };
};
