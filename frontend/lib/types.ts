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

export type BookingEventType =
  | "Wedding"
  | "Mehendi"
  | "Reception"
  | "Sangeet"
  | "Engagement"
  | "Other";

export const BOOKING_EVENT_TYPES: BookingEventType[] = [
  "Wedding",
  "Mehendi",
  "Reception",
  "Sangeet",
  "Engagement",
  "Other",
];

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
  event?: BookingEventType | EventType | string;
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
 * The document is joined with its lead (for `name`) and events (for type). The
 * direct `event_name` / `event_type` fields are read first when present.
 */
export type BookingDetail = {
  _id: string;
  lead_id?: string;
  creation_source?: string;
  event_name?: string;
  event_type?: string;
  createdAt?: string;
  lead?: { _id: string; name: string };
  events?: Array<{ _id?: string; name?: string; event_type?: string }>;
  delivery_landing_pages?: unknown;
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
